import type {
  PriceHistorySnapshot,
  PoizonHistorySnapshot,
  StorablePoizonLookupResponse,
} from '../types/history'
import {
  createEmptySourcingEvaluation,
  DEFAULT_SOURCING_SETTINGS,
  evaluateSourcingMarket,
  type SourcingSettings,
} from './sourcingEvaluation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isHttpsImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }

  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isSize(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.system === 'string' &&
    typeof value.value === 'string'
  )
}

export function isPoizonProductCandidate(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.spuId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.brandName === 'string' &&
    (value.articleNumber === undefined ||
      typeof value.articleNumber === 'string') &&
    (value.imageUrl === undefined || isHttpsImageUrl(value.imageUrl)) &&
    typeof value.skuId === 'string' &&
    typeof value.globalSkuId === 'string' &&
    typeof value.janCode === 'string' &&
    Array.isArray(value.sizes) &&
    value.sizes.every(isSize)
  )
}

function isNumberRange(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableNumber(value.min) &&
    isNullableNumber(value.median) &&
    isNullableNumber(value.max) &&
    typeof value.reportedSizeCount === 'number' &&
    Number.isInteger(value.reportedSizeCount) &&
    typeof value.totalSizeCount === 'number' &&
    Number.isInteger(value.totalSizeCount)
  )
}

function isMarketSize(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.skuId === 'string' &&
    typeof value.globalSkuId === 'string' &&
    Array.isArray(value.sizes) &&
    value.sizes.every(isSize) &&
    typeof value.scanned === 'boolean' &&
    isNullableNumber(value.globalSoldNum30) &&
    isNullableNumber(value.localSoldNum30) &&
    isNullableNumber(value.globalMonthToMonthRatio) &&
    isNullableNumber(value.localMonthToMonthRatio) &&
    isNullableNumber(value.averageTransactionPrice) &&
    isNullableNumber(value.globalMinPrice) &&
    isNullableNumber(value.asiaMinPrice) &&
    (value.localMinPrice === undefined || isNullableNumber(value.localMinPrice)) &&
    (value.highDemandPrice === undefined || isNullableNumber(value.highDemandPrice)) &&
    (value.fen95ReferencePrice === undefined || isNullableNumber(value.fen95ReferencePrice)) &&
    (value.moreReferencePrice === undefined || isNullableNumber(value.moreReferencePrice))
  )
}

function isMarket(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.summary)) {
    return false
  }

  const summary = value.summary
  return (
    summary.currency === 'JPY' &&
    isNullableNumber(summary.globalSoldNum30Total) &&
    isNumberRange(summary.referencePrice) &&
    isNumberRange(summary.salesPerSize) &&
    isNullableNumber(summary.salesWeightedAveragePrice) &&
    (summary.bestSellingSkuId === null ||
      typeof summary.bestSellingSkuId === 'string') &&
    Array.isArray(value.sizes) &&
    value.sizes.every(isMarketSize) &&
    isDate(value.marketDataAsOf) &&
    (value.priceDataAsOf === null || isDate(value.priceDataAsOf)) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) =>
      ['PRICE_PARTIAL', 'PRICE_UNAVAILABLE', 'SALES_PARTIAL'].includes(
        String(warning),
      ),
    )
  )
}

function isPrice(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.currency === 'JPY' &&
    typeof value.globalMinPrice === 'number' &&
    Number.isFinite(value.globalMinPrice) &&
    typeof value.asiaMinPrice === 'number' &&
    Number.isFinite(value.asiaMinPrice) &&
    isDate(value.dataAsOf)
  )
}

function isSourcingSize(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.skuId === 'string' &&
    typeof value.globalSkuId === 'string' &&
    Array.isArray(value.sizes) &&
    value.sizes.every(isSize) &&
    typeof value.scanned === 'boolean' &&
    isNullableNumber(value.sales30d) &&
    (value.averageTransactionPrice === undefined ||
      isNullableNumber(value.averageTransactionPrice)) &&
    (value.chinaDisplayablePrice === undefined ||
      isNullableNumber(value.chinaDisplayablePrice)) &&
    (value.currentMinimumListingPrice === undefined ||
      isNullableNumber(value.currentMinimumListingPrice)) &&
    (value.recommendedPrice === undefined ||
      isNullableNumber(value.recommendedPrice)) &&
    isNullableNumber(value.referencePrice) &&
    (value.calculationBasisPrice === undefined ||
      isNullableNumber(value.calculationBasisPrice)) &&
    isNullableNumber(value.listingFee) &&
    isNullableNumber(value.operationFee) &&
    isNullableNumber(value.transferFee) &&
    isNullableNumber(value.estimatedNetProceeds) &&
    (value.estimatedIncome === undefined ||
      isNullableNumber(value.estimatedIncome)) &&
    isNullableNumber(value.purchaseBenchmark)
  )
}

