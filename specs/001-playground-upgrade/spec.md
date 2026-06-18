# Feature Specification: octez.connect Example dApp → Test Playground

**Feature Branch**: `001-playground-upgrade`
**Created**: 2026-06-15
**Status**: Draft
**Input**: User description: "Upgrade the example dapp to fix three known wallet/signing/contract bugs and transform the marketing-style home page into a comprehensive, visible, exportable test playground for octez.connect — with a network toggle (Mainnet ⇄ Shadownet), a dynamic contract-interaction panel driven by a paste-a-KT1 indexer lookup, deploy-from-Michelson-JSON, a protocol-U tz5 BLS signing test, sequential auto-run-all with wallet approvals, and a runtime SDK version switcher that boots the app against any published @tezos-x/octez.connect-dapp version."

## Clarifications

### Session 2026-06-15

- Q: When the user clicks "Run all (safe)" or "Run all (full)" and previous results already exist, what should happen to those existing results? → A: Don't clear or overwrite. Save each run-all invocation as a numbered run (RUN 1, RUN 2, …) in a collapsible history panel beneath the categories, with a per-run pass/fail summary in the header (e.g., "RUN 1: octez.connect 4.8.5 — passed 49/50"). A "Clear all" button removes every numbered run from history; a "✕" on each run header deletes only that run. Individual test-card "Run" clicks update the card's inline last-result display only and do NOT create or mutate a numbered run. Run history persists across page reload so the user can compare outcomes across SDK versions (which require a reload to switch).
- Q: What timeout should the dynamic SDK CDN load use before falling back to the bundled package? → A: 10 seconds. After 10s, treat the load as failed and trigger the bundled-package fallback with the same user-visible notice that an errored load would trigger.
- Q: While a "Run all (safe)" or "Run all (full)" is in flight, what happens if the user clicks an individual test card's "Run" button (or clicks the other Run-all)? → A: Queue individual Run clicks (FIFO) and execute them sequentially after the in-flight Run-all completes. The other Run-all button is disabled while one is in flight (only one Run-all may be in flight at a time). Queued individual runs do NOT join the in-flight numbered run — they execute as ordinary individual runs per FR-062 after the Run-all finishes. Queued cards visually indicate "queued" until they start.
- Q: Should the playground also offer a per-category "Run all in this category" button (e.g., Crypto-only) in addition to the two global Run-all modes? → A: No — defer per-category run-all to a follow-up. This spec ships only "Run all (safe)" and "Run all (full)"; per-category granularity can be added later without re-architecting the runner.
- Q: How is the Mainnet "Run all (full)" confirmation prompt rendered? → A: Browser-native `confirm()` dialog (single OK/Cancel). Simple, blocking, no custom UI to build.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable wallet session (Priority: P1)

A developer evaluating octez.connect opens the dapp, connects their wallet once, reloads the page, and clicks "Connect" again. The session is preserved across reload (no wallet-pairing UI), and clicking "Connect" again while already connected is a no-op (no re-pairing prompt). Signing a payload succeeds with the wallet because the payload is properly encoded. Disconnecting cleanly collapses the connected UI.

**Why this priority**: Three real bugs (reconnect re-shows pairing UI, lost session on reload, sign-payload rejects unencoded strings) currently make the dapp look broken on first contact. Until these are fixed, every downstream test in the playground is unreliable and the dapp fails its primary "show this SDK works" purpose.

**Independent Test**: With any supported wallet, connect → reload the page (session persists, no pairing UI) → click Connect again (no-op, no pairing UI) → sign the string `test` (wallet receives micheline-packed payload and signs) → click Disconnect (UI collapses to disconnected state). All four steps pass without seeing the pairing UI more than once.

**Acceptance Scenarios**:

1. **Given** the user has never connected before, **When** they click Connect, **Then** the pairing UI appears and after wallet approval their address and connection status are shown.
2. **Given** the user is already connected, **When** they reload the page, **Then** the connected UI is restored with the same address and no pairing UI appears.
3. **Given** the user is already connected, **When** they click Connect again, **Then** the call is a no-op (no destroy/recreate of the client, no pairing UI).
4. **Given** the user is connected, **When** they sign the payload `test`, **Then** the wallet receives a micheline-packed payload (`0501…74657374` for the ASCII bytes) plus an explicit signing type and returns a signature.
5. **Given** the user is connected, **When** they click Disconnect, **Then** the active account clears, status reads "Not connected", and account-dependent UI is hidden.

---

### User Story 2 - Visible test playground replaces home (Priority: P1)

A developer lands on the dapp and sees a test playground instead of a marketing home page. Tests are grouped by category (Core, Staking/Delegation, Contracts, Crypto, Tokens, View-data) in collapsible sections. Each test card shows its title, description, status (idle/running/success/error), required scope (wallet vs. RPC-only), editable inputs with sensible defaults, and a result region with duration, summary, transaction hash linked to the active indexer, and collapsible raw request/response. Read-only tests run without a wallet; wallet-scope tests are disabled until a wallet is connected.

**Why this priority**: The playground is the new primary landing experience and the way the SDK's capabilities become visible. Without it, the bug fixes (Story 1) and the supporting infrastructure (Stories 3–6) have no surface to be exercised on.

