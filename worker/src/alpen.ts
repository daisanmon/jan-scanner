import { canonicalAlpenProductUrl } from '../../shared/alpen'
import { ApiError } from './errors'

const ALPEN_TIMEOUT_MS = 7_000
const MAX_ALPEN_HTML_BYTES = 2_000_000

export type AlpenProductDetails = {
  productId: string
  url: string
  productName: string
  articleNumber: string
  brandName?: string
}

function readJsonString(html: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`['"]${escapedKey}['"]\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`, 'i'))
  if (!match) return null
  try {
    const value = JSON.parse(match[1])
    return typeof value === 'string' && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function readMeta(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const property = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]
    if (property?.toLowerCase() !== name.toLowerCase()) continue
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]
    if (content?.trim()) return decodeHtml(content.trim())
  }
  return null
}

export function deriveArticleNumber(productName: string): string {
  const tokens = productName.normalize('NFKC').trim().split(/\s+/)
  if (tokens.length > 1 && /^(?:D|[2346]?E|WIDE|X-WIDE|EXTRA-WIDE)$/i.test(tokens.at(-1) ?? '')) {
    tokens.pop()
  }
  return tokens.join(' ').trim()
}

export function parseAlpenProductPage(
  html: string,
  productId: string,
  url = canonicalAlpenProductUrl(productId),
): AlpenProductDetails {
  const productName =
    readJsonString(html, 'item_name') ??
    readJsonString(html, 'product_name') ??
    readMeta(html, 'og:title')?.split(/[｜|]/)[0]?.trim() ??
    ''
  const brandName =
    readJsonString(html, 'item_brand') ??
    readJsonString(html, 'brand_name') ??
    undefined
  const categories = [
    readJsonString(html, 'item_category'),
    readJsonString(html, 'item_category2'),
    readJsonString(html, 'item_category3'),
  ].filter((value): value is string => Boolean(value))

  if (categories.length > 0 && !categories.some((value) => /シューズ|靴|スニーカー|shoe|footwear/i.test(value))) {
    throw new ApiError(
      422,
      'INVALID_ALPEN_PRODUCT',
      '初期版のAlpen QR検索はシューズ商品のみ対応しています。',
      false,
    )
  }
  const articleNumber = deriveArticleNumber(productName)
  if (!productName || articleNumber.length < 2 || articleNumber.length > 100) {
    throw new ApiError(
      422,
      'INVALID_ALPEN_PRODUCT',
      'Alpen商品ページから型番を取得できませんでした。型番を手動入力してください。',
      false,
    )
  }

  return { productId, url, productName, articleNumber, ...(brandName ? { brandName } : {}) }
}

export async function fetchAlpenProduct(
  productId: string,
  fetcher: typeof fetch = fetch,
): Promise<AlpenProductDetails> {
  const url = canonicalAlpenProductUrl(productId)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ALPEN_TIMEOUT_MS)
  try {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let currentUrl = url
        let response: Response | null = null
        for (let redirectCount = 0; redirectCount < 3; redirectCount += 1) {
          response = await fetcher(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: { Accept: 'text/html,application/xhtml+xml' },
          })
          if (response.status < 300 || response.status >= 400) break
          const location = response.headers.get('Location')
          if (!location) {
            throw new ApiError(502, 'POIZON_BAD_RESPONSE', 'Alpen商品ページの転送先を確認できません。', true)
          }
          const nextUrl = new URL(location, currentUrl)
          if (nextUrl.protocol !== 'https:' || nextUrl.hostname !== 'store.alpen-group.jp') {
            throw new ApiError(422, 'INVALID_ALPEN_PRODUCT', 'Alpen公式外への転送は処理できません。', false)
          }
          currentUrl = nextUrl.toString()
          response = null
        }
        if (!response) {
          throw new ApiError(502, 'POIZON_BAD_RESPONSE', 'Alpen商品ページの転送回数が多すぎます。', true)
        }
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) continue
          throw new ApiError(502, 'POIZON_UNAVAILABLE', 'Alpen商品ページを取得できませんでした。', true)
        }
        const html = await response.text()
        if (new TextEncoder().encode(html).byteLength > MAX_ALPEN_HTML_BYTES) {
          throw new ApiError(502, 'POIZON_BAD_RESPONSE', 'Alpen商品ページが大きすぎます。', true)
        }
        return parseAlpenProductPage(html, productId, url)
      } catch (error) {
        if (error instanceof ApiError && !error.retryable) throw error
        lastError = error
        if (attempt === 0) continue
      }
    }
    if (lastError instanceof ApiError) throw lastError
    throw new ApiError(502, 'POIZON_UNAVAILABLE', 'Alpen商品ページへ接続できませんでした。', true)
  } finally {
    clearTimeout(timeoutId)
  }
}
