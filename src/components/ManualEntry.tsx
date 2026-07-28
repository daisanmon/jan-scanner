import { useState, type FormEvent } from 'react'
import { isValidJanCode } from '../utils/janCode'

type ManualEntryProps = {
  onRegister: (janCode: string) => void
}

export function ManualEntry({ onRegister }: ManualEntryProps) {
  const [value, setValue] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const janCode = value.trim()
    if (!/^[0-9]+$/.test(janCode)) {
      setErrorMessage('JANコードは数字だけで入力してください。')
      return
    }

    if (janCode.length !== 8 && janCode.length !== 13) {
      setErrorMessage('JANコードは8桁または13桁で入力してください。')
      return
    }

    if (!isValidJanCode(janCode)) {
      setErrorMessage('チェックデジットが正しくありません。入力内容を確認してください。')
      return
    }

    onRegister(janCode)
    setValue('')
    setErrorMessage(null)
  }

  return (
    <section className="feature-card" aria-labelledby="manual-entry-title">
      <div className="feature-heading">
        <div>
          <p className="eyebrow">MANUAL ENTRY</p>
          <h2 id="manual-entry-title">JANコードを手入力</h2>
        </div>
      </div>

      <form className="manual-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="manual-jan-code">JANコード</label>
        <div className="manual-input-row">
          <input
            id="manual-jan-code"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="8桁または13桁"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              if (errorMessage) {
                setErrorMessage(null)
              }
            }}
            aria-describedby={errorMessage ? 'manual-entry-error' : undefined}
            aria-invalid={errorMessage ? true : undefined}
          />
          <button type="submit" className="button button--primary">
            登録
          </button>
        </div>
        {errorMessage && (
          <p id="manual-entry-error" className="field-error" role="alert">
            {errorMessage}
          </p>
        )}
      </form>
    </section>
  )
}
