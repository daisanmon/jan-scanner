import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ScanHistoryEntry } from '../types/history'
import { ScanHistory } from './ScanHistory'
import { CandidateCard } from './SourcingViews'

afterEach(cleanup)

const entry: ScanHistoryEntry = {
  id: 'history-entry',
  janCode: '4580563378953',
  readAt: '2026-08-05T00:00:00.000Z',
  method: 'camera',
  lookupStatus: 'complete',
  poizon: {
    savedAt: '2026-08-05T00:01:00.000Z',
    state: 'price_unavailable',
    product: {
      spuId: '1045489',
      articleNumber: '1011C084-750',
      title: 'Test sneaker',
      brandName: 'Test brand',
      imageUrl: 'https://cdn.poizon.com/pro-img/test-sneaker.jpg',
      skuId: '600297001',
      globalSkuId: '10600297001',
      janCode: '4580563378953',
      sizes: [{ system: 'JP', value: '28.5' }],
    },
  },
  sourcing: {
    status: 'candidate',
    totalSales30d: 10,
    salesWeightedAveragePrice: 10_100,
    sellingSizeCount: 1,
    totalSizeCount: 2,
    benchmarkMin: 20_000,
    benchmarkMedian: 20_000,
    benchmarkMax: 20_000,
    sizes: [
      {
        skuId: '600297001',
        globalSkuId: '10600297001',
        sizes: [{ system: 'JP', value: '28.5' }],
        scanned: true,
        sales30d: 10,
        averageTransactionPrice: 11_700,
        referencePrice: 30_000,
        listingFee: 2_800,
        operationFee: 1_500,
        transferFee: 2_500,
        estimatedNetProceeds: 23_200,
        purchaseBenchmark: 20_000,
      },
      {
        skuId: '600297002',
        globalSkuId: '10600297002',
        sizes: [{ system: 'JP', value: '29' }],
        scanned: false,
        sales30d: null,
        averageTransactionPrice: null,
        referencePrice: null,
        listingFee: null,
        operationFee: null,
        transferFee: null,
        estimatedNetProceeds: null,
        purchaseBenchmark: null,
      },
    ],
    feePolicyId: 'jp-prestock-shoes-2026-07-10',
    evaluatedAt: '2026-08-05T00:01:00.000Z',
  },
}

describe('product image placements', () => {
  it('renders the saved image in the sourcing candidate card', () => {
    const { container } = render(<CandidateCard entry={entry} />)

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.poizon.com/pro-img/test-sneaker.jpg',
    )
  })

  it('shows the model first and provides compact expandable size statistics', () => {
    const { container } = render(<CandidateCard entry={entry} />)

    expect(screen.getByRole('heading', { name: '1011C084-750' })).toBeInTheDocument()
    expect(container.querySelector('.candidate-title-details')).not.toHaveAttribute('open')
    expect(screen.queryByText(/スキャンサイズ：/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('全サイズの価格・販売数を見る（2）'))

    expect(screen.getByText('￥10,100')).toBeInTheDocument()
    expect(screen.getByText('￥11,700')).toBeInTheDocument()
    expect(screen.getByText('データなし・非表示：1サイズ')).toBeInTheDocument()
    expect(container.querySelectorAll('.sourcing-size-row')).toHaveLength(1)
  })

  it('labels partial market totals instead of presenting them as complete', () => {
    const partialEntry: ScanHistoryEntry = {
      ...entry,
      poizon: {
        ...entry.poizon!,
        market: {
          summary: {
            currency: 'JPY',
            globalSoldNum30Total: 10,
            referencePrice: { min: 30_000, median: 30_000, max: 30_000, reportedSizeCount: 1, totalSizeCount: 2 },
            salesPerSize: { min: 10, median: 10, max: 10, reportedSizeCount: 1, totalSizeCount: 2 },
            salesWeightedAveragePrice: 10_100,
            bestSellingSkuId: '600297001',
          },
          sizes: [],
          marketDataAsOf: '2026-08-05T00:01:00.000Z',
          priceDataAsOf: '2026-08-05T00:01:00.000Z',
          warnings: ['SALES_PARTIAL', 'PRICE_PARTIAL'],
        },
      },
    }

    render(<CandidateCard entry={partialEntry} />)

    expect(screen.getByText('取得済みサイズ・30日販売数')).toBeInTheDocument()
    expect(
      screen.getByText('一部サイズの販売数が未取得です。合計は取得済み範囲です。'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('一部サイズの中国表示可能価格が未取得です。'),
    ).toBeInTheDocument()
  })

  it('renders the saved image in scan history', () => {
    const { container } = render(
      <ScanHistory history={[entry]} onDelete={() => undefined} onClear={() => undefined} />,
    )

    expect(container.querySelector('.history-product img')).toHaveAttribute(
      'src',
      'https://cdn.poizon.com/pro-img/test-sneaker.jpg',
    )
  })

  it('keeps an old image-less history entry displayable', () => {
    const legacyEntry = {
      ...entry,
      poizon: entry.poizon
        ? {
            ...entry.poizon,
            product: entry.poizon.product
              ? { ...entry.poizon.product, imageUrl: undefined }
              : undefined,
          }
        : undefined,
    }

    render(
      <ScanHistory
        history={[legacyEntry]}
        onDelete={() => undefined}
        onClear={() => undefined}
      />,
    )

    expect(screen.getByText('Test sneaker')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '画像なし' })).toBeInTheDocument()
  })
})
