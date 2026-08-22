import type {
  PoizonLookupResponse,
  PoizonMarketData,
  PoizonProductCandidate,
  PoizonResolvedResponse,
} from './poizon'

export type RegistrationMethod = 'camera' | 'manual'

export type PoizonHistorySnapshot = {
  savedAt: string
  state: 'resolved' | 'price_unavailable' | 'not_found'
  product?: PoizonProductCandidate
  market?: PoizonMarketData
  price?: PoizonResolvedResponse['price']
  sourcing?: SourcingEvaluation
}

export type SizeSourcingEvaluation = {
  skuId: string
  globalSkuId: string
  sizes: import('./poizon').PoizonSize[]
  scanned: boolean
  sales30d: number | null
  averageTransactionPrice?: number | null
  referencePrice: number | null
  listingFee: number | null
  operationFee: number | null
  transferFee: number | null
  estimatedNetProceeds: number | null
  purchaseBenchmark: number | null
}

export type SourcingStatus =
  | 'candidate'
  | 'no_sales'
  | 'review'
  | 'not_found'
  | 'error'

export type SourcingEvaluation = {
  status: SourcingStatus
  totalSales30d: number | null
  salesWeightedAveragePrice?: number | null
  sellingSizeCount: number
  totalSizeCount: number
  benchmarkMin: number | null
  benchmarkMedian: number | null
  benchmarkMax: number | null
  sizes: SizeSourcingEvaluation[]
  feePolicyId: 'jp-prestock-shoes-2026-07-10'
  minimumProfitRate?: number
  minimumProfitAmount?: number
  evaluatedAt: string
}

export type ScanAggregation = {
  scanCount: number
  firstReadAt: string
  lastReadAt: string
}

export type StorablePoizonLookupResponse = Exclude<
  PoizonLookupResponse,
  { state: 'selection_required' }
>

export type ScanHistoryEntry = {
  id: string
  janCode: string
  readAt: string
  method: RegistrationMethod
  poizon?: PoizonHistorySnapshot
  sourcing?: SourcingEvaluation
  aggregation?: ScanAggregation
  lookupStatus?: 'pending' | 'complete' | 'error'
  lookupError?: string
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
