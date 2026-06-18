# Contract: TzKT indexer endpoints consumed

`IndexerService` (`src/app/playground/services/indexer.service.ts`) wraps Angular `HttpClient` with the active `NetworkConfig.api` as base URL. Each row below is the exact endpoint path appended to that base.

## Base URLs

| Network | Base |
|---|---|
| Mainnet | `https://api.tzkt.io` |
| Shadownet | `https://api.shadownet.tzkt.io` |

## Endpoints

### 1. Contract entrypoints (primary source for the dynamic-contract panel)

- **Method + path**: `GET /v1/contracts/{kt}/entrypoints?micheline=true&michelson=false`
- **Path params**: `kt` = `KT1...`.
- **Response** (array):

```json
[
  {
    "name": "increment",
    "jsonParameters": <JSON parameter schema (TzKT-flavored)>,
    "michelineParameters": <Micheline JSON>,
    "michelsonParameters": "<Michelson text>"
  },
  { "name": "decrement", ... },
  { "name": "reset", ... }
]
```

- **Used by**: `IndexerService.getEntrypoints(kt)`. The component maps each entry to an `EntrypointDescriptor { name, jsonParameterSchema: jsonParameters }`.
- **Fallback**: on HTTP error or network failure, the service calls the RPC entrypoints endpoint (see `rpc-endpoints.md` §6) and constructs descriptors from the raw Micheline.

### 2. Operation lookup by hash (report enrichment)

- **Method + path**: `GET /v1/operations/{hash}`
- **Path params**: `hash` = operation hash returned by the SDK.
- **Response**: an array of operation objects (a single hash may contain multiple grouped operations). Each object includes `type`, `block`, `level`, `status`, and operation-specific fields.
- **Used by**: `ReportExportService` (optional enrichment — currently the export uses the hash + explorer URL directly; this endpoint is reserved for future "operation status" display).

### 3. Origination → KT1 resolution

- **Method + path**: `GET /v1/operations/originations?hash={hash}`
- **Query params**: `hash` = operation hash.
- **Response**: an array of origination objects, each with `originatedContract.address` (the new `KT1...`).
- **Used by**: contracts test `contracts.deploy-from-michelson`, after `requestOperation` returns. The test polls this endpoint up to 30 s (3 s between polls) until a result appears, then reports the resolved KT1 alongside the op hash.

### 4. Contract metadata (optional, for richer dynamic-panel display)

- **Method + path**: `GET /v1/contracts/{kt}`
- **Response**: contract object including `alias`, `creator.address`, `kind`, `tokensCount`, etc.
- **Used by**: `contract-explorer` component to show a one-line "this is `<alias>` (<kind>)" header alongside the entrypoint dropdown. Optional — pasting a KT1 doesn't block on this call.

## Notes

- TzKT REST is rate-limited but unauthenticated; the playground uses well below the free tier limits (a handful of requests per user action).
- Responses are stable JSON; no version pinning needed.
- The fallback path (RPC entrypoints) loses TzKT's `jsonParameters` shape — descriptors gracefully degrade with `jsonParameterSchema: null` and `rawMicheline` populated.
