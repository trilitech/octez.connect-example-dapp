// Network-driven explorer link helpers. The link base is always the active
// `NetworkConfig.indexer` — never inferred from a network-name string (FR-020).

import { NetworkConfig } from '../playground/network.config'

export function getExplorerLinkForAddress(
  network: NetworkConfig,
  address: string
): string {
  return `${network.indexer}/${address}`
}

export function getExplorerLinkForTxHash(
  network: NetworkConfig,
  txHash: string
): string {
  return `${network.indexer}/${txHash}`
}
