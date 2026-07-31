import type { ScanHistoryEntry } from '../types/history'

type ScanHistoryProps = {
  history: ScanHistoryEntry[]
  onDelete: (id: string) => void
  onClear: () => void
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

export function ScanHistory({ history, onDelete, onClear }: ScanHistoryProps) {
  const handleClear = () => {
    if (window.confirm('読み取り履歴をすべて削除しますか？')) {
      onClear()
    }
  }

  return (
    <section className="feature-card history-card" aria-labelledby="history-title">
      <div className="feature-heading history-heading">
        <div>
          <p className="eyebrow">SCAN HISTORY</p>
          <h2 id="history-title">読み取り履歴</h2>
        </div>
        <button
          type="button"
          className="text-button text-button--danger"
          onClick={handleClear}
          disabled={history.length === 0}
        >
          すべて削除
        </button>
      </div>

      {history.length === 0 ? (
        <p className="history-empty">読み取り履歴はまだありません。</p>
      ) : (
        <ol className="history-list">
          {history.map((entry) => (
            <li key={entry.id} className="history-item">
              <div className="history-item-content">
                <code>{entry.janCode}</code>
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
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
