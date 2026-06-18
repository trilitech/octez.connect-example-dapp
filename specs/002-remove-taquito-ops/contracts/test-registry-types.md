# Contract: Test Registry Types (002 delta)

Supersedes the changed parts of `specs/001-playground-upgrade/contracts/test-registry-types.md`. The interface lives in `src/app/playground/tests/test-types.ts`.

## TestCategory

```ts
export type TestCategory = 'core' | 'staking' | 'contracts' | 'crypto' | 'tokens'
// 'view-data' REMOVED
```

## TestDefinition

```ts
export interface TestDefinition {
  id: string
  title: string
  category: TestCategory
  description: string
  requiredScope: RequiredScope   // active tests are 'octez-connect' (or 'both')
  // safeForRunAll: boolean       ← REMOVED
  enabled: boolean
  disabledReason?: string
  inputs: TestInput[]
  run: (ctx: TestContext) => Promise<TestRunOutput>
}
```

**Contract rules**:
- No member of `ALL_TESTS` may have `requiredScope === 'rpc-read'`.
- No member of `ALL_TESTS` may have `category === 'view-data'`.
- `safeForRunAll` must not appear on any test literal or be referenced anywhere in `src/`.

## PlaygroundRun

```ts
export interface PlaygroundRun {
  runNumber: number
  runType?: string           // legacy-tolerant; not meaningfully written by new runs
  startedAt: string
  endedAt: string
  sdkVersion: string         // expected '4.8.6' after this feature
  network: 'mainnet' | 'shadownet'
  walletAddress?: string
  passCount: number
  failCount: number
  totalCount: number
  results: TestResult[]
}
```

**Contract rules**:
- Rehydrating a `PlaygroundRun` with `runType: 'safe'` or with `results[].testId` referencing a removed test MUST NOT throw (FR-006).
- Consumers (run-history display, report export) MUST NOT branch on `runType === 'safe' | 'full'` in a way that errors when the value is absent/other.

## TestRunnerService (public surface delta)

```ts
// REMOVED: runAllSafe(): Promise<void>
// KEPT (single run-all):
runAll(): Promise<void>                 // runs all enabled tests
// inFlightRunAll$ narrows from ('safe' | 'full' | null) to (boolean) or (null | true)
inFlightRunAll$: BehaviorSubject<boolean>
```

**Contract rules**:
- Exactly one run-all entry point remains.
- The mainnet confirmation (FR-005) MUST still fire before submitting on mainnet; its "mutating" count is derived from `requiredScope` (wallet-scoped), not `safeForRunAll`.
