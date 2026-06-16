// Build a properly framed payload for `requestSignPayload`.
// MICHELINE / RAW → micheline-packed string: `'05' + '01' + <4-byte BE length, 8 hex chars> + <utf8 hex>`.
// OPERATION       → ensure the message starts with the `'03'` forging prefix.
// Length is the UTF-8 byte length of the message (not the JS string `.length`),
// so multi-byte characters frame correctly (spec FR-006).
//
// Uses the global `Buffer` polyfill that's already wired up at app boot — no new deps.

export type SigningTypeLiteral = 'micheline' | 'raw' | 'operation'

export interface BuiltSignPayload {
  payload: string
  signingType: SigningTypeLiteral
}

export function buildSignPayload(
  message: string,
  signingType: SigningTypeLiteral = 'micheline'
): BuiltSignPayload {
  if (signingType === 'operation') {
    const hex = message.startsWith('03') ? message : '03' + message
    return { payload: hex, signingType }
  }

  const bytes = Buffer.from(message, 'utf8')
  const len = bytes.length
  const lenHex = len.toString(16).padStart(8, '0')
  const utf8Hex = bytes.toString('hex')
  const payload = '05' + '01' + lenHex + utf8Hex
  return { payload, signingType }
}
