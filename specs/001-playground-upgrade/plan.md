# Implementation Plan: octez.connect Example dApp → Test Playground

**Branch**: `001-playground-upgrade` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `./spec.md`

## Summary

Fix three known bugs (reconnect loop, lost session on reload, sign-payload encoding), then replace the dapp's marketing home page with a comprehensive test playground driven entirely through `octez.connect` (wallet ops/signing) and Angular `HttpClient` (raw RPC + indexer reads). Add a Mainnet ⇄ Shadownet network toggle, a paste-a-KT1 dynamic contract panel, a deploy-from-Michelson-JSON test, a tz5 BLS signing test, sequential auto-run-all with per-run numbered history and Markdown export, and a runtime SDK version switcher that boots the app against any published `@tezos-x/octez.connect-dapp` version (loaded from esm.sh with a 10s timeout and a bundled-package fallback).

**Technical approach**: build a `PlaygroundModule` (lazy-loaded at `''`, legacy home moved to `/legacy`) that hosts a metadata-driven test registry. Tests are plain async functions taking a `TestContext` (SDK client + RPC service + active account + inputs + network) and returning a `TestRunOutput`. The SDK is loaded once at boot via a bundler-opaque dynamic import — type-only static imports remain to keep TypeScript happy without bundling a fixed version. A small `TestRunnerService` owns the run-all sequence, the numbered-run history (persisted to `localStorage`), and the FIFO queue for individual runs triggered during an in-flight Run-all. No new top-level npm dependencies are added.

## Technical Context

**Language/Version**: TypeScript 4.9.5 (per `package.json` `devDependencies`)
**Primary Dependencies**: Angular 15.2 (CLI, common, core, forms, router, platform-browser), Ionic 7 (`@ionic/angular`), RxJS 7.8, `@tezos-x/octez.connect-dapp@4.8.5` (kept as the bundled-fallback version and as the source of `import type` for SDK types), `@ionic/storage-angular` 4.0 (present but unused by this feature — we use `localStorage` directly for SDK selection and run history), `@sentry/browser` 7 (existing error handler stays). Buffer polyfill is already global.
**Storage**: `localStorage` only (synchronous, ~5–10 MB per origin). Two keys: `octez.connect.version` (chosen SDK version string) and `octez.connect.run-history` (JSON-serialized array of `PlaygroundRun`). No new database, no server.
**Testing**: existing Angular `ng test` (Karma/Jasmine) infrastructure; this feature does not add a new test framework. Verification is **primarily manual** against running wallets (see `quickstart.md` — bug repro steps + playground smoke runs). A small set of Jasmine unit tests covers pure helpers (`buildSignPayload`, the per-network registry lookup, the Markdown report formatter) and the runner's queue behavior. End-to-end tests against live wallets/networks are out of scope for this feature.
**Target Platform**: modern desktop browsers (Chromium, Firefox, Safari) — the dapp ships as static assets to GitHub Pages via the existing CI workflow. Browser must support dynamic `import()` and `localStorage` (universally true in supported browsers).
**Project Type**: single-app Angular/Ionic web frontend. No backend in this feature.
**Performance Goals**: playground first paint <3s on broadband (SC-004); SDK loader gating released within 10s worst case (SC-020); RPC base swap reflected in subsequent calls within 1s (SC-008); entrypoint listing for the dynamic contract panel within 3s (SC-010). No throughput targets.
**Constraints**:
- No Taquito (`@taquito/*`) imports anywhere in `src/` (FR-057 / SC-013).
- Only **type-only** static imports of `@tezos-x/octez.connect-dapp` (FR-053 / SC-014); runtime values come from the dynamic loader.
- No new top-level npm dependencies (FR-047, FR-053; Markdown/JSON/clipboard/download all use native browser APIs).
- Test definitions use string-literal operation kinds / signing types so the registry stays SDK-version-agnostic (FR-054).
**Scale/Scope**: single-user developer tool. Order of ~50 test cards across 6 categories + 6 disabled stub cards + 1 dynamic-contract panel + 1 deploy-from-Michelson card. Run history: bounded by user choice (Clear-all available); a reasonable cap of ~50 numbered runs in `localStorage` (each ~10–50 KB serialized) is well under quota.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project's `.specify/memory/constitution.md` is an **unfilled template** (all placeholder tokens `[PRINCIPLE_N_NAME]`, no ratified principles, no version). There are no ratified principles to gate against in this session. **Result: gate vacuously passes.**

If the constitution is later ratified before this feature lands, re-running `/speckit-analyze` will surface any retroactive constraints; nothing in this plan introduces unusual complexity (no new project, no new top-level dep, no new persistence layer beyond browser-native `localStorage`).

**Re-check after Phase 1 design (below): still passes.** No new violations introduced by data-model, contracts, or quickstart artifacts.

## Project Structure

