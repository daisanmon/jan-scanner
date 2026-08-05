// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  barcodeFixture,
  batchPriceFixture,
  marketFixture,
} from '../../test/poizonFixtures'
import type { WorkerEnv } from '../env'
import {
  POIZON_API_PATHS,
  queryBatchPrices,
  queryConsignmentPrice,
  queryMarketBySpu,
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
  it('calls APIs 181, 169, and 141 with documented parameters', async () => {
    const events: string[] = []
    const bodies: Array<Record<string, unknown>> = []
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const apiId = url.endsWith(POIZON_API_PATHS[181])
        ? '181'
        : url.endsWith(POIZON_API_PATHS[169])
          ? '169'
          : url.endsWith(POIZON_API_PATHS[141])
            ? '141'
            : '93'
      events.push(apiId)
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json(
        apiId === '181'
          ? barcodeFixture
          : apiId === '169'
            ? marketFixture
            : apiId === '141'
              ? batchPriceFixture
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
    const market = await queryMarketBySpu(
      candidates[0].spuId,
      env,
      reserveQuota,
      fetcher,
    )
    const prices = await queryBatchPrices(
      market.skus.map((sku) => sku.skuId),
      env,
      reserveQuota,
      fetcher,
    )

    expect(events).toEqual(['reserve', '181', 'reserve', '169', 'reserve', '141'])
    expect(bodies[0]).toMatchObject({
      barcodes: ['4580563378953'],
      pageNum: 1,
      pageSize: 100,
      app_key: 'app-key',
    })
    expect(bodies[1]).toMatchObject({
      spuIds: [1045489],
      sellerStatusEnable: false,
      buyStatusEnable: false,
      statisticsDataQry: { salesEnable: true, minPriceEnable: true },
      region: 'JP',
    })
    expect(bodies[2]).toMatchObject({
      skuIds: [600297001, 600297002, 600297003],
      biddingType: 25,
      region: 'JP',
      currency: 'JPY',
    })
    expect(bodies[2]).not.toHaveProperty('saleType')
    expect(bodies[0]).not.toHaveProperty('app-secret')
    expect(prices).toHaveLength(3)
  })

  it('keeps API 93 available for the single-size compatibility fallback', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        code: 200,
        data: { globalMinPrice: 33_900, asiaMinPrice: 33_900 },
      }),
    ) as typeof fetch

    await expect(
      queryConsignmentPrice('600297001', env, vi.fn(), fetcher),
    ).resolves.toEqual({ globalMinPrice: 33_900, asiaMinPrice: 33_900 })
  })
})
