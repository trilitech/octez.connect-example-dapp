# Phase 1 Data Model: Remove Taquito-Dependent Operations & Verify octez.connect 4.8.6

This feature mutates existing entities defined in 001; only the deltas are described here. See `specs/001-playground-upgrade/data-model.md` for the baseline.

## Entity: TestDefinition (modified)

| Field | Change | Notes |
|-------|--------|-------|
| `category` | type narrows | `TestCategory` loses `'view-data'` |
| `safeForRunAll` | **removed** | No safe-run mode survives; the flag has no remaining consumer |
| `requiredScope` | unchanged type | No retained test uses `'rpc-read'`; union members kept for forward-compat |
| all other fields | unchanged | `id`, `title`, `description`, `enabled`, `disabledReason`, `inputs`, `run` |

**Validation rules**:
- The registry MUST contain no test with `requiredScope === 'rpc-read'`.
- The registry MUST contain no test with `category === 'view-data'`.
- Every active (`enabled: true`) test MUST have `requiredScope` of `'octez-connect'` (or `'both'`).

## Entity: TestCategory (modified)

```
'core' | 'staking' | 'contracts' | 'crypto' | 'tokens'   // 'view-data' removed
```
`CATEGORY_META`, `CATEGORY_ORDER`, and `TESTS_BY_CATEGORY` drop their `'view-data'` entries.

## Entity: PlaygroundRun (modified)

| Field | Change | Notes |
|-------|--------|-------|
| `runType` | retired for new runs; tolerated on old | No longer written meaningfully; rendering/export MUST not assume it equals `'safe'` or `'full'`. Optional/legacy-tolerant. |
| all other fields | unchanged | `runNumber`, `startedAt`, `endedAt`, `sdkVersion`, `network`, `walletAddress`, counts, `results` |

**State / migration rules**:
- Persisted runs in `localStorage['octez.connect.run-history']` created before this feature may carry `runType: 'safe'` and `results[].testId` values for removed tests. On rehydrate the app MUST load and display them without error (FR-006).
- New runs are produced by a single run-all path; `sdkVersion` reflects the SDK actually used (should read `4.8.6` after this feature).

## Entity: Run Report (export, modified)

- Export MUST render a run whose `runType` is absent/legacy without throwing (drop or neutralize the "Run type" row when not meaningful).
- The report MUST attribute results to the `sdkVersion` recorded on the run.

## Entity: SDK version registry (modified)

| Constant | Before | After |
|----------|--------|-------|
| `DEFAULT_VERSION` (`sdk-loader.service.ts`) | `'4.8.5'` | `'4.8.6'` |
| `SUPPORTED_VERSIONS[0]` | `'4.8.5'` | `'4.8.6'` (4.8.5 may remain selectable below it) |
| `package.json` dependency | `4.8.5` | `4.8.6` |

## Operation Inventory

### Removed (7 — `requiredScope: 'rpc-read'`)

| id | category | reason |
|----|----------|--------|
| `view.account-balance` | view-data | RPC read; not an octez.connect op |
| `view.block-inspect` | view-data | RPC read |
| `view.contract-events-poll` | view-data | RPC/indexer read |
| `view.tzip16-metadata` | view-data | indexer read |
| `contracts.read-storage` | contracts | RPC storage read |
| `contracts.run-view` | contracts | RPC `run_script_view` read |
| `tokens.fa2-balance-read` | tokens | RPC storage read |

### Retained (21 — verified on 4.8.6)

| id | category | expected outcome |
|----|----------|------------------|
| `core.send-tez` | core | injected |
| `core.batch` | core | injected |
| `core.contract-call` | core | injected |
| `crypto.sign-micheline` | crypto | signature returned |
| `crypto.sign-raw` | crypto | signature returned |
| `crypto.sign-tz5-bls` | crypto | signature returned |
| `contracts.deploy-from-michelson` | contracts | originated (KT1 address) |
| `contracts.increase-paid-storage` | contracts | injected |
| `contracts.register-global-constant` | contracts | injected |
| `contracts.set-deposits-limit` | contracts | injected |
| `contracts.failing-contract` | contracts | **expected FAILWITH** |
| `contracts.failing-noop` | contracts | **expected invalid-op error** |
| `contracts.transaction-limit` | contracts | injected |
| `tokens.fa2-transfer` | tokens | injected |
| `tokens.fa2-mint` | tokens | injected |
| `tokens.fa2-burn` | tokens | injected |
| `staking.set-delegate` | staking | injected |
| `staking.remove-delegate` | staking | injected |
| `staking.stake` | staking | injected |
| `staking.unstake` | staking | injected |
| `staking.finalize-unstake` | staking | injected |

(Disabled `STUB_TESTS` — sapling, etherlink-bridge, etc. — are out of scope: they are not active operations and not `rpc-read` reads; left unchanged except for the retired `safeForRunAll` field.)
