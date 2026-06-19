# Contract: Verification Matrix — 21 Retained Operations on octez.connect 4.8.6

Defines the acceptance contract for US3 / SC-003: each retained operation, its expected outcome, the precondition required to exercise it, and the pass criterion. A verification run "passes" when every operation reaches its **expected** result (a produced error counts as a pass for intentional-failure operations).

| # | Operation id | Precondition | Expected outcome | Pass criterion |
|---|--------------|--------------|------------------|----------------|
| 1 | `core.send-tez` | wallet connected, small balance | injected | tx hash returned, no error |
| 2 | `core.batch` | wallet connected | injected | tx hash returned |
| 3 | `core.contract-call` | counter contract for active network | injected | tx hash returned |
| 4 | `crypto.sign-micheline` | wallet connected | signature returned | `signature` non-empty |
| 5 | `crypto.sign-raw` | wallet connected | signature returned | `signature` non-empty |
| 6 | `crypto.sign-tz5-bls` | **tz5 (BLS) active account** | signature returned | `signature` non-empty |
| 7 | `contracts.deploy-from-michelson` | wallet connected | originated | KT1 `originatedAddress` returned |
| 8 | `contracts.increase-paid-storage` | target contract address | injected | tx hash returned |
| 9 | `contracts.register-global-constant` | wallet connected | injected | tx hash returned |
| 10 | `contracts.set-deposits-limit` | wallet connected | injected | tx hash returned |
| 11 | `contracts.failing-contract` | contract with FAILWITH entrypoint | **expected failure (FAILWITH)** | wallet/sim rejects with the expected FAILWITH error |
| 12 | `contracts.failing-noop` | wallet connected | **expected failure (invalid op)** | rejected with the expected malformed-destination error |
| 13 | `contracts.transaction-limit` | wallet connected | injected | tx hash returned |
| 14 | `tokens.fa2-transfer` | FA2 contract for active network | injected | tx hash returned |
| 15 | `tokens.fa2-mint` | FA2 contract (mintable) | injected | tx hash returned |
| 16 | `tokens.fa2-burn` | FA2 contract (burnable) | injected | tx hash returned |
| 17 | `staking.set-delegate` | a valid baker address | injected | tx hash returned |
| 18 | `staking.remove-delegate` | account currently delegated | injected | tx hash returned |
| 19 | `staking.stake` | wallet connected | injected | tx hash returned |
| 20 | `staking.unstake` | staked balance | injected | tx hash returned |
| 21 | `staking.finalize-unstake` | finalizable unstake request | injected | tx hash returned |

## Run-level acceptance

- **SDK**: the active `sdkVersion` recorded on the run is `4.8.6` (bundled or CDN). If a fallback occurred, the badge/report shows the version actually used (FR-012).
- **No unexpected errors**: every operation ends in `success` OR (for #11/#12) the expected failure OR a clearly-labeled `blocked` (precondition unmet). Zero operations end in an unexpected error (SC-003).
- **Report**: an exported Markdown report lists all 21 operations with pass / expected-fail / blocked status and attributes them to `4.8.6` (SC-004).
- **Mainnet guard**: a run-all on mainnet still triggers the confirmation prompt before submitting (SC-005).

## Notes on "blocked"

Operations whose preconditions cannot be met in the test environment (e.g., no tz5 BLS account available, no finalizable unstake request yet) are recorded as **blocked**, not failed. Blocked items do not fail the verification but MUST be reported so coverage gaps are visible rather than silently passed.
