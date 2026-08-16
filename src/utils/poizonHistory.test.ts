import { describe, expect, it } from 'vitest'
import type { PoizonResolvedResponse } from '../types/poizon'
import {
  createPoizonHistorySnapshot,
  isPoizonHistorySnapshot,
} from './poizonHistory'

const response: PoizonResolvedResponse = {
  requestId: 'request-id',
  state: 'resolved',
  product: {
    spuId: '1045489',
    title: 'Test sneaker',
    brandName: 'Test brand',
    skuId: '600297001',
    globalSkuId: '10600297001',
    janCode: '4580563378953',
    sizes: [{ system: 'JP', value: '28.5' }],
  },
  market: {
    summary: {
      currency: 'JPY',
      globalSoldNum30Total: 147,
      referencePrice: {
        min: 28_300,
        median: 34_650,
        max: 49_700,
        reportedSizeCount: 12,
        totalSizeCount: 17,
      },
      salesPerSize: {
        min: 1,
        median: 8,
        max: 30,
        reportedSizeCount: 13,
        totalSizeCount: 17,
      },
      salesWeightedAveragePrice: 35_100,
      bestSellingSkuId: '600297001',
    },
    sizes: [
      {
        skuId: '600297001',
        globalSkuId: '10600297001',
        sizes: [{ system: 'JP', value: '28.5' }],
        scanned: true,
        globalSoldNum30: 30,
        localSoldNum30: 2,
        globalMonthToMonthRatio: 0.2,
        localMonthToMonthRatio: 0,
        averageTransactionPrice: 35_000,
        globalMinPrice: 33_900,
        asiaMinPrice: 33_900,
      },
    ],
    marketDataAsOf: '2026-08-05T00:00:00.000Z',
    priceDataAsOf: '2026-08-05T00:00:01.000Z',
    warnings: ['PRICE_PARTIAL', 'SALES_PARTIAL'],
  },
  price: {
    currency: 'JPY',
    globalMinPrice: 33_900,
    asiaMinPrice: 33_900,
    dataAsOf: '2026-08-05T00:00:01.000Z',
  },
  cache: { product: false, market: false, price: false },
}

describe('POIZON history snapshots', () => {
  it('stores complete market data without request metadata', () => {
    const snapshot = createPoizonHistorySnapshot(
      response,
      new Date('2026-08-05T00:01:00.000Z'),
    )

    expect(snapshot.savedAt).toBe('2026-08-05T00:01:00.000Z')
    expect(snapshot.market?.sizes).toHaveLength(1)
    expect(snapshot.market?.summary.globalSoldNum30Total).toBe(147)
    expect(snapshot).not.toHaveProperty('requestId')
    expect(snapshot).not.toHaveProperty('cache')
    expect(isPoizonHistorySnapshot(snapshot)).toBe(true)
  })

  it('rejects malformed restored market data', () => {
    const snapshot = createPoizonHistorySnapshot(response)
    const malformed = {
      ...snapshot,
      market: { ...snapshot.market, sizes: 'not-an-array' },
    }

    expect(isPoizonHistorySnapshot(malformed)).toBe(false)
  })
})
