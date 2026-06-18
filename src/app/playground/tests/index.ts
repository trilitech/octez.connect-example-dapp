// Test registry aggregator. Adds and removes test cards happen in the per-category files;
// nothing else in the app should hardcode a list of tests.

import { CORE_TESTS } from './core.tests'
import { STAKING_TESTS } from './staking.tests'
import { CONTRACTS_TESTS } from './contracts.tests'
import { CRYPTO_TESTS } from './crypto.tests'
import { TOKENS_TESTS } from './tokens.tests'
import { VIEW_DATA_TESTS } from './view-data.tests'
import { STUB_TESTS } from './stubs.tests'
import { TestCategory, TestDefinition } from './test-types'

export const ALL_TESTS: TestDefinition[] = [
  ...CORE_TESTS,
  ...STAKING_TESTS,
  ...CONTRACTS_TESTS,
  ...CRYPTO_TESTS,
  ...TOKENS_TESTS,
  ...VIEW_DATA_TESTS,
  ...STUB_TESTS
]

export const TESTS_BY_CATEGORY: Record<TestCategory, TestDefinition[]> = {
  'core': [],
  'staking': [],
  'contracts': [],
  'crypto': [],
  'tokens': [],
  'view-data': []
}
for (const t of ALL_TESTS) {
  TESTS_BY_CATEGORY[t.category].push(t)
}

export interface CategoryMeta {
  label: string
  description: string
}

export const CATEGORY_META: Record<TestCategory, CategoryMeta> = {
  'core': { label: 'Core', description: 'Send tez, batch operations, contract calls.' },
  'staking': {
    label: 'Staking / Delegation',
    description: 'Delegate / remove delegate, stake / unstake / finalize-unstake.'
  },
  'contracts': {
    label: 'Contracts',
    description: 'Origination, storage reads, view execution, dynamic interaction.'
  },
  'crypto': {
    label: 'Crypto',
    description: 'Sign payload RAW / MICHELINE / tz5 BLS.'
  },
  'tokens': { label: 'Tokens', description: 'FA2 transfer/mint/burn + balance reads.' },
  'view-data': {
    label: 'View data',
    description: 'Read-only chain reads (safe-for-run-all).'
  }
}

export const CATEGORY_ORDER: TestCategory[] = [
  'core',
  'crypto',
  'view-data',
  'contracts',
  'tokens',
  'staking'
]
