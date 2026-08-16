import type { ReactNode } from 'react'
import type { ScanHistoryEntry } from '../types/history'
import { SizeEvaluationDetails } from './SourcingViews'
import {
  getEntryEvaluation,
  sourcingStatusLabels,
} from '../utils/sourcingDisplay'

type ScanHistoryProps = {
  history: ScanHistoryEntry[]
  onDelete: (id: string) => void
  onClear: () => void
  onRetry?: (id: string) => void
  management?: ReactNode
}

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const methodLabels = {
  camera: 'カメラ',
  manual: '手入力',
} as const

export function ScanHistory({
  history,
  onDelete,
  onClear,
  onRetry,
  management,
}: ScanHistoryProps) {
  const handleClear = () => {
    if (window.confirm('読み取り履歴をすべて削除しますか？')) {
      onClear()
    }
  }

  return (
    <section className="history-card" aria-labelledby="history-title">
      <div className="section-heading">
        <div><p className="eyebrow">SCAN HISTORY</p><h2 id="history-title">履歴</h2></div>
        <span className="history-count">{history.length}件</span>
      </div>

        {history.length === 0 ? (
          <p className="history-empty">読み取り履歴はまだありません。</p>
        ) : (
          <ol className="history-list">
            {history.map((entry) => {
              const evaluation = getEntryEvaluation(entry)
              const status = entry.lookupStatus === 'pending'
                ? '照会中'
                : evaluation
                  ? sourcingStatusLabels[evaluation.status]
                  : '要確認'
              return (
              <li key={entry.id} className="history-item">
                <div className="history-item-heading">
                  <div className="history-item-content">
                    <code>{entry.janCode}</code>
                    <span className={`history-status history-status--${evaluation?.status ?? 'pending'}`}>{status}</span>
                    <div className="history-meta">
                      <time dateTime={entry.readAt}>
                        {dateTimeFormatter.format(new Date(entry.readAt))}
                      </time>
                      <span className={`method-badge method-badge--${entry.method}`}>
                        {methodLabels[entry.method]}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => onDelete(entry.id)}
                    aria-label={`${entry.janCode}の履歴を削除`}
                  >
                    削除
                  </button>
                </div>
                {entry.poizon?.product && (
                  <p className="history-product-title">{entry.poizon.product.title}</p>
                )}
                {entry.lookupError && <p className="history-error-note">{entry.lookupError}</p>}
                {entry.lookupStatus === 'error' && onRetry && (
                  <button type="button" className="text-button" onClick={() => onRetry(entry.id)}>
                    再試行
                  </button>
                )}
                {evaluation && evaluation.sizes.length > 0 && (
                  <SizeEvaluationDetails evaluation={evaluation} />
                )}
              </li>
              )
            })}
          </ol>
        )}
      <details className="history-management">
        <summary>履歴の管理</summary>
        {management}
        <button
          type="button"
          className="text-button text-button--danger"
          onClick={handleClear}
          disabled={history.length === 0}
        >
          全件削除
        </button>
      </details>
    </section>
  )
}
