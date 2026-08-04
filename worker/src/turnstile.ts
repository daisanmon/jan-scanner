import type { WorkerEnv } from './env'
import { ApiError } from './errors'

type TurnstileResponse = {
  success?: boolean
  hostname?: string
  action?: string
}

export async function validateTurnstile(
  token: string,
  requestId: string,
  remoteIp: string | null,
  env: WorkerEnv,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await fetcher(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: remoteIp ?? undefined,
          idempotency_key: requestId,
        }),
        signal: controller.signal,
      },
    )
    const result = (await response.json()) as TurnstileResponse
    if (
      !response.ok ||
      result.success !== true ||
      result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME ||
      result.action !== env.TURNSTILE_EXPECTED_ACTION
    ) {
      throw new ApiError(
        403,
        'TURNSTILE_FAILED',
        'ブラウザの確認に失敗しました。もう一度お試しください。',
        true,
      )
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(
      503,
      'TURNSTILE_UNAVAILABLE',
      'ブラウザの確認サービスへ接続できませんでした。',
      true,
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
