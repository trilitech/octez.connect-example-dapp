// Contract-centric tests: origination (deploy from Michelson JSON), global
// constants, deposits limits, and operation-shaping edge cases (limits /
// intentional failures).
//
// Handlers use string-literal operation kinds only (FR-054).

import { TestDefinition } from './test-types'

// A minimal counter-style contract used as the default origination payload.
const DEFAULT_SCRIPT_JSON = JSON.stringify(
  {
    code: [
      { prim: 'parameter', args: [{ prim: 'unit' }] },
      { prim: 'storage', args: [{ prim: 'int' }] },
      {
        prim: 'code',
        args: [[{ prim: 'CDR' }, { prim: 'NIL', args: [{ prim: 'operation' }] }, { prim: 'PAIR' }]]
      }
    ],
    storage: { int: '0' }
  },
  null,
  2
)

const deployFromMichelson: TestDefinition = {
  id: 'contracts.deploy-from-michelson',
  title: 'Deploy from Michelson JSON',
  category: 'contracts',
  description:
    'Originates a contract from a { code, storage } Michelson-JSON payload, then resolves the originated KT1 from the indexer (RPC fallback).',
  requiredScope: 'octez-connect',
  enabled: true,
  inputs: [
    {
      key: 'script',
      label: 'Michelson JSON ({ code, storage })',
      type: 'json',
      default: DEFAULT_SCRIPT_JSON
    },
    { key: 'balance', label: 'Initial balance (mutez)', type: 'number', default: 0 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const raw = String(ctx.inputs['script'] ?? '').trim()
    if (!raw) throw new Error('script JSON is required')

    let script: { code: unknown; storage: unknown }
    try {
      script = JSON.parse(raw)
    } catch (err) {
      throw new Error(`malformed Michelson JSON: ${(err as Error)?.message ?? err}`)
    }
    if (!script || script.code === undefined || script.storage === undefined) {
      throw new Error('script JSON must contain both "code" and "storage" fields')
    }

    const balance = String(ctx.inputs['balance'] ?? '0')
    const op = {
      kind: 'origination' as const,
      balance,
      script: { code: script.code, storage: script.storage }
    }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash

    let originatedAddress: string | undefined
    if (txHash) {
      originatedAddress = (await ctx.indexer.findOriginatedKt(txHash)) ?? undefined
    }

    return {
      request,
      response,
      txHash,
      originatedAddress,
      summary: originatedAddress
        ? `Originated ${originatedAddress}`
        : `Origination submitted (${txHash ?? 'no hash'}); KT1 not resolved yet — check the indexer.`
    }
  }
}

const increasePaidStorage: TestDefinition = {
  id: 'contracts.increase-paid-storage',
  title: 'Increase paid storage',
  category: 'contracts',
  description: 'Submits an increase_paid_storage operation against a target contract.',
  requiredScope: 'octez-connect',
  enabled: true,
  inputs: [
    { key: 'destination', label: 'Contract (KT1)', type: 'text', defaultFromNetwork: 'counter', placeholder: 'KT1...' },
    { key: 'amount', label: 'Bytes to add', type: 'number', default: 1 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const destination = String(ctx.inputs['destination'] ?? '').trim()
    if (!destination) throw new Error('contract address is required')
    const amount = String(ctx.inputs['amount'] ?? '1')
    const op = { kind: 'increase_paid_storage' as const, amount, destination }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `increase_paid_storage(${amount}) on ${destination}` }
  }
}

const registerGlobalConstant: TestDefinition = {
  id: 'contracts.register-global-constant',
  title: 'Register global constant',
  category: 'contracts',
  description: 'Registers a Micheline value as a global constant.',
  requiredScope: 'octez-connect',
  enabled: true,
  inputs: [
    {
      key: 'value',
      label: 'Value (Micheline JSON)',
      type: 'json',
      default: '',
      placeholder: '{ "int": "0" }  — leave blank to auto-generate a unique value',
      help: 'A global constant is content-addressed: the same value can be registered only once (re-registering fails with Expression_already_registered). Leave blank to register a unique value, or enter your own.'
    }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const raw = String(ctx.inputs['value'] ?? '').trim()
    let value: unknown
    if (!raw) {
      // No value supplied → register a unique constant so the op doesn't collide
      // with an already-registered expression (Expression_already_registered).
      value = { int: String(Date.now()) }
    } else {
      try {
        value = JSON.parse(raw)
      } catch (err) {
        throw new Error(`malformed Micheline JSON: ${(err as Error)?.message ?? err}`)
      }
    }
    const op = { kind: 'register_global_constant' as const, value }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `register_global_constant(${JSON.stringify(value)}) submitted` }
  }
}

