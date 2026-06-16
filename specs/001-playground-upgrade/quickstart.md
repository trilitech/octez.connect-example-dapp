# Quickstart — octez.connect Playground Upgrade

This file is the developer-onboarding guide for the `001-playground-upgrade` feature. It assumes you have the repo cloned and a Tezos wallet (Temple or similar) installed in your browser.

## 1. Run the dapp locally

```bash
npm install                       # one-time; no new deps added by this feature
npm start                         # ng serve → http://localhost:8100
```

Open `http://localhost:8100/`. The playground page should render against the default SDK (`4.8.5`). The legacy marketing home is still reachable at `http://localhost:8100/legacy`.

## 2. Reproduce the three bugs being fixed (pre-fix baseline)

Do these on `master` (before this branch's fix lands) to confirm the failure modes you're fixing:

1. **Reconnect bug**: connect a wallet → click "Connect / Request Permissions" again → the pairing UI re-appears even though you're already connected. Reload the page → the connected UI disappears (session is "lost" because `getActiveAccount()` is never called at startup).
2. **Sign-payload error**: with a wallet connected, click the sign button → the wallet either rejects ("invalid payload") or signs the wrong bytes (`'test'` instead of the micheline-packed framing).
3. **Outdated contracts**: the sample-contract component pointed at dead KT1 addresses (partly fixed already in a recent commit — confirm via UI that contract calls succeed against `KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA` on Shadownet).

## 3. Verification recipe (one check per Success Criterion)

After the feature lands, the following checks confirm each Success Criterion. Run them in order. **A wallet on Shadownet with a small amount of test tez is required for SC-005 onward.**

| SC | Check |
|---|---|
| SC-001 | Connect → reload → connected UI persists, no pairing UI. |
| SC-002 | Click Connect ten times while connected → zero pairing prompts. |
| SC-003 | Sign `test` → DevTools network/wallet log shows payload begins with `0501000000` and ends with `74657374`; wallet returns signature. |
| SC-004 | Open `/` in a fresh tab → playground first paint < 3 s on broadband. |
| SC-005 | Click "Run all (safe)" with no wallet → view-data tests run sequentially and all succeed. |
| SC-006 | Click "Run all (full)" with a Shadownet wallet → wallet popups appear one at a time. Reject the first one → it records as `error`; the run continues to the next test. Header shows `k/N` throughout. |
| SC-007 | Export Markdown after a successful Run-all → file contains at least one Markdown link like `[opXxx](https://shadownet.tzkt.io/opXxx)`. |
| SC-008 | Toggle Mainnet ⇄ Shadownet → next RPC read targets the new endpoint within 1 s (verify via DevTools network tab). |
| SC-009 | Toggle Mainnet → contract-address inputs that have no Mainnet default render empty with "no default registered" hint; Shadownet defaults do not leak across. |
| SC-010 | Paste `KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA` (on Shadownet) into the dynamic-contract panel → dropdown lists `increment` / `decrement` / `reset` within 3 s. |
| SC-011 | Paste a minimal `{ code, storage }` Michelson JSON → click Deploy → op hash returned → originated KT1 resolved within ~30 s and displayed with an indexer link. |
| SC-012 | Switch SDK to `5.0.0-beta.6` → page reloads → header badge shows `5.0.0-beta.6` → switch back to `4.8.5` → reload → badge updates. |
| SC-013 | `npx ng build --configuration production` succeeds. `grep -r "@taquito" src` returns nothing. |
| SC-014 | `grep -rn "@tezos-x/octez.connect-dapp" src` returns only lines beginning with `import type` plus the dynamic-loader fallback `import('@tezos-x/octez.connect-dapp')`. |
| SC-015 | Playground shows 6 categories (Core, Staking/Delegation, Contracts, Crypto, Tokens, View data), each non-empty. |
| SC-016 | With a `tz5...` active account on Mainnet or Shadownet → run the tz5 BLS signing test → BLS signature returned. Switch to a non-tz5 account → test card shows the "switch to a tz5 account" hint. |
| SC-017 | Toggle to Mainnet → click "Run all (full)" → native `confirm()` dialog appears. Click Cancel → no operations are sent, no new numbered run is created. |
| SC-018 | Run "Run all (full)" twice with different SDK versions (one reload between) → two numbered runs in history, each with its SDK version and pass/fail summary. |
| SC-019 | Run a Run-all, then reload the page → the numbered run persists in the history panel. |
| SC-020 | (Manual chaos test) Block `esm.sh` in your hosts file → reload → the bundled-fallback toast appears within ~10 s; the playground is still usable. |
| SC-021 | During an in-flight Run-all, click an individual test card's Run → the card shows "queued"; it executes only after the Run-all finishes. The other Run-all button is disabled. |

## 4. Adding a new test

1. Pick the category file under `src/app/playground/tests/` (e.g., `core.tests.ts`).
2. Define a `TestDefinition` following the conventions in `contracts/test-registry-types.md`.
3. Append it to the file's exported array.
4. Hot reload picks it up automatically — the test card renders inside its category accordion.

Use only **string-literal** SDK constants (`kind: 'transaction'`, `signingType: 'micheline'`) so the test stays SDK-version-agnostic. Use only **type-only** imports from `@tezos-x/octez.connect-dapp`.

## 5. Deploying

The existing GitHub Pages workflow (`.github/workflows/...`) builds on push to `master`. Do **not** push to `master` until the user explicitly confirms a release. Until then, this branch (`001-playground-upgrade`) lives only locally / on a feature push.

## 6. Open implementation items tracked in memory

- **Mainnet counter contract**: the user will deploy themselves with implementation-time guidance. When implementation reaches the Core category's Contract-call test for Mainnet, surface the deployment walkthrough (Michelson source, `octez-client` origination commands, expected storage cost, where to drop the resulting KT1 in `network.config.ts`). See memory `mainnet-counter-deploy`.
- **Mainnet FA2 default**: an existing Mainnet FA2 the user controls must be identified before the Tokens category lands. Until then, Mainnet FA2 cards render with empty inputs per FR-023. See memory `mainnet-fa2-default-open`.
