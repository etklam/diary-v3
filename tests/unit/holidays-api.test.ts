import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { ErrorCode } from '@diary/contracts'
import type { AppEnv } from '../../apps/api/src/app'
import { createNagerHolidayProvider, registerHolidayRoutes } from '../../apps/api/src/holidays'

class RouteError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message: string) { super(message) }
}

function routeApp(provider: ReturnType<typeof createNagerHolidayProvider>, authenticated = true) {
  const app = new Hono<AppEnv>()
  app.use('*', async (context, next) => {
    if (authenticated) context.set('user', { id: '1', email: 'calendar@example.test', role: 'USER', tokenVersion: 0 })
    await next()
  })
  registerHolidayRoutes(app, {
    holidays: provider,
    fail(status, code, message) { throw new RouteError(status, code, message) },
    validationError() { throw new RouteError(400, 'SYS_VALIDATION_ERROR', 'Validation failed') },
  })
  app.onError((error, context) => {
    const routeError = error as RouteError
    return context.json({ code: routeError.code }, routeError.status as 400)
  })
  return app
}

describe('Nager holiday provider and route', () => {
  it('uppercases a safe country path and projects validated upstream fields', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify([{
      date: '2026-01-01', localName: '元旦', name: "New Year's Day", countryCode: 'tw',
      fixed: true, global: true, counties: null, launchYear: null, types: ['Public'],
    }]), { status: 200, headers: { 'content-type': 'application/json' } }))
    const provider = createNagerHolidayProvider({ fetch: fetcher as typeof fetch, timeoutMs: 100 })
    await expect(provider.publicHolidays(2026, 'tw')).resolves.toEqual([{
      date: '2026-01-01', localName: '元旦', name: "New Year's Day", countryCode: 'TW',
      fixed: true, global: true, counties: null, launchYear: null, types: ['Public'],
    }])
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://date.nager.at/api/v3/PublicHolidays/2026/TW')
    expect(fetcher.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('serves the authenticated canonical response and rejects unknown query keys', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{
      date: '2026-07-04', localName: 'Independence Day', name: 'Independence Day', countryCode: 'US',
    }]), { status: 200 }))
    const app = routeApp(createNagerHolidayProvider({ fetch: fetcher as typeof fetch }))
    const response = await app.request('/api/holidays?year=2026&countryCode=us')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: [{
      date: '2026-07-04', localName: 'Independence Day', name: 'Independence Day', countryCode: 'US',
    }] })
    expect((await app.request('/api/holidays?year=2026&countryCode=US&extra=1')).status).toBe(400)
  })

  it('rejects unsafe country path characters before fetch and requires authentication', async () => {
    const fetcher = vi.fn(async () => new Response('[]', { status: 200 }))
    const provider = createNagerHolidayProvider({ fetch: fetcher as typeof fetch })
    const app = routeApp(provider)
    for (const countryCode of ['../', 'U/', '1S', '台灣']) {
      expect((await app.request(`/api/holidays?year=2026&countryCode=${encodeURIComponent(countryCode)}`)).status).toBe(400)
    }
    expect(fetcher).not.toHaveBeenCalled()
    expect((await routeApp(provider, false).request('/api/holidays?year=2026&countryCode=US')).status).toBe(401)
  })

  it('maps non-2xx, non-array and malformed upstream payloads to the external-service error', async () => {
    const payloads = [
      new Response('unavailable', { status: 503 }),
      new Response(JSON.stringify({ message: 'not an array' }), { status: 200 }),
      new Response(JSON.stringify([{ date: 'not-a-date', localName: 'Bad', name: 'Bad', countryCode: 'US' }]), { status: 200 }),
      new Response(JSON.stringify([{ date: '2025-01-01', localName: 'Wrong year', name: 'Wrong year', countryCode: 'US' }]), { status: 200 }),
    ]
    for (const response of payloads) {
      const app = routeApp(createNagerHolidayProvider({ fetch: vi.fn(async () => response) as typeof fetch }))
      const result = await app.request('/api/holidays?year=2026&countryCode=US')
      expect(result.status).toBe(502)
      expect(await result.json()).toEqual({ code: 'SYS_EXTERNAL_SERVICE_ERROR' })
    }
  })

  it('aborts a provider call at its configured timeout', async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const provider = createNagerHolidayProvider({ fetch: fetcher as typeof fetch, timeoutMs: 10 })
    await expect(provider.publicHolidays(2026, 'US')).rejects.toBeDefined()
  })

  it('rejects an upstream body larger than 1 MiB before JSON parsing', async () => {
    const oversized = `[${' '.repeat(1024 * 1024)}]`
    const provider = createNagerHolidayProvider({
      fetch: vi.fn(async () => new Response(oversized, { status: 200 })) as typeof fetch,
    })
    await expect(provider.publicHolidays(2026, 'US')).rejects.toThrow('exceeds 1 MiB')
  })
})
