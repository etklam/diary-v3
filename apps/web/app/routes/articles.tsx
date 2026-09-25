import { data, Form, Link, useLoaderData, useOutletContext, useRevalidator, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { useEffect, useRef } from 'react'
import { postPublicListResponseSchema, type PostPublicListResponse } from '@diary/contracts/post'
import { useUi } from '../ui'
import '../trade-plan.css'
import type { ShellOutletContext } from '../root'

function apiUrl(request: Request, path: string) {
  const origin = typeof window === 'undefined' && typeof process !== 'undefined' && process.env.API_ORIGIN
    ? process.env.API_ORIGIN
    : new URL(request.url).origin
  return `${origin}${path}`
}

const ARTICLE_NO_STORE = { 'Cache-Control': 'private, no-store' }

function articleRequestInit(request: Request): RequestInit {
  const headers = new Headers()
  // SSR requests must carry the browser session to the API. Preserve explicit
  // credentials when present so the API can apply its fail-closed precedence.
  for (const name of ['cookie', 'authorization', 'x-api-key']) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  return { cache: 'no-store', credentials: 'same-origin', headers }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  try {
    const response = await fetch(apiUrl(request, `/api/blog${url.search}`), articleRequestInit(request))
    if (!response.ok) return data({ data: [], pagination: { page: 1, limit: 9, total: 0, totalPages: 0 }, origin: url.origin, search: url.search, searchFailed: true }, { headers: ARTICLE_NO_STORE })
    const parsed = postPublicListResponseSchema.parse(await response.json())
    return data({ ...parsed, origin: url.origin, search: url.search, searchFailed: false }, { headers: ARTICLE_NO_STORE })
  } catch {
    return data({ data: [], pagination: { page: 1, limit: 9, total: 0, totalPages: 0 }, origin: url.origin, search: url.search, searchFailed: true }, { headers: ARTICLE_NO_STORE })
  }
}

export function headers() { return ARTICLE_NO_STORE }
export function shouldRevalidate() { return true }

export const meta: MetaFunction<typeof loader> = () => [
  { title: 'Articles — Trade basic' },
  { name: 'description', content: 'Published investment research and decision notes.' },
]

const copy = {
  en: { title: 'Articles', intro: 'Published research and decision notes, kept readable and traceable.', search: 'Search', searchHint: 'Search published titles and excerpts. Use quotes for a phrase, + to require a term, and - to exclude one.', category: 'Category', all: 'All categories', submit: 'Apply', empty: 'No published articles match these filters.', failed: 'Articles could not be loaded. Your search and filters are still here.', retry: 'Retry', previous: 'Previous', next: 'Next', page: 'Page', author: 'By', read: 'Read article', matchedTranslation: 'Translation match', openTranslation: 'View', new: 'New article', manage: 'Manage articles', publicAccess: 'Public', membersOnly: 'Members only', fundamental: 'Fundamental', technical: 'Technical', market: 'Market', strategy: 'Strategy' },
  'zh-TW': { title: '文章', intro: '已發布的研究與決策記錄，保留可讀性與脈絡。', search: '搜尋', searchHint: '搜尋已發布文章的標題與摘要。可用引號搜尋詞組、用 + 要求必須符合的詞、用 - 排除詞。', category: '分類', all: '全部分類', submit: '套用', empty: '沒有符合條件的已發布文章。', failed: '目前無法載入文章，搜尋條件仍已保留。', retry: '重試', previous: '上一頁', next: '下一頁', page: '第', author: '作者', read: '閱讀文章', matchedTranslation: '翻譯命中', openTranslation: '查看', new: '新增文章', manage: '管理文章', publicAccess: '公開', membersOnly: '僅限會員', fundamental: '基本面', technical: '技術面', market: '市場觀察', strategy: '投資策略' },
  'zh-CN': { title: '文章', intro: '已发布的研究与决策记录，保留可读性与脉络。', search: '搜索', searchHint: '搜索已发布文章的标题与摘要。可用引号搜索词组、用 + 要求必须匹配的词、用 - 排除词。', category: '分类', all: '全部分类', submit: '应用', empty: '没有符合条件的已发布文章。', failed: '目前无法加载文章，搜索条件仍已保留。', retry: '重试', previous: '上一页', next: '下一页', page: '第', author: '作者', read: '阅读文章', matchedTranslation: '翻译命中', openTranslation: '查看', new: '新增文章', manage: '管理文章', publicAccess: '公开', membersOnly: '仅限会员', fundamental: '基本面', technical: '技术面', market: '市场观察', strategy: '投资策略' },
} as const

const localeNames = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' } as const

export default function Articles() {
  const loaded = useLoaderData<typeof loader>() as PostPublicListResponse & { origin: string; search: string; searchFailed: boolean }
  const { locale } = useUi()
  const { viewer } = useOutletContext<ShellOutletContext>()
  const revalidator = useRevalidator()
  const c = copy[locale]
  const categoryLabel = (category: string) => category in c ? c[category as 'fundamental' | 'technical' | 'market' | 'strategy'] : category
  const params = new URLSearchParams(loaded.search)
  const explicitLanguage = params.has('lang')
  const previousLocale = useRef(locale)
  useEffect(() => {
    if (previousLocale.current !== locale && !explicitLanguage) revalidator.revalidate()
    previousLocale.current = locale
  }, [locale, explicitLanguage, revalidator])
  const page = loaded.pagination.page
  const makePage = (nextPage: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(nextPage))
    return `/articles?${next.toString()}`
  }
  const articleHref = (slug: string, requestedLocale: string) => `/articles/${encodeURIComponent(slug)}?lang=${encodeURIComponent(requestedLocale)}`
  const articleNavigationState = { articleListSearch: loaded.search }
  const formatDate = (value: string) => `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} UTC`
  return <section className="plan-page">
    <header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>{viewer?.role === 'ADMIN' && <div className="article-admin-actions"><Link className="button" to="/admin/blog/new">{c.new}</Link><Link to="/admin/blog">{c.manage}</Link></div>}</header>
    <Form key={loaded.search} method="get" className="plan-filters" role="search">
      {params.get('lang') && <input type="hidden" name="lang" value={params.get('lang')!} />}
      <label>{c.search}<input name="search" defaultValue={params.get('search') ?? ''} /><small>{c.searchHint}</small></label>
      <label>{c.category}<select name="category" defaultValue={params.get('category') ?? ''}><option value="">{c.all}</option><option value="fundamental">{c.fundamental}</option><option value="technical">{c.technical}</option><option value="market">{c.market}</option><option value="strategy">{c.strategy}</option></select></label>
      <button type="submit">{c.submit}</button>
    </Form>
    {loaded.searchFailed ? <div role="alert"><p>{c.failed}</p><button type="button" onClick={() => revalidator.revalidate()}>{c.retry}</button></div> : loaded.data.length === 0 ? <p role="status">{c.empty}</p> : <ol className="plan-list">{loaded.data.map(post => <li key={post.id}>
      <h2><Link to={articleHref(post.slug, post.requestedLocale)} state={articleNavigationState}>{post.title}</Link></h2>
      <p className="muted article-meta">{categoryLabel(post.category)} · {c.author} {post.author.name ?? '—'} · <time dateTime={post.publishedAt ?? post.createdAt}>{formatDate(post.publishedAt ?? post.createdAt)}</time><span className="article-access-badge">{post.access === 'MEMBER' ? c.membersOnly : c.publicAccess}</span></p>
      {post.excerpt && <p>{post.excerpt}</p>}
      <Link to={articleHref(post.slug, post.requestedLocale)} state={articleNavigationState}>{c.read}</Link>
      {post.matchedTranslationLocale && <p className="article-translation-match"><span>{c.matchedTranslation}: {localeNames[post.matchedTranslationLocale]}</span> <Link to={articleHref(post.slug, post.matchedTranslationLocale)} state={articleNavigationState}>{c.openTranslation}</Link></p>}
    </li>)}</ol>}
    {!loaded.searchFailed && loaded.pagination.totalPages > 1 && <nav className="plan-pagination" aria-label="Article pages">
      {page > 1 && <Link className="button secondary" to={makePage(page - 1)}>{c.previous}</Link>}
      <span>{c.page} {page} / {loaded.pagination.totalPages}</span>
      {page < loaded.pagination.totalPages && <Link className="button secondary" to={makePage(page + 1)}>{c.next}</Link>}
    </nav>}
  </section>
}
