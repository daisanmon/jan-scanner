import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('application layout', () => {
  it('provides scan, candidate and history bottom navigation', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '連続スキャン' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /候補/ }))
    expect(screen.getByRole('heading', { name: '候補' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /履歴/ }))
    expect(screen.getByRole('heading', { name: '履歴' })).toBeInTheDocument()
    expect(screen.getByText('履歴の管理')).toBeInTheDocument()
  })
})
