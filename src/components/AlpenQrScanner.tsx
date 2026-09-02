import { BrowserQRCodeReader } from '@zxing/browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseAlpenLookup } from '../utils/productLookup'

type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'stopped' | 'error'

export function AlpenQrScanner({ onRegister }: { onRegister: (value: string) => void }) {
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [lastValue, setLastValue] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const seenRef = useRef(new Set<string>())

  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    const stream = videoRef.current?.srcObject
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus((current) => current === 'idle' ? current : 'stopped')
  }, [])

  const start = useCallback(async () => {
    if (controlsRef.current || !videoRef.current) return
    setStatus('starting')
    setMessage(null)
    seenRef.current.clear()
    const reader = new BrowserQRCodeReader()
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        videoRef.current,
        (result) => {
          if (!result) return
          const rawValue = result.getText().trim()
          const lookup = parseAlpenLookup(rawValue)
          if (!lookup) {
            setMessage('Alpen公式の商品QRではありません。')
            return
          }
          if (seenRef.current.has(lookup.alpenProductId)) {
            setMessage('この読み取り中に登録済みのAlpen商品です。')
            return
          }
          seenRef.current.add(lookup.alpenProductId)
          setLastValue(lookup.alpenProductId)
          setMessage(null)
          onRegister(rawValue)
        },
      )
      setStatus('scanning')
    } catch (error) {
      controlsRef.current = null
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
      setMessage(name === 'NotAllowedError'
        ? 'カメラの使用が許可されていません。ブラウザ設定でカメラを許可してください。'
        : 'QRカメラを開始できませんでした。HTTPS接続とカメラ設定を確認してください。')
      setStatus('error')
    }
  }, [onRegister])

  useEffect(() => stop, [stop])

  const active = status === 'starting' || status === 'scanning'
  return (
    <section className="scanner-card" aria-labelledby="alpen-scanner-title">
      <div className="scanner-heading">
        <div><p className="eyebrow">ALPEN QR</p><h2 id="alpen-scanner-title">商品QRを読み取る</h2></div>
        <span className={`status-badge status-badge--${status}`}>
          <span className="status-dot" aria-hidden="true" />
          {status === 'starting' ? '準備中' : status === 'scanning' ? '読取中' : status === 'error' ? '要確認' : status === 'stopped' ? '停止中' : '待機中'}
        </span>
      </div>
      <div className={`camera-shell ${active ? 'is-active' : ''}`}>
        <video ref={videoRef} className="camera-viewport alpen-video" muted playsInline aria-label="QRカメラ映像" />
        {!active && <div className="camera-placeholder"><p>Alpen公式の商品QRだけを読み取ります</p></div>}
        {status === 'starting' && <div className="camera-loading" role="status"><span className="spinner" />カメラを準備しています</div>}
        {status === 'scanning' && <div className="qr-scan-guide" aria-hidden="true" />}
      </div>
      <p className="camera-hint">棚札の「詳しくはこちら」QRを四角い枠に収めてください</p>
      <div className={`result-panel ${lastValue ? 'has-result' : ''}`}>
        <p className="result-label">Alpen商品番号</p>
        <output className="jan-code" aria-live="polite">{lastValue ?? '— — — — — —'}</output>
      </div>
      {message && <div className="duplicate-message" role="status">{message}</div>}
      <div className="scanner-actions">
        {!active
          ? <button type="button" className="button button--primary scanner-start-button" onClick={() => void start()}>QR読み取りを開始</button>
          : <button type="button" className="button button--secondary scanner-stop-button" onClick={stop}>読み取りを停止</button>}
      </div>
    </section>
  )
}
