import type { PoizonApiErrorResponse } from '../../shared/poizon'
import { ApiError } from './errors'

export type LookupRequest = {
  janCode: string
  selectedSpuId?: string
  /** Accepted during the frontend/worker rollout for backwards compatibility. */
  selectedSkuId?: string
  turnstileToken?: string
}

export type GatewayLookupRequest = Omit<LookupRequest, 'turnstileToken'> & {
  requestId: string
}

export function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

export function errorResponse(error: ApiError, requestId: string): Response {
  const body: PoizonApiErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      requestId,
    },
  }
  const headers = error.retryAfterSeconds
    ? { 'Retry-After': String(error.retryAfterSeconds) }
    : undefined
  return jsonResponse(body, error.status, headers)
}
