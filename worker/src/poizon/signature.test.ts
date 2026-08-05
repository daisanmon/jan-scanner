// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createSignatureBase, signPoizonRequest } from './signature'

describe('POIZON request signature', () => {
  const parameters = {
    timestamp: 1_710_000_000_000,
    timeZone: 'Asia/Tokyo',
    language: 'ja',
    barcodes: ['4580563378953'],
    app_key: 'test key',
    empty: '',
    sign: 'must-not-be-included',
  }

  it('sorts, form-encodes, and joins arrays using the official algorithm', () => {
    expect(createSignatureBase(parameters)).toBe(
      'app_key=test+key&barcodes=4580563378953&language=ja&timeZone=Asia%2FTokyo&timestamp=1710000000000',
    )
  })

  it('appends the secret and returns uppercase MD5', () => {
    expect(signPoizonRequest(parameters, 'secret-value')).toBe(
      'C5D8D9F1A3241A0DEAD4F2755CE7D286',
    )
  })

  it('serializes nested API 169 statistics options as JSON before form encoding', () => {
    expect(
      createSignatureBase({
        spuIds: [1174899],
        statisticsDataQry: { salesEnable: true, minPriceEnable: true },
      }),
    ).toBe(
      'spuIds=1174899&statisticsDataQry=%7B%22salesEnable%22%3Atrue%2C%22minPriceEnable%22%3Atrue%7D',
    )
  })
})
