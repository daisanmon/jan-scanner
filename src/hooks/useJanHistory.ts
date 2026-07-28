import { useCallback, useEffect, useState } from 'react'
import type {
  RegistrationMethod,
  ScanHistoryEntry,
  StoredScanHistory,
} from '../types/history'
import { isValidJanCode } from '../utils/janCode'

const STORAGE_KEY = 'jan-pocket:scan-history'
const SCHEMA_VERSION = 1

type LoadResult = {
  history: ScanHistoryEntry[]
  warning: string | null
}

function isHistoryEntry(value: unknown): value is ScanHistoryEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.janCode === 'string' &&
    isValidJanCode(entry.janCode) &&
    typeof entry.readAt === 'string' &&
    !Number.isNaN(Date.parse(entry.readAt)) &&
    (entry.method === 'camera' || entry.method === 'manual')
  )
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
      stored.schemaVersion !== SCHEMA_VERSION ||
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

export function useJanHistory() {
  const [initialResult] = useState(loadHistory)
  const [history, setHistory] = useState(initialResult.history)
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

  const addEntry = useCallback(
    (janCode: string, method: RegistrationMethod) => {
      const entry: ScanHistoryEntry = {
        id: createEntryId(),
        janCode,
        readAt: new Date().toISOString(),
        method,
      }

      setHistory((currentHistory) => [entry, ...currentHistory])
    },
    [],
  )

  const deleteEntry = useCallback((id: string) => {
    setHistory((currentHistory) =>
      currentHistory.filter((entry) => entry.id !== id),
    )
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const dismissStorageWarning = useCallback(() => {
    setStorageWarning(null)
  }, [])

  return {
    history,
    storageWarning,
    addEntry,
    deleteEntry,
    clearHistory,
    dismissStorageWarning,
  }
}
