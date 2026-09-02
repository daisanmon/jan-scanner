import type { PoizonApiErrorResponse, PoizonLookupContext } from '../../shared/poizon'
import { ApiError } from './errors'

export type LookupRequest = {
  janCode?: string
  articleNumber?: string
  brandName?: string
  alpenProductId?: string
  alpenUrl?: string
  selectedSpuId?: string
  /** Accepted during the frontend/worker rollout for backwards compatibility. */
  selectedSkuId?: string
  turnstileToken?: string
}

export type GatewayLookupRequest = {
  requestId: string
  lookup?: PoizonLookupContext
  /** Accepted for existing Durable Object requests during rollout. */
  janCode?: string
  selectedSpuId?: string
  selectedSkuId?: string
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
