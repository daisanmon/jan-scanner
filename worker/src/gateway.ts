import type {
  PoizonLookupResponse,
  PoizonProductCandidate,
} from '../../shared/poizon'
import type { GatewayLookupRequest } from './contracts'
import { errorResponse, jsonResponse } from './contracts'
import type { WorkerEnv } from './env'
import { ApiError, PoizonUpstreamError } from './errors'
import {
  queryConsignmentPrice,
  queryProductsByBarcode,
} from './poizon/client'
import type { NormalizedPrice } from './poizon/normalize'

const PRODUCT_TTL_MS = 24 * 60 * 60 * 1_000
const NEGATIVE_PRODUCT_TTL_MS = 10 * 60 * 1_000
const PRICE_TTL_MS = 2 * 60 * 1_000
const MINIMUM_UPSTREAM_INTERVAL_MS = 250

const QUOTA_WINDOWS = {
  minute: { durationMs: 60 * 1_000, limit: 240 },
  hour: { durationMs: 60 * 60 * 1_000, limit: 8_000 },
  day: { durationMs: 24 * 60 * 60 * 1_000, limit: 18_000 },
} as const

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

type PriceCacheValue = NormalizedPrice & {
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

export class PoizonGateway implements DurableObject {
  private readonly state: DurableObjectState
  private readonly env: WorkerEnv
  private quotaQueue: Promise<void> = Promise.resolve()
  private quotaState: QuotaState | undefined
  private readonly productRequests = new Map<
    string,
    Promise<{ candidates: PoizonProductCandidate[]; cacheHit: boolean }>
  >()
  private readonly priceRequests = new Map<
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
    const productResult = await this.getProducts(input.janCode, input.requestId)
    const cache = { product: productResult.cacheHit, price: false }

    if (productResult.candidates.length === 0) {
      return { requestId: input.requestId, state: 'not_found', cache }
    }

    let product: PoizonProductCandidate | undefined
    if (input.selectedSkuId) {
      product = productResult.candidates.find(
        (candidate) => candidate.skuId === input.selectedSkuId,
      )
      if (!product) {
        throw new ApiError(
          409,
          'SELECTION_STALE',
          '商品候補が更新されました。JANコードをもう一度照会してください。',
          true,
        )
      }
    } else if (productResult.candidates.length > 1) {
      return {
        requestId: input.requestId,
        state: 'selection_required',
        candidates: productResult.candidates,
        cache,
      }
    } else {
      product = productResult.candidates[0]
    }

    const priceResult = await this.getPrice(product.skuId, input.requestId)
    cache.price = priceResult.cacheHit
    if (!priceResult.price) {
      return {
        requestId: input.requestId,
        state: 'price_unavailable',
        product,
        cache,
      }
    }

    return {
      requestId: input.requestId,
      state: 'resolved',
      product,
      price: {
        currency: 'JPY',
        globalMinPrice: priceResult.price.globalMinPrice,
        asiaMinPrice: priceResult.price.asiaMinPrice,
        dataAsOf: priceResult.price.dataAsOf,
      },
      cache,
    }
  }

  private async getProducts(janCode: string, requestId: string) {
    const cacheKey = `product:${janCode}`
    const cached = await this.readCache<PoizonProductCandidate[]>(cacheKey)
    if (cached) {
      return { candidates: cached, cacheHit: true }
    }

    const inFlight = this.productRequests.get(cacheKey)
    if (inFlight) {
      return inFlight
    }

    const request = (async () => {
      const candidates = await queryProductsByBarcode(
        janCode,
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

  private async getPrice(skuId: string, requestId: string) {
    const cacheKey = `price:${skuId}`
    const cached = await this.readCache<PriceCacheValue>(cacheKey)
    if (cached) {
      return { price: cached, cacheHit: true }
    }

    const inFlight = this.priceRequests.get(cacheKey)
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
    })().finally(() => this.priceRequests.delete(cacheKey))

    this.priceRequests.set(cacheKey, request)
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
        'POIZON APIの利用上限に達しました。時間をおいてお試しください。',
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
