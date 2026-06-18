import { Component, OnDestroy, OnInit } from '@angular/core'
import { Subscription } from 'rxjs'

import { NetworkConfig } from '../../network.config'
import { NetworkService } from '../../services/network.service'
import { ReportExportService } from '../../services/report-export.service'
import { TestRunnerService } from '../../services/test-runner.service'
import { PlaygroundRun, TestResult } from '../../tests/test-types'

@Component({
  selector: 'pg-run-history',
  templateUrl: './run-history.component.html',
  styleUrls: ['./run-history.component.scss']
})
export class RunHistoryComponent implements OnInit, OnDestroy {
  public runs: PlaygroundRun[] = []
  public activeNetwork!: NetworkConfig

  // Track which (runNumber, testId, field) JSON blocks are expanded.
  private readonly expanded = new Set<string>()

  private readonly subs = new Subscription()

  constructor(
    private readonly testRunner: TestRunnerService,
    private readonly reportExport: ReportExportService,
    private readonly networkService: NetworkService
  ) {}

  public ngOnInit(): void {
    this.activeNetwork = this.networkService.getActive()
    this.subs.add(
      // Newest run first in the panel.
      this.testRunner.runs$.subscribe((runs) => {
        this.runs = [...runs].sort((a, b) => b.runNumber - a.runNumber)
      })
    )
    this.subs.add(this.networkService.active$.subscribe((cfg) => (this.activeNetwork = cfg)))
  }

  public ngOnDestroy(): void {
    this.subs.unsubscribe()
  }

  public trackByRunNumber(_i: number, run: PlaygroundRun): number {
    return run.runNumber
  }

  public trackByResult(i: number, r: TestResult): string {
    return `${r.testId}#${i}`
  }

  public statusColor(status: TestResult['status']): string {
    switch (status) {
      case 'success':
        return 'success'
      case 'error':
        return 'danger'
      case 'running':
        return 'warning'
      case 'queued':
        return 'tertiary'
      default:
        return 'medium'
    }
  }

  public deleteRun(runNumber: number, ev: Event): void {
    ev.stopPropagation()
    this.testRunner.deleteRun(runNumber)
  }

  public clearAll(): void {
    this.testRunner.clearAllRuns()
  }

  // ── per-run export actions ──────────────────────────────────────────────

  public exportMarkdown(run: PlaygroundRun): void {
    const network = this.networkForRun(run)
    const content = this.reportExport.buildMarkdownReport(run, network)
    this.reportExport.downloadMarkdown(`octez-connect-run-${run.runNumber}.md`, content)
  }

  public exportJson(run: PlaygroundRun): void {
    const network = this.networkForRun(run)
    const content = this.reportExport.buildJsonReport(run, network)
    this.reportExport.downloadJson(`octez-connect-run-${run.runNumber}.json`, content)
  }

  public async copyReport(run: PlaygroundRun): Promise<void> {
    const network = this.networkForRun(run)
    await this.reportExport.copyToClipboard(this.reportExport.buildMarkdownReport(run, network))
  }

  // ── JSON collapsibles ─────────────────────────────────────────────────────

  public toggle(runNumber: number, index: number, field: 'request' | 'response'): void {
    const key = this.key(runNumber, index, field)
    if (this.expanded.has(key)) this.expanded.delete(key)
    else this.expanded.add(key)
  }

  public isExpanded(runNumber: number, index: number, field: 'request' | 'response'): boolean {
    return this.expanded.has(this.key(runNumber, index, field))
  }

  // Resolve the NetworkConfig matching the run's recorded network so reports
  // stay correct even if the user has since toggled networks.
  private networkForRun(run: PlaygroundRun): NetworkConfig {
    return (
      this.networkService.getAvailable().find((n) => n.name === run.network) ?? this.activeNetwork
    )
  }

  private key(runNumber: number, index: number, field: string): string {
    return `${runNumber}:${index}:${field}`
  }
}
