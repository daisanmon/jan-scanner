import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useSourcingSettings } from '../hooks/useSourcingSettings'
import { SourcingSettings } from './SourcingSettings'
import { AlpenQrScanner } from './AlpenQrScanner'
import { AlpenManualEntry } from './AlpenManualEntry'
import type { ProductLookup } from '../types/history'
import { entryLookup, lookupLabel, parseAlpenLookup } from '../utils/productLookup'
import { playScanFeedback } from '../utils/scanFeedback'
import type { PoizonLookupContext, PoizonProductCandidate } from '../../shared/poizon'

type AppTab = 'scan' | 'candidates' | 'history' | 'settings'
type ScanMode = 'jan' | 'alpen'

type RecentResult = {
  value: string
  label: string
  tone: 'pending' | 'candidate' | 'neutral' | 'error'
}

export function JanScannerPage() {
  const [activeTab, setActiveTab] = useState<AppTab>('scan')
  const [scanMode, setScanMode] = useState<ScanMode>('jan')
  const [feedbackEnabled, setFeedbackEnabled] = useState(() => localStorage.getItem('jan-pocket:scan-feedback') !== 'off')
  const [lookupQueue, setLookupQueue] = useState<PoizonLookupTarget[]>([])
  const [recentResult, setRecentResult] = useState<RecentResult | null>(null)
  const sequenceRef = useRef(0)
  const recentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { settings, setSettings, resetSettings } = useSourcingSettings()
  const {
    history,
    storageWarning,
    registerScan,
    registerLookup,
    savePoizonResult,
    saveLookupReview,
    saveLookupError,
    retryLookup,
    requestRefresh,
    selectLookupCandidate,
    updateLookupArticle,
    forgetLookupSelection,
    deleteEntry,
    clearHistory,
    restoreEntries,
    dismissStorageWarning,
  } = useJanHistory(settings)

  useEffect(() => {
    localStorage.setItem('jan-pocket:scan-feedback', feedbackEnabled ? 'on' : 'off')
  }, [feedbackEnabled])

  const showRecent = useCallback((result: RecentResult) => {
    setRecentResult(result)
    if (recentTimerRef.current) clearTimeout(recentTimerRef.current)
    recentTimerRef.current = setTimeout(() => setRecentResult(null), 4_000)
  }, [])

  const enqueueLookup = useCallback((lookup: ProductLookup, historyEntryId: string, selectedSpuId?: string) => {
    sequenceRef.current += 1
    const target = {
      lookup,
      ...(lookup.kind === 'jan' ? { janCode: lookup.janCode } : {}),
      historyEntryId,
      selectedSpuId,
      sequence: sequenceRef.current,
    }
    setLookupQueue((current) =>
      current.some((item) => item.historyEntryId === historyEntryId)
        ? current
        : [...current, target],
    )
    showRecent({ value: lookupLabel(lookup), label: '照会中', tone: 'pending' })
  }, [showRecent])

  const register = useCallback((lookup: ProductLookup, method: RegistrationMethod) => {
    const result = lookup.kind === 'jan'
      ? registerScan(lookup.janCode, method)
      : registerLookup(lookup, method)
    if (result.shouldLookup) {
      enqueueLookup(result.lookup, result.id, result.lookup.kind === 'jan' ? undefined : result.lookup.selectedSpuId)
      playScanFeedback('success', feedbackEnabled)
    } else {
      showRecent({ value: lookupLabel(lookup), label: 'スキャン回数を更新', tone: 'neutral' })
      playScanFeedback('duplicate', feedbackEnabled)
    }
  }, [enqueueLookup, feedbackEnabled, registerLookup, registerScan, showRecent])

  const handleCameraRegister = useCallback(
    (janCode: string) => register({ kind: 'jan', janCode }, 'camera'),
    [register],
  )

  const handleManualRegister = useCallback(
    (janCode: string) => {
      register({ kind: 'jan', janCode }, 'manual')
    },
    [register],
  )

  const handleAlpenCameraRegister = useCallback((rawValue: string) => {
    const lookup = parseAlpenLookup(rawValue)
    if (lookup) register(lookup, 'camera')
  }, [register])

  const handleAlpenManualRegister = useCallback((lookup: ProductLookup) => {
    register(lookup, 'manual')
  }, [register])

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
        : evaluateSourcingMarket(response.market, new Date(), settings, response.product)
      const label = response.state === 'not_found'
        ? '商品が見つかりません'
        : evaluation?.status === 'candidate'
          ? '候補に追加'
          : evaluation?.status === 'no_sales'
            ? '販売実績なし'
            : '要確認'
      showRecent({
        value: lookupLabel(target.lookup ?? { kind: 'jan', janCode: target.janCode ?? '' }),
        label,
        tone: evaluation?.status === 'candidate' ? 'candidate' : 'neutral',
      })
      playScanFeedback(evaluation?.status === 'candidate' ? 'success' : 'review', feedbackEnabled)
      setLookupQueue((current) => current.filter((item) => item.sequence !== target.sequence))
    },
    [feedbackEnabled, savePoizonResult, settings, showRecent],
  )

  const handleLookupReview = useCallback((
    target: PoizonLookupTarget,
    message: string,
    candidates?: PoizonProductCandidate[],
    lookupContext?: PoizonLookupContext,
  ) => {
    if (target.historyEntryId) saveLookupReview(target.historyEntryId, message, candidates, lookupContext)
    const lookup = target.lookup ?? { kind: 'jan' as const, janCode: target.janCode ?? '' }
    showRecent({ value: lookupLabel(lookup), label: '要確認キューへ追加', tone: 'neutral' })
    playScanFeedback('review', feedbackEnabled)
    setLookupQueue((current) => current.filter((item) => item.sequence !== target.sequence))
  }, [feedbackEnabled, saveLookupReview, showRecent])

  const handleLookupError = useCallback((target: PoizonLookupTarget, message: string) => {
    if (target.historyEntryId) saveLookupError(target.historyEntryId, message)
    const lookup = target.lookup ?? { kind: 'jan' as const, janCode: target.janCode ?? '' }
    showRecent({ value: lookupLabel(lookup), label: '未解決として保存', tone: 'error' })
    playScanFeedback('error', feedbackEnabled)
    setLookupQueue((current) => current.filter((item) => item.sequence !== target.sequence))
  }, [feedbackEnabled, saveLookupError, showRecent])

  const handleRetry = useCallback((id: string) => {
    const entry = retryLookup(id)
    if (entry) {
      const lookup = entryLookup(entry)
      enqueueLookup(lookup, entry.id, lookup.kind === 'jan' ? undefined : lookup.selectedSpuId)
    }
  }, [enqueueLookup, retryLookup])

  const handleRefresh = useCallback((id: string) => {
    const entry = requestRefresh(id)
    if (entry) {
      const lookup = entryLookup(entry)
      enqueueLookup(lookup, entry.id, entry.poizon?.product?.spuId)
    }
  }, [enqueueLookup, requestRefresh])

  const handleRetryAll = useCallback(() => {
    for (const currentEntry of history) {
      if (currentEntry.lookupStatus !== 'error') continue
      const entry = retryLookup(currentEntry.id)
      if (!entry) continue
      const lookup = entryLookup(entry)
      enqueueLookup(lookup, entry.id, lookup.kind === 'jan' ? undefined : lookup.selectedSpuId)
    }
  }, [enqueueLookup, history, retryLookup])

  const handleSelectCandidate = useCallback((id: string, spuId: string) => {
    const entry = selectLookupCandidate(id, spuId)
    if (!entry) return
    enqueueLookup(entryLookup(entry), entry.id, spuId)
  }, [enqueueLookup, selectLookupCandidate])

  const handleUpdateArticle = useCallback((id: string, articleNumber: string) => {
    const entry = updateLookupArticle(id, articleNumber)
    if (!entry) return
    enqueueLookup(entryLookup(entry), entry.id)
  }, [enqueueLookup, updateLookupArticle])

  const candidateHistory = useMemo(
    () => history.filter((entry) => getEntryEvaluation(entry)?.status === 'candidate'),
    [history],
  )
  const scanCount = history.reduce(
    (total, entry) => total + (entry.aggregation?.scanCount ?? 1),
    0,
  )
  const lookupTarget = lookupQueue[0] ?? null
  const reviewCount = history.filter((entry) =>
    entry.selectionCandidates?.length ||
    entry.lookupStatus === 'error' ||
    (entryLookup(entry).kind !== 'jan' && getEntryEvaluation(entry)?.status === 'not_found'),
  ).length

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
          <div className="scan-mode-bar" role="group" aria-label="スキャン方式">
            <button type="button" className={scanMode === 'jan' ? 'is-active' : ''} onClick={() => setScanMode('jan')}>JAN</button>
            <button type="button" className={scanMode === 'alpen' ? 'is-active' : ''} onClick={() => setScanMode('alpen')}>Alpen QR</button>
            <label><input type="checkbox" checked={feedbackEnabled} onChange={(event) => setFeedbackEnabled(event.target.checked)} />音・振動</label>
          </div>
          {scanMode === 'jan'
            ? <JanScanner onRegister={handleCameraRegister} />
            : <AlpenQrScanner onRegister={handleAlpenCameraRegister} />}
          {recentResult && (
            <div className={`recent-result recent-result--${recentResult.tone}`} role="status">
              <span>{recentResult.label}</span><code>{recentResult.value}</code>
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
          {scanMode === 'jan'
            ? <ManualEntry onRegister={handleManualRegister} />
            : <AlpenManualEntry onRegister={handleAlpenManualRegister} />}
          {reviewCount > 0 && <button type="button" className="review-queue-link" onClick={() => setActiveTab('history')}>要確認・未解決を確認（{reviewCount}件）</button>}
      </div>

      {activeTab === 'candidates' && (
        <section className="tab-panel candidate-tab" aria-labelledby="candidate-title">
          <div className="section-heading"><div><p className="eyebrow">SOURCING</p><h1 id="candidate-title">候補</h1></div><span>{candidateHistory.length}件</span></div>
          {candidateHistory.length === 0
            ? <p className="empty-panel">候補はまだありません。</p>
            : <div className="candidate-list">{candidateHistory.map((entry) => <CandidateCard key={entry.id} entry={entry} onRefresh={handleRefresh} />)}</div>}
        </section>
      )}

      {activeTab === 'history' && (
        <div className="tab-panel history-tab">
          <ScanHistory
            history={history}
            onDelete={deleteEntry}
            onClear={clearHistory}
            onRetry={handleRetry}
            onRetryAll={handleRetryAll}
            onRefresh={handleRefresh}
            onSelectCandidate={handleSelectCandidate}
            onUpdateArticle={handleUpdateArticle}
            onForgetSelection={forgetLookupSelection}
            management={<HistoryBackup history={history} onRestore={restoreEntries} />}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <section className="tab-panel settings-tab" aria-labelledby="settings-title">
          <div className="section-heading">
            <div><p className="eyebrow">SETTINGS</p><h1 id="settings-title">設定</h1></div>
          </div>
          <SourcingSettings
            settings={settings}
            onSave={setSettings}
            onReset={resetSettings}
          />
        </section>
      )}

      <nav className="bottom-nav" aria-label="メインナビゲーション">
        {([
          ['scan', '⌁', 'スキャン'],
          ['candidates', '☆', '候補'],
          ['history', '◷', '履歴'],
          ['settings', '⚙', '設定'],
        ] as const).map(([tab, icon, label]) => (
          <button key={tab} type="button" className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)} aria-current={activeTab === tab ? 'page' : undefined}>
            <span aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  )
}
