import { useState, type FormEvent } from 'react'
import { normalizeArticleNumber } from '../../shared/alpen'
import { parseAlpenLookup } from '../utils/productLookup'
import type { ProductLookup } from '../types/history'

export function AlpenManualEntry({ onRegister }: { onRegister: (lookup: ProductLookup) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = value.trim()
    const alpen = parseAlpenLookup(trimmed)
    const lookup = alpen ?? (normalizeArticleNumber(trimmed).length >= 2
      ? { kind: 'article' as const, articleNumber: trimmed }
      : null)
    if (!lookup) {
      setError('Alpen商品URL・10桁の商品番号・メーカー型番を入力してください。')
      return
    }
    onRegister(lookup)
    setValue('')
    setError(null)
  }

  return (
    <details className="feature-card collapsible-card">
      <summary className="collapsible-summary">
        <span><p className="eyebrow">MANUAL ENTRY</p><span className="collapsible-title">URL・商品番号・型番を手入力</span></span>
        <span className="collapsible-chevron" aria-hidden="true" />
      </summary>
      <div className="collapsible-body">
        <form className="manual-form" onSubmit={submit} noValidate>
          <label htmlFor="manual-alpen-product">Alpen商品またはメーカー型番</label>
          <div className="manual-input-row">
            <input id="manual-alpen-product" type="text" autoComplete="off" placeholder="商品URL・4051643735・MS327 CWB" value={value} onChange={(event) => { setValue(event.target.value); setError(null) }} />
            <button type="submit" className="button button--primary">登録</button>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
        </form>
      </div>
    </details>
  )
}
