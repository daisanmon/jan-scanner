// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { WorkerEnv } from './env'
import { validateTurnstile } from './turnstile'

const env = {
  TURNSTILE_SECRET_KEY: 'server-only-secret',
  TURNSTILE_EXPECTED_HOSTNAME: 'daisanmon.github.io',
  TURNSTILE_EXPECTED_ACTION: 'poizon_lookup',
} as WorkerEnv

describe('Turnstile verification', () => {
  it('accepts only the configured hostname and action', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        success: true,
        hostname: 'daisanmon.github.io',
        action: 'poizon_lookup',
      }),
    ) as typeof fetch

    await expect(
      validateTurnstile('token', 'request-id', '192.0.2.1', env, fetcher),
    ).resolves.toBeUndefined()
  })

  it('rejects a token issued for another hostname', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        success: true,
        hostname: 'example.com',
        action: 'poizon_lookup',
      }),
    ) as typeof fetch

    await expect(
      validateTurnstile('token', 'request-id', null, env, fetcher),
    ).rejects.toMatchObject({ code: 'TURNSTILE_FAILED', status: 403 })
  })
})
