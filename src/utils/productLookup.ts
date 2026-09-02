import { extractAlpenProductId, normalizeArticleNumber } from '../../shared/alpen'
import type { PoizonLookupContext } from '../../shared/poizon'
import type { ProductLookup, ScanHistoryEntry } from '../types/history'
import type { PoizonLookupInput } from '../services/poizonApi'

export function lookupKey(lookup: ProductLookup): string {
  if (lookup.kind === 'jan') return `jan:${lookup.janCode}`
  if (lookup.kind === 'alpen') return `alpen:${lookup.alpenProductId}`
  return `article:${normalizeArticleNumber(lookup.articleNumber)}`
}

export function lookupLabel(lookup: ProductLookup): string {
  if (lookup.kind === 'jan') return lookup.janCode
  if (lookup.kind === 'alpen') return lookup.alpenProductId
  return lookup.articleNumber
}

export function lookupSourceLabel(lookup: ProductLookup): string {
  if (lookup.kind === 'jan') return 'JAN'
  if (lookup.kind === 'alpen') return 'Alpen QR'
  return 'メーカー型番'
}

export function entryLookup(entry: ScanHistoryEntry): ProductLookup {
  return entry.lookup ?? { kind: 'jan', janCode: entry.janCode ?? '' }
}

export function toPoizonLookupInput(lookup: ProductLookup): PoizonLookupInput {
  if (lookup.kind === 'jan') return { janCode: lookup.janCode }
  if (lookup.kind === 'article') {
    return {
      articleNumber: lookup.articleNumber,
      ...(lookup.brandName ? { brandName: lookup.brandName } : {}),
    }
  }
  if (lookup.articleNumber) {
    return {
      articleNumber: lookup.articleNumber,
      ...(lookup.brandName ? { brandName: lookup.brandName } : {}),
    }
  }
  return {
    alpenProductId: lookup.alpenProductId,
    ...(lookup.alpenUrl ? { alpenUrl: lookup.alpenUrl } : {}),
  }
}

export function lookupFromPoizonContext(
  current: ProductLookup,
  context: PoizonLookupContext | undefined,
): ProductLookup {
  if (!context || context.kind === 'jan') return current
  if (context.alpenProductId || current.kind === 'alpen') {
    return {
      kind: 'alpen',
      alpenProductId: context.alpenProductId ?? (current.kind === 'alpen' ? current.alpenProductId : ''),
      ...((context.alpenUrl ?? (current.kind === 'alpen' ? current.alpenUrl : undefined))
        ? { alpenUrl: context.alpenUrl ?? (current.kind === 'alpen' ? current.alpenUrl : undefined) }
        : {}),
      articleNumber: context.articleNumber,
      ...(context.brandName ? { brandName: context.brandName } : {}),
      ...(current.kind === 'alpen' && current.selectedSpuId
        ? { selectedSpuId: current.selectedSpuId }
        : {}),
    }
  }
  return {
    kind: 'article',
    articleNumber: context.articleNumber,
    ...(context.brandName ? { brandName: context.brandName } : {}),
    ...(current.kind === 'article' && current.selectedSpuId
      ? { selectedSpuId: current.selectedSpuId }
      : {}),
  }
}

export function parseAlpenLookup(
  value: string,
): Extract<ProductLookup, { kind: 'alpen' }> | null {
  const productId = extractAlpenProductId(value)
  if (!productId) return null
  const trimmed = value.trim()
  return {
    kind: 'alpen',
    alpenProductId: productId,
    ...(trimmed.startsWith('https://') ? { alpenUrl: trimmed } : {}),
  }
}
