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

## Playground state (debugging)

The test playground persists a little state in `localStorage`:

- `octez.connect.run-history` — JSON-stringified numbered run history (≤ 50 runs).
- `octez.connect.version` — the selected SDK version to load.
- `octez.connect.network` — the selected network.
- `octez.connect.custom-networks` — user-added custom networks.

Clear these keys in DevTools (Application → Local Storage) to reset the playground.

## Contributing

- If you find any bugs, submit an [issue](../../issues) or open [pull-request](../../pulls), helping us catch and fix them.
- Engage with other users and developers on the [AirGap Telegram](https://t.me/AirGap).
