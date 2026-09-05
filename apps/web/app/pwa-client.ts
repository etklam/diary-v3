/**
 * Service-worker messages deliberately contain no account data. The worker
 * never caches API responses, but this message also clears any future private
 * cache namespace when a browser session is invalidated.
 */
export function clearPrivateServiceWorkerCache() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_PRIVATE_CACHE' })
}
