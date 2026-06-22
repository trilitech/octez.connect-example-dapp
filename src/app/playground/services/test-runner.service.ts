// Test runner. Owns:
//   - results$: per-card last-result map (testId → TestResult), used by TestCard.
//   - runs$: numbered-run history (PlaygroundRun[]), persisted to localStorage.
//   - inFlightRunAll$: flag the UI reads to gate the other Run-all button.
//   - runProgress$: { current, total } during an in-flight run-all.
//
// Concurrency model (research §R10): a single owner sequences everything.
// While a run-all is in flight, individual run() calls are pushed onto a FIFO
// queue (the card shows 'queued') and drained as ordinary individual runs once
// the run-all completes. Queued items do NOT join the numbered run.

import { Injectable } from '@angular/core'
import { ToastController } from '@ionic/angular'
import { BehaviorSubject } from 'rxjs'

import { BeaconService } from '../../services/beacon/beacon.service'
import { getExplorerLinkForAddress, getExplorerLinkForTxHash } from '../../utils/explorer'
import { NetworkConfig } from '../network.config'
import { ALL_TESTS } from '../tests'
import {
  PlaygroundRun,
  TestContext,
  TestDefinition,
  TestResult,
  TestStatus
} from '../tests/test-types'
import { IndexerService } from './indexer.service'
import { NetworkService } from './network.service'
import { RpcService } from './rpc.service'
import { SdkLoaderService } from './sdk-loader.service'

const RUN_HISTORY_KEY = 'octez.connect.run-history'
const RUN_HISTORY_CAP = 50

@Injectable({ providedIn: 'root' })
export class TestRunnerService {
  public readonly results$ = new BehaviorSubject<Record<string, TestResult>>({})
  public readonly runs$ = new BehaviorSubject<PlaygroundRun[]>([])
  public readonly inFlightRunAll$ = new BehaviorSubject<boolean>(false)
  public readonly runProgress$ = new BehaviorSubject<{ current: number; total: number } | null>(null)

  private queue: Array<{ def: TestDefinition; inputs: Record<string, unknown> }> = []

  // Set false after a QuotaExceededError so we stop trying to persist this session.
  private persistenceEnabled = true

  constructor(
    private readonly beaconService: BeaconService,
    private readonly networkService: NetworkService,
    private readonly rpc: RpcService,
    private readonly indexer: IndexerService,
    private readonly sdkLoader: SdkLoaderService,
    private readonly toastController: ToastController
  ) {
    this.rehydrate()
  }

  public async run(def: TestDefinition, inputs: Record<string, unknown>): Promise<void> {
    // If a Run-all is in flight, queue this individual run (FR-065).
    if (this.inFlightRunAll$.value) {
      this.queue.push({ def, inputs })
      this.setStatus(def.id, def, 'queued')
      return
    }
    await this.runOne(def, inputs)
  }

  // ── Run-all ──────────────────────────────────────────────────────────────
  // Single run-all path: the "safe" mode was removed (002) because the read-only
  // operations it ran no longer exist. Runs every enabled test sequentially.

  public async runAll(): Promise<void> {
    if (this.inFlightRunAll$.value) return

    const tests = ALL_TESTS.filter((t) => t.enabled)

    await this.beaconService.whenReady()
    const account = await this.beaconService.client.getActiveAccount().catch(() => undefined)
    const network = this.networkService.getActive()
    const walletAddress = account?.address

    // Mainnet confirmation (002 FR-005). "Mutating" = operations submitted through
    // the wallet (octez-connect scope). All remaining tests are wallet-scoped.
    if (network.name === 'mainnet') {
      const mutating = tests.filter(
        (t) => t.requiredScope === 'octez-connect' || t.requiredScope === 'both'
      ).length
      const ok = window.confirm(
        `You are about to run ${tests.length} tests (${mutating} mutating) on MAINNET` +
          (walletAddress ? ` with wallet ${walletAddress}` : ' (no wallet connected)') +
          `. Mutating tests submit real operations. Continue?`
      )
      if (!ok) return
    }

    this.inFlightRunAll$.next(true)
    this.runProgress$.next({ current: 0, total: tests.length })

    const run: PlaygroundRun = {
      runNumber: this.nextRunNumber(),
      startedAt: new Date().toISOString(),
      endedAt: '',
      sdkVersion: this.sdkLoader.getActiveVersion().version,
      network: network.name as PlaygroundRun['network'],
      walletAddress,
      passCount: 0,
      failCount: 0,
      totalCount: tests.length,
      results: []
    }

    try {
      for (let i = 0; i < tests.length; i++) {
        const def = tests[i]
        this.runProgress$.next({ current: i + 1, total: tests.length })
        const inputs = this.buildDefaultInputs(def, network)

        let result: TestResult
        if (this.missingRequiredNetworkDefault(def, inputs)) {
          // No contract address for the active network → record an error result
          // and continue rather than prompting the wallet for a no-op (FR-010).
          result = this.errorResult(def, 'no contract address supplied for active network')
          this.publishResult(result)
        } else {
          result = await this.runOne(def, inputs)
        }

        run.results.push(result)
        if (result.status === 'success') run.passCount++
        else run.failCount++
      }
    } finally {
      run.endedAt = new Date().toISOString()
      this.runs$.next([...this.runs$.value, run])
      this.persistRuns()
      this.inFlightRunAll$.next(false)
      this.runProgress$.next(null)
      await this.drainQueue()
    }
  }

