# Phase 1 — Data Model

Concrete shapes for every entity in spec §Key Entities, expressed as TypeScript-style interfaces. All identifiers are stable contract names referenced from `contracts/test-registry-types.md` and from `tasks.md` downstream.

## 1. NetworkConfig

The single source of truth driving the SDK client, RPC reads, indexer lookups, explorer rendering, and per-test default contract addresses.

```ts
type NetworkName = 'mainnet' | 'shadownet'

type ContractRole = 'counter' | 'fa2-transfer' | 'fa2-balance'

interface NetworkConfig {
  name: NetworkName                                  // 'mainnet' | 'shadownet'
  sdkNetworkType: 'mainnet' | 'shadownet'            // string literal passed to the SDK at client construction (per FR-054)
  rpc: string                                        // e.g. 'https://tezos-shadownet.octez.io'
  indexer: string                                    // explorer UI base, e.g. 'https://shadownet.tzkt.io'
  api: string                                        // indexer REST API base, e.g. 'https://api.shadownet.tzkt.io'
  contractDefaults: Record<ContractRole, string | null>
}

const NETWORKS: Record<NetworkName, NetworkConfig> = {
  mainnet: {
    name: 'mainnet',
    sdkNetworkType: 'mainnet',
    rpc:     'https://tezos-mainnet.octez.io',
    indexer: 'https://tzkt.io',
    api:     'https://api.tzkt.io',
    contractDefaults: {
      'counter':      null,                           // user will deploy (memory: mainnet-counter-deploy)
      'fa2-transfer': null,                           // user-to-pick (memory: mainnet-fa2-default-open)
      'fa2-balance':  null,
    },
  },
  shadownet: {
    name: 'shadownet',
    sdkNetworkType: 'shadownet',
    rpc:     'https://tezos-shadownet.octez.io',
    indexer: 'https://shadownet.tzkt.io',
    api:     'https://api.shadownet.tzkt.io',
    contractDefaults: {
      'counter':      'KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA',
      'fa2-transfer': null,                           // optional: populate if a Shadownet FA2 is identified
      'fa2-balance':  null,
    },
  },
}
```

**Validation rules**:
- `rpc`, `indexer`, `api` are absolute URLs without trailing slash. The services use `${base}/<path>`.
- `contractDefaults[role]` is a `KT1...` address (length 36) or `null`.
- Adding a new network requires only a new entry in `NETWORKS`; no callsite changes.

**State transitions**: a NetworkConfig is immutable. The "active network" is a `BehaviorSubject<NetworkName>` in a Network service; the resolved `NetworkConfig` is derived (`NETWORKS[name]`).

---

## 2. ContractDefault (derived from NetworkConfig)

Not a separate persisted entity — represented as the `contractDefaults` map on `NetworkConfig`. Lookup helper:

```ts
function getContractDefault(network: NetworkName, role: ContractRole): string | null {
  return NETWORKS[network].contractDefaults[role]
}
```

**Used by**: `TestInput` resolvers (FR-022); `Run all (full)` skip logic (FR-042).

---

## 3. TestDefinition

Static metadata for one playground test card.

```ts
type TestCategory = 'core' | 'staking' | 'contracts' | 'crypto' | 'tokens' | 'view-data'
type RequiredScope = 'octez-connect' | 'rpc-read' | 'both' | 'none'
type TestStatus    = 'idle' | 'running' | 'queued' | 'success' | 'error'

type InputType = 'text' | 'number' | 'boolean' | 'textarea' | 'json'

interface TestInput {
  key: string                                         // unique within the test
  label: string                                       // human-readable label for the card
  type: InputType
  placeholder?: string
  help?: string
  default?: unknown                                   // static default
  defaultFromNetwork?: ContractRole                   // optional: resolve default from active NetworkConfig.contractDefaults
}

interface TestDefinition {
  id: string                                          // stable, e.g. 'core.send-tez'
  title: string
  category: TestCategory
  description: string
  requiredScope: RequiredScope
  safeForRunAll: boolean                              // included in Run all (safe) when enabled
  enabled: boolean                                    // false → renders as a disabled stub card
  disabledReason?: string                             // shown when enabled === false
  inputs: TestInput[]
  run: (ctx: TestContext) => Promise<TestRunOutput>   // see §5/§6
}
```

