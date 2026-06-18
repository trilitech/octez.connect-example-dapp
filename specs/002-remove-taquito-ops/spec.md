# Feature Specification: Remove Taquito-Dependent Operations & Verify octez.connect 4.8.6

**Feature Branch**: `002-remove-taquito-ops`  
**Created**: 2026-06-18  
**Status**: Draft  
**Input**: User description: "Remove operations which require taquito from the list on the webpage. Test all the remaining operations that they do succeed (using 4.8.6 of octez.connect). also the run test (safe) does not make sense."

## Context & Scope Interpretation

The playground today lists 28 test operations across six categories. octez.connect is a **wallet-brokering** SDK: its job is to ask a connected wallet to sign and/or submit operations, and to sign arbitrary payloads. It does **not** read chain or indexer state — those reads (account balance, block headers, raw contract storage, on-chain view execution, TZIP‑16 metadata, event polling, token balances) are performed against the node RPC / indexer directly, which in a typical Tezos dApp is the responsibility of a separate library such as Taquito.

Accordingly, "operations which require taquito" is interpreted as **the read-only chain/indexer query operations** — the ones that do not go through the wallet at all. These are precisely the operations the playground marks as "safe for run-all." Removing them means the "Run all (safe)" mode would have nothing left to run, which is why the user notes that the safe run "does not make sense" and should be removed. The remaining operations are all genuine octez.connect wallet/sign operations, which are the meaningful subjects of a test playground for octez.connect.

This interpretation is recorded as an assumption (see Assumptions) and drives the requirements below.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Playground lists only octez.connect operations (Priority: P1)

A developer evaluating octez.connect opens the playground and sees a list of test operations. The list contains **only** operations that exercise octez.connect itself — wallet sign and operation-submission flows. The read-only chain/indexer query operations (which do not use the wallet and conceptually belong to a separate library) are no longer present, so the developer is not misled into thinking those reads are part of octez.connect's surface.

**Why this priority**: This is the core deliverable. Without an accurate operation list, the playground misrepresents what octez.connect does and what is actually being tested.

**Independent Test**: Open the playground and confirm the operation list contains the wallet/sign operations and none of the removed read-only query operations. Delivers immediate value as a corrected, focused test surface.

**Acceptance Scenarios**:

1. **Given** the playground is loaded, **When** the developer views the operation list, **Then** the read-only query operations (account balance, block inspection, contract events poll, TZIP‑16 metadata, read contract storage, contract view execution, FA2 balance read) are absent.
2. **Given** the playground is loaded, **When** the developer views the operation list, **Then** every remaining operation submits an operation through the wallet or requests a payload signature via octez.connect.
3. **Given** a removed operation previously had saved run history, **When** the developer views run history, **Then** the application remains stable and does not error on the now-absent operations.

---

### User Story 2 - "Run all (safe)" mode is removed (Priority: P1)

A developer uses the playground's run controls. Because the read-only "safe" operations no longer exist, there is no longer a meaningful "safe" subset to run. The "Run all (safe)" control is removed, leaving a single, unambiguous run-all control that runs the remaining operations.

**Why this priority**: Directly requested ("the run test (safe) does not make sense"). Leaving a safe-run control that runs zero (or no longer meaningfully distinct) operations is confusing and broken.

**Independent Test**: Open the run controls and confirm there is no "Run all (safe)" option; confirm the single run-all control runs the remaining operations.

**Acceptance Scenarios**:

1. **Given** the playground run controls, **When** the developer views them, **Then** there is no "Run all (safe)" action.
2. **Given** the run controls, **When** the developer triggers run-all, **Then** all remaining (wallet/sign) operations are executed sequentially with numbered run history recorded.
3. **Given** the run-all flow is triggered while connected to mainnet, **When** mutating operations are about to run, **Then** the existing mainnet confirmation safeguard still applies.

---

### User Story 3 - Remaining operations verified to succeed on octez.connect 4.8.6 (Priority: P1)

A developer runs every remaining operation against octez.connect **4.8.6** and confirms each produces its expected outcome — wallet-submitted operations are accepted/injected, signature requests return valid signatures, and operations that are intentionally designed to fail produce their expected error. This verifies that the focused operation set works on the target SDK version.

**Why this priority**: The explicit verification goal of the request ("Test all the remaining operations that they do succeed (using 4.8.6 of octez.connect)"). Removing operations without confirming the rest still work would leave the playground's value unverified.

**Independent Test**: With a wallet connected and the SDK set to 4.8.6, run each remaining operation (individually and via run-all) and confirm each reaches its expected outcome; record results in the run history / exportable report.

**Acceptance Scenarios**:

1. **Given** octez.connect 4.8.6 is the active SDK and a compatible wallet/account is connected, **When** each remaining wallet-submission operation is run, **Then** it is accepted by the wallet and successfully injected (or returns a successful operation result).
2. **Given** octez.connect 4.8.6 and a connected account, **When** each remaining signature operation (Micheline, raw, tz5 BLS) is run, **Then** a valid signature is returned.
3. **Given** octez.connect 4.8.6, **When** an operation that is intentionally designed to fail (FAILWITH call, malformed/invalid operation) is run, **Then** it produces the expected failure outcome and is recorded as the expected result (not as an unexpected/blocking error).
4. **Given** a remaining operation requires a precondition (connected wallet, deployed target contract, FA2 contract, tz5 BLS account, designated baker), **When** the precondition is not met, **Then** the operation reports a clear, actionable precondition message rather than an opaque failure.
5. **Given** a full run-all completes on 4.8.6, **When** the developer exports the run report, **Then** the report lists each remaining operation with a pass / expected-fail / blocked status.

---

### Edge Cases

