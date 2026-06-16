// Test runner skeleton. Owns:
//   - results$: per-card last-result map (testId → TestResult), used by TestCard.
//   - runs$: numbered-run history (PlaygroundRun[]), persisted to localStorage.
//   - inFlightRunAll$: flag the UI reads to gate the other Run-all button.
//   - runProgress$: { current, total } during an in-flight run-all.
//
// Phase 2 ships only `run(testId, inputs)` with results$ updates. runAllSafe /
// runAllFull / FIFO queue / persistence / numbered runs land in Phase 6 (US4 tasks).

import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'

import { BeaconService } from '../../services/beacon/beacon.service'
import { NetworkService } from './network.service'
import { RpcService } from './rpc.service'
import { IndexerService } from './indexer.service'
import { getExplorerLinkForTxHash } from '../../utils/explorer'
import {
  PlaygroundRun,
  TestContext,
  TestDefinition,
  TestResult,
  TestStatus
} from '../tests/test-types'

const RUN_HISTORY_KEY = 'octez.connect.run-history'
const RUN_HISTORY_CAP = 50

@Injectable({ providedIn: 'root' })
export class TestRunnerService {
  public readonly results$ = new BehaviorSubject<Record<string, TestResult>>({})
  public readonly runs$ = new BehaviorSubject<PlaygroundRun[]>([])
  public readonly inFlightRunAll$ = new BehaviorSubject<'safe' | 'full' | null>(null)
  public readonly runProgress$ = new BehaviorSubject<{ current: number; total: number } | null>(null)

  private queue: Array<{ def: TestDefinition; inputs: Record<string, unknown> }> = []

  constructor(
    private readonly beaconService: BeaconService,
    private readonly networkService: NetworkService,
    private readonly rpc: RpcService,
    private readonly indexer: IndexerService
  ) {
    this.rehydrate()
  }

  public async run(def: TestDefinition, inputs: Record<string, unknown>): Promise<void> {
    // If a Run-all is in flight, queue this individual run (FR-065).
    if (this.inFlightRunAll$.value !== null) {
      this.queue.push({ def, inputs })
      this.setStatus(def.id, def, 'queued')
      return
    }
    await this.runOne(def, inputs)
  }

  private async runOne(def: TestDefinition, inputs: Record<string, unknown>): Promise<TestResult> {
    if (!def.enabled) {
      const stub: TestResult = {
        testId: def.id,
        title: def.title,
        category: def.category,
        status: 'error',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        error: def.disabledReason || 'disabled'
      }
      this.publishResult(stub)
      return stub
    }

    await this.beaconService.whenReady()
    const account = await this.beaconService.client.getActiveAccount().catch(() => undefined)

    const network = this.networkService.getActive()
    const ctx: TestContext = {
      client: this.beaconService.client,
      rpc: this.rpc,
      indexer: this.indexer,
      account: account || undefined,
      inputs,
      network
    }

    const startedAt = new Date()
    this.setStatus(def.id, def, 'running', startedAt.toISOString())

    try {
      const out = await def.run(ctx)
      const endedAt = new Date()
      const result: TestResult = {
        testId: def.id,
        title: def.title,
        category: def.category,
        status: 'success',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        request: out.request,
        response: out.response,
        txHash: out.txHash,
        signature: out.signature,
        summary: out.summary,
        explorerUrl: out.txHash ? getExplorerLinkForTxHash(network, out.txHash) : undefined
      }
      this.publishResult(result)
      return result
    } catch (err) {
      const endedAt = new Date()
      const result: TestResult = {
        testId: def.id,
        title: def.title,
        category: def.category,
        status: 'error',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        error: (err as Error)?.message ?? String(err)
      }
      this.publishResult(result)
      return result
    }
  }

  public reset(testId: string): void {
    const map = { ...this.results$.value }
    delete map[testId]
    this.results$.next(map)
  }

  // ── stubs for US4 (Phase 6) — full bodies land in T037 onward ────────────
  public async runAllSafe(): Promise<void> {
    /* implemented in T037 */
  }

  public async runAllFull(): Promise<void> {
    /* implemented in T038 */
  }

  public deleteRun(_runNumber: number): void {
    /* implemented in T043 */
  }

  public clearAllRuns(): void {
    /* implemented in T043 */
  }

  // ── internals ────────────────────────────────────────────────────────────
  private setStatus(id: string, def: TestDefinition, status: TestStatus, startedAt?: string): void {
    const existing = this.results$.value[id]
    const now = new Date().toISOString()
    const next: TestResult = {
      testId: id,
      title: def.title,
      category: def.category,
      status,
      startedAt: startedAt ?? existing?.startedAt ?? now,
      endedAt: existing?.endedAt ?? now,
      durationMs: existing?.durationMs ?? 0,
      request: existing?.request,
      response: existing?.response,
      txHash: existing?.txHash,
      signature: existing?.signature,
      summary: existing?.summary,
      explorerUrl: existing?.explorerUrl,
      error: status === 'error' ? existing?.error : undefined
    }
    this.results$.next({ ...this.results$.value, [id]: next })
  }

  private publishResult(r: TestResult): void {
    this.results$.next({ ...this.results$.value, [r.testId]: r })
  }

  private rehydrate(): void {
    try {
      const raw = window.localStorage.getItem(RUN_HISTORY_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as PlaygroundRun[]
      if (Array.isArray(parsed)) this.runs$.next(parsed.slice(-RUN_HISTORY_CAP))
    } catch (err) {
      console.warn('TestRunnerService.rehydrate failed; starting with empty history', err)
    }
  }
}
