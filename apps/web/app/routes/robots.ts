import type { LoaderFunctionArgs } from 'react-router'
import { canonicalOrigin } from '../site-origin'

/**
 * `robots.txt` is a route rather than a static asset so the `Sitemap:` line can
 * name the canonical origin instead of a hard-coded host. Only the private
 * workspace, administration, and the design preview are disallowed: the home
 * page, guide, About, articles, and every public tool stay crawlable because
 * they are the product's public surface.
 */
const DISALLOWED = [
  '/api/',
  '/admin/',
  '/design-preview',
  '/achievements',
  '/alerts',
  '/calendar',
  '/diaries',
  '/discipline',
  '/etf/',
  '/partners',
  '/reviews',
  '/settings',
  '/stocks',
  '/strategy-performance',
  '/timeline',
  '/trade-plans',
]

export async function loader({ request }: LoaderFunctionArgs) {
  const origin = canonicalOrigin(request.url)
  const body = [
    'User-agent: *',
    ...DISALLOWED.map(path => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}

export default function Robots() { return null }
