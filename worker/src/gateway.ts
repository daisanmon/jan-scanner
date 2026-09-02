import type {
  PoizonLookupResponse,
  PoizonMarketData,
  PoizonMarketSummary,
  PoizonNumberRange,
  PoizonProductCandidate,
  PoizonSizeMarketData,
} from '../../shared/poizon'
import type { GatewayLookupRequest } from './contracts'
import { errorResponse, jsonResponse } from './contracts'
import type { WorkerEnv } from './env'
import { ApiError, PoizonUpstreamError } from './errors'
import {
  queryBatchPrices,
  queryConsignmentPrice,
  queryMarketBySpu,
  queryProductsByBarcode,
  queryProductsByArticleNumber,
} from './poizon/client'
import { normalizeArticleNumber, normalizeBrandName } from '../../shared/alpen'
import type { PoizonLookupContext } from '../../shared/poizon'
import type {
  NormalizedBatchPrice,
  NormalizedMarketProduct,
  NormalizedPrice,
} from './poizon/normalize'

const PRODUCT_TTL_MS = 24 * 60 * 60 * 1_000
const NEGATIVE_PRODUCT_TTL_MS = 10 * 60 * 1_000
const MARKET_TTL_MS = 15 * 60 * 1_000
const PRICE_TTL_MS = 2 * 60 * 1_000
const MINIMUM_UPSTREAM_INTERVAL_MS = 250
// v5 invalidates snapshots cached before articleNumber and UPC-A fallback support.
const PRODUCT_CACHE_NAMESPACE = 'product:v5'
const MARKET_CACHE_NAMESPACE = 'market:v1'
const PRICE_BATCH_CACHE_NAMESPACE = 'price-batch:v1'
const LEGACY_PRICE_CACHE_NAMESPACE = 'price:v2'
const API_141_MAX_SKUS = 20

const QUOTA_WINDOWS = {
  minute: { durationMs: 60 * 1_000, limit: 240 },
  hour: { durationMs: 60 * 60 * 1_000, limit: 8_000 },
  day: { durationMs: 24 * 60 * 60 * 1_000, limit: 18_000 },
} as const

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

type Timestamped<T> = T & {
  dataAsOf: string
}

type PriceCacheValue = Timestamped<NormalizedPrice>
type MarketCacheValue = {
  market: NormalizedMarketProduct
  dataAsOf: string
}
type PriceBatchCacheValue = {
  prices: NormalizedBatchPrice[]
  dataAsOf: string
}

type QuotaBucket = {
  windowStartedAt: number
  count: number
}

type QuotaState = {
  lastRequestAt: number
  minute: QuotaBucket
  hour: QuotaBucket
  day: QuotaBucket
}

function createBucket(now: number, durationMs: number): QuotaBucket {
  return {
    windowStartedAt: Math.floor(now / durationMs) * durationMs,
    count: 0,
  }
}

