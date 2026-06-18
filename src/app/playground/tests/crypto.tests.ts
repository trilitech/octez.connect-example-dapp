// Crypto / signing tests. All require an active wallet; none safe-for-run-all.

import { buildSignPayload, SigningTypeLiteral } from '../../utils/sign-payload'
import { TestDefinition } from './test-types'

async function signWith(
  ctx: Parameters<TestDefinition['run']>[0],
  signingType: SigningTypeLiteral
) {
  if (!ctx.account) throw new Error('wallet not connected')
  const message = String(ctx.inputs['message'] ?? 'test')
  const built = buildSignPayload(message, signingType)
  const request = {
    payload: built.payload,
    signingType: built.signingType,
    sourceAddress: ctx.account.address
  }
  const response = await ctx.client.requestSignPayload(request as any)
  const signature = (response as { signature?: string })?.signature
  return {
    request,
    response,
    signature,
    summary: `Signed "${message}" (${signingType}) — ${signature?.slice(0, 24) ?? '(no signature)'}…`
  }
}

const signMicheline: TestDefinition = {
  id: 'crypto.sign-micheline',
  title: 'Sign payload (MICHELINE)',
  category: 'crypto',
  description:
    'Signs a UTF-8 message framed as a micheline-packed string (05 01 <len> <utf8 hex>).',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [{ key: 'message', label: 'Message', type: 'text', default: 'test' }],
  run: (ctx) => signWith(ctx, 'micheline')
}

const signRaw: TestDefinition = {
  id: 'crypto.sign-raw',
  title: 'Sign payload (RAW)',
  category: 'crypto',
  description:
    'Signs a UTF-8 message framed identically to MICHELINE but with signingType="raw".',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [{ key: 'message', label: 'Message', type: 'text', default: 'test' }],
  run: (ctx) => signWith(ctx, 'raw')
}

const signTz5: TestDefinition = {
  id: 'crypto.sign-tz5-bls',
  title: 'Sign payload (tz5 BLS)',
  category: 'crypto',
  description:
    'Signs a payload from a tz5 (BLS) active account. Protocol-U is merged into both Mainnet and Shadownet (2026-06-15), so any network works as long as the active account is a tz5 address.',
  requiredScope: 'octez-connect',
  safeForRunAll: false,
  enabled: true,
  inputs: [{ key: 'message', label: 'Message', type: 'text', default: 'tz5-bls-test' }],
  async run(ctx) {
    if (!ctx.account) throw new Error('wallet not connected')
    if (!ctx.account.address.startsWith('tz5')) {
      throw new Error(
        `active account ${ctx.account.address} is not a tz5 (BLS) address — switch to a tz5 account in your wallet`
      )
    }
    return await signWith(ctx, 'micheline')
  }
}

export const CRYPTO_TESTS: TestDefinition[] = [signMicheline, signRaw, signTz5]
