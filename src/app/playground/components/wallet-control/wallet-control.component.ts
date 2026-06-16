import { Component, OnDestroy, OnInit } from '@angular/core'
import type { AccountInfo } from '@tezos-x/octez.connect-dapp'
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular'
import { Subscription } from 'rxjs'

import { BeaconService } from '../../../services/beacon/beacon.service'
import { NetworkConfig, NetworkName } from '../../network.config'
import { NetworkService } from '../../services/network.service'

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

  private readonly subs = new Subscription()

  constructor(
    private readonly beaconService: BeaconService,
    private readonly networkService: NetworkService,
    private readonly alertController: AlertController,
    private readonly actionSheetController: ActionSheetController,
    private readonly toastController: ToastController
  ) {
    this.activeNetwork = this.networkService.getActive()
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
