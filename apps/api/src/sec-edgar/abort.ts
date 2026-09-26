import { SecProviderError } from './errors.js'

export function cancelledSecRequest(): SecProviderError {
  return new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC request was cancelled', 503, true)
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelledSecRequest()
}

/** Race a caller-owned promise without cancelling the underlying shared work. */
export function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    void promise.catch(() => undefined)
    return Promise.reject(cancelledSecRequest())
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onAbort = () => finish(() => reject(cancelledSecRequest()))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
    if (signal.aborted) onAbort()
  })
}
