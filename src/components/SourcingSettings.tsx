import { useState } from 'react'
import {
  DEFAULT_SOURCING_SETTINGS,
  type SourcingSettings as SourcingSettingsValue,
} from '../utils/sourcingEvaluation'

type SourcingSettingsProps = {
  settings: SourcingSettingsValue
  onSave: (settings: SourcingSettingsValue) => void
  onReset: () => void
}

export function SourcingSettings({
  settings,
  onSave,
  onReset,
}: SourcingSettingsProps) {
  const [rate, setRate] = useState(String(settings.minimumProfitRate * 100))
  const [amount, setAmount] = useState(String(settings.minimumProfitAmount))
  const [message, setMessage] = useState<string | null>(null)

  const save = () => {
    const parsedRate = Number(rate)
    const parsedAmount = Number(amount)
    if (
      !Number.isFinite(parsedRate) ||
      parsedRate < 0 ||
      parsedRate >= 100 ||
      !Number.isInteger(parsedAmount) ||
      parsedAmount < 0
    ) {
      setMessage('利益率は0%以上100%未満、最低利益額は0円以上の整数で入力してください。')
      return
    }

    onSave({
      minimumProfitRate: parsedRate / 100,
      minimumProfitAmount: parsedAmount,
    })
    setRate(String(parsedRate))
    setAmount(String(parsedAmount))
    setMessage('仕入れ基準を保存し、仕入れ基準価格を再計算しました。')
  }

  const reset = () => {
    onReset()
    setRate(String(DEFAULT_SOURCING_SETTINGS.minimumProfitRate * 100))
    setAmount(String(DEFAULT_SOURCING_SETTINGS.minimumProfitAmount))
    setMessage('初期設定に戻しました。')
  }

  return (
    <section className="settings-card" aria-labelledby="sourcing-settings-title">
      <div className="settings-heading">
        <div>
          <p className="eyebrow">PURCHASE RULE</p>
          <h2 id="sourcing-settings-title">仕入れ基準</h2>
        </div>
        <span>この端末に保存</span>
      </div>

      <div className="settings-fields">
        <label>
          <span>最低売上利益率</span>
          <span className="settings-input-wrap">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="99.9"
              step="0.1"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
            <span>%</span>
          </span>
        </label>
        <label>
          <span>最低見込み利益</span>
          <span className="settings-input-wrap">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="100"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <span>円</span>
          </span>
        </label>
      </div>

      <p className="settings-explanation">
        手数料差引後の金額から、最低利益率と最低見込み利益の両方を確保できる仕入れ価格を100円単位で算出します。
      </p>

      {message && <p className="settings-message" role="status">{message}</p>}

      <div className="settings-actions">
        <button type="button" className="button button--primary" onClick={save}>
          設定を保存
        </button>
        <button type="button" className="button button--secondary" onClick={reset}>
          初期値に戻す
        </button>
      </div>
    </section>
  )
}