const setDepositsLimit: TestDefinition = {
  id: 'contracts.set-deposits-limit',
  title: 'Set deposits limit',
  category: 'contracts',
  description: 'Sets (or, when blank, removes) the staking deposits limit for the active account.',
  requiredScope: 'octez-connect',
  // Deprecated under Adaptive Issuance: on current protocols (e.g. 024-PtTALLiN)
  // wallets reject the set_deposits_limit operation kind, so it can't succeed.
  // Staking deposit behavior is now controlled via stake / unstake instead.
  enabled: false,
  disabledReason:
    'set_deposits_limit is deprecated under Adaptive Issuance and is rejected by wallets on current protocols. Use the Staking tests (stake / unstake) instead.',
  inputs: [{ key: 'limit', label: 'Limit (mutez, blank to remove)', type: 'text', default: '' }],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const raw = String(ctx.inputs['limit'] ?? '').trim()
    const op: Record<string, unknown> = { kind: 'set_deposits_limit' }
    if (raw) op['limit'] = raw
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: raw ? `set_deposits_limit(${raw})` : 'remove deposits limit' }
  }
}

const failingContract: TestDefinition = {
  id: 'contracts.failing-contract',
  title: 'Failing contract call (FAILWITH)',
  category: 'contracts',
  description:
    'Calls an entrypoint expected to run FAILWITH. The rejection is the expected outcome, so it is recorded as a success.',
  requiredScope: 'octez-connect',
  enabled: true,
  expectsFailure: true,
  inputs: [
    { key: 'contract', label: 'Contract (KT1)', type: 'text', defaultFromNetwork: 'counter', placeholder: 'KT1...' },
    { key: 'entrypoint', label: 'Entrypoint', type: 'text', default: 'fail' },
    { key: 'value', label: 'Parameter (Micheline JSON)', type: 'json', default: JSON.stringify({ prim: 'Unit' }, null, 2) }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const kt = String(ctx.inputs['contract'] ?? '').trim()
    if (!kt) throw new Error('contract address is required')
    const entrypoint = String(ctx.inputs['entrypoint'] ?? 'fail').trim()
    let value: unknown
    try {
      value = JSON.parse(String(ctx.inputs['value'] ?? '').trim() || '{"prim":"Unit"}')
    } catch (err) {
      throw new Error(`malformed parameter JSON: ${(err as Error)?.message ?? err}`)
    }
    const op = { kind: 'transaction' as const, amount: '0', destination: kt, parameters: { entrypoint, value } }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `called ${entrypoint} on ${kt} (expected to fail)` }
  }
}

const failingNoop: TestDefinition = {
  id: 'contracts.failing-noop',
  title: 'Invalid operation (malformed destination)',
  category: 'contracts',
  description:
    'Submits an intentionally-invalid transaction (malformed destination). The rejection is the expected outcome, so it is recorded as a success.',
  requiredScope: 'octez-connect',
  enabled: true,
  expectsFailure: true,
  inputs: [{ key: 'destination', label: 'Destination', type: 'text', default: 'KT1invalidinvalidinvalidinvalid' }],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const destination = String(ctx.inputs['destination'] ?? '').trim()
    const op = { kind: 'transaction' as const, amount: '0', destination }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `submitted invalid op to ${destination}` }
  }
}

const transactionLimit: TestDefinition = {
  id: 'contracts.transaction-limit',
  title: 'Transaction with explicit limits',
  category: 'contracts',
  description:
    'Sends a transaction with explicit gas_limit / storage_limit / fee overrides to demonstrate limit-controlled execution.',
  requiredScope: 'octez-connect',
  enabled: true,
  inputs: [
    { key: 'destination', label: 'Destination', type: 'text', default: 'tz1burnburnburnburnburnburnburjAYjjX' },
    { key: 'amount', label: 'Amount (mutez)', type: 'number', default: 1 },
    { key: 'fee', label: 'Fee (mutez)', type: 'number', default: 1000 },
    { key: 'gasLimit', label: 'Gas limit', type: 'number', default: 1500 },
    { key: 'storageLimit', label: 'Storage limit', type: 'number', default: 0 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const destination = String(ctx.inputs['destination'] ?? '').trim()
    if (!destination) throw new Error('destination is required')
    const op = {
      kind: 'transaction' as const,
      amount: String(ctx.inputs['amount'] ?? '1'),
      destination,
      fee: String(ctx.inputs['fee'] ?? '1000'),
      gas_limit: String(ctx.inputs['gasLimit'] ?? '1500'),
      storage_limit: String(ctx.inputs['storageLimit'] ?? '0')
    }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `sent ${op.amount} mutez with explicit limits` }
  }
}

export const CONTRACTS_TESTS: TestDefinition[] = [
  deployFromMichelson,
  increasePaidStorage,
  registerGlobalConstant,
  setDepositsLimit,
  failingContract,
  failingNoop,
  transactionLimit
]
