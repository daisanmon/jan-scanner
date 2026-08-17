import type {
  ScanHistoryEntry,
  SizeSourcingEvaluation,
  SourcingEvaluation,
} from '../types/history'
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

function SizeEvaluationRow({ size }: { size: SizeSourcingEvaluation }) {
  return (
    <li className={`sourcing-size-row${size.scanned ? ' is-scanned' : ''}`}>
      <div className="sourcing-size-name">
        <strong>{displaySizes(size.sizes)}</strong>
        {size.scanned && <span className="read-badge">読取</span>}
      </div>
      <dl>
        <div><dt>30日販売数</dt><dd>{formatSales(size.sales30d)}</dd></div>
        <div><dt>POIZON参考価格</dt><dd>{formatPrice(size.referencePrice)}</dd></div>
        <div><dt>概算仕入れ基準価格</dt><dd>{formatPrice(size.purchaseBenchmark)}</dd></div>
      </dl>
    </li>
  )
}

export function SizeEvaluationDetails({
  evaluation,
}: {
  evaluation: SourcingEvaluation
}) {
  return (
    <details className="sourcing-size-details">
      <summary>全サイズの価格・販売数を見る</summary>
      {evaluation.sizes.length === 0 ? (
        <p className="history-empty">全サイズの市場データを取得できませんでした。</p>
      ) : (
        <ul className="sourcing-size-list">
          {evaluation.sizes.map((size) => (
            <SizeEvaluationRow key={`${size.skuId}-${size.globalSkuId}`} size={size} />
          ))}
        </ul>
      )}
      <p className="estimate-note">
        参考価格と保存時点の手数料ポリシーから求めた概算です。利益を保証するものではありません。
      </p>
    </details>
  )
}

export function CandidateCard({ entry }: { entry: ScanHistoryEntry }) {
  const evaluation = getEntryEvaluation(entry)
  if (!evaluation) return null
  const product = entry.poizon?.product
  const scannedSize = evaluation.sizes.find(({ scanned }) => scanned)
  const scanCount = entry.aggregation?.scanCount ?? 1

  return (
    <article className="candidate-card">
      <div className="candidate-heading">
        <div className="candidate-heading-main">
          <ProductImage imageUrl={product?.imageUrl} size="compact" />
          <div className="candidate-heading-copy">
            <p className="candidate-brand">{product?.brandName || 'POIZON'}</p>
            <h3>{product?.title || entry.janCode}</h3>
          </div>
        </div>
        <span className="candidate-badge">候補</span>
      </div>
      <p className="candidate-scanned-size">
        スキャンサイズ：{scannedSize ? displaySizes(scannedSize.sizes) : '—'}
      </p>
      <div className="candidate-sales-summary">
        <span>全サイズ・30日販売数</span>
        <strong>{formatSales(evaluation.totalSales30d)}</strong>
        <small>{evaluation.sellingSizeCount} / {evaluation.totalSizeCount}サイズで販売実績あり</small>
      </div>
      <div className="benchmark-summary">
        <span>概算仕入れ基準価格・中央値</span>
        {evaluation.benchmarkMedian === null ? (
          <strong className="benchmark-unavailable">基準価格を算出できません</strong>
        ) : (
          <>
            <strong>{formatPrice(evaluation.benchmarkMedian)}</strong>
            <small>{formatPrice(evaluation.benchmarkMin)} ～ {formatPrice(evaluation.benchmarkMax)}</small>
          </>
        )}
      </div>
      <dl className="candidate-meta">
        <div><dt>スキャンサイズの販売数</dt><dd>{formatSales(scannedSize?.sales30d ?? null)}</dd></div>
        <div><dt>スキャン回数</dt><dd>{scanCount}回</dd></div>
      </dl>
      <SizeEvaluationDetails evaluation={evaluation} />
    </article>
  )
}
