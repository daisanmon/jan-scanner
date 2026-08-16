import { useCallback, useEffect, useRef, useState } from 'react'
import { isPoizonPublicConfigReady, POIZON_PUBLIC_CONFIG } from '../config/publicConfig'
import { usePoizonLookup } from '../hooks/usePoizonLookup'
import { hasValidPoizonSession } from '../services/poizonApi'
import type {
  PoizonMarketData,
  PoizonProductCandidate,
  PoizonSize,
  PoizonSizeMarketData,
} from '../types/poizon'
import type { StorablePoizonLookupResponse } from '../types/history'
import { TurnstileWidget } from './TurnstileWidget'

export type PoizonLookupTarget = {
  janCode: string
  sequence: number
  historyEntryId?: string
}

type PoizonLookupPanelProps = {
  target: PoizonLookupTarget | null
  onLookupComplete?: (
    target: PoizonLookupTarget,
    response: StorablePoizonLookupResponse,
  ) => void
  onLookupReview?: (target: PoizonLookupTarget, message: string) => void
  onLookupError?: (target: PoizonLookupTarget, message: string) => void
}

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('ja-JP', {
  maximumFractionDigits: 1,
})

const percentFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'always',
})

function displaySizes(sizes: PoizonSize[]): string {
  if (sizes.length === 0) {
    return 'サイズ情報なし'
  }
  const hasWomenSize = sizes.some(({ system }) => system === 'US Women')
  return sizes
    .map(({ system, value }) => {
      const label = system === 'US Men'
        ? hasWomenSize ? 'US M' : 'US'
        : system === 'US Women' ? 'US W' : system
      return `${label} ${value}`
    })
    .join(' / ')
}

function formatPrice(value: number | null): string {
  return value === null ? '—' : yenFormatter.format(value)
}

function formatNumber(value: number | null): string {
  return value === null ? '—' : numberFormatter.format(value)
}

function formatRatio(value: number | null): string {
  return value === null ? '—' : percentFormatter.format(value)
}

export function ProductSummary({ product }: { product: PoizonProductCandidate }) {
  return (
    <div className="poizon-product">
      <p className="poizon-product-title">{product.title || `SPU ${product.spuId}`}</p>
      {product.brandName && <p className="poizon-brand">{product.brandName}</p>}
      <p className="poizon-size">JAN照会サイズ: {displaySizes(product.sizes)}</p>
      <dl className="poizon-identifiers">
        <div><dt>spuId</dt><dd>{product.spuId}</dd></div>
        <div><dt>skuId</dt><dd>{product.skuId}</dd></div>
        <div><dt>globalSkuId</dt><dd>{product.globalSkuId}</dd></div>
      </dl>
    </div>
  )
}

function RangeMetric({
  label,
  min,
  median,
  max,
  formatter,
}: {
  label: string
  min: number | null
  median: number | null
  max: number | null
  formatter: (value: number | null) => string
}) {
  return (
    <section className="poizon-range" aria-label={label}>
      <h3>{label}</h3>
      <dl>
        <div><dt>最小</dt><dd>{formatter(min)}</dd></div>
        <div className="poizon-range-median"><dt>中央値</dt><dd>{formatter(median)}</dd></div>
        <div><dt>最大</dt><dd>{formatter(max)}</dd></div>
      </dl>
    </section>
  )
}

function SizeMarketRow({ size }: { size: PoizonSizeMarketData }) {
  return (
    <li className={size.scanned ? 'poizon-size-row poizon-size-row--scanned' : 'poizon-size-row'}>
      <div className="poizon-size-row-heading">
        <strong>{displaySizes(size.sizes)}</strong>
        {size.scanned && <span>スキャンしたサイズ</span>}
      </div>
      <dl className="poizon-size-metrics">
        <div>
          <dt>仕入れ基準価格</dt>
          <dd>{formatPrice(size.asiaMinPrice)}</dd>
        </div>
        <div>
          <dt>30日販売数</dt>
          <dd>{formatNumber(size.globalSoldNum30)}</dd>
        </div>
        <div>
          <dt>30日平均成約価格</dt>
          <dd>{formatPrice(size.averageTransactionPrice)}</dd>
        </div>
        <div>
          <dt>前月比</dt>
          <dd>{formatRatio(size.globalMonthToMonthRatio)}</dd>
        </div>
      </dl>
      <p className="poizon-size-row-meta">
        skuId {size.skuId}
        {size.globalMinPrice !== null && size.globalMinPrice !== size.asiaMinPrice
          ? ` / グローバル参考 ${formatPrice(size.globalMinPrice)}`
          : ''}
      </p>
    </li>
  )
}