### Documentation (this feature)

```text
specs/001-playground-upgrade/
├── plan.md              # This file
├── research.md          # Phase 0 — technical decisions + rationale
├── data-model.md        # Phase 1 — concrete entity shapes
├── quickstart.md        # Phase 1 — developer onboarding + verification recipe
├── contracts/
│   ├── rpc-endpoints.md           # Tezos RPC endpoints consumed by the playground
│   ├── indexer-endpoints.md       # TzKT (mainnet & shadownet) endpoints consumed
│   ├── sdk-module-surface.md      # The dynamically loaded SDK surface we depend on
│   └── test-registry-types.md     # TestDefinition / TestContext / TestRunOutput shapes
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Produced by /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── app.module.ts                          # (modified) — no SDK runtime import; type-only stays where needed
│   ├── app-routing.module.ts                  # (modified) — `''` → PlaygroundModule lazy; `/legacy` → HomePageModule lazy; `**` last
│   ├── app.component.{ts,html,scss}           # (modified) — adds an SDK-fallback toast outlet (Ionic ToastController)
│   ├── utils/                                 # NEW
│   │   ├── sign-payload.ts                    # buildSignPayload(message, signingType) → { payload, signingType }
│   │   └── explorer.ts                        # getExplorerLinkForAddress / getExplorerLinkForTxHash, NetworkConfig-driven
│   ├── playground/                            # NEW (lazy-loaded module at '')
│   │   ├── playground.module.ts               # NgModule: declares Page + components; RouterModule.forChild
│   │   ├── playground.page.{ts,html,scss}     # Page: header + accordions + run-history panel + dynamic-contract panel
│   │   ├── network.config.ts                  # NETWORKS + CONTRACT_DEFAULTS registry (single source of truth)
│   │   ├── components/
│   │   │   ├── wallet-control/                # connect/disconnect, Mainnet⇄Shadownet toggle, SDK-version select, version badge
│   │   │   ├── test-card/                     # one test card per TestDefinition; renders inputs + run + result
│   │   │   ├── run-history/                   # collapsible numbered runs; per-run ✕ + Clear all
│   │   │   └── contract-explorer/             # paste KT1 → indexer entrypoints → invoke
│   │   ├── services/
│   │   │   ├── sdk-loader.service.ts          # dynamic CDN import + 10s timeout + bundled fallback + cache
│   │   │   ├── rpc.service.ts                 # Angular HttpClient over active NetworkConfig.rpc
│   │   │   ├── indexer.service.ts             # HttpClient over active NetworkConfig.api (+ RPC fallback)
│   │   │   ├── test-runner.service.ts         # results$, runs$, run/runAllSafe/runAllFull, FIFO queue, reset/clear
│   │   │   └── report-export.service.ts       # Markdown + JSON + clipboard (no new deps)
│   │   └── tests/
│   │       ├── test-types.ts                  # TestCategory, RequiredScope, TestStatus, TestInput, TestContext, TestDefinition
│   │       ├── core.tests.ts                  # send tez, batch, contract call (counter)
│   │       ├── staking.tests.ts               # set/remove delegate, stake/unstake/finalize
│   │       ├── contracts.tests.ts             # increase paid storage, register global constant, set deposits limit,
│   │       │                                  # origination, deploy-from-Michelson, read storage, view execution
│   │       ├── crypto.tests.ts                # sign payload RAW, MICHELINE, tz5 BLS
│   │       ├── tokens.tests.ts                # FA2 transfer/mint/burn + FA2 balance read
│   │       ├── view-data.tests.ts             # account balance, block inspection, contract events poll
│   │       ├── stubs.tests.ts                 # disabled cards: sapling, etherlink/tezlink bridges, fee est., sig verify, faucet
│   │       └── index.ts                       # ALL_TESTS, TESTS_BY_CATEGORY, CATEGORY_META
│   ├── services/
│   │   └── beacon/beacon.service.ts           # (modified) — async init via SdkLoader, registerSubscriptions, restoreActiveAccount, connect/disconnect/getRpcUrl, type-only SDK imports
│   ├── pages/home/                            # (UNTOUCHED, lazy-loaded at /legacy)
│   └── components/sample-contract/            # (modified, optional) — switch to RpcService / explorer util
└── (build/config files untouched)
```

**Structure Decision**: a new top-level `src/app/playground/` directory contains everything new (page, components, services, network config, test registry). The existing `src/app/services/beacon/beacon.service.ts` is modified in place for Part A bug fixes plus async init via the new SDK loader. Routing changes route `''` to the new `PlaygroundModule` (lazy) and `/legacy` to the existing `HomePageModule` (also lazy). The home page module/components are otherwise untouched, preserving the marketing surface as a still-buildable artifact.

## Complexity Tracking

> *No constitution violations to justify (constitution is unfilled template). Notable design choices and the reason for each:*