**Independent Test**: Open the dapp at `/` → see the playground page with categorized accordions and a wallet-control header → run the read-only "Account balance" test against any address (no wallet needed) → status flips idle → running → success, summary shows the balance, request/response panels show the raw RPC call. The legacy marketing home remains reachable at `/legacy`.

**Acceptance Scenarios**:

1. **Given** the user opens `/`, **When** the page loads, **Then** the playground is shown with category accordions and a sticky header containing wallet controls, network toggle, SDK-version selector, and global Run-all/Export actions.
2. **Given** no wallet is connected, **When** a wallet-scope test card renders, **Then** its Run button is disabled with an indication that a wallet connection is required.
3. **Given** a read-only test like "Account balance" is run, **When** the request resolves, **Then** the card shows duration, a human summary, and collapsible request/response JSON.
4. **Given** the user opens `/legacy`, **When** the page loads, **Then** the original marketing home renders unchanged.
5. **Given** any test enters an error state, **When** the user inspects the card, **Then** the error message is visible and the raw request payload is still available for debugging.

---

### User Story 3 - Network toggle (Mainnet ⇄ Shadownet) (Priority: P1)

A user switches the active network from Mainnet to Shadownet (or back) via a single toggle in the wallet-control header. The SDK client is reconfigured to the new network's RPC endpoint, all RPC reads and indexer lookups target the new endpoints, and explorer links (`tzkt.io` vs. `shadownet.tzkt.io`) resolve to the correct chain. Each test's contract-address inputs are also seeded from the active network's defaults so out-of-the-box runs target the right contracts per network. Connection state is preserved when the active wallet supports the new network.

**Why this priority**: Every test in the playground depends on knowing which RPC node, which indexer API, which explorer base URL, and which default contract addresses to use. The toggle is the single source of truth feeding all of these.

**Independent Test**: With a wallet connected on Shadownet, toggle to Mainnet → wallet-control reinitializes the client against the Mainnet RPC and indexer → an explorer link rendered in the header points to `tzkt.io` (not `shadownet.tzkt.io`) → the "Contract call" test's contract-address input is now seeded with the Mainnet counter default (not the Shadownet one) → toggle back to Shadownet → links and defaults revert.

**Acceptance Scenarios**:

1. **Given** the toggle is on Mainnet, **When** the user toggles to Shadownet, **Then** subsequent RPC calls target `https://tezos-shadownet.octez.io` and indexer calls target `https://api.shadownet.tzkt.io`.
2. **Given** the toggle is on Shadownet, **When** a transaction hash is rendered for any successful test result, **Then** its link resolves to `https://shadownet.tzkt.io/<hash>`.
3. **Given** the user switches network, **When** any test card with a contract-address input re-renders, **Then** the input default is the address registered for the active network (and falls back to "user must provide" if no default is registered for that network).
4. **Given** the user switches network while connected, **When** the active wallet supports both networks, **Then** the active session persists without forcing re-pairing.

---

### User Story 4 - Auto run-all with wallet approvals and exportable report (Priority: P2)

A user clicks "Run all (safe)" and every read-only test executes sequentially, populating result cards. They then click "Run all (full — approves each in wallet)" and the playground walks 1→N through every enabled test, awaiting each so the wallet pops one approval at a time. The header shows `running test k/N` progress. Each run-all invocation is preserved as a numbered run (RUN 1, RUN 2, …) in a collapsible history panel beneath the categories — its header shows the SDK version, network, and pass/fail summary, supporting cross-version comparisons (e.g., "RUN 1: octez.connect 4.8.5 — 49/50" vs "RUN 2: octez.connect 5.0.0-beta.6 — 12/50"). When the user wants a shareable artifact, they pick a run from the history and click "Export report"; a Markdown file is downloaded containing a meta table (run number, timestamp, network, RPC URL, wallet address, SDK version), per-category tables of test results, real operation hashes rendered as clickable tzkt links, and JSON-fenced error payloads where tests failed. A JSON download and a copy-to-clipboard option are also available.

**Why this priority**: Auto-run-all is the headline UX that turns the playground into a regression-and-evaluation harness, and the run-history panel turns it into a cross-SDK-version comparison harness. Export turns each run into a shareable artifact. Important but depends on the test runner and at least a usable set of tests existing first.

**Independent Test**: With a wallet on Shadownet, click "Run all (safe)" → read-only cards turn green sequentially → click "Run all (full)" → wallet pops approvals one at a time, each can be approved or rejected, rejection records `error` and run continues → progress reads `k/N` → click Export → a Markdown file is downloaded with a meta table, per-category result tables, and at least one real op hash linked to `shadownet.tzkt.io`.

**Acceptance Scenarios**:

1. **Given** any number of enabled tests, **When** the user clicks "Run all (safe)", **Then** only tests marked safe-for-run-all execute, sequentially, without prompting the wallet.
2. **Given** wallet-approving tests exist, **When** the user clicks "Run all (full)", **Then** approvals appear one at a time, the header shows current k/N, rejections are recorded as `error` without aborting the remaining run.
3. **Given** at least one successful on-chain test, **When** the user exports the report, **Then** the Markdown contains the operation hash rendered as a Markdown link to the active indexer's transaction URL.
4. **Given** an export is generated, **When** the user chooses JSON or clipboard output, **Then** the same structured data is delivered in those formats (Blob download for JSON, navigator.clipboard for copy).
5. **Given** the user runs "Run all (full)" twice (e.g., with different SDK versions selected between runs via a reload), **When** they expand the run-history panel, **Then** two numbered runs are shown, each labeled with its SDK version, network, and pass/fail summary, and either can be exported independently.
6. **Given** the run history contains multiple runs, **When** the user clicks the "✕" on a specific run header, **Then** only that run is removed from history; all other runs and per-test-card last-result state remain intact.
7. **Given** the run history contains multiple runs, **When** the user clicks "Clear all", **Then** every numbered run is removed from history.

