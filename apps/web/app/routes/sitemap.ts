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
  const rows: { slug: string; updatedAt: string; availableLocales: string[]; sourceLocale: string }[] = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const response = await fetch(apiUrl(request, `/api/blog?page=${page}&limit=50&sortBy=publishedAt_desc`), { cache: 'no-store' })
    if (!response.ok) return new Response('Sitemap unavailable', { status: 502 })
    const parsed = postPublicListResponseSchema.parse(await response.json())
    rows.push(...parsed.data.filter(post => post.access === 'PUBLIC').map(post => ({ slug: post.slug, updatedAt: post.updatedAt, availableLocales: post.availableLocales, sourceLocale: post.sourceLocale })))
    totalPages = parsed.pagination.totalPages
    page += 1
  }
  const articleUrl = (slug: string, locale: string, sourceLocale: string) => {
    const path = `${origin}/articles/${encodeURIComponent(slug)}`
    return locale === sourceLocale ? path : `${path}?lang=${encodeURIComponent(locale)}`
  }
  const urls = rows.flatMap(row => row.availableLocales.map(locale => {
    const loc = escapeXml(articleUrl(row.slug, locale, row.sourceLocale))
    const alternates = row.availableLocales.map(alternate => `<xhtml:link rel="alternate" hreflang="${escapeXml(alternate)}" href="${escapeXml(articleUrl(row.slug, alternate, row.sourceLocale))}"/>`).join('')
    return `<url><loc>${loc}</loc><lastmod>${escapeXml(row.updatedAt)}</lastmod>${alternates}<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(articleUrl(row.slug, row.sourceLocale, row.sourceLocale))}"/></url>`
  })).join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${escapeXml(`${origin}/articles`)}</loc></url>${urls}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export default function Sitemap() { return null }
