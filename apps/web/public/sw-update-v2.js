// Browser-only synthetic update fixture for ticket 58's update lifecycle test.
const CACHE_VERSION = 'diary-static-v2'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION))
})
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
