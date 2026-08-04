import { afterEach, describe, expect, it, vi } from 'vitest'

import { lookupPoizon } from './poizonApi'

describe('lookupPoizon', () => {
  afterEach(() => {
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
          cache: { product: false, price: false },
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    await lookupPoizon({
      janCode: '4580563378953',
      turnstileToken: 'browser-token',
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    })
  })
})
