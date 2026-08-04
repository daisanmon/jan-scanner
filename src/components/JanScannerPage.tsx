import { useCallback, useState } from 'react'
import { useJanHistory } from '../hooks/useJanHistory'
import { JanScanner } from './JanScanner'
import { ManualEntry } from './ManualEntry'
import { ScanHistory } from './ScanHistory'
import { HistoryBackup } from './HistoryBackup'
import {
  PoizonLookupPanel,
  type PoizonLookupTarget,
} from './PoizonLookupPanel'

export function JanScannerPage() {
  const [lookupTarget, setLookupTarget] = useState<PoizonLookupTarget | null>(null)
  const {
    history,
    storageWarning,
    addEntry,
    deleteEntry,
    clearHistory,
    restoreEntries,
    dismissStorageWarning,
  } = useJanHistory()

  const handleCameraRegister = useCallback(
    (janCode: string) => {
      addEntry(janCode, 'camera')
      setLookupTarget((current) => ({
        janCode,
        sequence: (current?.sequence ?? 0) + 1,
      }))
    },
    [addEntry],
  )

  const handleManualRegister = useCallback(
    (janCode: string) => {
      addEntry(janCode, 'manual')
      setLookupTarget((current) => ({
        janCode,
        sequence: (current?.sequence ?? 0) + 1,
      }))
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
      <PoizonLookupPanel
        key={lookupTarget?.sequence ?? 'poizon-initial'}
        target={lookupTarget}
      />
      <HistoryBackup history={history} onRestore={restoreEntries} />
      <ScanHistory
        history={history}
        onDelete={deleteEntry}
        onClear={clearHistory}
      />
    </div>
  )
}
