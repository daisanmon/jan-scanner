export const POIZON_PUBLIC_CONFIG = {
  enabled: true,
  apiBaseUrl: 'https://sprite-rehire-undercook.ngrok-free.dev',
  turnstileSiteKey: '0x4AAAAAAEF-AtidcEXDe8AA',
} as const

export function isPoizonPublicConfigReady(): boolean {
  return (
    POIZON_PUBLIC_CONFIG.enabled &&
    POIZON_PUBLIC_CONFIG.apiBaseUrl.startsWith('https://') &&
    POIZON_PUBLIC_CONFIG.turnstileSiteKey.length > 0
  )
}
