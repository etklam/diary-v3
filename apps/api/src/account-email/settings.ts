import { createHash } from 'node:crypto'
import { accountEmailRateLimits } from '@diary/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  mailAdminAuditEvents,
  mailOutbox,
  mailSettings,
  users,
  type Database,
  type DatabaseTx,
} from '@diary/db'
import {
  adminEmailSettingsResponseSchema,
  adminEmailTestResponseSchema,
  type AdminEmailSettingsResponse,
} from '@diary/contracts/account-email'
import type { z } from 'zod'
import { adminEmailSettingsUpdateSchema, adminEmailTestRequestSchema } from '@diary/contracts/account-email'
import { decryptSmtpSecret, encryptSmtpSecret, environmentSmtpKeyring, SmtpSecretError, type SmtpKeyring } from './secrets.js'
import { normalizeSmtpHostname } from './smtp-host.js'
import { classifySmtpError, SmtpTransportError, type SmtpTransportFactory } from './smtp.js'
import { sendConfiguredMail, type SmtpRuntimeOptions } from './runtime.js'
import { renderAccountEmail, type EmailLocale } from './templates.js'
import { withMailDispatchFence } from './dispatch-fence.js'
import { userSessionLock } from '../auth-session.js'

type SettingsUpdate = z.infer<typeof adminEmailSettingsUpdateSchema>
type TestRequest = z.infer<typeof adminEmailTestRequestSchema>
type SettingsRow = typeof mailSettings.$inferSelect

export interface SmtpAdminOptions {
  pool?: Pick<import('pg').Pool, 'connect'>
  keyring?: SmtpKeyring
  lookup?: (hostname: string) => Promise<string[]>
  allowedPrivateHosts?: string
  transportFactory?: SmtpTransportFactory
}

export class SmtpAdminError extends Error {
  readonly code: 'ADMIN_EMAIL_CONFIG_CONFLICT' | 'ADMIN_EMAIL_TEST_REQUIRED' | 'ADMIN_EMAIL_ENCRYPTION_UNAVAILABLE' | 'ADMIN_EMAIL_SETTINGS_INVALID' | 'AUTH_RATE_LIMITED' | 'AUTH_FORBIDDEN'

  constructor(code: SmtpAdminError['code']) {
    super(code)
    this.name = 'SmtpAdminError'
    this.code = code
  }
}

const keyring = (options: SmtpAdminOptions) => options.keyring ?? environmentSmtpKeyring()

function runtimeOptions(options: SmtpAdminOptions): SmtpRuntimeOptions & { transportFactory?: SmtpTransportFactory } {
  return {
    keyring: keyring(options),
    ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.allowedPrivateHosts !== undefined ? { allowedPrivateHosts: options.allowedPrivateHosts } : {}),
    ...(options.transportFactory ? { transportFactory: options.transportFactory } : {}),
  }
}

async function lockSettings(tx: DatabaseTx, now: Date): Promise<SettingsRow> {
  await tx.insert(mailSettings).values({ singleton: 'default', updatedAt: now }).onConflictDoNothing()
  const [row] = await tx.select().from(mailSettings).where(eq(mailSettings.singleton, 'default')).limit(1).for('update')
  if (!row) throw new Error('SMTP_SETTINGS_NOT_INITIALIZED')
  return row
}

async function assertAdminInTransaction(tx: DatabaseTx, actorUserId: bigint) {
  await tx.execute(userSessionLock(actorUserId))
  const [actor] = await tx.select({ role: users.role }).from(users)
    .where(eq(users.id, actorUserId)).limit(1).for('update')
  if (actor?.role !== 'ADMIN') throw new SmtpAdminError('AUTH_FORBIDDEN')
}

async function ensureSettings(db: Database, now: Date): Promise<SettingsRow> {
  await db.insert(mailSettings).values({ singleton: 'default', updatedAt: now }).onConflictDoNothing()
  const [row] = await db.select().from(mailSettings).where(eq(mailSettings.singleton, 'default')).limit(1)
  if (!row) throw new Error('SMTP_SETTINGS_NOT_INITIALIZED')
  return row
}

function maskRecipient(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const domainName = dot > 0 ? domain.slice(0, dot) : domain
  const suffix = dot > 0 ? domain.slice(dot) : ''
  return `${local.slice(0, 1)}***@${domainName.slice(0, 1)}***${suffix}`
}

function serializeSettings(row: SettingsRow) {
  return {
    enabled: row.enabled,
    host: row.host,
    port: row.port,
    security: row.security ?? 'none',
    authEnabled: row.auth === 'password',
    username: row.username,
    passwordConfigured: Boolean(row.encryptedPassword),
    fromName: row.senderName,
    fromEmail: row.senderEmail,
    replyTo: row.replyToEmail,
    revision: row.revision,
    testedRevision: row.lastTestedRevision,
    lastTestAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus,
  }
}

