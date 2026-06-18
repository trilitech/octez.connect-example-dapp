// Test registry shapes. The authoritative interface contract for everything
// under `src/app/playground/tests/`. See:
//   specs/001-playground-upgrade/contracts/test-registry-types.md
//   specs/001-playground-upgrade/data-model.md
//
// Test handlers MUST use string-literal SDK constants ('transaction',
// 'delegation', 'origination', 'micheline', 'raw') — never runtime SDK enum
// imports — so the registry stays version-agnostic (FR-054).

import type { AccountInfo, DAppClient } from '@tezos-x/octez.connect-dapp'

import { ContractRole, NetworkConfig } from '../network.config'
import { IndexerService } from '../services/indexer.service'
import { RpcService } from '../services/rpc.service'

export type TestCategory = 'core' | 'staking' | 'contracts' | 'crypto' | 'tokens'
export type RequiredScope = 'octez-connect' | 'rpc-read' | 'both' | 'none'
export type TestStatus = 'idle' | 'running' | 'queued' | 'success' | 'error'
export type InputType = 'text' | 'number' | 'boolean' | 'textarea' | 'json'

export interface TestInput {
  key: string
  label: string
  type: InputType
  placeholder?: string
  help?: string
  default?: unknown
  // Resolve the default from the active NetworkConfig.contractDefaults[role].
  // Takes precedence over `default` when both are set.
  defaultFromNetwork?: ContractRole
}

export interface TestContext {
  client: DAppClient
  rpc: RpcService
  indexer: IndexerService
  account?: AccountInfo
  inputs: Record<string, unknown>
  network: NetworkConfig
}

export interface TestRunOutput {
  request: unknown
  response: unknown
  txHash?: string
  signature?: string
  summary?: string
  // An address produced by the operation (e.g. an originated KT1). The runner
  // derives an explorer link from the active NetworkConfig at record time.
  originatedAddress?: string
}

export interface TestDefinition {
  id: string
  title: string
  category: TestCategory
  description: string
  requiredScope: RequiredScope
  enabled: boolean
  disabledReason?: string
  inputs: TestInput[]
  run: (ctx: TestContext) => Promise<TestRunOutput>
}

export interface TestResult {
  testId: string
  title: string
  category: TestCategory
  status: TestStatus
  startedAt: string
  endedAt: string
  durationMs: number
  request?: unknown
  response?: unknown
  txHash?: string
  signature?: string
  summary?: string
  explorerUrl?: string
  originatedAddress?: string
  originatedAddressUrl?: string
  error?: string
}

export interface PlaygroundRun {
  runNumber: number
  // Legacy-tolerant: pre-002 runs persisted 'safe' | 'full'. New runs no longer
  // distinguish a run type (the safe-run mode was removed), so this is optional
  // and consumers must not assume a specific value (002 FR-006).
  runType?: string
  startedAt: string
  endedAt: string
  sdkVersion: string
  network: 'mainnet' | 'shadownet'
  walletAddress?: string
  passCount: number
  failCount: number
  totalCount: number
  results: TestResult[]
}
