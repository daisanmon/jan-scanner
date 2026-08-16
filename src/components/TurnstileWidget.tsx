import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
      theme: 'auto'
      appearance: 'interaction-only'
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_ID = 'cloudflare-turnstile-script'
let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile)
  }
  if (scriptPromise) {
    return scriptPromise
  }

  const pending = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')
    const handleLoad = () => {
      if (window.turnstile) {
        resolve(window.turnstile)
      } else {
        reject(new Error('Turnstile did not initialize'))
      }
    }
    const handleError = () => reject(new Error('Turnstile script failed to load'))

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    if (!existing) {
      script.id = SCRIPT_ID
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  }).catch((error) => {
    scriptPromise = null
    throw error
  })

  scriptPromise = pending
  return pending
}

type TurnstileWidgetProps = {
  siteKey: string
  onToken: (token: string | null) => void
  onError: () => void
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    let api: TurnstileApi | undefined
    let widgetId: string | undefined

    void loadTurnstile()
      .then((loadedApi) => {
        if (!active || !containerRef.current) {
          return
        }
        api = loadedApi
        widgetId = loadedApi.render(containerRef.current, {
          sitekey: siteKey,
          action: 'poizon_lookup',
          callback: onToken,
          'expired-callback': () => onToken(null),
          'error-callback': onError,
          theme: 'auto',
          appearance: 'interaction-only',
        })
      })
      .catch(() => {
        if (active) {
          onError()
        }
      })

    return () => {
      active = false
      onToken(null)
      if (api && widgetId) {
        api.remove(widgetId)
      }
    }
  }, [onError, onToken, siteKey])

  return <div className="turnstile-widget" ref={containerRef} />
}
