import { BUILTIN_NETWORKS, getContractDefault } from './network.config'

describe('network.config', () => {
  it('returns the Shadownet counter default', () => {
    expect(getContractDefault(BUILTIN_NETWORKS['shadownet'], 'counter')).toBe(
      'KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA'
    )
  })

  it('returns null for an unset role (Mainnet counter)', () => {
    expect(getContractDefault(BUILTIN_NETWORKS['mainnet'], 'counter')).toBeNull()
  })
})
