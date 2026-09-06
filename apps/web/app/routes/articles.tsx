import { data, Form, Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { postPublicListResponseSchema, type PostPublicListResponse } from '@diary/contracts/post'
import { useUi } from '../ui'
import '../trade-plan.css'

function apiUrl(request: Request, path: string) {
  const origin = typeof window === 'undefined' && typeof process !== 'undefined' && process.env.API_ORIGIN
    ? process.env.API_ORIGIN
    : new URL(request.url).origin
  return `${origin}${path}`
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const response = await fetch(apiUrl(request, `/api/blog${url.search}`))
  if (!response.ok) throw new Response('Articles unavailable', { status: response.status })
  const parsed = postPublicListResponseSchema.parse(await response.json())
  return data({ ...parsed, origin: url.origin, search: url.search })
}

export const meta: MetaFunction<typeof loader> = () => [
  { title: 'Articles — Trade basic' },
  { name: 'description', content: 'Published investment research and decision notes.' },
]

const copy = {
  en: { title: 'Articles', intro: 'Published research and decision notes, kept readable and traceable.', search: 'Search', category: 'Category', all: 'All categories', submit: 'Apply', empty: 'No published articles match these filters.', previous: 'Previous', next: 'Next', page: 'Page', author: 'By', read: 'Read article' },
  'zh-TW': { title: '文章', intro: '已發布的研究與決策記錄，保留可讀性與脈絡。', search: '搜尋', category: '分類', all: '全部分類', submit: '套用', empty: '沒有符合條件的已發布文章。', previous: '上一頁', next: '下一頁', page: '第', author: '作者', read: '閱讀文章' },
  'zh-CN': { title: '文章', intro: '已发布的研究与决策记录，保留可读性与脉络。', search: '搜索', category: '分类', all: '全部分类', submit: '应用', empty: '没有符合条件的已发布文章。', previous: '上一页', next: '下一页', page: '第', author: '作者', read: '阅读文章' },
} as const

export default function Articles() {
  const loaded = useLoaderData<typeof loader>() as PostPublicListResponse & { origin: string; search: string }
  const { locale } = useUi()
  const c = copy[locale]
  const params = new URLSearchParams(loaded.search)
  const page = loaded.pagination.page
  const makePage = (nextPage: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(nextPage))
    return `/articles?${next.toString()}`
  }
  const formatDate = (value: string) => `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} UTC`
  return <section className="plan-page">
    <header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div></header>
    <Form method="get" className="plan-filters" role="search">
      <label>{c.search}<input name="search" defaultValue={params.get('search') ?? ''} /></label>
      <label>{c.category}<select name="category" defaultValue={params.get('category') ?? ''}><option value="">{c.all}</option><option value="fundamental">Fundamental</option><option value="technical">Technical</option><option value="market">Market</option><option value="strategy">Strategy</option></select></label>
      <button type="submit">{c.submit}</button>
    </Form>
    {loaded.data.length === 0 ? <p>{c.empty}</p> : <ol className="plan-list">{loaded.data.map(post => <li key={post.id}>
      <h2><Link to={`/articles/${encodeURIComponent(post.slug)}`}>{post.title}</Link></h2>
      <p className="muted">{post.category} · {c.author} {post.author.name ?? '—'} · <time dateTime={post.publishedAt ?? post.createdAt}>{formatDate(post.publishedAt ?? post.createdAt)}</time></p>
      {post.excerpt && <p>{post.excerpt}</p>}
      <Link to={`/articles/${encodeURIComponent(post.slug)}`}>{c.read}</Link>
    </li>)}</ol>}
    {loaded.pagination.totalPages > 1 && <nav className="plan-pagination" aria-label="Article pages">
      {page > 1 && <Link className="button secondary" to={makePage(page - 1)}>{c.previous}</Link>}
      <span>{c.page} {page} / {loaded.pagination.totalPages}</span>
      {page < loaded.pagination.totalPages && <Link className="button secondary" to={makePage(page + 1)}>{c.next}</Link>}
    </nav>}
  </section>
}
