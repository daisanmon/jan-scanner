// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { barcodeFixture } from '../../test/poizonFixtures'
import type { WorkerEnv } from '../env'
import {
  POIZON_API_PATHS,
  queryConsignmentPrice,
  queryProductsByBarcode,
} from './client'

const env = {
  POIZON_APP_KEY: 'app-key',
  POIZON_APP_SECRET: 'app-secret',
  POIZON_LANGUAGE: 'ja',
  POIZON_TIME_ZONE: 'Asia/Tokyo',
  POIZON_BIDDING_TYPE: '25',
  POIZON_REGION: 'JP',
  POIZON_CURRENCY: 'JPY',
} as WorkerEnv

describe('POIZON API client', () => {
  it('calls API 181 before API 93 with the consignment parameters', async () => {
    const events: string[] = []
    const bodies: Array<Record<string, unknown>> = []
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      events.push(url.endsWith(POIZON_API_PATHS[181]) ? '181' : '93')
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json(
        url.endsWith(POIZON_API_PATHS[181])
          ? barcodeFixture
          : {
              code: 200,
              data: { globalMinPrice: 33_900, asiaMinPrice: 33_900 },
            },
      )
    }) as typeof fetch
    const reserveQuota = vi.fn(async () => {
      events.push('reserve')
    })

    const candidates = await queryProductsByBarcode(
      '4580563378953',
      env,
      reserveQuota,
      fetcher,
    )
    const price = await queryConsignmentPrice(
      candidates[0].skuId,
      env,
      reserveQuota,
      fetcher,
    )

    expect(events).toEqual(['reserve', '181', 'reserve', '93'])
    expect(bodies[0]).toMatchObject({
      barcodes: ['4580563378953'],
      pageNum: 1,
      pageSize: 100,
      app_key: 'app-key',
    })
    expect(bodies[1]).toMatchObject({
      skuId: 600297001,
      biddingType: 25,
      region: 'JP',
      currency: 'JPY',
    })
    expect(bodies[1]).not.toHaveProperty('saleType')
    expect(bodies[0]).not.toHaveProperty('app-secret')
    expect(price).toEqual({ globalMinPrice: 33_900, asiaMinPrice: 33_900 })
  })
})
