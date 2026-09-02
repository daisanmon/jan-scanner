import type {
  PoizonLookupResponse,
  PoizonMarketData,
  PoizonProductCandidate,
  PoizonResolvedResponse,
} from './poizon'

export type RegistrationMethod = 'camera' | 'manual'

export type ProductLookup =
  | { kind: 'jan'; janCode: string }
  | {
      kind: 'alpen'
      alpenProductId: string
      alpenUrl?: string
      articleNumber?: string
      brandName?: string
      selectedSpuId?: string
    }
  | { kind: 'article'; articleNumber: string; brandName?: string; selectedSpuId?: string }

export type PoizonHistorySnapshot = {
  savedAt: string
  state: 'resolved' | 'price_unavailable' | 'not_found'
  product?: PoizonProductCandidate
  market?: PoizonMarketData
  price?: PoizonResolvedResponse['price']
  sourcing?: SourcingEvaluation
}

export type SizePriceHistory = {
  skuId: string
  globalSkuId: string
  sizes: import('./poizon').PoizonSize[]
  sales30d: number | null
  averageTransactionPrice: number | null
  chinaDisplayablePrice: number | null
  currentMinimumListingPrice: number | null
  recommendedPrice: number | null
  estimatedIncome: number | null
  purchaseBenchmark: number | null
}

export type PriceHistorySnapshot = {
  savedAt: string
  marketDataAsOf: string | null
  priceDataAsOf: string | null
  feePolicyId: SourcingEvaluation['feePolicyId']
  minimumProfitRate: number
  minimumProfitAmount: number
  sizes: SizePriceHistory[]
}

export type SizeSourcingEvaluation = {
  skuId: string
  globalSkuId: string
  sizes: import('./poizon').PoizonSize[]
  scanned: boolean
  sales30d: number | null
  averageTransactionPrice?: number | null
  chinaDisplayablePrice?: number | null
  currentMinimumListingPrice?: number | null
  recommendedPrice?: number | null
  referencePrice: number | null
  calculationBasisPrice?: number | null
  listingFee: number | null
  operationFee: number | null
  transferFee: number | null
  estimatedNetProceeds: number | null
  estimatedIncome?: number | null
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
  feePolicyId:
    | 'jp-prestock-shoes-2026-07-10'
    | 'jp-prestock-shoes-2026-08-23-average-cap'
    | 'jp-prestock-shoes-2026-08-28-displayable-price'
  feePolicyVerifiedAt?: string
  feePolicyValidUntil?: string
  feePolicyExpired?: boolean
  feePolicyApplicable?: boolean
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
  /** Kept for backwards-compatible history imports. New entries also carry lookup. */
  janCode?: string
  lookup?: ProductLookup
  readAt: string
  method: RegistrationMethod
  poizon?: PoizonHistorySnapshot
  priceHistory?: PriceHistorySnapshot[]
  sourcing?: SourcingEvaluation
  aggregation?: ScanAggregation
  lookupStatus?: 'pending' | 'complete' | 'error'
  lookupError?: string
  selectionCandidates?: import('./poizon').PoizonProductCandidate[]
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
