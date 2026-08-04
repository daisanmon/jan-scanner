export const barcodeFixture = {
  code: 200,
  data: {
    contents: [
      {
        spuId: 1045489,
        spuInfo: {
          title: 'Test sneaker',
          brandName: 'Test brand',
        },
        skuInfoList: [
          {
            barCode: '4580563378953',
            skuId: 600297001,
            globalSkuId: 10600297001,
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
