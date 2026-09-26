import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { RateLimitStoreUnavailableError, type RateLimitRuntime } from '../../apps/api/src/rate-limit/index.js'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>

beforeAll(async () => { database = await provisionTestDatabase('rate_limit_readiness') })
afterAll(async () => { await database?.dispose() })

function runtime(mode: 'memory' | 'redis' | 'auto', ready: boolean, degraded: boolean): RateLimitRuntime {
  const backend = mode === 'auto' ? 'memory' : mode
  return {
    mode, backend, degraded, ready,
    async consume() { return { allowed: true, limit: 1, remaining: 0, resetAt: Date.now(), retryAfterMs: 0 } },
    async close() {},
  }
}

function app(rateLimiter: RateLimitRuntime) {
  return createApp({
    db: database.db,
    rateLimiter,
    config: { jwtSecret: 'synthetic-rate-limit-readiness-secret-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
}

describe('rate-limit readiness semantics', () => {
  it('does not fail liveness or readiness for an unavailable optional auto backend', async () => {
    const server = app(runtime('auto', true, true))
    expect((await server.request('/healthz')).status).toBe(200)
    const ready = await server.request('/readyz')
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ status: 'ready', rateLimit: 'degraded' })
  })

  it('fails readiness but preserves process liveness when required Redis is unavailable', async () => {
    const server = app(runtime('redis', false, true))
    expect((await server.request('/healthz')).status).toBe(200)
    expect((await server.request('/readyz')).status).toBe(503)
    expect(await (await server.request('/readyz')).json()).toEqual({ status: 'not_ready' })
  })

  it('returns a backend-neutral service error when mandatory Redis fails during a request', async () => {
    const required = runtime('redis', false, true)
    const server = app({ ...required, async consume() { throw new RateLimitStoreUnavailableError() } })
    const response = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'synthetic@example.test', password: 'synthetic-password' }),
    })
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.statusMessage).toBe('Service temporarily unavailable.')
    expect(JSON.stringify(body)).not.toMatch(/redis|timeout/i)
  })
})
