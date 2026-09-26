import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { accountEmailTokens, mailOutbox, mailSettings, refreshTokens, users } from '@diary/db'
import { and, eq } from 'drizzle-orm'
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../apps/api/src/auth-session'
import { createApp } from '../../apps/api/src/app'
import { openMailPayload } from '../../apps/api/src/account-email/runtime'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock = new Date('2026-09-26T12:00:00.000Z')
let revokedUserIds: string[]
const keyring = { activeVersion: 'test', keys: { test: Buffer.alloc(32, 23).toString('base64') } }

beforeAll(async () => { database = await provisionTestDatabase('account_email_lifecycle') })
beforeEach(async () => {
  clock = new Date('2026-09-26T12:00:00.000Z')
  revokedUserIds = []
  const app = createApp({
    db: database.db,
    databasePool: database.pool,
    config: { jwtSecret: 'synthetic-account-email-lifecycle-secret-at-least-32-chars', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    now: () => clock,
    smtpKeyring: keyring,
    onAccountRevoked: userId => revokedUserIds.push(userId),
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function enableMail() {
  await database.db.update(mailSettings).set({
    enabled: true,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    senderName: 'Trade basic',
    senderEmail: 'noreply@example.test',
    revision: 1,
    lastTestedRevision: 1,
    lastTestedAt: clock,
    lastTestStatus: 'passed',
  }).where(eq(mailSettings.singleton, 'default'))
}

async function tokenFromOutbox(outboxId: bigint): Promise<{ token: string; payload: string }> {
  const [job] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.id, outboxId)).limit(1)
  if (!job?.encryptedPayload) throw new Error('Expected an encrypted queued email')
  const payload = openMailPayload(job.encryptedPayload, keyring)
  const actionLine = payload.text.split('\n').find(line => line.includes('http://'))
  const actionUrl = actionLine?.match(/https?:\/\/\S+/u)?.[0]
  const token = actionUrl ? new URL(actionUrl).searchParams.get('token') : null
  if (!token) throw new Error('Expected a token in the controlled mail payload')
  return { token, payload: job.encryptedPayload }
}

it('preserves direct signup while mail is off, then verifies new registrations without storing raw tokens', async () => {
  const browser = new BrowserSession(baseUrl)
  const capabilities = await browser.request('/api/auth/capabilities')
  expect(capabilities.headers.get('cache-control')).toContain('no-store')
  expect(await capabilities.json()).toEqual({ registrationMode: 'direct', passwordRecoveryAvailable: false })

  const unavailable = await browser.post('/api/auth/password-reset/request', { email: 'unknown@example.test', locale: 'en' })
  expect(unavailable.status).toBe(503)
  expect((await unavailable.json()).data.code).toBe('AUTH_EMAIL_SERVICE_DISABLED')

  const directEmail = `${randomUUID()}@example.test`
  const direct = await browser.post('/api/auth/register', { email: directEmail, password: 'synthetic-direct-password', name: 'Direct user' })
  expect(direct.status).toBe(200)
  await enableMail()
  expect(await (await browser.request('/api/auth/capabilities')).json()).toEqual({ registrationMode: 'email', passwordRecoveryAvailable: true })

  const email = `${randomUUID()}@example.test`
  const request = await browser.post('/api/auth/registration/request', { email, locale: 'en' })
  expect(request.headers.get('cache-control')).toContain('no-store')
  expect(request.headers.get('retry-after')).toBe('60')
  expect(request.status).toBe(200)
  expect(await request.json()).toEqual({ success: true })
  const cooledDown = await browser.post('/api/auth/registration/request', { email, locale: 'en' })
  expect(cooledDown.status).toBe(429)
  expect(cooledDown.headers.get('retry-after')).toBe('60')
  const unknown = await browser.post('/api/auth/registration/request', { email: `${randomUUID()}@example.test`, locale: 'en' })
  expect(unknown.status).toBe(200)
  expect(await unknown.json()).toEqual({ success: true })

  const [tokenRow] = await database.db.select().from(accountEmailTokens).where(and(
    eq(accountEmailTokens.normalizedEmail, email), eq(accountEmailTokens.purpose, 'registration'),
  )).limit(1)
  expect(tokenRow).toBeTruthy()
  expect(tokenRow!.tokenDigest).toMatch(/^[a-f0-9]{64}$/)
  const [job] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.tokenId, tokenRow!.id)).limit(1)
  const captured = await tokenFromOutbox(job!.id)
  expect(tokenRow!.tokenDigest).not.toBe(captured.token)
  expect(captured.payload).not.toContain(captured.token)
  expect(captured.payload).not.toContain('http://127.0.0.1')

  const completed = await browser.post('/api/auth/registration/complete', {
    token: captured.token,
    name: 'Verified user',
    password: 'synthetic-verified-password',
  })
  expect(completed.status).toBe(200)
  expect(await completed.json()).toEqual({ success: true })
  const [created] = await database.db.select().from(users).where(eq(users.email, email)).limit(1)
  expect(created).toBeTruthy()
  expect(created!.name).toBe('Verified user')
  expect(await bcrypt.compare('synthetic-verified-password', created!.password)).toBe(true)
  const [consumed] = await database.db.select().from(accountEmailTokens).where(eq(accountEmailTokens.id, tokenRow!.id)).limit(1)
  expect(consumed!.consumedAt).toEqual(clock)
  const [finishedJob] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.id, job!.id)).limit(1)
  expect(finishedJob).toMatchObject({ status: 'cancelled', encryptedPayload: null })

  const replay = await browser.post('/api/auth/registration/complete', {
    token: captured.token,
    name: 'Verified user',
    password: 'synthetic-verified-password',
  })
  expect(replay.status).toBe(401)
  const bypass = await browser.post('/api/auth/register', { email: `${randomUUID()}@example.test`, password: 'synthetic-bypass-password', name: 'Bypass' })
  expect(bypass.status).toBe(409)
  expect((await bypass.json()).data.code).toBe('AUTH_EMAIL_VERIFICATION_REQUIRED')
})

