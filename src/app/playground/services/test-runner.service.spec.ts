import { BUILTIN_NETWORKS } from '../network.config'
import { TestDefinition } from '../tests/test-types'
import { TestRunnerService } from './test-runner.service'

// Minimal fakes for the runner's dependencies. The runner only touches a small
// surface of each: whenReady/client.getActiveAccount, network resolution, rpc/
// indexer pass-through (used by the real tests), and SDK version.
function makeRunner(): { service: TestRunnerService } {
  const beaconService = {
    whenReady: () => Promise.resolve(),
    client: { getActiveAccount: () => Promise.resolve(undefined) }
  }
  const networkService = {
    getActive: () => BUILTIN_NETWORKS['shadownet']
  }
  const rpc = { get: () => Promise.resolve({}), post: () => Promise.resolve({}) }
  const indexer = {
    getContract: () => Promise.resolve({ metadata: { name: 'x' } }),
    findOriginatedKt: () => Promise.resolve(null)
  }
  const sdkLoader = { getActiveVersion: () => ({ version: 'test', source: 'default' as const }) }
  const toastController = { create: () => Promise.resolve({ present: () => Promise.resolve() }) }

  const service = new TestRunnerService(
    beaconService as any,
    networkService as any,
    rpc as any,
    indexer as any,
    sdkLoader as any,
    toastController as any
  )
  return { service }
}

describe('TestRunnerService FIFO queue (FR-065)', () => {
  beforeEach(() => window.localStorage.clear())

  it('queues an individual run requested during an in-flight Run-all and runs it afterwards', async () => {
    const { service } = makeRunner()

    let fakeRuns = 0
    const fakeDef: TestDefinition = {
      id: 'spec.queued',
      title: 'Queued spec test',
      category: 'core',
      description: '',
      requiredScope: 'none',
      enabled: true,
      inputs: [],
      async run() {
        fakeRuns++
        return { request: {}, response: {} }
      }
    }

    let queuedStatusSeen = false
    let calledDuringRun = false
    const sub = service.inFlightRunAll$.subscribe((v) => {
      if (v && !calledDuringRun) {
        calledDuringRun = true
        // Request an individual run while the Run-all owns the runner.
        void service.run(fakeDef, {})
        queuedStatusSeen = service.results$.value[fakeDef.id]?.status === 'queued'
      }
    })

    await service.runAll()
    sub.unsubscribe()

    expect(queuedStatusSeen).toBe(true) // flipped to 'queued' while in-flight
    expect(fakeRuns).toBe(1) // drained exactly once after the Run-all
    expect(service.inFlightRunAll$.value).toBe(false) // run-all finished
    // The queued individual run is NOT part of the numbered run.
    const lastRun = service.runs$.value[service.runs$.value.length - 1]
    expect(lastRun.results.some((r) => r.testId === fakeDef.id)).toBe(false)
  })
})
