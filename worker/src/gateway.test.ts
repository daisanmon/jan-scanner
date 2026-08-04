// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PoizonProductCandidate } from '../../shared/poizon'
import type { WorkerEnv } from './env'

const clientMocks = vi.hoisted(() => ({
  products: vi.fn(),
  price: vi.fn(),
}))

vi.mock('./poizon/client', () => ({
  queryProductsByBarcode: clientMocks.products,
  queryConsignmentPrice: clientMocks.price,
}))

import { PoizonGateway } from './gateway'

const product: PoizonProductCandidate = {
  spuId: '1045489',
  title: 'Test sneaker',
  brandName: 'Test brand',
  skuId: '600297001',
  globalSkuId: '10600297001',
  janCode: '4580563378953',
  sizes: [
    { system: 'JP', value: '28.5' },
    { system: 'EU', value: '45' },
    { system: 'US Men', value: '11.5' },
  ],
}

function createState(): DurableObjectState {
  const values = new Map<string, unknown>()
  return {
    storage: {
      get: async <T>(key: string) => values.get(key) as T | undefined,
      put: async (key: string, value: unknown) => {
        values.set(key, value)
      },
      delete: async (key: string) => values.delete(key),
    },
  } as unknown as DurableObjectState
}

async function lookup(gateway: PoizonGateway) {
  const response = await gateway.fetch(
    new Request('https://internal/lookup', {
      method: 'POST',
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        janCode: '4580563378953',
      }),
    }),
  )
  return response.json() as Promise<Record<string, unknown>>
}

describe('PoizonGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientMocks.products.mockResolvedValue([product])
    clientMocks.price.mockResolvedValue({
      globalMinPrice: 33_900,
      asiaMinPrice: 33_900,
    })
  })

  it('resolves products before prices and returns the confirmed fixture', async () => {
    const calls: string[] = []
    clientMocks.products.mockImplementation(async () => {
      calls.push('181')
      return [product]
    })
    clientMocks.price.mockImplementation(async () => {
      calls.push('93')
      return { globalMinPrice: 33_900, asiaMinPrice: 33_900 }
    })
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)

    const result = await lookup(gateway)

    expect(calls).toEqual(['181', '93'])
    expect(result).toMatchObject({
      state: 'resolved',
      product: {
        spuId: '1045489',
        skuId: '600297001',
        globalSkuId: '10600297001',
      },
      price: {
        currency: 'JPY',
        globalMinPrice: 33_900,
        asiaMinPrice: 33_900,
      },
      cache: { product: false, price: false },
    })
  })

  it('reuses product and price cache entries', async () => {
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)
    await lookup(gateway)
    const second = await lookup(gateway)

    expect(clientMocks.products).toHaveBeenCalledTimes(1)
    expect(clientMocks.price).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ cache: { product: true, price: true } })
  })
})