- **Removed-operation references**: Saved run history, exported reports, or deep links that reference a now-removed operation must not crash the app; they should be ignored or shown as historical/unavailable.
- **Empty safe set**: With all read-only operations removed, no "safe-only" run path should remain reachable in the UI or via persisted state.
- **SDK fallback**: If the requested 4.8.6 SDK cannot be loaded (e.g., remote load fails), the playground must clearly indicate which SDK version actually ran, so verification results are not misattributed to 4.8.6.
- **No wallet connected**: Run-all and individual operations that need a wallet must surface a clear "connect a wallet" precondition rather than failing silently.
- **Intentional-failure operations**: These remain in the list and must be evaluated against their *expected* outcome; a produced error is a success for these.
- **Mainnet safety**: Removing the safe mode must not weaken the existing mainnet confirmation prompt for mutating operations.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The playground operation list MUST exclude all read-only chain/indexer query operations — specifically: account balance, block inspection, contract events poll, TZIP‑16 metadata, read contract storage, contract view execution, and FA2 balance read.
- **FR-002**: The playground operation list MUST retain all operations that exercise octez.connect's wallet/sign surface (operation submission and payload signing).
- **FR-003**: The application MUST remove the "Run all (safe)" control and any user-facing "safe run" concept.
- **FR-004**: A single run-all control MUST remain that executes the retained operations sequentially and records a numbered run in history.
- **FR-005**: Removing the safe-run path MUST NOT remove or weaken the existing mainnet confirmation safeguard shown before mutating operations are submitted.
- **FR-006**: The application MUST NOT error, crash, or break when encountering persisted history, exports, or state that reference now-removed operations.
- **FR-007**: octez.connect **4.8.6** MUST be available as the SDK version under which the playground is verified, and MUST be selectable/active for the verification run.
- **FR-008**: Each retained operation MUST be executed against octez.connect 4.8.6 and its outcome MUST be recorded (success, expected-failure, or blocked-by-precondition).
- **FR-009**: Operations intentionally designed to fail (FAILWITH call, malformed/invalid operation) MUST be evaluated against their expected failure outcome and recorded as meeting expectations when that failure occurs.
- **FR-010**: When a retained operation cannot run because a precondition is unmet (no wallet, missing target contract, missing tz5 BLS account, missing baker, etc.), the operation MUST report a clear precondition status distinct from an unexpected failure.
- **FR-011**: The exportable run report MUST reflect only the retained operations and MUST attribute results to the SDK version actually used.
- **FR-012**: The playground MUST clearly indicate which octez.connect version actually executed, so that "4.8.6 verified" claims are accurate even if a fallback version was loaded.

### Key Entities *(include if feature involves data)*

- **Operation (test action)**: A single named action in the playground. Attributes relevant here: display name, category, whether it submits through the wallet vs. is a read-only query, and whether its expected outcome is success or an intentional failure. Read-only query operations are removed by this feature.
- **Run**: A numbered, persisted execution of one or more operations, with per-operation outcome and the SDK version used. After this feature a Run has a single kind (no "safe" vs "full" distinction).
- **Run Report**: An exportable summary of a Run, listing retained operations with pass / expected-fail / blocked status and the SDK version that produced them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The playground operation list contains zero read-only chain/indexer query operations and 100% of the previously-listed wallet/sign operations.
- **SC-002**: There is exactly one run-all control and no reachable "safe run" path anywhere in the UI or persisted state.
- **SC-003**: Running the full set of retained operations on octez.connect 4.8.6 with the required preconditions met results in every operation reaching its expected outcome (success for normal operations; expected error for intentional-failure operations) — i.e., zero operations end in an unexpected failure.
- **SC-004**: A developer can run all retained operations and export a report attributing every result to octez.connect 4.8.6 in a single session, with no app crashes caused by removed operations.
- **SC-005**: The mainnet confirmation safeguard still triggers before mutating operations after the safe mode is removed.

## Assumptions

- **Interpretation of "require taquito"**: The codebase currently imports no Taquito package; all operations are implemented on octez.connect plus direct RPC/indexer calls. "Operations which require taquito" is therefore interpreted as the **read-only chain/indexer query operations** (account balance, block inspection, contract events poll, TZIP‑16 metadata, read contract storage, contract view execution, FA2 balance read) — i.e., the reads that octez.connect itself does not perform and that conceptually belong to a separate chain-reading library. These are exactly the operations marked "safe for run-all," which is why removing them makes the "safe run" meaningless.
- **Retained operations** (the set to be verified) are the wallet/sign operations: send tez, batch, contract call (counter), sign payload (Micheline / raw / tz5 BLS), deploy from Michelson JSON, increase paid storage, register global constant, set deposits limit, failing contract call (FAILWITH), invalid operation, transaction with explicit limits, FA2 transfer / mint / burn, set delegate, remove delegate, stake, unstake, finalize unstake.
- **"Succeed" definition**: For normal operations, success means the wallet accepts and the operation is injected / a valid signature is returned. For intentional-failure operations, success means the expected failure is produced. Operations blocked by unmet preconditions are reported as "blocked," not as feature failures.
- **SDK target**: octez.connect 4.8.6 is the version under which verification is performed; it supersedes the currently-bundled 4.8.5 as the verification target and is reachable via the existing version-selection mechanism (or as the bundled default).
- **Preconditions are operator-provided**: Verifying that operations "succeed" assumes the tester supplies the necessary environment — a connected compatible wallet, a tz5 (BLS) account for the BLS signing test, deployed counter/FA2 contracts for contract calls, and a valid baker for delegation. These are testing prerequisites, not in-scope build work.
- **No new operations**: This feature only removes operations and the safe-run mode; it does not add new test operations.
