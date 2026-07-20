# Beacon Example dApp

> Connect Wallets with dApps on Tezos

[Beacon](https://walletbeacon.io) is the implementation of the wallet interaction standard [tzip-10](https://gitlab.com/tzip/tzip/blob/master/proposals/tzip-10/tzip-10.md) which describes the connnection of a dApp with a wallet.

## Intro

The Beacon Example dApp is the reference implementation of a dApp that uses the [beacon-sdk](https://github.com/airgap-it/beacon-sdk) with various examples of the different message types, it also acts as the landing page for beacon.

## Build

First follow the steps below to install the dependencies:

```bash
$ npm install -g ionic
$ npm install
```

Run locally in browser:

```bash
$ ionic serve
```

## Security

If you discover a security vulnerability within this application, please send an e-mail to hi@airgap.it. All security vulnerabilities will be promptly addressed.

## Testing multi-network (octez.connect v5)

octez.connect **v5.0.0** introduces [multi-network support](https://github.com/trilitech/octez.connect/blob/v5.0.0/MIGRATION.md):
a single pairing can grant the dApp accounts on several Tezos networks at
once, and operations target a specific network by its CAIP-2 chain id
(`tezos:<genesis>`). To try it in the playground:

1. The playground loads octez.connect `5.0.1` (the default) from the CDN —
   nothing to switch. Other versions, including pre-v5 ones and betas, can be
   selected in the **SDK version** dropdown or entered via **Other (custom)…**
2. Click **Connect Multi-Network…** and pick the networks to pair. The
   default selection is the L1+L2 pair that is **live today**: **shadownet**
   (`tezos:NetXsqzbfFenSTS`) and **Tezos X previewnet**
   (`tezos:NetXY2oPPzkxUW1`, the Tezos X L2 with the Michelson runtime, whose
   L1 is shadownet). This sends one `requestPermissions({ networks })`
   request; a v5 wallet grants one account per network, a pre-v5 wallet
   gracefully degrades to a single account (the playground surfaces which
   happened).
3. Use the **Network** dropdown to switch between the paired networks — the
   same pairing serves them all, no re-pairing needed. On a multi-network
   session, every operation request automatically carries the active
   network's CAIP-2 id (required by v5).

The button is disabled on SDK versions before 5.0.0. `mainnet` and
`tezosx-mainnet` are also selectable in the picker, but **Tezos X mainnet is
not live yet** — its genesis id ships in the SDK, while no public RPC/indexer
exists, so RPC-backed reads (e.g. balances) on that network will fail until
the endpoints ship. Pairing and wallet-side operations are unaffected.

## Playground state (debugging)

The test playground persists a little state in `localStorage`:

- `octez.connect.run-history` — JSON-stringified numbered run history (≤ 50 runs).
- `octez.connect.version` — the selected SDK version to load.
- `octez.connect.network` — the selected network.
- `octez.connect.custom-networks` — user-added custom networks.
- `octez.connect.multi-network-session` — set when the current pairing was made
  with the v5 multi-network flow.

Clear these keys in DevTools (Application → Local Storage) to reset the playground.

## Contributing

- If you find any bugs, submit an [issue](../../issues) or open [pull-request](../../pulls), helping us catch and fix them.
- Engage with other users and developers on the [AirGap Telegram](https://t.me/AirGap).
