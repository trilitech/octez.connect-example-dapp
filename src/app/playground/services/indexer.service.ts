// Thin Angular HttpClient wrapper over the active `NetworkConfig.api` (TzKT).
// Primary source for the dynamic-contract panel's entrypoint listing, with an
// RPC fallback (FR-033). Also resolves originated KT1 from an op hash (FR-031).

import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { firstValueFrom } from 'rxjs'

import { NetworkService } from './network.service'
import { RpcService } from './rpc.service'

export interface EntrypointDescriptor {
  name: string
  jsonParameterSchema: unknown | null
  rawMicheline?: unknown
}

interface TzKtEntrypoint {
  name: string
  jsonParameters?: unknown
  michelineParameters?: unknown
  michelsonParameters?: string
}

interface TzKtOriginationOp {
  originatedContract?: { address?: string }
}

@Injectable({ providedIn: 'root' })
export class IndexerService {
  constructor(
    private readonly http: HttpClient,
    private readonly networkService: NetworkService,
    private readonly rpc: RpcService
  ) {}

  private apiBase(): string {
    return this.networkService.getActive().api.replace(/\/$/, '')
  }

  // Fetch entrypoints for a KT1. Primary: TzKT. Fallback: Tezos RPC.
  public async getEntrypoints(kt: string): Promise<EntrypointDescriptor[]> {
    try {
      const tzkt = await firstValueFrom(
        this.http.get<TzKtEntrypoint[]>(
          `${this.apiBase()}/v1/contracts/${encodeURIComponent(kt)}/entrypoints?micheline=true&michelson=false`
        )
      )
      return (tzkt || []).map((e) => ({
        name: e.name,
        jsonParameterSchema: e.jsonParameters ?? null,
        rawMicheline: e.michelineParameters
      }))
    } catch (err) {
      console.warn('IndexerService.getEntrypoints: TzKT failed, falling back to RPC', err)
      return await this.getEntrypointsViaRpc(kt)
    }
  }

  private async getEntrypointsViaRpc(kt: string): Promise<EntrypointDescriptor[]> {
    const path = `/chains/main/blocks/head/context/contracts/${encodeURIComponent(kt)}/entrypoints`
    const r = await this.rpc.get<{ entrypoints?: Record<string, unknown> }>(path)
    return Object.entries(r?.entrypoints ?? {}).map(([name, micheline]) => ({
      name,
      jsonParameterSchema: null,
      rawMicheline: micheline
    }))
  }

  public async getContract(kt: string): Promise<unknown> {
    return firstValueFrom(
      this.http.get(`${this.apiBase()}/v1/contracts/${encodeURIComponent(kt)}`)
    )
  }

  public async getOperation(hash: string): Promise<unknown> {
    return firstValueFrom(
      this.http.get(`${this.apiBase()}/v1/operations/${encodeURIComponent(hash)}`)
    )
  }

  // Poll TzKT for an origination by op hash, up to ~30s, returning the originated KT1.
  public async findOriginatedKt(hash: string): Promise<string | null> {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const ops = await firstValueFrom(
          this.http.get<TzKtOriginationOp[]>(
            `${this.apiBase()}/v1/operations/originations?hash=${encodeURIComponent(hash)}`
          )
        )
        if (ops && ops.length > 0 && ops[0]?.originatedContract?.address) {
          return ops[0].originatedContract.address
        }
      } catch (err) {
        // ignore and retry
      }
      await new Promise((res) => setTimeout(res, 3000))
    }
    return null
  }
}