export function MarketView({ market }: { market: PoizonMarketData }) {
  const { summary } = market
  const bestSelling = market.sizes.find(
    (size) => size.skuId === summary.bestSellingSkuId,
  )
  const timestamp = market.priceDataAsOf ?? market.marketDataAsOf

  return (
    <div className="poizon-market">
      <div className="poizon-market-primary">
        <div>
          <span>中国市場・過去30日販売数</span>
          <strong>{formatNumber(summary.globalSoldNum30Total)}</strong>
          <small>
            {summary.salesPerSize.reportedSizeCount}/{summary.salesPerSize.totalSizeCount}サイズ集計・API表記: Global
          </small>
        </div>
        <div>
          <span>仕入れ基準価格・中央値</span>
          <strong>{formatPrice(summary.referencePrice.median)}</strong>
          <small>{summary.referencePrice.reportedSizeCount}/{summary.referencePrice.totalSizeCount}サイズ</small>
        </div>
      </div>

      <RangeMetric
        label="仕入れ基準価格"
        min={summary.referencePrice.min}
        median={summary.referencePrice.median}
        max={summary.referencePrice.max}
        formatter={formatPrice}
      />
      <RangeMetric
        label="サイズ別・過去30日販売数"
        min={summary.salesPerSize.min}
        median={summary.salesPerSize.median}
        max={summary.salesPerSize.max}
        formatter={formatNumber}
      />

      <dl className="poizon-market-secondary">
        <div>
          <dt>販売数加重・30日平均成約価格</dt>
          <dd>{formatPrice(summary.salesWeightedAveragePrice)}</dd>
        </div>
        <div>
          <dt>最も売れたサイズ</dt>
          <dd>
            {bestSelling
              ? `${displaySizes(bestSelling.sizes)}・${formatNumber(bestSelling.globalSoldNum30)}`
              : '—'}
          </dd>
        </div>
      </dl>

      {market.warnings.length > 0 && (
        <p className="poizon-message poizon-message--warning">
          一部サイズの価格または販売統計を取得できなかったため、集計できた範囲を表示しています。
        </p>
      )}

      <details className="poizon-size-details">
        <summary>全サイズの価格・販売数を見る（{market.sizes.length}）</summary>
        <ul className="poizon-size-list">
          {market.sizes.map((size) => (
            <SizeMarketRow key={size.skuId} size={size} />
          ))}
        </ul>
      </details>

      <p className="poizon-as-of">
        取得時刻: {new Date(timestamp).toLocaleString('ja-JP')}
      </p>
    </div>
  )
}

export function LegacyPriceView({
  price,
}: {
  price: { globalMinPrice: number; asiaMinPrice: number; dataAsOf: string }
}) {
  return (
    <>
      <p className="poizon-message poizon-message--warning">
        全サイズの市場統計を取得できなかったため、スキャンしたサイズの参考価格を表示しています。
      </p>
      <div className="poizon-prices">
        <div><span>グローバル参考価格</span><strong>{yenFormatter.format(price.globalMinPrice)}</strong></div>
        <div><span>アジア参考価格</span><strong>{yenFormatter.format(price.asiaMinPrice)}</strong></div>
      </div>
      <p className="poizon-as-of">
        取得時刻: {new Date(price.dataAsOf).toLocaleString('ja-JP')}
      </p>
    </>
  )
}

export function PoizonSavedResult({
  response,
}: {
  response: StorablePoizonLookupResponse
}) {
  if (response.state === 'not_found') {
    return <p className="poizon-message">このJANコードに一致する商品は見つかりませんでした。</p>
  }

  if (response.state === 'price_unavailable') {
    return (
      <div>
        <ProductSummary product={response.product} />
        {response.market && <MarketView market={response.market} />}
        <p className="poizon-message poizon-message--warning">
          商品は見つかりましたが、スキャンしたサイズの参考価格を取得できません。
        </p>
      </div>
    )
  }

  return (
    <div>
      <ProductSummary product={response.product} />
      {response.market
        ? <MarketView market={response.market} />
        : <LegacyPriceView price={response.price} />}
    </div>
  )
}