---

### User Story 5 - Dynamic contract interaction (paste a KT1) (Priority: P2)

A developer pastes any `KT1` contract address into the Dynamic Contract Interaction panel. The playground queries the active indexer for the contract's callable entrypoints and renders a dropdown of entrypoint names plus a JSON-schema-seeded textarea for the chosen entrypoint's parameter value and an Amount input. Clicking Invoke sends a transaction with the entered amount, destination, entrypoint, and parameter value via the SDK. The result card shows the operation hash and a link to the indexer.

**Why this priority**: Generalizes the playground beyond hardcoded contracts. Anyone can exercise any contract on the active network without code changes — turning the dapp into a useful interactive contract-explorer.

**Independent Test**: Paste the Shadownet counter KT1 `KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA` on Shadownet → the dropdown lists `increment`, `decrement`, `reset` → select `increment`, the parameter textarea is seeded with the entrypoint's JSON schema → enter a value, click Invoke → wallet pops, user approves → result card shows an op hash and tzkt link that resolves to the recorded operation.

**Acceptance Scenarios**:

1. **Given** the user pastes a valid `KT1` address, **When** the indexer responds, **Then** the panel populates a dropdown of all callable entrypoints with their JSON parameter schemas.
2. **Given** the user selects an entrypoint, **When** the parameter textarea renders, **Then** it is seeded with that entrypoint's JSON schema so the user can edit values rather than guess shape.
3. **Given** the user invokes an entrypoint, **When** the wallet approves, **Then** the resulting operation hash is shown with a working indexer link.
4. **Given** the indexer API is unreachable, **When** the lookup fails, **Then** the panel falls back to the RPC node's `/contracts/<kt>/entrypoints` and surfaces an error message if both fail.

---

### User Story 6 - Deploy from Michelson JSON (Priority: P2)

A developer pastes a contract's Michelson JSON (a `{ code, storage }` object) into a textarea, optionally sets a starting balance, and clicks Deploy. The playground builds an origination operation and submits it via the SDK. The result card shows the originated `KT1` address and a tzkt link to the new contract.

**Why this priority**: Lets users exercise origination end-to-end and seed contracts they can then interact with via Story 5, without leaving the dapp.

**Independent Test**: Paste a minimal valid `{ code, storage }` JSON for a counter contract → click Deploy → wallet approves → result card shows operation hash and, after the indexer/RPC resolves the originated address, the new `KT1` is displayed with a clickable indexer link.

**Acceptance Scenarios**:

1. **Given** valid Michelson JSON in the textarea, **When** the user clicks Deploy, **Then** an origination operation is sent through the wallet and an operation hash is returned.
2. **Given** the operation is injected, **When** the new `KT1` is resolved (via indexer or RPC), **Then** the result card displays the new address with a link to the indexer.
3. **Given** malformed or invalid JSON, **When** the user clicks Deploy, **Then** the test card surfaces a clear error without sending an operation.

---

### User Story 7 - Runtime SDK version switcher (Priority: P3)

A user opens the SDK-version dropdown in the wallet-control header, selects a different published version of `@tezos-x/octez.connect-dapp` (e.g., `5.0.0-beta.6`), the choice is persisted, and the page reloads. After reload, the playground boots against the selected version (a header badge confirms which version is running). If the chosen version cannot be loaded from the CDN, the dapp falls back to the locally bundled version and shows a non-blocking notice.

**Why this priority**: Powerful but secondary feature for comparing SDK behavior across versions. Depends on the playground existing and producing reports that make version comparison meaningful.

**Independent Test**: Default load shows `4.8.5` in the version badge → change the selector to `5.0.0-beta.6` → page reloads → the badge now reads `5.0.0-beta.6`, a basic connect and a read test still work → switch back to `4.8.5` → page reloads cleanly → simulate a CDN failure (e.g., a non-existent custom version) → app falls back to bundled version and surfaces a toast.

**Acceptance Scenarios**:

1. **Given** the version selector includes the supported versions and a custom-version input, **When** the user picks a version, **Then** the choice persists across reloads and the badge reflects the running version.
2. **Given** the chosen version is reachable from the CDN, **When** the dapp boots, **Then** the runtime SDK is loaded from the CDN (not the statically bundled package).
3. **Given** the CDN load fails, **When** the dapp boots, **Then** it falls back to the bundled SDK version and shows the user a notice explaining the fallback.
4. **Given** a version-specific API breakage occurs in a test, **When** the test runs, **Then** the failure is captured as a per-test error rather than crashing the playground.

---

### User Story 8 - Stubbed-as-disabled tests for out-of-scope flows (Priority: P3)

