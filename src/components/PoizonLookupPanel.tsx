import { useCallback, useEffect, useRef, useState } from 'react'
import { isPoizonPublicConfigReady, POIZON_PUBLIC_CONFIG } from '../config/publicConfig'
import { usePoizonLookup } from '../hooks/usePoizonLookup'
import type { PoizonProductCandidate } from '../types/poizon'
import { TurnstileWidget } from './TurnstileWidget'

export type PoizonLookupTarget = {
  janCode: string
  sequence: number
}

type PoizonLookupPanelProps = {
  target: PoizonLookupTarget | null
}

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

function displaySize(candidate: PoizonProductCandidate): string {
  if (candidate.sizes.length === 0) {
    return 'サイズ情報なし'
  }
  return candidate.sizes
    .map(({ system, value }) => `${system === 'US Men' ? 'US' : system} ${value}`)
    .join(' / ')
}

function ProductSummary({ product }: { product: PoizonProductCandidate }) {
  return (
    <div className="poizon-product">
      <p className="poizon-product-title">{product.title || `SPU ${product.spuId}`}</p>
      {product.brandName && <p className="poizon-brand">{product.brandName}</p>}
      <p className="poizon-size">{displaySize(product)}</p>
      <dl className="poizon-identifiers">
        <div><dt>spuId</dt><dd>{product.spuId}</dd></div>
        <div><dt>skuId</dt><dd>{product.skuId}</dd></div>
        <div><dt>globalSkuId</dt><dd>{product.globalSkuId}</dd></div>
      </dl>
    </div>
  )
}

export function PoizonLookupPanel({ target }: PoizonLookupPanelProps) {
  const { state, lookup } = usePoizonLookup()
  const [token, setToken] = useState<string | null>(null)
  const [challengeKey, setChallengeKey] = useState(0)
  const [challengeError, setChallengeError] = useState(false)
  const handledSequenceRef = useRef<number | null>(null)
  const configured = isPoizonPublicConfigReady()

  const renewChallenge = useCallback(() => {
    setToken(null)
    setChallengeError(false)
    setChallengeKey((current) => current + 1)
  }, [])

  const runLookup = useCallback(
    async (selectedSkuId?: string) => {
      if (!target || !token) {
        return
      }
      const currentToken = token
      setToken(null)
      const response = await lookup({
        janCode: target.janCode,
        selectedSkuId,
        turnstileToken: currentToken,
      })
      if (!response || response.state === 'selection_required') {
        renewChallenge()
      }
    },
    [lookup, renewChallenge, target, token],
  )

  useEffect(() => {
    if (
      configured &&
      target &&
      token &&
      handledSequenceRef.current !== target.sequence
    ) {
      handledSequenceRef.current = target.sequence
      void runLookup()
    }
  }, [configured, runLookup, target, token])

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
    content = <p className="poizon-message">JANコードを読み取ると商品と参考価格を照会します。</p>
  } else if (state.status === 'idle') {
    content = <p className="poizon-message">ブラウザ確認が完了するまでお待ちください。</p>
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
            disabled={!token}
            onClick={() => void runLookup()}
          >
            再試行
          </button>
        )}
      </div>
    )
  } else if (state.response.state === 'not_found') {
    content = <p className="poizon-message">このJANコードに一致する商品は見つかりませんでした。</p>
  } else if (state.response.state === 'selection_required') {
    content = (
      <div>
        <p className="poizon-message">候補が複数あります。サイズを選択してください。</p>
        <ul className="poizon-candidates">
          {state.response.candidates.map((candidate) => (
            <li key={candidate.skuId}>
              <button
                type="button"
                disabled={!token}
                onClick={() => void runLookup(candidate.skuId)}
              >
                <span>{candidate.title || `SPU ${candidate.spuId}`}</span>
                <strong>{displaySize(candidate)}</strong>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  } else if (state.response.state === 'price_unavailable') {
    content = (
      <div>
        <ProductSummary product={state.response.product} />
        <p className="poizon-message poizon-message--warning">
          商品は見つかりましたが、現在は参考価格を取得できません。
        </p>
      </div>
    )
  } else {
    content = (
      <div>
        <ProductSummary product={state.response.product} />
        <div className="poizon-prices">
          <div><span>グローバル参考価格</span><strong>{yenFormatter.format(state.response.price.globalMinPrice)}</strong></div>
          <div><span>アジア参考価格</span><strong>{yenFormatter.format(state.response.price.asiaMinPrice)}</strong></div>
        </div>
        <p className="poizon-as-of">
          取得時刻: {new Date(state.response.price.dataAsOf).toLocaleString('ja-JP')}
        </p>
      </div>
    )
  }

  return (
    <section className="feature-card poizon-card" aria-labelledby="poizon-heading">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">POIZON</p>
          <h2 id="poizon-heading">商品・参考価格</h2>
        </div>
      </div>
      {target && <p className="poizon-jan">JAN {target.janCode}</p>}
      {content}
      {configured && (
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
