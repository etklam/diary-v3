import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import type { HolidayProvider } from '../../apps/api/src/holidays'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let publicHolidays: ReturnType<typeof vi.fn<HolidayProvider['publicHolidays']>>

async function registerAndLogin(browser: BrowserSession) {
  const email = `${randomUUID()}@example.test`
  const password = 'test-password-123'
  expect((await browser.post('/api/auth/register', { email, password })).status).toBe(200)
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
}

beforeAll(async () => { database = await provisionTestDatabase('holidays_http') })
beforeEach(async () => {
  publicHolidays = vi.fn(async () => [{
    date: '2026-01-01', localName: '元旦', name: "New Year's Day", countryCode: 'TW' as const,
    fixed: true, global: true, counties: null, launchYear: null, types: ['Public'],
  }])
  const app = createApp({
    db: database.db,
    holidays: { publicHolidays },
    config: {
      jwtSecret: 'test-only-holiday-http-secret-over-32-characters',
      nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
    },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server.close()
  await once(server, 'close')
})
afterAll(async () => { await database?.dispose() })

describe('holiday HTTP contract with injected provider', () => {
  it('requires an authenticated owner and returns normalized query data with official fields', async () => {
    expect((await fetch(`${baseUrl}/api/holidays?year=2026&countryCode=tw`)).status).toBe(401)
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const response = await browser.request('/api/holidays?year=2026&countryCode=tw')
    expect(response.status).toBe(200)
    expect(publicHolidays).toHaveBeenCalledWith(2026, 'TW')
    expect(await response.json()).toEqual({ success: true, data: [{
      date: '2026-01-01', localName: '元旦', name: "New Year's Day", countryCode: 'TW',
      fixed: true, global: true, counties: null, launchYear: null, types: ['Public'],
    }] })
  })

  it('fails closed on an invalid explicit Bearer even with valid browser cookies', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const response = await browser.request('/api/holidays?year=2026&countryCode=TW', {
      headers: { authorization: 'Bearer invalid' },
    })
    expect(response.status).toBe(401)
    expect((await response.json()).data.code).toBe('AUTH_TOKEN_INVALID')
    expect(publicHolidays).not.toHaveBeenCalled()
  })

  it('rejects missing, out-of-range, unsafe and unknown query values before the provider', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    for (const path of [
      '/api/holidays',
      '/api/holidays?year=1899&countryCode=TW',
      '/api/holidays?year=2026&countryCode=U%2F',
      '/api/holidays?year=2026&countryCode=TW&extra=1',
    ]) {
      const response = await browser.request(path)
      expect(response.status).toBe(400)
      expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR')
    }
    expect(publicHolidays).not.toHaveBeenCalled()
  })

  it('maps provider failure to canonical 502 while preserving the request id', async () => {
    publicHolidays.mockRejectedValueOnce(new Error('controlled upstream outage'))
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const response = await browser.request('/api/holidays?year=2026&countryCode=TW', {
      headers: { 'x-request-id': 'holiday-fixture-request' },
    })
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body).toMatchObject({
      statusCode: 502,
      data: { code: 'SYS_EXTERNAL_SERVICE_ERROR', requestId: 'holiday-fixture-request' },
    })
    expect(response.headers.get('x-request-id')).toBe('holiday-fixture-request')
  })
})
