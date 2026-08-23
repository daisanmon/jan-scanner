// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  issueBrowserSession,
  SESSION_TTL_MS,
  validateBrowserSession,
} from './session'

const env = {
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  TURNSTILE_EXPECTED_HOSTNAME: 'daisanmon.github.io',
  TURNSTILE_EXPECTED_ACTION: 'poizon_lookup',
}

describe('browser session token', () => {
  it('accepts an issued token until its 30 minute expiration', async () => {
    const now = Date.UTC(2026, 7, 5, 0, 0, 0)
    const session = await issueBrowserSession(env, now)

    await expect(
      validateBrowserSession(session.token, env, now + SESSION_TTL_MS - 1),
    ).resolves.toBe(true)
    await expect(
      validateBrowserSession(session.token, env, now + SESSION_TTL_MS),
    ).resolves.toBe(false)
  })

  it('rejects tampering and tokens issued for another hostname', async () => {
    const now = Date.UTC(2026, 7, 5, 0, 0, 0)
    const session = await issueBrowserSession(env, now)
    const replacement = session.token.endsWith('A') ? 'B' : 'A'
    const tampered = `${session.token.slice(0, -1)}${replacement}`

    await expect(validateBrowserSession(tampered, env, now)).resolves.toBe(false)
    await expect(
      validateBrowserSession(
        session.token,
        { ...env, TURNSTILE_EXPECTED_HOSTNAME: 'example.com' },
        now,
      ),
    ).resolves.toBe(false)
  })
})
