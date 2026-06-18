# Contract: Test registry types

This document is the authoritative interface contract for everything in `src/app/playground/tests/`. Any per-category test file (`core.tests.ts`, `staking.tests.ts`, …) MUST conform to these shapes so the runner and the test card render uniformly.

The same interfaces appear in [data-model.md](../data-model.md) — this file additionally pins **handler authoring conventions** and **examples**.

## TestDefinition (re-stated)

```ts
type TestCategory = 'core' | 'staking' | 'contracts' | 'crypto' | 'tokens' | 'view-data'
type RequiredScope = 'octez-connect' | 'rpc-read' | 'both' | 'none'
type TestStatus = 'idle' | 'running' | 'queued' | 'success' | 'error'
type InputType = 'text' | 'number' | 'boolean' | 'textarea' | 'json'
type ContractRole = 'counter' | 'fa2-transfer' | 'fa2-balance'

interface TestInput {
  key: string
  label: string
  type: InputType
  placeholder?: string
  help?: string
  default?: unknown
  defaultFromNetwork?: ContractRole
}

interface TestContext {
  client: DAppClient
  rpc: RpcService
  indexer: IndexerService
  account?: AccountInfo
  inputs: Record<string, unknown>
  network: NetworkConfig
}

interface TestRunOutput {
  request: unknown
  response: unknown
  txHash?: string
  signature?: string
  summary?: string
}

interface TestDefinition {
  id: string
  title: string
  category: TestCategory
  description: string
  requiredScope: RequiredScope
  safeForRunAll: boolean
  enabled: boolean
  disabledReason?: string
  inputs: TestInput[]
  run: (ctx: TestContext) => Promise<TestRunOutput>
}
```

## Handler authoring conventions

1. **String-literal SDK constants** (FR-054): never import a runtime enum from the SDK; use the string literal directly.

   ```ts
   // ✓ DO
   ctx.client.requestOperation({
     operationDetails: [{ kind: 'transaction', amount: '1', destination: ctx.account!.address }]
   })

   // ✗ DON'T
   import { TezosOperationType } from '@tezos-x/octez.connect-dapp'  // runtime import → bans dynamic loading
   ctx.client.requestOperation({
     operationDetails: [{ kind: TezosOperationType.TRANSACTION, ... }]
   })
   ```

2. **Type-only imports only** (FR-053):

   ```ts
   import type { DAppClient, AccountInfo } from '@tezos-x/octez.connect-dapp'
   ```

3. **No optimistic success**: a successful return MUST mean the operation was either injected (transaction/delegation/origination → got an opHash) or completed (read → got data). Wallets sometimes return `aborted` — translate that into a thrown error so the runner records it as `status: 'error'`.

4. **Errors are thrown, not returned**: the runner wraps `try/catch`; a handler returning a partially-populated `TestRunOutput` would be misleading.

5. **Inputs**: read from `ctx.inputs[key]`. Coerce strings to numbers / booleans explicitly. Validate before sending; on invalid input, throw `new Error('<key>: <reason>')`.

6. **Contract-address inputs** that have a network default use `defaultFromNetwork: <role>`. The test handler MUST handle the case where the value is empty string / `null` (per FR-042, the runner skips it during Run-all-full with a clear error — but individual runs may still hit this if the user clears the input):

   ```ts
   const kt = String(ctx.inputs['contract'] ?? '').trim()
   if (!kt) throw new Error('contract address is required')
   ```

7. **RPC reads** go through `ctx.rpc` only. Never construct raw URLs in a test — the active network base must come from the service.

## Aggregation

