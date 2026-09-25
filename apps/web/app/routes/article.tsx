import { z } from 'zod'
import { useCallback, useEffect, useRef, useState } from 'react'
import { data, isRouteErrorResponse, Link, useLoaderData, useLocation, useNavigate, useOutletContext, useRevalidator, useRouteError, type ClientLoaderFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { postPublicDetailSchema, postPublicMetadataSchema, type PostPublicDetail } from '@diary/contracts/post'
import { articleLocaleSchema } from '@diary/contracts'
import { Markdown } from '../markdown'
import { articleCacheInvalidationEvent, getSessionRevision, isLocallySignedOut, safeReturnPath, signInPath, useSessionState } from '../session'
import { useUi } from '../ui'
import '../trade-plan.css'
import type { ShellOutletContext } from '../root'

const ARTICLE_NO_STORE = { 'Cache-Control': 'private, no-store' }
type PostPublicMetadata = z.infer<typeof postPublicMetadataSchema>
type ArticleLoaderData = { post: PostPublicDetail | PostPublicMetadata; locked: boolean; origin: string }
type ArticleView = Pick<ArticleLoaderData, 'post' | 'locked'>
type RefreshState = 'idle' | 'refreshing' | 'failed'

function apiUrl(request: Request, path: string) {
  const origin = typeof window === 'undefined' && typeof process !== 'undefined' && process.env.API_ORIGIN
    ? process.env.API_ORIGIN
    : new URL(request.url).origin
  return `${origin}${path}`
}

function articleRequestInit(request: Request): RequestInit {
  const headers = new Headers()
  // SSR requests must carry the browser session to the API. Preserve explicit
  // credentials when supplied so the API can apply its fail-closed rules.
  for (const name of ['cookie', 'authorization', 'x-api-key']) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return { cache: 'no-store', credentials: 'same-origin', headers }
}

function unavailable(status: number) {
  return new Response(status === 404 ? 'Article not found' : 'Article unavailable', { status, headers: ARTICLE_NO_STORE })
}

async function loadMetadata(request: Request, params: LoaderFunctionArgs['params'], allowPublicBody = false) {
  const slug = params.slug
  if (!slug) throw unavailable(404)
  const query = new URL(request.url).search
  const detailUrl = `${apiUrl(request, `/api/blog/${encodeURIComponent(slug)}`)}${query}`
  const metadataUrl = `${apiUrl(request, `/api/blog/${encodeURIComponent(slug)}/metadata`)}${query}`
  const metadataResponse = await fetch(metadataUrl, articleRequestInit(request))
  if (!metadataResponse.ok) throw unavailable(metadataResponse.status === 404 ? 404 : 502)
  const post = postPublicMetadataSchema.parse(await metadataResponse.json())
  if (allowPublicBody && post.access === 'PUBLIC') {
    // A local logout can happen while the old member request is in flight. A
    // public article remains readable for the guest, but fetch it without the
    // stale session cookie so the refreshed route cannot refill private data.
    const publicResponse = await fetch(detailUrl, { cache: 'no-store', credentials: 'omit' })
    if (publicResponse.ok) {
      const detail = postPublicDetailSchema.parse(await publicResponse.json())
      return data<ArticleLoaderData>({ post: detail, locked: false, origin: new URL(request.url).origin }, { headers: ARTICLE_NO_STORE })
    }
    if (publicResponse.status === 404) throw unavailable(404)
    if (publicResponse.status !== 401) throw unavailable(502)
  }
  return data<ArticleLoaderData>({ post, locked: true, origin: new URL(request.url).origin }, { headers: ARTICLE_NO_STORE })
}

async function loadArticle({ request, params }: LoaderFunctionArgs) {
  const slug = params.slug
  if (!slug) throw unavailable(404)
  const detailUrl = apiUrl(request, `/api/blog/${encodeURIComponent(slug)}${new URL(request.url).search}`)
  const init = articleRequestInit(request)
  const response = await fetch(detailUrl, init)
  if (response.ok) {
    const post = postPublicDetailSchema.parse(await response.json())
    return data<ArticleLoaderData>({ post, locked: false, origin: new URL(request.url).origin }, { headers: ARTICLE_NO_STORE })
  }
  if (response.status !== 401) throw unavailable(response.status === 404 ? 404 : 502)

  // A 401 for a published MEMBER article intentionally carries no body. The
  // metadata endpoint gives the lock screen only the authored safe teaser.
  return loadMetadata(request, params)
}

export async function loader(args: LoaderFunctionArgs) {
  return loadArticle(args)
}

// Framework data navigations run the server loader unless a clientLoader is
// exported. Keep the local sign-out fence on the browser side so a response
// that began before logout can never repopulate Router loaderData.
export async function clientLoader({ request, params, serverLoader }: ClientLoaderFunctionArgs) {
  if (isLocallySignedOut()) return loadMetadata(request, params, true)
  const revision = getSessionRevision()
  const loaded = await serverLoader<ArticleLoaderData>()
  if (revision !== getSessionRevision() || isLocallySignedOut()) return loadMetadata(request, params, true)
  return loaded
}

export function headers() { return ARTICLE_NO_STORE }
export function shouldRevalidate() { return true }

function localeUrl(origin: string, slug: string, locale: string, sourceLocale: string) {
  const path = `${origin}/articles/${encodeURIComponent(slug)}`
  return locale === sourceLocale ? path : `${path}?lang=${encodeURIComponent(locale)}`
}

export const meta: MetaFunction<typeof loader> = ({ loaderData: loaded }) => {
  if (!loaded) return [{ title: 'Article — Trade basic' }]
  const description = loaded.post.excerpt ?? loaded.post.title
  const canonical = localeUrl(loaded.origin, loaded.post.slug, loaded.post.resolvedLocale, loaded.post.sourceLocale)
  return [
    { title: `${loaded.post.title} — Trade basic` },
    { name: 'description', content: description },
    { property: 'og:title', content: loaded.post.title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'article' },
    { tagName: 'link', rel: 'canonical', href: canonical },
    ...loaded.post.availableLocales.map(item => ({ tagName: 'link' as const, rel: 'alternate', hrefLang: item, href: localeUrl(loaded.origin, loaded.post.slug, item, loaded.post.sourceLocale) })),
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: localeUrl(loaded.origin, loaded.post.slug, loaded.post.sourceLocale, loaded.post.sourceLocale) },
  ]
}

