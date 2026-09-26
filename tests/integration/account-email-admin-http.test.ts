import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { mailAdminAuditEvents, mailOutbox, mailSettings } from '@diary/db'
import { createApp } from '../../apps/api/src/app'
import type { SmtpTransportFactory } from '../../apps/api/src/account-email/smtp'
import { setSmtpEnabled } from '../../apps/api/src/account-email/settings'
import { sealMailPayload } from '../../apps/api/src/account-email/runtime'
import { runAccountEmailWorkerOnce } from '../../apps/api/src/account-email/worker'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let sentMessages: Array<{ to: string; subject: string; text: string; html: string }>
let transportFactory: SmtpTransportFactory
let failSmtpSends = false
let holdSmtpSubject: string | null = null
let signalSmtpSendStarted: (() => void) | null = null
let releaseSmtpSend: (() => void) | null = null

const smtpKeyring = { activeVersion: 'test', keys: { test: Buffer.alloc(32, 19).toString('base64') } }

beforeAll(async () => { database = await provisionTestDatabase('account_email_admin') })
beforeEach(async () => {
  sentMessages = []
  failSmtpSends = false
  holdSmtpSubject = null
  signalSmtpSendStarted = null
  releaseSmtpSend = null
  transportFactory = () => ({
    async sendMail(options) {
      if (holdSmtpSubject && String(options.subject) === holdSmtpSubject) {
        signalSmtpSendStarted?.()
        await new Promise<void>(resolve => { releaseSmtpSend = resolve })
      }
      if (failSmtpSends) throw Object.assign(new Error('Synthetic SMTP connection failure'), { code: 'ECONNREFUSED' })
      const to = typeof options.to === 'string' ? options.to : ''
      const message = {
        to,
        subject: String(options.subject ?? ''),
        text: String(options.text ?? ''),
        html: String(options.html ?? ''),
      }
      sentMessages.push(message)
      return { accepted: [to], messageId: 'synthetic-admin-test' }
    },
  })
  const app = createApp({
    db: database.db,
    databasePool: database.pool,
    config: { jwtSecret: 'synthetic-account-email-admin-secret-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    now: () => new Date('2026-09-26T12:00:00.000Z'),
    smtpTransportFactory: transportFactory,
    smtpKeyring,
    smtpHostLookup: async hostname => hostname === 'smtp.example.test' ? ['8.8.8.8'] : [],
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function account(role: 'ADMIN' | 'USER') {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-admin-password', name: 'Mail administrator' }
  await database.pool.query('insert into users(email,password,name,role,locale) values ($1,$2,$3,$4,$5)', [credentials.email, await bcrypt.hash(credentials.password, 4), credentials.name, role, 'zh-TW'])
  expect((await browser.post('/api/auth/login', { email: credentials.email, password: credentials.password })).status).toBe(200)
  const response = await browser.request('/api/auth/me')
  expect(response.status).toBe(200)
  return { browser, user: (await response.json()).data as { id: string; role: string } }
}

function mutate(browser: BrowserSession, method: 'PUT' | 'POST', path: string, body: unknown) {
  return browser.request(path, {
    method,
    headers: new Headers({ 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }),
    body: JSON.stringify(body),
  })
}

it('keeps SMTP drafts redacted, tests the saved revision, gates enable, cancels queued mail and audits without PII', async () => {
  const admin = await account('ADMIN')
  const diagnosticEmail = `diagnostic-${randomUUID()}@example.test`
  const ordinary = await account('USER')
  expect((await ordinary.browser.request('/api/admin/email-settings')).status).toBe(403)
  expect((await fetch(`${baseUrl}/api/admin/email-settings`)).status).toBe(401)

  const initialResponse = await admin.browser.request('/api/admin/email-settings')
  expect(initialResponse.headers.get('cache-control')).toContain('no-store')
  const initial = await initialResponse.json()
  expect(initial.settings).toMatchObject({ enabled: false, passwordConfigured: false, revision: 1, lastTestStatus: null })

  const incomplete = await mutate(admin.browser, 'PUT', '/api/admin/email-settings', {
    expectedRevision: initial.settings.revision,
    host: null,
    port: null,
    security: 'starttls',
    authEnabled: true,
    username: null,
    passwordAction: 'retain',
    fromName: null,
    fromEmail: null,
    replyTo: null,
  })
  expect(incomplete.status).toBe(200)
  const draft = await incomplete.json()
  expect(draft.settings).toMatchObject({ enabled: false, authEnabled: true, passwordConfigured: false, revision: 2 })

  const failedTest = await admin.browser.post('/api/admin/email-settings/test', { expectedRevision: 2, recipient: diagnosticEmail })
  expect(failedTest.status).toBe(200)
  expect(await failedTest.json()).toMatchObject({ revision: 2, status: 'failed', errorCode: 'ADMIN_EMAIL_SETTINGS_INVALID' })
  expect((await mutate(admin.browser, 'POST', '/api/admin/email-settings/enable', { expectedRevision: 2 })).status).toBe(400)

  const stale = await mutate(admin.browser, 'PUT', '/api/admin/email-settings', {
    expectedRevision: 1,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    authEnabled: true,
    username: 'smtp-account',
    passwordAction: 'replace',
    password: 'synthetic-smtp-secret',
    fromName: 'Trade basic',
    fromEmail: 'noreply@example.test',
    replyTo: null,
  })
  expect(stale.status).toBe(409)

  const saved = await mutate(admin.browser, 'PUT', '/api/admin/email-settings', {
    expectedRevision: 2,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    authEnabled: true,
    username: 'smtp-account',
    passwordAction: 'replace',
    password: 'synthetic-smtp-secret',
    fromName: 'Trade basic',
    fromEmail: 'noreply@example.test',
    replyTo: 'support@example.test',
  })
  expect(saved.status).toBe(200)
  const config = await saved.json()
  expect(config.settings).toMatchObject({ enabled: false, authEnabled: true, passwordConfigured: true, revision: 3, testedRevision: null })
  expect(JSON.stringify(config)).not.toContain('synthetic-smtp-secret')
  expect(config.settings).not.toHaveProperty('password')

  const passedTest = await admin.browser.post('/api/admin/email-settings/test', { expectedRevision: 3, recipient: diagnosticEmail })
  expect(passedTest.status).toBe(200)
  expect(await passedTest.json()).toMatchObject({ revision: 3, status: 'passed', errorCode: null })
  expect(sentMessages).toHaveLength(1)
  expect(sentMessages[0]!.to).toBe(diagnosticEmail)
  expect(sentMessages[0]!.subject).toContain('郵件設定測試')
  for (let attempt = 0; attempt < 3; attempt++) {
    expect((await admin.browser.post('/api/admin/email-settings/test', { expectedRevision: 3, recipient: diagnosticEmail })).status).toBe(200)
  }
  const throttledTest = await admin.browser.post('/api/admin/email-settings/test', { expectedRevision: 3, recipient: diagnosticEmail })
  expect(throttledTest.status).toBe(429)
  expect((await throttledTest.json()).data.code).toBe('AUTH_RATE_LIMITED')
  expect(sentMessages).toHaveLength(4)

  const enabled = await mutate(admin.browser, 'POST', '/api/admin/email-settings/enable', { expectedRevision: 3 })
  expect(enabled.status).toBe(200)
  expect((await enabled.json()).settings.enabled).toBe(true)

  const createdAt = new Date('2026-09-26T00:00:00.000Z')
  await database.db.insert(mailOutbox).values([
    { kind: 'password_reset', recipientEmail: 'queued@example.test', locale: 'en', encryptedPayload: 'synthetic-encrypted-payload', status: 'queued', expiresAt: new Date('2026-09-27T00:00:00.000Z'), createdAt },
    { kind: 'registration_verification', recipientEmail: 'running@example.test', locale: 'en', encryptedPayload: 'synthetic-running-payload', status: 'running', leaseToken: 'synthetic-lease', workerId: 'synthetic-worker', leaseExpiresAt: new Date('2026-09-26T00:05:00.000Z'), heartbeatAt: createdAt, startedAt: createdAt, expiresAt: new Date('2026-09-27T00:00:00.000Z'), createdAt },
  ])

  const adminTestsBeforeUpdate = await database.pool.query("select id::text, status from mail_outbox where kind='admin_test' order by id")
  expect(adminTestsBeforeUpdate.rows.length).toBeGreaterThanOrEqual(5)
  const revised = await mutate(admin.browser, 'PUT', '/api/admin/email-settings', {
    expectedRevision: 3,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    authEnabled: true,
    username: 'smtp-account',
    passwordAction: 'retain',
    fromName: 'Trade basic',
    fromEmail: 'noreply@example.test',
    replyTo: 'support@example.test',
  })
  expect(revised.status).toBe(200)
  expect((await revised.json()).settings).toMatchObject({ enabled: false, revision: 4, testedRevision: null, lastTestStatus: null })

  const allCancelled = await database.pool.query("select status, encrypted_payload, lease_token, worker_id, lease_expires_at, heartbeat_at, finished_at, sent_at from mail_outbox where kind in ('password_reset','registration_verification') and recipient_email in ('queued@example.test','running@example.test')")
  expect(allCancelled.rows).toHaveLength(2)
  for (const row of allCancelled.rows) expect(row).toMatchObject({ status: 'cancelled', encrypted_payload: null, lease_token: null, worker_id: null, lease_expires_at: null, heartbeat_at: null, sent_at: null })
  expect(allCancelled.rows.every(row => row.finished_at instanceof Date)).toBe(true)
  const adminTestsAfterUpdate = await database.pool.query("select id::text, status from mail_outbox where kind='admin_test' order by id")
  expect(adminTestsAfterUpdate.rows).toEqual(adminTestsBeforeUpdate.rows)

  const disabled = await mutate(admin.browser, 'POST', '/api/admin/email-settings/disable', { expectedRevision: 4 })
  expect(disabled.status).toBe(200)
  const disabledBody = await disabled.json()
  expect(disabledBody.settings.enabled).toBe(false)

  const clear = await mutate(admin.browser, 'POST', '/api/admin/email-settings/clear', { expectedRevision: 4 })
  expect(clear.status).toBe(200)
  expect((await clear.json()).settings).toMatchObject({ enabled: false, host: null, passwordConfigured: false, revision: 5 })

  const historyResponse = await admin.browser.request('/api/admin/email-settings')
  const history = await historyResponse.json()
  expect(history.deliveries.length).toBeGreaterThanOrEqual(3)
  expect(JSON.stringify(history.deliveries)).not.toContain(diagnosticEmail)
  expect(history.deliveries.some((row: { recipientMasked: string }) => row.recipientMasked === 'd***@e***.test')).toBe(true)

  const audits = await database.db.select().from(mailAdminAuditEvents)
  expect(audits.length).toBeGreaterThanOrEqual(6)
  const auditJson = JSON.stringify(audits, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)
  expect(auditJson).not.toContain(diagnosticEmail)
  expect(auditJson).not.toContain('synthetic-smtp-secret')
})

it('rechecks the admin role from PostgreSQL for every settings request', async () => {
  const admin = await account('ADMIN')
  expect((await admin.browser.request('/api/admin/email-settings')).status).toBe(200)
  await database.pool.query("update users set role='USER' where id=$1", [admin.user.id])
  expect((await admin.browser.request('/api/admin/email-settings')).status).toBe(403)
})

it('turns SMTP off when a new test of the active revision fails', async () => {
  const admin = await account('ADMIN')
  const diagnosticEmail = `active-test-${randomUUID()}@example.test`
  const current = await admin.browser.request('/api/admin/email-settings').then(response => response.json())
  const saved = await mutate(admin.browser, 'PUT', '/api/admin/email-settings', {
    expectedRevision: current.settings.revision,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    authEnabled: false,
    username: null,
    passwordAction: 'clear',
    fromName: 'Trade basic',
    fromEmail: 'noreply@example.test',
    replyTo: null,
  }).then(response => response.json())
  const revision = saved.settings.revision as number
  expect((await admin.browser.post('/api/admin/email-settings/test', { expectedRevision: revision, recipient: diagnosticEmail })).status).toBe(200)
  expect((await mutate(admin.browser, 'POST', '/api/admin/email-settings/enable', { expectedRevision: revision })).status).toBe(200)

  failSmtpSends = true
  const failed = await admin.browser.post('/api/admin/email-settings/test', { expectedRevision: revision, recipient: diagnosticEmail })
  expect(failed.status).toBe(200)
  expect(await failed.json()).toMatchObject({ revision, status: 'failed', errorCode: 'SMTP_TRANSIENT' })
  const afterFailure = await admin.browser.request('/api/admin/email-settings').then(response => response.json())
  expect(afterFailure.settings).toMatchObject({ enabled: false, revision, lastTestStatus: 'failed', testedRevision: revision })
})

it('refuses to enable account mail without an active outbox encryption key', async () => {
  const admin = await account('ADMIN')
  const current = await admin.browser.request('/api/admin/email-settings').then(response => response.json())
  const revision = (current.settings.revision as number) + 1
  await database.db.update(mailSettings).set({
    enabled: false,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    auth: 'none',
    username: null,
    encryptedPassword: null,
    senderName: 'Trade basic',
    senderEmail: 'noreply@example.test',
    revision,
    lastTestedRevision: revision,
    lastTestedAt: new Date('2026-09-26T12:00:00.000Z'),
    lastTestStatus: 'passed',
  }).where(eq(mailSettings.singleton, 'default'))

  await expect(setSmtpEnabled(database.db, { expectedRevision: revision }, BigInt(admin.user.id), true,
    new Date('2026-09-26T12:00:00.000Z'), { pool: database.pool, keyring: { activeVersion: '', keys: {} } }))
    .rejects.toMatchObject({ code: 'ADMIN_EMAIL_ENCRYPTION_UNAVAILABLE' })
  const [after] = await database.db.select({ enabled: mailSettings.enabled }).from(mailSettings)
    .where(eq(mailSettings.singleton, 'default')).limit(1)
  expect(after?.enabled).toBe(false)
})

it('waits for an in-flight SMTP send before disable returns', async () => {
  const admin = await account('ADMIN')
  const current = await admin.browser.request('/api/admin/email-settings').then(response => response.json())
  const saved = await mutate(admin.browser, 'PUT', '/api/admin/email-settings', {
    expectedRevision: current.settings.revision,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    authEnabled: false,
    username: null,
    passwordAction: 'clear',
    fromName: 'Trade basic',
    fromEmail: 'noreply@example.test',
    replyTo: null,
  }).then(response => response.json())
  const revision = saved.settings.revision as number
  expect((await admin.browser.post('/api/admin/email-settings/test', { expectedRevision: revision, recipient: 'diagnostic@example.test' })).status).toBe(200)
  expect((await mutate(admin.browser, 'POST', '/api/admin/email-settings/enable', { expectedRevision: revision })).status).toBe(200)

  const now = new Date('2026-09-26T12:00:00.000Z')
  const [job] = await database.db.insert(mailOutbox).values({
    kind: 'password_changed',
    recipientEmail: 'account@example.test',
    locale: 'en',
    encryptedPayload: sealMailPayload({
      to: 'account@example.test', subject: 'In-flight account email', text: 'Your password changed.', html: '<p>Your password changed.</p>',
    }, smtpKeyring),
    status: 'queued',
    maxAttempts: 5,
    expiresAt: new Date(now.getTime() + 60_000),
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: mailOutbox.id })
  let sendStarted!: () => void
  const started = new Promise<void>(resolve => { sendStarted = resolve })
  holdSmtpSubject = 'In-flight account email'
  signalSmtpSendStarted = sendStarted

  const workerResult = runAccountEmailWorkerOnce({
    db: database.db,
    pool: database.pool,
    workerId: 'in-flight-mail-worker',
    now: () => now,
    keyring: smtpKeyring,
    lookup: async () => ['8.8.8.8'],
    transportFactory,
  })
  await started
  let disableResolved = false
  const disableResponse = mutate(admin.browser, 'POST', '/api/admin/email-settings/disable', { expectedRevision: revision })
    .then(response => { disableResolved = true; return response })
  await new Promise(resolve => setTimeout(resolve, 40))
  expect(disableResolved).toBe(false)
  releaseSmtpSend?.()
  expect(await workerResult).toEqual({ status: 'sent' })
  expect((await disableResponse).status).toBe(200)

  const [delivered] = await database.db.select({ status: mailOutbox.status, encryptedPayload: mailOutbox.encryptedPayload })
    .from(mailOutbox).where(eq(mailOutbox.id, job!.id)).limit(1)
  expect(delivered).toEqual({ status: 'sent', encryptedPayload: null })
})