```ts
// src/app/playground/tests/index.ts
import { CORE_TESTS } from './core.tests'
import { STAKING_TESTS } from './staking.tests'
import { CONTRACTS_TESTS } from './contracts.tests'
import { CRYPTO_TESTS } from './crypto.tests'
import { TOKENS_TESTS } from './tokens.tests'
import { VIEW_DATA_TESTS } from './view-data.tests'
import { STUB_TESTS } from './stubs.tests'

export const ALL_TESTS: TestDefinition[] = [
  ...CORE_TESTS, ...STAKING_TESTS, ...CONTRACTS_TESTS,
  ...CRYPTO_TESTS, ...TOKENS_TESTS, ...VIEW_DATA_TESTS,
  ...STUB_TESTS,
]

export const TESTS_BY_CATEGORY: Record<TestCategory, TestDefinition[]> = /* groupBy(ALL_TESTS, 'category') */

export const CATEGORY_META: Record<TestCategory, { label: string; description: string }> = {
  'core':       { label: 'Core',        description: 'Send tez, batch operations, contract calls.' },
  'staking':    { label: 'Staking / Delegation', description: 'Delegate, stake/unstake/finalize.' },
  'contracts':  { label: 'Contracts',   description: 'Origination, storage reads, view execution, dynamic interaction.' },
  'crypto':     { label: 'Crypto',      description: 'Sign payload RAW / MICHELINE / tz5 BLS.' },
  'tokens':     { label: 'Tokens',      description: 'FA2 transfer/mint/burn + balance reads.' },
  'view-data':  { label: 'View data',   description: 'Read-only chain reads (safe for Run-all).' },
}
```

## Example: one core test, fully conformant

```ts
// src/app/playground/tests/core.tests.ts (excerpt)
import type { TestDefinition } from './test-types'

export const CORE_SEND_TEZ: TestDefinition = {
  id: 'core.send-tez',
  title: 'Send tez',
  category: 'core',
  description: 'Sends a small amount of tez to a chosen destination using the active wallet.',
  requiredScope: 'octez-connect',
  safeForRunAll: false,                                // costs funds, prompts wallet
  enabled: true,
  inputs: [
    { key: 'destination', label: 'Destination',  type: 'text',   placeholder: 'tz1...', default: '' },
    { key: 'amount',      label: 'Amount (mutez)', type: 'number', default: 1 },
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const destination = String(ctx.inputs['destination'] ?? '').trim()
    if (!destination) throw new Error('destination is required')
    const amount = String(ctx.inputs['amount'] ?? '0')

    const request = {
      operationDetails: [{ kind: 'transaction' as const, amount, destination }],
    }
    const response = await ctx.client.requestOperation(request)
    return {
      request,
      response,
      txHash: response?.transactionHash,
      summary: `Sent ${amount} mutez to ${destination}`,
    }
  },
}

export const CORE_TESTS: TestDefinition[] = [CORE_SEND_TEZ, /* ... */]
```

## Example: one view-data test (safe-for-run-all)

```ts
export const VIEW_ACCOUNT_BALANCE: TestDefinition = {
  id: 'view.account-balance',
  title: 'Account balance',
  category: 'view-data',
  description: 'Reads the balance of an address from the active network via RPC.',
  requiredScope: 'rpc-read',
  safeForRunAll: true,
  enabled: true,
  inputs: [
    { key: 'address', label: 'Address', type: 'text', placeholder: 'tz1... or KT1...', default: '' },
  ],
  async run(ctx) {
    const addr = String(ctx.inputs['address'] ?? '').trim()
    if (!addr) throw new Error('address is required')
    const path = `/chains/main/blocks/head/context/contracts/${addr}/balance`
    const response = await ctx.rpc.get<string>(path)
    const mutez = String(response).replace(/"/g, '')
    return {
      request: { url: ctx.network.rpc + path },
      response,
      summary: `${addr}: ${(Number(mutez) / 1e6).toFixed(6)} XTZ (${mutez} mutez)`,
    }
  },
}
```

## Example: one disabled stub

```ts
export const STUB_SAPLING: TestDefinition = {
  id: 'stubs.sapling',
  title: 'Sapling shielded transactions',
  category: 'contracts',
  description: 'Demonstrates Sapling shielded-pool interactions.',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: false,
  disabledReason: 'Not feasible with octez.connect + RPC alone. Sapling key management requires off-chain proving infrastructure.',
  inputs: [],
  async run() { throw new Error('disabled') }, // never called; runner short-circuits on enabled === false
}
```
