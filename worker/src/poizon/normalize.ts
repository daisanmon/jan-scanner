import type { PoizonProductCandidate, PoizonSize } from '../../../shared/poizon'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringId(value: unknown): string | null {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return value
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  return null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizePoizonImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.poizon.com') {
      return undefined
    }
    return trimmed
  } catch {
    return undefined
  }
}

function integerValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function positiveInteger(value: unknown): number | null {
  const parsed = integerValue(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function nestedInteger(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (!isRecord(value)) {
    return integerValue(value)
  }
  return integerValue(value.minUnitVal) ?? integerValue(value.amount)
}

function normalizeSizes(sku: Record<string, unknown>): PoizonSize[] {
  const sizes = new Map<string, string>()
  const regionProperties = Array.isArray(sku.regionSalePvInfoList)
    ? sku.regionSalePvInfoList
    : []

  for (const property of regionProperties) {
    if (!isRecord(property) || !Array.isArray(property.sizeInfos)) {
      continue
    }
    for (const size of property.sizeInfos) {
      if (!isRecord(size)) {
        continue
      }
      const system = stringValue(size.sizeKey).trim()
      const value = stringValue(size.value).trim()
      if (system && value && !sizes.has(system)) {
        sizes.set(system, value)
      }
    }
  }

  const preferredOrder = ['JP', 'EU', 'US', 'US Men', 'US Women', 'UK', 'CN', 'KR']
  return Array.from(sizes, ([system, value]) => ({ system, value })).sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.system)
    const rightIndex = preferredOrder.indexOf(right.system)
    const normalizedLeft = leftIndex === -1 ? preferredOrder.length : leftIndex
    const normalizedRight = rightIndex === -1 ? preferredOrder.length : rightIndex
    return normalizedLeft - normalizedRight || left.system.localeCompare(right.system)
  })
}

export function normalizeBarcodeCandidates(
  response: unknown,
  janCode: string,
): PoizonProductCandidate[] {
  if (!isRecord(response) || Number(response.code) !== 200 || !isRecord(response.data)) {
    throw new Error('Invalid API 181 response')
  }

  const contents = Array.isArray(response.data.contents) ? response.data.contents : []
  const candidates = new Map<string, PoizonProductCandidate>()

  for (const content of contents) {
    if (!isRecord(content)) {
      continue
    }
    const spuInfo = isRecord(content.spuInfo) ? content.spuInfo : {}
    const spuId = stringId(content.spuId ?? spuInfo.spuId)
    const globalSpuId = stringId(content.globalSpuId ?? spuInfo.globalSpuId)
    const skuList = Array.isArray(content.skuInfoList) ? content.skuInfoList : []

    if (!spuId) {
      continue
    }

    for (const rawSku of skuList) {
      if (!isRecord(rawSku)) {
        continue
      }
      const rawBarcode = rawSku.barCode
      if (rawBarcode !== undefined && rawBarcode !== null && typeof rawBarcode !== 'string') {
        continue
      }
      const returnedBarcode = typeof rawBarcode === 'string' ? rawBarcode.trim() : ''
      if (returnedBarcode && returnedBarcode !== janCode) {
        continue
      }
      const skuId = stringId(rawSku.skuId)
      const globalSkuId = stringId(rawSku.globalSkuId)
      if (!skuId || !globalSkuId) {
        continue
      }
      const imageUrl =
        normalizePoizonImageUrl(rawSku.logoUrl) ??
        normalizePoizonImageUrl(spuInfo.logoUrl)

      candidates.set(skuId, {
        spuId,
        ...(globalSpuId ? { globalSpuId } : {}),
        title: stringValue(spuInfo.title),
        brandName: stringValue(spuInfo.brandName),
        ...(imageUrl ? { imageUrl } : {}),
        skuId,
        globalSkuId,
        janCode,
        sizes: normalizeSizes(rawSku),
      })
    }
  }

  return Array.from(candidates.values())
}

export type NormalizedMarketSku = {
  skuId: string
  globalSkuId: string
  sizes: PoizonSize[]
  globalSoldNum30: number | null
  localSoldNum30: number | null
  globalMonthToMonthRatio: number | null
  localMonthToMonthRatio: number | null
  averageTransactionPrice: number | null
}

export type NormalizedMarketProduct = {
  spuId: string
  globalSpuId?: string
  title: string
  brandName: string
  skus: NormalizedMarketSku[]
}

