import { randomUUID } from 'node:crypto'
import { accountEmailRateLimits, accountEmailTokens, mailAdminAuditEvents, mailOutbox, mailSettings, type Database } from '@diary/db'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { classifySmtpError, SMTP_TIMEOUT_MAX_MS, SmtpTransportError, type SmtpTransportFactory } from './smtp.js'
import { environmentSmtpKeyring, SmtpSecretError, type SmtpKeyring } from './secrets.js'
import { openMailPayload, smtpConfigForSettings, type SmtpRuntimeOptions } from './runtime.js'
import { sendSmtpMessage } from './smtp.js'
import { withMailDispatchFence, type MailDispatchPool } from './dispatch-fence.js'

const LEASE_MS = SMTP_TIMEOUT_MAX_MS + 30_000
const MAX_GLOBAL_DISPATCHES = 1
const DISPATCH_LOCK_NAME = 'diary-mail-worker-global-dispatch'
const TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const TOKEN_RETENTION_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000

export interface AccountEmailWorkerOptions {
  db: Database
  pool?: MailDispatchPool
  workerId: string
  now?: () => Date
  keyring?: SmtpKeyring
  lookup?: (hostname: string) => Promise<string[]>
  allowedPrivateHosts?: string
  transportFactory?: SmtpTransportFactory
  logger?: { info?(message: string, context?: Record<string, unknown>): void; error?(message: string, context?: Record<string, unknown>): void }
}

interface ClaimedMail {
  id: bigint
  kind: typeof mailOutbox.$inferSelect.kind
  tokenId: bigint | null
  encryptedPayload: string | null
  attempts: number
  maxAttempts: number
  expiresAt: Date
  leaseToken: string
}

function leaseValues(timestamp: Date) {
  return {
    leaseToken: null,
    workerId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    updatedAt: timestamp,
  }
}

async function cleanAndRecover(db: Database, timestamp: Date) {
  await db.transaction(async tx => {
    const expiredLeases = await tx.select({ id: mailOutbox.id, attempts: mailOutbox.attempts, maxAttempts: mailOutbox.maxAttempts })
      .from(mailOutbox).where(and(eq(mailOutbox.status, 'running'), lt(mailOutbox.leaseExpiresAt, timestamp))).for('update', { skipLocked: true })
    for (const row of expiredLeases) {
      if (row.attempts >= row.maxAttempts) {
        await tx.update(mailOutbox).set({
          status: 'failed', encryptedPayload: null, finishedAt: timestamp,
          lastErrorCode: 'MAIL_WORKER_LEASE_EXPIRED', lastErrorDetail: null, ...leaseValues(timestamp),
        }).where(and(eq(mailOutbox.id, row.id), eq(mailOutbox.status, 'running')))
      } else {
        await tx.update(mailOutbox).set({
          status: 'queued', nextAttemptAt: timestamp,
          lastErrorCode: 'MAIL_WORKER_LEASE_EXPIRED', lastErrorDetail: null, ...leaseValues(timestamp),
        }).where(and(eq(mailOutbox.id, row.id), eq(mailOutbox.status, 'running')))
      }
    }
    await tx.update(mailOutbox).set({
      status: 'failed', encryptedPayload: null, finishedAt: timestamp,
      lastErrorCode: 'MAIL_EXPIRED', lastErrorDetail: null, ...leaseValues(timestamp),
    }).where(and(eq(mailOutbox.status, 'queued'), lt(mailOutbox.expiresAt, timestamp)))
  })

  const terminalBefore = new Date(timestamp.getTime() - TERMINAL_RETENTION_MS)
  const tokenBefore = new Date(timestamp.getTime() - TOKEN_RETENTION_AFTER_EXPIRY_MS)
  await db.delete(mailOutbox).where(and(inArray(mailOutbox.status, ['sent', 'failed', 'cancelled']), lt(mailOutbox.createdAt, terminalBefore)))
  await db.delete(accountEmailTokens).where(lt(accountEmailTokens.expiresAt, tokenBefore))
  await db.delete(accountEmailRateLimits).where(lt(accountEmailRateLimits.expiresAt, timestamp))
  await db.delete(mailAdminAuditEvents).where(lt(mailAdminAuditEvents.createdAt, terminalBefore))
}