it('resets passwords once, revokes Web and Native sessions, and does not enumerate emails', async () => {
  await enableMail()
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const oldPassword = 'synthetic-current-password'
  await database.db.insert(users).values({ email, password: await bcrypt.hash(oldPassword, 10), name: 'Reset user' })
  expect((await browser.post('/api/auth/login', { email, password: oldPassword })).status).toBe(200)
  const accessToken = browser.cookies.get(ACCESS_COOKIE)!
  const refreshToken = browser.cookies.get(REFRESH_COOKIE)!
  const native = await browser.post('/api/auth/native/login', { email, password: oldPassword, deviceName: 'synthetic device' })
  expect(native.status).toBe(200)
  const nativeRefresh = (await native.json()).data.refreshToken as string

  const unknown = await browser.post('/api/auth/password-reset/request', { email: `${randomUUID()}@example.test`, locale: 'en' })
  const known = await browser.post('/api/auth/password-reset/request', { email, locale: 'en' })
  expect(unknown.status).toBe(200)
  expect(known.status).toBe(200)
  expect(unknown.headers.get('retry-after')).toBe('60')
  expect(known.headers.get('retry-after')).toBe('60')
  expect(await unknown.json()).toEqual(await known.json())

  const [tokenRow] = await database.db.select().from(accountEmailTokens).where(and(
    eq(accountEmailTokens.normalizedEmail, email), eq(accountEmailTokens.purpose, 'password_reset'),
  )).limit(1)
  expect(tokenRow).toBeTruthy()
  const [job] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.tokenId, tokenRow!.id)).limit(1)
  const { token } = await tokenFromOutbox(job!.id)
  const outcomes = await Promise.all([
    browser.post('/api/auth/password-reset/complete', { token, newPassword: 'synthetic-new-password' }),
    fetch(`${baseUrl}/api/auth/password-reset/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'synthetic-new-password' }),
    }),
  ])
  expect(outcomes.map(result => result.status).sort()).toEqual([200, 401])
  expect(revokedUserIds).toHaveLength(1)
  const [updated] = await database.db.select().from(users).where(eq(users.email, email)).limit(1)
  expect(updated!.tokenVersion).toBe(1)
  expect(await bcrypt.compare('synthetic-new-password', updated!.password)).toBe(true)
  expect((await database.db.select().from(refreshTokens).where(eq(refreshTokens.userId, updated!.id))).length).toBe(0)
  expect((await database.db.select().from(accountEmailTokens).where(and(
    eq(accountEmailTokens.userId, updated!.id), eq(accountEmailTokens.purpose, 'password_reset'),
  ))).every(row => row.consumedAt !== null || row.revokedAt !== null)).toBe(true)

  const oldWeb = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; ${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}` } })
  expect(oldWeb.status).toBe(401)
  const oldNative = await browser.post('/api/auth/native/refresh', { refreshToken: nativeRefresh })
  expect(oldNative.status).toBe(401)
  expect((await browser.post('/api/auth/login', { email, password: 'synthetic-new-password' })).status).toBe(200)
  const notices = await database.db.select().from(mailOutbox).where(and(eq(mailOutbox.kind, 'password_changed'), eq(mailOutbox.recipientEmail, email)))
  expect(notices).toHaveLength(1)
})
