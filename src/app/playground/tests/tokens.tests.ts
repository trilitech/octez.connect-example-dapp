// FA2 token tests. transfer / mint / burn require a wallet.

import { TestDefinition } from './test-types'

// Build a single-transfer FA2 `transfer` parameter (Michelson JSON):
//   [ Pair from_ [ Pair to_ (Pair token_id amount) ] ]
function buildTransferValue(from: string, to: string, tokenId: string, amount: string): unknown {
  return [
    {
      prim: 'Pair',
      args: [
        { string: from },
        [
          {
            prim: 'Pair',
            args: [{ string: to }, { prim: 'Pair', args: [{ int: tokenId }, { int: amount }] }]
          }
        ]
      ]
    }
  ]
}

const fa2Transfer: TestDefinition = {
  id: 'tokens.fa2-transfer',
  title: 'FA2 transfer',
  category: 'tokens',
  description: 'Calls the FA2 `transfer` entrypoint to move tokens from the active account.',
  requiredScope: 'octez-connect',
  enabled: true,
  inputs: [
    { key: 'contract', label: 'FA2 contract (KT1)', type: 'text', defaultFromNetwork: 'fa2-transfer', placeholder: 'KT1...' },
    { key: 'to', label: 'Recipient', type: 'text', placeholder: 'tz1...' },
    { key: 'tokenId', label: 'Token id', type: 'number', default: 0 },
    { key: 'amount', label: 'Amount', type: 'number', default: 1 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const kt = String(ctx.inputs['contract'] ?? '').trim()
    if (!kt) throw new Error('FA2 contract address is required')
    const to = String(ctx.inputs['to'] ?? '').trim()
    if (!to) throw new Error('recipient is required')
    const value = buildTransferValue(
      ctx.account.address,
      to,
      String(ctx.inputs['tokenId'] ?? '0'),
      String(ctx.inputs['amount'] ?? '1')
    )
    const op = { kind: 'transaction' as const, amount: '0', destination: kt, parameters: { entrypoint: 'transfer', value } }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `FA2 transfer token ${ctx.inputs['tokenId']} → ${to}` }
  }
}

function fa2EntrypointWithJson(id: string, title: string, entrypoint: 'mint' | 'burn'): TestDefinition {
  return {
    id,
    title,
    category: 'tokens',
    description: `Calls the FA2 \`${entrypoint}\` entrypoint with a contract-specific Micheline parameter.`,
    requiredScope: 'octez-connect',
    enabled: true,
    inputs: [
      { key: 'contract', label: 'FA2 contract (KT1)', type: 'text', defaultFromNetwork: 'fa2-transfer', placeholder: 'KT1...' },
      { key: 'value', label: `${entrypoint} parameter (Micheline JSON)`, type: 'json', default: JSON.stringify({ prim: 'Unit' }, null, 2) }
    ],
    async run(ctx) {
      if (!ctx.account) throw new Error('wallet not connected')
      const kt = String(ctx.inputs['contract'] ?? '').trim()
      if (!kt) throw new Error('FA2 contract address is required')
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
      return { request, response, txHash, summary: `FA2 ${entrypoint} on ${kt}` }
    }
  }
}

export const TOKENS_TESTS: TestDefinition[] = [
  fa2Transfer,
  fa2EntrypointWithJson('tokens.fa2-mint', 'FA2 mint', 'mint'),
  fa2EntrypointWithJson('tokens.fa2-burn', 'FA2 burn', 'burn')
]
