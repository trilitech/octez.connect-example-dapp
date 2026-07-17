// Multi-network (octez.connect v5) behaviour of BeaconService, tested against
// a fake SDK module so no wallet/transport is needed. The fake mirrors the
// v5 surface the service touches: DAppClient with requestPermissions({networks})
// materialising one account per CAIP-2 chain id, getAccounts, requestOperation.

import { BUILTIN_NETWORKS } from '../../playground/network.config'
import { NetworkService } from '../../playground/services/network.service'
import { BeaconService } from './beacon.service'

const MULTI_NETWORK_KEY = 'octez.connect.multi-network-session'

interface FakeAccount {
  address: string
  accountIdentifier: string
  network: { type?: string; chainId?: string; name?: string }
}

class FakeDAppClient {
  public static instances: FakeDAppClient[] = []
  // Shared across instances, like the real SDK's persistent storage.
  public static storedAccounts: FakeAccount[] = []

  public lastPermissionInput: unknown
  public operationInputs: Array<Record<string, unknown>> = []
  private active: FakeAccount | undefined

  constructor(public readonly options: { name: string; network: { type: string; rpcUrl?: string } }) {
    FakeDAppClient.instances.push(this)
  }

  public async requestPermissions(input?: { networks?: Array<{ chainId: string; name?: string }> }): Promise<void> {
    this.lastPermissionInput = input
    if (input?.networks?.length) {
      FakeDAppClient.storedAccounts = input.networks.map((n, i) => ({
        address: `tz1MultiAccount${i}`,
        accountIdentifier: `acc-${n.chainId}`,
        network: { chainId: n.chainId, name: n.name }
      }))
    } else {
      FakeDAppClient.storedAccounts = [
        {
          address: 'tz1LegacySingle',
          accountIdentifier: 'acc-legacy',
          network: { type: this.options.network.type }
        }
      ]
    }
    this.active = FakeDAppClient.storedAccounts[0]
  }

  public async requestOperation(input: Record<string, unknown>): Promise<unknown> {
    this.operationInputs.push(input)
    return { transactionHash: 'oo_fake' }
  }

  public async getAccounts(): Promise<FakeAccount[]> {
    return [...FakeDAppClient.storedAccounts]
  }

  public async getActiveAccount(): Promise<FakeAccount | undefined> {
    return this.active
  }

  public async setActiveAccount(a: FakeAccount | undefined): Promise<void> {
    this.active = a
  }

  public async removeAccount(id: string): Promise<void> {
    FakeDAppClient.storedAccounts = FakeDAppClient.storedAccounts.filter((a) => a.accountIdentifier !== id)
  }

  public async removeAllAccounts(): Promise<void> {
    FakeDAppClient.storedAccounts = []
    this.active = undefined
  }

  public async removeAllPeers(): Promise<void> {}
  public async destroy(): Promise<void> {}
  public async subscribeToEvent(_event: string, _cb: unknown): Promise<void> {}
}

function fakeSdkModule(): Record<string, unknown> {
  return {
    DAppClient: FakeDAppClient,
    NetworkType: {
      MAINNET: 'mainnet',
      SHADOWNET: 'shadownet',
      TEZOSX_MAINNET: 'tezosx-mainnet',
      CUSTOM: 'custom'
    },
    BeaconEvent: { ACTIVE_ACCOUNT_SET: 'active-account-set', ACTIVE_TRANSPORT_SET: 'active-transport-set' },
    TransportType: { POST_MESSAGE: 'post-message', P2P: 'p2p' }
  }
}

function fakeLoader(version: string) {
  return {
    getActiveVersion: () => ({ version, source: 'localStorage' as const }),
    load: async () => fakeSdkModule()
  }
}

async function makeService(version: string): Promise<{ service: BeaconService; networkService: NetworkService }> {
  const networkService = new NetworkService()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new BeaconService(fakeLoader(version) as any, networkService)
  await service.whenReady()
  return { service, networkService }
}

