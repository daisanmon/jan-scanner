import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearPoizonSession,
  hasValidPoizonSession,
  lookupPoizon,
} from './poizonApi'

describe('lookupPoizon', () => {
  afterEach(() => {
    clearPoizonSession()
    vi.unstubAllGlobals()
  })

  it('adds the ngrok browser-warning bypass header', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input
        void init
        return Response.json({
          requestId: 'request-id',
          state: 'not_found',
          cache: { product: false, market: false, price: false },
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    await lookupPoizon({
      janCode: '4580563378953',
      selectedSpuId: '1045489',
      turnstileToken: 'browser-token',
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    })
    expect(JSON.parse(String(init.body))).toMatchObject({
      selectedSpuId: '1045489',
    })
  })

  it('stores a short-lived session and sends it on later lookups', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            requestId: 'first-request',
            state: 'not_found',
            cache: { product: false, market: false, price: false },
          },
          {
            headers: {
              'X-POIZON-Session': 'short-lived-session',
              'X-POIZON-Session-Expires': '2099-08-05T00:30:00.000Z',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          requestId: 'second-request',
          state: 'not_found',
          cache: { product: true, market: false, price: false },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await lookupPoizon({
      janCode: '4580563378953',
      turnstileToken: 'browser-token',
    })
    expect(hasValidPoizonSession()).toBe(true)

    await lookupPoizon({ janCode: '4580563378953' })

    const secondInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(secondInit.headers).toMatchObject({
      'X-POIZON-Session': 'short-lived-session',
    })
    expect(JSON.parse(String(secondInit.body))).not.toHaveProperty(
      'turnstileToken',
    )
  })
})
