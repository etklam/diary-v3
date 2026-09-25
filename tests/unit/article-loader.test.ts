import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RouterContextProvider } from 'react-router'
import { clientLoader, loader } from '../../apps/web/app/routes/article'
import { safeReturnPath } from '../../apps/web/app/session'

const session = vi.hoisted(() => ({ signedOut: false, revision: 0 }))
vi.mock('../../apps/web/app/session', async importOriginal => ({
  ...await importOriginal<typeof import('../../apps/web/app/session')>(),
  isLocallySignedOut: () => session.signedOut,
  getSessionRevision: () => session.revision,
}))

const metadata = {
  id: '1', title: 'Synthetic article', slug: 'synthetic-article', excerpt: 'Public teaser',
  coverImage: null, category: 'market', tags: null, access: 'MEMBER', membersOnly: true,
  sourceLocale: 'zh-TW', requestedLocale: 'zh-TW', resolvedLocale: 'zh-TW', availableLocales: ['zh-TW'], isFallback: false, fallbackReason: null,
  publishedAt: '2026-09-24T00:00:00.000Z', createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z', author: { id: '1', name: null },
}
const sentinel = 'PRIVATE_LOADER_SENTINEL_8374'
const args = () => ({ request: new Request('http://localhost/articles/synthetic-article'), params: { slug: metadata.slug }, context: new RouterContextProvider(), url: new URL('http://localhost/articles/synthetic-article'), pattern: '/articles/:slug' })
beforeEach(() => { session.signedOut = false; session.revision = 0 })
afterEach(() => vi.unstubAllGlobals())

it('returns only metadata for a locked reader and prohibits HTTP caching', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json(metadata))
  vi.stubGlobal('fetch', fetcher)
  const result = await loader(args())
  expect(result.data).toMatchObject({ locked: true, post: metadata })
  expect(result.data.post).not.toHaveProperty('content')
  expect(JSON.stringify(result)).not.toContain(sentinel)
  expect(result.init?.headers).toEqual({ 'Cache-Control': 'private, no-store' })
})

it('keeps the requested locale query after the member metadata path in SSR', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ ...metadata, requestedLocale: 'en', resolvedLocale: 'zh-TW' }))
  vi.stubGlobal('fetch', fetcher)
  const input = args()
  input.request = new Request('http://localhost/articles/synthetic-article?lang=en')
  await loader(input)
  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
    'http://localhost/api/blog/synthetic-article?lang=en',
    'http://localhost/api/blog/synthetic-article/metadata?lang=en',
  ])
})

it('forwards SSR credentials without bypassing explicit credential precedence', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ...metadata, content: sentinel }))
  vi.stubGlobal('fetch', fetcher)
  const input = args()
  input.request = new Request(input.request.url, { headers: { cookie: 'access-token=synthetic', authorization: 'Bearer synthetic' } })
  expect((await loader(input)).data.post).toHaveProperty('content', sentinel)
  const init = fetcher.mock.calls[0]![1] as RequestInit
  expect(new Headers(init.headers).get('cookie')).toBe('access-token=synthetic')
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer synthetic')
  expect(init.cache).toBe('no-store')
})

it('discards an in-flight body when the session changes before the loader resolves', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(metadata)))
  let release: (() => void) | undefined
  const pending = new Promise<void>(resolve => { release = resolve })
  const serverLoader = async <T,>() => {
    await pending
    return { post: { ...metadata, content: sentinel }, locked: false } as T
  }
  const result = clientLoader({ ...args(), serverLoader })
  session.signedOut = true
  session.revision++
  release!()
  expect(JSON.stringify(await result)).not.toContain(sentinel)
})

it('preserves explicitly empty credentials instead of falling back to cookies', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ...metadata, content: sentinel }))
  vi.stubGlobal('fetch', fetcher)
  const input = args()
  input.request = new Request(input.request.url, { headers: { cookie: 'access-token=synthetic', authorization: '', 'x-api-key': '' } })
  await loader(input)
  const headers = new Headers((fetcher.mock.calls[0]![1] as RequestInit).headers)
  expect(headers.get('authorization')).toBe('')
  expect(headers.get('x-api-key')).toBe('')
})

it('never invokes a body loader for a locally signed-out Member reader', async () => {
  session.signedOut = true
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(metadata)))
  const serverLoader = vi.fn()
  const result = await clientLoader({ ...args(), serverLoader })
  expect(serverLoader).not.toHaveBeenCalled()
  expect(JSON.stringify(result)).not.toContain('content')
})

it('still loads PUBLIC bodies anonymously after logout', async () => {
  session.signedOut = true
  const publicPost = { ...metadata, access: 'PUBLIC', membersOnly: false }
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(publicPost))
    .mockResolvedValueOnce(Response.json({ ...publicPost, content: 'Public body' }))
  vi.stubGlobal('fetch', fetcher)
  const result = await clientLoader({ ...args(), serverLoader: vi.fn() })
  expect(JSON.stringify(result)).toContain('Public body')
  expect(fetcher.mock.calls[1]![1]).toMatchObject({ credentials: 'omit', cache: 'no-store' })
})

it('only accepts canonical internal article return paths and one supported locale', () => {
  for (const path of ['/articles/hello-world', '/articles/%E4%B8%AD%E6%96%87', '/articles/hello-world?lang=en', '/articles/hello-world?lang=zh-TW', '/articles/hello-world?lang=zh-CN', '/articles/%e4%b8%ad%e6%96%87?lang=%65n']) {
    expect(safeReturnPath(path)).toBe(path.includes('%e4') ? '/articles/%E4%B8%AD%E6%96%87?lang=en' : path)
  }
  for (const path of ['//outside.test/articles/hello-world', 'https://outside.test/articles/hello-world', 'https://article-return.invalid/articles/hello-world', '/articles/..', '/articles/%2e%2e', '/articles/a%2fb', '/articles/a%5cb', '/articles/a\\b', '/articles/%00', '/articles/%', '/articles/a?next=https://outside.test', '/articles/a?lang=fr', '/articles/a?lang=en&lang=en', '/articles/a?lang=en&next=outside', '/articles/a?LANG=en', '/articles/a#section']) {
    expect(safeReturnPath(path)).toBe('/diaries/new')
  }
})

it('returns a bounded unavailable response for an API failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Internal details', { status: 503 })))
  try { await loader(args()); throw new Error('Expected loader failure') }
  catch (error) {
    expect(error).toBeInstanceOf(Response)
    const response = error as Response
    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('Article unavailable')
  }
})