  private async drainQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      await this.runOne(item.def, item.inputs)
    }
  }

  // ── Single execution ───────────────────────────────────────────────────────

  private async runOne(def: TestDefinition, inputs: Record<string, unknown>): Promise<TestResult> {
    if (!def.enabled) {
      const stub = this.errorResult(def, def.disabledReason || 'disabled')
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
        explorerUrl: out.txHash ? getExplorerLinkForTxHash(network, out.txHash) : undefined,
        originatedAddress: out.originatedAddress,
        originatedAddressUrl: out.originatedAddress
          ? getExplorerLinkForAddress(network, out.originatedAddress)
          : undefined
      }
      this.publishResult(result)
      return result
    } catch (err) {
      const endedAt = new Date()
      const message = (err as Error)?.message ?? String(err)
      // Tests flagged expectsFailure are *designed* to throw: the failure IS the
      // expected outcome, so record it as success with the failure in the summary
      // (no red error block) rather than an error (FR-009).
      const expected = def.expectsFailure === true
      const result: TestResult = {
        testId: def.id,
        title: def.title,
        category: def.category,
        status: expected ? 'success' : 'error',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        // Keep the request context for debugging even on error (FR-016) when available.
        request: inputs,
        summary: expected ? `Failed as expected: ${message}` : undefined,
        error: expected ? undefined : message
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

  // ── Run-history mutation (per-card last-result untouched, FR-060/FR-061) ─────

  public deleteRun(runNumber: number): void {
    this.runs$.next(this.runs$.value.filter((r) => r.runNumber !== runNumber))
    this.persistRuns()
  }

  public clearAllRuns(): void {
    this.runs$.next([])
    this.persistRuns()
  }

  // ── internals ────────────────────────────────────────────────────────────

  private nextRunNumber(): number {
    return this.runs$.value.reduce((max, r) => Math.max(max, r.runNumber), 0) + 1
  }

  private buildDefaultInputs(def: TestDefinition, network: NetworkConfig): Record<string, unknown> {
    const inputs: Record<string, unknown> = {}
    for (const input of def.inputs) {
      if (input.defaultFromNetwork) {
        inputs[input.key] = network.contractDefaults[input.defaultFromNetwork] ?? ''
      } else if (input.default !== undefined) {
        inputs[input.key] = input.default
      } else {
        inputs[input.key] = input.type === 'boolean' ? false : input.type === 'number' ? 0 : ''
      }
    }
    return inputs
  }

  private missingRequiredNetworkDefault(
    def: TestDefinition,
    inputs: Record<string, unknown>
  ): boolean {
    return def.inputs.some(
      (i) => !!i.defaultFromNetwork && !String(inputs[i.key] ?? '').trim()
    )
  }

  private errorResult(def: TestDefinition, message: string): TestResult {
    const now = new Date().toISOString()
    return {
      testId: def.id,
      title: def.title,
      category: def.category,
      status: 'error',
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      error: message
    }
  }

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

  private persistRuns(): void {
    if (!this.persistenceEnabled) return

    let runs = this.runs$.value
    if (runs.length > RUN_HISTORY_CAP) {
      const dropped = runs.length - RUN_HISTORY_CAP
      runs = runs.slice(-RUN_HISTORY_CAP)
      this.runs$.next(runs)
      console.info(`octez.connect run-history capped at ${RUN_HISTORY_CAP}; dropped ${dropped} oldest run(s)`)
    }

    try {
      window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(runs))
    } catch (err) {
      const quota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      if (quota) {
        this.persistenceEnabled = false
        this.toast('Run-history storage is full — keeping this session in memory only.').catch(
          console.error
        )
      } else {
        console.error('TestRunnerService.persistRuns: localStorage write failed', err)
      }
    }
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

  private async toast(message: string): Promise<void> {
    const t = await this.toastController.create({ message, duration: 4000, position: 'bottom' })
    await t.present()
  }
}
