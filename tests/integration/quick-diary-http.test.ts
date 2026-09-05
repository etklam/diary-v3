import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string

async function registerAndLogin(browser: BrowserSession) {
  const email = `${randomUUID()}@example.test`
  const password = 'test-password-123'
  expect((await browser.post('/api/auth/register', { email, password })).status).toBe(200)
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return { email, password }
}

async function nativeAccessToken(email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/native/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, deviceName: 'Quick Diary test' }),
  })
  expect(response.status).toBe(200)
  return (await response.json()).data.accessToken as string
}

function bearerPost(token: string, body: unknown) {
  return fetch(`${baseUrl}/api/diaries`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function cookieMutation(browser: BrowserSession, method: 'PUT' | 'DELETE', path: string, body?: unknown) {
  const headers = new Headers({ 'x-csrf-token': browser.cookies.get('csrf-token')! })
  if (body !== undefined) headers.set('content-type', 'application/json')
  return browser.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function waitForLockWaiters(expected: number) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const result = await database.pool.query(`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `)
    if (result.rows[0].count >= expected) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Expected ${expected} PostgreSQL lock waiters`)
}

beforeAll(async () => { database = await provisionTestDatabase('quick_diary') })
beforeEach(async () => {
  const app = createApp({
    db: database.db,
    config: {
      jwtSecret: 'test-only-quick-diary-secret-over-32-characters',
      nodeEnv: 'test',
      trustProxy: false,
      webOrigin: 'http://127.0.0.1',
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

describe('Quick Diary append over real HTTP and PostgreSQL', () => {
  it('finds an owner diary by civil date and returns null without leaking another owner', async () => {
    const owner = new BrowserSession(baseUrl)
    const other = new BrowserSession(baseUrl)
    await registerAndLogin(owner)
    await registerAndLogin(other)
    const created = await owner.post('/api/diaries', {
      title: 'Taipei today', content: 'Civil date stays unchanged.', date: '2026-06-16',
    })
    expect(created.status).toBe(201)

    const found = await owner.request('/api/diaries/by-date?date=2026-06-16')
    expect(found.status).toBe(200)
    expect(await found.json()).toMatchObject({ title: 'Taipei today', date: '2026-06-16' })
    expect(await (await other.request('/api/diaries/by-date?date=2026-06-16')).json()).toBeNull()
    expect(await (await owner.request('/api/diaries/by-date?date=2026-06-17')).json()).toBeNull()

    for (const path of [
      '/api/diaries/by-date',
      '/api/diaries/by-date?date=2026-02-30',
      '/api/diaries/by-date?date=2026-06-16&unexpected=true',
    ]) {
      expect((await owner.request(path)).status).toBe(400)
    }
  })

  it('appends content and tags while deliberately applying optional structured fields', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const initial = await browser.post('/api/diaries', {
      title: 'Original title', content: 'Original body', date: '2026-06-18',
      tags: ['watch', 'macro,fx'], thesis: 'Old thesis', risk: 'Old risk', execution: 'Keep execution',
    })
    expect(initial.status).toBe(201)
    const original = await initial.json()

    const appended = await browser.post('/api/diaries', {
      title: 'Ignored for an existing Diary', content: 'New body', date: '2026-06-18',
      tags: ['watch', 'learning'], appendToToday: true,
      thesis: 'New thesis', risk: null,
    })
    expect(appended.status).toBe(201)
    expect(await appended.json()).toMatchObject({
      id: original.id,
      title: 'Original title',
      content: 'Original body\n\n---\n\nNew body',
      tags: ['watch', 'macro,fx', 'learning'],
      thesis: 'New thesis', risk: null, execution: 'Keep execution',
    })

    const conflict = await browser.post('/api/diaries', {
      title: 'Ordinary create', content: 'Must conflict', date: '2026-06-18',
    })
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).data.code).toBe('DIARY_ALREADY_EXISTS')
  })

  it('serializes many appends to an existing Diary without losing or duplicating fragments', async () => {
    const browser = new BrowserSession(baseUrl)
    const credentials = await registerAndLogin(browser)
    const token = await nativeAccessToken(credentials.email, credentials.password)
    const created = await bearerPost(token, {
      title: 'Concurrent log', content: 'base-marker', date: '2026-06-19',
    })
    expect(created.status).toBe(201)
    const id = (await created.json()).id
    const markers = Array.from({ length: 12 }, (_, index) => `append-marker-${index}`)

    const responses = await Promise.all(markers.map((content, index) => bearerPost(token, {
      title: `Append ${index}`, content, date: '2026-06-19', appendToToday: true,
      tags: [`tag-${index}`],
    })))
    expect(responses.every(response => response.status === 201)).toBe(true)
    expect(new Set(await Promise.all(responses.map(async response => (await response.json()).id)))).toEqual(new Set([id]))

    const final = await (await browser.request('/api/diaries/by-date?date=2026-06-19')).json()
    const fragments = final.content.split('\n\n---\n\n')
    expect(fragments).toHaveLength(markers.length + 1)
    expect(new Set(fragments)).toEqual(new Set(['base-marker', ...markers]))
    expect(final.tags).toHaveLength(markers.length)
    expect(new Set(final.tags)).toEqual(new Set(markers.map((_, index) => `tag-${index}`)))
  })

  it('serializes append-on-empty so both successful bodies land in one Diary', async () => {
    const browser = new BrowserSession(baseUrl)
    const credentials = await registerAndLogin(browser)
    const token = await nativeAccessToken(credentials.email, credentials.password)
    const bodies = ['first-empty-marker', 'second-empty-marker']
    const responses = await Promise.all(bodies.map((content, index) => bearerPost(token, {
      title: `First title candidate ${index}`, content, date: '2026-06-20', appendToToday: true,
    })))
    expect(responses.map(response => response.status)).toEqual([201, 201])
    const payloads = await Promise.all(responses.map(response => response.json()))
    expect(new Set(payloads.map(payload => payload.id)).size).toBe(1)

    const final = await (await browser.request('/api/diaries/by-date?date=2026-06-20')).json()
    expect(new Set(final.content.split('\n\n---\n\n'))).toEqual(new Set(bodies))
    const rows = await database.pool.query('SELECT count(*)::int AS count FROM diaries WHERE user_id = $1 AND date = $2', [final.userId, '2026-06-20'])
    expect(rows.rows[0].count).toBe(1)
  })

  it('appends onto a full PUT that was already waiting for the same row', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const created = await (await browser.post('/api/diaries', {
      title: 'Locked update', content: 'Original body', date: '2026-06-22',
    })).json()
    const blocker = await database.pool.connect()
    let transactionOpen = false
    try {
      await blocker.query('BEGIN')
      transactionOpen = true
      await blocker.query('SELECT id FROM diaries WHERE id = $1 FOR UPDATE', [created.id])

      const put = cookieMutation(browser, 'PUT', `/api/diaries/${created.id}`, {
        title: 'Committed PUT title', content: 'Committed PUT body',
      })
      await waitForLockWaiters(1)
      const append = browser.post('/api/diaries', {
        title: 'Append title is ignored', content: 'Append after PUT',
        date: '2026-06-22', appendToToday: true,
      })
      await waitForLockWaiters(2)
      await blocker.query('COMMIT')
      transactionOpen = false

      const [putResponse, appendResponse] = await Promise.all([put, append])
      expect(putResponse.status).toBe(200)
      expect(appendResponse.status).toBe(201)
      expect(await appendResponse.json()).toMatchObject({
        title: 'Committed PUT title',
        content: 'Committed PUT body\n\n---\n\nAppend after PUT',
      })
    } finally {
      if (transactionOpen) await blocker.query('ROLLBACK')
      blocker.release()
    }
  })

  it('creates cleanly when a queued delete commits before append reads the row', async () => {
    const browser = new BrowserSession(baseUrl)
    await registerAndLogin(browser)
    const created = await (await browser.post('/api/diaries', {
      title: 'Delete race', content: 'Deleted body', date: '2026-06-23',
    })).json()
    const blocker = await database.pool.connect()
    let transactionOpen = false
    try {
      await blocker.query('BEGIN')
      transactionOpen = true
      await blocker.query('SELECT id FROM diaries WHERE id = $1 FOR UPDATE', [created.id])

      const deletion = cookieMutation(browser, 'DELETE', `/api/diaries/${created.id}`)
      await waitForLockWaiters(1)
      const append = browser.post('/api/diaries', {
        title: 'Replacement after delete', content: 'Body after delete',
        date: '2026-06-23', appendToToday: true,
      })
      await waitForLockWaiters(2)
      await blocker.query('COMMIT')
      transactionOpen = false

      const [deleteResponse, appendResponse] = await Promise.all([deletion, append])
      expect(deleteResponse.status).toBe(200)
      expect(appendResponse.status).toBe(201)
      expect(await appendResponse.json()).toMatchObject({
        title: 'Replacement after delete', content: 'Body after delete', date: '2026-06-23',
      })
    } finally {
      if (transactionOpen) await blocker.query('ROLLBACK')
      blocker.release()
    }
  })

  it('keeps cookie CSRF enforcement while allowing an authenticated Native bearer append', async () => {
    const browser = new BrowserSession(baseUrl)
    const credentials = await registerAndLogin(browser)
    const token = await nativeAccessToken(credentials.email, credentials.password)
    const body = {
      title: 'Transport parity', content: 'Created by cookie', date: '2026-06-21', appendToToday: true,
    }
    expect((await browser.post('/api/diaries', body, false)).status).toBe(403)
    expect((await browser.post('/api/diaries', body)).status).toBe(201)
    const bearer = await bearerPost(token, { ...body, content: 'Appended by native bearer' })
    expect(bearer.status).toBe(201)
    expect((await bearer.json()).content).toBe('Created by cookie\n\n---\n\nAppended by native bearer')
  })
})
