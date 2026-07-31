import { useRef, useState, type ChangeEvent } from 'react'
import type {
  RestoreMode,
  RestoreResult,
  ScanHistoryEntry,
} from '../types/history'
import {
  createCsvExport,
  createJsonBackup,
  HistoryBackupValidationError,
  parseHistoryBackup,
  saveOrShareFile,
  type ParsedHistoryBackup,
} from '../utils/historyTransfer'

type HistoryBackupProps = {
  history: ScanHistoryEntry[]
  onRestore: (
    entries: ScanHistoryEntry[],
    mode: RestoreMode,
    validationFailedCount: number,
  ) => RestoreResult
}

type PendingRestore = ParsedHistoryBackup & {
  filename: string
}

function getOperationError(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return null
  }

  return error instanceof HistoryBackupValidationError
    ? error.message
    : fallback
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

export function HistoryBackup({ history, onRestore }: HistoryBackupProps) {
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('append')
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const exportFile = async (format: 'json' | 'csv') => {
    setMessage(null)
    setErrorMessage(null)

    try {
      const output =
        format === 'json'
          ? createJsonBackup(history)
          : createCsvExport(history)
      const action = await saveOrShareFile(output.blob, output.filename)
      setMessage(
        action === 'shared'
          ? `${format.toUpperCase()}ファイルを共有しました。`
          : `${format.toUpperCase()}ファイルを保存しました。`,
      )
    } catch (error) {
      const operationError = getOperationError(
        error,
        'ファイルを書き出せませんでした。',
      )
      if (operationError) {
        setErrorMessage(operationError)
      }
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''

    if (!file) {
      return
    }

    setMessage(null)
    setErrorMessage(null)

    try {
      const backup = parseHistoryBackup(await file.text())
      setPendingRestore({ ...backup, filename: file.name })
    } catch (error) {
      setPendingRestore(null)
      setErrorMessage(
        getOperationError(error, 'バックアップを読み込めませんでした。'),
      )
    }
  }

  const confirmRestore = () => {
    if (!pendingRestore) {
      return
    }

    const result = onRestore(
      pendingRestore.history,
      restoreMode,
      pendingRestore.failedCount,
    )
    setPendingRestore(null)
    setErrorMessage(null)
    setMessage(
      `復元件数：${result.restoredCount}件、失敗件数：${result.failedCount}件`,
    )
  }

  return (
    <section className="feature-card backup-card" aria-labelledby="backup-title">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">BACKUP &amp; RESTORE</p>
          <h2 id="backup-title">履歴のバックアップ</h2>
        </div>
      </div>

      <div className="backup-actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => void exportFile('json')}
        >
          JSONを書き出す
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void exportFile('csv')}
        >
          CSVを書き出す
        </button>
      </div>

      <fieldset className="restore-mode">
        <legend>復元方法</legend>
        <label>
          <input
            type="radio"
            name="restore-mode"
            value="append"
            checked={restoreMode === 'append'}
            onChange={() => setRestoreMode('append')}
          />
          既存履歴へ追加
        </label>
        <label>
          <input
            type="radio"
            name="restore-mode"
            value="replace"
            checked={restoreMode === 'replace'}
            onChange={() => setRestoreMode('replace')}
          />
          すべて置き換え
        </label>
      </fieldset>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleFileChange(event)}
      />
      <button
        type="button"
        className="button button--secondary backup-import-button"
        onClick={() => fileInputRef.current?.click()}
      >
        JSONファイルを選択
      </button>
      <p className="backup-note">
        ファイルへのアクセスは、このボタンを押したときだけ要求します。
      </p>

      {message && (
        <p className="operation-message" role="status">
          {message}
        </p>
      )}
      {errorMessage && (
        <p className="operation-message operation-message--error" role="alert">
          {errorMessage}
        </p>
      )}

      {pendingRestore && (
        <div className="confirm-backdrop">
          <section
            className="restore-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-confirm-title"
          >
            <p className="eyebrow">RESTORE CONFIRMATION</p>
            <h3 id="restore-confirm-title">履歴を復元しますか？</h3>
            <dl>
              <div>
                <dt>ファイル</dt>
                <dd>{pendingRestore.filename}</dd>
              </div>
              <div>
                <dt>復元方法</dt>
                <dd>
                  {restoreMode === 'append'
                    ? '既存履歴へ追加'
                    : 'すべて置き換え'}
                </dd>
              </div>
              <div>
                <dt>バックアップ日時</dt>
                <dd>
                  {dateTimeFormatter.format(
                    new Date(pendingRestore.exportedAt),
                  )}
                </dd>
              </div>
              <div>
                <dt>有効な履歴</dt>
                <dd>{pendingRestore.history.length}件</dd>
              </div>
              <div>
                <dt>不正な履歴</dt>
                <dd>{pendingRestore.failedCount}件</dd>
              </div>
            </dl>
            {restoreMode === 'replace' && (
              <p className="replace-warning">
                現在の履歴はすべて置き換えられます。
              </p>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setPendingRestore(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={confirmRestore}
              >
                復元する
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
