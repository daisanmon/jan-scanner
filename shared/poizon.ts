export type PoizonSize = {
  system: string
  value: string
}

export type PoizonProductCandidate = {
  spuId: string
  globalSpuId?: string
  articleNumber?: string
  title: string
  brandName: string
  imageUrl?: string
  skuId: string
  globalSkuId: string
  janCode: string
  sizes: PoizonSize[]
}

export type PoizonSizeMarketData = {
  skuId: string
  globalSkuId: string
  sizes: PoizonSize[]
  scanned: boolean
  globalSoldNum30: number | null
  localSoldNum30: number | null
  globalMonthToMonthRatio: number | null
  localMonthToMonthRatio: number | null
  averageTransactionPrice: number | null
  globalMinPrice: number | null
  asiaMinPrice: number | null
}

export type PoizonNumberRange = {
  min: number | null
  median: number | null
  max: number | null
  reportedSizeCount: number
  totalSizeCount: number
}

export type PoizonMarketSummary = {
  currency: 'JPY'
  globalSoldNum30Total: number | null
  referencePrice: PoizonNumberRange
  salesPerSize: PoizonNumberRange
  salesWeightedAveragePrice: number | null
  bestSellingSkuId: string | null
}

export type PoizonMarketWarning =
  | 'PRICE_PARTIAL'
  | 'PRICE_UNAVAILABLE'
  | 'SALES_PARTIAL'

export type PoizonMarketData = {
  summary: PoizonMarketSummary
  sizes: PoizonSizeMarketData[]
  marketDataAsOf: string
  priceDataAsOf: string | null
  warnings: PoizonMarketWarning[]
}

export type PoizonCacheStatus = {
  product: boolean
  market: boolean
  price: boolean
}

export type PoizonResolvedResponse = {
  requestId: string
  state: 'resolved'
  product: PoizonProductCandidate
  /** Omitted only when API 169 fails and the single-size API 93 fallback succeeds. */
  market?: PoizonMarketData
  /** Compatibility field for the previously deployed frontend. */
  price: {
    currency: 'JPY'
    globalMinPrice: number
    asiaMinPrice: number
    dataAsOf: string
  }
  cache: PoizonCacheStatus
}

export type PoizonSelectionRequiredResponse = {
  requestId: string
  state: 'selection_required'
  candidates: PoizonProductCandidate[]
  cache: PoizonCacheStatus
}

export type PoizonNotFoundResponse = {
  requestId: string
  state: 'not_found'
  cache: PoizonCacheStatus
}

export type PoizonPriceUnavailableResponse = {
  requestId: string
  state: 'price_unavailable'
  product: PoizonProductCandidate
  market?: PoizonMarketData
  cache: PoizonCacheStatus
}

export type PoizonLookupResponse =
  | PoizonResolvedResponse
  | PoizonSelectionRequiredResponse
  | PoizonNotFoundResponse
  | PoizonPriceUnavailableResponse

export type PoizonApiErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_JAN'
  | 'INVALID_SELECTION'
  | 'SELECTION_STALE'
  | 'ORIGIN_NOT_ALLOWED'
  | 'TURNSTILE_REQUIRED'
  | 'TURNSTILE_FAILED'
  | 'TURNSTILE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'POIZON_CONFIGURATION_ERROR'
  | 'POIZON_BAD_RESPONSE'
  | 'POIZON_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export type PoizonApiErrorResponse = {
  error: {
    code: PoizonApiErrorCode
    message: string
    retryable: boolean
    requestId: string
  }
}
