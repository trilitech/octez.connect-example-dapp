import { Component, OnDestroy, OnInit } from '@angular/core'
import type { AccountInfo } from '@tezos-x/octez.connect-dapp'
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular'
import { Subscription } from 'rxjs'

import { BeaconService } from '../../../services/beacon/beacon.service'
import { NetworkConfig, NetworkName } from '../../network.config'
import { NetworkService } from '../../services/network.service'
import {
  ActiveVersion,
  SdkLoaderService,
  SUPPORTED_VERSIONS,
  supportsMultiNetwork
} from '../../services/sdk-loader.service'
import { TestRunnerService } from '../../services/test-runner.service'

@Component({
  selector: 'pg-wallet-control',
  templateUrl: './wallet-control.component.html',
  styleUrls: ['./wallet-control.component.scss']
})
export class WalletControlComponent implements OnInit, OnDestroy {
  public account: AccountInfo | undefined
  public connectionStatus = 'Not connected'

  public networks: NetworkConfig[] = []
  public selectedNetwork: NetworkName = 'shadownet'
  public activeNetwork: NetworkConfig
  public hasCustomNetworks = false

  public switching = false
  public connecting = false

  // Mirrors TestRunnerService.inFlightRunAll$ for disabling the Run-all button.
  public inFlightRunAll = false

  // SDK version switcher state.
  public readonly supportedVersions = SUPPORTED_VERSIONS
  public readonly customVersionOption = 'custom'
  public activeVersion: ActiveVersion
  public selectedVersion: string
  public showCustomVersion = false
  public customVersion = ''

  // Multi-network (octez.connect v5): pair once for mainnet + tezosx-mainnet.
  public multiNetworkSupported = false
  public multiNetworkSession = false
  public multiNetworkAccounts: AccountInfo[] = []

  private readonly subs = new Subscription()

  constructor(
    private readonly beaconService: BeaconService,
    private readonly networkService: NetworkService,
    private readonly testRunner: TestRunnerService,
    private readonly sdkLoader: SdkLoaderService,
    private readonly alertController: AlertController,
    private readonly actionSheetController: ActionSheetController,
    private readonly toastController: ToastController
  ) {
    this.activeNetwork = this.networkService.getActive()
    this.activeVersion = this.sdkLoader.getActiveVersion()
    this.multiNetworkSupported = supportsMultiNetwork(this.activeVersion.version)
    this.multiNetworkSession = this.beaconService.isMultiNetworkSession()
    // Reflect the running version in the dropdown; an unknown (custom) version
    // selects the "Other" option and pre-fills the free-form field.
    if (SUPPORTED_VERSIONS.includes(this.activeVersion.version)) {
      this.selectedVersion = this.activeVersion.version
    } else {
      this.selectedVersion = this.customVersionOption
      this.showCustomVersion = true
      this.customVersion = this.activeVersion.version
    }
  }

  public ngOnInit(): void {
    this.subs.add(
      this.beaconService.activeAccount$.subscribe((a) => {
        this.account = a
      })
    )
    this.subs.add(
      this.beaconService.connectionStatus$.subscribe((s) => {
        this.connectionStatus = s
      })
    )
    this.subs.add(
      this.networkService.networks$.subscribe((list) => {
        this.networks = list
        this.hasCustomNetworks = list.some((n) => n.custom)
      })
    )
    this.subs.add(
      this.networkService.active$.subscribe((cfg) => {
        this.activeNetwork = cfg
        this.selectedNetwork = cfg.name
      })
    )
    this.subs.add(
      this.testRunner.inFlightRunAll$.subscribe((v) => {
        this.inFlightRunAll = v
      })
    )
    this.subs.add(
      this.beaconService.multiNetworkAccounts$.subscribe((accounts) => {
        this.multiNetworkAccounts = accounts
        this.multiNetworkSession = this.beaconService.isMultiNetworkSession()
      })
    )
  }

  public runAll(): void {
    this.testRunner.runAll().catch((err) => console.error('runAll failed', err))
  }

  public onSdkVersionChange(value: string): void {
    if (value === this.customVersionOption) {
      this.showCustomVersion = true
      return
    }
    this.showCustomVersion = false
    if (value && value !== this.activeVersion.version) {
      // Persists the choice and reloads so the playground boots against it.
      this.sdkLoader.setVersion(value)
    }
  }

  public applyCustomVersion(): void {
    const v = this.customVersion.trim()
    if (!v) {
      this.toast('Enter a version (e.g., 5.0.0-beta.6).').catch(console.error)
      return
    }
    this.sdkLoader.setVersion(v)
  }

  public ngOnDestroy(): void {
    this.subs.unsubscribe()
  }

  public async connect(): Promise<void> {
    if (this.connecting) return
    this.connecting = true
    try {
      const cfg = this.activeNetwork
      await this.beaconService.connect(cfg.sdkNetworkType, undefined, cfg.rpc)
    } catch (err) {
      console.error('WalletControl.connect failed', err)
    } finally {
      this.connecting = false
    }
  }

  // Networks pre-checked in the multi-network picker: the L1+L2 pair that is
  // actually LIVE today (tezosx-previewnet's L1 is shadownet). mainnet /
  // tezosx-mainnet stay selectable for when Tezos X mainnet launches.
  public static readonly DEFAULT_MULTI_NETWORKS = ['shadownet', 'tezosx-previewnet']

