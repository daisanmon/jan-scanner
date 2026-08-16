import type { GatewayLookupRequest, LookupRequest } from './contracts'
import { errorResponse, jsonResponse } from './contracts'
import type { WorkerEnv } from './env'
import { ApiError } from './errors'
import { isValidJanCode } from './jan'
import {
  issueBrowserSession,
  SESSION_EXPIRES_HEADER,
  SESSION_HEADER,
  validateBrowserSession,
} from './session'
import { validateTurnstile } from './turnstile'

export { PoizonGateway } from './gateway'

const MAX_REQUEST_BYTES = 4_096
const POIZON_ID_PATTERN = /^\d{1,16}$/

function allowedOrigins(env: WorkerEnv): Set<string> {
  return new Set(
    env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}

function assertAllowedOrigin(request: Request, env: WorkerEnv): string {
  const origin = request.headers.get('Origin')
  if (!origin || !allowedOrigins(env).has(origin)) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', '許可されていない接続元です。', false)
  }
  return origin
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ngrok-skip-browser-warning, ${SESSION_HEADER}`,
    'Access-Control-Expose-Headers': `${SESSION_HEADER}, ${SESSION_EXPIRES_HEADER}`,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(corsHeaders(origin))) {
    headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function validateConfiguration(env: WorkerEnv): void {
  if (!env.POIZON_APP_KEY || !env.POIZON_APP_SECRET || !env.TURNSTILE_SECRET_KEY) {
    throw new ApiError(
      503,
      'POIZON_CONFIGURATION_ERROR',
      'バックエンドの秘密情報が設定されていません。',
      false,
    )
  }
}

async function parseLookupRequest(request: Request): Promise<LookupRequest> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0)
  if (declaredLength > MAX_REQUEST_BYTES) {
    throw new ApiError(413, 'INVALID_REQUEST', 'リクエストが大きすぎます。', false)
  }

  const bodyText = await request.text()
  if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BYTES) {
    throw new ApiError(413, 'INVALID_REQUEST', 'リクエストが大きすぎます。', false)
  }

  let input: unknown
  try {
    input = JSON.parse(bodyText)
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST', 'JSON形式が正しくありません。', false)
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'リクエスト形式が正しくありません。', false)
  }

  const record = input as Record<string, unknown>
  if (typeof record.janCode !== 'string' || !isValidJanCode(record.janCode)) {
    throw new ApiError(400, 'INVALID_JAN', '有効なJANコードを指定してください。', false)
  }
  if (record.turnstileToken !== undefined) {
    if (
      typeof record.turnstileToken !== 'string' ||
      record.turnstileToken.length === 0 ||
      record.turnstileToken.length > 2_048
    ) {
      throw new ApiError(400, 'INVALID_REQUEST', 'ブラウザ確認トークンが正しくありません。', false)
    }
  }

  for (const selection of [record.selectedSpuId, record.selectedSkuId]) {
    if (selection === undefined) {
      continue
    }
    if (
      typeof selection !== 'string' ||
      !POIZON_ID_PATTERN.test(selection) ||
      !Number.isSafeInteger(Number(selection))
    ) {
      throw new ApiError(400, 'INVALID_SELECTION', '商品候補の指定が正しくありません。', false)
    }
  }

  if (record.selectedSpuId !== undefined && record.selectedSkuId !== undefined) {
    throw new ApiError(400, 'INVALID_SELECTION', '商品候補は1つだけ指定してください。', false)
  }

  return {
    janCode: record.janCode,
    selectedSpuId: record.selectedSpuId as string | undefined,
    selectedSkuId: record.selectedSkuId as string | undefined,
    turnstileToken: record.turnstileToken as string | undefined,
  }
}

async function handleRequest(
  request: Request,
  env: WorkerEnv,
  requestId: string,
): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/healthz') {
    return jsonResponse({ ok: true })
  }

  const origin = assertAllowedOrigin(request, env)
  if (request.method === 'OPTIONS' && url.pathname === '/v1/poizon/lookups') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST' || url.pathname !== '/v1/poizon/lookups') {
    throw new ApiError(404, 'INVALID_REQUEST', 'APIが見つかりません。', false)
  }

  validateConfiguration(env)
  const input = await parseLookupRequest(request)
  const suppliedSession = request.headers.get(SESSION_HEADER)
  const hasValidSession = suppliedSession
    ? await validateBrowserSession(suppliedSession, env)
    : false
  let issuedSession: Awaited<ReturnType<typeof issueBrowserSession>> | null = null

  if (!hasValidSession) {
    if (!input.turnstileToken) {
      throw new ApiError(
        403,
        'TURNSTILE_REQUIRED',
        'ブラウザの確認が必要です。',
        true,
      )
    }
    await validateTurnstile(
      input.turnstileToken,
      requestId,
      request.headers.get('CF-Connecting-IP'),
      env,
    )
    issuedSession = await issueBrowserSession(env)
  }

  const gatewayInput: GatewayLookupRequest = {
    requestId,
    janCode: input.janCode,
    selectedSpuId: input.selectedSpuId,
    selectedSkuId: input.selectedSkuId,
  }
  const id = env.POIZON_GATEWAY.idFromName('poizon-global-gateway')
  const response = await env.POIZON_GATEWAY.get(id).fetch('https://internal/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gatewayInput),
  })
  const corsResponse = withCors(response, origin)
  if (!issuedSession) {
    return corsResponse
  }

  const headers = new Headers(corsResponse.headers)
  headers.set(SESSION_HEADER, issuedSession.token)
  headers.set(SESSION_EXPIRES_HEADER, issuedSession.expiresAt)
  return new Response(corsResponse.body, {
    status: corsResponse.status,
    statusText: corsResponse.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const requestId = crypto.randomUUID()
    let origin: string | null = null

    try {
      origin = request.headers.get('Origin')
      return await handleRequest(request, env, requestId)
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(500, 'INTERNAL_ERROR', '内部エラーが発生しました。', true)
      if (!(error instanceof ApiError)) {
        console.error(JSON.stringify({ event: 'worker_error', requestId }))
      }
      const response = errorResponse(apiError, requestId)
      return origin && allowedOrigins(env).has(origin) ? withCors(response, origin) : response
    }
  },
} satisfies ExportedHandler<WorkerEnv>
