// Single source of truth for network endpoints, indexer endpoints, and per-network
// default contract addresses used by playground tests.
//
// Built-in networks: Mainnet, Shadownet. Users may add custom networks at runtime
// (e.g., a new Tezos testnet) via NetworkService.addCustomNetwork(); those are
// persisted in localStorage['octez.connect.custom-networks'] and merged with the
// built-ins to form the active network list.

// `NetworkName` is now a plain string so custom networks (with user-chosen
// names) can coexist with the built-ins in the same dropdown / storage key.
// The two built-in slugs stay stable and are case-checked by the Mainnet
// confirmation prompt (FR-041) and similar logic.
export type NetworkName = string

export const BUILTIN_NETWORK_NAMES = ['mainnet', 'shadownet', 'tezosx-mainnet', 'tezosx-previewnet'] as const

export type ContractRole = 'counter' | 'fa2-transfer' | 'fa2-balance'

export interface NetworkConfig {
  name: NetworkName
  // String literal passed to the SDK at client construction (per FR-054).
  // For custom networks, pick the Beacon SDK NetworkType value that best fits —
  // commonly 'custom' so the SDK trusts the rpcUrl directly.
  sdkNetworkType: string
  rpc: string
  // Explorer UI base (used in rendered links).
  indexer: string
  // Indexer REST API base.
  api: string
  // Full CAIP-2 chain id (`tezos:<genesis>`), used by the octez.connect v5
  // multi-network flow (`requestPermissions({ networks })` + per-operation
  // routing). Only set for networks with a fixed, known genesis — values
  // mirror the SDK's TEZOS_NETWORK_GENESIS_IDS table.
  chainId?: string
  contractDefaults: Record<ContractRole, string | null>
  // Marks user-added networks so the UI can surface a delete affordance.
  custom?: boolean
}

export const BUILTIN_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    name: 'mainnet',
    sdkNetworkType: 'mainnet',
    rpc: 'https://tezos-mainnet.octez.io',
    indexer: 'https://tzkt.io',
    api: 'https://api.tzkt.io',
    chainId: 'tezos:NetXdQprcVkpaWU',
    contractDefaults: {
      counter: null, // user will deploy themselves — see memory `mainnet-counter-deploy`
      'fa2-transfer': null, // open: pick an FA2 the user controls — memory `mainnet-fa2-default-open`
      'fa2-balance': null
    }
  },
  shadownet: {
    name: 'shadownet',
    sdkNetworkType: 'shadownet',
    rpc: 'https://tezos-shadownet.octez.io',
    indexer: 'https://shadownet.tzkt.io',
    api: 'https://api.shadownet.tzkt.io',
    chainId: 'tezos:NetXsqzbfFenSTS',
    contractDefaults: {
      counter: 'KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA',
      'fa2-transfer': null,
      'fa2-balance': null
    }
  },
  // Tezos X L2 (Michelson runtime) mainnet — introduced by octez.connect v5
  // multi-network support. The chain id is the SDK's maintainer-supplied
  // genesis (TEZOS_NETWORK_GENESIS_IDS); pairing/multi-network routing only
  // needs the chainId. No public RPC/indexer was reachable when this was
  // added — the URLs below follow the octez.io/tzkt naming conventions and
  // should be re-verified once the endpoints ship (users can add a custom
  // network to override in the meantime).
  'tezosx-mainnet': {
    name: 'tezosx-mainnet',
    sdkNetworkType: 'tezosx-mainnet',
    rpc: 'https://tezosx-mainnet.octez.io',
    indexer: 'https://tezosx.tzkt.io',
    api: 'https://api.tezosx.tzkt.io',
    chainId: 'tezos:NetXohUVN5QWR4f',
    contractDefaults: {
      counter: null,
      'fa2-transfer': null,
      'fa2-balance': null
    }
  },
  // Tezos X previewnet (L2, Michelson runtime; its L1 is shadownet) — the
  // pair that is actually LIVE today for multi-network testing. The chain id
  // is RPC-sourced (`/chains/main/chain_id` = NetXY2oPPzkxUW1, confirmed
  // against the tzkt head). Not in the SDK's static genesis table, which is
  // fine: over P2P/postmessage the chain id passes through opaquely (it is
  // only excluded from WalletConnect session proposals).
  'tezosx-previewnet': {
    name: 'tezosx-previewnet',
    sdkNetworkType: 'tezosx-previewnet',
    rpc: 'https://michelson.previewnet.tezosx.nomadic-labs.com',
    indexer: 'https://previewnet.tezosx.tzkt.io',
    api: 'https://api.previewnet.tezosx.tzkt.io',
    chainId: 'tezos:NetXY2oPPzkxUW1',
    contractDefaults: {
      counter: null,
      'fa2-transfer': null,
      'fa2-balance': null
    }
  }
}

// Backwards-compat alias for callers that still import `NETWORKS`.
export const NETWORKS = BUILTIN_NETWORKS

export interface CustomNetworkInput {
  name: string
  sdkNetworkType: string
  rpc: string
  indexer: string
  api: string
}

export function isBuiltinNetwork(name: string): boolean {
  return (BUILTIN_NETWORK_NAMES as readonly string[]).includes(name)
}

export function getContractDefault(network: NetworkConfig, role: ContractRole): string | null {
  return network.contractDefaults[role]
}

// Build a NetworkConfig record from a user-supplied custom network input.
// All contract defaults are null until the user supplies one per-test.
export function toCustomNetworkConfig(input: CustomNetworkInput): NetworkConfig {
  return {
    name: input.name,
    sdkNetworkType: input.sdkNetworkType,
    rpc: input.rpc.replace(/\/$/, ''),
    indexer: input.indexer.replace(/\/$/, ''),
    api: input.api.replace(/\/$/, ''),
    contractDefaults: {
      counter: null,
      'fa2-transfer': null,
      'fa2-balance': null
    },
    custom: true
  }
}
