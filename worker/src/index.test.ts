// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerEnv } from './env'

const turnstileMock = vi.hoisted(() => vi.fn())
const sessionMocks = vi.hoisted(() => ({
  issue: vi.fn(),
  validate: vi.fn(),
}))

vi.mock('./turnstile', () => ({
  validateTurnstile: turnstileMock,
}))

vi.mock('./session', () => ({
  SESSION_HEADER: 'X-POIZON-Session',
  SESSION_EXPIRES_HEADER: 'X-POIZON-Session-Expires',
  issueBrowserSession: sessionMocks.issue,
  validateBrowserSession: sessionMocks.validate,
}))

import worker from './index'

function createEnv() {
  const gatewayFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input
    void init
    return Response.json({
      requestId: 'gateway-request',
      state: 'resolved',
      product: {
        spuId: '1045489',
        skuId: '600297001',
        globalSkuId: '10600297001',
        janCode: '4580563378953',
        title: '',
        brandName: '',
        sizes: [],
      },
      price: {
        currency: 'JPY',
        globalMinPrice: 33_900,
        asiaMinPrice: 33_900,
        dataAsOf: '2026-08-04T00:00:00.000Z',
      },
      cache: { product: false, market: false, price: false },
    })
  })
  const env = {
    POIZON_APP_KEY: 'app-key',
    POIZON_APP_SECRET: 'app-secret',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TURNSTILE_EXPECTED_HOSTNAME: 'daisanmon.github.io',
    TURNSTILE_EXPECTED_ACTION: 'poizon_lookup',
    ALLOWED_ORIGINS: 'https://daisanmon.github.io',
    POIZON_GATEWAY: {
      idFromName: vi.fn(() => 'object-id'),
      get: vi.fn(() => ({ fetch: gatewayFetch })),
    },
  } as unknown as WorkerEnv
  return { env, gatewayFetch }
}

function request(
  origin: string,
  selectedSpuId?: string,
  options: { sessionToken?: string; turnstileToken?: string | null } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: origin,
    'CF-Connecting-IP': '192.0.2.1',
  }
  if (options.sessionToken) {
    headers['X-POIZON-Session'] = options.sessionToken
  }
  return new Request('https://worker.example/v1/poizon/lookups', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      janCode: '4580563378953',
      selectedSpuId,
      turnstileToken:
        options.turnstileToken === undefined
          ? 'browser-token'
          : options.turnstileToken ?? undefined,
    }),
  })
}

describe('public Worker API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    turnstileMock.mockResolvedValue(undefined)
    sessionMocks.validate.mockResolvedValue(false)
    sessionMocks.issue.mockResolvedValue({
      token: 'short-lived-session',
      expiresAt: '2026-08-05T00:30:00.000Z',
    })
  })

  it('verifies Turnstile, strips its token, and adds exact-origin CORS', async () => {
    const { env, gatewayFetch } = createEnv()
    const response = await worker.fetch(
      request('https://daisanmon.github.io', '1045489'),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://daisanmon.github.io',
    )
    expect(response.headers.get('X-POIZON-Session')).toBe(
      'short-lived-session',
    )
    expect(turnstileMock).toHaveBeenCalledWith(
      'browser-token',
      expect.any(String),
      '192.0.2.1',
      env,
    )
    const forwarded = JSON.parse(
      String((gatewayFetch.mock.calls[0][1] as RequestInit).body),
    ) as Record<string, unknown>
    expect(forwarded).toMatchObject({
      janCode: '4580563378953',
      selectedSpuId: '1045489',
    })
    expect(forwarded.requestId).toEqual(expect.any(String))
    expect(forwarded).not.toHaveProperty('turnstileToken')
  })

  it('reuses a valid browser session without running Turnstile again', async () => {
    sessionMocks.validate.mockResolvedValue(true)
    const { env, gatewayFetch } = createEnv()
    const response = await worker.fetch(
      request('https://daisanmon.github.io', undefined, {
        sessionToken: 'existing-session',
        turnstileToken: null,
      }),
      env,
    )

    expect(response.status).toBe(200)
    expect(sessionMocks.validate).toHaveBeenCalledWith('existing-session', env)
    expect(turnstileMock).not.toHaveBeenCalled()
    expect(sessionMocks.issue).not.toHaveBeenCalled()
    expect(gatewayFetch).toHaveBeenCalledOnce()
  })

  it('asks for Turnstile when neither a valid session nor a challenge token exists', async () => {
    const { env, gatewayFetch } = createEnv()
    const response = await worker.fetch(
      request('https://daisanmon.github.io', undefined, {
        turnstileToken: null,
      }),
      env,
    )
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('TURNSTILE_REQUIRED')
    expect(turnstileMock).not.toHaveBeenCalled()
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  it('rejects every origin not explicitly configured', async () => {
    const { env, gatewayFetch } = createEnv()
    const response = await worker.fetch(
      request('https://example.com'),
      env,
    )
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(403)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(body.error.code).toBe('ORIGIN_NOT_ALLOWED')
    expect(turnstileMock).not.toHaveBeenCalled()
    expect(gatewayFetch).not.toHaveBeenCalled()
  })

  it('allows the ngrok browser-warning bypass header in preflight requests', async () => {
    const { env } = createEnv()
    const response = await worker.fetch(
      new Request('https://worker.example/v1/poizon/lookups', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://daisanmon.github.io',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers':
            'content-type, ngrok-skip-browser-warning, x-poizon-session',
        },
      }),
      env,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, ngrok-skip-browser-warning, X-POIZON-Session',
    )
  })
})
