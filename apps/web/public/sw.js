const CACHE_VERSION = 'diary-static-v4'
const STATIC_CACHE = CACHE_VERSION
const PRIVATE_CACHE_PREFIX = 'diary-private-'
const OFFLINE_DOCUMENT = '/offline.html'
const STATIC_PATHS = new Set(['/favicon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/icon-192.svg', '/icon-512.svg', '/icon-maskable-192.svg', '/icon-maskable-512.svg', '/manifest.webmanifest', OFFLINE_DOCUMENT])

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

// Build output is content-hashed: a changed file is requested under a new
// path, so a cached entry can never be a stale version of what was asked for.
// These are the only responses served without touching the network.
function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/') && /\.(?:js|css|woff2?|png|svg|webp|ico)$/i.test(url.pathname)
}

function isStaticAsset(request, url) {
  if (STATIC_PATHS.has(url.pathname)) return true
  return isImmutableAsset(url)
}

function mayCache(response) {
  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? ''
  return response.ok && !cacheControl.includes('no-store') && !cacheControl.includes('private')
}

async function fetchAndCache(cache, request) {
  const response = await fetch(request)
  if (mayCache(response)) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  // API and socket requests are always NetworkOnly. They never enter a cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return
  // SSR documents can contain account-specific HTML and are still never
  // cached. Only a failed navigation is answered, with a static offline page
  // that carries no account data.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_DOCUMENT, { cacheName: STATIC_CACHE })
      return cached ?? new Response('Offline', { status: 503, statusText: 'Offline' })
    }))
    return
  }
  if (!isStaticAsset(request, url)) return
  event.respondWith(caches.open(STATIC_CACHE).then(async cache => {
    const cached = await cache.match(request)
    if (cached && isImmutableAsset(url)) return cached
    // Named assets (icons, manifest, offline page) keep a stable path, so the
    // cached copy is served immediately and refreshed in the background.
    if (cached) {
      event.waitUntil(fetchAndCache(cache, request).catch(() => undefined))
      return cached
    }
    try {
      return await fetchAndCache(cache, request)
    } catch {
      return new Response('Offline', { status: 503, statusText: 'Offline' })
    }
  }))
})
