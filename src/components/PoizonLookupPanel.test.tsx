import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

const resolvedResponse = {
  requestId: 'request-id',
  state: 'resolved',
  product: {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(resolvedResponse)),
    )

    render(
      <PoizonLookupPanel
        target={{ janCode: '4580563378953', sequence: 1 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete challenge' }))

    expect(
      await screen.findByText('JAN照会サイズ: JP 28.5 / EU 45 / US 11.5'),
    ).toBeInTheDocument()
    expect(screen.getByText('中国市場・過去30日販売数')).toBeInTheDocument()
    expect(screen.getByText('600')).toBeInTheDocument()
    expect(screen.getAllByText('￥34,400')).toHaveLength(2)
    expect(
      screen.getByText('全サイズの価格・販売数を見る（2）'),
    ).toBeInTheDocument()
    expect(screen.getByText('JP 29 / EU 46 / US 12')).toBeInTheDocument()
    expect(screen.getByText('+25%')).toBeInTheDocument()
  })
})
