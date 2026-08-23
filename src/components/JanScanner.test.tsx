import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        decoder: { readers: ['ean_reader'], multiple: false },
        locate: true,
      }),
    )
    expect(
      screen.getByText(
        'バーコード全体を枠内に収めてください。縦向き・横向きのまま読み取れます',
      ),
    ).toBeInTheDocument()
  })

  it('confirms a 13-digit JAN twice before registering it', async () => {
    const onRegister = vi.fn()
    render(<JanScanner onRegister={onRegister} />)

    fireEvent.click(screen.getByRole('button', { name: '読み取りを開始' }))
    await waitFor(() => expect(quagga.onDetected).toHaveBeenCalled())

    const handleDetected = quagga.onDetected.mock.calls.at(-1)?.[0]
    expect(handleDetected).toBeTypeOf('function')

    act(() => handleDetected({ codeResult: { code: '4550362193903' } }))
    expect(onRegister).not.toHaveBeenCalled()

    act(() => handleDetected({ codeResult: { code: '4550362193903' } }))
    expect(onRegister).toHaveBeenCalledOnce()
    expect(onRegister).toHaveBeenCalledWith('4550362193903')
  })

  it('rejects camera EAN-8 results and latches a confirmed code for the session', async () => {
    const onRegister = vi.fn()
    render(<JanScanner onRegister={onRegister} />)

    fireEvent.click(screen.getByRole('button', { name: '読み取りを開始' }))
    await waitFor(() => expect(quagga.onDetected).toHaveBeenCalled())

    const handleDetected = quagga.onDetected.mock.calls.at(-1)?.[0]
    act(() => {
      handleDetected({ codeResult: { code: '40118987' } })
      handleDetected({ codeResult: { code: '40118987' } })
      handleDetected({ codeResult: { code: '4550362193903' } })
      handleDetected({ codeResult: { code: '4550362193903' } })
      handleDetected({ codeResult: { code: '4550362193903' } })
    })

    expect(onRegister).toHaveBeenCalledOnce()
    expect(onRegister).toHaveBeenCalledWith('4550362193903')
    expect(
      screen.getByText('この読み取り中に登録済みのJANコードです。'),
    ).toBeInTheDocument()
  })
})
