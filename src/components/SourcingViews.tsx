import type {
  ScanHistoryEntry,
  SizeSourcingEvaluation,
  SourcingEvaluation,
} from '../types/history'
import type { PoizonMarketWarning } from '../types/poizon'
import { displaySizes, getEntryEvaluation } from '../utils/sourcingDisplay'
import { ProductImage } from './ProductImage'

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

function formatPrice(value: number | null) {
  return value === null ? '—' : yenFormatter.format(value)
}

function formatSales(value: number | null) {
  return value === null ? '—' : `${value}件`
}

function hasMarketValue(size: SizeSourcingEvaluation) {
  return [
    size.sales30d,
    size.averageTransactionPrice,
    size.referencePrice,
    size.calculationBasisPrice,
    size.purchaseBenchmark,
  ].some((value) => value !== null && value !== undefined)
}

function SizeEvaluationRow({ size }: { size: SizeSourcingEvaluation }) {
  return (
    <li className={`sourcing-size-row${size.scanned ? ' is-scanned' : ''}`}>
      <div className="sourcing-size-name">
        <strong>{displaySizes(size.sizes)}</strong>
        {size.scanned && <span className="read-badge">読取</span>}
      </div>
      <dl>
        <div><dt>30日販売数</dt><dd>{formatSales(size.sales30d)}</dd></div>
        <div><dt>30日平均成約価格</dt><dd>{formatPrice(size.averageTransactionPrice ?? null)}</dd></div>
        <div><dt>POIZON参考価格</dt><dd>{formatPrice(size.referencePrice)}</dd></div>
        <div><dt>仕入れ計算基準価格</dt><dd>{formatPrice(size.calculationBasisPrice ?? size.referencePrice)}</dd></div>
        <div><dt>概算仕入れ基準価格</dt><dd>{formatPrice(size.purchaseBenchmark)}</dd></div>
      </dl>
    </li>
  )
}

export function SizeEvaluationDetails({
  evaluation,
  warnings = [],
}: {
  evaluation: SourcingEvaluation
  warnings?: PoizonMarketWarning[]
}) {
  const visibleSizes = evaluation.sizes.filter(hasMarketValue)
  const unavailableSizes = evaluation.sizes.filter((size) => !hasMarketValue(size))
  const salesPartial = warnings.includes('SALES_PARTIAL')

  return (
    <details className="sourcing-size-details">
      <summary>全サイズの価格・販売数を見る（{evaluation.totalSizeCount}）</summary>
      <div className="sourcing-overall-row">
        <strong>全体</strong>
        <dl>
          <div><dt>{salesPartial ? '30日販売数（取得済み範囲）' : '30日販売数'}</dt><dd>{formatSales(evaluation.totalSales30d)}</dd></div>
          <div><dt>30日平均成約価格</dt><dd>{formatPrice(evaluation.salesWeightedAveragePrice ?? null)}</dd></div>
        </dl>
        <small>平均成約価格は販売数による加重平均</small>
      </div>
      {evaluation.sizes.length === 0 ? (
        <p className="history-empty">全サイズの市場データを取得できませんでした。</p>
      ) : visibleSizes.length === 0 ? (
        <p className="history-empty">表示できるサイズ別市場データがありません。</p>
      ) : (
        <ul className="sourcing-size-list">
          {visibleSizes.map((size) => (
            <SizeEvaluationRow key={`${size.skuId}-${size.globalSkuId}`} size={size} />
          ))}
        </ul>
      )}
      {unavailableSizes.length > 0 && (
        <details className="unavailable-size-details">
          <summary>データなし・非表示：{unavailableSizes.length}サイズ</summary>
          <p>{unavailableSizes.map(({ sizes }) => displaySizes(sizes)).join(' / ')}</p>
        </details>
      )}
      <p className="estimate-note">
        POIZON参考価格と30日平均成約価格の低い方を基準に、保存時点の手数料ポリシーから求めた概算です。利益を保証するものではありません。
      </p>
    </details>
  )
}

export function CandidateCard({ entry }: { entry: ScanHistoryEntry }) {
  const evaluation = getEntryEvaluation(entry)
  if (!evaluation) return null
  const product = entry.poizon?.product
  const marketWarnings = entry.poizon?.market?.warnings ?? []
  const salesPartial = marketWarnings.includes('SALES_PARTIAL')
  const pricePartial = marketWarnings.includes('PRICE_PARTIAL')

  return (
    <article className="candidate-card">
      <div className="candidate-heading">
        <div className="candidate-heading-main">
          <ProductImage imageUrl={product?.imageUrl} size="compact" />
          <div className="candidate-heading-copy">
            <p className="candidate-brand">{product?.brandName || 'POIZON'}</p>
            <h3>{product?.articleNumber || '型番未取得'}</h3>
            {product?.title && (
              <details className="candidate-title-details">
                <summary>商品名</summary>
                <p>{product.title}</p>
              </details>
            )}
          </div>
        </div>
        <div className="candidate-heading-aside">
          <span className="candidate-badge">候補</span>
        </div>
      </div>
      {(salesPartial || pricePartial) && (
        <div className="market-coverage-warning" role="status">
          {salesPartial && <p>一部サイズの販売数が未取得です。合計は取得済み範囲です。</p>}
          {pricePartial && <p>一部サイズのPOIZON参考価格が未取得です。</p>}
        </div>
      )}
      <div className="candidate-primary-summary">
        <div className="candidate-sales-summary">
          <span>{salesPartial ? '取得済みサイズ・30日販売数' : '全サイズ・30日販売数'}</span>
          <strong>{formatSales(evaluation.totalSales30d)}</strong>
          <small>{evaluation.sellingSizeCount}/{evaluation.totalSizeCount}サイズで販売実績</small>
        </div>
        <div className="benchmark-summary">
          <span>仕入れ基準価格・中央値</span>
          {evaluation.benchmarkMedian === null ? (
            <strong className="benchmark-unavailable">算出不可</strong>
          ) : (
            <>
              <strong>{formatPrice(evaluation.benchmarkMedian)}</strong>
              <small>{formatPrice(evaluation.benchmarkMin)} ～ {formatPrice(evaluation.benchmarkMax)}</small>
            </>
          )}
        </div>
      </div>
      <SizeEvaluationDetails evaluation={evaluation} warnings={marketWarnings} />
    </article>
  )
}
