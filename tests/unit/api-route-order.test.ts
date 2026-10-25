import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Database } from '@diary/db'
import { createApp } from '../../apps/api/src/app.js'

/**
 * Registration order is behaviour, not style.
 *
 * Hono matches in the order routes were registered, so a literal segment must
 * register before a `:param` that could shadow it — `diary-routes.ts:1-6` and
 * the reserved Guru paths both depend on it, and those comments were the only
 * record of the requirement. Grouping the composition root's 50-odd registrar
 * calls into per-domain surfaces is safe only if the resulting order is
 * identical, and the integration suite (the usual proof) needs PostgreSQL.
 *
 * This freezes the whole ordered surface so the proof is local and runnable.
 * Regenerate deliberately, never to make a red test green:
 *   UPDATE_ROUTE_ORDER=1 npx vitest run tests/unit/api-route-order.test.ts
 */

const SNAPSHOT = 'tests/fixtures/api-route-order.txt'

function registeredRoutes(): string[] {
  const app = createApp({
    db: {} as Database,
    config: {
      jwtSecret: 'synthetic-route-order-secret-over-32-characters',
      nodeEnv: 'test',
      trustProxy: false,
      webOrigin: 'https://example.test',
    },
  })
  const routes = (app as unknown as { routes: Array<{ method: string; path: string }> }).routes
  return routes.map(route => `${route.method} ${route.path}`)
}

describe('API route registration order', () => {
  it('matches the frozen surface exactly, in order', () => {
    const actual = registeredRoutes()
    if (process.env.UPDATE_ROUTE_ORDER === '1') {
      writeFileSync(SNAPSHOT, `${actual.join('\n')}\n`)
    }
    const expected = readFileSync(SNAPSHOT, 'utf8').trimEnd().split('\n')
    expect(actual).toEqual(expected)
  })

  it('keeps every literal Guru path ahead of the profile slug route', () => {
    const routes = registeredRoutes()
    const slug = routes.findIndex(route => route.endsWith(' /api/gurus/:slug'))
    expect(slug).toBeGreaterThan(-1)
    const literals = routes.filter(route => /\/api\/gurus\/[a-z]/.test(route))
    expect(literals.length).toBeGreaterThan(0)
    for (const literal of literals) {
      expect(routes.indexOf(literal), literal).toBeLessThan(slug)
    }
  })

  it('keeps the request pipeline ahead of every handler', () => {
    const routes = registeredRoutes()
    // Compression, request id, body-length limit, CORS, authentication, CSRF
    // and the bounded body read are all `ALL` middleware and must precede the
    // first concrete route, or a handler could run unauthenticated.
    const firstConcrete = routes.findIndex(route => !route.startsWith('ALL '))
    expect(firstConcrete).toBeGreaterThan(0)
    expect(routes.slice(0, firstConcrete).every(route => route.startsWith('ALL '))).toBe(true)
  })

  it('covers a surface large enough for the snapshot to mean something', () => {
    expect(registeredRoutes().length).toBeGreaterThan(250)
  })
})
