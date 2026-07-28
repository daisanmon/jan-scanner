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
