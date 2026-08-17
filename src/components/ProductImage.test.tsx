import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProductImage } from './ProductImage'

afterEach(cleanup)

describe('ProductImage', () => {
  it('renders a lazy, privacy-preserving product image', () => {
    const { container } = render(
      <ProductImage imageUrl="https://cdn.poizon.com/pro-img/product.jpg" />,
    )

    const image = container.querySelector('img')
    expect(image).toHaveAttribute('src', 'https://cdn.poizon.com/pro-img/product.jpg')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('renders a placeholder when there is no image URL', () => {
    render(<ProductImage />)

    expect(screen.getByRole('img', { name: '画像なし' })).toBeInTheDocument()
  })

  it('switches to the placeholder after an image load error', () => {
    const { container } = render(
      <ProductImage imageUrl="https://cdn.poizon.com/pro-img/broken.jpg" />,
    )

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(screen.getByRole('img', { name: '画像なし' })).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })
})
