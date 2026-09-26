import { createHash, randomBytes } from 'node:crypto'
import type { ErrorCode } from '@diary/contracts'
import { accountEmailRateLimits, accountEmailTokens, mailOutbox, mailSettings, refreshTokens, users, type Database, type DatabaseTx } from '@diary/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { userSessionLock } from '../auth-session.js'
import { renderAccountEmail, type EmailLocale } from './templates.js'
import { environmentSmtpKeyring, type SmtpKeyring } from './secrets.js'
import { sealMailPayload } from './runtime.js'

const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 30 * 60 * 1000
const REQUEST_WINDOW_MS = 60 * 60 * 1000
const REQUEST_COOLDOWN_MS = 60 * 1000
const RATE_ROW_RETENTION_MS = 24 * 60 * 60 * 1000

export type AccountEmailPurpose = 'registration' | 'password_reset'

export interface AccountEmailLifecycleOptions {
  db: Database
  now?: () => Date
  webOrigin: string
  keyring?: SmtpKeyring
}

export type EmailFail = (status: number, code: ErrorCode, message: string) => never

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase()
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function createRawToken(): string {
  return randomBytes(32).toString('base64url')
}

function trustedActionUrl(webOrigin: string, path: string, token?: string): string {
  const origin = new URL(webOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || (origin.pathname !== '/' && origin.pathname !== '')) {
    throw new Error('ACCOUNT_EMAIL_ORIGIN_INVALID')
  }
  const url = new URL(path, origin.origin)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

function maskedLocale(locale: string): EmailLocale {
  return locale === 'en' || locale === 'zh-CN' ? locale : 'zh-TW'
}

function ipKey(value: string): string {
  return value.trim().slice(0, 128) || 'unknown'
}

async function consumeLimitBucket(
  tx: DatabaseTx,
  key: string,
  timestamp: Date,
  limit: number,
  cooldownMs = 0,
): Promise<boolean> {
  const keyDigest = digest(`account-email-rate:v1:${key}`)
  await tx.insert(accountEmailRateLimits).values({
    digest: keyDigest,
    requestCount: 0,
    windowStartedAt: timestamp,
    lastRequestedAt: timestamp,
    expiresAt: new Date(timestamp.getTime() + RATE_ROW_RETENTION_MS),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoNothing()
  const [row] = await tx.select().from(accountEmailRateLimits)
    .where(eq(accountEmailRateLimits.digest, keyDigest)).for('update').limit(1)
  if (!row) throw new Error('ACCOUNT_EMAIL_RATE_LIMIT_ROW_MISSING')

  const inWindow = row.windowStartedAt.getTime() > timestamp.getTime() - REQUEST_WINDOW_MS
  const count = inWindow ? row.requestCount : 0
  if (count >= limit || (cooldownMs > 0 && count > 0 && row.lastRequestedAt.getTime() > timestamp.getTime() - cooldownMs)) return false
  await tx.update(accountEmailRateLimits).set({
    requestCount: count + 1,
    windowStartedAt: inWindow ? row.windowStartedAt : timestamp,
    lastRequestedAt: timestamp,
    blockedUntil: null,
    expiresAt: new Date(timestamp.getTime() + RATE_ROW_RETENTION_MS),
    updatedAt: timestamp,
  }).where(eq(accountEmailRateLimits.digest, keyDigest))
  return true
}

async function enforceRequestLimits(
  db: Database,
  values: { action: string; email?: string; ip: string; timestamp: Date; completionTokenDigest?: string },
): Promise<boolean> {
  return db.transaction(async tx => {
    const limits: Array<() => Promise<boolean>> = [
      () => consumeLimitBucket(tx, `ip:${values.action}:${ipKey(values.ip)}`, values.timestamp, values.action.endsWith('complete') ? 30 : 20),
      () => consumeLimitBucket(tx, `global:${values.action}`, values.timestamp, values.action.endsWith('complete') ? 500 : 120),
    ]
    if (values.email) limits.push(() => consumeLimitBucket(tx, `email:${values.action}:${normalizedEmail(values.email!)}`, values.timestamp, 6, REQUEST_COOLDOWN_MS))
    if (values.completionTokenDigest) limits.push(() => consumeLimitBucket(tx, `token:${values.action}:${values.completionTokenDigest}`, values.timestamp, 10))
    const outcomes: boolean[] = []
    for (const limit of limits) outcomes.push(await limit())
    return outcomes.every(Boolean)
  })
}

function failRateLimited(fail: EmailFail): never {
  return fail(429, 'AUTH_RATE_LIMITED', 'Too many requests. Please try again later.')
}

function emailPayload(kind: 'registration_verification' | 'password_reset' | 'password_changed', recipient: string, locale: EmailLocale, link?: string) {
  return { to: recipient, ...renderAccountEmail(kind, locale, link) }
}

function cancelActiveOutbox(tx: DatabaseTx, tokenIds: bigint[], timestamp: Date) {
  if (tokenIds.length === 0) return Promise.resolve()
  return tx.update(mailOutbox).set({
    status: 'cancelled',
    encryptedPayload: null,
    finishedAt: timestamp,
    leaseToken: null,
    workerId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    lastErrorCode: 'MAIL_CANCELLED',
    lastErrorDetail: null,
    updatedAt: timestamp,
  }).where(and(inArray(mailOutbox.tokenId, tokenIds), inArray(mailOutbox.status, ['queued', 'running'])))
    .then(() => undefined)
}

async function rotateActiveTokens(
  tx: DatabaseTx,
  purpose: AccountEmailPurpose,
  email: string,
  userId: bigint | null,
  timestamp: Date,
) {
  const filters = [eq(accountEmailTokens.purpose, purpose), isNull(accountEmailTokens.consumedAt), isNull(accountEmailTokens.revokedAt)]
  if (userId !== null) filters.push(eq(accountEmailTokens.userId, userId))
  else filters.push(eq(accountEmailTokens.normalizedEmail, email))
  const active = await tx.select({ id: accountEmailTokens.id }).from(accountEmailTokens).where(and(...filters)).for('update')
  if (active.length === 0) return
  const ids = active.map(item => item.id)
  await tx.update(accountEmailTokens).set({ revokedAt: timestamp }).where(inArray(accountEmailTokens.id, ids))
  await cancelActiveOutbox(tx, ids, timestamp)
}

function newTokenRecord(purpose: AccountEmailPurpose, email: string, userId: bigint | null, expiresAt: Date) {
  const rawToken = createRawToken()
  return {
    rawToken,
    record: {
      purpose,
      normalizedEmail: email,
      userId,
      tokenDigest: digest(rawToken),
      expiresAt,
    },
  }
}

async function insertOutbox(
  tx: DatabaseTx,
  values: {
    kind: 'registration_verification' | 'password_reset' | 'password_changed'
    email: string
    locale: EmailLocale
    tokenId?: bigint | null
    expiresAt: Date
    link?: string
    now: Date
    keyring?: SmtpKeyring
  },
) {
  const payload = emailPayload(values.kind, values.email, values.locale, values.link)
  await tx.insert(mailOutbox).values({
    kind: values.kind,
    recipientEmail: values.email,
    locale: values.locale,
    encryptedPayload: sealMailPayload(payload, values.keyring ?? environmentSmtpKeyring()),
    tokenId: values.tokenId ?? null,
    status: 'queued',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: values.now,
    expiresAt: values.expiresAt,
    queuedAt: values.now,
    createdAt: values.now,
    updatedAt: values.now,
  })
}

export function createAccountEmailLifecycle({ db, now = () => new Date(), webOrigin, keyring = environmentSmtpKeyring() }: AccountEmailLifecycleOptions) {
  const requestRegistration = async (input: { email: string; locale: EmailLocale }, ip: string, fail: EmailFail) => {
    const timestamp = now()
    if (!await enforceRequestLimits(db, { action: 'registration-request', email: input.email, ip, timestamp })) failRateLimited(fail)
    const email = normalizedEmail(input.email)
    await db.transaction(async tx => {
      const [settings] = await tx.select({ enabled: mailSettings.enabled }).from(mailSettings)
        .where(eq(mailSettings.singleton, 'default')).for('update').limit(1)
      if (!settings?.enabled) fail(503, 'AUTH_EMAIL_SERVICE_DISABLED', 'Email registration is unavailable')

      const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1)
      if (existing) return

      await rotateActiveTokens(tx, 'registration', email, null, timestamp)
      const expiresAt = new Date(timestamp.getTime() + REGISTRATION_TTL_MS)
      const token = newTokenRecord('registration', email, null, expiresAt)
      const [created] = await tx.insert(accountEmailTokens).values(token.record).returning({ id: accountEmailTokens.id })
      if (!created) throw new Error('ACCOUNT_EMAIL_TOKEN_INSERT_FAILED')
      const link = trustedActionUrl(webOrigin, '/register/complete', token.rawToken)
      await insertOutbox(tx, {
        kind: 'registration_verification', email, locale: input.locale, tokenId: created.id,
        expiresAt, link, now: timestamp, keyring,
      })
    })
    return { success: true as const }
  }

  const completeRegistration = async (input: { token: string; name?: string; password: string }, ip: string, fail: EmailFail) => {
    const timestamp = now()
    const tokenDigest = digest(input.token)
    if (!await enforceRequestLimits(db, { action: 'registration-complete', ip, timestamp, completionTokenDigest: tokenDigest })) failRateLimited(fail)
    const [candidate] = await db.select({ id: accountEmailTokens.id }).from(accountEmailTokens).where(and(
      eq(accountEmailTokens.tokenDigest, tokenDigest), eq(accountEmailTokens.purpose, 'registration'),
      isNull(accountEmailTokens.consumedAt), isNull(accountEmailTokens.revokedAt),
    )).limit(1)
    if (!candidate) fail(401, 'AUTH_EMAIL_TOKEN_INVALID', 'This email link is invalid')
    const passwordHash = await bcrypt.hash(input.password, 10)
    const outcome = await db.transaction(async tx => {
      const [token] = await tx.select().from(accountEmailTokens).where(and(
        eq(accountEmailTokens.tokenDigest, tokenDigest), eq(accountEmailTokens.purpose, 'registration'),
      )).for('update').limit(1)
      if (!token || token.consumedAt || token.revokedAt) return 'invalid' as const
      if (token.expiresAt <= timestamp) {
        await tx.update(accountEmailTokens).set({ revokedAt: timestamp }).where(eq(accountEmailTokens.id, token.id))
        await cancelActiveOutbox(tx, [token.id], timestamp)
        return 'expired' as const
      }
      const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${token.normalizedEmail}`).limit(1)
      if (existing) {
        await tx.update(accountEmailTokens).set({ revokedAt: timestamp }).where(eq(accountEmailTokens.id, token.id))
        await cancelActiveOutbox(tx, [token.id], timestamp)
        return 'email-exists' as const
      }
      const [emailRecord] = await tx.select({ locale: mailOutbox.locale }).from(mailOutbox)
        .where(eq(mailOutbox.tokenId, token.id)).orderBy(mailOutbox.createdAt).limit(1)
      try {
        await tx.transaction(async savepoint => savepoint.insert(users).values({
          email: token.normalizedEmail,
          password: passwordHash,
          name: input.name?.trim() || null,
          locale: maskedLocale(emailRecord?.locale ?? 'zh-TW'),
        }))
      } catch (error) {
        if (isUniqueViolation(error, 'users_email_lower_key')) {
          await tx.update(accountEmailTokens).set({ revokedAt: timestamp }).where(eq(accountEmailTokens.id, token.id))
          await cancelActiveOutbox(tx, [token.id], timestamp)
          return 'email-exists' as const
        }
        throw error
      }
      await tx.update(accountEmailTokens).set({ consumedAt: timestamp }).where(eq(accountEmailTokens.id, token.id))
      await cancelActiveOutbox(tx, [token.id], timestamp)
      return 'created' as const
    })
    if (outcome === 'expired') fail(410, 'AUTH_EMAIL_TOKEN_EXPIRED', 'This email link has expired')
    if (outcome === 'email-exists') fail(409, 'USER_EMAIL_EXISTS', 'This email already has an account')
    if (outcome !== 'created') fail(401, 'AUTH_EMAIL_TOKEN_INVALID', 'This email link is invalid')
    return { success: true as const }
  }

  const requestPasswordReset = async (input: { email: string; locale: EmailLocale }, ip: string, fail: EmailFail) => {
    const timestamp = now()
    if (!await enforceRequestLimits(db, { action: 'password-reset-request', email: input.email, ip, timestamp })) failRateLimited(fail)
    const email = normalizedEmail(input.email)
    await db.transaction(async tx => {
      const [settings] = await tx.select({ enabled: mailSettings.enabled }).from(mailSettings)
        .where(eq(mailSettings.singleton, 'default')).for('update').limit(1)
      if (!settings?.enabled) fail(503, 'AUTH_EMAIL_SERVICE_DISABLED', 'Email password recovery is unavailable')
      const [user] = await tx.select({ id: users.id, email: users.email }).from(users)
        .where(sql`lower(${users.email}) = ${email}`).limit(1)
      if (!user) return

      await rotateActiveTokens(tx, 'password_reset', email, user.id, timestamp)
      const expiresAt = new Date(timestamp.getTime() + RESET_TTL_MS)
      const token = newTokenRecord('password_reset', email, user.id, expiresAt)
      const [created] = await tx.insert(accountEmailTokens).values(token.record).returning({ id: accountEmailTokens.id })
      if (!created) throw new Error('ACCOUNT_EMAIL_TOKEN_INSERT_FAILED')
      const link = trustedActionUrl(webOrigin, '/reset-password', token.rawToken)
      await insertOutbox(tx, { kind: 'password_reset', email: user.email, locale: input.locale, tokenId: created.id, expiresAt, link, now: timestamp, keyring })
    })
    return { success: true as const }
  }

  const completePasswordReset = async (input: { token: string; newPassword: string }, ip: string, fail: EmailFail) => {
    const timestamp = now()
    const tokenDigest = digest(input.token)
    if (!await enforceRequestLimits(db, { action: 'password-reset-complete', ip, timestamp, completionTokenDigest: tokenDigest })) failRateLimited(fail)
    const [candidate] = await db.select({ id: accountEmailTokens.id, userId: accountEmailTokens.userId }).from(accountEmailTokens)
      .where(and(eq(accountEmailTokens.tokenDigest, tokenDigest), eq(accountEmailTokens.purpose, 'password_reset'))).limit(1)
    if (!candidate?.userId) fail(401, 'AUTH_EMAIL_TOKEN_INVALID', 'This password reset link is invalid')
    const passwordHash = await bcrypt.hash(input.newPassword, 10)

    const outcome = await db.transaction(async tx => {
      await tx.execute(userSessionLock(candidate.userId!))
      const [token] = await tx.select().from(accountEmailTokens).where(and(
        eq(accountEmailTokens.id, candidate.id), eq(accountEmailTokens.tokenDigest, tokenDigest), eq(accountEmailTokens.purpose, 'password_reset'),
      )).for('update').limit(1)
      if (!token || token.userId !== candidate.userId || token.consumedAt || token.revokedAt) return 'invalid' as const
      if (token.expiresAt <= timestamp) {
        await tx.update(accountEmailTokens).set({ revokedAt: timestamp }).where(eq(accountEmailTokens.id, token.id))
        await cancelActiveOutbox(tx, [token.id], timestamp)
        return 'expired' as const
      }
      const [user] = await tx.select({ id: users.id, email: users.email, locale: users.locale }).from(users)
        .where(eq(users.id, token.userId!)).for('update').limit(1)
      if (!user) return 'invalid' as const
      await tx.update(users).set({ password: passwordHash, tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: timestamp })
        .where(eq(users.id, user.id))
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, user.id))
      await tx.update(accountEmailTokens).set({ consumedAt: timestamp }).where(eq(accountEmailTokens.id, token.id))
      const otherTokens = await tx.select({ id: accountEmailTokens.id }).from(accountEmailTokens).where(and(
        eq(accountEmailTokens.userId, user.id), eq(accountEmailTokens.purpose, 'password_reset'),
        isNull(accountEmailTokens.consumedAt), isNull(accountEmailTokens.revokedAt),
      )).for('update')
      const otherIds = otherTokens.map(item => item.id)
      if (otherIds.length > 0) {
        await tx.update(accountEmailTokens).set({ revokedAt: timestamp }).where(inArray(accountEmailTokens.id, otherIds))
        await cancelActiveOutbox(tx, otherIds, timestamp)
      }
      return { status: 'reset' as const, user }
    })
    if (outcome === 'expired') fail(410, 'AUTH_EMAIL_TOKEN_EXPIRED', 'This password reset link has expired')
    if (outcome === 'invalid') fail(401, 'AUTH_EMAIL_TOKEN_INVALID', 'This password reset link is invalid')
    await notifyPasswordChanged(outcome.user.email, maskedLocale(outcome.user.locale), timestamp)
    return { success: true as const, userId: outcome.user.id.toString() }
  }

  const invalidateForPasswordChange = async (tx: DatabaseTx, user: { id: bigint; email: string; locale: string }, timestamp = now()) => {
    const active = await tx.select({ id: accountEmailTokens.id }).from(accountEmailTokens).where(and(
      eq(accountEmailTokens.userId, user.id), eq(accountEmailTokens.purpose, 'password_reset'),
      isNull(accountEmailTokens.consumedAt), isNull(accountEmailTokens.revokedAt),
    )).for('update')
    const ids = active.map(item => item.id)
    if (ids.length > 0) {
      await tx.update(accountEmailTokens).set({ revokedAt: timestamp }).where(inArray(accountEmailTokens.id, ids))
      await cancelActiveOutbox(tx, ids, timestamp)
    }
    try {
      await tx.transaction(async savepoint => {
        const [settings] = await savepoint.select({ enabled: mailSettings.enabled }).from(mailSettings)
          .where(eq(mailSettings.singleton, 'default')).limit(1)
        if (!settings?.enabled) return
        await insertOutbox(savepoint, {
          kind: 'password_changed', email: user.email, locale: maskedLocale(user.locale),
          expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000), now: timestamp, keyring,
        })
      })
    } catch {
      // Password changes must succeed when optional notification delivery is unavailable.
    }
  }

  const notifyPasswordChanged = async (email: string, locale: EmailLocale, timestamp: Date) => {
    try {
      await db.transaction(async tx => {
        const [settings] = await tx.select({ enabled: mailSettings.enabled }).from(mailSettings)
          .where(eq(mailSettings.singleton, 'default')).limit(1)
        if (!settings?.enabled) return
        await insertOutbox(tx, {
          kind: 'password_changed', email, locale,
          expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000), now: timestamp, keyring,
        })
      })
    } catch {
      // Password changes must succeed when optional notification delivery is unavailable.
    }
  }

  return { requestRegistration, completeRegistration, requestPasswordReset, completePasswordReset, invalidateForPasswordChange }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown }
  if (candidate.code === '23505' && candidate.constraint === constraint) return true
  return candidate.cause !== undefined && isUniqueViolation(candidate.cause, constraint)
}