export async function readAdminEmailSettings(db: Database, now = new Date()): Promise<AdminEmailSettingsResponse> {
  const settings = await ensureSettings(db, now)
  const deliveries = await db.select({
    id: mailOutbox.id,
    kind: mailOutbox.kind,
    recipientEmail: mailOutbox.recipientEmail,
    status: mailOutbox.status,
    attempts: mailOutbox.attempts,
    lastErrorCode: mailOutbox.lastErrorCode,
    createdAt: mailOutbox.createdAt,
  }).from(mailOutbox).orderBy(desc(mailOutbox.createdAt), desc(mailOutbox.id)).limit(20)

  return adminEmailSettingsResponseSchema.parse({
    settings: serializeSettings(settings),
    deliveries: deliveries.map(row => ({
      id: row.id.toString(),
      kind: row.kind,
      recipientMasked: maskRecipient(row.recipientEmail),
      status: row.status,
      attemptCount: row.attempts,
      lastErrorCode: row.lastErrorCode,
      createdAt: row.createdAt.toISOString(),
    })),
  })
}

async function writeAudit(tx: DatabaseTx, input: {
  actorUserId: bigint
  action: string
  result: 'success' | 'failure'
  configRevision: number | null
  errorCode?: string | null
  now: Date
}) {
  await tx.insert(mailAdminAuditEvents).values({
    actorUserId: input.actorUserId,
    action: input.action,
    result: input.result,
    configRevision: input.configRevision,
    errorCode: input.errorCode ?? null,
    createdAt: input.now,
  })
}

async function cancelPendingAccountMail(tx: DatabaseTx, now: Date) {
  await tx.update(mailOutbox).set({
    status: 'cancelled',
    encryptedPayload: null,
    leaseToken: null,
    workerId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    finishedAt: now,
    sentAt: null,
    updatedAt: now,
  }).where(and(
    inArray(mailOutbox.status, ['queued', 'running']),
    inArray(mailOutbox.kind, ['registration_verification', 'password_reset', 'password_changed']),
  ))
}

export async function updateSmtpSettings(db: Database, input: SettingsUpdate, actorUserId: bigint, now: Date, options: SmtpAdminOptions = {}) {
  const normalizedHost = input.host === null || input.host.length === 0 ? null : normalizeSmtpHostname(input.host)
  const normalizedUsername = input.username?.trim() || null
  const normalizedFromName = input.fromName?.trim() || null
  const priorPasswordAction = input.passwordAction
  const secretKeyring = keyring(options)

  return withMailDispatchFence(options.pool, 'exclusive', () => db.transaction(async tx => {
    await assertAdminInTransaction(tx, actorUserId)
    const current = await lockSettings(tx, now)
    if (current.revision !== input.expectedRevision) throw new SmtpAdminError('ADMIN_EMAIL_CONFIG_CONFLICT')

    let auth: 'none' | 'password' = input.authEnabled ? 'password' : 'none'
    let username: string | null = input.authEnabled ? normalizedUsername : null
    let encryptedPassword: string | null = input.authEnabled ? current.encryptedPassword : null

    if (input.authEnabled) {
      if (priorPasswordAction === 'replace') encryptedPassword = encryptSmtpSecret(input.password!, 'smtp-password', secretKeyring)
      if (priorPasswordAction === 'clear') encryptedPassword = null
    } else {
      auth = 'none'
      username = null
      encryptedPassword = null
    }

    const nextRevision = current.revision + 1
    await cancelPendingAccountMail(tx, now)
    const [updated] = await tx.update(mailSettings).set({
      enabled: false,
      host: normalizedHost,
      port: input.port,
      security: input.security,
      auth,
      username,
      encryptedPassword,
      senderName: normalizedFromName,
      senderEmail: input.fromEmail,
      replyToEmail: input.replyTo,
      revision: nextRevision,
      lastTestedRevision: null,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestErrorCode: null,
      updatedBy: actorUserId,
      updatedAt: now,
    }).where(eq(mailSettings.singleton, 'default')).returning()

    await writeAudit(tx, { actorUserId, action: 'settings_updated', result: 'success', configRevision: nextRevision, now })
    return serializeSettings(updated!)
  }))
}

function safeSmtpErrorCode(error: unknown): string {
  if (error instanceof SmtpAdminError) return error.code
  if (error instanceof SmtpSecretError) return error.code
  if (error instanceof SmtpTransportError) return error.code
  if (error instanceof Error && error.message === 'ADMIN_EMAIL_SETTINGS_INVALID') return 'ADMIN_EMAIL_SETTINGS_INVALID'
  return classifySmtpError(error).code
}

