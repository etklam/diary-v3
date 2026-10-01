import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const webRoot = resolve(process.cwd(), 'apps/web')

describe('web PWA boundary', () => {
  it('publishes an installable manifest with a stable root scope', async () => {
    const manifest = JSON.parse(await readFile(resolve(webRoot, 'public/manifest.webmanifest'), 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({ start_url: '/', scope: '/', display: 'standalone', lang: 'zh-TW' })
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
      expect.objectContaining({ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
      expect.objectContaining({ src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }),
      expect.objectContaining({ src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }),
    ]))
    if (!Array.isArray(manifest.icons)) throw new Error('Manifest icons must be an array')
    const pngFirst = manifest.icons.findIndex(icon => (icon as { src: string }).src.endsWith('.png'))
    const svgFirst = manifest.icons.findIndex(icon => (icon as { src: string }).src.endsWith('.svg'))
    expect(pngFirst).toBeGreaterThanOrEqual(0)
    expect(svgFirst).toBeGreaterThanOrEqual(0)
    expect(pngFirst).toBeLessThan(svgFirst)
  })

  it('keeps private API and document requests outside the static worker cache', async () => {
    const worker = await readFile(resolve(webRoot, 'public/sw.js'), 'utf8')
    expect(worker).toContain("const CACHE_VERSION = 'diary-static-v4'")
    expect(worker).toContain("if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return")
    expect(worker).toContain("event.data?.type === 'CLEAR_PRIVATE_CACHE'")
    expect(worker).toContain("event.data?.type === 'SKIP_WAITING'")
    expect(worker).toContain("if (!self.registration.active) return self.skipWaiting()")
    expect(worker).toContain("!cacheControl.includes('no-store') && !cacheControl.includes('private')")
    expect(worker).toContain("url.pathname.startsWith('/assets/') && /\\.(?:js|css|woff2?|png|svg|webp|ico)$/i.test(url.pathname)")
    // Inside the fetch listener the API and socket bail-out must precede any
    // path that can open the cache.
    const fetchListener = worker.slice(worker.indexOf("self.addEventListener('fetch'"))
    expect(fetchListener.indexOf("if (url.pathname.startsWith('/api/')")).toBeLessThan(fetchListener.indexOf('caches.open(STATIC_CACHE)'))
    // A navigation may be answered from the precached offline page, but its
    // own response must never be written to a cache.
    const navigationBranch = worker.slice(worker.indexOf("if (request.mode === 'navigate'"), worker.indexOf("if (!isStaticAsset("))
    expect(navigationBranch).toContain('fetch(request).catch')
    expect(navigationBranch).toContain("caches.match(OFFLINE_DOCUMENT, { cacheName: STATIC_CACHE })")
    expect(navigationBranch).not.toContain('cache.put')
  })

  it('serves content-hashed build assets from the cache before the network', async () => {
    const worker = await readFile(resolve(webRoot, 'public/sw.js'), 'utf8')
    expect(worker).toContain('if (cached && isImmutableAsset(url)) return cached')
    // Stable-path assets revalidate instead, so an icon or manifest change is
    // picked up without a new worker version.
    expect(worker).toContain('event.waitUntil(fetchAndCache(cache, request).catch(() => undefined))')
    expect(worker.indexOf('if (cached && isImmutableAsset(url)) return cached')).toBeLessThan(worker.indexOf('return await fetchAndCache(cache, request)'))
  })

  it('precaches a self-contained offline document', async () => {
    const worker = await readFile(resolve(webRoot, 'public/sw.js'), 'utf8')
    expect(worker).toContain("const OFFLINE_DOCUMENT = '/offline.html'")
    expect(worker).toContain('OFFLINE_DOCUMENT])')
    const offline = await readFile(resolve(webRoot, 'public/offline.html'), 'utf8')
    expect(offline).toContain('<meta name="robots" content="noindex" />')
    // Precached pages cannot depend on build output or any further request.
    expect(offline).not.toContain('/assets/')
    expect(offline).not.toMatch(/<script\s+src=/i)
    expect(offline).not.toMatch(/<link[^>]+rel="stylesheet"/i)
  })
})
