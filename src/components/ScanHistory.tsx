import { useState, type FormEvent, type ReactNode } from 'react'
import type { ScanHistoryEntry } from '../types/history'
import { ProductImage } from './ProductImage'
import { SizeEvaluationDetails } from './SourcingViews'
import {
  getEntryEvaluation,
  sourcingStatusLabels,
} from '../utils/sourcingDisplay'
import { entryLookup, lookupLabel, lookupSourceLabel } from '../utils/productLookup'

type ScanHistoryProps = {
  history: ScanHistoryEntry[]
  onDelete: (id: string) => void
  onClear: () => void
  onRetry?: (id: string) => void
  onRetryAll?: () => void
  onRefresh?: (id: string) => void
  onSelectCandidate?: (id: string, spuId: string) => void
  onUpdateArticle?: (id: string, articleNumber: string) => void
  onForgetSelection?: (id: string) => void
  management?: ReactNode
}

function ReviewActions({
  entry,
  onSelectCandidate,
  onUpdateArticle,
}: {
  entry: ScanHistoryEntry
  onSelectCandidate?: (id: string, spuId: string) => void
  onUpdateArticle?: (id: string, articleNumber: string) => void
}) {
  const lookup = entryLookup(entry)
  const [article, setArticle] = useState(
    lookup.kind === 'jan' ? '' : lookup.articleNumber ?? entry.poizon?.product?.articleNumber ?? '',
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (article.trim()) onUpdateArticle?.(entry.id, article.trim())
  }
  return (
    <div className="history-review-actions">
      {entry.selectionCandidates && entry.selectionCandidates.length > 0 && (
        <ul className="poizon-candidates">
          {entry.selectionCandidates.map((candidate) => (
            <li key={candidate.spuId}>
              <button type="button" onClick={() => onSelectCandidate?.(entry.id, candidate.spuId)}>
                <ProductImage imageUrl={candidate.imageUrl} size="compact" />
                <span className="poizon-candidate-copy">
                  <strong>{candidate.articleNumber || '型番未取得'}</strong>
                  <span>{candidate.title || `SPU ${candidate.spuId}`}</span>
                  <small>{candidate.brandName}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lookup.kind !== 'jan' && onUpdateArticle && (
        <form className="article-correction" onSubmit={submit}>
          <label htmlFor={`article-${entry.id}`}>型番を修正して再検索</label>
          <div className="manual-input-row">
            <input id={`article-${entry.id}`} value={article} onChange={(event) => setArticle(event.target.value)} placeholder="例: MS327 CWB" />
            <button type="submit" className="text-button">再検索</button>
          </div>
        </form>
      )}
    </div>
  )
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
  onRetryAll,
  onRefresh,
  onSelectCandidate,
  onUpdateArticle,
  onForgetSelection,
  management,
}: ScanHistoryProps) {
  const spuCounts = new Map<string, number>()
  for (const entry of history) {
    const spuId = entry.poizon?.product?.spuId
    if (spuId) spuCounts.set(spuId, (spuCounts.get(spuId) ?? 0) + 1)
  }
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
      {onRetryAll && history.some((entry) => entry.lookupStatus === 'error') && (
        <button type="button" className="text-button history-retry-all" onClick={onRetryAll}>
          通信失敗を一括再試行
        </button>
      )}

        {history.length === 0 ? (
          <p className="history-empty">読み取り履歴はまだありません。</p>
        ) : (
          <ol className="history-list">
            {history.map((entry) => {
              const lookup = entryLookup(entry)
              const label = lookupLabel(lookup)
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
                    <code>{label}</code>
                    <span className={`history-status history-status--${evaluation?.status ?? 'pending'}`}>{status}</span>
                    <div className="history-meta">
                      <span className={`method-badge method-badge--${lookup.kind}`}>{lookupSourceLabel(lookup)}</span>
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
                    aria-label={`${label}の履歴を削除`}
                  >
                    削除
                  </button>
                </div>
                {entry.poizon?.product && (
                  <div className="history-product">
                    <ProductImage
                      imageUrl={entry.poizon.product.imageUrl}
                      size="compact"
                    />
                    <p className="history-product-title">
                      {entry.poizon.product.title || `SPU ${entry.poizon.product.spuId}`}
                      {(spuCounts.get(entry.poizon.product.spuId) ?? 0) > 1 && <span className="same-product-badge">同一商品あり</span>}
                    </p>
                  </div>
                )}
                {entry.lookupError && <p className="history-error-note">{entry.lookupError}</p>}
                {entry.lookupStatus === 'error' && onRetry && (
                  <button type="button" className="text-button" onClick={() => onRetry(entry.id)}>
                    再試行
                  </button>
                )}
                {(entry.selectionCandidates?.length || lookup.kind !== 'jan') && (
                  <ReviewActions entry={entry} onSelectCandidate={onSelectCandidate} onUpdateArticle={onUpdateArticle} />
                )}
                {lookup.kind !== 'jan' && lookup.selectedSpuId && onForgetSelection && (
                  <button type="button" className="text-button" onClick={() => onForgetSelection(entry.id)}>
                    確定したPOIZON対応を解除
                  </button>
                )}
                {entry.poizon && onRefresh && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={entry.lookupStatus === 'pending'}
                    onClick={() => onRefresh(entry.id)}
                  >
                    {entry.lookupStatus === 'pending' ? '価格を更新中…' : '価格を更新'}
                  </button>
                )}
                {evaluation && evaluation.sizes.length > 0 && (
                  <SizeEvaluationDetails
                    evaluation={evaluation}
                    warnings={entry.poizon?.market?.warnings}
                  />
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
