import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PoizonNotFoundResponse, PoizonResolvedResponse } from '../types/poizon'
import { DEFAULT_SOURCING_SETTINGS } from '../utils/sourcingEvaluation'
import { createPoizonHistorySnapshot } from '../utils/poizonHistory'
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
  it('loads v1 entries and rewrites them as schema v5 without data loss', async () => {
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
      expect(stored.schemaVersion).toBe(5)
    })
  })

  it('loads v2 entries and aggregates repeated JAN scans in v5', () => {
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

  it('migrates a v3 POIZON result into the first lightweight price history', () => {
    const poizon = createPoizonHistorySnapshot(
      resolvedResponse,
      new Date('2026-08-05T00:01:00.000Z'),
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: 3,
      history: [{
        id: 'v3-entry',
        janCode: '4580563378953',
        readAt: '2026-08-05T00:00:00.000Z',
        method: 'camera',
        poizon,
        sourcing: poizon.sourcing,
        lookupStatus: 'complete',
      }],
    }))

    const { result } = renderHook(() => useJanHistory())
    expect(result.current.history[0].priceHistory).toHaveLength(1)
    expect(result.current.history[0].priceHistory?.[0].sizes[0]).toMatchObject({
      skuId: '600297001',
      chinaDisplayablePrice: 20_000,
    })
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

  it('retries not-found and model-number-missing entries when scanned again', () => {
    const { result } = renderHook(() => useJanHistory())
    let notFoundId = ''
    let missingModelId = ''

    act(() => {
      notFoundId = result.current.addEntry('0194956863434', 'camera')
      result.current.savePoizonResult(notFoundId, {
        requestId: 'not-found',
        state: 'not_found',
        cache: { product: false, market: false, price: false },
      })
      missingModelId = result.current.addEntry('4580563378953', 'camera')
      result.current.savePoizonResult(missingModelId, resolvedResponse)
    })

    let notFoundRegistration: ReturnType<typeof result.current.registerScan> | undefined
    let missingModelRegistration: ReturnType<typeof result.current.registerScan> | undefined
    act(() => {
      notFoundRegistration = result.current.registerScan('0194956863434', 'camera')
      missingModelRegistration = result.current.registerScan('4580563378953', 'camera')
    })

    expect(notFoundRegistration).toMatchObject({ id: notFoundId, shouldLookup: true })
    expect(missingModelRegistration).toMatchObject({ id: missingModelId, shouldLookup: true })
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
      result.current.savePoizonResult(entryId, {
        ...resolvedResponse,
        product: { ...resolvedResponse.product, articleNumber: 'TEST-1' },
      })
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

  it('refreshes a completed entry only after the JST date changes', () => {
    const { result } = renderHook(() => useJanHistory())
    let entryId = ''
    act(() => {
      entryId = result.current.addEntry('4580563378953', 'camera')
      result.current.savePoizonResult(entryId, {
        ...resolvedResponse,
        product: { ...resolvedResponse.product, articleNumber: 'TEST-1' },
      })
    })

    let sameDay: ReturnType<typeof result.current.registerScan> | undefined
    let nextDay: ReturnType<typeof result.current.registerScan> | undefined
    act(() => {
      const savedAt = result.current.history[0].poizon?.savedAt ?? ''
      const saved = new Date(savedAt)
      sameDay = result.current.registerScan(
        '4580563378953',
        'camera',
        new Date(saved.getTime() + 60_000),
      )
      nextDay = result.current.registerScan(
        '4580563378953',
        'camera',
        new Date(saved.getTime() + 24 * 60 * 60 * 1_000),
      )
    })

    expect(sameDay?.shouldLookup).toBe(false)
    expect(nextDay?.shouldLookup).toBe(true)
  })

  it('keeps the last successful values when refresh fails', () => {
    const { result } = renderHook(() => useJanHistory())
    let entryId = ''
    act(() => {
      entryId = result.current.addEntry('4580563378953', 'camera')
      result.current.savePoizonResult(entryId, resolvedResponse)
      result.current.requestRefresh(entryId)
      result.current.saveLookupError(entryId, 'temporary failure')
    })

    expect(result.current.history[0].poizon?.state).toBe('resolved')
    expect(result.current.history[0].sourcing?.status).toBe('review')
    expect(result.current.history[0].lookupError).toContain('前回の取得値')
  })

  it('keeps one price snapshot per JST day and at most 90 days', () => {
    const { result } = renderHook(() => useJanHistory())
    let entryId = ''
    act(() => {
      entryId = result.current.addEntry('4580563378953', 'camera')
      for (let day = 0; day < 91; day += 1) {
        result.current.savePoizonResult(
          entryId,
          resolvedResponse,
          new Date(Date.UTC(2026, 0, 1 + day, 3)),
        )
      }
      result.current.savePoizonResult(
        entryId,
        resolvedResponse,
        new Date(Date.UTC(2026, 3, 1, 5)),
      )
    })

    expect(result.current.history[0].priceHistory).toHaveLength(90)
    expect(result.current.history[0].priceHistory?.at(-1)?.savedAt).toBe(
      '2026-04-01T05:00:00.000Z',
    )
  })

  it('deduplicates Alpen scans by product number independently from JAN history', () => {
    const { result } = renderHook(() => useJanHistory())
    act(() => {
      result.current.registerLookup({ kind: 'alpen', alpenProductId: '4051643735' }, 'camera')
      result.current.registerLookup({
        kind: 'alpen',
        alpenProductId: '4051643735',
        alpenUrl: 'https://store.alpen-group.jp/Form/Product/ProductDetail.aspx?pid=4051643735-0001',
      }, 'manual')
    })

    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].aggregation?.scanCount).toBe(2)
    expect(result.current.history[0].lookup).toMatchObject({
      kind: 'alpen',
      alpenProductId: '4051643735',
    })
  })
})