**Validation rules**:
- `id` is unique across all tests in `ALL_TESTS`.
- If `enabled === false`, `disabledReason` MUST be set; the runner skips the test entirely.
- `defaultFromNetwork` takes precedence over `default` when both are set (used for contract-address inputs).

**State transitions** (TestStatus): `idle → queued? → running → (success | error) → idle (on reset)`.

---

## 4. TestContext

Per-run input bundle handed to a test's `run` function.

```ts
interface TestContext {
  client: DAppClient                                  // type-only import; runtime value from SdkLoaderService
  rpc: RpcService                                     // HttpClient wrapper over active NetworkConfig.rpc
  indexer: IndexerService                             // HttpClient wrapper over active NetworkConfig.api
  account?: AccountInfo                               // present only for wallet-scope tests when a wallet is connected
  inputs: Record<string, unknown>                     // user-edited input values keyed by TestInput.key
  network: NetworkConfig                              // resolved snapshot of the active network at run start
}
```

**Validation rules**:
- `client` is the **currently loaded SDK's** `DAppClient` instance; the runner does not pass a stale client across SDK switches (since SDK switches reload the page).
- `account` is `undefined` for `requiredScope: 'rpc-read'` or `'none'` tests, and SHOULD be defined for `'octez-connect'` or `'both'` tests (the runner won't call `run()` if a wallet-required test has no account).

---

## 5. TestRunOutput

The return shape of a successful `TestDefinition.run`.

```ts
interface TestRunOutput {
  request: unknown                                    // the structured request submitted (operation payload, RPC URL+params, sign payload, etc.)
  response: unknown                                   // the structured response received
  txHash?: string                                     // when the operation produced a hash
  signature?: string                                  // when a payload was signed
  summary?: string                                    // 1-line human summary for the card / report
}
```

**Validation rules**:
- `request` and `response` are JSON-serializable (the report exports them via `JSON.stringify`).
- `txHash`, if set, MUST be the operation hash returned by the SDK (`opHash`) so the explorer link resolves.

---

## 6. TestResult

A test execution snapshot, stored per-card (last-result) and inside each numbered run.

```ts
interface TestResult {
  testId: string                                      // matches TestDefinition.id
  title: string                                       // denormalized for the report
  category: TestCategory
  status: TestStatus                                  // 'success' | 'error' at rest; 'running' transiently
  startedAt: string                                   // ISO8601
  endedAt: string                                     // ISO8601
  durationMs: number                                  // endedAt - startedAt in milliseconds

  request?: unknown                                   // from TestRunOutput
  response?: unknown                                  // from TestRunOutput
  txHash?: string
  signature?: string
  summary?: string
  explorerUrl?: string                                // derived: getExplorerLinkForTxHash(network, txHash)

  error?: string                                      // present only when status === 'error'
}
```

**Validation rules**:
- `status === 'success'` ⇒ `error` is absent.
- `status === 'error'`   ⇒ `request` is still populated for debugging (per FR-016).
- `explorerUrl` is computed at result-recording time, not at render time, so the report's link is stable even if the network toggle later changes.

---

## 7. PlaygroundRun

A numbered batch of test executions produced by `Run all (safe)` or `Run all (full)`. Persisted to `localStorage`.

```ts
interface PlaygroundRun {
  runNumber: number                                   // monotonically increasing; never reused
  runType: 'safe' | 'full'
  startedAt: string                                   // ISO8601
  endedAt: string                                     // ISO8601
  sdkVersion: string                                  // active SDK version during the run (e.g. '4.8.5')
  network: NetworkName                                // active network during the run
  walletAddress?: string                              // active account address, if any
  passCount: number
  failCount: number
  totalCount: number                                  // tests included (excludes disabled stubs)
  results: TestResult[]                               // one entry per included test, in execution order
}
```

**Validation rules**:
- `passCount + failCount === totalCount`.
- `results.length === totalCount`.
- `runNumber` is unique within the persisted history; computed as `max(existing runNumbers, 0) + 1` at creation time.

**Lifecycle**:
- Created when a Run-all starts (after Mainnet-confirm passes, if applicable).
- Mutated in-place as tests complete during the run.
- Frozen and persisted to `localStorage` once `endedAt` is set.
- Deleted only by per-run ✕ (FR-060) or Clear-all (FR-061).

---

## 8. PlaygroundReport

The exportable artifact derived from a single `PlaygroundRun`.

```ts
interface PlaygroundReport {
  meta: {
    runNumber: number
    generatedAt: string                               // ISO8601 of the export action (not the run)
    network: NetworkName
    rpcUrl: string
    indexerApi: string
    walletAddress?: string
    sdkVersion: string
    beaconId?: string                                 // optional, if exposed by the SDK
    dappVersion: string                               // from package.json
  }
  results: TestResult[]                               // taken verbatim from the source PlaygroundRun
}
```

**Validation rules**: a `PlaygroundReport` is derived from exactly one `PlaygroundRun` (`meta.runNumber` matches). No cross-run aggregation.

---

## 9. SdkSelection

The user's chosen runtime SDK version.

```ts
interface SdkSelection {
  version: string                                     // semver string OR a custom user-supplied value
  source: 'default' | 'localStorage' | 'fallback'    // for the version-badge display
}
```

Stored as a plain string under `localStorage['octez.connect.version']`. The `source` is derived at boot:
- `'localStorage'` if a value was found;
- `'default'` (`'4.8.5'`) if no value was found;
- `'fallback'` if the dynamic load fell back to the bundled package — in this case `version` is set to the bundled `package.json` version.

---

## 10. EntrypointDescriptor

Indexer-supplied (or RPC-fallback-supplied) descriptor of one callable contract entrypoint.

```ts
interface EntrypointDescriptor {
  name: string                                        // e.g. 'increment', 'transfer'
  jsonParameterSchema: unknown                        // indexer schema (Micheline-JSON) for the parameter; null if unknown
  rawMicheline?: unknown                              // RPC fallback returns Micheline types; kept for display when JSON schema unavailable
}
```

**Validation rules**: at least one of `jsonParameterSchema` or `rawMicheline` MUST be present. The dynamic-contract panel uses `jsonParameterSchema` to seed the textarea; if missing, it shows the `rawMicheline` as read-only documentation.

---

## 11. `localStorage` schema (consolidated)

| Key | Value | Producer | Consumer |
|---|---|---|---|
| `octez.connect.version` | string (semver) | `WalletControlComponent` version selector | `SdkLoaderService.load()` at boot |
| `octez.connect.run-history` | JSON-stringified `PlaygroundRun[]` (newest last; ≤50 entries) | `TestRunnerService` after each run-all completes / on ✕ / on Clear-all | `TestRunnerService.rehydrate()` at boot |

Both keys are namespaced under `octez.connect.*` so they are easy to find and clear in dev tools.

---

## 12. Cross-entity dependency diagram

```text
NetworkConfig ──┐
                │
                ├──> RpcService ─────┐
                │                    │
                ├──> IndexerService ─┤
                │                    │
                ├──> Explorer util ──┘
                │
                └──> TestInput (defaultFromNetwork)

SdkSelection ──> SdkLoaderService ──> DAppClient (runtime) ──> BeaconService ─┐
                                                                              │
TestDefinition ──> ALL_TESTS ──┐                                              │
                                ├──> TestRunnerService.run(testId, inputs)  ──┤
TestContext (assembled per run)┘                                              │
                                                                              │
TestRunnerService ──> TestResult (per-card) ──> TestCardComponent              │
TestRunnerService ──> PlaygroundRun (per run-all) ──> RunHistoryComponent ────┘
PlaygroundRun ──> ReportExportService ──> PlaygroundReport (Markdown / JSON / clipboard)
```
