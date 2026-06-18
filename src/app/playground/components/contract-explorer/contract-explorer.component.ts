import { Component, OnDestroy, OnInit } from '@angular/core'
import type { AccountInfo } from '@tezos-x/octez.connect-dapp'
import { Subscription } from 'rxjs'

import { BeaconService } from '../../../services/beacon/beacon.service'
import { getExplorerLinkForTxHash } from '../../../utils/explorer'
import { NetworkConfig } from '../../network.config'
import { EntrypointDescriptor, IndexerService } from '../../services/indexer.service'
import { NetworkService } from '../../services/network.service'

// Build an editable Michelson *value* skeleton from an entrypoint parameter
// *type* (Micheline). The indexer's `jsonParameterSchema` is a type descriptor
// (e.g. {"schema:int":"int"}), NOT a value — seeding the parameter box with it
// makes the wallet reject the op ("Invalid Michelson value … unable to encode").
// This produces a valid starting value the user can edit before invoking.
function michelineTypeToValueTemplate(type: unknown): unknown {
  if (!type || typeof type !== 'object' || Array.isArray(type)) return { prim: 'Unit' }
  const t = type as { prim?: string; args?: unknown[] }
  const args = Array.isArray(t.args) ? t.args : []
  switch (t.prim) {
    case 'int':
    case 'nat':
    case 'mutez':
      return { int: '0' }
    case 'string':
    case 'key':
    case 'key_hash':
    case 'address':
    case 'signature':
    case 'chain_id':
    case 'timestamp':
      return { string: '' }
    case 'bytes':
    case 'bls12_381_g1':
    case 'bls12_381_g2':
    case 'bls12_381_fr':
      return { bytes: '' }
    case 'bool':
      return { prim: 'False' }
    case 'unit':
      return { prim: 'Unit' }
    case 'option':
      return { prim: 'None' }
    case 'list':
    case 'set':
    case 'map':
    case 'big_map':
    case 'lambda':
      return []
    case 'pair':
      return { prim: 'Pair', args: args.map(michelineTypeToValueTemplate) }
    case 'or':
      // Default to the Left branch; the user switches to Right if needed.
      return { prim: 'Left', args: [michelineTypeToValueTemplate(args[0])] }
    default:
      return { prim: 'Unit' }
  }
}

@Component({
  selector: 'pg-contract-explorer',
  templateUrl: './contract-explorer.component.html',
  styleUrls: ['./contract-explorer.component.scss']
})
export class ContractExplorerComponent implements OnInit, OnDestroy {
  public kt = ''
  public amount = 0

  public entrypoints: EntrypointDescriptor[] = []
  public selectedEntrypoint: string | undefined
  public parameterJson = ''

  public loading = false
  public invoking = false
  public loadError: string | undefined
  public invokeError: string | undefined

  public txHash: string | undefined
  public explorerUrl: string | undefined

  public account: AccountInfo | undefined
  public network!: NetworkConfig

  private readonly subs = new Subscription()

  constructor(
    private readonly indexerService: IndexerService,
    private readonly beaconService: BeaconService,
    private readonly networkService: NetworkService
  ) {}

  public ngOnInit(): void {
    this.network = this.networkService.getActive()
    // Seed the KT1 with the active network's counter default, if any.
    this.kt = this.network.contractDefaults['counter'] ?? ''
    this.subs.add(this.networkService.active$.subscribe((cfg) => (this.network = cfg)))
    this.subs.add(this.beaconService.activeAccount$.subscribe((a) => (this.account = a)))
  }

  public ngOnDestroy(): void {
    this.subs.unsubscribe()
  }

  public isValidKt(): boolean {
    const v = this.kt.trim()
    return v.startsWith('KT1') && v.length === 36
  }

  public async load(): Promise<void> {
    this.loadError = undefined
    this.invokeError = undefined
    this.txHash = undefined
    this.explorerUrl = undefined
    this.entrypoints = []
    this.selectedEntrypoint = undefined
    this.parameterJson = ''

    if (!this.isValidKt()) {
      this.loadError = 'Enter a valid KT1 address (starts with KT1, 36 chars).'
      return
    }

    this.loading = true
    try {
      this.entrypoints = await this.indexerService.getEntrypoints(this.kt.trim())
      if (this.entrypoints.length === 0) {
        this.loadError = 'No entrypoints found for this contract.'
      }
    } catch (err) {
      this.loadError = (err as Error)?.message ?? String(err)
    } finally {
      this.loading = false
    }
  }

  public onEntrypointChange(name: string): void {
    this.selectedEntrypoint = name
    this.invokeError = undefined
    const ep = this.entrypoints.find((e) => e.name === name)
    if (!ep) {
      this.parameterJson = ''
      return
    }
    // Seed with a Michelson *value* skeleton derived from the parameter *type*
    // (rawMicheline). Never seed the raw type/schema — the SDK can't encode it.
    const seed =
      ep.rawMicheline != null ? michelineTypeToValueTemplate(ep.rawMicheline) : { prim: 'Unit' }
    this.parameterJson = JSON.stringify(seed, null, 2)
  }

  public canInvoke(): boolean {
    return !!this.account && !!this.selectedEntrypoint && !this.invoking
  }

  public async invoke(): Promise<void> {
    this.invokeError = undefined
    this.txHash = undefined
    this.explorerUrl = undefined

    if (!this.account) {
      this.invokeError = 'Connect a wallet first.'
      return
    }
    if (!this.selectedEntrypoint) {
      this.invokeError = 'Select an entrypoint.'
      return
    }

    let value: unknown
    try {
      value = this.parameterJson.trim() ? JSON.parse(this.parameterJson) : { prim: 'Unit' }
    } catch (err) {
      this.invokeError = `Parameter JSON is malformed: ${(err as Error)?.message ?? err}`
      return
    }

    const op = {
      kind: 'transaction' as const,
      amount: String(this.amount ?? 0),
      destination: this.kt.trim(),
      parameters: { entrypoint: this.selectedEntrypoint, value }
    }

    this.invoking = true
    try {
      await this.beaconService.whenReady()
      const response = await this.beaconService.client.requestOperation({
        operationDetails: [op]
      } as any)
      this.txHash = (response as { transactionHash?: string })?.transactionHash
      if (this.txHash) {
        this.explorerUrl = getExplorerLinkForTxHash(this.network, this.txHash)
      }
    } catch (err) {
      this.invokeError = (err as Error)?.message ?? String(err)
    } finally {
      this.invoking = false
    }
  }
}
