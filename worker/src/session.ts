import type { WorkerEnv } from './env'

export const SESSION_HEADER = 'X-POIZON-Session'
export const SESSION_EXPIRES_HEADER = 'X-POIZON-Session-Expires'
export const SESSION_TTL_MS = 30 * 60 * 1_000

const TOKEN_VERSION = 'v1'
const encoder = new TextEncoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null
  }

  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return bytesToBase64Url(bytes) === value ? bytes : null
  } catch {
    return null
  }
}

function sessionMessage(
  payload: string,
  env: Pick<
    WorkerEnv,
    'TURNSTILE_EXPECTED_HOSTNAME' | 'TURNSTILE_EXPECTED_ACTION'
  >,
): Uint8Array {
  return encoder.encode(
    `poizon-browser-session:${payload}:${env.TURNSTILE_EXPECTED_HOSTNAME}:${env.TURNSTILE_EXPECTED_ACTION}`,
  )
}

async function importSessionKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export type IssuedSession = {
  token: string
  expiresAt: string
}

export async function issueBrowserSession(
  env: Pick<
    WorkerEnv,
    | 'TURNSTILE_SECRET_KEY'
    | 'TURNSTILE_EXPECTED_HOSTNAME'
    | 'TURNSTILE_EXPECTED_ACTION'
  >,
  now = Date.now(),
): Promise<IssuedSession> {
  const expiresAtMs = now + SESSION_TTL_MS
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const payload = `${TOKEN_VERSION}.${expiresAtMs}.${bytesToBase64Url(nonceBytes)}`
  const key = await importSessionKey(env.TURNSTILE_SECRET_KEY)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    sessionMessage(payload, env),
  )

  return {
    token: `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  }
}

export async function validateBrowserSession(
  token: string,
  env: Pick<
    WorkerEnv,
    | 'TURNSTILE_SECRET_KEY'
    | 'TURNSTILE_EXPECTED_HOSTNAME'
    | 'TURNSTILE_EXPECTED_ACTION'
  >,
  now = Date.now(),
): Promise<boolean> {
  if (token.length > 1_024) {
    return false
  }

  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    return false
  }

  const expiresAtMs = Number(parts[1])
  if (
    !Number.isSafeInteger(expiresAtMs) ||
    expiresAtMs <= now ||
    expiresAtMs > now + SESSION_TTL_MS
  ) {
    return false
  }

  const nonce = base64UrlToBytes(parts[2])
  const signature = base64UrlToBytes(parts[3])
  if (!nonce || nonce.byteLength !== 16 || !signature || signature.byteLength !== 32) {
    return false
  }

  const payload = parts.slice(0, 3).join('.')
  const key = await importSessionKey(env.TURNSTILE_SECRET_KEY)
  return crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    sessionMessage(payload, env),
  )
}
