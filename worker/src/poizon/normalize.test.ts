// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  barcodeFixture,
  batchPriceFixture,
  marketFixture,
} from '../../test/poizonFixtures'
import {
  normalizeArticleCandidates,
  normalizeBarcodeCandidates,
  normalizeBatchPrices,
  normalizeMarketProduct,
  normalizePoizonImageUrl,
  normalizePrice,
} from './normalize'

describe('POIZON response normalization', () => {
  it('keeps only an exact JAN match and preserves large IDs as strings', () => {
    expect(normalizeBarcodeCandidates(barcodeFixture, '4580563378953')).toEqual([
      {
        spuId: '1045489',
        title: 'Test sneaker',
        brandName: 'Test brand',
        imageUrl: 'https://cdn.poizon.com/pro-img/sku/test-sneaker-28-5.jpg',
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

  it('prefers the matching SKU image over the SPU image', () => {
    const [candidate] = normalizeBarcodeCandidates(barcodeFixture, '4580563378953')

    expect(candidate.imageUrl).toBe(
      'https://cdn.poizon.com/pro-img/sku/test-sneaker-28-5.jpg',
    )
  })

  it('preserves the official article number as the product model number', () => {
    const response = structuredClone(barcodeFixture)
    Reflect.set(response.data.contents[0].spuInfo, 'articleNumber', '1011C084-750')

    const [candidate] = normalizeBarcodeCandidates(response, '4580563378953')

    expect(candidate.articleNumber).toBe('1011C084-750')
  })

  it('falls back to the SPU image when the matching SKU has no image', () => {
    const response = structuredClone(barcodeFixture)
    Reflect.deleteProperty(response.data.contents[0].skuInfoList[0], 'logoUrl')

    const [candidate] = normalizeBarcodeCandidates(response, '4580563378953')

    expect(candidate.imageUrl).toBe(
      'https://cdn.poizon.com/pro-img/spu/test-sneaker.jpg',
    )
  })

  it('omits the image when neither the matching SKU nor the SPU has one', () => {
    const response = structuredClone(barcodeFixture)
    Reflect.deleteProperty(response.data.contents[0].skuInfoList[0], 'logoUrl')
    Reflect.deleteProperty(response.data.contents[0].spuInfo, 'logoUrl')

    const [candidate] = normalizeBarcodeCandidates(response, '4580563378953')

    expect(candidate).not.toHaveProperty('imageUrl')
  })

  it.each([
    ['malformed URL', 'not a URL'],
    ['HTTP URL', 'http://cdn.poizon.com/product.jpg'],
    ['unapproved host', 'https://images.example.com/product.jpg'],
  ])('omits a %s without dropping the product candidate', (_, imageUrl) => {
    const response = structuredClone(barcodeFixture)
    response.data.contents[0].skuInfoList[0].logoUrl = imageUrl
    Reflect.deleteProperty(response.data.contents[0].spuInfo, 'logoUrl')

    const candidates = normalizeBarcodeCandidates(response, '4580563378953')

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).not.toHaveProperty('imageUrl')
    expect(candidates[0].sizes).toEqual([
      { system: 'JP', value: '28.5' },
      { system: 'EU', value: '45' },
      { system: 'US Men', value: '11.5' },
    ])
  })

  it('trims and validates only official HTTPS CDN image URLs', () => {
    expect(
      normalizePoizonImageUrl('  https://cdn.poizon.com/product.jpg  '),
    ).toBe('https://cdn.poizon.com/product.jpg')
    expect(normalizePoizonImageUrl(123)).toBeUndefined()
    expect(
      normalizePoizonImageUrl('https://cdn.poizon.com.example/product.jpg'),
    ).toBeUndefined()
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

  it('matches a 12-digit UPC alias and ignores empty-barcode sibling SKUs', () => {
    const response = structuredClone(barcodeFixture)
    response.data.contents[0].skuInfoList[0].barCode = '194956863434'
    response.data.contents[0].skuInfoList[0].skuId = 600297010
    response.data.contents[0].skuInfoList[0].globalSkuId = 10600297010
    response.data.contents[0].skuInfoList[1].barCode = ''

    const candidates = normalizeBarcodeCandidates(
      response,
      '0194956863434',
      ['0194956863434', '194956863434'],
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      skuId: '600297010',
      globalSkuId: '10600297010',
      janCode: '0194956863434',
    })
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

  it('normalizes API 169 sizes, sales, ratios, and average prices', () => {
    const market = normalizeMarketProduct(marketFixture, '1045489')

    expect(market).toMatchObject({
      spuId: '1045489',
      globalSpuId: '10001045489',
      title: 'Test sneaker',
      brandName: 'Test brand',
    })
    expect(market.skus[0]).toEqual({
      skuId: '600297001',
      globalSkuId: '10600297001',
      sizes: [
        { system: 'JP', value: '28.5' },
        { system: 'EU', value: '45' },
        { system: 'US Men', value: '11.5' },
      ],
      globalSoldNum30: 200,
      localSoldNum30: 2,
      globalMonthToMonthRatio: 0.25,
      localMonthToMonthRatio: -0.5,
      averageTransactionPrice: 33_000,
    })
    expect(market.skus[2]).toMatchObject({
      globalSoldNum30: null,
      localSoldNum30: null,
      averageTransactionPrice: null,
    })
  })

  it('drops POIZON fallback SKUs whose size systems all contain the same prefixed value', () => {
    const response = structuredClone(marketFixture)
    response.data[0].skuInfoList.push({
      skuId: 600297004,
      globalSkuId: 10600297004,
      regionSalePvInfoList: [
        {
          sizeInfos: [
            { sizeKey: 'JP', value: 'EU 220' },
            { sizeKey: 'EU', value: 'EU 220' },
            { sizeKey: 'US Men', value: 'EU 220' },
          ],
        },
      ],
      commoditySales: {},
      averagePrice: {},
    })

    const market = normalizeMarketProduct(response, '1045489')

    expect(market.skus.map(({ skuId }) => skuId)).toEqual([
      '600297001',
      '600297002',
      '600297003',
    ])
  })

  it('normalizes an unordered API 141 batch and preserves missing prices', () => {
    expect(normalizeBatchPrices(batchPriceFixture)).toEqual([
      { skuId: '600297002', globalMinPrice: 35_900, asiaMinPrice: 34_900, localMinPrice: null, highDemandPrice: null, fen95ReferencePrice: null, moreReferencePrice: null },
      { skuId: '600297001', globalMinPrice: 33_900, asiaMinPrice: 33_900, localMinPrice: null, highDemandPrice: null, fen95ReferencePrice: null, moreReferencePrice: null },
      { skuId: '600297003', globalMinPrice: 37_900, asiaMinPrice: null, localMinPrice: null, highDemandPrice: null, fen95ReferencePrice: null, moreReferencePrice: null },
    ])
  })

  it('normalizes API 226 article-number candidates without inventing a scanned size', () => {
    expect(normalizeArticleCandidates({
      code: 200,
      data: [{
        spuId: 1045489,
        globalSpuId: 10001045489,
        articleNumber: 'MS327CWB',
        title: 'New Balance 327 White Black',
        brandName: 'New Balance',
        logoUrl: 'https://cdn.poizon.com/pro-img/spu/327.jpg',
      }],
    })).toEqual([{
      spuId: '1045489',
      globalSpuId: '10001045489',
      articleNumber: 'MS327CWB',
      title: 'New Balance 327 White Black',
      brandName: 'New Balance',
      imageUrl: 'https://cdn.poizon.com/pro-img/spu/327.jpg',
      skuId: '',
      globalSkuId: '',
      janCode: '',
      sizes: [],
    }])
  })
})
