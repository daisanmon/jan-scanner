import { describe, expect, it } from 'vitest'
import { deriveArticleNumber, parseAlpenProductPage } from './alpen'

describe('Alpen product page parsing', () => {
  it.each([
    ['4051643735', 'MS327 CWB D', 'MS327 CWB'],
    ['4051647835', 'U327 LND D', 'U327 LND'],
  ])('extracts the color-specific article for %s', (productId, productName, articleNumber) => {
    const html = `<script>window.data={"item_name":"${productName}","item_brand":"new balance","item_category":"シューズ"}</script>`
    expect(parseAlpenProductPage(html, productId)).toMatchObject({
      productId,
      productName,
      articleNumber,
      brandName: 'new balance',
    })
  })

  it('removes common footwear width suffixes only', () => {
    expect(deriveArticleNumber('ABC 123 2E')).toBe('ABC 123')
    expect(deriveArticleNumber('MODEL RED')).toBe('MODEL RED')
  })

  it('rejects an explicitly non-shoe category', () => {
    const html = '<script>window.data={"item_name":"JACKET 001","item_category":"ウェア"}</script>'
    expect(() => parseAlpenProductPage(html, '4051643735')).toThrow(/シューズ/)
  })
})
