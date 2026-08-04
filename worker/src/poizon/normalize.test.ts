// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { barcodeFixture } from '../../test/poizonFixtures'
import { normalizeBarcodeCandidates, normalizePrice } from './normalize'

describe('POIZON response normalization', () => {
  it('keeps only an exact JAN match and preserves large IDs as strings', () => {
    expect(normalizeBarcodeCandidates(barcodeFixture, '4580563378953')).toEqual([
      {
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
    ])
  })

  it('normalizes the confirmed API 93 prices', () => {
    expect(
      normalizePrice({
        code: '200',
        data: { globalMinPrice: 33_900, asiaMinPrice: 33_900 },
      }),
    ).toEqual({ globalMinPrice: 33_900, asiaMinPrice: 33_900 })
  })

  it('does not substitute a missing regional price', () => {
    expect(
      normalizePrice({ code: 200, data: { globalMinPrice: 33_900 } }),
    ).toBeNull()
  })
})
