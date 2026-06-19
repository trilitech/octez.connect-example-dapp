---
description: "Task list for 002-remove-taquito-ops"
---

# Tasks: Remove Taquito-Dependent Operations & Verify octez.connect 4.8.6

**Input**: Design documents from `/specs/002-remove-taquito-ops/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No new test suites requested. Existing unit specs that reference removed APIs are updated as implementation tasks (T019, T020).

**Organization**: Tasks grouped by the three P1 user stories. US1 and US2 share several files (`test-types.ts`, `contracts.tests.ts`, `tokens.tests.ts`) — those tasks are sequenced, not parallel. US3 (verification) depends on US1 + US2 + the SDK bump.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- All paths are relative to repo root `/Users/vitaliinazarov/work/infra/beacon-example-dapp/`

---

## Phase 1: Setup

**Purpose**: Establish a green baseline before changes.

- [X] T001 Confirm a clean baseline: run `npm install`, `npm run build`, and `npm test` and note current pass state in the PR description (no code change).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Bump the bundled + default SDK to octez.connect 4.8.6 so all verification runs against 4.8.6 even on CDN fallback. Blocks US3.

- [X] T002 [P] Bump `@tezos-x/octez.connect-dapp` from `4.8.5` to `4.8.6` in `package.json`.
- [X] T003 [P] In `src/app/playground/services/sdk-loader.service.ts`: set `DEFAULT_VERSION = '4.8.6'`, make `'4.8.6'` the first entry of `SUPPORTED_VERSIONS` (keep `'4.8.5'` selectable below it), and update the header comment that says default `'4.8.5'`.
- [X] T004 Run `npm install` so the lockfile resolves `@tezos-x/octez.connect-dapp@4.8.6` (depends on T002).

**Checkpoint**: App boots with `SDK 4.8.6` in the header badge.

---

## Phase 3: User Story 1 - Playground lists only octez.connect operations (Priority: P1) 🎯 MVP

**Goal**: Remove the 7 read-only `rpc-read` operations so the list contains only octez.connect wallet/sign operations.

**Independent Test**: Load the playground — the `View data` category is gone and none of the 7 removed operations appear; 21 operations remain.

- [X] T005 [P] [US1] Delete `src/app/playground/tests/view-data.tests.ts` (removes `view.account-balance`, `view.block-inspect`, `view.contract-events-poll`, `view.tzip16-metadata`).
- [X] T006 [US1] In `src/app/playground/tests/index.ts`: remove the `VIEW_DATA_TESTS` import and its spread in `ALL_TESTS`; remove the `'view-data'` keys from `TESTS_BY_CATEGORY`, `CATEGORY_META`, and from the `CATEGORY_ORDER` array.
- [X] T007 [US1] In `src/app/playground/tests/test-types.ts`: remove `'view-data'` from the `TestCategory` union.
- [X] T008 [US1] In `src/app/playground/tests/contracts.tests.ts`: remove the `contracts.read-storage` and `contracts.run-view` test definitions (the two `requiredScope: 'rpc-read'` entries) and any now-unused imports/helpers they alone used.
- [X] T009 [P] [US1] In `src/app/playground/tests/tokens.tests.ts`: remove the `tokens.fa2-balance-read` test definition (the `requiredScope: 'rpc-read'` entry) and any now-unused imports it alone used.
- [X] T010 [US1] Build (`npm run build`) and load the app; confirm `ALL_TESTS` has 21 entries, no `View data` category renders, and no `rpc-read` test remains (depends on T005–T009).

**Checkpoint**: Operation list shows only the 21 wallet/sign operations.

---

## Phase 4: User Story 2 - "Run all (safe)" mode is removed (Priority: P1)

**Goal**: Retire the safe-run mode, the `safeForRunAll` flag, and the `runType` distinction; leave a single **Run all** control. Stay backward-compatible with persisted history.

**Independent Test**: Run controls show one **Run all** button (no "Run all (safe)"); a mainnet run-all still prompts for confirmation; loading legacy run history does not crash.

- [X] T011 [US2] In `src/app/playground/tests/test-types.ts`: remove the `safeForRunAll` field from `TestDefinition`; change `PlaygroundRun.runType` to optional & legacy-tolerant (`runType?: string`) per `contracts/test-registry-types.md` (same file as T007 — sequence after it).
- [X] T012 [US2] In `src/app/playground/services/test-runner.service.ts`: remove `runAllSafe()`; collapse `runAll(runType, tests)` into a single public `runAll()` that runs all `enabled` tests; narrow `inFlightRunAll$` to a boolean; stop writing a meaningful `runType` on new runs; recompute the mainnet "mutating" count from `requiredScope` (wallet-scoped = `'octez-connect'`/`'both'`) instead of `!safeForRunAll`; keep the mainnet `window.confirm` guard.
- [X] T013 [P] [US2] Remove the `safeForRunAll` line from every test literal in `src/app/playground/tests/core.tests.ts`, `crypto.tests.ts`, `staking.tests.ts`, and `stubs.tests.ts`.
- [X] T014 [US2] Remove the `safeForRunAll` line from every test literal in `src/app/playground/tests/contracts.tests.ts` and `tokens.tests.ts` (same files as T008/T009 — sequence after them).
- [X] T015 [US2] In `src/app/playground/components/wallet-control/wallet-control.component.ts`: remove `runAllSafe()`; rename the remaining handler to `runAll()` calling `testRunner.runAll()`; narrow the `inFlightRunAll` field type to `boolean`.
- [X] T016 [US2] In `src/app/playground/components/wallet-control/wallet-control.component.html`: remove the "Run all (safe)" `ion-button` (and its `inFlightRunAll === 'safe'` spinner); rename "Run all (full)" to "Run all" and bind it to `runAll()`; update its spinner/disabled binding to the boolean flag.
- [X] T017 [P] [US2] In `src/app/playground/components/run-history/run-history.component.html`: update the empty-state copy that says “Run all (safe)” or “Run all (full)” to reference the single “Run all”; render `run.runType` defensively so absent/legacy values don't error.
- [X] T018 [P] [US2] In `src/app/playground/services/report-export.service.ts`: render the "Run type" row only when `run.runType` is present/meaningful (tolerate missing/legacy values).
- [X] T019 [US2] Update `src/app/playground/services/test-runner.service.spec.ts`: remove the safe-run test path and the `safeForRunAll` fixture field; assert the single `runAll()` behavior (depends on T012).
- [X] T020 [P] [US2] Update `src/app/playground/services/report-export.service.spec.ts`: drop the `runType: 'safe'` fixture reliance so it matches the legacy-tolerant export.
- [X] T021 [US2] Build + run app: confirm exactly one **Run all** button, a mainnet run-all still confirms before submitting, and `npm test` passes (depends on T011–T020).

**Checkpoint**: Single run-all path; no `safeForRunAll`/`runAllSafe`/safe `runType` references remain in `src/`.

---

## Phase 5: User Story 3 - Remaining operations verified on octez.connect 4.8.6 (Priority: P1)

**Goal**: Confirm each of the 21 retained operations reaches its expected outcome on 4.8.6, per `contracts/verification-matrix.md`.

**Independent Test**: With a wallet connected on 4.8.6, every operation ends in success, an expected failure (#11/#12), or a clearly-labeled blocked state — zero unexpected errors — and the exported report attributes results to 4.8.6.

- [ ] T022 [US3] Confirm the header badge reads `SDK 4.8.6` (and that a `· bundled fallback`, if shown, is still 4.8.6) before verifying (depends on Phase 2).
- [ ] T023 [US3] Confirm the two intentional-failure tests (`contracts.failing-contract`, `contracts.failing-noop`) report their expected failure as an expected outcome and that precondition gaps surface a distinct "blocked"-style message rather than an opaque error; make a minimal adjustment in `src/app/playground/services/test-runner.service.ts`/the affected test handlers only if they are currently mislabeled (FR-009/FR-010).
- [ ] T024 [US3] With a connected wallet (and, where available, tz5 BLS account, counter + FA2 contracts, baker), run each retained operation per `contracts/verification-matrix.md`; record pass / expected-fail / blocked for all 21.
- [ ] T025 [US3] Trigger **Run all**, then export the Markdown report; confirm it lists only the 21 operations, attributes them to `4.8.6`, and shows no unexpected errors (SC-003/SC-004).
- [ ] T026 [US3] Backward-compat check: seed `localStorage['octez.connect.run-history']` with a legacy run (`runType: 'safe'` and a removed `testId` such as `view.account-balance`), reload, and confirm the history renders without errors (FR-006).
- [ ] T027 [US3] Mainnet-guard check: with the network set to mainnet, trigger **Run all** and confirm the confirmation dialog still fires before any submission (SC-005).

**Checkpoint**: All 21 operations verified on 4.8.6 with an exportable report.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T028 [P] Run `npm test` — all specs green.
- [X] T029 [P] Run `npm run build` — compiles with no references to `safeForRunAll`, `runAllSafe`, or the `view-data` category.
- [X] T030 Residual-reference guard: `grep -rn "safeForRunAll\|runAllSafe\|view-data\|view\.account-balance\|run-view\|read-storage\|fa2-balance-read" src/` returns only intentional/historical matches (ideally none in active code).
- [ ] T031 Walk through `specs/002-remove-taquito-ops/quickstart.md` end-to-end to validate the full feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: none.
- **Foundational (T002–T004)**: SDK bump; blocks US3 verification; independent of US1/US2 code edits.
- **US1 (T005–T010)** and **US2 (T011–T021)**: both P1. They share `test-types.ts` (T007→T011), `contracts.tests.ts` (T008→T014), `tokens.tests.ts` (T009→T014) — sequence those. Otherwise the two stories proceed together.
- **US3 (T022–T027)**: depends on US1 + US2 complete and Phase 2 (SDK 4.8.6).
- **Polish (T028–T031)**: after all stories.

### Within-file sequencing (shared files)

- `test-types.ts`: T007 (remove `view-data`) → T011 (remove `safeForRunAll`, optional `runType`).
- `contracts.tests.ts`: T008 (remove 2 rpc-read tests) → T014 (remove `safeForRunAll` lines).
- `tokens.tests.ts`: T009 (remove fa2-balance-read) → T014 (remove `safeForRunAll` line).
- `test-runner.service.ts`: T012 → T019 (spec) and possibly T023.

### Parallel Opportunities

- T002 ‖ T003 (different files).
- T005 ‖ T009 (different files) within US1.
- T013 ‖ T017 ‖ T018 ‖ T020 within US2 (distinct files, after their dependencies).
- T028 ‖ T029 in polish.

---

## Implementation Strategy

### MVP scope

US1 (remove the 7 read ops) is the smallest shippable increment — it directly delivers "the list no longer shows taquito-requiring operations." US2 removes the now-meaningless safe run. US3 is the verification gate on 4.8.6.

### Recommended order

1. Setup (T001) → Foundational SDK bump (T002–T004).
2. US1 (T005–T010) → validate list = 21 ops.
3. US2 (T011–T021) → validate single Run all + green specs.
4. US3 (T022–T027) → verify on 4.8.6, export report.
5. Polish (T028–T031).

---

## Notes

- This feature is net-removal; prefer deleting code over leaving dead flags.
- Let the TypeScript compiler find dangling references after removing `view-data`/`safeForRunAll` — T010/T021/T029 rely on a clean build as the completeness check.
- Verification (US3) requires a live wallet/network and is partly manual; "blocked" results for unattainable preconditions are acceptable and must be reported, not hidden.
