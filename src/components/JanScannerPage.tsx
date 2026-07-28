import { useCallback } from 'react'
import { useJanHistory } from '../hooks/useJanHistory'
import { JanScanner } from './JanScanner'
import { ManualEntry } from './ManualEntry'
import { ScanHistory } from './ScanHistory'

export function JanScannerPage() {
  const {
    history,
    storageWarning,
    addEntry,
    deleteEntry,
    clearHistory,
    dismissStorageWarning,
  } = useJanHistory()

  const handleCameraRegister = useCallback(
    (janCode: string) => {
      addEntry(janCode, 'camera')
    },
    [addEntry],
  )

  const handleManualRegister = useCallback(
    (janCode: string) => {
      addEntry(janCode, 'manual')
    },
    [addEntry],
  )

  return (
    <div className="scanner-page">
      {storageWarning && (
        <div className="storage-warning" role="alert">
          <p>{storageWarning}</p>
          <button type="button" onClick={dismissStorageWarning}>
            閉じる
          </button>
        </div>
      )}

      <JanScanner onRegister={handleCameraRegister} />
      <ManualEntry onRegister={handleManualRegister} />
      <ScanHistory
        history={history}
        onDelete={deleteEntry}
        onClear={clearHistory}
      />
    </div>
  )
}
