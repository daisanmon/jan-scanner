import { POIZON_PUBLIC_CONFIG } from '../config/publicConfig'
import type {
  PoizonApiErrorResponse,
  PoizonLookupResponse,
} from '../types/poizon'

export type PoizonLookupInput = {
  janCode: string
  selectedSkuId?: string
  turnstileToken: string
}

export class PoizonApiError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly requestId?: string

  constructor(
    code: string,
    message: string,
    retryable: boolean,
    requestId?: string,
  ) {
    super(message)
    this.name = 'PoizonApiError'
    this.code = code
    this.retryable = retryable
    this.requestId = requestId
  }
}

function isErrorResponse(value: unknown): value is PoizonApiErrorResponse {
  if (!value || typeof value !== 'object') {
    return false
  }
  const error = (value as { error?: unknown }).error
  return (
    !!error &&
    typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string' &&
    typeof (error as { retryable?: unknown }).retryable === 'boolean'
  )
}

export async function lookupPoizon(
  input: PoizonLookupInput,
  signal?: AbortSignal,
): Promise<PoizonLookupResponse> {
  const endpoint = new URL('/v1/poizon/lookups', POIZON_PUBLIC_CONFIG.apiBaseUrl)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    },
    body: JSON.stringify(input),
    signal,
  })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new PoizonApiError(
      'INVALID_RESPONSE',
      '価格照会サービスから読み取れない応答を受信しました。',
      true,
    )
  }

  if (!response.ok) {
    if (isErrorResponse(body)) {
      throw new PoizonApiError(
        body.error.code,
        body.error.message,
        body.error.retryable,
        body.error.requestId,
      )
    }
    throw new PoizonApiError(
      'REQUEST_FAILED',
      '価格照会に失敗しました。',
      response.status >= 500 || response.status === 429,
    )
  }

  return body as PoizonLookupResponse
}