  /**
   * v5 multi-network pairing: pick the networks, then send ONE permission
   * request granting an account per network (CAIP-2 routed). Afterwards the
   * network dropdown switches between them without re-pairing.
   */
  public async openMultiNetworkConnect(): Promise<void> {
    const eligible = this.networks.filter((n) => !!n.chainId)
    const alert = await this.alertController.create({
      header: 'Multi-network pairing',
      message: 'One pairing granting an account on each selected network (octez.connect v5).',
      inputs: eligible.map((n) => ({
        type: 'checkbox' as const,
        label: n.name,
        value: n.name,
        checked: WalletControlComponent.DEFAULT_MULTI_NETWORKS.includes(n.name)
      })),
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Connect',
          handler: (selected: string[]) => {
            if (!selected || selected.length === 0) {
              this.toast('Select at least one network.').catch(console.error)
              return false
            }
            this.connectMultiNetworkFor(selected).catch(console.error)
            return true
          }
        }
      ]
    })
    await alert.present()
  }

  /** Request one pairing spanning the given (by-name) networks. */
  public async connectMultiNetworkFor(names: string[]): Promise<void> {
    if (this.connecting) return
    this.connecting = true
    try {
      const wanted = this.networks.filter((n) => names.includes(n.name) && !!n.chainId)
      const accounts = await this.beaconService.connectMultiNetwork(wanted)
      if (accounts.length < wanted.length) {
        await this.toast(
          `Wallet granted ${accounts.length} of ${wanted.length} requested networks ` +
            '(a pre-v5 wallet degrades to a single account).'
        )
      } else {
        await this.toast('Multi-network pairing OK — switch networks in the dropdown to test them.')
      }
    } catch (err) {
      console.error('WalletControl.connectMultiNetworkFor failed', err)
      await this.toast((err as Error)?.message ?? 'Multi-network connect failed.')
    } finally {
      this.connecting = false
    }
  }

  /** Short label for a granted multi-network account chip. */
  public multiAccountLabel(a: AccountInfo): string {
    const net = a.network as { chainId?: string; name?: string; type?: string } | undefined
    const cfg = this.networks.find(
      (n) => !!n.chainId && (n.chainId === net?.chainId || n.chainId.replace(/^tezos:/, '') === net?.chainId)
    )
    const label = cfg?.name ?? net?.name ?? net?.chainId ?? net?.type ?? '?'
    const addr = a.address ?? ''
    return `${label}: ${addr.slice(0, 8)}…${addr.slice(-6)}`
  }

  public async disconnect(): Promise<void> {
    try {
      await this.beaconService.disconnect()
    } catch (err) {
      console.error('WalletControl.disconnect failed', err)
    }
  }

  public async onNetworkChange(next: string): Promise<void> {
    if (!next || next === this.networkService.getSelected()) return
    this.switching = true
    try {
      // The single DAppClient stays intact. BeaconService subscribes to
      // `networkService.selected$` and swaps which account is active via
      // setActiveAccount — pairings on the previous network remain in
      // storage and reappear when the user toggles back.
      this.networkService.setSelected(next as NetworkName)
    } catch (err) {
      console.error('WalletControl.onNetworkChange failed', err)
    } finally {
      this.switching = false
    }
  }

  public async openAddCustomNetwork(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Add custom network',
      message: 'Save a Tezos network (RPC + indexer) for testing. All fields required.',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Display name (e.g., previewnet)' },
        {
          name: 'sdkNetworkType',
          type: 'text',
          placeholder: 'SDK network type (e.g., custom, mainnet, shadownet)',
          value: 'custom'
        },
        { name: 'rpc', type: 'url', placeholder: 'RPC URL (https://…)' },
        { name: 'indexer', type: 'url', placeholder: 'Indexer UI URL (https://…)' },
        { name: 'api', type: 'url', placeholder: 'Indexer API URL (https://…)' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Add',
          handler: (data) => {
            try {
              if (!data.name || !data.rpc || !data.indexer || !data.api) {
                this.toast('All fields are required.').catch(console.error)
                return false
              }
              const cfg = this.networkService.addCustomNetwork({
                name: String(data.name).trim(),
                sdkNetworkType: String(data.sdkNetworkType || 'custom').trim(),
                rpc: String(data.rpc).trim(),
                indexer: String(data.indexer).trim(),
                api: String(data.api).trim()
              })
              this.toast(`Added "${cfg.name}".`).catch(console.error)
              // Auto-select the newly added network.
              this.onNetworkChange(cfg.name).catch(console.error)
              return true
            } catch (err) {
              this.toast((err as Error)?.message ?? 'Failed to add network.').catch(console.error)
              return false
            }
          }
        }
      ]
    })
    await alert.present()
  }

  public async openManageCustomNetworks(): Promise<void> {
    const customs = this.networks.filter((n) => n.custom)
    if (customs.length === 0) {
      await this.toast('No custom networks to manage.')
      return
    }
    const sheet = await this.actionSheetController.create({
      header: 'Delete a custom network',
      buttons: [
        ...customs.map((c) => ({
          text: `Delete "${c.name}"`,
          role: 'destructive' as const,
          handler: () => {
            this.networkService.removeCustomNetwork(c.name)
            this.toast(`Removed "${c.name}".`).catch(console.error)
            return true
          }
        })),
        { text: 'Cancel', role: 'cancel' as const }
      ]
    })
    await sheet.present()
  }

  public get networkRpc(): string {
    return this.activeNetwork.rpc
  }

  public get networkIndexer(): string {
    return this.activeNetwork.indexer
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastController.create({
      message,
      duration: 2500,
      position: 'bottom'
    })
    await t.present()
  }
}
