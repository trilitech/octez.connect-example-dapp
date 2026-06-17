---
description: "Task list for octez.connect Example dApp → Test Playground (feature 001-playground-upgrade)"
---

# Tasks: octez.connect Example dApp → Test Playground

**Input**: Design documents from `specs/001-playground-upgrade/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Unit tests for pure helpers and the runner queue are scoped to the Polish phase (per `research.md` §R20). Functional verification is manual against live wallets/networks via the recipe in `quickstart.md` §3. No TDD up-front gate.

**Organization**: tasks are grouped by user story so each story can be implemented and verified independently. Within a story, parallel-safe tasks are marked `[P]`.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: different file, no dependency on a still-incomplete task → can run concurrently.
- **[Story]**: which user story this task belongs to (US1 → US8 from spec.md); omitted in Setup, Foundational, and Polish.

## Path Conventions

Single Angular/Ionic app — all source lives under `src/`. New code goes in `src/app/playground/` (lazy-loaded at `''`) and `src/app/utils/`. Existing files modified: `src/app/app-routing.module.ts`, `src/app/services/beacon/beacon.service.ts`, and optionally `src/app/components/sample-contract/sample-contract.component.ts`. The marketing home stays at `src/app/pages/home/` (now lazy at `/legacy`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: scaffold new directories and confirm no new dependencies are required.

- [X] T001 Create the playground directory tree: `src/app/playground/`, `src/app/playground/components/{wallet-control,test-card,run-history,contract-explorer}/`, `src/app/playground/services/`, `src/app/playground/tests/`, `src/app/utils/`. No file contents yet — just empty folders ready for subsequent tasks. *(Service / page / utils dirs created on-demand by Write; component sub-dirs land in their respective phases.)*
- [X] T002 [P] Confirm `package.json` requires no additions for this feature: `HttpClientModule` and `IonicStorageModule` are already imported in `src/app/app.module.ts`; the global `Buffer` polyfill is present; `@tezos-x/octez.connect-dapp@4.8.5` is the bundled fallback. Document this confirmation as a one-line comment in the top of `src/app/playground/playground.module.ts` once that file is created (T015). *(Comment added at the top of `playground.module.ts`.)*
- [X] T003 [P] Add a `clean-history` helper note to `README.md` (optional): a one-line mention that the playground persists run history in `localStorage['octez.connect.run-history']` and the SDK selection in `localStorage['octez.connect.version']`, so users know where to clear state for debugging. *(Skipped in this checkpoint — pickup in Polish.)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: services and types every user story depends on. Must complete before any user story phase begins.

**⚠️ CRITICAL**: No user story work can start until this phase is complete.

- [X] T004 [P] Create `src/app/utils/sign-payload.ts` exporting `buildSignPayload(message: string, signingType?: 'micheline' | 'raw' | 'operation'): { payload: string; signingType: 'micheline' | 'raw' | 'operation' }`. Use the global `Buffer` polyfill for UTF-8 byte length per FR-006. MICHELINE/RAW framing: `'05' + '01' + <4-byte BE length, 8 hex chars> + <utf8 hex>`. OPERATION framing: ensure leading `'03'`. Default signingType = `'micheline'`. (per research.md §R4)
- [X] T005 [P] Create `src/app/playground/network.config.ts` defining `type NetworkName = 'mainnet' | 'shadownet'`, `type ContractRole = 'counter' | 'fa2-transfer' | 'fa2-balance'`, the `NetworkConfig` interface, and the `NETWORKS` constant exactly as specified in data-model.md §1. Shadownet `counter` = `'KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA'`; all other `contractDefaults` = `null`. Export a helper `getContractDefault(network, role): string | null`.
- [X] T006 [P] Create `src/app/utils/explorer.ts` exporting `getExplorerLinkForAddress(network: NetworkConfig, addr: string): string` and `getExplorerLinkForTxHash(network: NetworkConfig, hash: string): string` — both compose URLs against `network.indexer` (not by guessing from a name string).
- [X] T007 [P] Create `src/app/playground/services/sdk-loader.service.ts` implementing the contract in `contracts/sdk-module-surface.md`. Use the bundler-opaque dynamic import (`new Function('u','return import(u)')`) and `Promise.race` against a 10-second timeout. On error/timeout, fall back to a static `import('@tezos-x/octez.connect-dapp')` and surface a toast via Ionic `ToastController`. Cache the resolved module as a singleton. Exposes `load(): Promise<SdkModule>`, `setVersion(version): void` (writes `localStorage['octez.connect.version']` and calls `window.location.reload()`), and `getActiveVersion(): { version, source }`. (research.md §R1, §R2, §R3)
- [X] T008 [P] Create `src/app/playground/services/rpc.service.ts` injecting Angular `HttpClient`. Reads the active `NetworkConfig.rpc` from a network state subject (added in T013). Exposes `url(path)`, `get<T>(path)`, `post<T>(path, body)`. Re-reads the base URL on every call so a mid-test network toggle is honored. (contracts/rpc-endpoints.md)
- [X] T009 [P] Create `src/app/playground/services/indexer.service.ts` injecting Angular `HttpClient`. Reads the active `NetworkConfig.api`. Exposes `getEntrypoints(kt): Promise<EntrypointDescriptor[]>` (TzKT primary, RPC fallback per FR-033), `getContract(kt)`, `getOperation(hash)`, `findOriginatedKt(hash): Promise<string | null>` (polls `/v1/operations/originations` for ~30s). (contracts/indexer-endpoints.md)
- [X] T010 [P] Create `src/app/playground/tests/test-types.ts` exporting `TestCategory`, `RequiredScope`, `TestStatus`, `InputType`, `TestInput`, `TestContext`, `TestRunOutput`, `TestDefinition` interfaces exactly per `contracts/test-registry-types.md`. Also export the empty `ContractRole` union from `network.config.ts` for use by `TestInput.defaultFromNetwork`. *(Also exports `TestResult` and `PlaygroundRun` here to keep all registry types in one file.)*
- [X] T011 Refactor `src/app/services/beacon/beacon.service.ts` to async-init via `SdkLoaderService`. *(Includes the US1 methods T017–T020 — connect/disconnect/getRpcUrl/restoreActiveAccount baked into the rewrite.)*
- [X] T012 Create `src/app/playground/services/test-runner.service.ts` skeleton. *(runAllSafe/runAllFull/deleteRun/clearAllRuns left as no-op stubs — full bodies in US4 phase.)*
- [X] T013 Create `src/app/playground/services/network.service.ts` (lightweight): `selected$`, `active$`, `getSelected/setSelected/getActive`, localStorage persistence under `octez.connect.network`.
- [X] T014 Modify `src/app/app-routing.module.ts`: `''` → PlaygroundModule lazy; `legacy` → HomePageModule lazy; `**` wildcard kept last.
- [X] T015 Create `src/app/playground/playground.module.ts` (NgModule).
- [X] T016 Create the empty `playground.page.ts/.html/.scss` files in `src/app/playground/`. Page awaits `beaconService.whenReady()` in `ngOnInit`, gates content with a spinner until resolved, shows the SDK-version badge.

**Checkpoint**: services + types + module skeleton + routing in place. User story phases unblocked.

---

## Phase 3: User Story 1 — Reliable wallet session (P1) 🎯 MVP-floor

**Goal**: fix the three bugs (reconnect re-shows pairing UI, lost session on reload, sign-payload encoding error). After this phase, the dapp at `/legacy` (the marketing home, still routed) demonstrates correct connect/disconnect/reload/sign behavior using the refactored `BeaconService`.

**Independent Test**: per quickstart.md §3 rows SC-001, SC-002, SC-003: connect → reload (session persists, no pairing UI) → click Connect (no-op) → sign `test` (wallet receives `0501000000…74657374`, returns signature) → Disconnect (UI collapses).

- [X] T017 [US1] Implement `BeaconService.connect(networkType?, name?, rpcUrl?)`. *(Done as part of T011 rewrite.)*
- [X] T018 [US1] Implement `BeaconService.restoreActiveAccount()`. *(Done as part of T011 rewrite; called from `init()` and `reinitClient`.)*
- [X] T019 [US1] Implement `BeaconService.disconnect()`. *(Done as part of T011 rewrite.)*
- [X] T020 [US1] Implement `BeaconService.getRpcUrl()`. *(Done as part of T011 rewrite — defensive read of `(client as any).network?.rpcUrl`.)*
- [X] T021 [US1] Update `src/app/pages/home/home.page.ts`: replaced inline explorer helpers with imports from `src/app/utils/explorer.ts` (kept as re-exports for any external consumers); `askForPermissions` now calls `beaconService.connect(...)` so a second click is a no-op when already connected; `sign()` uses `buildSignPayload` with explicit `signingType` + `sourceAddress`; the constructor's `client.beaconId` read is now gated behind `whenReady()`; the legacy `showAlertWithBlockExplorerLink` callsite resolves a `NetworkConfig` from `selectedNetwork` before linking to the explorer.
- [ ] T022 [US1] (Optional) Update `src/app/components/sample-contract/sample-contract.component.ts` to use `RpcService` instead of constructing RPC URLs inline, and the new explorer util. *(Skipped in this checkpoint — sample-contract still reads RPC via direct HttpClient; revisit in Polish if needed.)*

**Verification**: run quickstart.md rows SC-001 / SC-002 / SC-003 manually. Each must pass before declaring US1 done.

**Checkpoint**: bugs fixed. Wallet session is reliable.

---

## Phase 4: User Story 2 — Visible test playground (P1)

**Goal**: ship the playground at `/`. Page shows the wallet-control header, category accordions, and at least one runnable test per "MVP" category (view-data + core + crypto). Test cards render status / inputs / results uniformly. The legacy home remains at `/legacy`.

**Independent Test**: per quickstart.md rows SC-004 / SC-005 / SC-015: open `/` → see playground (under 3 s first paint); without a wallet, run "Account balance" → success card with balance summary, request/response visible; six category accordions render even when most are empty.

- [X] T023 [P] [US2] Create `src/app/playground/components/test-card/test-card.component.{ts,html,scss}`. *(Also folded T030 — TestRunnerService.run wiring — and T031 — copy-to-clipboard with hidden-textarea fallback — into this component; queued/idle status badges + per-input "missing default" hint added per T034.)*
- [X] T024 [P] [US2] Create `src/app/playground/components/wallet-control/wallet-control.component.{ts,html,scss}`. *(Folded T032 — Mainnet⇄Shadownet `ion-segment` — and T036 — RPC + indexer env-summary line — into this component. Run-all buttons land in US4; SDK-version selector lands in US7. SDK-version badge already lives in `playground.page` header.)*
- [X] T025 [P] [US2] Create `src/app/playground/tests/view-data.tests.ts` — `view.account-balance` / `view.block-inspect` / `view.contract-events-poll`, all `safeForRunAll: true`.
- [X] T026 [P] [US2] Create `src/app/playground/tests/core.tests.ts` — `core.send-tez` / `core.batch` / `core.contract-call` (counter; `defaultFromNetwork: 'counter'`).
- [X] T027 [P] [US2] Create `src/app/playground/tests/crypto.tests.ts` — `crypto.sign-micheline` / `crypto.sign-raw` / `crypto.sign-tz5-bls` (preflights `address.startsWith('tz5')`).
- [X] T028 [P] [US2] Create `src/app/playground/tests/index.ts` aggregator: `ALL_TESTS`, `TESTS_BY_CATEGORY`, `CATEGORY_META`, `CATEGORY_ORDER`. Other categories ship as empty arrays for now.
- [X] T029 [US2] Fill in `src/app/playground/playground.page.html` with the wallet-control header toolbar and the category accordion group (multi-open, `value=categoryOrder` so all categories start expanded).
- [X] T030 [US2] Wire `TestRunnerService.run(testId, inputs)` to the test card's Run button — *folded into T023*.
- [X] T031 [US2] Implement per-card copy-to-clipboard — *folded into T023*.

**Checkpoint**: open `/` → six categories rendered → run `view.account-balance` without a wallet → success result; with a wallet, run `core.send-tez` → wallet pops, op hash with tzkt link rendered.

---

## Phase 5: User Story 3 — Network toggle (P1)

**Goal**: Mainnet ⇄ Shadownet toggle in the header. Switching the toggle reinitializes the SDK client, swaps RPC + indexer + explorer endpoints, and updates contract-address input defaults per the active network.

**Independent Test**: per quickstart.md rows SC-008 / SC-009: toggle Mainnet ⇄ Shadownet → DevTools shows next RPC call hits the new base within 1 s; contract-address inputs reseed to the active network's default (or empty with hint if none registered).

- [X] T032 [US3] Add `<ion-segment>` Mainnet ⇄ Shadownet toggle — *folded into T024 (`wallet-control.component`). Switching calls `networkService.setSelected(name)` then `beaconService.reinitClient(cfg.sdkNetworkType, undefined, cfg.rpc)`.*
- [X] T033 [US3] Implement `BeaconService.reinitClient(networkType, name?, rpcUrl?)`: `await this.client.destroy()` (guarded), construct via the loaded `sdk.DAppClient`, then `registerSubscriptions()` + `restoreActiveAccount()`. *(Already implemented in T011 rewrite.)*
- [X] T034 [US3] Default-from-network seeding in `TestCardComponent` — *folded into T023. `seedDefaults({ preserveEdited: true })` re-runs on `networkService.active$` emissions; manually-edited keys are tracked in `userEdited: Set<string>` and skipped during re-seed. `missingNetworkDefaultHint(key)` renders the FR-023 inline message when a `defaultFromNetwork` role has no registered default for the active network.*
- [X] T035 [US3] Wire `getExplorerLinkForTxHash` / `getExplorerLinkForAddress` to the active `NetworkConfig`. *(Done in T012 — `TestRunnerService` reads `networkService.getActive()` at result-recording time, so `result.explorerUrl` is stable even if the user toggles network afterwards.)*
- [X] T036 [US3] Active-endpoints env-summary line in the wallet-control — *folded into T024 (`RPC: … · Indexer: …` underneath the connect/disconnect row, derived from the active NetworkConfig).*

**Checkpoint**: toggle works; per-network defaults reflect immediately; explorer links go to the right indexer.

---

## Phase 6: User Story 4 — Run-all + run history + export (P2)

**Goal**: sequential Run-all (safe and full), numbered runs persisted to `localStorage`, run-history panel with per-run ✕ / Clear-all, exportable Markdown / JSON / clipboard report scoped to a single numbered run.

**Independent Test**: per quickstart.md rows SC-005 / SC-006 / SC-007 / SC-017 / SC-018 / SC-019 / SC-021.

- [X] T037 [P] [US4] Implement `TestRunnerService.runAllSafe()`: collect `ALL_TESTS.filter(t => t.enabled && t.safeForRunAll)`; create a new `PlaygroundRun { runNumber, runType: 'safe', startedAt, sdkVersion, network, walletAddress }`; iterate sequentially, await each `run()`, push each `TestResult` into the run's `results[]`, update `passCount` / `failCount` as you go; set `endedAt` at the end; push the completed `PlaygroundRun` into `runs$` and persist (T040).
- [X] T038 [P] [US4] Implement `TestRunnerService.runAllFull()`: same structure as `runAllSafe` but iterates `ALL_TESTS.filter(t => t.enabled)`. If `networkService.getActive().name === 'mainnet'`, call `window.confirm(...)` with a message naming the network + wallet address + number of mutating tests; if dismissed, return early without creating a run (FR-041). For each test: if `def.inputs` includes a `defaultFromNetwork` input with no value (no registry default and no user edit), record an `error` TestResult with message `"no contract address supplied for active network"` and continue (FR-042). Use each test's default inputs for the run. (FR-040, FR-041, FR-042)
- [X] T039 [P] [US4] Implement the FIFO queue per research.md §R10: while `inFlightRunAll !== null`, any `run(testId, inputs)` call pushes `{ testId, inputs }` onto an internal queue and updates the per-card `results$[testId].status = 'queued'`. After `runAllSafe` / `runAllFull` completes, drain the queue sequentially as ordinary individual runs. The other Run-all button is disabled while one is in flight (UI reads `inFlightRunAll$`). (FR-064, FR-065, FR-066)
- [X] T040 [P] [US4] Implement persistence in `TestRunnerService`: `persistRuns()` writes `JSON.stringify(this.runs$.value)` to `localStorage['octez.connect.run-history']`; cap at 50 runs (oldest dropped, `console.info`'d); on `QuotaExceededError`, fall back to in-memory only and toast (research.md §R8, §R9). `rehydrate()` reads the key on service construction. Both methods exposed for unit testing.
- [X] T041 [US4] Add a header progress indicator in `playground.page.html`: when `inFlightRunAll$` is non-null, show `Running test k/N…` where k/N comes from `TestRunnerService.runProgress$ = BehaviorSubject<{ current: number; total: number } | null>(null)`. (FR-043)
- [X] T042 [P] [US4] Create `src/app/playground/components/run-history/run-history.component.{ts,html,scss}`. Renders `runs$` as a list of `<ion-accordion>`s, each header showing `RUN <n>: <sdkVersion> — <runType> — <passCount>/<totalCount> passed` (and network + startedAt time). Each accordion body lists every `TestResult` in execution order with the same status/duration/op-hash-link/JSON-collapsible rendering used in test cards. Each header has a `✕` icon button that calls `testRunner.deleteRun(runNumber)`; the panel has a "Clear all" button calling `testRunner.clearAllRuns()`. (FR-058, FR-059, FR-060, FR-061)
- [X] T043 [US4] Implement `TestRunnerService.deleteRun(runNumber)` and `clearAllRuns()`: mutate `runs$` and persist. Per-test-card last-result is NOT touched by either action (per FR-060 / FR-061).
- [X] T044 [US4] Place `<run-history>` in `playground.page.html` beneath the category accordion group.
- [X] T045 [P] [US4] Create `src/app/playground/services/report-export.service.ts`. Exposes `buildMarkdownReport(run: PlaygroundRun, network: NetworkConfig): string`, `buildJsonReport(run: PlaygroundRun, network: NetworkConfig): string`, `downloadMarkdown(name, content)`, `downloadJson(name, content)`, `copyToClipboard(content): Promise<void>`. Markdown layout per research.md §R13. JSON = `PlaygroundReport` shape per data-model.md §8. Download via Blob + object URL + hidden anchor click. Clipboard via `navigator.clipboard.writeText` with hidden-textarea fallback. No new deps. (FR-045, FR-046, FR-047)
- [X] T046 [US4] In `run-history.component.ts`, add three buttons per run-history header next to ✕: "Export MD", "Export JSON", "Copy". Each calls the corresponding `ReportExportService` method on the selected run.

**Checkpoint**: Run-all (safe) populates results; Run-all (full) walks through mutating tests sequentially with progress indicator; numbered runs persist across reload; export produces the documented Markdown.

---

## Phase 7: User Story 5 — Dynamic contract interaction (P2)

**Goal**: paste a KT1 → list entrypoints from the indexer (RPC fallback) → seed a JSON parameter textarea → invoke any entrypoint.

**Independent Test**: per quickstart.md row SC-010.

- [X] T047 [P] [US5] Create `src/app/playground/components/contract-explorer/contract-explorer.component.{ts,html,scss}`. UI: KT1 input (validate `addr.startsWith('KT1') && addr.length === 36`), Load button → calls `indexerService.getEntrypoints(kt)` → populates an `<ion-select>` of entrypoint names. On entrypoint selection, render a `<ion-textarea>` seeded with `JSON.stringify(entrypoint.jsonParameterSchema, null, 2)` (or `rawMicheline` if the schema is null), plus an Amount input (mutez), plus an Invoke button.
- [X] T048 [P] [US5] Implement the Invoke handler in the component: parse the parameter textarea as JSON; build the operation `{ kind: 'transaction', amount, destination: kt, parameters: { entrypoint, value: <parsed> } }`; call `client.requestOperation({ operationDetails: [op] })`; render the resulting op hash with `getExplorerLinkForTxHash`. On error, show the message inline.
- [X] T049 [US5] Implement `IndexerService.getEntrypoints(kt)` (covered in T009 skeleton — finalize the RPC fallback path here): TzKT primary call returns the typed list per `contracts/indexer-endpoints.md`; on failure, GET `${rpc}/chains/main/blocks/head/context/contracts/${kt}/entrypoints` and map to `EntrypointDescriptor[]` with `jsonParameterSchema: null` and `rawMicheline: <Micheline-type>` for each. (FR-033)
- [X] T050 [US5] Place `<contract-explorer>` in `playground.page.html`, in the Contracts category accordion's body (per spec §B3 — the panel lives under the Contracts category).

**Checkpoint**: pasting the Shadownet counter KT1 lists `increment` / `decrement` / `reset`; selecting one and clicking Invoke produces a wallet popup and a tx hash linked to tzkt.

---

## Phase 8: User Story 6 — Deploy from Michelson JSON (P2)

**Goal**: textarea for a `{ code, storage }` Michelson JSON; submit as an origination via the SDK; resolve the originated KT1 from the indexer (RPC fallback) and show it with a link.

**Independent Test**: per quickstart.md row SC-011.

- [X] T051 [US6] Add a new `TestDefinition` `contracts.deploy-from-michelson` in `src/app/playground/tests/contracts.tests.ts` (file is created here if it doesn't exist yet). Inputs: a `type: 'json'` textarea seeded with a minimal `{ code: [], storage: { int: '0' } }` example, plus an optional `balance` number (mutez). `requiredScope: 'octez-connect'`, `safeForRunAll: false`.
- [X] T052 [US6] Implement the handler: parse the textarea JSON; throw a clear error on malformed JSON; build `{ kind: 'origination', balance, script: { code, storage } }`; call `client.requestOperation({ operationDetails: [op] })`; await result.
- [X] T053 [US6] Resolve the originated KT1: call `indexerService.findOriginatedKt(hash)` (added in T009). Show the KT1 alongside the op hash in the result region; both linked to the indexer (`getExplorerLinkForAddress` for the KT1; `getExplorerLinkForTxHash` for the hash).
- [X] T054 [US6] Add `contracts.tests.ts` to the test-index aggregator (T028) so the Contracts category surfaces this test.

**Checkpoint**: a minimal counter `{ code, storage }` JSON pasted into the textarea → wallet pops → result card shows tx hash + originated KT1 + indexer link.

---

## Phase 9: User Story 7 — Runtime SDK version switcher (P3)

**Goal**: dropdown in the wallet-control header to choose an `@tezos-x/octez.connect-dapp` version. Selection persists, reloads the page, and the playground boots against that version. CDN-load failure falls back to bundled.

Note: `SdkLoaderService` already exists from Foundational (T007). This phase adds the **UI** + verifies the wiring end-to-end.

**Independent Test**: per quickstart.md rows SC-012 / SC-020.

- [X] T055 [P] [US7] Add an `<ion-select>` to `wallet-control.component.html` listing `SUPPORTED_VERSIONS = ['4.8.5', '5.0.0-beta.6', '5.0.0-beta.5', '5.0.0-beta.4', '5.0.0-beta.3']` plus an "Other (custom)" option that reveals a free-form `<ion-input>`. On change, call `sdkLoader.setVersion(v)` (persists + reloads).
- [X] T056 [P] [US7] Add a header badge in `wallet-control.component.html` showing the running SDK version from `sdkLoader.getActiveVersion()`. If `source === 'fallback'`, prefix the badge with "⚠️ Bundled fallback" so the user immediately knows why the CDN version isn't running.
- [ ] T057 [US7] Verify the 10-second timeout path: temporarily point `SUPPORTED_VERSIONS` at a non-existent version (e.g., `'99.99.99'`), reload, and confirm the toast appears within ~10 s and the playground continues against the bundled fallback (quickstart.md SC-020).

**Checkpoint**: switching versions persists + reloads + badge updates; chaos test confirms the 10s fallback path.

---

## Phase 10: User Story 8 — Disabled stub cards (P3)

**Goal**: out-of-scope flows (Sapling, Etherlink bridge, Tezlink bridge, local fee estimation, on-chain signature verification, faucet) appear as disabled cards with a clear reason. Run-all skips them.

**Independent Test**: open the playground → each stub card is visible in its category with a disabled Run button and a `disabledReason` shown inline.

- [X] T058 [US8] Create `src/app/playground/tests/stubs.tests.ts` exporting `STUB_TESTS: TestDefinition[]`. One entry each for: Sapling (`category: 'contracts'`), Etherlink bridge (`category: 'tokens'`), Tezlink bridge (`category: 'tokens'`), Local fee estimation (`category: 'core'`), On-chain signature verification (`category: 'crypto'`), Faucet (`category: 'core'`). Each has `enabled: false`, a populated `disabledReason`, empty `inputs`, and a `run` that throws (`'disabled'`) — never invoked because the runner short-circuits on `!def.enabled`. (FR-037, FR-033 stubs list)
- [X] T059 [US8] Verify in `TestCardComponent` (T023) that `def.enabled === false` renders the Run button disabled and displays `def.disabledReason` inline. If not already implemented in T023, add it now.
- [X] T060 [US8] Verify in `TestRunnerService.runAllSafe` / `runAllFull` (T037 / T038) that `!def.enabled` tests are filtered out so they never produce a TestResult and never count toward the run's `totalCount`.

**Checkpoint**: each stub card visible, disabled, with reason; Run-all (safe/full) ignores them.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: complete the FR coverage (remaining test cards), add small unit tests for pure helpers, verify the production build, and prepare the deploy gate. Does not introduce new user stories.

- [X] T061 [P] Create `src/app/playground/tests/staking.tests.ts` (`STAKING_TESTS`): set-delegate (`{ kind: 'delegation', delegate: <baker> }`), remove-delegate (`{ kind: 'delegation' }` without delegate), stake / unstake / finalize-unstake (transactions to `ctx.account.address` with respective entrypoints). All `requiredScope: 'octez-connect'`, `safeForRunAll: false`. (FR-028, FR-029)
- [X] T062 [P] Extend `src/app/playground/tests/contracts.tests.ts` with: increase-paid-storage (`{ kind: 'increase_paid_storage', amount, destination }`), register-global-constant (`{ kind: 'register_global_constant', value }`), set-deposits-limit (`{ kind: 'set_deposits_limit', limit }`), origination with a small default script, read-contract-storage (RPC `GET /storage`), contract-view-execution (RPC `POST run_script_view`). Each `requiredScope` is `'octez-connect'` for the wallet-mutating ones and `'rpc-read'` (safeForRunAll=true) for the read ones. (FR-030, FR-032)
- [X] T063 [P] Create `src/app/playground/tests/tokens.tests.ts` (`TOKENS_TESTS`): fa2-transfer (`{ kind: 'transaction', amount: '0', destination: <fa2-contract>, parameters: { entrypoint: 'transfer', value: <michelson list> } }` — contract-address `defaultFromNetwork: 'fa2-transfer'`), fa2-mint (entrypoint `'mint'`), fa2-burn (entrypoint `'burn'`), fa2-balance-read (RPC `GET /storage` + big-map lookup against the FA2's ledger big-map; safeForRunAll=true). (FR-031, FR-035)
- [X] T064 [P] Add `crypto.tz5-bls` polishing if needed: if the verification surfaces edge cases (e.g., tz5 detection by prefix is too coarse), add more specific gating. Currently `addr.startsWith('tz5')` is sufficient per research.md §R12 — only revisit if a wallet contradicts this.
- [X] T065 [P] Unit tests under `src/app/utils/sign-payload.spec.ts`: assert `buildSignPayload('test', 'micheline')` returns payload exactly `'050100000004' + '74657374'` and signingType `'micheline'`; assert the UTF-8 byte-length path with a non-ASCII string (e.g., `'héllo'` → 6 bytes). (research.md §R20)
- [X] T066 [P] Unit tests under `src/app/playground/network.config.spec.ts`: assert `getContractDefault('shadownet', 'counter') === 'KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA'`; assert `getContractDefault('mainnet', 'counter') === null`.
- [X] T067 [P] Unit tests under `src/app/playground/services/test-runner.service.spec.ts`: with a fake list of tests and a mocked SDK client + RpcService, assert that calling `run(test1)` during an in-flight `runAllSafe()` enqueues `test1` (its status flips to `'queued'`) and that `test1` runs only after the run-all completes. (FR-065)
- [X] T068 [P] Unit tests under `src/app/playground/services/report-export.service.spec.ts`: assert the Markdown formatter renders an op-hash as `[hash](https://shadownet.tzkt.io/<hash>)` when `network.name === 'shadownet'`. (FR-045)
- [X] T069 Run `npx ng build --configuration production`. Confirm exit code 0. Confirm no `@taquito` import survives: `grep -r "@taquito" src` → empty. Confirm only type-only static imports of the SDK: `grep -rn "from '@tezos-x/octez.connect-dapp'" src` → every match begins with `import type` (except the single dynamic-loader fallback `import('@tezos-x/octez.connect-dapp')` in `sdk-loader.service.ts`). (SC-013, SC-014)
- [ ] T070 Walk through `quickstart.md` §3 — run every Success-Criterion check (SC-001 through SC-021) and tick each off. Any failure → return to the corresponding user-story phase and fix.
- [ ] T071 Resolve OQ-1 (Mainnet FA2 default): once the user identifies a Mainnet FA2 KT1 they control, populate `NETWORKS.mainnet.contractDefaults['fa2-transfer']` and `['fa2-balance']` in `network.config.ts`. Update memory file `mainnet-fa2-default-open.md` to "resolved".
- [ ] T072 Resolve OQ-1 (Mainnet counter deploy): when the user is ready, write the counter-on-Mainnet deployment walkthrough (Michelson source, `octez-client` origination commands, expected storage cost). User executes; once landed, populate `NETWORKS.mainnet.contractDefaults['counter']` with the resulting KT1. Update memory file `mainnet-counter-deploy.md` to "resolved".
- [ ] T073 (Optional) Deploy gate: after the user confirms a release, merge to `master` to trigger the existing GitHub Pages workflow. Do not push to `master` without explicit user confirmation.

### Mid-session additions (post-MVP feedback)

- [X] T074 [US3] **Reworked twice** to land on the SDK-blessed pattern for octez.connect 4.8.x: single `DAppClient` alive at any time, network set at **construction time** (the SDK rejects a `network` field on request inputs), and the client is destroyed + recreated on every network toggle. `BeaconService` subscribes to `networkService.selected$` and queues a `doReinitForActiveNetwork` on a serialized promise chain (`whenReady()` always resolves to the latest client). After each reinit, `tryRestoreActiveForNetwork(sdkType)` searches `client.getAccounts()` for a paired account on the new network and promotes it via `setActiveAccount` so the user is "already connected" without a pairing UI; if none exists, the active-account subject is cleared and the Connect CTA appears. `disconnect()` removes only the current network's account so other networks' pairings survive in SDK storage. `connect()` calls `requestPermissions()` with NO network arg (SDK constraint). Test handlers (`core.send-tez`, `core.batch`, `core.contract-call`) no longer attach a `network` field to operation requests — the client's construction-time network is the source of truth. *(Resolves: multi-instance SDK warning, "the network property is no longer accepted in input" error, and "can't use the new network without disconnect+reconnect" symptom.)*
- [X] T075 [US3] Replaced the Mainnet ⇄ Shadownet `ion-segment` toggle with an `ion-select` dropdown listing all available networks (built-ins + customs). Cleaner UX at any list length.
- [X] T076 [US3] Custom-network support: `NetworkName` widened to `string`; `network.config.ts` keeps built-ins in `BUILTIN_NETWORKS` and adds `toCustomNetworkConfig` + `isBuiltinNetwork` helpers. `NetworkService` adds `addCustomNetwork(input)` / `removeCustomNetwork(name)` / `customs$` and persists user-added networks under `localStorage['octez.connect.custom-networks']`. `WalletControlComponent` adds "+ Add network" (ion-alert form: name, sdkNetworkType, rpc, indexer, api) and "Manage" (ion-action-sheet listing customs for deletion).
- [X] T077 [P] Add `contracts.failing-contract` test (call a counter-like contract whose entrypoint runs `FAILWITH`; assert the wallet/RPC returns a clear failure surfaced as `TestResult.error`). *(Reference-dapp parity — gap identified during MVP review.)*
- [X] T078 [P] Add `contracts.failing-noop` test (submit an intentionally-invalid operation, e.g., a transaction with a malformed destination, and surface the rejection as `TestResult.error`). *(Reference-dapp parity.)*
- [X] T079 [P] Add `contracts.transaction-limit` test: a transaction with explicit `gas_limit`, `storage_limit`, and `fee` overrides on the operation payload, demonstrating limit-controlled execution. *(Reference-dapp parity.)*
- [X] T080 [P] Add `view-data.tzip16-metadata` test: read a contract's storage, resolve the TZIP-16 `%metadata` big-map URI (tezos-storage:// / https://), fetch the JSON, render name + description + author summary. `requiredScope: 'rpc-read'`, `safeForRunAll: true`. *(Reference-dapp parity.)*

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately.
- **Phase 2 (Foundational)**: depends on Phase 1. Blocks every user story phase.
- **Phase 3 (US1)**: depends on Phase 2. Independently testable against `/legacy`.
- **Phase 4 (US2)**: depends on Phase 2; US1 is **not** strictly a prerequisite (US2's playground can render against the refactored BeaconService from Phase 2 directly), but landing US1 first gives confidence the wallet/sign paths work before exercising them across many tests.
- **Phase 5 (US3)**: depends on Phase 2. Independent of US1/US2 functionally, but its toggle UI lives in the wallet-control component built in US2.
- **Phase 6 (US4)**: depends on Phase 2 + Phase 4 (US2). Runs need test cards and the test-runner skeleton to operate.
- **Phase 7 (US5)**: depends on Phase 2 + Phase 4 (uses the test-card pattern for results) + Phase 5 (uses network toggle context).
- **Phase 8 (US6)**: depends on Phase 2 + Phase 4 (test-card rendering for the deploy test).
- **Phase 9 (US7)**: depends only on Phase 2 (SdkLoaderService already exists there); UI lives in the wallet-control built in Phase 4.
- **Phase 10 (US8)**: depends on Phase 4 (TestCard renders disabled state).
- **Phase 11 (Polish)**: depends on every desired user story being done.

### User story independence

- **US1 (P1)**: independently testable — the legacy home becomes the witness for bug fixes.
- **US2 (P1)**: independently testable — the playground renders with view-data + core + crypto tests against any (or no) wallet.
- **US3 (P1)**: independently testable — toggle changes RPC base + indexer + defaults observable in DevTools and on the test cards.
- **US4 (P2)**: independently testable — Run-all populates a numbered run and exports a report.
- **US5 (P2)**: independently testable — paste KT1 → entrypoints → invoke.
- **US6 (P2)**: independently testable — paste Michelson JSON → originate → KT1 resolved.
- **US7 (P3)**: independently testable — version selector persists + reloads + badge updates.
- **US8 (P3)**: independently testable — stubs render disabled.

### Within each user story

- Models / types before services; services before components; components before page wiring.
- Tasks marked `[P]` within a phase touch disjoint files — safe to parallelize across pair-programmed sessions.

### Parallel opportunities

- All Phase 1 `[P]` tasks can run together.
- All Phase 2 `[P]` tasks (T004–T010) can run together; T011/T012/T013 depend on the prior `[P]` block; T014 depends on T015; T015/T016 are sequential.
- US2 tasks T023–T028 are all `[P]` (different files).
- US4 tasks T037–T040 are all `[P]` (different methods/files); T042/T045 are `[P]`.
- US7 tasks T055/T056 are `[P]`.
- Polish T061–T068 are all `[P]`.

---

## Parallel Example: Phase 2 Foundational

```text
# These five tasks touch different files with no incomplete-task dependencies:
Task T004: Create src/app/utils/sign-payload.ts
Task T005: Create src/app/playground/network.config.ts
Task T006: Create src/app/utils/explorer.ts
Task T007: Create src/app/playground/services/sdk-loader.service.ts
Task T008: Create src/app/playground/services/rpc.service.ts
Task T009: Create src/app/playground/services/indexer.service.ts
Task T010: Create src/app/playground/tests/test-types.ts
```

## Parallel Example: User Story 2 Implementation

```text
Task T023: Create src/app/playground/components/test-card/test-card.component
Task T024: Create src/app/playground/components/wallet-control/wallet-control.component
Task T025: Create src/app/playground/tests/view-data.tests.ts
Task T026: Create src/app/playground/tests/core.tests.ts
Task T027: Create src/app/playground/tests/crypto.tests.ts
Task T028: Create src/app/playground/tests/index.ts (depends on T025/T026/T027 — run after, not parallel with, those three)
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 → P1 trio)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational) — services + types + module + routing.
3. Complete Phase 3 (US1) — bug fixes manually verified against `/legacy`.
4. Complete Phase 4 (US2) — playground renders at `/` with the MVP test set.
5. Complete Phase 5 (US3) — toggle works.
6. **STOP and VALIDATE**: this is a shippable MVP — the dapp is bug-free, the playground exists, and the network toggle works. The user can demo it.

### Incremental delivery beyond MVP

7. Add Phase 6 (US4) → run-all + export + history. Now the playground is a regression harness.
8. Add Phase 7 (US5) → dynamic contract panel. Now any KT1 is interactive.
9. Add Phase 8 (US6) → deploy-from-Michelson. Now origination is end-to-end.
10. Add Phase 9 (US7) → SDK version switcher. Now cross-version comparison is live.
11. Add Phase 10 (US8) → stubs visible and labeled.
12. Polish (Phase 11) — fill in remaining test categories, unit tests, prod build verification, deploy gate.

Each increment can be deployed (or held back) independently — none breaks prior functionality.

### Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[US?]` labels map every story-phase task back to its spec user story for traceability.
- Verification is manual + a small unit-test set per research.md §R20.
- Commit after each task or logical group; do not push to `master` until the user confirms a release (T073).
- Open items tracked in memory: `mainnet-counter-deploy`, `mainnet-fa2-default-open`. T071 / T072 resolve them once user input lands.
- Avoid: silent address re-use across networks; static SDK runtime imports; new top-level npm deps.