const copy = {
  en: { back: 'All articles', by: 'By', edit: 'Edit article', fundamental: 'Fundamental', technical: 'Technical', market: 'Market', strategy: 'Strategy', membersOnly: 'Members only', memberHint: 'Sign in with a valid account to read the full article.', signIn: 'Sign in', register: 'Create account', loading: 'Refreshing article…', articleLanguage: 'Article language', original: 'Original', fallback: (requested: string, source: string) => `${requested} is unavailable. Showing the original in ${source}.`, updating: 'Translation is being updated. Showing the original version.' },
  'zh-TW': { back: '全部文章', by: '作者', edit: '編輯文章', fundamental: '基本面', technical: '技術面', market: '市場觀察', strategy: '投資策略', membersOnly: '僅限會員', memberHint: '請登入有效帳戶，以閱讀完整文章。', signIn: '登入', register: '建立帳戶', loading: '正在更新文章…', articleLanguage: '文章語言', original: '原文', fallback: (requested: string, source: string) => `目前沒有${requested}版本，以下顯示${source}原文。`, updating: '翻譯更新中，以下顯示原文。' },
  'zh-CN': { back: '全部文章', by: '作者', edit: '编辑文章', fundamental: '基本面', technical: '技术面', market: '市场观察', strategy: '投资策略', membersOnly: '仅限会员', memberHint: '请登录有效账户，以阅读完整文章。', signIn: '登录', register: '创建账户', loading: '正在更新文章…', articleLanguage: '文章语言', original: '原文', fallback: (requested: string, source: string) => `目前没有${requested}版本，以下显示${source}原文。`, updating: '翻译更新中，以下显示原文。' },
} as const

