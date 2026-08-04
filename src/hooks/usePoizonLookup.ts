import { useCallback, useEffect, useRef, useState } from 'react'
import type { PoizonLookupResponse } from '../types/poizon'
import {
  lookupPoizon,
  PoizonApiError,
  type PoizonLookupInput,
} from '../services/poizonApi'

export type PoizonLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; response: PoizonLookupResponse }
  | { status: 'error'; error: PoizonApiError }

export function usePoizonLookup() {
  const [state, setState] = useState<PoizonLookupState>({ status: 'idle' })
  const controllerRef = useRef<AbortController | null>(null)
  const requestNumberRef = useRef(0)

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const reset = useCallback(() => {
    cancel()
    requestNumberRef.current += 1
    setState({ status: 'idle' })
  }, [cancel])

  const lookup = useCallback(async (input: PoizonLookupInput) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestNumber = requestNumberRef.current + 1
    requestNumberRef.current = requestNumber
    setState({ status: 'loading' })

    try {
      const response = await lookupPoizon(input, controller.signal)
      if (requestNumberRef.current === requestNumber) {
        setState({ status: 'success', response })
      }
      return response
    } catch (error) {
      if (controller.signal.aborted || requestNumberRef.current !== requestNumber) {
        return undefined
      }
      const apiError =
        error instanceof PoizonApiError
          ? error
          : new PoizonApiError(
              'NETWORK_ERROR',
              '価格照会サービスへ接続できませんでした。',
              true,
            )
      setState({ status: 'error', error: apiError })
      return undefined
    }
  }, [])

  useEffect(() => cancel, [cancel])

  return { state, lookup, cancel, reset }
}
