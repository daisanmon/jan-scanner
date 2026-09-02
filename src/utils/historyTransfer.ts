import type {
  HistoryBackup,
  RestoreMode,
  RestoreResult,
  ScanHistoryEntry,
} from '../types/history'
import { isValidJanCode } from './janCode'
import {
  isPoizonHistorySnapshot,
  isPriceHistorySnapshot,
  isSourcingEvaluation,
  createPriceHistorySnapshot,
  isPoizonProductCandidate,
} from './poizonHistory'
import { ALPEN_PRODUCT_ID_PATTERN, normalizeArticleNumber } from '../../shared/alpen'
import { entryLookup, lookupLabel, lookupSourceLabel } from './productLookup'

export const BACKUP_SCHEMA_VERSION = 5
const LEGACY_BACKUP_SCHEMA_VERSIONS = [1, 2, 3, 4]

export type ParsedHistoryBackup = {
  exportedAt: string
  history: ScanHistoryEntry[]
  totalCount: number
  failedCount: number
}

export class HistoryBackupValidationError extends Error {}

const methodLabels = {
  camera: 'カメラ',
  manual: '手入力',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isProductLookup(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === 'jan') {
    return typeof value.janCode === 'string' && isValidJanCode(value.janCode)
  }
  if (value.kind === 'alpen') {
    return typeof value.alpenProductId === 'string' &&
      ALPEN_PRODUCT_ID_PATTERN.test(value.alpenProductId) &&
      (value.alpenUrl === undefined || typeof value.alpenUrl === 'string') &&
      (value.articleNumber === undefined || typeof value.articleNumber === 'string') &&
      (value.brandName === undefined || typeof value.brandName === 'string') &&
      (value.selectedSpuId === undefined || typeof value.selectedSpuId === 'string')
  }
  return value.kind === 'article' &&
    typeof value.articleNumber === 'string' &&
    normalizeArticleNumber(value.articleNumber).length > 0 &&
    (value.brandName === undefined || typeof value.brandName === 'string') &&
    (value.selectedSpuId === undefined || typeof value.selectedSpuId === 'string')
}

export function isHistoryEntry(value: unknown): value is ScanHistoryEntry {
  if (!isRecord(value)) {
    return false
  }

  const aggregationValid =
    value.aggregation === undefined ||
    (isRecord(value.aggregation) &&
      typeof value.aggregation.scanCount === 'number' &&
      Number.isInteger(value.aggregation.scanCount) &&
      value.aggregation.scanCount > 0 &&
      isValidDate(value.aggregation.firstReadAt) &&
      isValidDate(value.aggregation.lastReadAt))

  return (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    ((typeof value.janCode === 'string' && isValidJanCode(value.janCode)) || isProductLookup(value.lookup)) &&
    isValidDate(value.readAt) &&
    (value.method === 'camera' || value.method === 'manual') &&
    (value.poizon === undefined || isPoizonHistorySnapshot(value.poizon)) &&
    (value.priceHistory === undefined ||
      (Array.isArray(value.priceHistory) &&
        value.priceHistory.every(isPriceHistorySnapshot))) &&
    (value.sourcing === undefined || isSourcingEvaluation(value.sourcing)) &&
    aggregationValid &&
    (value.lookupStatus === undefined ||
      ['pending', 'complete', 'error'].includes(String(value.lookupStatus))) &&
    (value.lookupError === undefined || typeof value.lookupError === 'string') &&
    (value.selectionCandidates === undefined ||
      (Array.isArray(value.selectionCandidates) && value.selectionCandidates.every(isPoizonProductCandidate)))
  )
}

function createUniqueId(usedIds: Set<string>): string {
  let id: string

  do {
    id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  } while (usedIds.has(id))

  return id
}

function entriesAreEqual(left: ScanHistoryEntry, right: ScanHistoryEntry) {
  return (
    left.id === right.id &&
    left.janCode === right.janCode &&
    JSON.stringify(left.lookup) === JSON.stringify(right.lookup) &&
    left.readAt === right.readAt &&
    left.method === right.method &&
    JSON.stringify(left.poizon) === JSON.stringify(right.poizon) &&
    JSON.stringify(left.priceHistory) === JSON.stringify(right.priceHistory) &&
    JSON.stringify(left.sourcing) === JSON.stringify(right.sourcing) &&
    JSON.stringify(left.aggregation) === JSON.stringify(right.aggregation) &&
    JSON.stringify(left.selectionCandidates) === JSON.stringify(right.selectionCandidates)
  )
}

function formatFileTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}${get('minute')}${get('second')}`
}

function escapeCsvValue(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value
  }

  return `"${value.replaceAll('"', '""')}"`
}

