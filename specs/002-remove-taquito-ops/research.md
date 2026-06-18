# Phase 0 Research: Remove Taquito-Dependent Operations & Verify octez.connect 4.8.6

## R1 — What counts as "an operation that requires taquito"?

**Decision**: Remove exactly the tests declared with `requiredScope: 'rpc-read'`. There are 7:
`view.account-balance`, `view.block-inspect`, `view.contract-events-poll`, `view.tzip16-metadata` (all of `view-data.tests.ts`), `contracts.read-storage`, `contracts.run-view`, and `tokens.fa2-balance-read`.

**Rationale**: octez.connect is a wallet-brokering SDK; it signs and submits operations and signs payloads. It does not read chain or indexer state. Every `rpc-read` test reaches the node RPC / indexer directly (via `ctx.rpc` / `ctx.indexer`), never touching `ctx.client` (the octez.connect `DAppClient`). In a conventional Tezos dApp those reads are performed through a chain-reading library such as Taquito — hence the user's framing "operations which require taquito." The `requiredScope` field already encodes this distinction precisely, giving an unambiguous, code-grounded removal criterion.

**Alternatives considered**:
- *Literal "imports @taquito"*: rejected — the codebase imports no Taquito package, so this would remove nothing, contradicting the explicit request to remove operations.
- *Only the `safeForRunAll` set (6 tests)*: rejected — that omits `contracts.run-view`, which is also a pure `rpc-read` (it requires a deployed contract so it was never flagged safe-for-run-all). It is still a read octez.connect cannot do, so it belongs in the removed set. `safeForRunAll ⊂ rpc-read`; using `rpc-read` is the correct superset.

## R2 — Retiring the safe/full run distinction without breaking persisted history

**Decision**: Collapse to a single run-all path. Internally narrow `inFlightRunAll$` to a boolean-ish flag and stop writing a meaningful `runType` on new runs. **Keep `PlaygroundRun.runType` as an optional field that tolerates legacy values** so previously-persisted runs (which may contain `runType: 'safe'`) rehydrate and display without error.

**Rationale**: FR-006 / SC-004 require the app not to crash on persisted state referencing removed concepts. Run history is capped at 50 entries in `localStorage` and will naturally age out, so a heavy migration is unwarranted. Making the field optional/tolerant is the minimal safe change. The display (`run-history.component.html`) and export (`report-export.service.ts`) must render a run whose `runType` is absent or legacy without throwing.

**Alternatives considered**:
- *Hard-migrate or wipe persisted runs on load*: rejected — destroys user history for no functional gain.
- *Keep both buttons but disable safe*: rejected — the user explicitly said the safe run "does not make sense"; a dead button is worse than removal.

## R3 — Mainnet confirmation "mutating" count after dropping `safeForRunAll`

**Decision**: The mainnet confirmation prompt stays (FR-005). Replace its `tests.filter((t) => !t.safeForRunAll)` mutating-count with a check based on `requiredScope`: an operation is "mutating" if it submits through the wallet — i.e., `requiredScope` includes octez-connect (`'octez-connect'` or `'both'`). After removal, all retained run-all operations require the wallet, so the prompt simply reports the full count of operations being submitted on mainnet.

**Rationale**: `safeForRunAll` is being retired, so the count must be derived from a surviving field. `requiredScope` is the natural, already-present signal for "does this hit the wallet." Sign-payload operations technically don't mutate chain state, but they DO prompt the wallet on mainnet and are worth surfacing; counting all wallet-scoped operations is the conservative, user-protective choice.

**Alternatives considered**: Keep `safeForRunAll` solely to feed the count — rejected as vestigial; one boolean per test with no other purpose is dead weight once the safe run is gone.

## R4 — Removing the `view-data` category and `safeForRunAll` field cleanly

**Decision**: Delete `view-data.tests.ts`; remove `'view-data'` from the `TestCategory` union, from `TESTS_BY_CATEGORY`, `CATEGORY_META`, and `CATEGORY_ORDER` in `tests/index.ts`; and delete the `safeForRunAll` field from the `TestDefinition` interface and from every test literal. Re-evaluate whether `RequiredScope` still needs `'rpc-read'`/`'both'` — after removal no retained test uses `'rpc-read'`; keep the type members for forward-compatibility but note they are unused by active tests.

**Rationale**: TypeScript will flag every dangling reference at compile time, making the removal verifiable by the build. Keeping the `RequiredScope` union intact avoids churn in the registry contract and leaves room for re-adding reads later without a type change.

**Alternatives considered**: Leave `view-data` category empty but present — rejected; an empty category renders confusingly and contradicts "remove from the list."

## R5 — Sourcing octez.connect 4.8.6

**Decision**: Set `DEFAULT_VERSION = '4.8.6'` in `sdk-loader.service.ts`, add `'4.8.6'` as the first entry of `SUPPORTED_VERSIONS`, and bump `package.json` `@tezos-x/octez.connect-dapp` to `4.8.6` so the **bundled** SDK is 4.8.6 (not just a CDN-loaded override). The existing loader still attempts an `esm.sh` CDN import for the selected version and falls back to the bundled version on failure.

**Rationale**: The verification goal ("using 4.8.6") must hold even when offline or when the CDN is unreachable; bundling 4.8.6 guarantees the fallback IS 4.8.6, so a fallback no longer silently downgrades the verified version. FR-012/SC-004 require the playground to display the version actually used — the existing "bundled fallback" badge already covers this and now both paths resolve to 4.8.6.

**Alternatives considered**: Bump only the loader default but leave `package.json` at 4.8.5 — rejected; a CDN failure would fall back to 4.8.5 and invalidate "verified on 4.8.6."

## R6 — Operational definition of "succeed"

**Decision**: An operation "succeeds" when it reaches its **expected** outcome:
- **Normal wallet-submission operations** (send tez, batch, contract call, deploy, increase-paid-storage, register-global-constant, set-deposits-limit, transaction-limit, FA2 transfer/mint/burn, set/remove-delegate, stake/unstake/finalize-unstake): the wallet accepts and the operation is injected (a tx hash is produced) or the SDK returns a successful operation result.
- **Signature operations** (sign Micheline, sign raw, sign tz5 BLS): a valid signature string is returned.
- **Intentional-failure operations** (`contracts.failing-contract` / FAILWITH, `contracts.failing-noop` / malformed destination): the *expected* failure is produced — these are recorded as meeting expectations, not as feature failures (FR-009).
- **Precondition-blocked**: when a required precondition is absent (no wallet, missing target/FA2/counter contract for the active network, no tz5 BLS account, no baker), the operation reports a clear "blocked" status distinct from an unexpected failure (FR-010). The runner already records `errorResult(def, 'no contract address supplied for active network')` for missing network defaults; reuse/extend that path.

**Rationale**: The current `TestRunnerService` maps any thrown error to `status: 'error'`, which would mislabel intentional-failure tests and precondition gaps. Verification (US3/SC-003) must judge against expectation, not raw success/error. This research fixes the *evaluation* semantics for the verification deliverable; the per-test pass/expected-fail/blocked classification lives in the verification matrix contract.

**Alternatives considered**: Treat the existing `success`/`error` status verbatim — rejected; it would mark the two intentional-failure tests as failures and fail SC-003 spuriously.

## Resolved unknowns

All Technical Context items are resolved; no `NEEDS CLARIFICATION` markers remain. The one open product-level interpretation (what "requires taquito" means) is settled in R1 and matches the spec's documented assumption.