export function PoizonLookupPanel({
  target,
  onLookupComplete,
  onLookupReview,
  onLookupError,
}: PoizonLookupPanelProps) {
  const { state, lookup } = usePoizonLookup()
  const [token, setToken] = useState<string | null>(null)
  const [sessionAvailable, setSessionAvailable] = useState(
    hasValidPoizonSession,
  )
  const [challengeKey, setChallengeKey] = useState(0)
  const [challengeError, setChallengeError] = useState(false)
  const handledSequenceRef = useRef<number | null>(null)
  const reportedErrorSequenceRef = useRef<number | null>(null)
  const configured = isPoizonPublicConfigReady()

  const renewChallenge = useCallback(() => {
    setToken(null)
    setSessionAvailable(false)
    setChallengeError(false)
    setChallengeKey((current) => current + 1)
  }, [])

  const runLookup = useCallback(
    async (selectedSpuId?: string) => {
      if (!target || (!token && !sessionAvailable)) {
        return
      }
      const currentToken = token
      setToken(null)
      const response = await lookup({
        janCode: target.janCode,
        selectedSpuId,
        turnstileToken: currentToken ?? undefined,
      })
      const hasSession = hasValidPoizonSession()
      setSessionAvailable(hasSession)
      if (response && response.state !== 'selection_required') {
        onLookupComplete?.(target, response)
      }
      if (response?.state === 'selection_required') {
        onLookupReview?.(target, '複数の商品候補が見つかりました。')
      }
      if (!response && !hasSession) {
        renewChallenge()
      } else if (response?.state === 'selection_required' && !hasSession) {
        renewChallenge()
      }
    },
    [
      lookup,
      onLookupComplete,
      onLookupReview,
      renewChallenge,
      sessionAvailable,
      target,
      token,
    ],
  )

  useEffect(() => {
    if (
      configured &&
      target &&
      (token || sessionAvailable) &&
      handledSequenceRef.current !== target.sequence
    ) {
      handledSequenceRef.current = target.sequence
      void runLookup()
    }
  }, [configured, runLookup, sessionAvailable, target, token])

  useEffect(() => {
    if (
      target &&
      state.status === 'error' &&
      reportedErrorSequenceRef.current !== target.sequence
    ) {
      reportedErrorSequenceRef.current = target.sequence
      onLookupError?.(target, state.error.message)
    }
  }, [onLookupError, state, target])

  const handleChallengeError = useCallback(() => {
    setToken(null)
    setChallengeError(true)
  }, [])

  let content
  if (!configured) {
    content = (
      <p className="poizon-message">
        POIZON連携はバックエンドのデプロイと公開設定の反映後に有効になります。
      </p>
    )
  } else if (!target) {
    content = <p className="poizon-message">JANコードを読み取ると商品と市場データを照会します。</p>
  } else if (state.status === 'idle') {
    content = <p className="poizon-message">商品・市場データの照会を開始します…</p>
  } else if (state.status === 'loading') {
    content = <p className="poizon-message" role="status">POIZONへ照会しています…</p>
  } else if (state.status === 'error') {
    content = (
      <div className="poizon-error" role="alert">
        <p>{state.error.message}</p>
        {state.error.retryable && (
          <button
            className="text-button"
            type="button"
            disabled={!token && !sessionAvailable}
            onClick={() => void runLookup()}
          >
            再試行
          </button>
        )}
      </div>
    )
  } else if (state.response.state === 'not_found') {
    content = <PoizonSavedResult response={state.response} />
  } else if (state.response.state === 'selection_required') {
    content = (
      <div>
        <p className="poizon-message">候補が複数あります。商品型番を選択してください。</p>
        <ul className="poizon-candidates">
          {state.response.candidates.map((candidate) => (
            <li key={candidate.spuId}>
              <button
                type="button"
                disabled={!token && !sessionAvailable}
                onClick={() => void runLookup(candidate.spuId)}
              >
                <span>{candidate.title || `SPU ${candidate.spuId}`}</span>
                <strong>SPU {candidate.spuId}・{displaySizes(candidate.sizes)}</strong>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  } else if (state.response.state === 'price_unavailable') {
    content = <PoizonSavedResult response={state.response} />
  } else {
    content = <PoizonSavedResult response={state.response} />
  }

  return (
    <section className="feature-card poizon-card" aria-labelledby="poizon-heading">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">POIZON</p>
          <h2 id="poizon-heading">商品・市場データ</h2>
        </div>
      </div>
      {target && <p className="poizon-jan">JAN {target.janCode}</p>}
      {content}
      {configured && target && !sessionAvailable && (
        <div className="poizon-challenge">
          <TurnstileWidget
            key={challengeKey}
            siteKey={POIZON_PUBLIC_CONFIG.turnstileSiteKey}
            onToken={setToken}
            onError={handleChallengeError}
          />
          {challengeError && (
            <p className="field-error" role="alert">ブラウザ確認を読み込めませんでした。</p>
          )}
        </div>
      )}
    </section>
  )
}
