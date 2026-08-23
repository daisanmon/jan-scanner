import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PoizonLookupTarget } from './PoizonLookupPanel'

vi.mock('./JanScanner', () => ({
  JanScanner: ({ onRegister }: { onRegister: (jan: string) => void }) => (
    <div>
      <button type="button" onClick={() => onRegister('4580563378953')}>scan first</button>
      <button type="button" onClick={() => onRegister('4901234567894')}>scan second</button>
    </div>
  ),
}))

vi.mock('./ManualEntry', () => ({
  ManualEntry: () => <div>manual entry</div>,
}))

vi.mock('./HistoryBackup', () => ({
  HistoryBackup: () => <div>history backup</div>,
}))

vi.mock('./PoizonLookupPanel', () => ({
  PoizonLookupPanel: ({
    target,
    onLookupComplete,
    onLookupError,
  }: {
    target: PoizonLookupTarget | null
    onLookupComplete: (target: PoizonLookupTarget, response: unknown) => void
    onLookupError: (target: PoizonLookupTarget, message: string) => void
  }) => (
    <div>
      <output aria-label="active lookup">{target?.janCode ?? 'none'}</output>
      {target && (
        <>
          <button type="button" onClick={() => onLookupComplete(target, {
            requestId: 'request',
            ...(target.janCode === '4580563378953'
              ? {
                  state: 'price_unavailable',
                  product: {
                    spuId: '1045489',
                    articleNumber: 'TEST-001',
                    title: 'Test sneaker',
                    brandName: 'Test brand',
                    skuId: '600297001',
                    globalSkuId: '10600297001',
                    janCode: target.janCode,
                    sizes: [{ system: 'JP', value: '28.5' }],
                  },
                }
              : { state: 'not_found' }),
            cache: { product: false, market: false, price: false },
          })}>complete lookup</button>
          <button type="button" onClick={() => onLookupError(target, 'failed')}>fail lookup</button>
        </>
      )}
    </div>
  ),
}))

import { JanScannerPage } from './JanScannerPage'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('continuous lookup queue', () => {
  it('queues a second scan while the first lookup is running and saves to each history entry', () => {
    render(<JanScannerPage />)

    fireEvent.click(screen.getByRole('button', { name: 'scan first' }))
    fireEvent.click(screen.getByRole('button', { name: 'scan second' }))

    expect(screen.getByLabelText('active lookup')).toHaveTextContent('4580563378953')
    expect(screen.getByText('照会中', { selector: 'dt' }).nextElementSibling).toHaveTextContent('2')

    fireEvent.click(screen.getByRole('button', { name: 'complete lookup' }))
    expect(screen.getByLabelText('active lookup')).toHaveTextContent('4901234567894')
    fireEvent.click(screen.getByRole('button', { name: 'complete lookup' }))

    fireEvent.click(screen.getByRole('button', { name: /履歴/ }))
    expect(screen.getByText('Test sneaker')).toBeInTheDocument()
    expect(screen.getByText('一致商品なし')).toBeInTheDocument()
  })

  it('merges a repeated successful JAN and allows retry after an error', () => {
    render(<JanScannerPage />)

    fireEvent.click(screen.getByRole('button', { name: 'scan first' }))
    fireEvent.click(screen.getByRole('button', { name: 'complete lookup' }))
    fireEvent.click(screen.getByRole('button', { name: 'scan first' }))
    expect(screen.getByLabelText('active lookup')).toHaveTextContent('none')

    fireEvent.click(screen.getByRole('button', { name: 'scan second' }))
    fireEvent.click(screen.getByRole('button', { name: 'fail lookup' }))
    fireEvent.click(screen.getByRole('button', { name: /履歴/ }))
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    fireEvent.click(screen.getByRole('button', { name: /スキャン/ }))
    expect(screen.getByLabelText('active lookup')).toHaveTextContent('4901234567894')
  })
})
