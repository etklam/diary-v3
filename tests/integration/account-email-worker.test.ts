import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { accountEmailTokens, mailOutbox, mailSettings, users } from '@diary/db'
import { eq } from 'drizzle-orm'
import { sealMailPayload } from '../../apps/api/src/account-email/runtime'
import { SmtpTransportError, type SmtpTransportFactory } from '../../apps/api/src/account-email/smtp'
import { runAccountEmailWorkerOnce } from '../../apps/api/src/account-email/worker'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let clock: Date
const keyring = { activeVersion: 'test', keys: { test: Buffer.alloc(32, 41).toString('base64') } }

beforeAll(async () => { database = await provisionTestDatabase('account_email_worker') })
afterAll(async () => { await database?.dispose() })

async function readySettings() {
  await database.db.update(mailSettings).set({
    enabled: true,
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    senderName: 'Trade basic',
    senderEmail: 'noreply@example.test',
    revision: 5,
    lastTestedRevision: 5,
    lastTestedAt: clock,
    lastTestStatus: 'passed',
  }).where(eq(mailSettings.singleton, 'default'))
}

async function addQueuedMessage(options: { expiresAt?: Date; status?: 'queued' | 'running'; attempts?: number; tokenId?: bigint | null } = {}) {
  const createdAt = new Date(clock.getTime() - 1_000)
  const recipientEmail = `${randomUUID()}@example.test`
  const [job] = await database.db.insert(mailOutbox).values({
    kind: 'registration_verification',
    recipientEmail,
    locale: 'en',
    encryptedPayload: sealMailPayload({
      to: recipientEmail,
      subject: 'Verify your account', text: 'Finish registration', html: '<p>Finish registration</p>',
    }, keyring),
    tokenId: options.tokenId ?? null,
    status: options.status ?? 'queued',
    attempts: options.attempts ?? 0,
    maxAttempts: 5,
    nextAttemptAt: createdAt,
    ...(options.status === 'running' ? {
      leaseToken: 'expired-lease', workerId: 'previous-worker', leaseExpiresAt: new Date(clock.getTime() - 100),
      heartbeatAt: createdAt, startedAt: createdAt,
    } : {}),
    expiresAt: options.expiresAt ?? new Date(clock.getTime() + 24 * 60 * 60 * 1000),
    queuedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  }).returning({ id: mailOutbox.id })
  if (!job) throw new Error('Expected test mail row')
  return job.id
}

function factory(handler: (options: Record<string, unknown>) => Promise<unknown>, messages: Array<Record<string, unknown>> = []): SmtpTransportFactory {
  return () => ({
    async sendMail(options) {
      messages.push(options as unknown as Record<string, unknown>)
      const result = await handler(options as unknown as Record<string, unknown>)
      return result as { accepted?: readonly string[]; messageId?: string }
    },
  })
}

function worker(transportFactory: SmtpTransportFactory) {
  return runAccountEmailWorkerOnce({
    db: database.db,
    pool: database.pool,
    workerId: 'synthetic-mail-worker',
    now: () => clock,
    keyring,
    lookup: async () => ['8.8.8.8'],
    transportFactory,
  })
}

beforeAll(() => { clock = new Date('2026-09-26T12:00:00.000Z') })

it('recovers a stale lease and clears encrypted payload after SMTP accepts', async () => {
  await readySettings()
  const id = await addQueuedMessage({ status: 'running', attempts: 0 })
  const messages: Array<Record<string, unknown>> = []
  const result = await worker(factory(async options => ({ accepted: [String(options.to)], messageId: 'synthetic-message' }), messages))
  expect(result).toEqual({ status: 'sent' })
  expect(messages).toHaveLength(1)
  expect(messages[0]).toMatchObject({ subject: 'Verify your account', from: { address: 'noreply@example.test' }, messageId: `<account-email-${id}@diary-v3.invalid>` })
  const [job] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.id, id)).limit(1)
  expect(job).toMatchObject({ status: 'sent', attempts: 1, encryptedPayload: null, configRevisionUsed: 5 })
  expect(job!.sentAt).toEqual(clock)
  expect(job!.finishedAt).toEqual(clock)
  expect(job!.leaseToken).toBeNull()
})

it('retries temporary errors with bounded attempts and removes sensitive payload at permanent failure', async () => {
  await readySettings()
  const transientId = await addQueuedMessage()
  const messages: Array<Record<string, unknown>> = []
  const transient = await worker(factory(async () => { throw new SmtpTransportError('SMTP_TIMEOUT') }, messages))
  expect(transient).toEqual({ status: 'retry' })
  const [retry] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.id, transientId)).limit(1)
  expect(retry).toMatchObject({ status: 'queued', attempts: 1, lastErrorCode: 'SMTP_TIMEOUT' })
  expect(retry!.encryptedPayload).toBeTruthy()
  clock = retry!.nextAttemptAt
  const next = await worker(factory(async () => { throw new SmtpTransportError('SMTP_PERMANENT') }, messages))
  expect(next).toEqual({ status: 'failed' })
  expect(messages.map(message => message.messageId)).toEqual([
    `<account-email-${transientId}@diary-v3.invalid>`,
    `<account-email-${transientId}@diary-v3.invalid>`,
  ])
  const [failed] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.id, transientId)).limit(1)
  expect(failed).toMatchObject({ status: 'failed', attempts: 2, lastErrorCode: 'SMTP_PERMANENT', encryptedPayload: null })
  expect(failed!.finishedAt).toEqual(clock)
})

it('cancels messages whose one-time token is no longer active', async () => {
  await readySettings()
  const email = `${randomUUID()}@example.test`
  const [user] = await database.db.insert(users).values({ email, password: 'synthetic-hash' }).returning({ id: users.id })
  const [token] = await database.db.insert(accountEmailTokens).values({
    purpose: 'password_reset', normalizedEmail: email, userId: user!.id,
    tokenDigest: randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
    expiresAt: new Date(clock.getTime() + 30_000), consumedAt: clock,
  }).returning({ id: accountEmailTokens.id })
  const id = await addQueuedMessage({ tokenId: token!.id })
  const messages: Array<Record<string, unknown>> = []
  expect(await worker(factory(async options => ({ accepted: [String(options.to)] }), messages))).toEqual({ status: 'cancelled' })
  expect(messages).toHaveLength(0)
  const [job] = await database.db.select().from(mailOutbox).where(eq(mailOutbox.id, id)).limit(1)
  expect(job).toMatchObject({ status: 'cancelled', encryptedPayload: null, lastErrorCode: 'MAIL_TOKEN_STALE' })
})