async function saveTestRecord(tx: DatabaseTx, input: {
  actorUserId: bigint
  revision: number
  recipient: string
  locale: EmailLocale
  status: 'sent' | 'failed'
  errorCode: string | null
  now: Date
}) {
  await tx.insert(mailOutbox).values({
    kind: 'admin_test',
    recipientEmail: input.recipient,
    locale: input.locale,
    encryptedPayload: null,
    status: input.status,
    attempts: 1,
    maxAttempts: 5,
    lastAttemptAt: input.now,
    configRevisionUsed: input.revision,
    expiresAt: new Date(input.now.getTime() + 30 * 24 * 60 * 60 * 1000),
    sentAt: input.status === 'sent' ? input.now : null,
    finishedAt: input.now,
    lastErrorCode: input.errorCode,
    lastErrorDetail: null,
    createdAt: input.now,
    updatedAt: input.now,
  })
  await writeAudit(tx, {
    actorUserId: input.actorUserId,
    action: 'smtp_test',
    result: input.status === 'sent' ? 'success' : 'failure',
    configRevision: input.revision,
    errorCode: input.errorCode,
    now: input.now,
  })
}

async function admitSmtpTest(db: Database, actorUserId: bigint, recipient: string, now: Date): Promise<boolean> {
  const keys = [`smtp-test:admin:${actorUserId.toString()}`, `smtp-test:recipient:${recipient.trim().toLowerCase()}`]
    .map(value => createHash('sha256').update(`smtp-test-rate:v1:${value}`).digest('hex'))
    .sort()
  return db.transaction(async tx => {
    let admitted = true
    for (const digest of keys) {
      await tx.insert(accountEmailRateLimits).values({
        digest,
        requestCount: 0,
        windowStartedAt: now,
        lastRequestedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing()
      const [bucket] = await tx.select().from(accountEmailRateLimits)
        .where(eq(accountEmailRateLimits.digest, digest)).for('update').limit(1)
      if (!bucket) throw new Error('SMTP_TEST_RATE_LIMIT_ROW_MISSING')
      const inWindow = bucket.windowStartedAt.getTime() > now.getTime() - 60 * 60 * 1000
      if (bucket.requestCount >= 5 && inWindow) {
        admitted = false
        continue
      }
      await tx.update(accountEmailRateLimits).set({
        requestCount: inWindow ? bucket.requestCount + 1 : 1,
        windowStartedAt: inWindow ? bucket.windowStartedAt : now,
        lastRequestedAt: now,
        blockedUntil: null,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        updatedAt: now,
      }).where(eq(accountEmailRateLimits.digest, digest))
    }
    return admitted
  })
}

export async function testSmtpSettings(
  db: Database,
  input: TestRequest,
  actor: { userId: bigint; locale: EmailLocale },
  now: Date,
  options: SmtpAdminOptions = {},
) {
  if (!await admitSmtpTest(db, actor.userId, input.recipient, now)) throw new SmtpAdminError('AUTH_RATE_LIMITED')
  const [snapshot] = await db.select().from(mailSettings)
    .where(eq(mailSettings.singleton, 'default')).limit(1)
  if (!snapshot || snapshot.revision !== input.expectedRevision) throw new SmtpAdminError('ADMIN_EMAIL_CONFIG_CONFLICT')

  let errorCode: string | null = null
  try {
    const message = renderAccountEmail('admin_test', actor.locale)
    await sendConfiguredMail(snapshot, { to: input.recipient, ...message }, runtimeOptions(options))
  } catch (error) {
    errorCode = safeSmtpErrorCode(error)
  }

  const testedAt = now
  const result = await withMailDispatchFence(options.pool, 'exclusive', () => db.transaction(async tx => {
    await assertAdminInTransaction(tx, actor.userId)
    const current = await lockSettings(tx, testedAt)
    if (current.revision !== input.expectedRevision) {
      await saveTestRecord(tx, {
        actorUserId: actor.userId,
        revision: input.expectedRevision,
        recipient: input.recipient,
        locale: actor.locale,
        status: 'failed',
        errorCode: 'ADMIN_EMAIL_CONFIG_CONFLICT',
        now: testedAt,
      })
      return { conflict: true as const }
    }

    const status = errorCode === null ? 'passed' : 'failed'
    if (status === 'failed' && current.enabled) {
      await cancelPendingAccountMail(tx, testedAt)
    }
    await tx.update(mailSettings).set({
      ...(status === 'failed' ? { enabled: false } : {}),
      lastTestedRevision: current.revision,
      lastTestedAt: testedAt,
      lastTestStatus: status,
      lastTestErrorCode: errorCode,
      updatedAt: testedAt,
    }).where(eq(mailSettings.singleton, 'default'))

    await saveTestRecord(tx, {
      actorUserId: actor.userId,
      revision: current.revision,
      recipient: input.recipient,
      locale: actor.locale,
      status: status === 'passed' ? 'sent' : 'failed',
      errorCode,
      now: testedAt,
    })
    return { conflict: false as const, response: {
      revision: current.revision,
      status,
      testedAt: testedAt.toISOString(),
      errorCode,
    } }
  }))

  if (result.conflict) throw new SmtpAdminError('ADMIN_EMAIL_CONFIG_CONFLICT')
  return adminEmailTestResponseSchema.parse(result.response)
}

function settingsAreComplete(row: SettingsRow): boolean {
  if (!row.host || !row.port || (row.security !== 'tls' && row.security !== 'starttls') || !row.senderName || !row.senderEmail) return false
  try { normalizeSmtpHostname(row.host) } catch { return false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(row.senderEmail)) return false
  if (row.replyToEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(row.replyToEmail)) return false
  if (row.auth === 'password' && (!row.username || !row.encryptedPassword)) return false
  return true
}

export async function setSmtpEnabled(db: Database, input: { expectedRevision: number }, actorUserId: bigint, enabled: boolean, now: Date, options: SmtpAdminOptions = {}) {
  return withMailDispatchFence(options.pool, 'exclusive', () => db.transaction(async tx => {
    await assertAdminInTransaction(tx, actorUserId)
    const current = await lockSettings(tx, now)
    if (current.revision !== input.expectedRevision) throw new SmtpAdminError('ADMIN_EMAIL_CONFIG_CONFLICT')

    if (enabled) {
      if (!settingsAreComplete(current)) throw new SmtpAdminError('ADMIN_EMAIL_SETTINGS_INVALID')
      if (current.lastTestStatus !== 'passed' || current.lastTestedRevision !== current.revision || !current.lastTestedAt) {
        throw new SmtpAdminError('ADMIN_EMAIL_TEST_REQUIRED')
      }
      try { encryptSmtpSecret('account-email-key-check', 'outbox-payload', keyring(options)) }
      catch { throw new SmtpAdminError('ADMIN_EMAIL_ENCRYPTION_UNAVAILABLE') }
      if (current.auth === 'password') {
        try { decryptSmtpSecret(current.encryptedPassword!, 'smtp-password', keyring(options)) }
        catch { throw new SmtpAdminError('ADMIN_EMAIL_SETTINGS_INVALID') }
      }
      const [updated] = await tx.update(mailSettings).set({ enabled: true, updatedBy: actorUserId, updatedAt: now })
        .where(eq(mailSettings.singleton, 'default')).returning()
      await writeAudit(tx, { actorUserId, action: 'smtp_enabled', result: 'success', configRevision: current.revision, now })
      return serializeSettings(updated!)
    }

    await cancelPendingAccountMail(tx, now)

    const [updated] = await tx.update(mailSettings).set({ enabled: false, updatedBy: actorUserId, updatedAt: now })
      .where(eq(mailSettings.singleton, 'default')).returning()
    await writeAudit(tx, { actorUserId, action: 'smtp_disabled', result: 'success', configRevision: current.revision, now })
    return serializeSettings(updated!)
  }))
}

export async function clearSmtpSettings(db: Database, input: { expectedRevision: number }, actorUserId: bigint, now: Date, options: SmtpAdminOptions = {}) {
  return withMailDispatchFence(options.pool, 'exclusive', () => db.transaction(async tx => {
    await assertAdminInTransaction(tx, actorUserId)
    const current = await lockSettings(tx, now)
    if (current.revision !== input.expectedRevision) throw new SmtpAdminError('ADMIN_EMAIL_CONFIG_CONFLICT')
    if (current.enabled) throw new SmtpAdminError('ADMIN_EMAIL_SETTINGS_INVALID')

    const nextRevision = current.revision + 1
    await cancelPendingAccountMail(tx, now)
    const [updated] = await tx.update(mailSettings).set({
      enabled: false,
      host: null,
      port: null,
      security: null,
      auth: 'none',
      username: null,
      encryptedPassword: null,
      senderName: null,
      senderEmail: null,
      replyToEmail: null,
      revision: nextRevision,
      lastTestedRevision: null,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestErrorCode: null,
      updatedBy: actorUserId,
      updatedAt: now,
    }).where(eq(mailSettings.singleton, 'default')).returning()
    await writeAudit(tx, { actorUserId, action: 'settings_cleared', result: 'success', configRevision: nextRevision, now })
    return serializeSettings(updated!)
  }))
}
