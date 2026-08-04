import type { PoizonApiErrorCode } from '../../shared/poizon'

export class ApiError extends Error {
  readonly status: number
  readonly code: PoizonApiErrorCode
  readonly retryable: boolean
  readonly retryAfterSeconds?: number

  constructor(
    status: number,
    code: PoizonApiErrorCode,
    message: string,
    retryable: boolean,
    retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class PoizonUpstreamError extends Error {
  readonly kind: 'configuration' | 'bad_response' | 'unavailable'
  readonly apiId: 181 | 93
  readonly httpStatus?: number
  readonly poizonCode?: string
  readonly traceId?: string

  constructor(
    kind: 'configuration' | 'bad_response' | 'unavailable',
    apiId: 181 | 93,
    httpStatus?: number,
    poizonCode?: string,
    traceId?: string,
  ) {
    super(`POIZON API ${apiId} failed`)
    this.name = 'PoizonUpstreamError'
    this.kind = kind
    this.apiId = apiId
    this.httpStatus = httpStatus
    this.poizonCode = poizonCode
    this.traceId = traceId
  }
}
