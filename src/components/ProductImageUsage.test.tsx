import { cleanup, render, screen } from '@testing-library/react'
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
    sellingSizeCount: 1,
    totalSizeCount: 1,
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
        referencePrice: 30_000,
        listingFee: 2_800,
        operationFee: 1_500,
        transferFee: 2_500,
        estimatedNetProceeds: 23_200,
        purchaseBenchmark: 20_000,
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
