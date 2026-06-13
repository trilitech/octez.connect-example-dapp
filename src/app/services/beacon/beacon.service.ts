import { AccountInfo, BeaconEvent, DAppClient, NetworkType, Transport, TransportType } from '@tezos-x/octez.connect-dapp'
import { Injectable } from '@angular/core'
import { Observable, ReplaySubject } from 'rxjs'
import { distinctUntilChanged } from 'rxjs/operators'

@Injectable({
  providedIn: 'root'
})
export class BeaconService {
  public client: DAppClient

  private readonly _connectionStatus$: ReplaySubject<string> = new ReplaySubject(1)
  public get connectionStatus$(): Observable<string> {
    return this._connectionStatus$.pipe(distinctUntilChanged())
  }

  private readonly _activeAccount$: ReplaySubject<AccountInfo> = new ReplaySubject(1)
  public get activeAccount$(): Observable<AccountInfo> {
    return this._activeAccount$.pipe(distinctUntilChanged())
  }

  public balance: Observable<string> = new ReplaySubject(1)

  constructor() {
    this.client = new DAppClient({
      name: 'Octez Connect Example Dapp',
      network: { type: NetworkType.SHADOWNET, rpcUrl: 'https://tezos-shadownet.octez.io' }
    })

    this.client
      .subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, async (data: AccountInfo) => {
        this._activeAccount$.next(data)
      })
      .catch(console.error)

    this.client
      .subscribeToEvent(BeaconEvent.ACTIVE_TRANSPORT_SET, async (data: Transport) => {
        if (data.type === TransportType.POST_MESSAGE) {
          this._connectionStatus$.next('Chrome Extension')
        } else if (data.type === TransportType.P2P) {
          this._connectionStatus$.next('P2P')
        } else {
          this._connectionStatus$.next('Not connected')
        }
      })
      .catch(console.error)
  }

  private static readonly RPC_URLS: Partial<Record<NetworkType, string>> = {
    [NetworkType.SHADOWNET]: 'https://tezos-shadownet.octez.io'
  }

  public async reinitClient(networkType: NetworkType, networkName?: string, networkRpcUrl?: string): Promise<void> {
    await this.client.destroy()
    this.client = new DAppClient({
      name: 'Octez Connect Example Dapp',
      network: {
        type: networkType,
        name: networkName,
        rpcUrl: networkRpcUrl || BeaconService.RPC_URLS[networkType]
      }
    })

    this.client
      .subscribeToEvent(BeaconEvent.ACTIVE_ACCOUNT_SET, async (data: AccountInfo) => {
        this._activeAccount$.next(data)
      })
      .catch(console.error)

    this.client
      .subscribeToEvent(BeaconEvent.ACTIVE_TRANSPORT_SET, async (data: Transport) => {
        if (data.type === TransportType.POST_MESSAGE) {
          this._connectionStatus$.next('Chrome Extension')
        } else if (data.type === TransportType.P2P) {
          this._connectionStatus$.next('P2P')
        } else {
          this._connectionStatus$.next('Not connected')
        }
      })
      .catch(console.error)
  }
}
