import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import type { AccountInfo } from '@tezos-x/octez.connect-dapp'
import { Subscription } from 'rxjs'
import { map } from 'rxjs/operators'

import { BeaconService } from '../../../services/beacon/beacon.service'
import { NetworkConfig } from '../../network.config'
import { NetworkService } from '../../services/network.service'
import { TestRunnerService } from '../../services/test-runner.service'
import { TestDefinition, TestResult } from '../../tests/test-types'

@Component({
  selector: 'pg-test-card',
  templateUrl: './test-card.component.html',
  styleUrls: ['./test-card.component.scss']
})
export class TestCardComponent implements OnInit, OnDestroy {
  @Input() public def!: TestDefinition

  public inputs: Record<string, unknown> = {}
  public result: TestResult | undefined
  public account: AccountInfo | undefined
  public network!: NetworkConfig

  public showRequest = false
  public showResponse = false

  // Track which input keys the user has manually edited so a network toggle
  // doesn't clobber their entered value.
  private readonly userEdited = new Set<string>()

  private readonly subs = new Subscription()

  constructor(
    private readonly testRunner: TestRunnerService,
    private readonly networkService: NetworkService,
    private readonly beaconService: BeaconService
  ) {}

  public ngOnInit(): void {
    this.network = this.networkService.getActive()
    this.seedDefaults()

    // Re-seed on network toggle for inputs the user hasn't manually edited.
    this.subs.add(
      this.networkService.active$.subscribe((cfg) => {
        this.network = cfg
        this.seedDefaults({ preserveEdited: true })
      })
    )

    this.subs.add(
      this.beaconService.activeAccount$.subscribe((a) => {
        this.account = a
      })
    )

    this.subs.add(
      this.testRunner.results$
        .pipe(map((map_) => map_[this.def.id]))
        .subscribe((r) => {
          this.result = r
        })
    )
  }

  public ngOnDestroy(): void {
    this.subs.unsubscribe()
  }

  public onInputChange(key: string): void {
    this.userEdited.add(key)
  }

  public canRun(): boolean {
    if (!this.def.enabled) return false
    if (this.result?.status === 'running' || this.result?.status === 'queued') return false
    const needsWallet = this.def.requiredScope === 'octez-connect' || this.def.requiredScope === 'both'
    if (needsWallet && !this.account) return false
    return true
  }

  public runDisabledReason(): string | undefined {
    if (!this.def.enabled) return this.def.disabledReason
    if (this.result?.status === 'running') return 'Running…'
    if (this.result?.status === 'queued') return 'Queued — waiting for current Run-all to finish'
    const needsWallet = this.def.requiredScope === 'octez-connect' || this.def.requiredScope === 'both'
    if (needsWallet && !this.account) return 'Connect a wallet first'
    return undefined
  }

  public async run(): Promise<void> {
    await this.testRunner.run(this.def, { ...this.inputs })
  }

  public reset(): void {
    this.testRunner.reset(this.def.id)
    this.showRequest = false
    this.showResponse = false
  }

  public statusBadgeColor(): string {
    switch (this.result?.status) {
      case 'running':
        return 'warning'
      case 'queued':
        return 'tertiary'
      case 'success':
        return 'success'
      case 'error':
        return 'danger'
      default:
        return 'medium'
    }
  }

  public scopeChipLabel(): string {
    switch (this.def.requiredScope) {
      case 'octez-connect':
        return 'wallet'
      case 'rpc-read':
        return 'rpc'
      case 'both':
        return 'wallet + rpc'
      default:
        return 'none'
    }
  }

  public async copyResult(): Promise<void> {
    if (!this.result) return
    const content = JSON.stringify(this.result, null, 2)
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      this.copyFallback(content)
    }
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

  private seedDefaults(opts?: { preserveEdited?: boolean }): void {
    const next: Record<string, unknown> = { ...this.inputs }
    for (const input of this.def.inputs) {
      if (opts?.preserveEdited && this.userEdited.has(input.key)) continue
      if (input.defaultFromNetwork) {
        const v = this.network.contractDefaults[input.defaultFromNetwork]
        next[input.key] = v ?? ''
      } else if (input.default !== undefined) {
        next[input.key] = input.default
      } else if (next[input.key] === undefined) {
        next[input.key] = input.type === 'boolean' ? false : input.type === 'number' ? 0 : ''
      }
    }
    this.inputs = next
  }

  public missingNetworkDefaultHint(key: string): string | undefined {
    const input = this.def.inputs.find((i) => i.key === key)
    if (!input?.defaultFromNetwork) return undefined
    const v = this.network.contractDefaults[input.defaultFromNetwork]
    if (v === null) {
      return `No default registered for ${this.network.name} — paste a contract address.`
    }
    return undefined
  }
}
