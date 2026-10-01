import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RETURN_FALLBACK, safeAuthReturnPath, safeReturnPath } from '../../apps/web/app/return-paths'

/**
 * Sign-in return destinations are an allowlist, so an unlisted route collapses
 * to the fallback instead of failing loudly. This walks the route manifest and
 * turns that silence into a test failure: every registered route is either a
 * declared non-destination below or must survive `safeReturnPath` unchanged.
 */
const NON_DESTINATIONS = new Set([
  // The workspace entry point; returning here is the fallback's own job.
  '/',
  // Authentication and recovery pages: returning to them after signing in
  // would loop.
  '/login', '/register', '/register/complete', '/forgot-password', '/reset-password',
  // Public marketing and reference pages with nothing to resume.
  '/about', '/guide',
  // A public share target that is read without an account.
  '/discipline/share',
  // Redirect shims, machine endpoints, and the internal design preview.
  '/blog', '/blog/:slug', '/sitemap.xml', '/robots.txt', '/design-preview',
])

const PARAMETER_SAMPLES: Record<string, string> = {
  ':id': '1',
  ':symbol': 'AAPL',
  ':slug': 'sample',
  ':cik': '1234567890',
  ':accession': '0000000000-00-000000',
}

function routePaths(): string[] {
  const source = readFileSync('apps/web/app/routes.ts', 'utf8')
  const paths = [...source.matchAll(/\broute\(\s*'([^']+)'/g)].map(match => `/${match[1]!}`)
  if (!/\bindex\(/.test(source)) throw new Error('Route manifest no longer declares an index route')
  return ['/', ...paths]
}

function sampleFor(path: string): string {
  return path.split('/').map(segment => {
    if (!segment.startsWith(':')) return segment
    const sample = PARAMETER_SAMPLES[segment]
    if (!sample) throw new Error(`No sample value for route parameter ${segment}`)
    return sample
  }).join('/')
}

describe('sign-in return destinations', () => {
  it('classifies every registered route', () => {
    const unclassified: string[] = []
    for (const path of routePaths()) {
      if (NON_DESTINATIONS.has(path)) continue
      const sample = sampleFor(path)
      if (safeReturnPath(sample) !== sample) unclassified.push(`${path} (tried ${sample})`)
    }
    expect(unclassified, 'Add these to the return allowlist or to NON_DESTINATIONS').toEqual([])
  })

  it('keeps the declared non-destinations out of the allowlist', () => {
    for (const path of NON_DESTINATIONS) {
      if (path.includes(':')) continue
      expect(safeReturnPath(path), path).toBe(RETURN_FALLBACK)
    }
  })

  it('rejects anything that is not an internal path', () => {
    for (const candidate of [
      null,
      '',
      'https://outside.example/diaries',
      '//outside.example/diaries',
      '/diaries?next=https://outside.example',
      '/diaries/../admin/users',
      '/unknown-route',
      '/admin/blog/not-an-id/edit',
      '/diaries/0',
    ]) {
      expect(safeReturnPath(candidate), String(candidate)).toBe(RETURN_FALLBACK)
    }
  })
})

describe('administration return destinations', () => {
  it('keeps filter state for an allowlisted administration path', () => {
    expect(safeAuthReturnPath('/admin/blog?status=draft&page=2')).toBe('/admin/blog?status=draft&page=2')
    expect(safeAuthReturnPath('/admin/users')).toBe('/admin/users')
    expect(safeAuthReturnPath('/admin/email-settings')).toBe('/admin/email-settings')
    expect(safeAuthReturnPath('/admin/blog#section')).toBe('/admin/blog')
  })

  it('does not accept an administration path that is not a known destination', () => {
    for (const candidate of [
      '/admin/unknown',
      '/admin/unknown?status=draft',
      '/admin//outside.example',
      '/admin/blog?status=draft#fragment',
    ]) {
      expect(safeAuthReturnPath(candidate), candidate).toBe(RETURN_FALLBACK)
    }
  })

  it('falls back to the shared rule outside administration', () => {
    expect(safeAuthReturnPath('/diaries')).toBe('/diaries')
    expect(safeAuthReturnPath('/diaries?status=open')).toBe(RETURN_FALLBACK)
  })
})