A user sees the breadth of common Tezos test flows in the playground, including ones the dapp intentionally doesn't implement (Sapling, Etherlink/Tezlink bridges, local fee estimation, on-chain signature verification, captcha-gated faucet). These show as disabled cards with a clear reason ("not feasible with octez.connect + RPC alone"), so users immediately understand scope without believing a test is "missing".

**Why this priority**: Quality-of-life: prevents users from filing "where is X?" issues by visibly enumerating the scope decision.

**Independent Test**: Open the playground → scroll to any out-of-scope card → its Run button is disabled, its status reads as disabled, and a tooltip/inline message explains why.

**Acceptance Scenarios**:

1. **Given** the playground renders all tests, **When** an out-of-scope test card is shown, **Then** its Run button is disabled and a reason is displayed.
2. **Given** a "Run all" action is triggered, **When** disabled cards are encountered, **Then** they are skipped (not recorded as failures) and do not appear in the success/error tallies.

---

### Edge Cases

- **Wallet rejection mid-run-all**: a rejected wallet approval is recorded as `error` for that test; the run continues with the next test (does not abort the sequence).
- **Indexer API down**: dynamic contract interaction and report enrichment fall back to the RPC node's `/contracts/<kt>/entrypoints` and inline addresses; user sees a clear error if both fail.
- **CDN unavailable or hung for SDK version**: the SDK loader falls back to the statically bundled SDK after either an explicit error or a 10-second timeout (whichever fires first), and surfaces a toast explaining the fallback; the playground remains usable.
- **Network switch while connected**: if the wallet doesn't support the destination network, the user is shown a clear status; otherwise the active session is preserved (no forced re-pairing on toggle).
- **Tz5 (BLS) signing without a tz5 account**: the tz5 BLS signing test detects a non-tz5 active address and instructs the user to switch to a tz5 account rather than failing opaquely. (Both Mainnet and Shadownet support protocol-U as of 2026-06-15, so no network-side gating is required.)
- **Sign-payload bytes**: payload length is computed from UTF-8 byte length (not string `.length`), so multi-byte characters in the message round-trip correctly.
- **Reload during run-all**: an in-flight run-all cannot be resumed mid-flight; on reload, any tests that completed before the reload are NOT promoted to a numbered run (the partial batch is discarded). Numbered runs that were already completed before the reload remain in the run history (they persist across reload — see FR-058 / FR-059).
- **Invalid Michelson JSON**: deploy-from-JSON shows a clear validation error before attempting wallet submission.
- **Empty or invalid KT1 in dynamic panel**: input is validated; entrypoint lookup is not attempted on malformed addresses.
- **No wallet installed**: connect call surfaces the SDK's standard "no wallet" error in the wallet-control UI without breaking other read-only tests.
- **Network with no registered default for a contract test**: the test card renders with an empty contract-address input and an inline message asking the user to supply an address; the Run button stays enabled (the user can paste one) but does not auto-execute on "Run all (full)" unless an address is provided.
- **Mainnet "Run all (full)" risk**: when the active network is Mainnet, the global "Run all (full)" action surfaces an explicit confirmation prompt before executing mutating tests so the user does not accidentally spend real funds.

## Requirements *(mandatory)*

### Functional Requirements

#### Wallet & session

- **FR-001**: System MUST restore the active wallet account on startup, so a page reload preserves the connected UI without re-prompting for pairing.
- **FR-002**: System MUST treat "Connect" as a no-op when an active account already exists (no client destroy/recreate, no pairing UI), and only request permissions when no active account is present.
- **FR-003**: System MUST expose an explicit "Disconnect" action that clears the active account, sets connection status to "Not connected", and collapses account-dependent UI.
- **FR-004**: System MUST re-register event subscriptions (active-account, active-transport) after every client recreation, so network switches don't silently lose status updates.

#### Signing

- **FR-005**: System MUST encode sign-payload requests with an explicit signing type (defaulting to micheline-packed) and a properly framed payload string, so wallets accept the request without rejecting raw ASCII.
- **FR-006**: System MUST compute the payload length using the UTF-8 byte length of the message (not the JavaScript string length), so multi-byte characters are framed correctly.
- **FR-007**: System MUST pass the active account's address as the source address when calling sign-payload, so wallets can route the request to the correct account.

#### Playground structure

- **FR-008**: System MUST replace the home route (`/`) with a test-playground page and preserve the existing marketing home at `/legacy`.
- **FR-009**: System MUST render tests grouped by category (Core, Staking/Delegation, Contracts, Crypto, Tokens, View-data) in collapsible sections, with an aggregate status indicator per category.
- **FR-010**: System MUST render each test as a card with: title, description, required scope, editable inputs (text/number/boolean/textarea/JSON) with defaults, a Run button, a status indicator, and a result region.
- **FR-011**: System MUST disable the Run button on a test card when (a) the test requires a wallet and none is connected, or (b) the test is marked as disabled (stub).
- **FR-012**: System MUST persist test metadata (id, title, category, description, scope, safe-for-run-all flag, enabled flag, disabled reason, inputs, run handler) in a single registry so all tests are discoverable and uniformly rendered.

#### Test result UX