const localeNames = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' } as const
const refreshCopy = {
  en: { refresh: 'Refresh', retry: 'Retry refresh', failed: 'The article could not be updated. The current version remains available.', unavailable: 'This article is no longer available.', loadFailed: 'The article could not be loaded. Your language choice is preserved.', notFound: 'This article could not be found.', retryLoad: 'Retry loading' },
  'zh-TW': { refresh: '重新整理', retry: '重試更新', failed: '無法更新文章，目前顯示的版本仍可閱讀。', unavailable: '這篇文章目前無法使用。', loadFailed: '目前無法載入文章，已保留你選擇的語言。', notFound: '找不到這篇文章。', retryLoad: '重試載入' },
  'zh-CN': { refresh: '刷新', retry: '重试更新', failed: '无法更新文章，目前显示的版本仍可阅读。', unavailable: '这篇文章目前无法使用。', loadFailed: '目前无法加载文章，已保留你选择的语言。', notFound: '找不到这篇文章。', retryLoad: '重试加载' },
} as const

export function ErrorBoundary() {
  const error = useRouteError()
  const location = useLocation()
  const revalidator = useRevalidator()
  const { locale } = useUi()
  const c = refreshCopy[locale]
  const articleCopy = copy[locale]
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const state = location.state && typeof location.state === 'object' ? location.state as { articleListSearch?: unknown } : null
  const listSearch = typeof state?.articleListSearch === 'string' ? state.articleListSearch : ''
  const params = new URLSearchParams(listSearch.startsWith('?') ? listSearch.slice(1) : listSearch)
  const safeParams = new URLSearchParams()
  for (const key of ['search', 'category', 'lang', 'page']) {
    const value = params.get(key)
    if (value) safeParams.set(key, value)
  }
  const returnPath = `/articles${safeParams.size ? `?${safeParams}` : ''}`
  return <section className="plan-page" aria-labelledby="article-load-error-title">
    <h1 id="article-load-error-title">{notFound ? c.notFound : c.loadFailed}</h1>
    {!notFound && <><p role="alert">{c.loadFailed}</p><button type="button" className="secondary" disabled={revalidator.state !== 'idle'} onClick={() => revalidator.revalidate()}>{c.retryLoad}</button></>}
    <p><Link to={returnPath}>{articleCopy.back}</Link></p>
  </section>
}

