import { useCallback, useMemo, useRef, useState } from 'react'
import { useJanHistory } from '../hooks/useJanHistory'
import { JanScanner } from './JanScanner'
import { ManualEntry } from './ManualEntry'
import { ScanHistory } from './ScanHistory'
import { HistoryBackup } from './HistoryBackup'
import {
  PoizonLookupPanel,
  type PoizonLookupTarget,
} from './PoizonLookupPanel'
import type { RegistrationMethod } from '../types/history'
import { evaluateSourcingMarket } from '../utils/sourcingEvaluation'
import { CandidateCard } from './SourcingViews'
import { getEntryEvaluation } from '../utils/sourcingDisplay'

type AppTab = 'scan' | 'candidates' | 'history'

type RecentResult = {
  janCode: string
  label: string
  tone: 'pending' | 'candidate' | 'neutral' | 'error'
}

export function JanScannerPage() {
  const [activeTab, setActiveTab] = useState<AppTab>('scan')
  const [lookupQueue, setLookupQueue] = useState<PoizonLookupTarget[]>([])
  const [recentResult, setRecentResult] = useState<RecentResult | null>(null)
  const sequenceRef = useRef(0)
  const recentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const {
    history,
    storageWarning,
    registerScan,
    savePoizonResult,
    saveLookupReview,
    saveLookupError,
    retryLookup,
    deleteEntry,
    clearHistory,
    restoreEntries,
    dismissStorageWarning,
  } = useJanHistory()

  const showRecent = useCallback((result: RecentResult) => {
    setRecentResult(result)
    if (recentTimerRef.current) clearTimeout(recentTimerRef.current)
    recentTimerRef.current = setTimeout(() => setRecentResult(null), 4_000)
  }, [])

  const enqueueLookup = useCallback((janCode: string, historyEntryId: string) => {
    sequenceRef.current += 1
    const target = { janCode, historyEntryId, sequence: sequenceRef.current }
    setLookupQueue((current) =>
      current.some((item) => item.historyEntryId === historyEntryId)
        ? current
        : [...current, target],
    )
    showRecent({ janCode, label: '照会中', tone: 'pending' })
  }, [showRecent])

  const register = useCallback((janCode: string, method: RegistrationMethod) => {
    const result = registerScan(janCode, method)
    if (result.shouldLookup) enqueueLookup(janCode, result.id)
    else showRecent({ janCode, label: 'スキャン回数を更新', tone: 'neutral' })
  }, [enqueueLookup, registerScan, showRecent])

  const handleCameraRegister = useCallback(
    (janCode: string) => register(janCode, 'camera'),
    [register],
  )

  const handleManualRegister = useCallback(
    (janCode: string) => {
      register(janCode, 'manual')
    },
    [register],
  )

  const handleLookupComplete = useCallback(
    (
      target: PoizonLookupTarget,
      response: Parameters<typeof savePoizonResult>[1],
    ) => {
      if (target.historyEntryId) {
        savePoizonResult(target.historyEntryId, response)
      }
      const evaluation = response.state === 'not_found'
        ? null
        : evaluateSourcingMarket(response.market)
      const label = response.state === 'not_found'
        ? '商品が見つかりません'
        : evaluation?.status === 'candidate'
          ? '候補に追加'
          : evaluation?.status === 'no_sales'
            ? '販売実績なし'
            : '要確認'
      showRecent({
        janCode: target.janCode,
        label,
        tone: evaluation?.status === 'candidate' ? 'candidate' : 'neutral',
      })
      setLookupQueue((current) => current.filter((item) => item.sequence !== target.sequence))
    },
    [savePoizonResult, showRecent],
  )

  const handleLookupReview = useCallback((target: PoizonLookupTarget, message: string) => {
    if (target.historyEntryId) saveLookupReview(target.historyEntryId, message)
    showRecent({ janCode: target.janCode, label: '要確認', tone: 'neutral' })
    setLookupQueue((current) => current.filter((item) => item.sequence !== target.sequence))
  }, [saveLookupReview, showRecent])

  const handleLookupError = useCallback((target: PoizonLookupTarget, message: string) => {
    if (target.historyEntryId) saveLookupError(target.historyEntryId, message)
    showRecent({ janCode: target.janCode, label: '照会に失敗しました', tone: 'error' })
    setLookupQueue((current) => current.filter((item) => item.sequence !== target.sequence))
  }, [saveLookupError, showRecent])

  const handleRetry = useCallback((id: string) => {
    const entry = retryLookup(id)
    if (entry) enqueueLookup(entry.janCode, entry.id)
  }, [enqueueLookup, retryLookup])

  const candidateHistory = useMemo(
    () => history.filter((entry) => getEntryEvaluation(entry)?.status === 'candidate'),
    [history],
  )
  const scanCount = history.reduce(
    (total, entry) => total + (entry.aggregation?.scanCount ?? 1),
    0,
  )
  const lookupTarget = lookupQueue[0] ?? null

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

      <div className="tab-panel scan-tab" hidden={activeTab !== 'scan'}>
          <div className="scan-dashboard-heading">
            <div><p className="eyebrow">STORE RESEARCH</p><h1>連続スキャン</h1></div>
            <dl className="scan-counters">
              <div><dt>スキャン</dt><dd>{scanCount}</dd></div>
              <div><dt>照会中</dt><dd>{lookupQueue.length}</dd></div>
              <div><dt>候補</dt><dd>{candidateHistory.length}</dd></div>
            </dl>
          </div>
          <JanScanner onRegister={handleCameraRegister} />
          {recentResult && (
            <div className={`recent-result recent-result--${recentResult.tone}`} role="status">
              <span>{recentResult.label}</span><code>{recentResult.janCode}</code>
            </div>
          )}
          <div className="lookup-queue-panel">
            <p>POIZON照会は1件ずつ順番に処理します。カメラはそのまま連続して読み取れます。</p>
            <PoizonLookupPanel
              key={lookupTarget?.sequence ?? 'poizon-initial'}
              target={lookupTarget}
              onLookupComplete={handleLookupComplete}
              onLookupReview={handleLookupReview}
              onLookupError={handleLookupError}
            />
          </div>
          <ManualEntry onRegister={handleManualRegister} />
      </div>

      {activeTab === 'candidates' && (
        <section className="tab-panel candidate-tab" aria-labelledby="candidate-title">
          <div className="section-heading"><div><p className="eyebrow">SOURCING</p><h1 id="candidate-title">候補</h1></div><span>{candidateHistory.length}件</span></div>
          {candidateHistory.length === 0
            ? <p className="empty-panel">候補はまだありません。</p>
            : <div className="candidate-list">{candidateHistory.map((entry) => <CandidateCard key={entry.id} entry={entry} />)}</div>}
        </section>
      )}

      {activeTab === 'history' && (
        <div className="tab-panel history-tab">
          <ScanHistory
            history={history}
            onDelete={deleteEntry}
            onClear={clearHistory}
            onRetry={handleRetry}
            management={<HistoryBackup history={history} onRestore={restoreEntries} />}
          />
        </div>
      )}

      <nav className="bottom-nav" aria-label="メインナビゲーション">
        {([
          ['scan', '⌁', 'スキャン'],
          ['candidates', '☆', '候補'],
          ['history', '◷', '履歴'],
        ] as const).map(([tab, icon, label]) => (
          <button key={tab} type="button" className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)} aria-current={activeTab === tab ? 'page' : undefined}>
            <span aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  )
}
