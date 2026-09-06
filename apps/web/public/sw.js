const CACHE_VERSION = 'diary-static-v2'
const STATIC_CACHE = CACHE_VERSION
const PRIVATE_CACHE_PREFIX = 'diary-private-'
const STATIC_PATHS = new Set(['/favicon.svg', '/icon-192.svg', '/icon-512.svg', '/icon-maskable-192.svg', '/icon-maskable-512.svg', '/manifest.webmanifest'])

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll([...STATIC_PATHS])).then(() => {
    // The first install may take control immediately. A later version waits
    // until the user explicitly chooses the update action below.
    if (!self.registration.active) return self.skipWaiting()
    return undefined
  }))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('diary-static-') && key !== STATIC_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CLEAR_PRIVATE_CACHE') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PRIVATE_CACHE_PREFIX)).map(key => caches.delete(key)))))
  }
})

function isStaticAsset(request, url) {
  if (STATIC_PATHS.has(url.pathname)) return true
  return url.pathname.startsWith('/assets/') && /\.(?:js|css|woff2?|png|svg|webp|ico)$/i.test(url.pathname)
}

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  // API and socket requests are always NetworkOnly. They never enter a cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return
  // SSR documents can contain account-specific HTML and are also never cached.
  if (request.mode === 'navigate' || request.destination === 'document') return
  if (!isStaticAsset(request, url)) return
  event.respondWith(caches.open(STATIC_CACHE).then(async cache => {
    try {
      const response = await fetch(request)
      const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? ''
      if (response.ok && !cacheControl.includes('no-store') && !cacheControl.includes('private')) await cache.put(request, response.clone())
      return response
    } catch {
      const cached = await cache.match(request)
      if (cached) return cached
      return new Response('Offline', { status: 503, statusText: 'Offline' })
    }
  }))
})
