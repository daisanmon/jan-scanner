import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const quagga = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  start: vi.fn(),
  stop: vi.fn(async () => undefined),
  onDetected: vi.fn(),
  offDetected: vi.fn(),
}))

vi.mock('@ericblade/quagga2', () => ({ default: quagga }))

import { JanScanner } from './JanScanner'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('JanScanner', () => {
  it('uses an orientation-neutral scan area for vertical and horizontal JAN codes', async () => {
    render(<JanScanner onRegister={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '読み取りを開始' }))

    await waitFor(() => expect(quagga.init).toHaveBeenCalledOnce())

    expect(quagga.init).toHaveBeenCalledWith(
      expect.objectContaining({
        inputStream: expect.objectContaining({
          area: {
            top: '8%',
            right: '8%',
            bottom: '8%',
            left: '8%',
          },
        }),
        locate: true,
      }),
    )
    expect(
      screen.getByText(
        'バーコード全体を枠内に収めてください。縦向き・横向きのまま読み取れます',
      ),
    ).toBeInTheDocument()
  })
})
