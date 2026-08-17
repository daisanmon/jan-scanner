import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/publicConfig', () => ({
  POIZON_PUBLIC_CONFIG: {
    enabled: true,
    apiBaseUrl: 'https://worker.example.test',
    turnstileSiteKey: 'public-site-key',
  },
  isPoizonPublicConfigReady: () => true,
}))

vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" onClick={() => onToken('test-token')}>
      Complete challenge
    </button>
  ),
}))

import { PoizonLookupPanel } from './PoizonLookupPanel'

afterEach(cleanup)

const resolvedResponse = {
  requestId: 'request-id',
  state: 'resolved',
  product: {
    spuId: '1045489',
    title: 'Test sneaker',
    brandName: 'Test brand',
    imageUrl: 'https://cdn.poizon.com/pro-img/test-sneaker.jpg',
    skuId: '600297001',
    globalSkuId: '10600297001',
    janCode: '4580563378953',
    sizes: [
      { system: 'JP', value: '28.5' },
      { system: 'EU', value: '45' },
      { system: 'US Men', value: '11.5' },
    ],
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
        totalSizeCount: 2,
      },
      salesPerSize: {
        min: 200,
        median: 300,
        max: 400,
        reportedSizeCount: 2,
        totalSizeCount: 2,
      },
      salesWeightedAveragePrice: 34_333,
      bestSellingSkuId: '600297002',
    },
    sizes: [
      {
        skuId: '600297001',
        globalSkuId: '10600297001',
        sizes: [
          { system: 'JP', value: '28.5' },
          { system: 'EU', value: '45' },
          { system: 'US Men', value: '11.5' },
        ],
        scanned: true,
        globalSoldNum30: 200,
        localSoldNum30: 2,
        globalMonthToMonthRatio: 0.25,
        localMonthToMonthRatio: -0.5,
        averageTransactionPrice: 33_000,
        globalMinPrice: 33_900,
        asiaMinPrice: 33_900,
      },
      {
        skuId: '600297002',
        globalSkuId: '10600297002',
        sizes: [
          { system: 'JP', value: '29' },
          { system: 'EU', value: '46' },
          { system: 'US Men', value: '12' },
        ],
        scanned: false,
        globalSoldNum30: 400,
        localSoldNum30: 0,
        globalMonthToMonthRatio: 0.1,
        localMonthToMonthRatio: 0,
        averageTransactionPrice: 35_000,
        globalMinPrice: 35_900,
        asiaMinPrice: 34_900,
      },
    ],
    marketDataAsOf: '2026-08-05T00:00:00.000Z',
    priceDataAsOf: '2026-08-05T00:00:01.000Z',
    warnings: [],
  },
  price: {
    currency: 'JPY',
    globalMinPrice: 33_900,
    asiaMinPrice: 33_900,
    dataAsOf: '2026-08-05T00:00:01.000Z',
  },
  cache: { product: false, market: false, price: false },
}

describe('PoizonLookupPanel', () => {
  it('renders aggregate market metrics and expandable per-size rows', async () => {
    const onLookupComplete = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(resolvedResponse)),
    )

    render(
      <PoizonLookupPanel
        target={{
          janCode: '4580563378953',
          sequence: 1,
          historyEntryId: 'history-entry',
        }}
        onLookupComplete={onLookupComplete}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete challenge' }))

    expect(
      await screen.findByText('JAN照会サイズ: JP 28.5 / EU 45 / US 11.5'),
    ).toBeInTheDocument()
    const image = document.querySelector('.poizon-product img')
    expect(image).toHaveAttribute(
      'src',
      'https://cdn.poizon.com/pro-img/test-sneaker.jpg',
    )
    expect(screen.getByText('中国市場・過去30日販売数')).toBeInTheDocument()
    expect(screen.getByText('600')).toBeInTheDocument()
    expect(screen.getAllByText('￥34,400')).toHaveLength(2)
    expect(
      screen.getByText('全サイズの価格・販売数を見る（2）'),
    ).toBeInTheDocument()
    expect(screen.getByText('JP 29 / EU 46 / US 12')).toBeInTheDocument()
    expect(screen.getByText('+25%')).toBeInTheDocument()
    expect(onLookupComplete).toHaveBeenCalledWith(
      expect.objectContaining({ historyEntryId: 'history-entry' }),
      resolvedResponse,
    )
  })

  it('renders an image for every product in the selection list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          requestId: 'selection-request',
          state: 'selection_required',
          candidates: [
            resolvedResponse.product,
            {
              ...resolvedResponse.product,
              spuId: '2045489',
              skuId: '700297001',
              globalSkuId: '10700297001',
              title: 'Another sneaker',
              imageUrl: 'https://cdn.poizon.com/pro-img/another-sneaker.jpg',
            },
          ],
          cache: { product: false, market: false, price: false },
        }),
      ),
    )

    render(
      <PoizonLookupPanel
        target={{ janCode: '4580563378953', sequence: 2 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete challenge' }))

    expect(await screen.findByText('Another sneaker')).toBeInTheDocument()
    expect(document.querySelectorAll('.poizon-candidates img')).toHaveLength(2)
    expect(
      Array.from(document.querySelectorAll('.poizon-candidates img')).map(
        (image) => image.getAttribute('src'),
      ),
    ).toEqual([
      'https://cdn.poizon.com/pro-img/test-sneaker.jpg',
      'https://cdn.poizon.com/pro-img/another-sneaker.jpg',
    ])
  })
})
