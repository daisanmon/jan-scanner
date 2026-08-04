import type { PoizonProductCandidate } from '../../../shared/poizon'

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

function normalizeSizes(sku: Record<string, unknown>) {
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

  const preferredOrder = ['JP', 'EU', 'US', 'US Men']
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

      candidates.set(skuId, {
        spuId,
        ...(globalSpuId ? { globalSpuId } : {}),
        title: stringValue(spuInfo.title),
        brandName: stringValue(spuInfo.brandName),
        skuId,
        globalSkuId,
        janCode,
        sizes: normalizeSizes(rawSku),
      })
    }
  }

  return Array.from(candidates.values())
}

export type NormalizedPrice = {
  globalMinPrice: number
  asiaMinPrice: number
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

export function normalizePrice(response: unknown): NormalizedPrice | null {
  if (!isRecord(response) || Number(response.code) !== 200 || !isRecord(response.data)) {
    throw new Error('Invalid API 93 response')
  }

  const globalMinPrice = nonNegativeInteger(response.data.globalMinPrice)
  const asiaMinPrice = nonNegativeInteger(response.data.asiaMinPrice)
  if (globalMinPrice === null || asiaMinPrice === null) {
    return null
  }

  return { globalMinPrice, asiaMinPrice }
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
