// View-data tests (rpc-read). All are safe-for-run-all = true (no wallet, no on-chain effect).

import { TestDefinition } from './test-types'

const accountBalance: TestDefinition = {
  id: 'view.account-balance',
  title: 'Account balance',
  category: 'view-data',
  description: 'Reads the balance of an address from the active network via RPC.',
  requiredScope: 'rpc-read',
  safeForRunAll: true,
  enabled: true,
  inputs: [
    {
      key: 'address',
      label: 'Address',
      type: 'text',
      placeholder: 'tz1... or KT1...',
      default: 'tz1burnburnburnburnburnburnburjAYjjX'
    }
  ],
  async run(ctx) {
    const addr = String(ctx.inputs['address'] ?? '').trim()
    if (!addr) throw new Error('address is required')
    const path = `/chains/main/blocks/head/context/contracts/${encodeURIComponent(addr)}/balance`
    const response = await ctx.rpc.get<string>(path)
    const mutez = String(response).replace(/"/g, '')
    return {
      request: { url: ctx.network.rpc + path },
      response,
      summary: `${addr}: ${(Number(mutez) / 1e6).toFixed(6)} XTZ (${mutez} mutez)`
    }
  }
}

const blockInspect: TestDefinition = {
  id: 'view.block-inspect',
  title: 'Block inspection',
  category: 'view-data',
  description: 'Fetches a block header by level (or "head") from the active network.',
  requiredScope: 'rpc-read',
  safeForRunAll: true,
  enabled: true,
  inputs: [
    { key: 'block', label: 'Block (level or "head")', type: 'text', default: 'head' }
  ],
  async run(ctx) {
    const block = String(ctx.inputs['block'] ?? 'head').trim() || 'head'
    const path = `/chains/main/blocks/${encodeURIComponent(block)}`
    const response = await ctx.rpc.get<{ header?: { level?: number; hash?: string; timestamp?: string } }>(path)
    return {
      request: { url: ctx.network.rpc + path },
      response,
      summary: `Block ${response?.header?.level ?? '?'} @ ${response?.header?.timestamp ?? '?'} (${
        response?.header?.hash ?? '?'
      })`
    }
  }
}

const contractEventsPoll: TestDefinition = {
  id: 'view.contract-events-poll',
  title: 'Contract events poll',
  category: 'view-data',
  description:
    'Polls operations in a block and counts those targeted at the configured contract address.',
  requiredScope: 'rpc-read',
  safeForRunAll: true,
  enabled: true,
  inputs: [
    { key: 'block', label: 'Block (level or "head")', type: 'text', default: 'head' },
    {
      key: 'contract',
      label: 'Filter destination (KT1)',
      type: 'text',
      placeholder: 'KT1...',
      defaultFromNetwork: 'counter'
    }
  ],
  async run(ctx) {
    const block = String(ctx.inputs['block'] ?? 'head').trim() || 'head'
    const kt = String(ctx.inputs['contract'] ?? '').trim()
    const path = `/chains/main/blocks/${encodeURIComponent(block)}/operations`
    const response = await ctx.rpc.get<unknown[]>(path)
    const flat = Array.isArray(response) ? response.flat(2) : []
    const matches = kt
      ? flat.filter((op) => {
          const contents = (op as { contents?: { destination?: string }[] })?.contents ?? []
          return contents.some((c) => c.destination === kt)
        })
      : []
    return {
      request: { url: ctx.network.rpc + path, filterDestination: kt || null },
      response: { totalOperations: flat.length, matching: matches.length },
      summary: kt
        ? `Block ${block}: ${matches.length} of ${flat.length} ops target ${kt}`
        : `Block ${block}: ${flat.length} operations (no destination filter applied)`
    }
  }
}

export const VIEW_DATA_TESTS: TestDefinition[] = [accountBalance, blockInspect, contractEventsPoll]
