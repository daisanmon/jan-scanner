import { describe, expect, it } from 'vitest'
import { extractAlpenProductId, normalizeArticleNumber } from '../../shared/alpen'
import { lookupKey, parseAlpenLookup, toPoizonLookupInput } from './productLookup'

describe('Alpen product lookup', () => {
  it.each([
    ['https://store.alpen-group.jp/disp/CSfLandingPage.jsp?pageType=gd&alpHinban=4051647835', '4051647835'],
    ['https://store.alpen-group.jp/Form/Product/ProductDetail.aspx?pid=4051643735-0001&bid=0426', '4051643735'],
    ['4051643735', '4051643735'],
  ])('extracts the product number from %s', (value, expected) => {
    expect(extractAlpenProductId(value)).toBe(expected)
    expect(parseAlpenLookup(value)?.alpenProductId).toBe(expected)
  })

  it('rejects non-Alpen URLs', () => {
    expect(extractAlpenProductId('https://example.com/?alpHinban=4051643735')).toBeNull()
  })

  it('normalizes article numbers and uses a corrected article without refetching Alpen', () => {
    const lookup = {
      kind: 'alpen' as const,
      alpenProductId: '4051643735',
      articleNumber: 'MS327 CWB',
      brandName: 'New Balance',
    }
    expect(normalizeArticleNumber(lookup.articleNumber)).toBe('MS327CWB')
    expect(lookupKey(lookup)).toBe('alpen:4051643735')
    expect(toPoizonLookupInput(lookup)).toEqual({
      articleNumber: 'MS327 CWB',
      brandName: 'New Balance',
    })
  })
})