describe('BeaconService (multi-network, octez.connect v5)', () => {
  beforeEach(() => {
    FakeDAppClient.instances = []
    FakeDAppClient.storedAccounts = []
    window.localStorage.removeItem(MULTI_NETWORK_KEY)
    window.localStorage.removeItem('octez.connect.network')
    window.localStorage.removeItem('octez.connect.custom-networks')
  })

  afterEach(() => {
    window.localStorage.removeItem(MULTI_NETWORK_KEY)
    window.localStorage.removeItem('octez.connect.network')
  })

  it('connectMultiNetwork sends the CAIP-2 chain ids and yields one account per network', async () => {
    const { service } = await makeService('5.0.0')
    const wanted = [BUILTIN_NETWORKS['mainnet'], BUILTIN_NETWORKS['tezosx-mainnet']]

    const accounts = await service.connectMultiNetwork(wanted)

    const client = FakeDAppClient.instances[FakeDAppClient.instances.length - 1]
    expect(client.lastPermissionInput).toEqual({
      networks: [
        { chainId: 'tezos:NetXdQprcVkpaWU', rpcUrl: BUILTIN_NETWORKS['mainnet'].rpc, name: 'mainnet' },
        { chainId: 'tezos:NetXohUVN5QWR4f', rpcUrl: BUILTIN_NETWORKS['tezosx-mainnet'].rpc, name: 'tezosx-mainnet' }
      ]
    })
    expect(accounts.length).toBe(2)
    expect(accounts.map((a) => (a.network as { chainId?: string }).chainId)).toEqual([
      'tezos:NetXdQprcVkpaWU',
      'tezos:NetXohUVN5QWR4f'
    ])
    expect(service.isMultiNetworkSession()).toBeTrue()
  })

  it('rejects multi-network pairing on a pre-v5 SDK', async () => {
    const { service } = await makeService('4.8.6')
    await expectAsync(
      service.connectMultiNetwork([BUILTIN_NETWORKS['mainnet'], BUILTIN_NETWORKS['tezosx-mainnet']])
    ).toBeRejectedWithError(/needs octez\.connect >= 5\.0\.0/)
    expect(service.isMultiNetworkSession()).toBeFalse()
  })

  it('injects the active network CAIP-2 id into requestOperation on a multi-network session', async () => {
    const { service, networkService } = await makeService('5.0.0')
    await service.connectMultiNetwork([BUILTIN_NETWORKS['mainnet'], BUILTIN_NETWORKS['tezosx-mainnet']])

    const client = FakeDAppClient.instances[FakeDAppClient.instances.length - 1]
    const activeChainId = networkService.getActive().chainId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service.client as any).requestOperation({ operationDetails: [] })
    expect(client.operationInputs[0]['network']).toBe(activeChainId)

    // An explicitly provided network is never overridden.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service.client as any).requestOperation({ operationDetails: [], network: 'tezos:NetXohUVN5QWR4f' })
    expect(client.operationInputs[1]['network']).toBe('tezos:NetXohUVN5QWR4f')
  })

  it('does NOT inject a network on legacy single-network sessions', async () => {
    const { service } = await makeService('5.0.0')
    await service.requestPermissions() // classic flow — no networks arg, no flag

    const client = FakeDAppClient.instances[FakeDAppClient.instances.length - 1]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service.client as any).requestOperation({ operationDetails: [] })
    expect('network' in client.operationInputs[0]).toBeFalse()
  })

  it('switches networks on a multi-network session WITHOUT recreating the client', async () => {
    const { service, networkService } = await makeService('5.0.0')
    await service.connectMultiNetwork([BUILTIN_NETWORKS['mainnet'], BUILTIN_NETWORKS['tezosx-mainnet']])
    const clientsBefore = FakeDAppClient.instances.length

    networkService.setSelected('tezosx-mainnet')
    await service.whenReady()

    // v5 destroy() wipes SDK storage, so the multi-network path must reuse
    // the existing client and only swap the active account.
    expect(FakeDAppClient.instances.length).toBe(clientsBefore)
    const active = await service.client.getActiveAccount()
    expect((active?.network as { chainId?: string } | undefined)?.chainId).toBe('tezos:NetXohUVN5QWR4f')
  })

  it('disconnectAll clears the multi-network session flag and account list', async () => {
    const { service } = await makeService('5.0.0')
    await service.connectMultiNetwork([BUILTIN_NETWORKS['mainnet'], BUILTIN_NETWORKS['tezosx-mainnet']])
    expect(service.isMultiNetworkSession()).toBeTrue()

    await service.disconnectAll()

    expect(service.isMultiNetworkSession()).toBeFalse()
    let published: unknown[] = ['sentinel']
    service.multiNetworkAccounts$.subscribe((v) => (published = v)).unsubscribe()
    expect(published).toEqual([])
  })
})
