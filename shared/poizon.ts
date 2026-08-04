export type PoizonSize = {
  system: string
  value: string
}

export type PoizonProductCandidate = {
  spuId: string
  globalSpuId?: string
  title: string
  brandName: string
  skuId: string
  globalSkuId: string
  janCode: string
  sizes: PoizonSize[]
}

export type PoizonCacheStatus = {
  product: boolean
  price: boolean
}

export type PoizonResolvedResponse = {
  requestId: string
  state: 'resolved'
  product: PoizonProductCandidate
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