export function normalizeMarketProduct(
  response: unknown,
  expectedSpuId: string,
): NormalizedMarketProduct {
  if (!isRecord(response) || Number(response.code) !== 200 || !Array.isArray(response.data)) {
    throw new Error('Invalid API 169 response')
  }

  const rawProduct = response.data.find((value) => {
    if (!isRecord(value)) {
      return false
    }
    const spuInfo = isRecord(value.spuInfo) ? value.spuInfo : {}
    return stringId(value.spuId ?? spuInfo.spuId) === expectedSpuId
  })
  if (!isRecord(rawProduct)) {
    throw new Error('API 169 did not return the requested SPU')
  }

  const spuInfo = isRecord(rawProduct.spuInfo) ? rawProduct.spuInfo : {}
  const spuId = stringId(rawProduct.spuId ?? spuInfo.spuId)
  const globalSpuId = stringId(rawProduct.globalSpuId ?? spuInfo.globalSpuId)
  if (!spuId) {
    throw new Error('API 169 returned an invalid SPU ID')
  }

  const rawSkus = Array.isArray(rawProduct.skuInfoList) ? rawProduct.skuInfoList : []
  const skus: NormalizedMarketSku[] = []
  for (const rawSku of rawSkus) {
    if (!isRecord(rawSku)) {
      continue
    }
    const skuId = stringId(rawSku.skuId)
    const globalSkuId = stringId(rawSku.globalSkuId)
    if (!skuId || !globalSkuId) {
      continue
    }
    const sales = isRecord(rawSku.commoditySales) ? rawSku.commoditySales : {}
    const averagePrice = isRecord(rawSku.averagePrice) ? rawSku.averagePrice : {}
    const averageTransactionPrice = nestedInteger(averagePrice, 'globalAveragePrice')

    skus.push({
      skuId,
      globalSkuId,
      sizes: normalizeSizes(rawSku),
      globalSoldNum30: integerValue(sales.globalSoldNum30),
      localSoldNum30: integerValue(sales.localSoldNum30),
      globalMonthToMonthRatio: finiteNumber(sales.globalMonthToMonthRatio),
      localMonthToMonthRatio: finiteNumber(sales.localMonthToMonthRatio),
      averageTransactionPrice:
        averageTransactionPrice !== null && averageTransactionPrice > 0
          ? averageTransactionPrice
          : null,
    })
  }
  if (skus.length === 0) {
    throw new Error('API 169 returned no valid SKUs')
  }

  return {
    spuId,
    ...(globalSpuId ? { globalSpuId } : {}),
    title: stringValue(spuInfo.title),
    brandName: stringValue(spuInfo.brandName),
    skus,
  }
}

export type NormalizedPrice = {
  globalMinPrice: number
  asiaMinPrice: number
}

export function normalizePrice(response: unknown): NormalizedPrice | null {
  if (!isRecord(response) || Number(response.code) !== 200 || !isRecord(response.data)) {
    throw new Error('Invalid API 93 response')
  }

  const globalMinPrice = integerValue(response.data.globalMinPrice)
  const asiaMinPrice = integerValue(response.data.asiaMinPrice)
  if (globalMinPrice === null || asiaMinPrice === null) {
    return null
  }

  return { globalMinPrice, asiaMinPrice }
}

export type NormalizedBatchPrice = {
  skuId: string
  globalMinPrice: number | null
  asiaMinPrice: number | null
}

export function normalizeBatchPrices(response: unknown): NormalizedBatchPrice[] {
  if (!isRecord(response) || Number(response.code) !== 200 || !Array.isArray(response.data)) {
    throw new Error('Invalid API 141 response')
  }

  const prices = new Map<string, NormalizedBatchPrice>()
  for (const rawPrice of response.data) {
    if (!isRecord(rawPrice)) {
      continue
    }
    const skuId = stringId(rawPrice.skuId)
    if (!skuId) {
      continue
    }
    prices.set(skuId, {
      skuId,
      globalMinPrice: positiveInteger(rawPrice.globalMinPrice),
      asiaMinPrice: positiveInteger(rawPrice.asiaMinPrice),
    })
  }
  return Array.from(prices.values())
}

export function readPoizonEnvelope(response: unknown): {
  code?: string
  traceId?: string
} {
  if (!isRecord(response)) {
    return {}
  }
  return {
    code:
      typeof response.code === 'string' || typeof response.code === 'number'
        ? String(response.code)
        : undefined,
    traceId: typeof response.trace_id === 'string' ? response.trace_id : undefined,
  }
}
