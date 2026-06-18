# Contract: Tezos RPC endpoints consumed

`RpcService` (`src/app/playground/services/rpc.service.ts`) wraps Angular `HttpClient` with the active `NetworkConfig.rpc` as base URL. Each row below is the exact endpoint path appended to that base.

## Base URLs

| Network | Base |
|---|---|
| Mainnet | `https://tezos-mainnet.octez.io` |
| Shadownet | `https://tezos-shadownet.octez.io` |

## Endpoints

### 1. Account balance

- **Method + path**: `GET /chains/main/blocks/head/context/contracts/{addr}/balance`
- **Path params**: `addr` = `tz1...`/`tz2...`/`tz3...`/`tz4...`/`tz5...`/`KT1...`
- **Response**: a JSON-encoded string holding the balance in mutez, e.g. `"123456789"`.
- **Used by**: view-data test `view.account-balance`. Test renders balance in both mutez and tez (divide by 1e6).
- **Failure modes**: 404 if address unknown to the node; surfaced as `TestResult.error`.

### 2. Block inspection

- **Method + path**: `GET /chains/main/blocks/{block}`
- **Path params**: `block` = block level (integer string) or `'head'` / `'head~N'`.
- **Response**: the full block JSON (header, metadata, operations[]).
- **Used by**: view-data test `view.block-inspect`. Test renders header summary; full body available in the request/response panels.

### 3. Operations in a block (events poll)

- **Method + path**: `GET /chains/main/blocks/{block}/operations`
- **Path params**: as above.
- **Response**: a 4-element array of operation arrays grouped by validation pass.
- **Used by**: view-data test `view.contract-events-poll`. The card flattens, filters by destination = configured KT1, and counts matching operations in the requested block.

### 4. Contract storage read

- **Method + path**: `GET /chains/main/blocks/head/context/contracts/{kt}/storage`
- **Path params**: `kt` = `KT1...`.
- **Response**: Micheline-JSON of the contract's storage.
- **Used by**: contracts test `contracts.read-storage`.

### 5. Run script view (off-chain view execution)

- **Method + path**: `POST /chains/main/blocks/head/helpers/scripts/run_script_view`
- **Body** (JSON):

```json
{
  "contract": "KT1...",
  "view": "<view-name>",
  "input": <Micheline JSON>,
  "chain_id": "<chain id from /chains/main/chain_id>",
  "unparsing_mode": "Readable"
}
```

- **Optional body fields**: `source` (caller address), `payer`, `gas` (string mutez).
- **Response**: `{ "data": <Micheline JSON> }`.
- **Used by**: contracts test `contracts.view-exec`. The test card takes contract address, view name, and input JSON as user inputs; chain_id is fetched once at boot via `GET /chains/main/chain_id` (read-only, cached for the session).

### 6. Entrypoints (RPC fallback)

- **Method + path**: `GET /chains/main/blocks/head/context/contracts/{kt}/entrypoints`
- **Path params**: `kt` = `KT1...`.
- **Response**: `{ "entrypoints": { "<name>": <Micheline type> }, "unreachable": [<path>] }`.
- **Used by**: `IndexerService.getEntrypoints()` falls back here when TzKT is unreachable. The Micheline types are kept as `EntrypointDescriptor.rawMicheline`.

### 7. Chain ID (cached)

- **Method + path**: `GET /chains/main/chain_id`
- **Response**: a string like `"NetXdQprcVkpaWU"`.
- **Used by**: `contracts.view-exec` test, cached once per session per network.

## Notes

- All responses are read-only — RPC `POST` `/run_script_view` is read-only by design (no signing, no broadcast).
- `RpcService` does not retry on network errors; failures surface as `TestResult.error`. Callers may choose to surface a more-actionable message (e.g., "RPC unreachable — check network status").
- The base URL **must** be re-read from the active `NetworkConfig` at call time so a mid-test network toggle doesn't strand the call on the previous endpoint.
