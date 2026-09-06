import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const webRoot = resolve(process.cwd(), 'apps/web')

describe('web PWA boundary', () => {
  it('publishes an installable manifest with a stable root scope', async () => {
    const manifest = JSON.parse(await readFile(resolve(webRoot, 'public/manifest.webmanifest'), 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({ start_url: '/', scope: '/', display: 'standalone', lang: 'zh-TW' })
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }),
      expect.objectContaining({ src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }),
    ]))
  })

  it('keeps private API and document requests outside the static worker cache', async () => {
    const worker = await readFile(resolve(webRoot, 'public/sw.js'), 'utf8')
    expect(worker).toContain("const CACHE_VERSION = 'diary-static-v2'")
    expect(worker).toContain("if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return")
    expect(worker).toContain("if (request.mode === 'navigate' || request.destination === 'document') return")
    expect(worker).toContain("event.data?.type === 'CLEAR_PRIVATE_CACHE'")
    expect(worker).toContain("event.data?.type === 'SKIP_WAITING'")
    expect(worker).toContain("if (!self.registration.active) return self.skipWaiting()")
    expect(worker).toContain("!cacheControl.includes('no-store') && !cacheControl.includes('private')")
    expect(worker).toContain("url.pathname.startsWith('/assets/') && /\\.(?:js|css|woff2?|png|svg|webp|ico)$/i.test(url.pathname)")
    expect(worker.indexOf("if (url.pathname.startsWith('/api/')")).toBeLessThan(worker.indexOf('cache.put(request, response.clone())'))
  })
})
