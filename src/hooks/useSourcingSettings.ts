import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SOURCING_SETTINGS,
  type SourcingSettings,
} from '../utils/sourcingEvaluation'

const STORAGE_KEY = 'jan-pocket:sourcing-settings'

function isValidSettings(value: unknown): value is SourcingSettings {
  if (typeof value !== 'object' || value === null) return false
  const settings = value as Partial<SourcingSettings>
  return (
    typeof settings.minimumProfitRate === 'number' &&
    Number.isFinite(settings.minimumProfitRate) &&
    settings.minimumProfitRate >= 0 &&
    settings.minimumProfitRate < 1 &&
    typeof settings.minimumProfitAmount === 'number' &&
    Number.isInteger(settings.minimumProfitAmount) &&
    settings.minimumProfitAmount >= 0
  )
}

function loadSettings(): SourcingSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return DEFAULT_SOURCING_SETTINGS
    const parsed: unknown = JSON.parse(stored)
    return isValidSettings(parsed) ? parsed : DEFAULT_SOURCING_SETTINGS
  } catch {
    return DEFAULT_SOURCING_SETTINGS
  }
}

export function useSourcingSettings() {
  const [settings, setSettings] = useState<SourcingSettings>(loadSettings)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // 設定は現在のセッションでは利用できるため、保存失敗時も操作を継続する。
    }
  }, [settings])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SOURCING_SETTINGS)
  }, [])

  return { settings, setSettings, resetSettings }
}
