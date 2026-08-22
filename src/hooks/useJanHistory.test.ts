import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PoizonNotFoundResponse, PoizonResolvedResponse } from '../types/poizon'
import { DEFAULT_SOURCING_SETTINGS } from '../utils/sourcingEvaluation'
import { useJanHistory } from './useJanHistory'

const STORAGE_KEY = 'jan-pocket:scan-history'

const resolvedResponse: PoizonResolvedResponse = {
  requestId: 'resolved-request',
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
      globalSoldNum30Total: 1,
      referencePrice: {
        min: 20_000,
        median: 20_000,
        max: 20_000,
        reportedSizeCount: 1,
        totalSizeCount: 1,
      },
      salesPerSize: {
        min: 1,
        median: 1,
        max: 1,
        reportedSizeCount: 1,
        totalSizeCount: 1,
      },
      salesWeightedAveragePrice: 20_000,
      bestSellingSkuId: '600297001',
    },
    sizes: [{
      skuId: '600297001',
      globalSkuId: '10600297001',
      sizes: [{ system: 'JP', value: '28.5' }],
      scanned: true,
      globalSoldNum30: 1,
      localSoldNum30: null,
      globalMonthToMonthRatio: null,
      localMonthToMonthRatio: null,
      averageTransactionPrice: 20_000,
      globalMinPrice: 20_000,
      asiaMinPrice: 20_000,
    }],
    marketDataAsOf: '2026-08-19T00:00:00.000Z',
    priceDataAsOf: '2026-08-19T00:00:00.000Z',
    warnings: [],
  },
  price: {
    currency: 'JPY',
    globalMinPrice: 20_000,
    asiaMinPrice: 20_000,
    dataAsOf: '2026-08-19T00:00:00.000Z',
  },
  cache: { product: false, market: false, price: false },
}

afterEach(() => {
  localStorage.clear()
})

describe('useJanHistory', () => {
  it('loads v1 entries and rewrites them as schema v3 without data loss', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        history: [
          {
            id: 'legacy-entry',
            janCode: '4580563378953',
            readAt: '2026-08-05T00:00:00.000Z',
            method: 'camera',
          },
        ],
      }),
    )

    const { result } = renderHook(() => useJanHistory())

    expect(result.current.history).toHaveLength(1)
    await waitFor(() => {
      const stored = JSON.parse(String(localStorage.getItem(STORAGE_KEY))) as {
        schemaVersion: number
      }
      expect(stored.schemaVersion).toBe(3)
    })
  })

  it('loads v2 entries and aggregates repeated JAN scans in v3', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        history: [
          {
            id: 'v2-entry',
            janCode: '4580563378953',
            readAt: '2026-08-05T00:00:00.000Z',
            method: 'camera',
          },
        ],
      }),
    )

    const { result } = renderHook(() => useJanHistory())
    let registration: ReturnType<typeof result.current.registerScan> | undefined
    act(() => {
      registration = result.current.registerScan('4580563378953', 'manual')
    })

    expect(registration).toMatchObject({ id: 'v2-entry', shouldLookup: true })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].aggregation?.scanCount).toBe(2)
  })

  it('attaches the completed POIZON result to the matching scan', () => {
    const { result } = renderHook(() => useJanHistory())
    let entryId = ''

    act(() => {
      entryId = result.current.addEntry('4580563378953', 'camera')
    })
    const response: PoizonNotFoundResponse = {
      requestId: 'request-id',
      state: 'not_found',
      cache: { product: false, market: false, price: false },
    }
    act(() => {
      result.current.savePoizonResult(entryId, response)
    })

    expect(result.current.history[0]).toMatchObject({
      id: entryId,
      poizon: { state: 'not_found' },
    })
  })

  it('recalculates saved candidates when the sourcing settings change', async () => {
    const { result, rerender } = renderHook(
      ({ settings }) => useJanHistory(settings),
      { initialProps: { settings: DEFAULT_SOURCING_SETTINGS } },
    )
    let entryId = ''

    act(() => {
      entryId = result.current.addEntry('4580563378953', 'camera')
    })
    act(() => {
      result.current.savePoizonResult(entryId, resolvedResponse)
    })
    expect(result.current.history[0].sourcing?.benchmarkMedian).toBe(14_300)

    rerender({
      settings: { minimumProfitRate: 0.25, minimumProfitAmount: 1_000 },
    })

    await waitFor(() => {
      expect(result.current.history[0].sourcing).toMatchObject({
        benchmarkMedian: 12_600,
        minimumProfitRate: 0.25,
        minimumProfitAmount: 1_000,
      })
    })
  })
})