export function isSourcingEvaluation(value: unknown): boolean {
  return (
    isRecord(value) &&
    ['candidate', 'no_sales', 'review', 'not_found', 'error'].includes(
      String(value.status),
    ) &&
    isNullableNumber(value.totalSales30d) &&
    (value.salesWeightedAveragePrice === undefined ||
      isNullableNumber(value.salesWeightedAveragePrice)) &&
    Number.isInteger(value.sellingSizeCount) &&
    Number.isInteger(value.totalSizeCount) &&
    isNullableNumber(value.benchmarkMin) &&
    isNullableNumber(value.benchmarkMedian) &&
    isNullableNumber(value.benchmarkMax) &&
    Array.isArray(value.sizes) &&
    value.sizes.every(isSourcingSize) &&
    ['jp-prestock-shoes-2026-07-10', 'jp-prestock-shoes-2026-08-23-average-cap', 'jp-prestock-shoes-2026-08-28-displayable-price'].includes(
      String(value.feePolicyId),
    ) &&
    (value.feePolicyVerifiedAt === undefined || isDate(value.feePolicyVerifiedAt)) &&
    (value.feePolicyValidUntil === undefined || isDate(value.feePolicyValidUntil)) &&
    (value.feePolicyExpired === undefined || typeof value.feePolicyExpired === 'boolean') &&
    (value.feePolicyApplicable === undefined || typeof value.feePolicyApplicable === 'boolean') &&
    (value.minimumProfitRate === undefined ||
      (typeof value.minimumProfitRate === 'number' &&
        Number.isFinite(value.minimumProfitRate))) &&
    (value.minimumProfitAmount === undefined ||
      (typeof value.minimumProfitAmount === 'number' &&
        Number.isFinite(value.minimumProfitAmount))) &&
    isDate(value.evaluatedAt)
  )
}

function isPriceHistorySize(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.skuId === 'string' &&
    typeof value.globalSkuId === 'string' &&
    Array.isArray(value.sizes) &&
    value.sizes.every(isSize) &&
    isNullableNumber(value.sales30d) &&
    isNullableNumber(value.averageTransactionPrice) &&
    isNullableNumber(value.chinaDisplayablePrice) &&
    isNullableNumber(value.currentMinimumListingPrice) &&
    isNullableNumber(value.recommendedPrice) &&
    isNullableNumber(value.estimatedIncome) &&
    isNullableNumber(value.purchaseBenchmark)
  )
}

export function isPriceHistorySnapshot(value: unknown): value is PriceHistorySnapshot {
  return (
    isRecord(value) &&
    isDate(value.savedAt) &&
    (value.marketDataAsOf === null || isDate(value.marketDataAsOf)) &&
    (value.priceDataAsOf === null || isDate(value.priceDataAsOf)) &&
    typeof value.feePolicyId === 'string' &&
    typeof value.minimumProfitRate === 'number' &&
    Number.isFinite(value.minimumProfitRate) &&
    typeof value.minimumProfitAmount === 'number' &&
    Number.isFinite(value.minimumProfitAmount) &&
    Array.isArray(value.sizes) &&
    value.sizes.every(isPriceHistorySize)
  )
}

export function createPriceHistorySnapshot(
  snapshot: PoizonHistorySnapshot,
): PriceHistorySnapshot | null {
  const sourcing = snapshot.sourcing
  if (!sourcing || !snapshot.market) return null

  return {
    savedAt: snapshot.savedAt,
    marketDataAsOf: snapshot.market.marketDataAsOf,
    priceDataAsOf: snapshot.market.priceDataAsOf,
    feePolicyId: sourcing.feePolicyId,
    minimumProfitRate: sourcing.minimumProfitRate ?? DEFAULT_SOURCING_SETTINGS.minimumProfitRate,
    minimumProfitAmount: sourcing.minimumProfitAmount ?? DEFAULT_SOURCING_SETTINGS.minimumProfitAmount,
    sizes: sourcing.sizes.map((size) => ({
      skuId: size.skuId,
      globalSkuId: size.globalSkuId,
      sizes: size.sizes,
      sales30d: size.sales30d,
      averageTransactionPrice: size.averageTransactionPrice ?? null,
      chinaDisplayablePrice: size.chinaDisplayablePrice ?? size.referencePrice,
      currentMinimumListingPrice: size.currentMinimumListingPrice ?? null,
      recommendedPrice: size.recommendedPrice ?? null,
      estimatedIncome: size.estimatedIncome ?? size.estimatedNetProceeds,
      purchaseBenchmark: size.purchaseBenchmark,
    })),
  }
}

export function isPoizonHistorySnapshot(
  value: unknown,
): value is PoizonHistorySnapshot {
  if (
    !isRecord(value) ||
    !isDate(value.savedAt) ||
    !['resolved', 'price_unavailable', 'not_found'].includes(
      String(value.state),
    )
  ) {
    return false
  }

  if (value.state === 'not_found') {
    return (
      value.product === undefined &&
      value.market === undefined &&
      (value.sourcing === undefined || isSourcingEvaluation(value.sourcing))
    )
  }

  if (!isPoizonProductCandidate(value.product)) {
    return false
  }
  if (value.market !== undefined && !isMarket(value.market)) {
    return false
  }
  if (value.sourcing !== undefined && !isSourcingEvaluation(value.sourcing)) {
    return false
  }

  return value.state !== 'resolved' || isPrice(value.price)
}

export function createPoizonHistorySnapshot(
  response: StorablePoizonLookupResponse,
  now = new Date(),
  settings: SourcingSettings = DEFAULT_SOURCING_SETTINGS,
): PoizonHistorySnapshot {
  if (response.state === 'not_found') {
    return {
      savedAt: now.toISOString(),
      state: 'not_found',
      sourcing: createEmptySourcingEvaluation('not_found', now, settings),
    }
  }

  if (response.state === 'price_unavailable') {
    return {
      savedAt: now.toISOString(),
      state: response.state,
      product: response.product,
      market: response.market,
      sourcing: evaluateSourcingMarket(response.market, now, settings, response.product),
    }
  }

  return {
    savedAt: now.toISOString(),
    state: response.state,
    product: response.product,
    market: response.market,
    price: response.price,
    sourcing: evaluateSourcingMarket(response.market, now, settings, response.product),
  }
}
