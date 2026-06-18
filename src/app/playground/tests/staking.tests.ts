// Staking / delegation tests. All require an active wallet; none safe-for-run-all.
//
// stake / unstake / finalize_unstake are protocol pseudo-operations modeled as
// transactions to the account's OWN address with the matching entrypoint and a
// Unit parameter (FR-028 / FR-029).

import { TestDefinition } from './test-types'

const setDelegate: TestDefinition = {
  id: 'staking.set-delegate',
  title: 'Set delegate',
  category: 'staking',
  description: 'Delegates the active account to a chosen baker.',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [{ key: 'delegate', label: 'Baker (tz1/tz2/tz3)', type: 'text', placeholder: 'tz1...' }],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const delegate = String(ctx.inputs['delegate'] ?? '').trim()
    if (!delegate) throw new Error('delegate (baker) address is required')
    const op = { kind: 'delegation' as const, delegate }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `delegated to ${delegate}` }
  }
}

const removeDelegate: TestDefinition = {
  id: 'staking.remove-delegate',
  title: 'Remove delegate',
  category: 'staking',
  description: 'Removes the active account’s delegation (undelegate).',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const op = { kind: 'delegation' as const }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: 'delegation removed' }
  }
}

function selfPseudoOp(
  id: string,
  title: string,
  entrypoint: 'stake' | 'unstake' | 'finalize_unstake',
  withAmount: boolean
): TestDefinition {
  return {
    id,
    title,
    category: 'staking',
    description: `Submits a ${entrypoint} pseudo-operation to the active account’s own address.`,
    requiredScope: 'octez-connect',
    safeForRunAll: false,
    enabled: true,
    inputs: withAmount ? [{ key: 'amount', label: 'Amount (mutez)', type: 'number', default: 1 }] : [],
    async run(ctx) {
      if (!ctx.account) throw new Error('wallet not connected')
      const amount = withAmount ? String(ctx.inputs['amount'] ?? '0') : '0'
      const op = {
        kind: 'transaction' as const,
        amount,
        destination: ctx.account.address,
        parameters: { entrypoint, value: { prim: 'Unit' } }
      }
      const request = { operationDetails: [op] }
      const response = await ctx.client.requestOperation(request as any)
      const txHash = (response as { transactionHash?: string })?.transactionHash
      return { request, response, txHash, summary: `${entrypoint}${withAmount ? `(${amount} mutez)` : ''}` }
    }
  }
}

export const STAKING_TESTS: TestDefinition[] = [
  setDelegate,
  removeDelegate,
  selfPseudoOp('staking.stake', 'Stake', 'stake', true),
  selfPseudoOp('staking.unstake', 'Unstake', 'unstake', true),
  selfPseudoOp('staking.finalize-unstake', 'Finalize unstake', 'finalize_unstake', false)
]