- **FR-013**: System MUST display each test's status as one of idle / running / success / error, with visually distinct indicators.
- **FR-014**: System MUST show, on success, the test duration, a human summary, raw request and response JSON (collapsible), and any operation hash or signature returned.
- **FR-015**: System MUST link operation hashes to the active network's indexer (`tzkt.io` for Mainnet, `shadownet.tzkt.io` for Shadownet) as `target="_blank"` external links.
- **FR-016**: System MUST display, on error, the error message in the result region while keeping the request payload visible for debugging.
- **FR-017**: System MUST provide a per-card copy-to-clipboard action that copies the result payload.

#### Network toggle & configuration

- **FR-018**: System MUST expose a Mainnet ⇄ Shadownet toggle in the wallet-control header that drives the SDK client, RPC base URL, indexer API base URL, and explorer base URL from a single configuration source.
- **FR-019**: System MUST reinitialize the SDK client when the selected network changes (and only then), preserving the active session when the destination network is supported by the wallet.
- **FR-020**: System MUST derive explorer link base URLs from the active network's indexer configuration rather than inferring them from a network-name string.

#### Per-network contract defaults

- **FR-021**: System MUST maintain a per-network registry of default contract addresses used by tests (at minimum: a counter contract, an FA2 contract for transfer/mint/burn, an FA2 contract for balance reads). The registry is keyed by `(network, contractRole)` so each role has at most one default per network.
- **FR-022**: System MUST seed each contract-address test input from the registry on (a) initial render and (b) network toggle. Inputs remain user-editable; manual edits override the registry default for the duration of the page-load.
- **FR-023**: When a contract role has no registered default for the active network, the system MUST render the input empty with an inline message ("No default registered for this network — paste a contract address") and MUST NOT pre-populate from a different network's default.
- **FR-024**: The per-network contract registry MUST be defined in a single configuration file alongside the network endpoints (RPC/indexer URLs), so future addresses can be added in one place. Shadownet defaults ship with this feature; Mainnet defaults are populated when the user supplies addresses (and may be deployed in a follow-up — see Open Questions).

#### Test set — core, staking, contracts, crypto, tokens, view-data

- **FR-025**: System MUST provide a "Send tez" test (transaction operation, configurable destination and amount).
- **FR-026**: System MUST provide a "Batch" test that submits multiple operations in a single SDK request.
- **FR-027**: System MUST provide a "Contract call" test that defaults its contract address to the active network's counter default (Shadownet: `KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA`) with entrypoints `increment` / `decrement` / `reset`, where the contract address is a configurable input per FR-022.
- **FR-028**: System MUST provide "Set delegate" and "Remove delegate" tests using the delegation operation.
- **FR-029**: System MUST provide "Stake", "Unstake", and "Finalize unstake" tests as transactions to the active account with the corresponding entrypoint.
- **FR-030**: System MUST provide tests for "Increase paid storage", "Register global constant", "Set deposits limit", and a generic "Origination" operation with a small default script.
- **FR-031**: System MUST provide a "Deploy from Michelson JSON" test where the user pastes a `{ code, storage }` JSON object and the playground submits an origination operation, returning the resulting `KT1` address.
- **FR-032**: System MUST provide "Read contract storage" (RPC) and "Contract view execution" (RPC `run_script_view`) tests, where contract address and view name are configurable inputs.
- **FR-033**: System MUST provide a Dynamic Contract Interaction panel where pasting a `KT1` lists entrypoints (via indexer, with RPC fallback), renders a JSON-schema-seeded parameter textarea, and submits the chosen call via the SDK.
- **FR-034**: System MUST provide "Sign payload RAW", "Sign payload MICHELINE", and a "tz5 BLS signing" test; the tz5 test MUST detect non-tz5 active accounts and instruct the user to switch to a tz5 account before attempting to sign. (Both Mainnet and Shadownet are assumed to support protocol-U BLS keys, so the test does not require a separate network.)
- **FR-035**: System MUST provide FA2 transfer / mint / burn tests (transactions with Michelson params, contract address configurable per FR-022) and an FA2 balance read test (via RPC).
- **FR-036**: System MUST provide RPC-read view-data tests: "Account balance" (`/contracts/<addr>/balance`), "Block inspection" (`/chains/main/blocks/<N>`), and "Contract events poll" (`/blocks/<n>/operations`). All view-data tests MUST be marked safe-for-run-all.
- **FR-037**: System MUST render disabled "stub" cards (Sapling, Etherlink bridge, Tezlink bridge, local fee estimation, on-chain signature verification, faucet) with a clear `disabledReason` and skip them during run-all.

#### Test runner & run-all

- **FR-038**: System MUST execute tests one at a time and store results keyed by test id (with status, request, response, op hash, signature, explorer URL, summary, error, and duration fields) for the per-card last-result display. Each "Run all (safe)" or "Run all (full)" invocation additionally produces a numbered run snapshot — see FR-058.
- **FR-039**: System MUST provide a "Run all (safe)" action that runs only tests flagged safe-for-run-all (no wallet prompts, no on-chain mutations), sequentially.
- **FR-040**: System MUST provide a "Run all (full)" action that runs every enabled test sequentially using each test's default inputs, awaiting each call so wallet approvals appear one at a time; rejections/failures are recorded per-test and do not abort the run.
- **FR-041**: When "Run all (full)" is triggered while the active network is Mainnet, the system MUST display a browser-native `confirm()` dialog warning that real funds will be spent before executing any mutating test. If the user dismisses (Cancel) the prompt, the action aborts without sending any operation and without creating a numbered run in history; on OK, the run proceeds normally.
- **FR-042**: When "Run all (full)" encounters a contract test whose contract-address input is empty (no default for active network and no user-supplied value), the system MUST skip that test, record it as `error` with an explanatory message ("no contract address supplied for active network"), and continue the run.
- **FR-043**: System MUST show k/N progress in the header during a run-all execution.
- **FR-044**: System MUST allow resetting the per-card last-result display for a single test card without affecting any numbered run in history. (Clearing the entire run history is handled separately — see FR-061.)

