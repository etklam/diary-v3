import { createHash, randomUUID } from 'node:crypto'
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

const digest = (token: string) => createHash('sha256').update(token).digest('hex')

async function account() {
  return { email: `${randomUUID()}@example.test`, password: 'account-security-old-password' }
}

async function register(credentials: Awaited<ReturnType<typeof account>>) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  expect(response.status).toBe(200)
}

async function nativeLogin(credentials: Awaited<ReturnType<typeof account>>) {
  const response = await fetch(`${baseUrl}/api/auth/native/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  return response
}

async function nativeRefresh(refreshToken: string) {
  return fetch(`${baseUrl}/api/auth/native/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
}

async function signedInBrowser(credentials: Awaited<ReturnType<typeof account>>) {
  const browser = new BrowserSession(baseUrl)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return browser
}

function changePassword(browser: BrowserSession, body: { currentPassword: string; newPassword: string }) {
  return browser.request('/api/user/password', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': browser.cookies.get('csrf-token')!,
    },
    body: JSON.stringify(body),
  })
}

async function waitForBlockedRequests(count: number) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const waiting = await database.pool.query(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    )
    if (waiting.rows[0].count >= count) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Expected ${count} blocked test requests`)
}

beforeAll(async () => { database = await provisionTestDatabase('diary_v3_security') })
beforeEach(async () => {
  const app = createApp({
    db: database.db,
    config: {
      jwtSecret: 'account-security-tests-only-secret-over-32-chars',
      nodeEnv: 'test',
      trustProxy: false,
      webOrigin: 'http://127.0.0.1',
    },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

describe('account-wide session security', () => {
  it('logout-all invalidates every Web and Native session for one user only', async () => {
    const credentials = await account()
    const otherCredentials = await account()
    await register(credentials)
    await register(otherCredentials)
    const browser = await signedInBrowser(credentials)
    const webRefresh = browser.cookies.get('refresh-token')!
    const nativeA = (await (await nativeLogin(credentials)).json()).data
    const nativeB = (await (await nativeLogin(credentials)).json()).data
    const other = (await (await nativeLogin(otherCredentials)).json()).data

    expect((await browser.post('/api/auth/logout-all', {}, false)).status).toBe(403)
    expect((await browser.request('/api/auth/me')).status).toBe(200)
    const response = await browser.post('/api/auth/logout-all', {})
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(browser.cookies.has('access-token')).toBe(false)
    expect(browser.cookies.has('refresh-token')).toBe(false)

    expect((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${nativeA.accessToken}` } })).status).toBe(401)
    expect((await nativeRefresh(nativeA.refreshToken)).status).toBe(401)
    expect((await nativeRefresh(nativeB.refreshToken)).status).toBe(401)
    const staleWeb = new BrowserSession(baseUrl)
    staleWeb.cookies.set('refresh-token', webRefresh)
    expect((await staleWeb.post('/api/auth/refresh', {})).status).toBe(401)
    expect((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${other.accessToken}` } })).status).toBe(200)

    const rows = await database.pool.query(
      'SELECT revoked_at, revocation_reason FROM refresh_tokens WHERE user_id = $1',
      [nativeA.user.id],
    )
    expect(rows.rows).toHaveLength(3)
    expect(rows.rows.every(row => row.revoked_at && row.revocation_reason === 'LOGOUT_ALL')).toBe(true)
  })

  it('changes the password atomically and keeps failed validation or verification non-destructive', async () => {
    const credentials = await account()
    await register(credentials)
    const browser = await signedInBrowser(credentials)
    const native = (await (await nativeLogin(credentials)).json()).data

    const missingCsrf = await browser.request('/api/user/password', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: credentials.password, newPassword: 'new-account-security-password' }),
    })
    expect(missingCsrf.status).toBe(403)

    const wrong = await changePassword(browser, {
      currentPassword: 'wrong-password', newPassword: 'new-account-security-password',
    })
    expect(wrong.status).toBe(401)
    expect((await browser.request('/api/auth/me')).status).toBe(200)

    const overlong = await changePassword(browser, {
      currentPassword: credentials.password, newPassword: '密'.repeat(25),
    })
    expect(overlong.status).toBe(400)
    const rotatedResponse = await nativeRefresh(native.refreshToken)
    expect(rotatedResponse.status).toBe(200)
    const rotated = (await rotatedResponse.json()).data

    const changed = await changePassword(browser, {
      currentPassword: credentials.password, newPassword: 'new-account-security-password',
    })
    expect(changed.status).toBe(200)
    expect(await changed.json()).toEqual({
      success: true,
      message: 'Password changed successfully. Please login again.',
    })
    expect(browser.cookies.has('access-token')).toBe(false)
    expect(browser.cookies.has('refresh-token')).toBe(false)
    expect((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${rotated.accessToken}` } })).status).toBe(401)
    expect((await nativeRefresh(rotated.refreshToken)).status).toBe(401)
    expect((await nativeLogin(credentials)).status).toBe(401)
    expect((await nativeLogin({ ...credentials, password: 'new-account-security-password' })).status).toBe(200)
  })

  it('serializes logout-all behind a native rotation so no replacement escapes revocation', async () => {
    const credentials = await account()
    await register(credentials)
    const native = (await (await nativeLogin(credentials)).json()).data
    const stored = await database.pool.query('SELECT id FROM refresh_tokens WHERE token = $1', [digest(native.refreshToken)])
    const parentId = String(stored.rows[0].id)
    const gate = await database.pool.connect()
    let rotation: Promise<Response> | undefined
    let logoutAll: Promise<Response> | undefined
    try {
      await database.pool.query(`CREATE FUNCTION account_rotation_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.parent_id = ${parentId} THEN PERFORM pg_advisory_xact_lock(2026090506); END IF; RETURN NEW; END; $$`)
      await database.pool.query('CREATE TRIGGER account_rotation_gate BEFORE INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION account_rotation_gate()')
      await gate.query('SELECT pg_advisory_lock(2026090506)')
      rotation = nativeRefresh(native.refreshToken)
      await waitForBlockedRequests(1)
      logoutAll = fetch(`${baseUrl}/api/auth/logout-all`, {
        method: 'POST', headers: { authorization: `Bearer ${native.accessToken}` },
      })
      await waitForBlockedRequests(2)
      await gate.query('SELECT pg_advisory_unlock(2026090506)')
      const [rotated, loggedOut] = await Promise.all([rotation, logoutAll])
      expect(rotated.status).toBe(200)
      expect(loggedOut.status).toBe(200)
      const replacement = (await rotated.json()).data
      expect((await nativeRefresh(replacement.refreshToken)).status).toBe(401)
      const active = await database.pool.query('SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [native.user.id])
      expect(active.rows).toHaveLength(0)
    } finally {
      await gate.query('SELECT pg_advisory_unlock(2026090506)')
      await Promise.allSettled([rotation, logoutAll].filter(Boolean))
      await database.pool.query('DROP TRIGGER IF EXISTS account_rotation_gate ON refresh_tokens')
      await database.pool.query('DROP FUNCTION IF EXISTS account_rotation_gate()')
      gate.release()
    }
  })

  it('rejects an old-password login queued behind a password change', async () => {
    const credentials = await account()
    await register(credentials)
    const browser = await signedInBrowser(credentials)
    const user = await database.pool.query('SELECT id FROM users WHERE email = $1', [credentials.email])
    const userId = String(user.rows[0].id)
    const gate = await database.pool.connect()
    let changing: Promise<Response> | undefined
    let oldLogin: Promise<Response> | undefined
    try {
      await database.pool.query(`CREATE FUNCTION account_password_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.user_id = ${userId} THEN PERFORM pg_advisory_xact_lock(2026090507); END IF; RETURN OLD; END; $$`)
      await database.pool.query('CREATE TRIGGER account_password_gate BEFORE DELETE ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION account_password_gate()')
      await gate.query('SELECT pg_advisory_lock(2026090507)')
      changing = changePassword(browser, {
        currentPassword: credentials.password, newPassword: 'new-password-after-race',
      })
      await waitForBlockedRequests(1)
      oldLogin = nativeLogin(credentials)
      await waitForBlockedRequests(2)
      await gate.query('SELECT pg_advisory_unlock(2026090507)')
      const [changed, rejected] = await Promise.all([changing, oldLogin])
      expect(changed.status).toBe(200)
      expect(rejected.status).toBe(401)
      expect((await nativeLogin({ ...credentials, password: 'new-password-after-race' })).status).toBe(200)
    } finally {
      await gate.query('SELECT pg_advisory_unlock(2026090507)')
      await Promise.allSettled([changing, oldLogin].filter(Boolean))
      await database.pool.query('DROP TRIGGER IF EXISTS account_password_gate ON refresh_tokens')
      await database.pool.query('DROP FUNCTION IF EXISTS account_password_gate()')
      gate.release()
    }
  })
})
