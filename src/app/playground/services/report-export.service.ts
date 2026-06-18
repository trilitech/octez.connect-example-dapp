// Builds and exports a shareable report for a single numbered PlaygroundRun.
// Markdown layout per research §R13; JSON shape per data-model §8 (PlaygroundReport).
// No new dependencies: download via Blob + object URL + hidden anchor; clipboard
// via navigator.clipboard with a hidden-textarea fallback (research §R14).

import { Injectable } from '@angular/core'

import { getExplorerLinkForTxHash } from '../../utils/explorer'
import { CATEGORY_META } from '../tests'
import { TestCategory, PlaygroundRun, TestResult } from '../tests/test-types'
import { NetworkConfig } from '../network.config'

// Mirrors package.json "version". Kept as a constant because resolveJsonModule
// is not enabled in this project's tsconfig.
const DAPP_VERSION = '1.0.0'

export interface PlaygroundReportMeta {
  runNumber: number
  generatedAt: string
  network: string
  rpcUrl: string
  indexerApi: string
  walletAddress?: string
  sdkVersion: string
  dappVersion: string
}

export interface PlaygroundReport {
  meta: PlaygroundReportMeta
  results: TestResult[]
}

@Injectable({ providedIn: 'root' })
export class ReportExportService {
  public buildReport(run: PlaygroundRun, network: NetworkConfig): PlaygroundReport {
    return {
      meta: {
        runNumber: run.runNumber,
        generatedAt: new Date().toISOString(),
        network: network.name,
        rpcUrl: network.rpc,
        indexerApi: network.api,
        walletAddress: run.walletAddress,
        sdkVersion: run.sdkVersion,
        dappVersion: DAPP_VERSION
      },
      results: run.results
    }
  }

  public buildJsonReport(run: PlaygroundRun, network: NetworkConfig): string {
    return JSON.stringify(this.buildReport(run, network), null, 2)
  }

  public buildMarkdownReport(run: PlaygroundRun, network: NetworkConfig): string {
    const lines: string[] = []
    lines.push(`# octez.connect Playground Report — RUN ${run.runNumber}`)
    lines.push('')
    lines.push('| Field | Value |')
    lines.push('|-------|-------|')
    lines.push(`| Generated at | ${new Date().toISOString()} |`)
    // Legacy runs (pre-002) carried a 'safe' | 'full' run type; new runs don't.
    if (run.runType) lines.push(`| Run type | ${run.runType} |`)
    lines.push(`| Network | ${network.name} |`)
    lines.push(`| RPC URL | ${network.rpc} |`)
    lines.push(`| Indexer API | ${network.api} |`)
    lines.push(`| Wallet | ${run.walletAddress ?? '(none)'} |`)
    lines.push(`| SDK version | ${run.sdkVersion} |`)
    lines.push(`| dApp version | ${DAPP_VERSION} |`)
    lines.push(`| Total | ${run.passCount}/${run.totalCount} passed |`)
    lines.push('')

    // Group results by category, preserving execution order within a category.
    const byCategory = new Map<TestCategory, TestResult[]>()
    for (const r of run.results) {
      const list = byCategory.get(r.category) ?? []
      list.push(r)
      byCategory.set(r.category, list)
    }

    const failingBlocks: string[] = []

    for (const [category, results] of byCategory) {
      const label = CATEGORY_META[category]?.label ?? category
      lines.push(`## ${label}`)
      lines.push('')
      lines.push('| Test | Status | Duration | Op hash / Result |')
      lines.push('|------|--------|----------|------------------|')
      for (const r of results) {
        const last = this.lastColumn(r, network)
        lines.push(`| ${this.escapeCell(r.title)} | ${r.status} | ${r.durationMs} ms | ${last} |`)
        if (r.status === 'error') {
          failingBlocks.push(this.failingBlock(r))
        }
      }
      lines.push('')
    }

    if (failingBlocks.length > 0) {
      lines.push('## Failing test details')
      lines.push('')
      lines.push(...failingBlocks)
    }

    return lines.join('\n')
  }

  public downloadMarkdown(name: string, content: string): void {
    this.download(name, content, 'text/markdown')
  }

  public downloadJson(name: string, content: string): void {
    this.download(name, content, 'application/json')
  }

  public async copyToClipboard(content: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      this.copyFallback(content)
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private lastColumn(r: TestResult, network: NetworkConfig): string {
    if (r.status === 'error') return this.escapeCell(r.error ?? 'error')
    if (r.txHash) {
      const url = r.explorerUrl ?? getExplorerLinkForTxHash(network, r.txHash)
      return `[${r.txHash}](${url})`
    }
    if (r.signature) return `\`${r.signature.slice(0, 24)}…\``
    return this.escapeCell(r.summary ?? 'ok')
  }

  private failingBlock(r: TestResult): string {
    const payload = { request: r.request, response: r.response, error: r.error }
    return [
      `### ${r.title} (${r.testId})`,
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
      ''
    ].join('\n')
  }

  private escapeCell(value: string): string {
    return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  }

  private download(name: string, content: string, type: string): void {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private copyFallback(content: string): void {
    const ta = document.createElement('textarea')
    ta.value = content
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(ta)
    }
  }
}