function createQuotaState(now: number): QuotaState {
  return {
    lastRequestAt: 0,
    minute: createBucket(now, QUOTA_WINDOWS.minute.durationMs),
    hour: createBucket(now, QUOTA_WINDOWS.hour.durationMs),
    day: createBucket(now, QUOTA_WINDOWS.day.durationMs),
  }
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function range(values: number[], totalSizeCount: number): PoizonNumberRange {
  return {
    min: values.length > 0 ? Math.min(...values) : null,
    median: median(values),
    max: values.length > 0 ? Math.max(...values) : null,
    reportedSizeCount: values.length,
    totalSizeCount,
  }
}

function primarySizeValue(size: PoizonSizeMarketData): number {
  for (const system of ['JP', 'EU', 'US Men', 'US']) {
    const candidate = size.sizes.find((entry) => entry.system === system)
    if (candidate) {
      const parsed = Number(candidate.value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return Number.POSITIVE_INFINITY
}

function buildMarketData(
  marketValue: MarketCacheValue,
  prices: NormalizedBatchPrice[],
  scannedSkuId: string,
  priceDataAsOf: string | null,
): PoizonMarketData {
  const priceBySku = new Map(prices.map((price) => [price.skuId, price]))
  const sizes: PoizonSizeMarketData[] = marketValue.market.skus
    .map((sku) => {
      const price = priceBySku.get(sku.skuId)
      return {
        skuId: sku.skuId,
        globalSkuId: sku.globalSkuId,
        sizes: sku.sizes,
        scanned: sku.skuId === scannedSkuId,
        globalSoldNum30: sku.globalSoldNum30,
        localSoldNum30: sku.localSoldNum30,
        globalMonthToMonthRatio: sku.globalMonthToMonthRatio,
        localMonthToMonthRatio: sku.localMonthToMonthRatio,
        averageTransactionPrice: sku.averageTransactionPrice,
        globalMinPrice: price?.globalMinPrice ?? null,
        asiaMinPrice: price?.asiaMinPrice ?? null,
        localMinPrice: price?.localMinPrice ?? null,
        highDemandPrice: price?.highDemandPrice ?? null,
        fen95ReferencePrice: price?.fen95ReferencePrice ?? null,
        moreReferencePrice: price?.moreReferencePrice ?? null,
      }
    })
    .sort((left, right) => primarySizeValue(left) - primarySizeValue(right))

  const referencePrices = sizes.flatMap((size) =>
    size.asiaMinPrice === null ? [] : [size.asiaMinPrice],
  )
  const salesValues = sizes.flatMap((size) =>
    size.globalSoldNum30 === null ? [] : [size.globalSoldNum30],
  )
  const salesComplete = salesValues.length === sizes.length
  const totalSales = salesValues.length > 0
    ? salesValues.reduce((total, value) => total + value, 0)
    : null
  const weightedRows = sizes.filter(
    (size) =>
      size.globalSoldNum30 !== null &&
      size.averageTransactionPrice !== null,
  )
  const weightedSales = weightedRows.reduce(
    (total, size) => total + (size.globalSoldNum30 ?? 0),
    0,
  )
  const averagesComplete = sizes.every(
    (size) =>
      size.globalSoldNum30 === null ||
      size.globalSoldNum30 === 0 ||
      size.averageTransactionPrice !== null,
  )
  const weightedAverage =
    averagesComplete && weightedSales > 0
      ? Math.round(
          weightedRows.reduce(
            (total, size) =>
              total +
              (size.globalSoldNum30 ?? 0) *
                (size.averageTransactionPrice ?? 0),
            0,
          ) / weightedSales,
        )
      : null
  const bestSelling = sizes
    .filter((size) => size.globalSoldNum30 !== null)
    .sort(
      (left, right) =>
        (right.globalSoldNum30 ?? 0) - (left.globalSoldNum30 ?? 0),
    )[0]

  const summary: PoizonMarketSummary = {
    currency: 'JPY',
    globalSoldNum30Total: totalSales,
    referencePrice: range(referencePrices, sizes.length),
    salesPerSize: range(salesValues, sizes.length),
    salesWeightedAveragePrice: weightedAverage,
    bestSellingSkuId: bestSelling?.skuId ?? null,
  }
  const warnings: PoizonMarketData['warnings'] = []
  if (referencePrices.length === 0) {
    warnings.push('PRICE_UNAVAILABLE')
  } else if (referencePrices.length < sizes.length) {
    warnings.push('PRICE_PARTIAL')
  }
  if (!salesComplete) {
    warnings.push('SALES_PARTIAL')
  }

  return {
    summary,
    sizes,
    marketDataAsOf: marketValue.dataAsOf,
    priceDataAsOf,
    warnings,
  }
}

export class PoizonGateway implements DurableObject {
  private readonly state: DurableObjectState
  private readonly env: WorkerEnv
  private quotaQueue: Promise<void> = Promise.resolve()
  private quotaState: QuotaState | undefined
  private readonly productRequests = new Map<
    string,
    Promise<{ candidates: PoizonProductCandidate[]; cacheHit: boolean }>
  >()
  private readonly marketRequests = new Map<
    string,
    Promise<{ value: MarketCacheValue; cacheHit: boolean }>
  >()
  private readonly priceBatchRequests = new Map<
    string,
    Promise<{ value: PriceBatchCacheValue; cacheHit: boolean }>
  >()
  private readonly legacyPriceRequests = new Map<
    string,
    Promise<{ price: PriceCacheValue | null; cacheHit: boolean }>
  >()

  constructor(
    state: DurableObjectState,
    env: WorkerEnv,
  ) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    let requestId = crypto.randomUUID()

    try {
      const url = new URL(request.url)
      if (request.method !== 'POST' || url.pathname !== '/lookup') {
        throw new ApiError(404, 'INVALID_REQUEST', 'APIが見つかりません。', false)
      }

      const input = (await request.json()) as GatewayLookupRequest
      requestId = input.requestId
      return jsonResponse(await this.lookup(input))
    } catch (error) {
      const apiError = this.toApiError(error, requestId)
      return errorResponse(apiError, requestId)
    }
  }

  private async lookup(input: GatewayLookupRequest): Promise<PoizonLookupResponse> {
    const lookup: PoizonLookupContext = input.lookup ?? { kind: 'jan', janCode: input.janCode ?? '' }
    const productResult = await this.getProducts(lookup, input.requestId)
    const cache = { product: productResult.cacheHit, market: false, price: false }

    if (productResult.candidates.length === 0) {
      return { requestId: input.requestId, lookup, state: 'not_found', cache }
    }

    const choices = Array.from(
      new Map(
        productResult.candidates.map((candidate) => [candidate.spuId, candidate]),
      ).values(),
    )
    let product: PoizonProductCandidate | undefined
    if (input.selectedSpuId) {
      product = productResult.candidates.find(
        (candidate) => candidate.spuId === input.selectedSpuId,
      )
    } else if (input.selectedSkuId) {
      product = productResult.candidates.find(
        (candidate) => candidate.skuId === input.selectedSkuId,
      )
    } else if (lookup.kind === 'article') {
      const expectedArticle = normalizeArticleNumber(lookup.articleNumber)
      const expectedBrand = lookup.brandName
        ? normalizeBrandName(lookup.brandName)
        : null
      const exactChoices = choices.filter((candidate) =>
        normalizeArticleNumber(candidate.articleNumber ?? '') === expectedArticle &&
        expectedBrand !== null &&
        normalizeBrandName(candidate.brandName) === expectedBrand,
      )
      if (exactChoices.length === 1) product = exactChoices[0]
      else {
        return {
          requestId: input.requestId,
          lookup,
          state: 'selection_required',
          candidates: choices,
          cache,
        }
      }
    } else if (choices.length > 1) {
      return {
        requestId: input.requestId,
        lookup,
        state: 'selection_required',
        candidates: choices,
        cache,
      }
    } else {
      product = productResult.candidates[0]
    }

    if (!product) {
      return {
        requestId: input.requestId,
        lookup,
        state: 'selection_required',
        candidates: choices,
        cache,
      }
    }
    const candidatesForSelectedSpu = productResult.candidates.filter(
      (candidate) => candidate.spuId === product!.spuId,
    )
    const scannedSkuId =
      candidatesForSelectedSpu.length === 1 ? product.skuId : null

    let marketResult: { value: MarketCacheValue; cacheHit: boolean }
    try {
      marketResult = await this.getMarket(product.spuId, input.requestId)
      cache.market = marketResult.cacheHit
    } catch (error) {
      if (!(error instanceof PoizonUpstreamError)) {
        throw error
      }
      if (lookup.kind === 'article' || !product.skuId) {
        return {
          requestId: input.requestId,
          lookup,
          state: 'price_unavailable',
          product,
          cache,
        }
      }
      const fallback = await this.getLegacyPrice(product.skuId, input.requestId)
      cache.price = fallback.cacheHit
      if (!fallback.price) {
        return {
          requestId: input.requestId,
          lookup,
          state: 'price_unavailable',
          product,
          cache,
        }
      }
      return {
        requestId: input.requestId,
        lookup,
        state: 'resolved',
        product,
        price: {
          currency: 'JPY',
          globalMinPrice: fallback.price.globalMinPrice,
          asiaMinPrice: fallback.price.asiaMinPrice,
          dataAsOf: fallback.price.dataAsOf,
        },
        cache,
      }
    }

    if (lookup.kind === 'article') {
      product = {
        ...product,
        ...(marketResult.value.market.globalSpuId
          ? { globalSpuId: marketResult.value.market.globalSpuId }
          : {}),
        title: product.title || marketResult.value.market.title,
        brandName: product.brandName || marketResult.value.market.brandName,
      }
    }

    const priceResult = await this.getBatchPrices(
      marketResult.value.market.skus.map((sku) => sku.skuId),
      input.requestId,
    )
    cache.price = priceResult.cacheHit
    let prices = priceResult.prices
    let priceDataAsOf = priceResult.dataAsOf
    let scannedPrice = lookup.kind === 'jan'
      ? prices.find((price) => price.skuId === product.skuId)
      : prices.find((price) => price.globalMinPrice !== null && price.asiaMinPrice !== null)

    if (
      lookup.kind === 'jan' && (
      !scannedPrice ||
      scannedPrice.globalMinPrice === null ||
      scannedPrice.asiaMinPrice === null)
    ) {
      try {
        const fallback = await this.getLegacyPrice(product.skuId, input.requestId)
        if (fallback.price) {
          scannedPrice = {
            skuId: product.skuId,
            globalMinPrice: fallback.price.globalMinPrice,
            asiaMinPrice: fallback.price.asiaMinPrice,
            localMinPrice: null,
            highDemandPrice: null,
            fen95ReferencePrice: null,
            moreReferencePrice: null,
          }
          prices = [
            ...prices.filter((price) => price.skuId !== product.skuId),
            scannedPrice,
          ]
          priceDataAsOf ??= fallback.price.dataAsOf
        }
      } catch (error) {
        if (!(error instanceof PoizonUpstreamError)) {
          throw error
        }
      }
    }

    const market = buildMarketData(
      marketResult.value,
      prices,
      scannedSkuId ?? '',
      priceDataAsOf,
    )
    if (
      !scannedPrice ||
      scannedPrice.globalMinPrice === null ||
      scannedPrice.asiaMinPrice === null
    ) {
      return {
        requestId: input.requestId,
        lookup,
        state: 'price_unavailable',
        product,
        market,
        cache,
      }
    }

    return {
      requestId: input.requestId,
      lookup,
      state: 'resolved',
      product,
      market,
      price: {
        currency: 'JPY',
        globalMinPrice: scannedPrice.globalMinPrice,
        asiaMinPrice: scannedPrice.asiaMinPrice,
        dataAsOf: priceDataAsOf ?? new Date().toISOString(),
      },
      cache,
    }
  }

  private async getProducts(lookup: PoizonLookupContext, requestId: string) {
    const lookupValue = lookup.kind === 'jan'
      ? lookup.janCode
      : normalizeArticleNumber(lookup.articleNumber)
    const cacheKey = `${PRODUCT_CACHE_NAMESPACE}:${lookup.kind}:${lookupValue}`
    const cached = await this.readCache<PoizonProductCandidate[]>(cacheKey)
    if (cached) {
      return { candidates: cached, cacheHit: true }
    }

    const inFlight = this.productRequests.get(cacheKey)
    if (inFlight) {
      return inFlight
    }

    const request = (async () => {
      const candidates = lookup.kind === 'jan'
        ? await queryProductsByBarcode(
            lookup.janCode,
            this.env,
            () => this.reserveQuota(),
          )
        : await queryProductsByArticleNumber(
            lookup.articleNumber,
            this.env,
            () => this.reserveQuota(),
          )
      await this.writeCache(
        cacheKey,
        candidates,
        candidates.length === 0 ? NEGATIVE_PRODUCT_TTL_MS : PRODUCT_TTL_MS,
      )
      return { candidates, cacheHit: false }
    })().finally(() => this.productRequests.delete(cacheKey))

    this.productRequests.set(cacheKey, request)
    try {
      return await request
    } catch (error) {
      this.logUpstreamError(error, requestId)
      throw error
    }
  }

  private async getMarket(spuId: string, requestId: string) {
    const cacheKey = `${MARKET_CACHE_NAMESPACE}:${spuId}`
    const cached = await this.readCache<MarketCacheValue>(cacheKey)
    if (cached) {
      return { value: cached, cacheHit: true }
    }

    const inFlight = this.marketRequests.get(cacheKey)
    if (inFlight) {
      return inFlight
    }

    const request = (async () => {
      const market = await queryMarketBySpu(
        spuId,
        this.env,
        () => this.reserveQuota(),
      )
      const value = { market, dataAsOf: new Date().toISOString() }
      await this.writeCache(cacheKey, value, MARKET_TTL_MS)
      return { value, cacheHit: false }
    })().finally(() => this.marketRequests.delete(cacheKey))

    this.marketRequests.set(cacheKey, request)
    try {
      return await request
    } catch (error) {
      this.logUpstreamError(error, requestId)
      throw error
    }
  }

  private async getBatchPrices(skuIds: string[], requestId: string) {
    const sorted = [...new Set(skuIds)].sort((left, right) => Number(left) - Number(right))
    const chunks: string[][] = []
    for (let index = 0; index < sorted.length; index += API_141_MAX_SKUS) {
      chunks.push(sorted.slice(index, index + API_141_MAX_SKUS))
    }

    const prices: NormalizedBatchPrice[] = []
    let allCacheHit = true
    let hadFailure = false
    let dataAsOf: string | null = null
    for (const chunk of chunks) {
      try {
        const result = await this.getPriceBatch(chunk, requestId)
        prices.push(...result.value.prices)
        allCacheHit &&= result.cacheHit
        if (!dataAsOf || result.value.dataAsOf > dataAsOf) {
          dataAsOf = result.value.dataAsOf
        }
      } catch (error) {
        if (!(error instanceof PoizonUpstreamError)) {
          throw error
        }
        hadFailure = true
        allCacheHit = false
      }
    }

    return {
      prices,
      cacheHit: !hadFailure && allCacheHit,
      dataAsOf,
    }
  }

  private async getPriceBatch(skuIds: string[], requestId: string) {
    const identity = [
      this.env.POIZON_BIDDING_TYPE,
      this.env.POIZON_REGION,
      this.env.POIZON_CURRENCY,
      ...skuIds,
    ].join(':')
    const cacheKey = `${PRICE_BATCH_CACHE_NAMESPACE}:${identity}`
    const cached = await this.readCache<PriceBatchCacheValue>(cacheKey)
    if (cached) {
      return { value: cached, cacheHit: true }
    }

    const inFlight = this.priceBatchRequests.get(cacheKey)
    if (inFlight) {
      return inFlight
    }

    const request = (async () => {
      const prices = await queryBatchPrices(
        skuIds,
        this.env,
        () => this.reserveQuota(),
      )
      const value = { prices, dataAsOf: new Date().toISOString() }
      await this.writeCache(cacheKey, value, PRICE_TTL_MS)
      return { value, cacheHit: false }
    })().finally(() => this.priceBatchRequests.delete(cacheKey))

    this.priceBatchRequests.set(cacheKey, request)
    try {
      return await request
    } catch (error) {
      this.logUpstreamError(error, requestId)
      throw error
    }
  }

  private async getLegacyPrice(skuId: string, requestId: string) {
    const cacheKey = [
      LEGACY_PRICE_CACHE_NAMESPACE,
      this.env.POIZON_BIDDING_TYPE,
      this.env.POIZON_REGION,
      this.env.POIZON_CURRENCY,
      skuId,
    ].join(':')
    const cached = await this.readCache<PriceCacheValue>(cacheKey)
    if (cached) {
      return { price: cached, cacheHit: true }
    }

    const inFlight = this.legacyPriceRequests.get(cacheKey)
    if (inFlight) {
      return inFlight
    }

    const request = (async () => {
      const price = await queryConsignmentPrice(
        skuId,
        this.env,
        () => this.reserveQuota(),
      )
      if (!price) {
        return { price: null, cacheHit: false }
      }

      const value = { ...price, dataAsOf: new Date().toISOString() }
      await this.writeCache(cacheKey, value, PRICE_TTL_MS)
      return { price: value, cacheHit: false }
    })().finally(() => this.legacyPriceRequests.delete(cacheKey))

    this.legacyPriceRequests.set(cacheKey, request)
    try {
      return await request
    } catch (error) {
      this.logUpstreamError(error, requestId)
      throw error
    }
  }

  private async readCache<T>(key: string): Promise<T | null> {
    const entry = await this.state.storage.get<CacheEntry<T>>(key)
    if (!entry) {
      return null
    }
    if (entry.expiresAt > Date.now()) {
      return entry.value
    }
    await this.state.storage.delete(key)
    return null
  }

  private async writeCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.state.storage.put<CacheEntry<T>>(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    })
  }

  private reserveQuota(): Promise<void> {
    const reservation = this.quotaQueue.then(() => this.reserveQuotaSlot())
    this.quotaQueue = reservation.catch(() => undefined)
    return reservation
  }

  private async reserveQuotaSlot(): Promise<void> {
    if (!this.quotaState) {
      this.quotaState =
        (await this.state.storage.get<QuotaState>('quota-state')) ??
        createQuotaState(Date.now())
    }

    const spacing = this.quotaState.lastRequestAt + MINIMUM_UPSTREAM_INTERVAL_MS - Date.now()
    if (spacing > 0) {
      await sleep(spacing)
    }

    const now = Date.now()
    let retryAfterMs = 0
    for (const name of Object.keys(QUOTA_WINDOWS) as Array<keyof typeof QUOTA_WINDOWS>) {
      const rule = QUOTA_WINDOWS[name]
      let bucket = this.quotaState[name]
      if (now >= bucket.windowStartedAt + rule.durationMs) {
        bucket = createBucket(now, rule.durationMs)
        this.quotaState[name] = bucket
      }
      if (bucket.count >= rule.limit) {
        retryAfterMs = Math.max(
          retryAfterMs,
          bucket.windowStartedAt + rule.durationMs - now,
        )
      }
    }

    if (retryAfterMs > 0) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'POIZON APIの利用上限に達しました。時間をおいて再試行してください。',
        true,
        Math.max(1, Math.ceil(retryAfterMs / 1_000)),
      )
    }

    this.quotaState.lastRequestAt = now
    this.quotaState.minute.count += 1
    this.quotaState.hour.count += 1
    this.quotaState.day.count += 1
    await this.state.storage.put('quota-state', this.quotaState)
  }

  private logUpstreamError(error: unknown, requestId: string): void {
    if (!(error instanceof PoizonUpstreamError)) {
      return
    }
    console.error(
      JSON.stringify({
        event: 'poizon_upstream_error',
        requestId,
        apiId: error.apiId,
        kind: error.kind,
        httpStatus: error.httpStatus,
        poizonCode: error.poizonCode,
        traceId: error.traceId,
      }),
    )
  }

  private toApiError(error: unknown, requestId: string): ApiError {
    if (error instanceof ApiError) {
      return error
    }
    if (error instanceof PoizonUpstreamError) {
      if (error.kind === 'configuration') {
        return new ApiError(
          503,
          'POIZON_CONFIGURATION_ERROR',
          'POIZON APIの設定を確認してください。',
          false,
        )
      }
      if (error.kind === 'bad_response') {
        return new ApiError(
          502,
          'POIZON_BAD_RESPONSE',
          'POIZON APIから予期しない応答を受信しました。',
          true,
        )
      }
      return new ApiError(
        503,
        'POIZON_UNAVAILABLE',
        'POIZON APIへ接続できませんでした。',
        true,
      )
    }

    console.error(JSON.stringify({ event: 'gateway_error', requestId }))
    return new ApiError(500, 'INTERNAL_ERROR', '内部エラーが発生しました。', true)
  }
}
