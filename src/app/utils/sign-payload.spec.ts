import { buildSignPayload } from './sign-payload'

describe('buildSignPayload', () => {
  it('frames an ASCII message as a micheline-packed string', () => {
    const { payload, signingType } = buildSignPayload('test', 'micheline')
    // '05' + '01' + 4-byte BE length (00000004) + utf8 hex of "test" (74657374)
    expect(payload).toBe('050100000004' + '74657374')
    expect(signingType).toBe('micheline')
  })

  it('defaults the signing type to micheline', () => {
    expect(buildSignPayload('test').signingType).toBe('micheline')
  })

  it('uses the UTF-8 byte length, not the JS string length', () => {
    // 'héllo' is 5 chars but 6 UTF-8 bytes ('é' is two bytes).
    const { payload } = buildSignPayload('héllo', 'micheline')
    expect(payload.slice(0, 4)).toBe('0501')
    // length field is the 8 hex chars after the '0501' prefix
    expect(payload.slice(4, 12)).toBe('00000006')
  })

  it('ensures the operation prefix for operation signing', () => {
    expect(buildSignPayload('abcdef', 'operation').payload).toBe('03abcdef')
    expect(buildSignPayload('03abcdef', 'operation').payload).toBe('03abcdef')
  })
})
