// Disabled stub cards for out-of-scope flows (US8 / T058). Each renders as a
// disabled card with a clear reason; the runner short-circuits on `enabled: false`
// so `run` is never actually invoked.

import { TestDefinition } from './test-types'

function stub(
  id: string,
  title: string,
  category: TestDefinition['category'],
  description: string,
  disabledReason: string
): TestDefinition {
  return {
    id,
    title,
    category,
    description,
    requiredScope: 'octez-connect',
    safeForRunAll: false,
    enabled: false,
    disabledReason,
    inputs: [],
    async run() {
      throw new Error('disabled')
    }
  }
}

export const STUB_TESTS: TestDefinition[] = [
  stub(
    'stubs.sapling',
    'Sapling shielded transactions',
    'contracts',
    'Demonstrates Sapling shielded-pool interactions.',
    'Not feasible with octez.connect + RPC alone. Sapling key management requires off-chain proving infrastructure.'
  ),
  stub(
    'stubs.etherlink-bridge',
    'Etherlink bridge',
    'tokens',
    'Bridge assets to/from Etherlink.',
    'Out of scope: requires the Etherlink bridge contracts and an EVM-side counterpart not exercised by this playground.'
  ),
  stub(
    'stubs.tezlink-bridge',
    'Tezlink bridge',
    'tokens',
    'Bridge assets via Tezlink.',
    'Out of scope: Tezlink bridging requires dedicated bridge infrastructure beyond octez.connect.'
  ),
  stub(
    'stubs.local-fee-estimation',
    'Local fee estimation',
    'core',
    'Estimate operation fees locally before signing.',
    'Out of scope: local fee estimation requires a forging/simulation library (e.g. Taquito) which this playground intentionally avoids.'
  ),
  stub(
    'stubs.onchain-sig-verification',
    'On-chain signature verification',
    'crypto',
    'Verify a signature on-chain via a CHECK_SIGNATURE contract.',
    'Out of scope: requires a deployed verification contract and is not part of the octez.connect surface under test.'
  ),
  stub(
    'stubs.faucet',
    'Faucet',
    'core',
    'Top up the active account from a testnet faucet.',
    'Out of scope: faucet funding is an external service, not an octez.connect capability.'
  )
]
