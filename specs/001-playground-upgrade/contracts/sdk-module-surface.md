# Contract: `@tezos-x/octez.connect-dapp` runtime module surface

The playground depends only on the **stable subset** of the SDK that exists in both `4.8.x` and `5.0.0-beta.*`. This document pins that subset so per-test handlers can be written without coupling to any one version.

`SdkLoaderService.load()` resolves to a module with **exactly this shape**:

```ts
// Type-only re-exports for callers; the runtime values come from the loaded module.
type SdkModule = {
  // Constructor — wrapped behind `BeaconService.whenReady()` so callers don't see it directly.
  DAppClient: new (options: {
    name: string
    preferredNetwork?: 'mainnet' | 'shadownet' | string
    network?: { type: string; rpcUrl?: string; name?: string }
    // Other SDK options pass through unchanged.
    [k: string]: unknown
  }) => DAppClient

  // Enums needed as runtime values (string-literal everywhere we can per FR-054; these are
  // only used inside BeaconService to subscribe to events / pass to the SDK).
  NetworkType: { MAINNET: string; SHADOWNET: string; [k: string]: string }
  BeaconEvent: { ACTIVE_ACCOUNT_SET: string; ACTIVE_TRANSPORT_SET: string; [k: string]: string }
  SigningType: { MICHELINE: string; RAW: string; OPERATION: string; [k: string]: string }
  TezosOperationType: {
    TRANSACTION: string
    DELEGATION: string
    ORIGINATION: string
    [k: string]: string
  }
}
```

## DAppClient method surface used

The playground calls only these methods. Each test handler uses a documented subset.

| Method | Used by | Notes |
|---|---|---|
| `requestPermissions()` | `BeaconService.connect()` / `requestPermissions()` | Only called when `getActiveAccount()` returns null (Bug A1 fix). |
| `getActiveAccount()` | `BeaconService.restoreActiveAccount()` | Called on construction and after `reinitClient`. |
| `subscribeToEvent(event, handler)` | `BeaconService.registerSubscriptions()` | For `ACTIVE_ACCOUNT_SET`, `ACTIVE_TRANSPORT_SET`. |
| `requestOperation({ operationDetails: [...] })` | all wallet-mutating tests + dynamic-contract panel | Operations are constructed with **string-literal** `kind` values (`'transaction'`, `'delegation'`, `'origination'`) per FR-054. |
| `requestSignPayload({ payload, signingType, sourceAddress })` | crypto tests + tz5 BLS test | `payload` and `signingType` produced by `buildSignPayload()`. |
| `requestBroadcast(...)` | (reserved — currently unused by any test) | Listed here so the loader contract doesn't break if a future test needs it. |
| `disconnect()` | `BeaconService.disconnect()` | Followed by `_activeAccount$.next(undefined)`. |

## What the playground does NOT depend on

- No specific transport class (`P2PTransport`, `PostMessageTransport`) — the SDK picks at runtime.
- No internal types (`Storage`, `Logger`, `Serializer`) — these vary across versions.
- No specific event-handler payload shapes — handlers only read `address`, `network`, and `connectedAt`.

## Version compatibility expectations

| Version | Status |
|---|---|
| `4.8.5` | Verified working (bundled fallback). Default. |
| `5.0.0-beta.3` – `5.0.0-beta.6` | Verified reachable from esm.sh. The surface listed above is expected to work; per-test errors are surfaced as `TestResult.error` if any specific call signature differs (per FR-056). |
| custom user-supplied version | Best-effort. CDN load failure falls back to bundled per FR-052. |

## Loader behavior contract

```ts
class SdkLoaderService {
  private cached: SdkModule | null = null

  // Resolves to the singleton SdkModule for this page-load.
  // - Reads localStorage['octez.connect.version'] (default: '4.8.5').
  // - Races a bundler-opaque `import('https://esm.sh/@tezos-x/octez.connect-dapp@${version}')` against a 10s timeout.
  // - On CDN error or timeout: falls back to `import('@tezos-x/octez.connect-dapp')` (bundled) and surfaces a toast.
  // - Caches the resolved module for subsequent calls.
  load(): Promise<SdkModule>

  // Persists the selection and reloads the page (FR-049).
  setVersion(version: string): void

  // For the header badge.
  getActiveVersion(): { version: string; source: 'localStorage' | 'default' | 'fallback' }
}
```
