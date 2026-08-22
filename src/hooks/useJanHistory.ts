import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  RegistrationMethod,
  RestoreMode,
  RestoreResult,
  ScanHistoryEntry,
  StorablePoizonLookupResponse,
  StoredScanHistory,
} from '../types/history'
import { isHistoryEntry, restoreHistory } from '../utils/historyTransfer'
import { createPoizonHistorySnapshot } from '../utils/poizonHistory'
import {
  createEmptySourcingEvaluation,
  DEFAULT_SOURCING_SETTINGS,
  evaluateSourcingMarket,
  type SourcingSettings,
} from '../utils/sourcingEvaluation'

const STORAGE_KEY = 'jan-pocket:scan-history'
const SCHEMA_VERSION = 3
const LEGACY_SCHEMA_VERSIONS = [1, 2]

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

    return { history: stored.history, warning: null }
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
          evaluation.minimumProfitAmount === sourcingSettings.minimumProfitAmount
        ) {
          return entry
        }

        changed = true
        const sourcing = evaluateSourcingMarket(
          entry.poizon.market,
          new Date(),
          sourcingSettings,
        )
        return {
          ...entry,
          sourcing,
          poizon: { ...entry.poizon, sourcing },
        }
      })
      return changed ? next : current
    })
  }, [sourcingSettings, updateHistory])

  const registerScan = useCallback(
    (janCode: string, method: RegistrationMethod) => {
      const now = new Date().toISOString()
      const existing = historyRef.current.find((entry) => entry.janCode === janCode)

      if (existing) {
        const aggregation = existing.aggregation ?? {
          scanCount: 1,
          firstReadAt: existing.readAt,
          lastReadAt: existing.readAt,
        }
        const shouldLookup =
          existing.lookupStatus === 'error' ||
          (!existing.poizon && existing.lookupStatus !== 'pending')
        const updated: ScanHistoryEntry = {
          ...existing,
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
        return { id: existing.id, shouldLookup }
      }

      const entry: ScanHistoryEntry = {
        id: createEntryId(),
        janCode,
        readAt: now,
        method,
        aggregation: { scanCount: 1, firstReadAt: now, lastReadAt: now },
        lookupStatus: 'pending',
      }

      updateHistory((currentHistory) => [entry, ...currentHistory])
      return { id: entry.id, shouldLookup: true }
    },
    [updateHistory],
  )

  const addEntry = useCallback(
    (janCode: string, method: RegistrationMethod) =>
      registerScan(janCode, method).id,
    [registerScan],
  )

  const savePoizonResult = useCallback(
    (id: string, response: StorablePoizonLookupResponse) => {
      const snapshot = createPoizonHistorySnapshot(
        response,
        new Date(),
        sourcingSettings,
      )
      updateHistory((currentHistory) =>
        currentHistory.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                poizon: snapshot,
                sourcing: snapshot.sourcing,
                lookupStatus: 'complete' as const,
                lookupError: undefined,
              }
            : entry,
        ),
      )
    },
    [sourcingSettings, updateHistory],
  )

  const saveLookupReview = useCallback(
    (id: string, message: string) => {
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
                sourcing,
                lookupStatus: 'complete' as const,
                lookupError: message,
              }
            : entry,
        ),
      )
    },
    [sourcingSettings, updateHistory],
  )

  const saveLookupError = useCallback(
    (id: string, message: string) => {
      const sourcing = createEmptySourcingEvaluation(
        'error',
        new Date(),
        sourcingSettings,
      )
      updateHistory((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                sourcing,
                lookupStatus: 'error' as const,
                lookupError: message,
              }
            : entry,
        ),
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
    registerScan,
    savePoizonResult,
    saveLookupReview,
    saveLookupError,
    retryLookup,
    deleteEntry,
    clearHistory,
    restoreEntries,
    dismissStorageWarning,
  }
}
