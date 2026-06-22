# octez.connect Example dApp

> A test playground for connecting wallets to dApps on Tezos with [octez.connect](https://www.npmjs.com/package/@tezos-x/octez.connect-dapp).

octez.connect is a wallet-interaction SDK (an implementation of the [tzip-10](https://gitlab.com/tzip/tzip/blob/master/proposals/tzip-10/tzip-10.md) standard). This dApp exercises its surface — requesting operations and signing payloads through a connected wallet — across a set of runnable test cards.

## Intro

The playground groups wallet/sign operations into categories and lets you run each one against a connected wallet, on a switchable network, with a runtime SDK-version switcher:

- **Core** — send tez, batch operations, contract call (counter), faucet launcher.
- **Crypto** — sign payload (MICHELINE / RAW / tz5 BLS).
- **Contracts** — deploy from Michelson JSON, increase paid storage, register global constant, transaction with explicit limits, intentional-failure cards (FAILWITH / invalid operation), and a dynamic contract-interaction panel (paste a KT1, load entrypoints, invoke any of them). `set_deposits_limit` is shown disabled (deprecated under Adaptive Issuance).
- **Tokens** — FA2 transfer / mint / burn.
- **Staking** — set / remove delegate, stake / unstake / finalize unstake.

Other features: **Run all** (sequential, numbered run history persisted to `localStorage`), exportable Markdown/JSON run reports, a **network toggle** (Mainnet / Shadownet / custom), and a **runtime SDK version switcher**.

Operations that only *read* chain/indexer state (which octez.connect itself doesn't do) are intentionally not part of the playground — its focus is the wallet-facing surface. Intentional-failure cards (FAILWITH, invalid operation) record their expected error as a success.

## Networks & default contracts

| Network | Counter | FA2 |
|---------|---------|-----|
| **Shadownet** | `KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA` | `KT1MVwdgXubE8D1h9M4WCmU64XE4VRQPhw2f` (single-asset: open mint, owner-only burn, standard transfer) |
| **Mainnet** | none — deploy your own via the *Deploy from Michelson* card | none |

On Shadownet, the contract fields in the Core / Tokens cards auto-fill from these defaults. Need test funds? Use the **Faucet** card (it opens the Shadownet faucet — which is captcha-gated — and copies your address).

## Build & run

```bash
$ npm install
$ npm start          # ng serve → http://localhost:4200
```

The bundled SDK is `@tezos-x/octez.connect-dapp@4.8.6`; the in-app switcher can load other versions at runtime (falling back to the bundled one if the CDN load fails). The WalletConnect transport is configured with a dedicated project id so the relay accepts connections promptly.

## Playground state (debugging)

The test playground persists a little state in `localStorage`:

- `octez.connect.run-history` — JSON-stringified numbered run history (≤ 50 runs).
- `octez.connect.version` — the selected SDK version to load.
- `octez.connect.network` — the selected network.
- `octez.connect.custom-networks` — user-added custom networks.

Clear these keys in DevTools (Application → Local Storage) to reset the playground. The connection-status button in the top toolbar also clears wallet peers + storage and reloads.

## Contributing

- If you find any bugs, submit an [issue](../../issues) or open a [pull-request](../../pulls), helping us catch and fix them.
