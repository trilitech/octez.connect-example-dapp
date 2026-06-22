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

export const BUILTIN_NETWORK_NAMES = ['mainnet', 'shadownet'] as const

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
  contractDefaults: Record<ContractRole, string | null>
  // Public faucet URL for this network, if any (used by the Faucet test).
  faucet?: string
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
    contractDefaults: {
      // Counter (increment/decrement/reset) deployed for the playground —
      // identical code to the Shadownet counter.
      'counter': 'KT1SAdW3q7GuqnRBPnDrKYkTafRrWU6SH2ED',
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
    faucet: 'https://faucet.shadownet.teztnets.com/',
    contractDefaults: {
      'counter': 'KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA',
      // Minimal single-asset FA2 deployed for the playground (open mint,
      // owner-only burn, standard transfer). token_id 0.
      'fa2-transfer': 'KT1MVwdgXubE8D1h9M4WCmU64XE4VRQPhw2f',
      'fa2-balance': 'KT1MVwdgXubE8D1h9M4WCmU64XE4VRQPhw2f'
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

export function getContractDefault(
  network: NetworkConfig,
  role: ContractRole
): string | null {
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
      'counter': null,
      'fa2-transfer': null,
      'fa2-balance': null
    },
    custom: true
  }
}
