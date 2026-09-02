import type { WorkerEnv } from '../env'
import { PoizonUpstreamError } from '../errors'
import {
  normalizeBarcodeCandidates,
  normalizeArticleCandidates,
  normalizeBatchPrices,
  normalizeMarketProduct,
  normalizePrice,
  readPoizonEnvelope,
} from './normalize'
import { signPoizonRequest, type SignableParameters } from './signature'

const POIZON_ORIGIN = 'https://open.poizon.com'
const API_181_PATH = '/dop/api/v1/pop/api/v1/intl-commodity/intl/sku/sku-basic-info/by-barcodes'
const API_226_PATH = '/dop/api/v1/pop/api/v1/intl-commodity/intl/spu/spu-basic-info/by-article-number'
const API_169_PATH = '/dop/api/v1/pop/api/v1/intl-commodity/intl/sku/sku-basic-info/by-spu'
const API_93_PATH = '/dop/api/v1/pop/api/v1/recommend-bid/price'
const API_141_PATH = '/dop/api/v1/pop/api/v1/recommend-bid/batchPrice'
const REQUEST_TIMEOUT_MS = 5_000

export type QuotaReservation = () => Promise<void>
export type Fetcher = typeof fetch

async function fetchWithTimeout(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetcher(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function retryDelay(): Promise<void> {
  const delay = 250 + Math.floor(Math.random() * 501)
  return new Promise((resolve) => setTimeout(resolve, delay))
}

async function requestPoizon(
  apiId: 181 | 226 | 169 | 93 | 141,
  path: string,
  businessParameters: SignableParameters,
  env: WorkerEnv,
  reserveQuota: QuotaReservation,
  fetcher: Fetcher,
): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await reserveQuota()
    const parameters: SignableParameters = {
      ...businessParameters,
      app_key: env.POIZON_APP_KEY,
      timestamp: Date.now(),
      language: env.POIZON_LANGUAGE,
      timeZone: env.POIZON_TIME_ZONE,
    }
    const body = {
      ...parameters,
      sign: signPoizonRequest(parameters, env.POIZON_APP_SECRET),
    }

    try {
      const response = await fetchWithTimeout(fetcher, `${POIZON_ORIGIN}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      let parsed: unknown
      try {
        parsed = await response.json()
      } catch {
        throw new PoizonUpstreamError('bad_response', apiId, response.status)
      }

      const envelope = readPoizonEnvelope(parsed)
      if (response.ok && envelope.code === '200') {
        return parsed
      }

      if (response.status === 401 || response.status === 403) {
        throw new PoizonUpstreamError(
          'configuration',
          apiId,
          response.status,
          envelope.code,
          envelope.traceId,
        )
      }

      if ((response.status === 429 || response.status >= 500) && attempt === 0) {
        await retryDelay()
        continue
      }

      throw new PoizonUpstreamError(
        response.status === 429 || response.status >= 500 ? 'unavailable' : 'bad_response',
        apiId,
        response.status,
        envelope.code,
        envelope.traceId,
      )
    } catch (error) {
      if (error instanceof PoizonUpstreamError) {
        throw error
      }
      if (attempt === 0) {
        await retryDelay()
        continue
      }
      throw new PoizonUpstreamError('unavailable', apiId)
    }
  }

  throw new PoizonUpstreamError('unavailable', apiId)
}

export async function queryMarketBySpu(
  spuId: string,
  env: WorkerEnv,
  reserveQuota: QuotaReservation,
  fetcher: Fetcher = fetch,
) {
  const response = await requestPoizon(
    169,
    API_169_PATH,
    {
      spuIds: [Number(spuId)],
      sellerStatusEnable: false,
      buyStatusEnable: false,
      statisticsDataQry: {
        salesEnable: true,
        minPriceEnable: true,
      },
      region: env.POIZON_REGION,
    },
    env,
    reserveQuota,
    fetcher,
  )
  try {
    return normalizeMarketProduct(response, spuId)
  } catch {
    const envelope = readPoizonEnvelope(response)
    throw new PoizonUpstreamError('bad_response', 169, 200, envelope.code, envelope.traceId)
  }
}

export async function queryBatchPrices(
  skuIds: string[],
  env: WorkerEnv,
  reserveQuota: QuotaReservation,
  fetcher: Fetcher = fetch,
) {
  if (skuIds.length === 0 || skuIds.length > 20) {
    throw new RangeError('API 141 accepts between 1 and 20 SKU IDs')
  }
  const response = await requestPoizon(
    141,
    API_141_PATH,
    {
      skuIds: skuIds.map(Number),
      biddingType: Number(env.POIZON_BIDDING_TYPE),
      region: env.POIZON_REGION,
      currency: env.POIZON_CURRENCY,
    },
    env,
    reserveQuota,
    fetcher,
  )
  try {
    return normalizeBatchPrices(response)
  } catch {
    const envelope = readPoizonEnvelope(response)
    throw new PoizonUpstreamError('bad_response', 141, 200, envelope.code, envelope.traceId)
  }
}

export async function queryProductsByBarcode(
  janCode: string,
  env: WorkerEnv,
  reserveQuota: QuotaReservation,
  fetcher: Fetcher = fetch,
) {
  const barcodes =
    janCode.length === 13 && janCode.startsWith('0')
      ? [janCode, janCode.slice(1)]
      : [janCode]
  const response = await requestPoizon(
    181,
    API_181_PATH,
    { barcodes, pageNum: 1, pageSize: 100 },
    env,
    reserveQuota,
    fetcher,
  )
  try {
    return normalizeBarcodeCandidates(response, janCode, barcodes)
  } catch {
    const envelope = readPoizonEnvelope(response)
    throw new PoizonUpstreamError('bad_response', 181, 200, envelope.code, envelope.traceId)
  }
}

export async function queryProductsByArticleNumber(
  articleNumber: string,
  env: WorkerEnv,
  reserveQuota: QuotaReservation,
  fetcher: Fetcher = fetch,
) {
  const response = await requestPoizon(
    226,
    API_226_PATH,
    {
      articleNumber,
      region: env.POIZON_REGION,
      pageNum: 1,
      pageSize: 100,
    },
    env,
    reserveQuota,
    fetcher,
  )
  try {
    return normalizeArticleCandidates(response)
  } catch {
    const envelope = readPoizonEnvelope(response)
    throw new PoizonUpstreamError('bad_response', 226, 200, envelope.code, envelope.traceId)
  }
}

export async function queryConsignmentPrice(
  skuId: string,
  env: WorkerEnv,
  reserveQuota: QuotaReservation,
  fetcher: Fetcher = fetch,
) {
  const response = await requestPoizon(
    93,
    API_93_PATH,
    {
      skuId: Number(skuId),
      biddingType: Number(env.POIZON_BIDDING_TYPE),
      region: env.POIZON_REGION,
      currency: env.POIZON_CURRENCY,
    },
    env,
    reserveQuota,
    fetcher,
  )
  try {
    return normalizePrice(response)
  } catch {
    const envelope = readPoizonEnvelope(response)
    throw new PoizonUpstreamError('bad_response', 93, 200, envelope.code, envelope.traceId)
  }
}

export const POIZON_API_PATHS = {
  181: API_181_PATH,
  226: API_226_PATH,
  169: API_169_PATH,
  93: API_93_PATH,
  141: API_141_PATH,
} as const
