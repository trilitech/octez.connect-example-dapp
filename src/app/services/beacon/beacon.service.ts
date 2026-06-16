// Async-init wallet client service.
//
// SDK constraints (octez.connect 4.8.x):
//   - Network MUST be set at DAppClient construction. The SDK explicitly
//     rejects a `network` field on request inputs ("the 'network' property is
//     no longer accepted in input. Please provide it when instantiating
//     DAppClient.").
//   - Multiple DAppClient instances trigger a console warning and can cause
//     storage/transport conflicts. "Only create one instance and re-use it
//     everywhere."
//   - The SDK's persistent storage (account list, etc.) outlives `destroy()`
//     of any particular client, so destroying-and-recreating is the only
//     SDK-blessed way to switch the active network while preserving prior
//     pairings (when the SDK chooses to keep them).
//
// This service therefore:
//   1. Keeps exactly one DAppClient alive at any time.
//   2. On network toggle, destroys the old client and constructs a new one
//      against the new network. Subscriptions are re-registered; the account
//      list is re-hydrated; if a previously-paired account matches the new
//      network, it's promoted via setActiveAccount so the user is immediately
//      "connected" again without a pairing UI.
//   3. Serializes init/reinit through a single promise chain so callers that
//      `await whenReady()` always get the LATEST ready client.
//   4. `connect()` calls `requestPermissions()` with NO `network` field —
//      the network is whatever the client was constructed with.

import type { AccountInfo, DAppClient, Transport } from '@tezos-x/octez.connect-dapp'
import { Injectable } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { distinctUntilChanged } from 'rxjs/operators'

import { NetworkService } from '../../playground/services/network.service'
import { SdkLoaderService } from '../../playground/services/sdk-loader.service'

@Injectable({
  providedIn: 'root'
})
export class BeaconService {
  // Definitely-assigned: written in `init()` and on every reinit. Callers MUST
  // `await whenReady()` before touching `client` to be safe against an
  // in-flight reinit.
  public client!: DAppClient

  private readonly _connectionStatus$ = new BehaviorSubject<string>('Not connected')
  public get connectionStatus$(): Observable<string> {
    return this._connectionStatus$.pipe(distinctUntilChanged())
  }

  private readonly _activeAccount$ = new BehaviorSubject<AccountInfo | undefined>(undefined)
  public get activeAccount$(): Observable<AccountInfo | undefined> {
    return this._activeAccount$.pipe(distinctUntilChanged())
  }

  public balance = new BehaviorSubject<string>('')

  // Cached SDK module — populated by `init()`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdk: any = null

  // Serialized init/reinit chain. Every public method awaits the LATEST link
  // so a click on Connect during an in-flight network reinit blocks cleanly
  // and proceeds against the new client.
  private chain: Promise<void>

  constructor(
    private readonly loader: SdkLoaderService,
    private readonly networkService: NetworkService
  ) {
    this.chain = this.doInit().catch((err) => {
      console.error('BeaconService.init failed', err)
      throw err
    })
  }

  /**
   * Resolves once the current init or reinit cycle has completed.
   * Re-resolves to the latest state on every subsequent reinit.
   */
  public whenReady(): Promise<void> {
    return this.chain
  }

  private async doInit(): Promise<void> {
    this.sdk = await this.loader.load()
    await this.constructClientForActiveNetwork()

    // From now on, any toggle of the selected network reinitializes the client.
    this.networkService.selected$.subscribe((_name) => {
      // Queue a reinit on the chain so it serializes with any in-flight work.
      this.chain = this.chain
        .then(() => this.doReinitForActiveNetwork())
        .catch((err) => {
          console.error('BeaconService.reinit on selected$ failed', err)
        })
    })
  }

  private async constructClientForActiveNetwork(): Promise<void> {
    const cfg = this.networkService.getActive()
    this.client = new this.sdk.DAppClient({
      name: 'Octez Connect Example Dapp',
      network: { type: cfg.sdkNetworkType, rpcUrl: cfg.rpc }
    }) as DAppClient
    await this.registerSubscriptions()
    await this.tryRestoreActiveForNetwork(cfg.sdkNetworkType)
  }

  private async doReinitForActiveNetwork(): Promise<void> {
    // Tear down the old client. The SDK keeps paired accounts in storage
    // independently of any particular client's lifecycle, so this preserves
    // previously-paired addresses (when the SDK does so).
    try {
      await this.client.destroy()
    } catch (err) {
      console.warn('BeaconService.doReinitForActiveNetwork: destroy() failed', err)
    }
    await this.constructClientForActiveNetwork()
  }

