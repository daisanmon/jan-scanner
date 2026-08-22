import { describe, expect, it } from 'vitest'
import type { PoizonMarketData, PoizonSizeMarketData } from '../types/poizon'
import {
  aggregateBenchmarks,
  calculateSourcingFees,
  determineCandidateStatus,
  evaluateSourcingMarket,
} from './sourcingEvaluation'

function size(
  sales: number | null,
  price: number | null = 20_000,
  scanned = false,
): PoizonSizeMarketData {
  return {
    skuId: `${sales}-${price}-${scanned}`,
    globalSkuId: `g-${sales}-${price}-${scanned}`,
    sizes: [{ system: 'JP', value: '27.0' }],
    scanned,
    globalSoldNum30: sales,
    localSoldNum30: null,
    globalMonthToMonthRatio: null,
    localMonthToMonthRatio: null,
    averageTransactionPrice: null,
    globalMinPrice: price,
    asiaMinPrice: price,
  }
}

function market(sizes: PoizonSizeMarketData[]): PoizonMarketData {
  return {
    summary: {
      currency: 'JPY',
      globalSoldNum30Total: null,
      referencePrice: {
        min: null,
        median: null,
        max: null,
        reportedSizeCount: 0,
        totalSizeCount: sizes.length,
      },
      salesPerSize: {
        min: null,
        median: null,
        max: null,
        reportedSizeCount: 0,
        totalSizeCount: sizes.length,
      },
      salesWeightedAveragePrice: null,
      bestSellingSkuId: null,
    },
    sizes,
    marketDataAsOf: '2026-08-15T00:00:00.000Z',
    priceDataAsOf: null,
    warnings: [],
  }
}

describe('POIZON sourcing fees', () => {
  it.each([
    [2_300, 600],
    [2_301, 820],
    [3_500, 820],
    [3_501, 1_050],
    [4_600, 1_050],
    [4_601, 1_900],
  ])('uses the operation fee at ¥%i boundary', (price, operationFee) => {
    expect(calculateSourcingFees(price).operationFee).toBe(operationFee)
  })

  it('applies listing fee minimum and maximum boundaries', () => {
    expect(calculateSourcingFees(14_000).listingFee).toBe(700)
    expect(calculateSourcingFees(14_001).listingFee).toBe(701)
    expect(calculateSourcingFees(84_600).listingFee).toBe(4_230)
    expect(calculateSourcingFees(84_601).listingFee).toBe(4_230)
  })

  it('rounds percentage fees up and benchmark down to ¥100', () => {
    const result = calculateSourcingFees(20_001)
    expect(result.listingFee).toBe(1_001)
    expect(result.transferFee).toBe(201)
    expect(result.purchaseBenchmark && result.purchaseBenchmark % 100).toBe(0)
  })

  it('applies configurable minimum profit rate and amount', () => {
    expect(
      calculateSourcingFees(20_000, {
        minimumProfitRate: 0.25,
        minimumProfitAmount: 1_000,
      }).purchaseBenchmark,
    ).toBe(12_600)
    expect(
      calculateSourcingFees(20_000, {
        minimumProfitRate: 0.1,
        minimumProfitAmount: 5_000,
      }).purchaseBenchmark,
    ).toBe(11_900)
  })
})

describe('sourcing aggregation', () => {
  it('excludes zero-sales and unavailable-price sizes', () => {
    expect(
      aggregateBenchmarks([
        { sales30d: 1, purchaseBenchmark: 10_000 },
        { sales30d: 0, purchaseBenchmark: 1_000 },
        { sales30d: 2, purchaseBenchmark: null },
        { sales30d: 3, purchaseBenchmark: 30_000 },
      ]),
    ).toEqual({ min: 10_000, median: 20_000, max: 30_000 })
  })

  it('calculates odd/even medians, min/max and empty aggregation', () => {
    expect(
      aggregateBenchmarks([
        { sales30d: 1, purchaseBenchmark: 30_000 },
        { sales30d: 1, purchaseBenchmark: 10_000 },
        { sales30d: 1, purchaseBenchmark: 20_000 },
      ]),
    ).toEqual({ min: 10_000, median: 20_000, max: 30_000 })
    expect(
      aggregateBenchmarks([
        { sales30d: 1, purchaseBenchmark: 10_000 },
        { sales30d: 1, purchaseBenchmark: 20_100 },
      ]).median,
    ).toBe(15_000)
    expect(aggregateBenchmarks([])).toEqual({
      min: null,
      median: null,
      max: null,
    })
  })
})

describe('candidate decisions', () => {
  it('keeps a product when the scanned or another size has sales', () => {
    expect(determineCandidateStatus([size(1, 20_000, true)])).toBe('candidate')
    expect(determineCandidateStatus([size(0, 20_000, true), size(1)])).toBe(
      'candidate',
    )
  })

  it('distinguishes all-zero, unknown, and missing market data', () => {
    expect(determineCandidateStatus([size(0), size(0)])).toBe('no_sales')
    expect(determineCandidateStatus([size(0), size(null)])).toBe('review')
    expect(determineCandidateStatus(null)).toBe('review')
  })

  it('keeps sales candidates even without a price', () => {
    const result = evaluateSourcingMarket(market([size(1, null, true)]))
    expect(result.status).toBe('candidate')
    expect(result.benchmarkMedian).toBeNull()
  })
})
