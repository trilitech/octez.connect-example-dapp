// Thin Angular HttpClient wrapper over the active `NetworkConfig.rpc`.
// Generalizes the inline RPC URL pattern previously seen in `sample-contract`.

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { firstValueFrom } from 'rxjs'

import { NetworkService } from './network.service'

@Injectable({ providedIn: 'root' })
export class RpcService {
  constructor(
    private readonly http: HttpClient,
    private readonly networkService: NetworkService
  ) {}

  // Compose an absolute URL against the currently-active network. Re-read on every
  // call so a mid-test network toggle is honored.
  public url(path: string): string {
    const base = this.networkService.getActive().rpc.replace(/\/$/, '')
    const p = path.startsWith('/') ? path : '/' + path
    return base + p
  }

  public async get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path)))
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body))
  }
}