  /**
   * Try to find a paired account whose network matches the current SDK
   * network and promote it via setActiveAccount. If none exists, clear the
   * active-account subject so the UI shows the Connect CTA.
   */
  private async tryRestoreActiveForNetwork(sdkNetworkType: string): Promise<void> {
    let accounts: AccountInfo[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts = (await (this.client as any).getAccounts()) ?? []
    } catch (err) {
      console.warn('BeaconService.tryRestoreActiveForNetwork: getAccounts() failed', err)
    }
    const match = accounts.find((a) => String(a.network?.type ?? '') === sdkNetworkType)
    if (match) {
      try {
        await this.client.setActiveAccount(match)
      } catch (err) {
        console.warn('BeaconService.tryRestoreActiveForNetwork: setActiveAccount failed', err)
      }
      this._activeAccount$.next(match)
      return
    }
    // No match → clear the displayed active account but DO NOT remove the
    // SDK's stored accounts; the user can toggle back to a previously-paired
    // network and see that pairing reappear here.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.client as any).setActiveAccount(undefined)
    } catch {
      // setActiveAccount(undefined) may be unsupported on some SDK versions; ignore.
    }
    this._activeAccount$.next(undefined)
  }

  /**
   * Connect a wallet on the currently active network.
   * - If an active account already exists, this is a no-op (FR-002).
   * - Otherwise calls `requestPermissions()` with no `network` arg (the
   *   network is fixed by the client's construction-time config).
   *
   * The `_sdkNetworkType` / `_networkName` / `_networkRpcUrl` args are kept in
   * the signature for backwards compatibility; they're ignored because
   * network can only be set at construction time in this SDK. The caller
   * sets the network via `networkService.setSelected(...)` before calling
   * `connect()` — that triggers an automatic client reinit on the new network
   * (chained on `this.chain`), and `connect()` awaits the chain.
   */
  public async connect(
    _sdkNetworkType?: string,
    _networkName?: string,
    _networkRpcUrl?: string
  ): Promise<AccountInfo | undefined> {
    await this.whenReady()
    const existing = await this.client.getActiveAccount()
    if (existing) {
      this._activeAccount$.next(existing)
      return existing
    }
    await this.client.requestPermissions()
    const a = await this.client.getActiveAccount()
    if (a) this._activeAccount$.next(a)
    return a ?? undefined
  }

  /** Thin passthrough for explicit re-pairing on the active network. */
  public async requestPermissions(): Promise<void> {
    await this.whenReady()
    await this.client.requestPermissions()
    const a = await this.client.getActiveAccount()
    if (a) this._activeAccount$.next(a)
  }

  /**
   * Disconnect only the account on the currently active network. Other
   * networks' pairings remain in SDK storage and reappear when the user
   * toggles back.
   */
  public async disconnect(): Promise<void> {
    await this.whenReady()
    const current = await this.client.getActiveAccount()
    if (current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.client.removeAccount((current as any).accountIdentifier)
      } catch (err) {
        console.warn('BeaconService.disconnect: removeAccount failed', err)
      }
    }
    this._activeAccount$.next(undefined)
    this._connectionStatus$.next('Not connected')
  }

  /** Remove every paired account on every network — use sparingly. */
  public async disconnectAll(): Promise<void> {
    await this.whenReady()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.client as any).removeAllAccounts()
    } catch (err) {
      console.warn('BeaconService.disconnectAll: removeAllAccounts failed', err)
    }
    this._activeAccount$.next(undefined)
    this._connectionStatus$.next('Not connected')
  }

  /**
   * Public reinit hook — kept for API stability. Network changes are
   * triggered automatically by `networkService.selected$`, so callers
   * typically don't need to call this directly.
   */
  public async reinitClient(
    _networkType?: string,
    _networkName?: string,
    _networkRpcUrl?: string
  ): Promise<void> {
    this.chain = this.chain
      .then(() => this.doReinitForActiveNetwork())
      .catch((err) => {
        console.error('BeaconService.reinitClient failed', err)
      })
    await this.chain
  }

  /** Best-effort: returns the RPC URL the SDK client was configured with. */
  public getRpcUrl(): string | undefined {
    try {
      return (this.client as unknown as { network?: { rpcUrl?: string } })?.network?.rpcUrl
    } catch {
      return undefined
    }
  }

  private async registerSubscriptions(): Promise<void> {
    try {
      await this.client.subscribeToEvent(
        this.sdk.BeaconEvent.ACTIVE_ACCOUNT_SET,
        async (data: AccountInfo | undefined) => {
          this._activeAccount$.next(data ?? undefined)
        }
      )
      await this.client.subscribeToEvent(
        this.sdk.BeaconEvent.ACTIVE_TRANSPORT_SET,
        async (data: Transport) => {
          const t = (data as unknown as { type?: string }).type
          if (t === this.sdk.TransportType.POST_MESSAGE) {
            this._connectionStatus$.next('Chrome Extension')
          } else if (t === this.sdk.TransportType.P2P) {
            this._connectionStatus$.next('P2P')
          } else {
            this._connectionStatus$.next('Not connected')
          }
        }
      )
    } catch (err) {
      console.error('BeaconService.registerSubscriptions failed', err)
    }
  }
}
