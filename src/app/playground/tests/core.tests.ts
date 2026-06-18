// Core wallet operations. All require an active wallet; none safe-for-run-all.

import { TestDefinition } from './test-types'

interface TxOp {
  kind: 'transaction'
  amount: string
  destination: string
  parameters?: { entrypoint: string; value: unknown }
}

const sendTez: TestDefinition = {
  id: 'core.send-tez',
  title: 'Send tez',
  category: 'core',
  description: 'Sends a tiny amount of tez to a chosen destination via the active wallet.',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [
    {
      key: 'destination',
      label: 'Destination',
      type: 'text',
      placeholder: 'tz1...',
      default: 'tz1burnburnburnburnburnburnburjAYjjX'
    },
    { key: 'amount', label: 'Amount (mutez)', type: 'number', default: 1 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const destination = String(ctx.inputs['destination'] ?? '').trim()
    if (!destination) throw new Error('destination is required')
    const amount = String(ctx.inputs['amount'] ?? '0')

    const op: TxOp = { kind: 'transaction', amount, destination }
    // Per Beacon SDK 4.x: the `network` field is rejected on request inputs.
    // The client's construction-time network is the source of truth and is
    // kept in sync with the active network by BeaconService.reinitClient().
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return {
      request,
      response,
      txHash,
      summary: `Sent ${amount} mutez to ${destination} on ${ctx.network.name}`
    }
  }
}

const batch: TestDefinition = {
  id: 'core.batch',
  title: 'Batch operations',
  category: 'core',
  description: 'Submits two transactions in a single batch request to the wallet.',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [
    {
      key: 'destination',
      label: 'Destination',
      type: 'text',
      default: 'tz1burnburnburnburnburnburnburjAYjjX'
    },
    { key: 'amount', label: 'Amount per op (mutez)', type: 'number', default: 1 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const destination = String(ctx.inputs['destination'] ?? '').trim()
    if (!destination) throw new Error('destination is required')
    const amount = String(ctx.inputs['amount'] ?? '0')

    const ops: TxOp[] = [
      { kind: 'transaction', amount, destination },
      { kind: 'transaction', amount, destination }
    ]
    const request = { operationDetails: ops }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return {
      request,
      response,
      txHash,
      summary: `Batched 2× ${amount} mutez → ${destination} on ${ctx.network.name}`
    }
  }
}

const contractCall: TestDefinition = {
  id: 'core.contract-call',
  title: 'Contract call (counter)',
  category: 'core',
  description:
    'Calls increment / decrement / reset on a counter contract. Default Shadownet address: KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA.',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [
    {
      key: 'contract',
      label: 'Contract (KT1)',
      type: 'text',
      defaultFromNetwork: 'counter',
      placeholder: 'KT1...'
    },
    {
      key: 'entrypoint',
      label: 'Entrypoint',
      type: 'text',
      default: 'increment',
      help: 'increment | decrement | reset'
    },
    {
      key: 'value',
      label: 'Value (int for increment/decrement, unit for reset)',
      type: 'number',
      default: 1
    }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const kt = String(ctx.inputs['contract'] ?? '').trim()
    if (!kt) throw new Error('no contract address supplied for active network')
    const entrypoint = String(ctx.inputs['entrypoint'] ?? 'increment').trim()
    const intValue = String(ctx.inputs['value'] ?? '1')
    const parameters =
      entrypoint === 'reset'
        ? { entrypoint, value: { prim: 'Unit' } }
        : { entrypoint, value: { int: intValue } }
    const op: TxOp = { kind: 'transaction', amount: '0', destination: kt, parameters }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return {
      request,
      response,
      txHash,
      summary: `${entrypoint}${entrypoint === 'reset' ? '' : `(${intValue})`} on ${kt}`
    }
  }
}

export const CORE_TESTS: TestDefinition[] = [sendTez, batch, contractCall]
