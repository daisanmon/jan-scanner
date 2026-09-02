import { POIZON_PUBLIC_CONFIG } from '../config/publicConfig'
import type {
  PoizonApiErrorResponse,
  PoizonLookupResponse,
} from '../types/poizon'

export type PoizonLookupInput = {
  janCode?: string
  articleNumber?: string
  brandName?: string
  alpenProductId?: string
  alpenUrl?: string
  selectedSpuId?: string
  turnstileToken?: string
}

const SESSION_STORAGE_KEY = 'jan-pocket:poizon-session'
const SESSION_HEADER = 'X-POIZON-Session'
const SESSION_EXPIRES_HEADER = 'X-POIZON-Session-Expires'

type BrowserSession = {
  token: string
  expiresAt: string
}

let memorySession: BrowserSession | null = null

function sessionIsValid(session: BrowserSession, now = Date.now()): boolean {
  const expiresAt = Date.parse(session.expiresAt)
  return (
    session.token.length > 0 &&
    Number.isFinite(expiresAt) &&
    expiresAt > now
  )
}

function readBrowserSession(): BrowserSession | null {
  if (memorySession && sessionIsValid(memorySession)) {
    return memorySession
  }
  memorySession = null

  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!stored) {
      return null
    }
    const parsed = JSON.parse(stored) as Partial<BrowserSession>
    if (
      typeof parsed.token !== 'string' ||
      typeof parsed.expiresAt !== 'string' ||
      !sessionIsValid(parsed as BrowserSession)
    ) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    memorySession = parsed as BrowserSession
    return memorySession
  } catch {
    return null
  }
}

function saveBrowserSession(response: Response): void {
  const token = response.headers.get(SESSION_HEADER)
  const expiresAt = response.headers.get(SESSION_EXPIRES_HEADER)
  if (!token || !expiresAt) {
    return
  }

  const session = { token, expiresAt }
  if (!sessionIsValid(session)) {
    return
  }
  memorySession = session
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // メモリ上には保持し、同じページを開いている間は再認証を避ける。
  }
}

export function clearPoizonSession(): void {
  memorySession = null
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // sessionStorageが利用できない環境でもメモリ上のセッションは破棄済み。
  }
}

export function hasValidPoizonSession(): boolean {
  return readBrowserSession() !== null
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
  const session = readBrowserSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1',
  }
  if (session) {
    headers[SESSION_HEADER] = session.token
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    signal,
  })
  saveBrowserSession(response)

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
      if (
        body.error.code === 'TURNSTILE_REQUIRED' ||
        body.error.code === 'TURNSTILE_FAILED'
      ) {
        clearPoizonSession()
      }
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
