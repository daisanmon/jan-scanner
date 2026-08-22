import Quagga, {
  type QuaggaJSResultObject,
} from '@ericblade/quagga2'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isValidJanCode } from '../utils/janCode'

type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'success'
  | 'stopped'
  | 'error'

const DUPLICATE_SUPPRESSION_MS = 3_000
const DUPLICATE_MESSAGE_MS = 1_800
const SCAN_AREA_INSET = '8%'

type JanScannerProps = {
  onRegister: (janCode: string) => void
}

function stopVideoTracks(target: HTMLDivElement | null) {
  target?.querySelectorAll('video').forEach((video) => {
    const stream = video.srcObject

    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop())
    }

    video.srcObject = null
  })
}

async function stopQuagga(target: HTMLDivElement | null) {
  stopVideoTracks(target)

  try {
    await Quagga.stop()
  } catch {
    // 未初期化や初期化途中でも、後段でvideoトラックを確実に破棄する。
  } finally {
    stopVideoTracks(target)
  }
}

function getCameraErrorMessage(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  if (
    ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name) ||
    message.includes('permission') ||
    message.includes('denied')
  ) {
    return 'カメラの使用が許可されていません。iPhoneの「設定」から使用中のブラウザを開き、カメラを許可してください。その後、このページを再読み込みしてください。'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '使用できるカメラが見つかりませんでした。カメラを搭載した端末でお試しください。'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'カメラを使用できませんでした。ほかのアプリでカメラを使用していないか確認して、もう一度お試しください。'
  }

  return 'カメラを開始できませんでした。HTTPSで開いていることと、ブラウザのカメラ設定を確認して、もう一度お試しください。'
}

