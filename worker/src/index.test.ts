// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerEnv } from './env'

const turnstileMock = vi.hoisted(() => vi.fn())

vi.mock('./turnstile', () => ({
  validateTurnstile: turnstileMock,
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
      cache: { product: false, price: false },
    })
  })
  const env = {
    POIZON_APP_KEY: 'app-key',
    POIZON_APP_SECRET: 'app-secret',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    ALLOWED_ORIGINS: 'https://daisanmon.github.io',
    POIZON_GATEWAY: {
      idFromName: vi.fn(() => 'object-id'),
      get: vi.fn(() => ({ fetch: gatewayFetch })),
    },
  } as unknown as WorkerEnv
  return { env, gatewayFetch }
}

function request(origin: string) {
  return new Request('https://worker.example/v1/poizon/lookups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'CF-Connecting-IP': '192.0.2.1',
    },
    body: JSON.stringify({
      janCode: '4580563378953',
      turnstileToken: 'browser-token',
    }),
  })
}

describe('public Worker API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    turnstileMock.mockResolvedValue(undefined)
  })

  it('verifies Turnstile, strips its token, and adds exact-origin CORS', async () => {
    const { env, gatewayFetch } = createEnv()
    const response = await worker.fetch(
      request('https://daisanmon.github.io'),
      env,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://daisanmon.github.io',
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
    expect(forwarded).toMatchObject({ janCode: '4580563378953' })
    expect(forwarded.requestId).toEqual(expect.any(String))
    expect(forwarded).not.toHaveProperty('turnstileToken')
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
            'content-type, ngrok-skip-browser-warning',
        },
      }),
      env,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, ngrok-skip-browser-warning',
    )
  })
})
