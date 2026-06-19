// FA2 token tests. transfer / mint / burn require a wallet.
//
// Wired by default to the playground's FA2 on Shadownet
// (KT1MVwdgXubE8D1h9M4WCmU64XE4VRQPhw2f): single-asset, open `mint`,
// owner-only `burn`, standard `transfer`. mint/burn params here are built to
// match that contract: mint = (to_, (token_id, amount)), burn = (from_,
// (token_id, amount)). For a different FA2, adjust the handlers/params.

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
    { key: 'to', label: 'Recipient', type: 'text', default: 'tz1burnburnburnburnburnburnburjAYjjX', placeholder: 'tz1...' },
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

// mint = (pair %mint (address %to_) (pair (nat %token_id) (nat %amount)))
const fa2Mint: TestDefinition = {
  id: 'tokens.fa2-mint',
  title: 'FA2 mint',
  category: 'tokens',
  description: 'Calls the FA2 `mint` entrypoint. Defaults to minting to the active account (the playground FA2 has an open mint).',
  requiredScope: 'octez-connect',
  enabled: true,
  inputs: [
    { key: 'contract', label: 'FA2 contract (KT1)', type: 'text', defaultFromNetwork: 'fa2-transfer', placeholder: 'KT1...' },
    { key: 'to', label: 'Recipient (blank = active account)', type: 'text', default: '', placeholder: 'tz1...' },
    { key: 'tokenId', label: 'Token id', type: 'number', default: 0 },
    { key: 'amount', label: 'Amount', type: 'number', default: 100 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const kt = String(ctx.inputs['contract'] ?? '').trim()
    if (!kt) throw new Error('FA2 contract address is required')
    const to = String(ctx.inputs['to'] ?? '').trim() || ctx.account.address
    const tokenId = String(ctx.inputs['tokenId'] ?? '0')
    const amount = String(ctx.inputs['amount'] ?? '1')
    const value = { prim: 'Pair', args: [{ string: to }, { prim: 'Pair', args: [{ int: tokenId }, { int: amount }] }] }
    const op = { kind: 'transaction' as const, amount: '0', destination: kt, parameters: { entrypoint: 'mint', value } }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `FA2 mint ${amount} of token ${tokenId} → ${to}` }
  }
}

// burn = (pair %burn (address %from_) (pair (nat %token_id) (nat %amount)))
// The playground FA2 requires from_ == SENDER, so default from_ to the account.
const fa2Burn: TestDefinition = {
  id: 'tokens.fa2-burn',
  title: 'FA2 burn',
  category: 'tokens',
  description: 'Calls the FA2 `burn` entrypoint. Burns from the active account (the playground FA2 only lets you burn your own balance).',
  requiredScope: 'octez-connect',
  enabled: true,
  inputs: [
    { key: 'contract', label: 'FA2 contract (KT1)', type: 'text', defaultFromNetwork: 'fa2-transfer', placeholder: 'KT1...' },
    { key: 'from', label: 'Owner (blank = active account)', type: 'text', default: '', placeholder: 'tz1...' },
    { key: 'tokenId', label: 'Token id', type: 'number', default: 0 },
    { key: 'amount', label: 'Amount', type: 'number', default: 1 }
  ],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    const kt = String(ctx.inputs['contract'] ?? '').trim()
    if (!kt) throw new Error('FA2 contract address is required')
    const from = String(ctx.inputs['from'] ?? '').trim() || ctx.account.address
    const tokenId = String(ctx.inputs['tokenId'] ?? '0')
    const amount = String(ctx.inputs['amount'] ?? '1')
    const value = { prim: 'Pair', args: [{ string: from }, { prim: 'Pair', args: [{ int: tokenId }, { int: amount }] }] }
    const op = { kind: 'transaction' as const, amount: '0', destination: kt, parameters: { entrypoint: 'burn', value } }
    const request = { operationDetails: [op] }
    const response = await ctx.client.requestOperation(request as any)
    const txHash = (response as { transactionHash?: string })?.transactionHash
    return { request, response, txHash, summary: `FA2 burn ${amount} of token ${tokenId} from ${from}` }
  }
}

export const TOKENS_TESTS: TestDefinition[] = [fa2Transfer, fa2Mint, fa2Burn]
