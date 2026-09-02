export const ALPEN_HOSTNAME = 'store.alpen-group.jp'
export const ALPEN_PRODUCT_ID_PATTERN = /^\d{10}$/

export function extractAlpenProductId(value: string): string | null {
  const trimmed = value.trim()
  if (ALPEN_PRODUCT_ID_PATTERN.test(trimmed)) return trimmed

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' || url.hostname !== ALPEN_HOSTNAME) return null
    const landingId = url.searchParams.get('alpHinban')
    if (landingId && ALPEN_PRODUCT_ID_PATTERN.test(landingId)) return landingId
    const pid = url.searchParams.get('pid')?.split('-')[0]
    return pid && ALPEN_PRODUCT_ID_PATTERN.test(pid) ? pid : null
  } catch {
    return null
  }
}

export function canonicalAlpenProductUrl(productId: string): string {
  if (!ALPEN_PRODUCT_ID_PATTERN.test(productId)) {
    throw new Error('Invalid Alpen product ID')
  }
  return `https://${ALPEN_HOSTNAME}/Form/Product/ProductDetail.aspx?pid=${productId}-0001`
}

export function normalizeArticleNumber(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeBrandName(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '')
}
