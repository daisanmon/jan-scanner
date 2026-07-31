export type RegistrationMethod = 'camera' | 'manual'

export type ScanHistoryEntry = {
  id: string
  janCode: string
  readAt: string
  method: RegistrationMethod
}

export type StoredScanHistory = {
  schemaVersion: number
  history: ScanHistoryEntry[]
}

export type HistoryBackup = StoredScanHistory & {
  exportedAt: string
}

export type RestoreMode = 'append' | 'replace'

export type RestoreResult = {
  history: ScanHistoryEntry[]
  restoredCount: number
  failedCount: number
}
