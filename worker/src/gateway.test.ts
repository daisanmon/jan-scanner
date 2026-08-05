// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PoizonProductCandidate } from '../../shared/poizon'
import type { WorkerEnv } from './env'
import { PoizonUpstreamError } from './errors'

const clientMocks = vi.hoisted(() => ({
  products: vi.fn(),
  market: vi.fn(),
  batchPrices: vi.fn(),
  legacyPrice: vi.fn(),
}))

vi.mock('./poizon/client', () => ({
  queryProductsByBarcode: clientMocks.products,
  queryMarketBySpu: clientMocks.market,
  queryBatchPrices: clientMocks.batchPrices,
  queryConsignmentPrice: clientMocks.legacyPrice,
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

const market = {
  spuId: '1045489',
  title: 'Test sneaker',
  brandName: 'Test brand',
  skus: [
    {
      skuId: '600297001',
      globalSkuId: '10600297001',
      sizes: product.sizes,
      globalSoldNum30: 200,
      localSoldNum30: 2,
      globalMonthToMonthRatio: 0.25,
      localMonthToMonthRatio: -0.5,
      averageTransactionPrice: 33_000,
    },
    {
      skuId: '600297002',
      globalSkuId: '10600297002',
      sizes: [{ system: 'JP', value: '29' }],
      globalSoldNum30: 400,
      localSoldNum30: 0,
      globalMonthToMonthRatio: 0.1,
      localMonthToMonthRatio: 0,
      averageTransactionPrice: 35_000,
    },
    {
      skuId: '600297003',
      globalSkuId: '10600297003',
      sizes: [{ system: 'JP', value: '29.5' }],
      globalSoldNum30: null,
      localSoldNum30: null,
      globalMonthToMonthRatio: null,
      localMonthToMonthRatio: null,
      averageTransactionPrice: null,
    },
  ],
}

const prices = [
  { skuId: '600297002', globalMinPrice: 35_900, asiaMinPrice: 34_900 },
  { skuId: '600297001', globalMinPrice: 33_900, asiaMinPrice: 33_900 },
  { skuId: '600297003', globalMinPrice: 37_900, asiaMinPrice: null },
]

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

async function lookup(
  gateway: PoizonGateway,
  selection: { selectedSpuId?: string; selectedSkuId?: string } = {},
) {
  const response = await gateway.fetch(
    new Request('https://internal/lookup', {
      method: 'POST',
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        janCode: '4580563378953',
        ...selection,
      }),
    }),
  )
  return response.json() as Promise<Record<string, unknown>>
}

describe('PoizonGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientMocks.products.mockResolvedValue([product])
    clientMocks.market.mockResolvedValue(market)
    clientMocks.batchPrices.mockResolvedValue(prices)
    clientMocks.legacyPrice.mockResolvedValue({
      globalMinPrice: 33_900,
      asiaMinPrice: 33_900,
    })
  })

  it('runs 181 -> 169 -> 141 and returns aggregate plus per-size market data', async () => {
    const calls: string[] = []
    clientMocks.products.mockImplementation(async () => {
      calls.push('181')
      return [product]
    })
    clientMocks.market.mockImplementation(async () => {
      calls.push('169')
      return market
    })
    clientMocks.batchPrices.mockImplementation(async () => {
      calls.push('141')
      return prices
    })
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)

    const result = await lookup(gateway)

    expect(calls).toEqual(['181', '169', '141'])
    expect(result).toMatchObject({
      state: 'resolved',
      product: {
        spuId: '1045489',
        skuId: '600297001',
        globalSkuId: '10600297001',
      },
      market: {
        summary: {
          currency: 'JPY',
          globalSoldNum30Total: 600,
          referencePrice: {
            min: 33_900,
            median: 34_400,
            max: 34_900,
            reportedSizeCount: 2,
            totalSizeCount: 3,
          },
          salesPerSize: {
            min: 200,
            median: 300,
            max: 400,
            reportedSizeCount: 2,
            totalSizeCount: 3,
          },
          salesWeightedAveragePrice: 34_333,
          bestSellingSkuId: '600297002',
        },
        warnings: ['PRICE_PARTIAL', 'SALES_PARTIAL'],
      },
      price: {
        currency: 'JPY',
        globalMinPrice: 33_900,
        asiaMinPrice: 33_900,
      },
      cache: { product: false, market: false, price: false },
    })
    expect(
      (result.market as { sizes: Array<{ scanned: boolean }> }).sizes[0].scanned,
    ).toBe(true)
    expect(clientMocks.legacyPrice).not.toHaveBeenCalled()
  })

  it('reuses product, market, and batch price cache entries', async () => {
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)
    await lookup(gateway)
    const second = await lookup(gateway)

    expect(clientMocks.products).toHaveBeenCalledTimes(1)
    expect(clientMocks.market).toHaveBeenCalledTimes(1)
    expect(clientMocks.batchPrices).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({
      cache: { product: true, market: true, price: true },
    })
  })

  it('computes complete totals, medians, and sales-weighted average prices', async () => {
    clientMocks.market.mockResolvedValue({
      ...market,
      skus: market.skus.slice(0, 2),
    })
    clientMocks.batchPrices.mockResolvedValue(prices.slice(0, 2))
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)

    const result = await lookup(gateway)

    expect(result).toMatchObject({
      market: {
        summary: {
          globalSoldNum30Total: 600,
          referencePrice: { min: 33_900, median: 34_400, max: 34_900 },
          salesPerSize: { min: 200, median: 300, max: 400 },
          salesWeightedAveragePrice: 34_333,
          bestSellingSkuId: '600297002',
        },
        warnings: [],
      },
    })
  })

  it('falls back to the existing single-size API 93 result if API 169 fails', async () => {
    clientMocks.market.mockRejectedValue(
      new PoizonUpstreamError('unavailable', 169, 503),
    )
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)

    const result = await lookup(gateway)

    expect(result).toMatchObject({
      state: 'resolved',
      product: { skuId: '600297001' },
      price: { globalMinPrice: 33_900, asiaMinPrice: 33_900 },
      cache: { product: false, market: false, price: false },
    })
    expect(result).not.toHaveProperty('market')
    expect(clientMocks.legacyPrice).toHaveBeenCalledTimes(1)
  })

  it('asks for a product choice only when one JAN maps to multiple SPUs', async () => {
    clientMocks.products.mockResolvedValue([
      product,
      {
        ...product,
        spuId: '9999999',
        skuId: '699999999',
        globalSkuId: '16999999999',
        title: 'Another product',
      },
    ])
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)

    const result = await lookup(gateway)

    expect(result).toMatchObject({ state: 'selection_required' })
    expect((result.candidates as unknown[])).toHaveLength(2)
    expect(clientMocks.market).not.toHaveBeenCalled()
  })

  it('does not ask for a size when all JAN candidates belong to one SPU', async () => {
    clientMocks.products.mockResolvedValue([
      product,
      {
        ...product,
        skuId: '600297002',
        globalSkuId: '10600297002',
        sizes: [{ system: 'JP', value: '29' }],
      },
    ])
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)

    const result = await lookup(gateway)

    expect(result).toMatchObject({ state: 'resolved' })
    expect(clientMocks.market).toHaveBeenCalledTimes(1)
    expect(
      (result.market as { sizes: Array<{ scanned: boolean }> }).sizes.every(
        (size) => !size.scanned,
      ),
    ).toBe(true)
  })

  it('splits API 141 requests into batches of at most 20 SKUs', async () => {
    const skus = Array.from({ length: 21 }, (_, index) => ({
      skuId: String(600297001 + index),
      globalSkuId: String(10600297001 + index),
      sizes: [{ system: 'JP', value: String(20 + index / 2) }],
      globalSoldNum30: index + 1,
      localSoldNum30: 0,
      globalMonthToMonthRatio: 0,
      localMonthToMonthRatio: 0,
      averageTransactionPrice: 30_000 + index * 100,
    }))
    clientMocks.market.mockResolvedValue({ ...market, skus })
    clientMocks.batchPrices.mockImplementation(async (skuIds: string[]) =>
      skuIds.map((skuId) => ({
        skuId,
        globalMinPrice: 30_000,
        asiaMinPrice: 30_000,
      })),
    )
    const gateway = new PoizonGateway(createState(), {} as WorkerEnv)

    await lookup(gateway)

    expect(clientMocks.batchPrices).toHaveBeenCalledTimes(2)
    expect(clientMocks.batchPrices.mock.calls[0][0]).toHaveLength(20)
    expect(clientMocks.batchPrices.mock.calls[1][0]).toHaveLength(1)
  })
})