#### Export

- **FR-045**: System MUST generate a Markdown report scoped to a single numbered run from the run history (the user selects which run to export, defaulting to the most recent run). The report MUST contain a meta table (run number, generatedAt, network, RPC URL, wallet address, SDK version, dapp version), per-category result tables with columns for test name, status, duration, and op-hash-or-result, where op hashes are rendered as Markdown links to the active indexer.
- **FR-046**: System MUST provide JSON download and copy-to-clipboard export options sharing the same underlying report data structure.
- **FR-047**: System MUST trigger downloads using browser-native mechanisms (Blob + object URL + anchor click) and clipboard writes using the standard clipboard API with a hidden-textarea fallback — no new third-party dependencies for export.

#### Runtime SDK version switching

- **FR-048**: System MUST expose a version selector in the wallet-control header listing the supported `@tezos-x/octez.connect-dapp` versions plus a free-form custom-version input; the active version MUST be displayed in a header badge.
- **FR-049**: System MUST persist the selected version (e.g., in browser local storage) and reload the page on change so the playground boots against the chosen version.
- **FR-050**: System MUST load the runtime SDK from a CDN at boot using a bundler-opaque dynamic import, so the URL is not rewritten by the build tooling.
- **FR-051**: System MUST cache the resolved SDK module as a singleton per page-load.
- **FR-052**: System MUST fall back to the statically bundled SDK package if the CDN import fails **or does not resolve within 10 seconds of starting**, and surface a user-visible notice describing the fallback. The 10-second timeout treats a hung CDN identically to an explicit error.
- **FR-053**: System MUST keep static SDK imports as type-only (erased at build) and obtain runtime values (client constructor, enums) from the dynamically loaded module.
- **FR-054**: System MUST express SDK-specific operation kinds and signing types as string literals (e.g., `'transaction'`, `'micheline'`) in the test registry so tests remain version-agnostic.
- **FR-055**: System MUST gate playground controls until the dynamic SDK load resolves; on dynamic-import failure, the dapp boots with the bundled fallback and gating is released.
- **FR-056**: System MUST report per-test errors when the chosen SDK version's API differs in a way that breaks a specific test, rather than crashing the playground.

#### Out-of-scope guard

- **FR-057**: System MUST contain no Taquito (`@taquito/*`) imports anywhere in the application source.

#### Run history

