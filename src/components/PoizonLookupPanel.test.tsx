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

describe('PoizonLookupPanel', () => {
  it('renders the confirmed IDs, sizes, and prices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
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
          price: {
            currency: 'JPY',
            globalMinPrice: 33_900,
            asiaMinPrice: 33_900,
            dataAsOf: '2026-08-04T00:00:00.000Z',
          },
          cache: { product: false, price: false },
        }),
      ),
    )

    render(
      <PoizonLookupPanel
        target={{ janCode: '4580563378953', sequence: 1 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete challenge' }))

    expect(await screen.findByText('JP 28.5 / EU 45 / US 11.5')).toBeInTheDocument()
    expect(screen.getByText('1045489')).toBeInTheDocument()
    expect(screen.getByText('600297001')).toBeInTheDocument()
    expect(screen.getByText('10600297001')).toBeInTheDocument()
    expect(screen.getAllByText('￥33,900')).toHaveLength(2)
  })
})
