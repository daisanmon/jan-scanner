import type { ScanHistoryEntry } from '../types/history'
import type { PoizonSize } from '../types/poizon'

export const sourcingStatusLabels = {
  candidate: '候補',
  no_sales: '販売実績なし',
  review: '要確認',
  not_found: '一致商品なし',
  error: '照会エラー',
} as const

export function getEntryEvaluation(entry: ScanHistoryEntry) {
  return entry.sourcing ?? entry.poizon?.sourcing
}

export function displaySizes(sizes: PoizonSize[]): string {
  const jp = sizes.find(({ system }) => system === 'JP')
  if (jp) return `${jp.value}cm`
  return sizes.length > 0
    ? sizes.map(({ system, value }) => `${system} ${value}`).join(' / ')
    : '—'
}
