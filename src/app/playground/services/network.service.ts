// Owns the live "active network" subject + the list of available networks
// (built-ins + user-added customs) and persists the user's choices across reload.
// RpcService, IndexerService, and the wallet-control component all read from this.

import { Injectable } from '@angular/core'
import { BehaviorSubject, combineLatest, Observable } from 'rxjs'
import { distinctUntilChanged, map } from 'rxjs/operators'

import {
  BUILTIN_NETWORKS,
  CustomNetworkInput,
  isBuiltinNetwork,
  NetworkConfig,
  NetworkName,
  toCustomNetworkConfig
} from '../network.config'

const SELECTED_KEY = 'octez.connect.network'
const CUSTOM_KEY = 'octez.connect.custom-networks'

@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly _customs$ = new BehaviorSubject<NetworkConfig[]>(this.loadCustoms())
  private readonly _selected$ = new BehaviorSubject<NetworkName>(this.readStoredSelected())

  public readonly customs$: Observable<NetworkConfig[]> = this._customs$.asObservable()

  public readonly networks$: Observable<NetworkConfig[]> = this._customs$.pipe(
    map((customs) => [...Object.values(BUILTIN_NETWORKS), ...customs])
  )

  public readonly selected$: Observable<NetworkName> = this._selected$.pipe(distinctUntilChanged())

  public readonly active$: Observable<NetworkConfig> = combineLatest([
    this._selected$.pipe(distinctUntilChanged()),
    this._customs$
  ]).pipe(map(([name, customs]) => this.resolve(name, customs)))

  public getAvailable(): NetworkConfig[] {
    return [...Object.values(BUILTIN_NETWORKS), ...this._customs$.value]
  }

  public getSelected(): NetworkName {
    return this._selected$.value
  }

  public getActive(): NetworkConfig {
    return this.resolve(this._selected$.value, this._customs$.value)
  }

  public setSelected(name: NetworkName): void {
    if (name === this._selected$.value) return
    // Reject unknown names — caller should add the custom network first.
    if (!this.hasNetwork(name)) {
      console.warn(`NetworkService.setSelected: unknown network "${name}"; ignoring`)
      return
    }
    try {
      window.localStorage.setItem(SELECTED_KEY, name)
    } catch (err) {
      console.error('NetworkService.setSelected: localStorage write failed', err)
    }
    this._selected$.next(name)
  }

  public addCustomNetwork(input: CustomNetworkInput): NetworkConfig {
    const name = input.name.trim()
    if (!name) throw new Error('network name is required')
    if (isBuiltinNetwork(name)) throw new Error(`"${name}" is a reserved built-in network name`)
    if (this._customs$.value.some((c) => c.name === name)) {
      throw new Error(`a custom network named "${name}" already exists`)
    }
    const cfg = toCustomNetworkConfig({ ...input, name })
    const next = [...this._customs$.value, cfg]
    this._customs$.next(next)
    this.persistCustoms(next)
    return cfg
  }

  public removeCustomNetwork(name: string): void {
    if (isBuiltinNetwork(name)) {
      console.warn(`NetworkService.removeCustomNetwork: cannot remove built-in "${name}"`)
      return
    }
    const next = this._customs$.value.filter((c) => c.name !== name)
    if (next.length === this._customs$.value.length) return
    this._customs$.next(next)
    this.persistCustoms(next)
    // If the currently selected network is the one being deleted, fall back to shadownet.
    if (this._selected$.value === name) {
      this.setSelected('shadownet')
    }
  }

  private resolve(name: NetworkName, customs: NetworkConfig[]): NetworkConfig {
    if (BUILTIN_NETWORKS[name]) return BUILTIN_NETWORKS[name]
    const c = customs.find((x) => x.name === name)
    if (c) return c
    // Fall back to shadownet if the stored name is no longer available
    // (e.g., the user deleted a custom network they had selected).
    return BUILTIN_NETWORKS['shadownet']
  }

  private hasNetwork(name: NetworkName): boolean {
    return !!BUILTIN_NETWORKS[name] || this._customs$.value.some((c) => c.name === name)
  }

  private readStoredSelected(): NetworkName {
    try {
      const v = window.localStorage.getItem(SELECTED_KEY)
      return v ?? 'shadownet'
    } catch {
      return 'shadownet'
    }
  }

  private loadCustoms(): NetworkConfig[] {
    try {
      const raw = window.localStorage.getItem(CUSTOM_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as Array<Partial<NetworkConfig>>
      if (!Array.isArray(parsed)) return []
      // Defensive coerce — reject malformed entries silently.
      return parsed
        .filter(
          (c) =>
            typeof c?.name === 'string' &&
            typeof c?.rpc === 'string' &&
            typeof c?.indexer === 'string' &&
            typeof c?.api === 'string'
        )
        .map((c) =>
          toCustomNetworkConfig({
            name: c.name as string,
            sdkNetworkType: (c.sdkNetworkType as string) || 'custom',
            rpc: c.rpc as string,
            indexer: c.indexer as string,
            api: c.api as string
          })
        )
    } catch (err) {
      console.warn('NetworkService.loadCustoms: parse failed; starting empty', err)
      return []
    }
  }

  private persistCustoms(customs: NetworkConfig[]): void {
    try {
      window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(customs))
    } catch (err) {
      console.error('NetworkService.persistCustoms: localStorage write failed', err)
    }
  }
}