export function createJsonBackup(history: ScanHistoryEntry[], now = new Date()) {
  const backup: HistoryBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    history,
  }

  return {
    filename: `jan-scanner-backup-${formatFileTimestamp(now)}.json`,
    blob: new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
  }
}

export function createCsvExport(history: ScanHistoryEntry[], now = new Date()) {
  const rows = [
    [
      '検索元',
      '検索値',
      '読取日時',
      '登録方法',
      '商品名',
      'ブランド',
      'spuId',
      '過去30日販売数',
      '仕入れ基準価格中央値',
    ],
    ...history.map((entry) => {
      const product = entry.poizon?.product
      const summary = entry.poizon?.market?.summary
      const sourcing = entry.sourcing ?? entry.poizon?.sourcing
      return [
        lookupSourceLabel(entryLookup(entry)),
        lookupLabel(entryLookup(entry)),
        entry.readAt,
        methodLabels[entry.method],
        product?.title ?? '',
        product?.brandName ?? '',
        product?.spuId ?? '',
        sourcing?.totalSales30d?.toString() ??
          summary?.globalSoldNum30Total?.toString() ?? '',
        sourcing?.benchmarkMedian?.toString() ??
          summary?.referencePrice.median?.toString() ??
          entry.poizon?.price?.asiaMinPrice.toString() ??
          '',
      ]
    }),
  ]
  const csv = rows
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')

  return {
    filename: `jan-scanner-history-${formatFileTimestamp(now)}.csv`,
    blob: new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
  }
}

export async function saveOrShareFile(blob: Blob, filename: string) {
  const file =
    typeof File === 'function'
      ? new File([blob], filename, { type: blob.type })
      : null
  let canShareFile = false

  if (
    file &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      canShareFile = navigator.canShare({ files: [file] })
    } catch {
      canShareFile = false
    }
  }

  if (file && canShareFile) {
    await navigator.share({ files: [file], title: filename })
    return 'shared' as const
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return 'downloaded' as const
}

export function parseHistoryBackup(text: string): ParsedHistoryBackup {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HistoryBackupValidationError(
      'JSONとして解析できないファイルです。',
    )
  }

  if (!isRecord(parsed)) {
    throw new HistoryBackupValidationError(
      'バックアップの形式が正しくありません。',
    )
  }

  if (
    parsed.schemaVersion !== BACKUP_SCHEMA_VERSION &&
    !LEGACY_BACKUP_SCHEMA_VERSIONS.includes(Number(parsed.schemaVersion))
  ) {
    throw new HistoryBackupValidationError(
      '対応していないバックアップ形式です。',
    )
  }

  if (!isValidDate(parsed.exportedAt)) {
    throw new HistoryBackupValidationError(
      'エクスポート日時がないか、形式が正しくありません。',
    )
  }

  if (!Array.isArray(parsed.history)) {
    throw new HistoryBackupValidationError('履歴データがありません。')
  }

  const history = parsed.history.filter(isHistoryEntry).map((entry) => {
    if (entry.priceHistory || !entry.poizon) return entry
    const migrated = createPriceHistorySnapshot(entry.poizon)
    return migrated ? { ...entry, priceHistory: [migrated] } : entry
  })
  const failedCount = parsed.history.length - history.length

  if (parsed.history.length > 0 && history.length === 0) {
    throw new HistoryBackupValidationError(
      '復元できる有効な履歴がありません。',
    )
  }

  return {
    exportedAt: parsed.exportedAt,
    history,
    totalCount: parsed.history.length,
    failedCount,
  }
}

export function restoreHistory(
  currentHistory: ScanHistoryEntry[],
  importedHistory: ScanHistoryEntry[],
  mode: RestoreMode,
  validationFailedCount = 0,
): RestoreResult {
  const baseHistory = mode === 'append' ? currentHistory : []
  const resultEntries: ScanHistoryEntry[] = []
  const usedEntries = new Map(baseHistory.map((entry) => [entry.id, entry]))
  const usedIds = new Set(usedEntries.keys())
  let failedCount = validationFailedCount

  for (const entry of importedHistory) {
    const existing = usedEntries.get(entry.id)

    if (existing && entriesAreEqual(existing, entry)) {
      failedCount += 1
      continue
    }

    const restoredEntry = existing
      ? { ...entry, id: createUniqueId(usedIds) }
      : entry

    resultEntries.push(restoredEntry)
    usedEntries.set(restoredEntry.id, restoredEntry)
    usedIds.add(restoredEntry.id)
  }

  return {
    history:
      mode === 'append' ? [...resultEntries, ...currentHistory] : resultEntries,
    restoredCount: resultEntries.length,
    failedCount,
  }
}
