import { data, Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router'
import { postPublicDetailSchema, type PostPublicDetail } from '@diary/contracts/post'
import { Markdown } from '../markdown'
import { useUi } from '../ui'
import '../trade-plan.css'

function apiUrl(request: Request, path: string) {
  const origin = typeof window === 'undefined' && typeof process !== 'undefined' && process.env.API_ORIGIN
    ? process.env.API_ORIGIN
    : new URL(request.url).origin
  return `${origin}${path}`
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const slug = params.slug
  if (!slug) throw new Response('Article not found', { status: 404 })
  const response = await fetch(apiUrl(request, `/api/blog/${encodeURIComponent(slug)}`))
  if (!response.ok) throw new Response('Article not found', { status: response.status === 404 ? 404 : 502 })
  const post = postPublicDetailSchema.parse(await response.json())
  return data({ post, origin: new URL(request.url).origin })
}

export const meta: MetaFunction<typeof loader> = ({ loaderData: loaded }) => {
  if (!loaded) return [{ title: 'Article — Trade basic' }]
  const description = loaded.post.excerpt ?? loaded.post.title
  const canonical = `${loaded.origin}/articles/${encodeURIComponent(loaded.post.slug)}`
  return [
    { title: `${loaded.post.title} — Trade basic` },
    { name: 'description', content: description },
    { property: 'og:title', content: loaded.post.title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'article' },
    { tagName: 'link', rel: 'canonical', href: canonical },
  ]
}

const copy = {
  en: { back: 'All articles', by: 'By' },
  'zh-TW': { back: '全部文章', by: '作者' },
  'zh-CN': { back: '全部文章', by: '作者' },
} as const

export default function Article() {
  const { post } = useLoaderData<typeof loader>() as { post: PostPublicDetail }
  const { locale } = useUi()
  const c = copy[locale]
  const formatDate = (value: string) => `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} UTC`
  return <article className="diary-reading">
    <Link to="/articles">{c.back}</Link>
    <header>
      <p className="muted">{post.category} · {c.by} {post.author.name ?? '—'} · <time dateTime={post.publishedAt ?? post.createdAt}>{formatDate(post.publishedAt ?? post.createdAt)}</time></p>
      <h1>{post.title}</h1>
      {post.excerpt && <p className="lede">{post.excerpt}</p>}
      {post.coverImage && <img src={post.coverImage} alt={post.title} style={{ width: '100%', height: 'auto', maxHeight: 480, objectFit: 'cover' }} />}
    </header>
    <Markdown>{post.content}</Markdown>
  </article>
}