export default function Article() {
  const loaded = useLoaderData<typeof loader>() as ArticleLoaderData
  const initialPost = loaded.post
  const { locale } = useUi()
  const location = useLocation()
  const navigate = useNavigate()
  const { viewer } = useOutletContext<ShellOutletContext>()
  const session = useSessionState()
  const c = copy[locale]
  const refreshCopyForLocale = refreshCopy[locale]
  const routeIdentity = `${initialPost.slug}:${location.search}`
  const loadedIdentity = `${routeIdentity}:${initialPost.updatedAt}:${initialPost.resolvedLocale}:${loaded.locked}`
  const [viewState, setViewState] = useState<{ identity: string; view: ArticleView }>(() => ({ identity: routeIdentity, view: { post: initialPost, locked: loaded.locked } }))
  const [refreshState, setRefreshState] = useState<RefreshState>('idle')
  const [unavailable, setUnavailable] = useState(false)
  const currentRoute = useRef(routeIdentity)
  const refreshSequence = useRef(0)
  const sessionRevision = useRef(session.revision)
  if (currentRoute.current !== routeIdentity) {
    currentRoute.current = routeIdentity
    refreshSequence.current += 1
  }
  const view: ArticleView = viewState.identity === routeIdentity ? viewState.view : { post: initialPost, locked: loaded.locked }
  const post = view.post
  const categoryLabel = post.category in c ? c[post.category as 'fundamental' | 'technical' | 'market' | 'strategy'] : post.category
  const formatDate = (value: string) => `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} UTC`
  const articlePath = `/articles/${encodeURIComponent(post.slug)}`
  const requestedLocale = articleLocaleSchema.parse(post.requestedLocale)
  const readerPath = safeReturnPath(`${articlePath}?lang=${encodeURIComponent(requestedLocale)}`)
  const fallbackText = post.isFallback
    ? post.fallbackReason === 'translation_stale' ? c.updating : c.fallback(localeNames[requestedLocale], localeNames[post.resolvedLocale])
    : null

  useEffect(() => {
    refreshSequence.current += 1
    setViewState({ identity: routeIdentity, view: { post: initialPost, locked: loaded.locked } })
    setRefreshState('idle')
    setUnavailable(false)
  }, [loadedIdentity])

  const refreshArticle = useCallback(async (invalidateAccess = false) => {
    const ticket = ++refreshSequence.current
    const sessionAtStart = getSessionRevision()
    const isCurrent = () => ticket === refreshSequence.current
      && currentRoute.current === routeIdentity
      && sessionAtStart === getSessionRevision()
    const mayShowDetail = (next: PostPublicDetail) => isCurrent()
      && (!isLocallySignedOut() || next.access === 'PUBLIC')
      && (session.authenticated !== false || next.access === 'PUBLIC')
    const setView = (next: ArticleView) => {
      if (isCurrent()) setViewState({ identity: routeIdentity, view: next })
    }
    const redactBody = (locked?: boolean) => {
      if (!isCurrent()) return
      setViewState(current => {
        const currentView = current.identity === routeIdentity ? current.view : { post: initialPost, locked: loaded.locked }
        const metadata = { ...currentView.post } as Record<string, unknown>
        delete metadata.content
        return {
          identity: routeIdentity,
          view: { post: postPublicMetadataSchema.parse({ ...metadata, excerpt: null }), locked: locked ?? currentView.locked },
        }
      })
    }
    const search = location.search
    const detailPath = `/api/blog/${encodeURIComponent(post.slug)}${search}`
    const metadataPath = `/api/blog/${encodeURIComponent(post.slug)}/metadata${search}`
    const credentials: RequestCredentials = isLocallySignedOut() || session.authenticated === false ? 'omit' : 'same-origin'
    const request = (path: string, requestCredentials: RequestCredentials = credentials) => fetch(path, { cache: 'no-store', credentials: requestCredentials })

    if (invalidateAccess) redactBody(post.access === 'MEMBER')
    setUnavailable(false)
    setRefreshState('refreshing')
    try {
      const response = await request(detailPath)
      if (!isCurrent()) return
      if (response.ok) {
        const refreshed = postPublicDetailSchema.parse(await response.json())
        if (!mayShowDetail(refreshed)) { redactBody(refreshed.access === 'MEMBER'); setRefreshState('idle'); return }
        setView({ post: refreshed, locked: false })
        setUnavailable(false)
        setRefreshState('idle')
        return
      }
      if (![401, 403, 404].includes(response.status)) throw new Error('Article refresh failed')

      redactBody(response.status === 401 && post.access === 'MEMBER')
      const metadataResponse = await request(metadataPath)
      if (!isCurrent()) return
      if (!metadataResponse.ok) {
        setUnavailable(true)
        setRefreshState('idle')
        return
      }
      const metadata = postPublicMetadataSchema.parse(await metadataResponse.json())
      if (response.status !== 401) {
        setView({ post: metadata, locked: false })
        setUnavailable(true)
        setRefreshState('idle')
        return
      }
      if (metadata.access === 'MEMBER') {
        setView({ post: metadata, locked: true })
        setRefreshState('idle')
        return
      }
      const publicResponse = await request(detailPath, 'omit')
      if (!isCurrent()) return
      if (publicResponse.ok) {
        const publicDetail = postPublicDetailSchema.parse(await publicResponse.json())
        if (mayShowDetail(publicDetail)) setView({ post: publicDetail, locked: false })
        setRefreshState('idle')
      } else {
        setView({ post: metadata, locked: false })
        if (publicResponse.status === 401 || publicResponse.status === 403 || publicResponse.status === 404) setUnavailable(true)
        else setRefreshState('failed')
      }
    } catch {
      if (isCurrent()) setRefreshState('failed')
    }
  }, [initialPost, loaded.locked, location.search, post.access, post.slug, routeIdentity, session.authenticated])

  useEffect(() => {
    const onLocalInvalidation = () => { void refreshArticle() }
    const onStorage = (event: StorageEvent) => { if (event.key === articleCacheInvalidationEvent) void refreshArticle() }
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void refreshArticle() }
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshArticle() }
    window.addEventListener(articleCacheInvalidationEvent, onLocalInvalidation)
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener(articleCacheInvalidationEvent, onLocalInvalidation)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshArticle])

  useEffect(() => {
    if (session.revision === sessionRevision.current) return
    sessionRevision.current = session.revision
    void refreshArticle(true)
  }, [session.revision, refreshArticle])

  const explicitLanguage = new URLSearchParams(location.search).has('lang')
  const preferredLocale = useRef(locale)
  useEffect(() => {
    if (preferredLocale.current !== locale && !explicitLanguage) void refreshArticle()
    preferredLocale.current = locale
  }, [locale, explicitLanguage, refreshArticle])

  const memberLocked = view.locked || (post.access === 'MEMBER' && (session.authenticated === false || isLocallySignedOut()))
  const bodyVisible = !memberLocked && !unavailable && 'content' in post
  const registerPath = `/register?returnTo=${encodeURIComponent(readerPath)}`
  useEffect(() => { document.documentElement.lang = post.resolvedLocale }, [post.resolvedLocale, locale])
  return <article className="diary-reading" lang={post.resolvedLocale}>
    <div className="article-reading-actions"><Link to="/articles">{c.back}</Link>{viewer?.role === 'ADMIN' && <Link className="button secondary" to={`/admin/blog/${post.id}/edit`}>{c.edit}</Link>}</div>
    <header>
      <p className="muted article-meta">{categoryLabel} · {c.by} {post.author.name ?? '—'} · <time dateTime={post.publishedAt ?? post.createdAt}>{formatDate(post.publishedAt ?? post.createdAt)}</time></p>
      <div className="article-language-control"><label htmlFor="article-language">{c.articleLanguage}</label><select id="article-language" value={requestedLocale} onChange={event => {
        const parsed = articleLocaleSchema.safeParse(event.currentTarget.value)
        if (parsed.success) navigate(`${articlePath}?lang=${encodeURIComponent(parsed.data)}`)
      }}>
        {post.availableLocales.map(item => <option key={item} value={item}>{localeNames[item]}{item === post.sourceLocale ? ` (${c.original})` : ''}</option>)}
        {post.isFallback && !post.availableLocales.includes(requestedLocale) && <option value={requestedLocale} disabled>{localeNames[requestedLocale]}</option>}
      </select><button type="button" className="secondary" onClick={() => { void refreshArticle() }}>{refreshCopyForLocale.refresh}</button></div>
      {refreshState === 'refreshing' && <p className="article-refresh-status" role="status" aria-live="polite">{c.loading}</p>}
      {refreshState === 'failed' && <p className="article-refresh-status" role="alert">{refreshCopyForLocale.failed} <button type="button" className="secondary" onClick={() => { void refreshArticle() }}>{refreshCopyForLocale.retry}</button></p>}
      {unavailable && <p className="article-refresh-status" role="alert">{refreshCopyForLocale.unavailable} <button type="button" className="secondary" onClick={() => { void refreshArticle(true) }}>{refreshCopyForLocale.retry}</button></p>}
      {fallbackText && <p className="article-language-fallback" role="status">{fallbackText}</p>}
      <h1>{post.title}</h1>
      {post.excerpt && <p className="lede">{post.excerpt}</p>}
      {post.coverImage && <img src={post.coverImage} alt={post.title} style={{ width: '100%', height: 'auto', maxHeight: 480, objectFit: 'cover' }} />}
    </header>
    {bodyVisible && <Markdown>{post.content}</Markdown>}
    {memberLocked && <section className="article-lock" aria-labelledby="article-members-only">
      <h2 id="article-members-only">{c.membersOnly}</h2>
      <p>{c.memberHint}</p>
      <div className="article-lock-actions"><Link className="button" to={signInPath(readerPath)}>{c.signIn}</Link><Link className="button secondary" to={registerPath}>{c.register}</Link></div>
    </section>}
  </article>
}
