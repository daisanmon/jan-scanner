export const barcodeFixture = {
  code: 200,
  data: {
    contents: [
      {
        spuId: 1045489,
        spuInfo: {
          title: 'Test sneaker',
          brandName: 'Test brand',
          logoUrl: 'https://cdn.poizon.com/pro-img/spu/test-sneaker.jpg',
        },
        skuInfoList: [
          {
            barCode: '4580563378953',
            skuId: 600297001,
            globalSkuId: 10600297001,
            logoUrl: 'https://cdn.poizon.com/pro-img/sku/test-sneaker-28-5.jpg',
            regionSalePvInfoList: [
              {
                sizeInfos: [
                  { sizeKey: 'US Men', value: '11.5' },
                  { sizeKey: 'JP', value: '28.5' },
                  { sizeKey: 'EU', value: '45' },
                ],
              },
            ],
          },
          {
            barCode: '0000000000000',
            skuId: 600297002,
            globalSkuId: 10600297002,
          },
        ],
      },
    ],
  },
}

export const marketFixture = {
  code: 200,
  data: [
    {
      spuId: 1045489,
      globalSpuId: 10001045489,
      spuInfo: {
        title: 'Test sneaker',
        brandName: 'Test brand',
      },
      skuInfoList: [
        {
          skuId: 600297001,
          globalSkuId: 10600297001,
          regionSalePvInfoList: [
            {
              name: 'サイズ',
              value: '45',
              sizeInfos: [
                { sizeKey: 'JP', value: '28.5' },
                { sizeKey: 'EU', value: '45' },
                { sizeKey: 'US Men', value: '11.5' },
              ],
            },
          ],
          commoditySales: {
            globalSoldNum30: 200,
            localSoldNum30: 2,
            globalMonthToMonthRatio: 0.25,
            localMonthToMonthRatio: -0.5,
          },
          averagePrice: {
            globalAveragePrice: { amount: '33000', minUnitVal: 33_000, currency: 'JPY' },
          },
        },
        {
          skuId: 600297002,
          globalSkuId: 10600297002,
          regionSalePvInfoList: [
            {
              sizeInfos: [
                { sizeKey: 'JP', value: '29' },
                { sizeKey: 'EU', value: '46' },
                { sizeKey: 'US Men', value: '12' },
              ],
            },
          ],
          commoditySales: {
            globalSoldNum30: 400,
            localSoldNum30: 0,
            globalMonthToMonthRatio: 0.1,
            localMonthToMonthRatio: 0,
          },
          averagePrice: {
            globalAveragePrice: { amount: '35000', minUnitVal: 35_000, currency: 'JPY' },
          },
        },
        {
          skuId: 600297003,
          globalSkuId: 10600297003,
          regionSalePvInfoList: [
            {
              sizeInfos: [
                { sizeKey: 'JP', value: '29.5' },
                { sizeKey: 'EU', value: '47' },
                { sizeKey: 'US Men', value: '12.5' },
              ],
            },
          ],
          commoditySales: {},
          averagePrice: {},
        },
      ],
    },
  ],
}

export const batchPriceFixture = {
  code: 200,
  data: [
    {
      skuId: 600297002,
      globalSkuId: 10600297002,
      globalMinPrice: 35_900,
      asiaMinPrice: 34_900,
    },
    {
      skuId: 600297001,
      globalSkuId: 10600297001,
      globalMinPrice: 33_900,
      asiaMinPrice: 33_900,
    },
    {
      skuId: 600297003,
      globalSkuId: 10600297003,
      globalMinPrice: 37_900,
    },
  ],
}
