import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('application layout', () => {
  it('provides scan, candidate, history and settings bottom navigation', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '連続スキャン' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /候補/ }))
    expect(screen.getByRole('heading', { name: '候補' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /履歴/ }))
    expect(screen.getByRole('heading', { name: '履歴' })).toBeInTheDocument()
    expect(screen.getByText('履歴の管理')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '仕入れ基準' })).toBeInTheDocument()
  })

  it('saves configurable profit thresholds on the device', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /最低利益率/ }), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: /最低見込み利益/ }), {
      target: { value: '1500' },
    })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      '仕入れ基準を保存し、候補を再計算しました。',
    )
    await waitFor(() => {
      expect(
        JSON.parse(String(localStorage.getItem('jan-pocket:sourcing-settings'))),
      ).toEqual({ minimumProfitRate: 0.2, minimumProfitAmount: 1500 })
    })
  })
})
