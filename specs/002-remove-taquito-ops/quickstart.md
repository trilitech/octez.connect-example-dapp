# Quickstart: Verify Removal + 21 Operations on octez.connect 4.8.6

## Prerequisites

- Node + the repo installed (`npm install`).
- A Tezos wallet that speaks octez.connect, with a small testnet balance.
- For full coverage: a tz5 (BLS) account, a deployed counter contract and FA2 contract on the active network, and a valid baker address.

## 1. Confirm the SDK is 4.8.6

```bash
grep '"@tezos-x/octez.connect-dapp"' package.json   # expect 4.8.6
npm install
npm start
```

In the playground header the SDK badge should read `SDK 4.8.6`. If it says `· bundled fallback`, the CDN load failed but the bundled SDK is also 4.8.6, so verification still holds.

## 2. Confirm the operation list no longer shows the removed reads

The list MUST NOT contain any of:
`Account balance`, `Block inspection`, `Contract events poll`, `TZIP-16 metadata`, `Read contract storage`, `Contract view execution`, `FA2 balance read`.
The `View data` category should be gone entirely. 21 operations remain across Core / Crypto / Contracts / Tokens / Staking.

## 3. Confirm the safe run is gone

The run controls show a single **Run all** button (no "Run all (safe)"). Triggering it on **mainnet** still pops the confirmation dialog before any operation is submitted.

## 4. Verify each operation succeeds

Connect a wallet, set the network, then either run operations individually or hit **Run all**. Use the [verification matrix](./contracts/verification-matrix.md) to judge each result:

- Normal ops → expect an injected tx hash (or KT1 for deploy) / a returned signature.
- `Failing contract call (FAILWITH)` and `Invalid operation` → expect their failure; this is a **pass**.
- Ops you can't set up (no tz5 BLS account, no finalizable unstake, etc.) → recorded as **blocked**, not failed.

## 5. Export the report

Export the run as Markdown. Confirm it lists only the 21 retained operations and attributes results to `4.8.6`. A run with no unexpected errors satisfies SC-003.

## 6. Regression checks (automated)

```bash
npm test    # Jasmine/Karma unit specs
```

- `test-runner.service.spec.ts` no longer references a safe run.
- `report-export.service.spec.ts` fixture has no meaningful `runType`.
- The build (`npm run build`) compiles with no references to `safeForRunAll`, `runAllSafe`, or the `view-data` category.

## 7. Backward-compatibility spot check

With pre-existing run history in `localStorage` (containing `runType: 'safe'` and removed test ids), reload the app. The history must render without errors (FR-006).
