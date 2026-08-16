import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PoizonNotFoundResponse } from '../types/poizon'
import { useJanHistory } from './useJanHistory'

const STORAGE_KEY = 'jan-pocket:scan-history'

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
})
