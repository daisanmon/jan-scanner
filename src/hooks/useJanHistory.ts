import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  RegistrationMethod,
  ProductLookup,
  RestoreMode,
  RestoreResult,
  ScanHistoryEntry,
  StorablePoizonLookupResponse,
  StoredScanHistory,
} from '../types/history'
import { isHistoryEntry, restoreHistory } from '../utils/historyTransfer'
import {
  createPoizonHistorySnapshot,
  createPriceHistorySnapshot,
} from '../utils/poizonHistory'
import { isDifferentJstDate, toJstDateKey } from '../utils/jstDate'
import {
  createEmptySourcingEvaluation,
  DEFAULT_SOURCING_SETTINGS,
  evaluateSourcingMarket,
  POIZON_FEE_POLICY,
  type SourcingSettings,
} from '../utils/sourcingEvaluation'
import {
  entryLookup,
  lookupFromPoizonContext,
  lookupKey,
} from '../utils/productLookup'
import type { PoizonLookupContext, PoizonProductCandidate } from '../../shared/poizon'

const STORAGE_KEY = 'jan-pocket:scan-history'
const SCHEMA_VERSION = 5
const LEGACY_SCHEMA_VERSIONS = [1, 2, 3, 4]
const PRICE_HISTORY_RETENTION_DAYS = 90

type LoadResult = {
  history: ScanHistoryEntry[]
  warning: string | null
}

function loadHistory(): LoadResult {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY)

    if (storedValue === null) {
      return { history: [], warning: null }
    }

    const parsed: unknown = JSON.parse(storedValue)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid stored history')
    }

    const stored = parsed as Partial<StoredScanHistory>
    if (
      stored.schemaVersion !== SCHEMA_VERSION &&
      !LEGACY_SCHEMA_VERSIONS.includes(stored.schemaVersion ?? -1)
    ) {
      throw new Error('Unsupported stored history')
    }
    if (
      !Array.isArray(stored.history) ||
      !stored.history.every(isHistoryEntry)
    ) {
      throw new Error('Unsupported or invalid stored history')
    }

    const history = stored.history.map((entry) => {
      const migratedEntry = entry.lookup || !entry.janCode
        ? entry
        : { ...entry, lookup: { kind: 'jan' as const, janCode: entry.janCode } }
      if (migratedEntry.priceHistory || !migratedEntry.poizon) return migratedEntry
      const migrated = createPriceHistorySnapshot(migratedEntry.poizon)
      return migrated ? { ...migratedEntry, priceHistory: [migrated] } : migratedEntry
    })
    return { history, warning: null }
  } catch {
    return {
      history: [],
      warning:
        '保存されていた読み取り履歴を読み込めませんでした。空の履歴で開始します。',
    }
  }
}

