import { postPublicListResponseSchema } from '@diary/contracts/post'
import type { LoaderFunctionArgs } from 'react-router'

function apiUrl(request: Request, path: string) {
  const origin = typeof window === 'undefined' && typeof process !== 'undefined' && process.env.API_ORIGIN
    ? process.env.API_ORIGIN
    : new URL(request.url).origin
  return `${origin}${path}`
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
}

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin
  const rows: { slug: string; updatedAt: string }[] = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const response = await fetch(apiUrl(request, `/api/blog?page=${page}&limit=50&sortBy=publishedAt_desc`))
    if (!response.ok) return new Response('Sitemap unavailable', { status: 502 })
    const parsed = postPublicListResponseSchema.parse(await response.json())
    rows.push(...parsed.data.map(post => ({ slug: post.slug, updatedAt: post.updatedAt })))
    totalPages = parsed.pagination.totalPages
    page += 1
  }
  const urls = rows.map(row => `<url><loc>${escapeXml(`${origin}/articles/${encodeURIComponent(row.slug)}`)}</loc><lastmod>${escapeXml(row.updatedAt)}</lastmod></url>`).join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeXml(`${origin}/articles`)}</loc></url>${urls}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}

export default function Sitemap() { return null }
