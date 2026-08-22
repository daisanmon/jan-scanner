import type {
  SizeSourcingEvaluation,
  SourcingEvaluation,
  SourcingStatus,
} from '../types/history'
import type { PoizonMarketData, PoizonSizeMarketData } from '../types/poizon'

export const POIZON_FEE_POLICY = {
  id: 'jp-prestock-shoes-2026-07-10',
  listingFeeRate: 0.05,
  listingFeeMin: 700,
  listingFeeMax: 4_230,
  transferFeeRate: 0.01,
  supportFee: 0,
  operationFeeBands: [
    { max: 2_300, fee: 600 },
    { max: 3_500, fee: 820 },
    { max: 4_600, fee: 1_050 },
    { max: Number.POSITIVE_INFINITY, fee: 1_900 },
  ],
} as const

export type SourcingSettings = {
  minimumProfitRate: number
  minimumProfitAmount: number
}

export const DEFAULT_SOURCING_SETTINGS: SourcingSettings = {
  minimumProfitRate: 0.15,
  minimumProfitAmount: 1_000,
}

export type FeeCalculation = {
  referencePrice: number
  listingFee: number
  operationFee: number
  transferFee: number
  estimatedNetProceeds: number
  purchaseBenchmark: number | null
}

export function calculateSourcingFees(
  referencePrice: number,
  settings = DEFAULT_SOURCING_SETTINGS,
): FeeCalculation {
  const listingFee = Math.min(
    POIZON_FEE_POLICY.listingFeeMax,
    Math.max(
      POIZON_FEE_POLICY.listingFeeMin,
      Math.ceil(referencePrice * POIZON_FEE_POLICY.listingFeeRate),
    ),
  )
  const operationFee = POIZON_FEE_POLICY.operationFeeBands.find(
    ({ max }) => referencePrice <= max,
  )?.fee ?? 0
  const transferFee = Math.ceil(
    referencePrice * POIZON_FEE_POLICY.transferFeeRate,
  )
  const estimatedNetProceeds =
    referencePrice -
    listingFee -
    operationFee -
    transferFee -
    POIZON_FEE_POLICY.supportFee
  const rawBenchmark = Math.min(
    estimatedNetProceeds - settings.minimumProfitAmount,
    estimatedNetProceeds * (1 - settings.minimumProfitRate),
  )
  const purchaseBenchmark = Math.floor(rawBenchmark / 100) * 100

  return {
    referencePrice,
    listingFee,
    operationFee,
    transferFee,
    estimatedNetProceeds,
    purchaseBenchmark: purchaseBenchmark > 0 ? purchaseBenchmark : null,
  }
}

function evaluateSize(
  size: PoizonSizeMarketData,
  settings: SourcingSettings,
): SizeSourcingEvaluation {
  const fees =
    size.asiaMinPrice === null
      ? null
      : calculateSourcingFees(size.asiaMinPrice, settings)

  return {
    skuId: size.skuId,
    globalSkuId: size.globalSkuId,
    sizes: size.sizes,
    scanned: size.scanned,
    sales30d: size.globalSoldNum30,
    averageTransactionPrice: size.averageTransactionPrice,
    referencePrice: size.asiaMinPrice,
    listingFee: fees?.listingFee ?? null,
    operationFee: fees?.operationFee ?? null,
    transferFee: fees?.transferFee ?? null,
    estimatedNetProceeds: fees?.estimatedNetProceeds ?? null,
    purchaseBenchmark: fees?.purchaseBenchmark ?? null,
  }
}

function sizeSortValue(size: SizeSourcingEvaluation): number {
  const preferred =
    size.sizes.find(({ system }) => system === 'JP') ?? size.sizes[0]
  const numeric = preferred ? Number.parseFloat(preferred.value) : Number.NaN
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY
}

export function determineCandidateStatus(
  sizes: Pick<PoizonSizeMarketData, 'globalSoldNum30'>[] | null,
): SourcingStatus {
  if (!sizes || sizes.length === 0) return 'review'
  if (sizes.some(({ globalSoldNum30 }) => (globalSoldNum30 ?? 0) > 0)) {
    return 'candidate'
  }
  if (sizes.some(({ globalSoldNum30 }) => globalSoldNum30 === null)) {
    return 'review'
  }
  return 'no_sales'
}

export function aggregateBenchmarks(
  sizes: Pick<SizeSourcingEvaluation, 'sales30d' | 'purchaseBenchmark'>[],
) {
  const values = sizes
    .filter(
      (size) =>
        (size.sales30d ?? 0) > 0 && size.purchaseBenchmark !== null,
    )
    .map((size) => size.purchaseBenchmark as number)
    .sort((left, right) => left - right)

  if (values.length === 0) {
    return { min: null, median: null, max: null }
  }

  const middle = Math.floor(values.length / 2)
  const median =
    values.length % 2 === 1
      ? values[middle]
      : Math.floor(((values[middle - 1] + values[middle]) / 2) / 100) * 100

  return { min: values[0], median, max: values[values.length - 1] }
}

export function evaluateSourcingMarket(
  market: PoizonMarketData | undefined,
  now = new Date(),
  settings = DEFAULT_SOURCING_SETTINGS,
): SourcingEvaluation {
  const sizes = (market?.sizes ?? [])
    .map((size) => evaluateSize(size, settings))
    .sort((left, right) => sizeSortValue(left) - sizeSortValue(right))
  const benchmarks = aggregateBenchmarks(sizes)
  const knownSales = sizes
    .map(({ sales30d }) => sales30d)
    .filter((sales): sales is number => sales !== null)

  return {
    status: determineCandidateStatus(market?.sizes ?? null),
    totalSales30d:
      knownSales.length === 0
        ? null
        : knownSales.reduce((total, sales) => total + sales, 0),
    salesWeightedAveragePrice:
      market?.summary.salesWeightedAveragePrice ?? null,
    sellingSizeCount: sizes.filter(({ sales30d }) => (sales30d ?? 0) > 0)
      .length,
    totalSizeCount: sizes.length,
    benchmarkMin: benchmarks.min,
    benchmarkMedian: benchmarks.median,
    benchmarkMax: benchmarks.max,
    sizes,
    feePolicyId: POIZON_FEE_POLICY.id,
    minimumProfitRate: settings.minimumProfitRate,
    minimumProfitAmount: settings.minimumProfitAmount,
    evaluatedAt: now.toISOString(),
  }
}

export function createEmptySourcingEvaluation(
  status: Extract<SourcingStatus, 'review' | 'not_found' | 'error'>,
  now = new Date(),
  settings = DEFAULT_SOURCING_SETTINGS,
): SourcingEvaluation {
  return {
    status,
    totalSales30d: null,
    salesWeightedAveragePrice: null,
    sellingSizeCount: 0,
    totalSizeCount: 0,
    benchmarkMin: null,
    benchmarkMedian: null,
    benchmarkMax: null,
    sizes: [],
    feePolicyId: POIZON_FEE_POLICY.id,
    minimumProfitRate: settings.minimumProfitRate,
    minimumProfitAmount: settings.minimumProfitAmount,
    evaluatedAt: now.toISOString(),
  }
}
