import { BUILTIN_NETWORKS, getContractDefault } from './network.config'

describe('network.config', () => {
  it('returns the Shadownet counter default', () => {
    expect(getContractDefault(BUILTIN_NETWORKS['shadownet'], 'counter')).toBe('KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA')
  })

  it('returns null for an unset role (Mainnet counter)', () => {
    expect(getContractDefault(BUILTIN_NETWORKS['mainnet'], 'counter')).toBeNull()
  })

  // Multi-network (octez.connect v5): the CAIP-2 ids mirror the SDK's
  // TEZOS_NETWORK_GENESIS_IDS table and are what requestPermissions({networks})
  // sends, so they must not drift.
  it('exposes the CAIP-2 chain ids used by v5 multi-network pairing', () => {
    expect(BUILTIN_NETWORKS['mainnet'].chainId).toBe('tezos:NetXdQprcVkpaWU')
    expect(BUILTIN_NETWORKS['tezosx-mainnet'].chainId).toBe('tezos:NetXohUVN5QWR4f')
    expect(BUILTIN_NETWORKS['shadownet'].chainId).toBe('tezos:NetXsqzbfFenSTS')
    // RPC-sourced (michelson.previewnet.tezosx.nomadic-labs.com /chains/main/chain_id).
    expect(BUILTIN_NETWORKS['tezosx-previewnet'].chainId).toBe('tezos:NetXY2oPPzkxUW1')
  })

  it('ships tezosx-mainnet as a built-in with no contract defaults', () => {
    const cfg = BUILTIN_NETWORKS['tezosx-mainnet']
    expect(cfg.sdkNetworkType).toBe('tezosx-mainnet')
    expect(getContractDefault(cfg, 'counter')).toBeNull()
    expect(getContractDefault(cfg, 'fa2-transfer')).toBeNull()
    expect(getContractDefault(cfg, 'fa2-balance')).toBeNull()
  })
})