| Choice | Why | Simpler alternative rejected because |
|---|---|---|
| Bundler-opaque dynamic import (`new Function('u','return import(u)')`) | Angular/Webpack would otherwise rewrite the URL at build time and lose runtime version selection | A static `import()` is bundler-known and pins to a build-time version; static + dynamic mix is the only way to keep types while swapping runtime |
| Two-tier SDK load (CDN → 10s timeout → bundled) | Lets users compare versions live AND keeps the dapp usable when esm.sh is unreachable | CDN-only would block offline / firewalled use; bundled-only forfeits FR-048 → FR-056 |
| `localStorage` for run history (not Ionic Storage) | Synchronous, small data (~50 KB per run × ~50 runs ≪ quota), avoids async-init complexity at boot when we already await the SDK loader | Ionic Storage (IndexedDB-backed) would add an async-init step we don't need; service-worker / IDB persistence is overkill |
| Per-test-card "last result" stored separately from numbered runs | Individual clicks don't pollute a numbered-run snapshot (per FR-062) | Single combined store would force every individual click into a run or drop it on the floor |
| FIFO queue inside `TestRunnerService` rather than disabling all individual buttons | Honors the user's chosen queue semantics (Q3 answer) without losing clicks | Disabling would have been simpler but lose work; concurrent execution would interleave wallet popups |
| `confirm()` native dialog for Mainnet "Run all (full)" | Per Q5 answer; blocking, zero UI to build | An Ionic alert would be prettier but is gratuitous for one warning |

## Phase 0 — Research (output: [research.md](./research.md))

Spec is well-clarified (5 questions answered in `## Clarifications`). Remaining technical decisions are dependencies/integration patterns. `research.md` documents:

1. esm.sh URL pattern for `@tezos-x/octez.connect-dapp@<version>` (verified 200 for 4.8.x and 5.0.0-beta.3 → beta.6 during spec).
2. Bundler-opaque dynamic import recipe and why Webpack would otherwise rewrite the URL.
3. Tezos micheline-pack framing for sign payloads (`'05' '01' <4-byte BE len> <utf8-hex>`).
4. TzKT API surfaces used (`/v1/contracts/{kt}/entrypoints`, `/v1/contracts/{kt}`, `/v1/operations/{hash}`) and RPC fallback (`/chains/main/blocks/head/context/contracts/{kt}/entrypoints`).
5. Origination response → KT1 resolution (indexer first, RPC fallback).
6. Run-history persistence shape and quota considerations.
7. Type-only-import strategy for `@tezos-x/octez.connect-dapp` (TS 4.9 `import type` erasure).
8. tz5 (BLS) address-prefix detection (`account.address.startsWith('tz5')`).

No `NEEDS CLARIFICATION` remains.

## Phase 1 — Design & Contracts (outputs: [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md))

Phase 1 artifacts:

- **data-model.md** — concrete TypeScript-style shapes for every entity in spec §Key Entities (NetworkConfig, ContractDefault, TestDefinition, TestContext, TestResult, PlaygroundReport, **PlaygroundRun**, SdkSelection, EntrypointDescriptor) plus the `localStorage` schema.
- **contracts/rpc-endpoints.md** — every Tezos RPC endpoint the playground calls (account balance, contract storage, block inspection, operations, run_script_view, entrypoints fallback), with request/response shape, when it's used, and which tests reference it.
- **contracts/indexer-endpoints.md** — TzKT endpoints (`/v1/contracts/{kt}/entrypoints`, `/v1/contracts/{kt}`, `/v1/operations/{hash}`) with response shape and fallback behavior.
- **contracts/sdk-module-surface.md** — the minimal surface of `@tezos-x/octez.connect-dapp` we depend on (DAppClient constructor + methods + the four enums), version-agnostic to make 4.8.x ↔ 5.0.0-beta compatibility predictable.
- **contracts/test-registry-types.md** — the exact TypeScript interface contracts of `TestDefinition`, `TestContext`, `TestInput`, `TestRunOutput`, `TestResult`, and the run-handler signature, so each per-category test file conforms uniformly.
- **quickstart.md** — repro steps for the three bugs (so the next engineer can confirm the fix in <5 minutes), local-dev commands, the "add a new test" recipe, the verification matrix mapping each Success Criterion to a concrete check, and the deploy-via-GitHub-Pages step (deferred until user confirms a release).

**Agent context update**: `CLAUDE.md` already contains `<!-- SPECKIT START -->`/`<!-- SPECKIT END -->` markers; the body is updated to reference the active plan file (`specs/001-playground-upgrade/plan.md`) and to mention the playground branch.

## Re-evaluation: Constitution Check post-design

Still vacuously passes — no constitution to violate. No new violations introduced by Phase 1 outputs. Plan is ready for `/speckit-tasks`.