export function JanScanner({ onRegister }: JanScannerProps) {
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [janCode, setJanCode] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null)

  const targetRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const sessionRef = useRef(false)
  const cameraOpenRef = useRef(false)
  const sessionIdRef = useRef(0)
  const stopPromiseRef = useRef<Promise<void>>(Promise.resolve())
  const duplicateMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const lastDetectionRef = useRef<{ code: string; detectedAt: number } | null>(
    null,
  )

  const handleDetected = useCallback(
    function detectedHandler(result: QuaggaJSResultObject) {
      if (!sessionRef.current) {
        return
      }

      const code = result.codeResult?.code
      if (!code || !isValidJanCode(code)) {
        return
      }

      const now = Date.now()
      const lastDetection = lastDetectionRef.current
      if (
        lastDetection?.code === code &&
        now - lastDetection.detectedAt < DUPLICATE_SUPPRESSION_MS
      ) {
        setDuplicateMessage('同じJANコードのため、重複登録を防止しました。')
        if (duplicateMessageTimerRef.current === null) {
          duplicateMessageTimerRef.current = setTimeout(() => {
            duplicateMessageTimerRef.current = null
            if (mountedRef.current) {
              setDuplicateMessage(null)
            }
          }, DUPLICATE_MESSAGE_MS)
        }
        return
      }

      lastDetectionRef.current = { code, detectedAt: now }
      if (duplicateMessageTimerRef.current !== null) {
        clearTimeout(duplicateMessageTimerRef.current)
        duplicateMessageTimerRef.current = null
      }
      setDuplicateMessage(null)
      onRegister(code)
      setJanCode(code)
      setErrorMessage(null)
      setStatus('scanning')
    },
    [onRegister],
  )

  const startScanning = useCallback(async () => {
    if (sessionRef.current) {
      return
    }

    sessionRef.current = true
    const sessionId = sessionIdRef.current + 1
    sessionIdRef.current = sessionId
    setErrorMessage(null)
    setStatus('starting')

    if (cameraOpenRef.current) {
      Quagga.offDetected(handleDetected)
      Quagga.onDetected(handleDetected)
      Quagga.start()
      setStatus('scanning')
      return
    }

    await stopPromiseRef.current

    if (!mountedRef.current || sessionIdRef.current !== sessionId) {
      return
    }

    try {
      await Quagga.init({
        inputStream: {
          type: 'LiveStream',
          target: targetRef.current ?? undefined,
          constraints: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          area: {
            top: SCAN_AREA_INSET,
            right: SCAN_AREA_INSET,
            bottom: SCAN_AREA_INSET,
            left: SCAN_AREA_INSET,
          },
          willReadFrequently: true,
        },
        decoder: {
          readers: ['ean_reader', 'ean_8_reader'],
          multiple: false,
        },
        locator: {
          halfSample: true,
          patchSize: 'medium',
          willReadFrequently: true,
        },
        canvas: {
          createOverlay: false,
        },
        locate: true,
        frequency: 10,
        numOfWorkers: 2,
      })

      if (!mountedRef.current || sessionIdRef.current !== sessionId) {
        sessionRef.current = false
        await stopQuagga(targetRef.current)
        return
      }

      Quagga.offDetected(handleDetected)
      Quagga.onDetected(handleDetected)
      Quagga.start()
      cameraOpenRef.current = true
      setStatus('scanning')
    } catch (error) {
      if (!mountedRef.current || sessionIdRef.current !== sessionId) {
        return
      }

      sessionRef.current = false
      cameraOpenRef.current = false
      Quagga.offDetected(handleDetected)
      const stopPromise = stopQuagga(targetRef.current)
      stopPromiseRef.current = stopPromise
      setErrorMessage(getCameraErrorMessage(error))
      setStatus('error')
    }
  }, [handleDetected])

  const stopScanning = useCallback(() => {
    if (!sessionRef.current && !cameraOpenRef.current) {
      return
    }

    sessionRef.current = false
    cameraOpenRef.current = false
    sessionIdRef.current += 1
    Quagga.offDetected(handleDetected)
    const stopPromise = stopQuagga(targetRef.current)
    stopPromiseRef.current = stopPromise

    if (mountedRef.current) {
      setStatus('stopped')
    }
  }, [handleDetected])

  useEffect(() => {
    const target = targetRef.current
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      sessionRef.current = false
      cameraOpenRef.current = false
      sessionIdRef.current += 1
      Quagga.offDetected(handleDetected)
      if (duplicateMessageTimerRef.current !== null) {
        clearTimeout(duplicateMessageTimerRef.current)
      }
      void stopQuagga(target)
    }
  }, [handleDetected])

  const cameraIsActive = status === 'starting' || status === 'scanning'
  const cameraIsVisible = cameraIsActive || status === 'success'
  const cameraCanStop = cameraIsActive || status === 'success'
  const primaryLabel = '読み取りを開始'

  return (
    <section className="scanner-card" aria-labelledby="scanner-title">
      <div className="scanner-heading">
        <div>
          <p className="eyebrow">JAN SCANNER</p>
          <h2 id="scanner-title">バーコードを読み取る</h2>
        </div>
        <span className={`status-badge status-badge--${status}`}>
          <span className="status-dot" aria-hidden="true" />
          {status === 'starting' && '準備中'}
          {status === 'scanning' && '読取中'}
          {status === 'success' && '読取完了'}
          {status === 'stopped' && '停止中'}
          {status === 'error' && '要確認'}
          {status === 'idle' && '待機中'}
        </span>
      </div>

      <div className={`camera-shell ${cameraIsVisible ? 'is-active' : ''}`}>
        <div
          ref={targetRef}
          className="camera-viewport"
          aria-label="カメラ映像"
        />

        {!cameraIsVisible && (
          <div className="camera-placeholder" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M17 14.5 20 10h8l3 4.5h5.5A3.5 3.5 0 0 1 40 18v17.5a3.5 3.5 0 0 1-3.5 3.5h-25A3.5 3.5 0 0 1 8 35.5V18a3.5 3.5 0 0 1 3.5-3.5H17Z" />
              <circle cx="24" cy="26" r="7" />
            </svg>
            <p>ボタンを押すまでカメラは起動しません</p>
          </div>
        )}

        {status === 'starting' && (
          <div className="camera-loading" role="status">
            <span className="spinner" aria-hidden="true" />
            カメラを準備しています
          </div>
        )}

        {status === 'scanning' && (
          <div className="scan-guide" aria-hidden="true">
            <span className="scan-corner scan-corner--top-left" />
            <span className="scan-corner scan-corner--top-right" />
            <span className="scan-corner scan-corner--bottom-left" />
            <span className="scan-corner scan-corner--bottom-right" />
            <span className="scan-line" />
          </div>
        )}

      </div>

      <p className="camera-hint">
        バーコード全体を枠内に収めてください。縦向き・横向きのまま読み取れます
      </p>

      <div className={`result-panel ${janCode ? 'has-result' : ''}`}>
        <p className="result-label">読み取ったJANコード</p>
        <output className="jan-code" aria-live="polite">
          {janCode ?? '— — — — — — — —'}
        </output>
        <p className="result-detail">
          {janCode
            ? `${janCode.length}桁・チェックデジット確認済み`
            : '8桁または13桁のJANコードに対応'}
        </p>
      </div>

      {errorMessage && (
        <div className="error-message" role="alert">
          <span aria-hidden="true">!</span>
          <p>{errorMessage}</p>
        </div>
      )}

      {duplicateMessage && (
        <div className="duplicate-message" role="status" aria-live="polite">
          {duplicateMessage}
        </div>
      )}

      <div className="scanner-actions">
        {!cameraCanStop ? (
          <button
            type="button"
            className="button button--primary scanner-start-button"
            onClick={() => void startScanning()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5H5v3M16 5h3v3M8 19H5v-3M16 19h3v-3M8 12h8" />
            </svg>
            {primaryLabel}
          </button>
        ) : (
          <button
            type="button"
            className="button button--secondary scanner-stop-button"
            onClick={stopScanning}
          >
            <span className="stop-icon" aria-hidden="true" />
            読み取りを停止
          </button>
        )}
      </div>
    </section>
  )
}