- **FR-058**: System MUST group results from each "Run all (safe)" or "Run all (full)" invocation into a numbered run ("RUN 1", "RUN 2", …, monotonically increasing and never reused within the active session). Each numbered run captures a snapshot of the test results that completed during that invocation, plus run metadata (run type, started/ended timestamps, SDK version active during the run, network active during the run, optional wallet address, pass count, fail count, total count).
- **FR-059**: System MUST render the run history as a separate panel of collapsible sections beneath the test categories. Each section header MUST display the run number, run type ("safe" or "full"), SDK version, network, started timestamp, and a pass/fail summary in the form "k/N passed". Each section body MUST display all per-test results captured in that run, formatted identically to the per-card result region (status, duration, summary, op hash with indexer link, collapsible request/response, error).
- **FR-060**: System MUST provide a per-run delete control ("✕") on each run-history section header that removes only that run from the history, leaving all other runs and per-test-card last-result state intact.
- **FR-061**: System MUST provide a "Clear all" action on the run-history panel that removes every numbered run from the history. This action does NOT affect per-test-card last-result state.
- **FR-062**: Individual "Run" clicks on a test card MUST update only the card's inline last-result display and MUST NOT create or mutate any numbered run.
- **FR-063**: System MUST persist the run history across page reload (so the user can switch SDK versions — which requires a reload — and still see the previous run's outcome alongside the new one). A user-driven "Clear all" or per-run "✕" is the only way to remove a run.

#### Concurrency

- **FR-064**: At most one "Run all (safe)" or "Run all (full)" invocation MAY be in flight at any time. While one is in flight, the other Run-all button MUST be disabled.
- **FR-065**: While a Run-all is in flight, individual test-card "Run" clicks MUST be queued (FIFO) and executed sequentially after the Run-all completes. Queued individual runs do NOT join the in-flight numbered run — they execute as ordinary individual runs per FR-062 and update only the card's inline last-result display.
- **FR-066**: Test cards with queued individual runs MUST surface a visible "queued" indicator on the card until the queued run starts executing.

### Key Entities *(include if feature involves data)*

- **NetworkConfig**: Named network entry (Mainnet, Shadownet). Attributes: SDK network type, RPC base URL, indexer UI base URL, indexer API base URL, plus a map of `contractRole → defaultKT1`. Single source of truth driving the SDK client, RPC reads, indexer lookups, explorer link rendering, and default contract addresses per network.
- **ContractDefault**: Per-network default contract address for a named role (e.g., `counter`, `fa2-transfer`, `fa2-balance`). Attributes: network, role, KT1 address. Used to seed test inputs on render and on network toggle.
- **TestDefinition**: Static metadata describing a single playground test. Attributes: id, title, category (core/staking/contracts/crypto/tokens/view-data), description, required scope (octez-connect/rpc-read/both/none), safe-for-run-all flag, enabled flag, optional disabled reason, list of inputs (key/label/type/default-resolver/placeholder/help — where `default-resolver` may consult the network registry), run handler.
- **TestContext**: Per-run inputs supplied to a test handler. Attributes: SDK client, RPC service, optional active account, user-edited inputs map, active network type.
- **TestResult**: Per-test result snapshot. Attributes: testId, title, category, status (idle/running/success/error), startedAt, endedAt, durationMs, request payload, response payload, optional transaction hash, optional signature, optional explorer URL, optional human summary, optional error message.
- **PlaygroundReport**: Exportable artifact derived from a single numbered run. Attributes: meta (runNumber, generatedAt, network, rpcUrl, walletAddress, sdkVersion, beaconId, dappVersion) plus a list of TestResult drawn from that run.
- **PlaygroundRun**: A numbered batch of test executions produced by a "Run all (safe)" or "Run all (full)" invocation. Attributes: runNumber (monotonically increasing within the session), runType (`safe` | `full`), startedAt, endedAt, sdkVersion, network, optional walletAddress, passCount, failCount, totalCount, results (list of TestResult captured during the run). Created on run-all invocation; preserved in the persisted run history until explicitly deleted (per FR-060) or cleared (per FR-061).
- **SdkSelection**: User-chosen runtime SDK version. Attributes: version string, persisted in browser local storage; resolves to a loaded SDK module (DAppClient constructor plus relevant enums) at page-load.
- **EntrypointDescriptor** (Dynamic Contract Interaction): Indexer-supplied or RPC-supplied descriptor of one callable contract entrypoint. Attributes: name, JSON parameter schema. Drives the dropdown and the parameter textarea seed value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After connecting once, 100% of subsequent page reloads in the same browser session restore the connected UI without showing the wallet-pairing UI.
- **SC-002**: Clicking "Connect" while already connected triggers no wallet pairing UI in 100% of attempts (verified by observing zero new pairing prompts across 10 consecutive clicks).
- **SC-003**: Signing the message `test` against any supported wallet succeeds on the first attempt, with the wallet receiving the micheline-packed payload framing (`0501…74657374`).
- **SC-004**: The default landing route (`/`) renders the test playground in under 3 seconds on a typical broadband connection, and the legacy marketing home remains reachable at `/legacy`.
- **SC-005**: Read-only "Run all (safe)" completes every safe-for-run-all test without requiring a wallet connection, populating result cards in sequential order.
- **SC-006**: With a funded wallet on Shadownet, "Run all (full)" walks through every enabled test 1→N, the header continuously displays the current k/N progress, and a rejected wallet approval is recorded as an error for that test without aborting the sequence.
- **SC-007**: The exported Markdown report contains at least one operation hash rendered as a clickable link that resolves to the active indexer's transaction page (tzkt.io or shadownet.tzkt.io).
- **SC-008**: Toggling Mainnet ⇄ Shadownet updates the SDK client, RPC base URL, indexer API base URL, explorer base URL, and per-network contract defaults in a single user action; all subsequent RPC reads target the new endpoint within 1 second of the toggle.
- **SC-009**: After a network toggle, every contract test card displays the new active network's registered default address (or an empty input with a "no default registered" hint if no Mainnet default has been supplied yet) — no card shows a stale address from the previous network.
- **SC-010**: Pasting a valid KT1 into the Dynamic Contract Interaction panel lists at least the known callable entrypoints of the counter contract (`increment`, `decrement`, `reset`) within 3 seconds on a typical broadband connection; if the indexer is unreachable, the RPC fallback delivers the same list (possibly without JSON schemas).
- **SC-011**: Deploying a minimal `{ code, storage }` Michelson JSON via the Deploy-from-Michelson test produces an operation hash and, once the operation is included, displays the resulting KT1 with a working indexer link.
- **SC-012**: Switching the SDK version via the selector persists the choice across reload and the header badge reflects the running version on every reload; if the CDN load fails, the bundled-fallback notice is shown and the playground remains usable for the rest of the session.
- **SC-013**: A production build (`ng build --configuration production`) completes successfully and a search of `src` for `@taquito` returns no matches.
- **SC-014**: A search of `src` finds only type-only static imports of `@tezos-x/octez.connect-dapp`; all runtime SDK values come from the dynamic loader.
- **SC-015**: At least 6 distinct test categories are visible on the playground (Core, Staking/Delegation, Contracts, Crypto, Tokens, View-data), each containing at least one runnable test.
- **SC-016**: The tz5 BLS signing test, when run with a tz5 active account on Mainnet or Shadownet (both protocol-U as of 2026-06-15), returns a BLS signature; when run with a non-tz5 active account, it surfaces a user-readable explanation rather than a stack trace.
- **SC-017**: When "Run all (full)" is triggered on Mainnet, an explicit confirmation prompt is shown before any mutating test executes, and dismissing the prompt aborts the run with zero on-chain operations sent and no numbered run created in history.
- **SC-018**: After running "Run all (safe)" or "Run all (full)" twice in a session (potentially with an SDK-version switch and reload between them), the run-history panel shows two numbered runs (RUN 1, RUN 2) each labeled with the SDK version and network active during that run and a pass/fail summary; either can be expanded, exported, or deleted independently.
- **SC-019**: Reloading the page does not remove completed numbered runs from history; only an explicit "Clear all" or per-run "✕" deletes them.
- **SC-020**: When the SDK CDN does not respond within 10 seconds, the playground boots against the bundled SDK and displays the fallback notice; user-facing controls are never gated for more than 10 seconds on a slow or hung CDN.
- **SC-021**: During an in-flight Run-all, clicking individual test "Run" buttons enqueues them visibly (queued indicator on the card) and the queued tests start executing only after the Run-all completes; the second Run-all button is disabled and produces no effect when clicked during an in-flight Run-all.

## Assumptions

- Existing infrastructure: the dapp's already-global Buffer polyfill is available for micheline payload framing; Angular `HttpClient` is wired up globally (no new HTTP library needed).
- Network endpoints: the canonical RPC URLs (`https://tezos-mainnet.octez.io`, `https://tezos-shadownet.octez.io`) and indexer API URLs (`https://api.tzkt.io`, `https://api.shadownet.tzkt.io`) are stable for the lifetime of this feature.
- Default counter contract on Shadownet: `KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA` (storage `int`, entrypoints `increment:int`, `decrement:int`, `reset:unit`) is the verified default; its address is editable per-test so others can swap it.
- Default contracts on Mainnet are network-specific and **not equivalent to the Shadownet addresses**: the spec ships with Shadownet defaults populated and Mainnet entries left empty until the user supplies them (see Open Questions). When unset, Mainnet runs of contract tests prompt the user to paste an address rather than reusing a Shadownet KT1 (which would target a non-existent contract on Mainnet). For the counter role on Mainnet specifically, the user will deploy a fresh counter contract themselves with implementation-time guidance from this work; once deployed, the resulting Mainnet KT1 is added to the per-network registry alongside the Shadownet default.
- CDN serving: esm.sh reliably serves `@tezos-x/octez.connect-dapp@<version>` for the documented supported versions; transient CDN failures are handled by the bundled-package fallback.
- Wallet behavior: at least one supported wallet is installed by the user and supports both Mainnet and Shadownet; users with only one supported network see appropriate connection-status messages but no automated network-availability discovery is performed.
- Tz5 BLS test prerequisites: as of 2026-06-15, protocol-U is merged into both Mainnet and Shadownet, so the tz5 (BLS) signing path works on either network. Testing it requires the user to have a tz5 (BLS) account in their wallet; the playground does not provision such accounts. (A future Previewnet L2 — a Layer-2 chain whose L1 is Shadownet — is explicitly out of scope for this session and will be tracked separately.)
- Scope exclusions (intentional, surfaced as disabled stub cards): Sapling, Etherlink/Tezlink bridges, local fee estimation, on-chain signature verification, captcha-gated faucet — these are not feasible through octez.connect + raw RPC alone.
- Mutating operations during "Run all (full)" use safe defaults (tiny amounts, configurable destinations) so a wallet-approved full run does not move significant value without user-supplied input changes. On Mainnet, the additional confirmation prompt (FR-041) acts as a second gate.
- Persistence: test results live in memory for the active page-load; users export to Markdown/JSON/clipboard for durable artifacts. There is no server-side history.
- Deployment cadence: deploying to GitHub Pages (the existing workflow) happens only after the user confirms a release.
- No new top-level dependencies are added (no Taquito, no extra HTTP/Markdown/clipboard libraries) — the feature builds on what is already in `package.json`.

## Open Questions

These items are deliberately surfaced for the user's input before `/speckit-plan` finalizes:

- **OQ-1: Mainnet FA2 contract defaults (open).** Two FA2 roles still need a Mainnet default address: (a) FA2 transfer / mint / burn, (b) FA2 balance read. Mint and burn typically require operator permissions tied to a specific deployment, so a stable Mainnet FA2 the user already controls is preferable to deploying a new one. The user has confirmed they can reuse an existing Mainnet FA2 but does not yet know which one to use. **Action**: identify a suitable Mainnet FA2 contract (one the user can sign transfer/mint/burn on with their wallet) before implementation reaches the Tokens category; until then, the FA2 cards on Mainnet render with empty contract inputs per FR-023 / FR-042.
- **OQ-1 (resolved — counter on Mainnet):** the user will deploy a fresh counter contract on Mainnet themselves with implementation-time guidance from this work. The Mainnet counter KT1 is added to the per-network registry once the deployment lands. Until then, the counter test on Mainnet renders with an empty contract input per FR-023.
- **OQ-2 (resolved — protocol-U network).** Protocol-U is merged into both Mainnet and Shadownet as of 2026-06-15, so the tz5 BLS signing test does not need a separate test network. A future Previewnet L2 (L1 = Shadownet) is out of scope for this session and will be tracked separately.
