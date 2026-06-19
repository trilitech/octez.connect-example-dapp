# Implementation Plan: Remove Taquito-Dependent Operations & Verify octez.connect 4.8.6

**Branch**: `002-remove-taquito-ops` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-remove-taquito-ops/spec.md`

## Summary

Remove the playground's read-only chain/indexer query operations — the ones that do not go through octez.connect's wallet API and are conceptually the job of a separate chain-reading library (Taquito). In this codebase those are exactly the **7 tests with `requiredScope: 'rpc-read'`** (4 `view-data` tests + `contracts.read-storage` + `contracts.run-view` + `tokens.fa2-balance-read`). Because those 7 are the entire "safe-for-run-all" population (plus `run-view`), the **"Run all (safe)"** mode becomes empty and meaningless, so it is removed too — leaving a single "Run all" control. Finally, bump the verification SDK to **octez.connect 4.8.6** and confirm every remaining (wallet/sign) operation reaches its expected outcome on that version.

Technical approach: edit the static test registry (`src/app/playground/tests/`) to drop the `rpc-read` tests and the `view-data` category; collapse the dual safe/full run path in `TestRunnerService` and `WalletControlComponent` to a single run-all; retire the now-vestigial `safeForRunAll` flag and `runType` distinction while staying backward-compatible with persisted run history; and set 4.8.6 as the default/bundled SDK version in `package.json` and `sdk-loader.service.ts`.

## Technical Context

**Language/Version**: TypeScript 5.x (Angular 15)
**Primary Dependencies**: `@tezos-x/octez.connect-dapp` (4.8.5 → **4.8.6**), `@ionic/angular`, RxJS. No Taquito (the codebase never depended on it).
**Storage**: Browser `localStorage` — run history under `octez.connect.run-history`; SDK selection under `octez.connect.version`.
**Testing**: Jasmine/Karma unit specs (`*.spec.ts`) for services; manual in-browser verification recipe (quickstart.md) for end-to-end operation success against a live wallet/network.
**Target Platform**: Web (Ionic/Angular SPA), modern browsers.
**Project Type**: Single web frontend application (no backend).
**Performance Goals**: N/A — interactive dApp; run-all sequences operations one at a time gated by wallet prompts.
**Constraints**: Test handlers MUST keep using string-literal SDK constants (`'transaction'`, `'delegation'`, `'origination'`, `'micheline'`, `'raw'`) — never runtime SDK enum imports — so the registry stays version-agnostic across SDK versions (carried over from 001, FR-054). Removing operations must not crash on persisted history that references them.
**Scale/Scope**: 28 operations today → **21 retained** after removing 7 `rpc-read` operations. ~8 source files touched + 3 spec files. No new operations added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an **unratified template** (placeholder principles only). There are therefore no project-specific gates to enforce. Default engineering gates applied instead:

- **Simplicity**: PASS — this feature is net-removal (fewer operations, one run mode instead of two, one fewer flag). Complexity strictly decreases.
- **No new dependencies**: PASS — only a patch version bump of an existing dependency.
- **Backward compatibility**: PASS with care — persisted `PlaygroundRun` records may carry the old `runType: 'safe'` value and removed test ids; the design must tolerate them (see Phase 0 R2).

No violations → Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/002-remove-taquito-ops/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── test-registry-types.md
│   └── verification-matrix.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/app/playground/
├── tests/
│   ├── test-types.ts          # remove 'view-data' from TestCategory; retire safeForRunAll; narrow PlaygroundRun.runType
│   ├── index.ts               # drop VIEW_DATA_TESTS import/spread, view-data CATEGORY_META/ORDER/TESTS_BY_CATEGORY
│   ├── view-data.tests.ts     # DELETE (4 rpc-read tests)
│   ├── contracts.tests.ts     # remove contracts.read-storage + contracts.run-view
│   ├── tokens.tests.ts        # remove tokens.fa2-balance-read
│   ├── core.tests.ts          # remove safeForRunAll: false lines (field retired)
│   ├── crypto.tests.ts        # remove safeForRunAll lines
│   ├── staking.tests.ts       # remove safeForRunAll lines
│   └── stubs.tests.ts         # remove safeForRunAll line (disabled stubs unaffected otherwise)
├── services/
│   ├── test-runner.service.ts # remove runAllSafe(); single runAll(); narrow inFlightRunAll$; recompute mainnet "mutating" count
│   ├── test-runner.service.spec.ts # update/remove safe-run test
│   ├── sdk-loader.service.ts  # DEFAULT_VERSION → 4.8.6; add 4.8.6 to SUPPORTED_VERSIONS
│   ├── report-export.service.ts      # tolerate runs without a meaningful runType
│   └── report-export.service.spec.ts # fixture update
└── components/
    ├── wallet-control/
    │   ├── wallet-control.component.ts   # remove runAllSafe(); narrow inFlightRunAll type
    │   └── wallet-control.component.html # remove "Run all (safe)" button; rename "Run all (full)" → "Run all"
    └── run-history/
        └── run-history.component.html    # update empty-state copy; tolerate legacy runType in display

package.json                  # @tezos-x/octez.connect-dapp: 4.8.5 → 4.8.6
```

**Structure Decision**: Single Angular/Ionic frontend. All work is confined to the `src/app/playground/` feature module plus a one-line `package.json` version bump. No backend, no new modules.

## Phase 0: Research

See [research.md](./research.md). Resolves: the exact removal criterion (`requiredScope === 'rpc-read'`); how to retire the safe/full distinction without breaking persisted history; how to recompute the mainnet "mutating" confirmation after dropping `safeForRunAll`; how 4.8.6 is sourced (bundled vs. CDN); and the operational definition of "succeed" (including intentional-failure and precondition-blocked operations).

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — updated `TestDefinition`, `PlaygroundRun`, `TestCategory`, and `RequiredScope` shapes; the retained-vs-removed operation inventory; persisted-state migration rules.
- [contracts/test-registry-types.md](./contracts/test-registry-types.md) — the revised registry interface contract (supersedes the 001 version for the changed fields).
- [contracts/verification-matrix.md](./contracts/verification-matrix.md) — the 21 retained operations with their expected outcome and preconditions; the acceptance contract for "succeeds on 4.8.6."
- [quickstart.md](./quickstart.md) — the step-by-step verification recipe on octez.connect 4.8.6.
- Agent context (`CLAUDE.md`) SPECKIT block updated to point at this feature's artifacts.