function createEntryId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useJanHistory(
  sourcingSettings: SourcingSettings = DEFAULT_SOURCING_SETTINGS,
) {
  const [initialResult] = useState(loadHistory)
  const [history, setHistory] = useState(initialResult.history)
  const historyRef = useRef(initialResult.history)
  const [storageWarning, setStorageWarning] = useState(initialResult.warning)

  useEffect(() => {
    const storedHistory: StoredScanHistory = {
      schemaVersion: SCHEMA_VERSION,
      history,
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedHistory))
    } catch {
      queueMicrotask(() => {
        setStorageWarning(
          '読み取り履歴を端末に保存できませんでした。ブラウザの保存設定や空き容量を確認してください。',
        )
      })
    }
  }, [history])

  const updateHistory = useCallback(
    (updater: (history: ScanHistoryEntry[]) => ScanHistoryEntry[]) => {
      const next = updater(historyRef.current)
      historyRef.current = next
      setHistory(next)
    },
    [],
  )

  useEffect(() => {
    updateHistory((current) => {
      let changed = false
      const next = current.map((entry) => {
        if (!entry.poizon?.market) return entry
        const evaluation = entry.sourcing ?? entry.poizon.sourcing
        if (
          evaluation?.minimumProfitRate === sourcingSettings.minimumProfitRate &&
          evaluation.minimumProfitAmount === sourcingSettings.minimumProfitAmount &&
          evaluation.feePolicyId === POIZON_FEE_POLICY.id
        ) {
          return entry
        }

        changed = true
        const sourcing = evaluateSourcingMarket(
          entry.poizon.market,
          new Date(),
          sourcingSettings,
          entry.poizon.product,
        )
        return {
          ...entry,
          sourcing,
          poizon: entry.poizon,
        }
      })
      return changed ? next : current
    })
  }, [sourcingSettings, updateHistory])

  const registerLookup = useCallback(
    (lookup: ProductLookup, method: RegistrationMethod, currentTime = new Date()) => {
      const now = currentTime.toISOString()
      const key = lookupKey(lookup)
      const existing = historyRef.current.find((entry) => lookupKey(entryLookup(entry)) === key)

      if (existing) {
        const aggregation = existing.aggregation ?? {
          scanCount: 1,
          firstReadAt: existing.readAt,
          lastReadAt: existing.readAt,
        }
        const shouldLookup =
          existing.lookupStatus === 'error' ||
          (!existing.poizon && existing.lookupStatus !== 'pending') ||
          existing.poizon?.state === 'not_found' ||
          Boolean(existing.poizon?.product && !existing.poizon.product.articleNumber) ||
          (existing.poizon?.state === 'resolved' &&
            isDifferentJstDate(existing.poizon.savedAt, currentTime)) ||
          (existing.poizon?.state === 'price_unavailable' &&
            isDifferentJstDate(existing.poizon.savedAt, currentTime))
        const updated: ScanHistoryEntry = {
          ...existing,
          lookup: { ...entryLookup(existing), ...lookup },
          readAt: now,
          method,
          aggregation: {
            ...aggregation,
            scanCount: aggregation.scanCount + 1,
            lastReadAt: now,
          },
          ...(shouldLookup
            ? { lookupStatus: 'pending' as const, lookupError: undefined }
            : {}),
        }
        updateHistory((current) => [
          updated,
          ...current.filter((entry) => entry.id !== existing.id),
        ])
        return { id: existing.id, shouldLookup, lookup: updated.lookup ?? lookup }
      }

      const entry: ScanHistoryEntry = {
        id: createEntryId(),
        ...(lookup.kind === 'jan' ? { janCode: lookup.janCode } : {}),
        lookup,
        readAt: now,
        method,
        aggregation: { scanCount: 1, firstReadAt: now, lastReadAt: now },
        lookupStatus: 'pending',
      }

      updateHistory((currentHistory) => [entry, ...currentHistory])
      return { id: entry.id, shouldLookup: true, lookup }
    },
    [updateHistory],
  )

  const registerScan = useCallback(
    (janCode: string, method: RegistrationMethod, currentTime = new Date()) =>
      registerLookup({ kind: 'jan', janCode }, method, currentTime),
    [registerLookup],
  )

  const addEntry = useCallback(
    (janCode: string, method: RegistrationMethod) =>
      registerScan(janCode, method).id,
    [registerScan],
  )

  const savePoizonResult = useCallback(
    (id: string, response: StorablePoizonLookupResponse, currentTime = new Date()) => {
      const snapshot = createPoizonHistorySnapshot(
        response,
        currentTime,
        sourcingSettings,
      )
      const priceSnapshot = createPriceHistorySnapshot(snapshot)
      updateHistory((currentHistory) => currentHistory.map((entry) => {
        if (entry.id !== id) return entry
        let priceHistory = entry.priceHistory ?? []
        if (priceSnapshot) {
          const currentDay = toJstDateKey(priceSnapshot.savedAt)
          priceHistory = [
            ...priceHistory.filter((item) => toJstDateKey(item.savedAt) !== currentDay),
            priceSnapshot,
          ]
            .sort((left, right) => left.savedAt.localeCompare(right.savedAt))
            .slice(-PRICE_HISTORY_RETENTION_DAYS)
        }
        let lookup = lookupFromPoizonContext(entryLookup(entry), response.lookup)
        if (lookup.kind !== 'jan' && response.state !== 'not_found' && response.product?.spuId) {
          lookup = { ...lookup, selectedSpuId: response.product.spuId }
        }
        return {
          ...entry,
          lookup,
          poizon: snapshot,
          priceHistory,
          sourcing: snapshot.sourcing,
          lookupStatus: 'complete' as const,
          lookupError: undefined,
          selectionCandidates: undefined,
        }
      }))
    },
    [sourcingSettings, updateHistory],
  )

  const saveLookupReview = useCallback(
    (
      id: string,
      message: string,
      candidates?: PoizonProductCandidate[],
      lookupContext?: PoizonLookupContext,
    ) => {
      const sourcing = createEmptySourcingEvaluation(
        'review',
        new Date(),
        sourcingSettings,
      )
      updateHistory((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                lookup: lookupFromPoizonContext(entryLookup(entry), lookupContext),
                sourcing,
                lookupStatus: 'complete' as const,
                lookupError: message,
                selectionCandidates: candidates,
              }
            : entry,
        ),
      )
    },
    [sourcingSettings, updateHistory],
  )

  const saveLookupError = useCallback(
    (id: string, message: string) => {
      updateHistory((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry
          const previous = entry.sourcing ?? entry.poizon?.sourcing
          const sourcing = previous
            ? { ...previous, status: 'review' as const, evaluatedAt: new Date().toISOString() }
            : createEmptySourcingEvaluation('error', new Date(), sourcingSettings)
          return {
            ...entry,
            sourcing,
            lookupStatus: 'error' as const,
            lookupError: entry.poizon
              ? `価格を更新できませんでした。前回の取得値を表示しています。${message}`
              : message,
          }
        }),
      )
    },
    [sourcingSettings, updateHistory],
  )

  const retryLookup = useCallback(
    (id: string) => {
      const entry = historyRef.current.find((item) => item.id === id)
      if (!entry || entry.lookupStatus !== 'error') return null
      updateHistory((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, lookupStatus: 'pending' as const, lookupError: undefined }
            : item,
        ),
      )
      return entry
    },
    [updateHistory],
  )

  const requestRefresh = useCallback(
    (id: string) => {
      const entry = historyRef.current.find((item) => item.id === id)
      if (!entry || entry.lookupStatus === 'pending') return null
      updateHistory((current) => current.map((item) =>
        item.id === id
          ? { ...item, lookupStatus: 'pending' as const, lookupError: undefined }
          : item,
      ))
      return entry
    },
    [updateHistory],
  )

  const selectLookupCandidate = useCallback(
    (id: string, selectedSpuId: string) => {
      const entry = historyRef.current.find((item) => item.id === id)
      if (!entry || !entry.selectionCandidates?.some((candidate) => candidate.spuId === selectedSpuId)) {
        return null
      }
      const lookup = entryLookup(entry)
      const nextLookup = lookup.kind === 'jan' ? lookup : { ...lookup, selectedSpuId }
      const updated = { ...entry, lookup: nextLookup, lookupStatus: 'pending' as const, lookupError: undefined }
      updateHistory((current) => current.map((item) => item.id === id ? updated : item))
      return updated
    },
    [updateHistory],
  )

  const updateLookupArticle = useCallback(
    (id: string, articleNumber: string) => {
      const entry = historyRef.current.find((item) => item.id === id)
      if (!entry) return null
      const currentLookup = entryLookup(entry)
      if (currentLookup.kind === 'jan') return null
      const lookup: ProductLookup = currentLookup.kind === 'alpen'
        ? { ...currentLookup, articleNumber, selectedSpuId: undefined }
        : { ...currentLookup, articleNumber, selectedSpuId: undefined }
      const updated = {
        ...entry,
        lookup,
        lookupStatus: 'pending' as const,
        lookupError: undefined,
        selectionCandidates: undefined,
      }
      updateHistory((current) => current.map((item) => item.id === id ? updated : item))
      return updated
    },
    [updateHistory],
  )

  const forgetLookupSelection = useCallback((id: string) => {
    updateHistory((current) => current.map((entry) => {
      if (entry.id !== id) return entry
      const lookup = entryLookup(entry)
      if (lookup.kind === 'jan') return entry
      return { ...entry, lookup: { ...lookup, selectedSpuId: undefined } }
    }))
  }, [updateHistory])

  const deleteEntry = useCallback((id: string) => {
    updateHistory((currentHistory) =>
      currentHistory.filter((entry) => entry.id !== id),
    )
  }, [updateHistory])

  const clearHistory = useCallback(() => {
    updateHistory(() => [])
  }, [updateHistory])

  const restoreEntries = useCallback(
    (
      entries: ScanHistoryEntry[],
      mode: RestoreMode,
      validationFailedCount: number,
    ): RestoreResult => {
      const result = restoreHistory(
        history,
        entries,
        mode,
        validationFailedCount,
      )
      historyRef.current = result.history
      setHistory(result.history)
      return result
    },
    [history],
  )

  const dismissStorageWarning = useCallback(() => {
    setStorageWarning(null)
  }, [])

  return {
    history,
    storageWarning,
    addEntry,
    registerLookup,
    registerScan,
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
  }
}
