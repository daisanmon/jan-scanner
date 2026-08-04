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

  it('accepts a matching API 181 result when POIZON leaves barCode empty', () => {
    expect(
      normalizeBarcodeCandidates(
        {
          code: 200,
          data: {
            contents: [
              {
                spuId: 1045489,
                globalSpuId: 10001045489,
                spuInfo: {
                  title: 'Maison MIHARA YASUHIRO Og Sole Peterson Low Canvas Black',
                  brandName: 'MIHARA YASUHIRO',
                },
                skuInfoList: [
                  {
                    barCode: null,
                    skuId: 600297001,
                    globalSkuId: 10600297001,
                    regionSalePvInfoList: [
                      {
                        sizeInfos: [
                          { sizeKey: 'JP', value: '28.5' },
                          { sizeKey: 'EU', value: '45' },
                          { sizeKey: 'US', value: '11.5' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
        '4580563378953',
      ),
    ).toEqual([
      {
        spuId: '1045489',
        globalSpuId: '10001045489',
        title: 'Maison MIHARA YASUHIRO Og Sole Peterson Low Canvas Black',
        brandName: 'MIHARA YASUHIRO',
        skuId: '600297001',
        globalSkuId: '10600297001',
        janCode: '4580563378953',
        sizes: [
          { system: 'JP', value: '28.5' },
          { system: 'EU', value: '45' },
          { system: 'US', value: '11.5' },
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
