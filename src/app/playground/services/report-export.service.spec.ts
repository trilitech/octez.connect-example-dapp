import { BUILTIN_NETWORKS } from '../network.config'
import { PlaygroundRun } from '../tests/test-types'
import { ReportExportService } from './report-export.service'

function shadownetRun(hash: string): PlaygroundRun {
  return {
    runNumber: 1,
    startedAt: '2026-06-17T00:00:00.000Z',
    endedAt: '2026-06-17T00:00:01.000Z',
    sdkVersion: '4.8.5',
    network: 'shadownet',
    passCount: 1,
    failCount: 0,
    totalCount: 1,
    results: [
      {
        testId: 'core.send-tez',
        title: 'Send tez',
        category: 'core',
        status: 'success',
        startedAt: '2026-06-17T00:00:00.000Z',
        endedAt: '2026-06-17T00:00:01.000Z',
        durationMs: 1000,
        txHash: hash,
        explorerUrl: `https://shadownet.tzkt.io/${hash}`
      }
    ]
  }
}

describe('ReportExportService', () => {
  const service = new ReportExportService()

  it('renders an op hash as a tzkt link in the Markdown report (shadownet)', () => {
    const hash = 'op123abc'
    const md = service.buildMarkdownReport(shadownetRun(hash), BUILTIN_NETWORKS['shadownet'])
    expect(md).toContain(`[${hash}](https://shadownet.tzkt.io/${hash})`)
  })

  it('produces a JSON report whose meta.runNumber matches the run', () => {
    const json = JSON.parse(service.buildJsonReport(shadownetRun('opX'), BUILTIN_NETWORKS['shadownet']))
    expect(json.meta.runNumber).toBe(1)
    expect(json.results.length).toBe(1)
  })
})
