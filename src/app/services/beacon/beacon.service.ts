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

import { NetworkConfig } from '../../playground/network.config'
import { NetworkService } from '../../playground/services/network.service'
import { SdkLoaderService, supportsMultiNetwork } from '../../playground/services/sdk-loader.service'

// Set when a v5 multi-network pairing succeeds; cleared when every account is
// removed. Persisted so a reload restores the multi-network session semantics
// (operation requests MUST carry a CAIP-2 `network` on such sessions).
const MULTI_NETWORK_KEY = 'octez.connect.multi-network-session'

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

  // Multi-network session state (octez.connect v5): all paired accounts,
  // one per granted network, each carrying `network.chainId` (CAIP-2).
  private readonly _multiNetworkAccounts$ = new BehaviorSubject<AccountInfo[]>([])
  public get multiNetworkAccounts$(): Observable<AccountInfo[]> {
    return this._multiNetworkAccounts$.asObservable()
  }

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
      network: { type: this.resolveSdkNetworkType(cfg.sdkNetworkType), rpcUrl: cfg.rpc }
    }) as DAppClient
    this.injectNetworkOnOperations()
    await this.registerSubscriptions()
    await this.tryRestoreActiveForNetwork(cfg)
  }

  /**
   * Map a config's SDK network type onto one the LOADED SDK actually knows.
   * E.g. `tezosx-mainnet` only exists as a NetworkType from v5 — on a 4.8.x
   * client fall back to 'custom' so construction doesn't hit an out-of-enum
   * value (the rpcUrl still points at the right chain).
   */
  private resolveSdkNetworkType(type: string): string {
    try {
      const known = Object.values(this.sdk.NetworkType ?? {}) as string[]
      // Only remap when the loaded SDK exposes the enum and lacks the value;
      // an absent/empty enum must not degrade every network to 'custom'.
      return known.length > 0 && !known.includes(type) ? 'custom' : type
    } catch {
      return type
    }
  }

  /**
   * On a v5 multi-network session, `requestOperation` REQUIRES a CAIP-2
   * `network` (omitting it throws NetworksUnsupportedBeaconError). Wrap the
   * client method once per construction so every caller (playground tests,
   * contract explorer, home page) transparently targets the active network
   * without having to know about multi-network sessions. Explicitly-passed
   * `network` values are left untouched.
   *
   * Also gated on the LOADED SDK being v5+: the multi-network flag persists
   * in localStorage, so after a version downgrade to 4.8.x (which rejects a
   * `network` property on request inputs) the wrapper must become a no-op.
   */
  private injectNetworkOnOperations(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.client as any
    if (typeof client.requestOperation !== 'function') return
    const original = client.requestOperation.bind(client)
    client.requestOperation = (input: Record<string, unknown>) => {
      if (this.sdkSupportsMultiNetwork() && this.isMultiNetworkSession() && input && input.network === undefined) {
        const chainId = this.networkService.getActive().chainId
        if (chainId) return original({ ...input, network: chainId })
      }
      return original(input)
    }
  }

  private async doReinitForActiveNetwork(): Promise<void> {
    // On a v5 multi-network session, ONE pairing serves every granted
    // network: keep the client alive and just promote the account matching
    // the newly selected network (operations are routed per-request via
    // CAIP-2, injected in injectNetworkOnOperations). Destroying would also
    // be destructive: v5's destroy() wipes the SDK's persisted storage
    // (removeBeaconEntriesFromStorage), dropping all paired accounts —
    // unlike 4.8.x where storage outlived the client.
    if (this.sdkSupportsMultiNetwork() && this.isMultiNetworkSession()) {
      await this.tryRestoreActiveForNetwork(this.networkService.getActive())
      return
    }
    // Legacy path: tear down the old client and construct one against the
    // new network. On 4.8.x the SDK keeps paired accounts in storage
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
   * Try to find a paired account whose network matches the current config —
   * by CAIP-2 chainId first (v5 multi-network accounts), then by SDK network
   * type (legacy single-network accounts) — and promote it via
   * setActiveAccount. If none exists, clear the active-account subject so
   * the UI shows the Connect CTA.
   */
  private async tryRestoreActiveForNetwork(cfg: NetworkConfig): Promise<void> {
    let accounts: AccountInfo[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts = (await (this.client as any).getAccounts()) ?? []
    } catch (err) {
      console.warn('BeaconService.tryRestoreActiveForNetwork: getAccounts() failed', err)
    }
    this._multiNetworkAccounts$.next(
      this.isMultiNetworkSession()
        ? accounts.filter((a) => !!(a.network as { chainId?: string } | undefined)?.chainId)
        : []
    )
    const match = accounts.find((a) => this.accountMatchesNetwork(a, cfg))
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

  private accountMatchesNetwork(account: AccountInfo, cfg: NetworkConfig): boolean {
    const net = account.network as { type?: string; chainId?: string } | undefined
    if (cfg.chainId && net?.chainId) {
      // v5 stores the full CAIP-2 form but accept a bare genesis reference too.
      const bare = cfg.chainId.replace(/^tezos:/, '')
      return net.chainId === cfg.chainId || net.chainId === bare
    }
    return String(net?.type ?? '') === cfg.sdkNetworkType
  }

  /** Whether the persisted pairing was made with the v5 multi-network flow. */
  public isMultiNetworkSession(): boolean {
    try {
      return window.localStorage.getItem(MULTI_NETWORK_KEY) === 'true'
    } catch {
      return false
    }
  }

  /** Whether the LOADED SDK can do multi-network pairing (v5+). */
  public sdkSupportsMultiNetwork(): boolean {
    return supportsMultiNetwork(this.loader.getActiveVersion().version)
  }

  /**
   * Pair once across several networks at the same time (octez.connect v5
   * multi-network). Sends `requestPermissions({ networks })` with the CAIP-2
   * chain id (+ rpcUrl/name hints) of every requested network; a v5 wallet
   * grants one account per network, a v4.8.6 wallet degrades gracefully to a
   * single account (per the v5 migration guide §1).
   *
   * Only networks with a known `chainId` participate; throws if the loaded
   * SDK predates multi-network or no requested network has a chain id.
   */
  public async connectMultiNetwork(cfgs: NetworkConfig[]): Promise<AccountInfo[]> {
    await this.whenReady()
    if (!this.sdkSupportsMultiNetwork()) {
      throw new Error(
        `Multi-network pairing needs octez.connect >= 5.0.0 (running ${this.loader.getActiveVersion().version}). ` +
          'Switch the SDK version first.'
      )
    }
    const networks = cfgs
      .filter((c) => !!c.chainId)
      .map((c) => ({ chainId: c.chainId as string, rpcUrl: c.rpc, name: c.name }))
    if (networks.length === 0) {
      throw new Error('None of the requested networks has a CAIP-2 chain id.')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.client as any).requestPermissions({ networks })

    try {
      window.localStorage.setItem(MULTI_NETWORK_KEY, 'true')
    } catch (err) {
      console.error('BeaconService.connectMultiNetwork: localStorage write failed', err)
    }

    // Re-hydrate: publishes multiNetworkAccounts$ and promotes the account
    // matching the currently selected network.
    await this.tryRestoreActiveForNetwork(this.networkService.getActive())
    return this._multiNetworkAccounts$.value
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
    // Keep the multi-network flag while accounts on OTHER networks survive;
    // drop it (and the per-network account list) once nothing is left.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const remaining: AccountInfo[] = (await (this.client as any).getAccounts()) ?? []
      if (remaining.length === 0) this.clearMultiNetworkSession()
      else if (this.isMultiNetworkSession()) {
        this._multiNetworkAccounts$.next(
          remaining.filter((a) => !!(a.network as { chainId?: string } | undefined)?.chainId)
        )
      }
    } catch {
      // getAccounts is best-effort here; state re-syncs on next reinit.
    }
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
    this.clearMultiNetworkSession()
  }

  private clearMultiNetworkSession(): void {
    try {
      window.localStorage.removeItem(MULTI_NETWORK_KEY)
    } catch {
      // ignore
    }
    this._multiNetworkAccounts$.next([])
  }

  /**
   * Public reinit hook — kept for API stability. Network changes are
   * triggered automatically by `networkService.selected$`, so callers
   * typically don't need to call this directly.
   */
  public async reinitClient(_networkType?: string, _networkName?: string, _networkRpcUrl?: string): Promise<void> {
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
      // v5 emits ACTIVE_TRANSPORT_SET with `undefined` when the transport is
      // cleared (e.g. during a reinit); treat that as "Not connected".
      await this.client.subscribeToEvent(this.sdk.BeaconEvent.ACTIVE_TRANSPORT_SET, async (data?: Transport) => {
        const t = (data as unknown as { type?: string } | undefined)?.type
        if (t === this.sdk.TransportType.POST_MESSAGE) {
          this._connectionStatus$.next('Chrome Extension')
        } else if (t === this.sdk.TransportType.P2P) {
          this._connectionStatus$.next('P2P')
        } else {
          this._connectionStatus$.next('Not connected')
        }
      })
    } catch (err) {
      console.error('BeaconService.registerSubscriptions failed', err)
    }
  }
}