async function claimMail(db: Database, workerId: string, timestamp: Date): Promise<ClaimedMail | null> {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${DISPATCH_LOCK_NAME}, 0::bigint))`)
    const [settings] = await tx.select().from(mailSettings).where(eq(mailSettings.singleton, 'default')).limit(1).for('share')
    if (!settings?.enabled || settings.lastTestStatus !== 'passed' || settings.lastTestedRevision !== settings.revision) return null
    const active = await tx.select({ id: mailOutbox.id }).from(mailOutbox).where(and(
      eq(mailOutbox.status, 'running'),
      sql`${mailOutbox.leaseExpiresAt} > ${timestamp}`,
    )).limit(MAX_GLOBAL_DISPATCHES)
    if (active.length >= MAX_GLOBAL_DISPATCHES) return null

    const [candidate] = await tx.select({ id: mailOutbox.id }).from(mailOutbox).where(and(
      eq(mailOutbox.status, 'queued'),
      sql`${mailOutbox.nextAttemptAt} <= ${timestamp}`,
      sql`${mailOutbox.expiresAt} > ${timestamp}`,
      sql`${mailOutbox.attempts} < ${mailOutbox.maxAttempts}`,
    )).orderBy(mailOutbox.nextAttemptAt, mailOutbox.id).limit(1).for('update', { skipLocked: true })
    if (!candidate) return null

    const leaseToken = randomUUID()
    const [claimed] = await tx.update(mailOutbox).set({
      status: 'running',
      leaseToken,
      workerId,
      leaseExpiresAt: new Date(timestamp.getTime() + LEASE_MS),
      heartbeatAt: timestamp,
      startedAt: timestamp,
      updatedAt: timestamp,
    }).where(and(eq(mailOutbox.id, candidate.id), eq(mailOutbox.status, 'queued'))).returning({
      id: mailOutbox.id,
      kind: mailOutbox.kind,
      tokenId: mailOutbox.tokenId,
      encryptedPayload: mailOutbox.encryptedPayload,
      attempts: mailOutbox.attempts,
      maxAttempts: mailOutbox.maxAttempts,
      expiresAt: mailOutbox.expiresAt,
      leaseToken: mailOutbox.leaseToken,
    })
    return claimed ? { ...claimed, leaseToken } : null
  })
}

async function releaseWithoutAttempt(db: Database, job: ClaimedMail, timestamp: Date, errorCode: string) {
  await db.update(mailOutbox).set({
    status: 'queued', nextAttemptAt: new Date(timestamp.getTime() + 5_000),
    lastErrorCode: errorCode, lastErrorDetail: null, ...leaseValues(timestamp),
  }).where(and(eq(mailOutbox.id, job.id), eq(mailOutbox.status, 'running'), eq(mailOutbox.leaseToken, job.leaseToken)))
}

async function cancelClaimed(db: Database, job: ClaimedMail, timestamp: Date, errorCode: string) {
  await db.update(mailOutbox).set({
    status: 'cancelled', encryptedPayload: null, finishedAt: timestamp,
    lastErrorCode: errorCode, lastErrorDetail: null, ...leaseValues(timestamp),
  }).where(and(eq(mailOutbox.id, job.id), eq(mailOutbox.status, 'running'), eq(mailOutbox.leaseToken, job.leaseToken)))
}

function failureCode(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof SmtpTransportError) return { code: error.code, retryable: error.retryable }
  if (error instanceof SmtpSecretError) return { code: error.code, retryable: false }
  if (error instanceof Error && error.message === 'ADMIN_EMAIL_SETTINGS_INVALID') return { code: 'SMTP_CONFIG_INVALID', retryable: false }
  const classified = classifySmtpError(error)
  return { code: classified.code, retryable: classified.retryable }
}

async function recordFailure(db: Database, job: ClaimedMail, timestamp: Date, attempt: number, error: unknown, logger?: AccountEmailWorkerOptions['logger']) {
  const mapped = failureCode(error)
  const retry = mapped.retryable && attempt < job.maxAttempts && timestamp < job.expiresAt
  const backoffMs = Math.min(30 * 60_000, 60_000 * (2 ** Math.max(0, attempt - 1)))
  await db.update(mailOutbox).set(retry ? {
    status: 'queued',
    attempts: attempt,
    nextAttemptAt: new Date(Math.min(timestamp.getTime() + backoffMs, job.expiresAt.getTime())),
    lastAttemptAt: timestamp,
    lastErrorCode: mapped.code,
    lastErrorDetail: null,
    ...leaseValues(timestamp),
  } : {
    status: 'failed', encryptedPayload: null, finishedAt: timestamp,
    attempts: attempt, lastAttemptAt: timestamp,
    lastErrorCode: mapped.code, lastErrorDetail: null, ...leaseValues(timestamp),
  }).where(and(eq(mailOutbox.id, job.id), eq(mailOutbox.status, 'running'), eq(mailOutbox.leaseToken, job.leaseToken)))
  logger?.error?.('Account email delivery failed', { operation: 'mail_delivery', jobId: job.id.toString(), errorCode: mapped.code, retryScheduled: retry })
  return retry ? 'retry' as const : 'failed' as const
}

export async function runAccountEmailWorkerOnce(options: AccountEmailWorkerOptions): Promise<{ status: 'sent' | 'retry' | 'failed' | 'cancelled' | 'idle' }> {
  const now = options.now ?? (() => new Date())
  const timestamp = now()
  await cleanAndRecover(options.db, timestamp)
  const job = await claimMail(options.db, options.workerId, timestamp)
  if (!job) return { status: 'idle' }

  if (job.tokenId !== null) {
    const [token] = await options.db.select({ expiresAt: accountEmailTokens.expiresAt, consumedAt: accountEmailTokens.consumedAt, revokedAt: accountEmailTokens.revokedAt })
      .from(accountEmailTokens).where(eq(accountEmailTokens.id, job.tokenId)).limit(1)
    if (!token || token.expiresAt <= timestamp || token.consumedAt || token.revokedAt) {
      await cancelClaimed(options.db, job, timestamp, 'MAIL_TOKEN_STALE')
      return { status: 'cancelled' }
    }
  }

  const [settings] = await options.db.select().from(mailSettings).where(eq(mailSettings.singleton, 'default')).limit(1)
  if (!settings?.enabled || settings.lastTestStatus !== 'passed' || settings.lastTestedRevision !== settings.revision) {
    await releaseWithoutAttempt(options.db, job, timestamp, 'MAIL_SETTINGS_INACTIVE')
    return { status: 'idle' }
  }
  if (!job.encryptedPayload) {
    await cancelClaimed(options.db, job, timestamp, 'MAIL_PAYLOAD_UNAVAILABLE')
    return { status: 'cancelled' }
  }

  let payload
  try {
    payload = openMailPayload(job.encryptedPayload, options.keyring ?? environmentSmtpKeyring())
  } catch (error) {
    await recordFailure(options.db, job, timestamp, job.attempts + 1, error, options.logger)
    return { status: 'failed' }
  }

  try {
    const runtimeOptions: SmtpRuntimeOptions = {
      ...(options.keyring ? { keyring: options.keyring } : {}),
      ...(options.lookup ? { lookup: options.lookup } : {}),
      ...(options.allowedPrivateHosts !== undefined ? { allowedPrivateHosts: options.allowedPrivateHosts } : {}),
    }
    const smtpConfig = await smtpConfigForSettings(settings, runtimeOptions)
    return await withMailDispatchFence(options.pool, 'shared', async () => {
      const dispatchAt = now()
      const [currentSettings] = await options.db.select().from(mailSettings).where(eq(mailSettings.singleton, 'default')).limit(1)
      if (!currentSettings?.enabled || currentSettings.lastTestStatus !== 'passed'
        || currentSettings.lastTestedRevision !== currentSettings.revision
        || currentSettings.revision !== settings.revision) {
        await releaseWithoutAttempt(options.db, job, dispatchAt, 'MAIL_SETTINGS_INACTIVE')
        return { status: 'idle' }
      }
      if (job.expiresAt <= dispatchAt) {
        await cancelClaimed(options.db, job, dispatchAt, 'MAIL_EXPIRED')
        return { status: 'cancelled' }
      }
      if (job.tokenId !== null) {
        const [currentToken] = await options.db.select({ expiresAt: accountEmailTokens.expiresAt, consumedAt: accountEmailTokens.consumedAt, revokedAt: accountEmailTokens.revokedAt })
          .from(accountEmailTokens).where(eq(accountEmailTokens.id, job.tokenId)).limit(1)
        if (!currentToken || currentToken.expiresAt <= dispatchAt || currentToken.consumedAt || currentToken.revokedAt) {
          await cancelClaimed(options.db, job, dispatchAt, 'MAIL_TOKEN_STALE')
          return { status: 'cancelled' }
        }
      }
      const attempt = job.attempts + 1
      const [started] = await options.db.update(mailOutbox).set({
        attempts: attempt,
        lastAttemptAt: dispatchAt,
        configRevisionUsed: currentSettings.revision,
        heartbeatAt: dispatchAt,
        updatedAt: dispatchAt,
      }).where(and(eq(mailOutbox.id, job.id), eq(mailOutbox.status, 'running'), eq(mailOutbox.leaseToken, job.leaseToken)))
        .returning({ id: mailOutbox.id })
      if (!started) return { status: 'cancelled' }

      try {
        await sendSmtpMessage(smtpConfig, { ...payload, messageId: `<account-email-${job.id}@diary-v3.invalid>` }, options.transportFactory)
      } catch (error) {
        const result = await recordFailure(options.db, job, now(), attempt, error, options.logger)
        return { status: result }
      }
      const completedAt = now()
      const [sent] = await options.db.update(mailOutbox).set({
        status: 'sent', encryptedPayload: null, sentAt: completedAt, finishedAt: completedAt,
        lastErrorCode: null, lastErrorDetail: null, ...leaseValues(completedAt),
      }).where(and(eq(mailOutbox.id, job.id), eq(mailOutbox.status, 'running'), eq(mailOutbox.leaseToken, job.leaseToken)))
        .returning({ id: mailOutbox.id })
      if (!sent) return { status: 'cancelled' }
      options.logger?.info?.('Account email accepted by SMTP', { operation: 'mail_delivery', jobId: job.id.toString(), kind: job.kind, configRevision: currentSettings.revision })
      return { status: 'sent' }
    })
  } catch (error) {
    const result = await recordFailure(options.db, job, now(), job.attempts + 1, error, options.logger)
    return { status: result }
  }
}

export async function runAccountEmailWorker(options: AccountEmailWorkerOptions & { pollMs?: number; signal?: AbortSignal }) {
  const pollMs = options.pollMs ?? 1_000
  if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60_000) throw new Error('MAIL_WORKER_POLL_MS must be an integer between 250 and 60000')
  while (!options.signal?.aborted) {
    try {
      const result = await runAccountEmailWorkerOnce(options)
      if (result.status === 'idle') await wait(pollMs, options.signal)
    } catch (error) {
      options.logger?.error?.('Account email worker cycle failed', { operation: 'mail_worker', errorCode: failureCode(error).code })
      await wait(pollMs, options.signal)
    }
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const timer = setTimeout(done, milliseconds)
    timer.unref?.()
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}
