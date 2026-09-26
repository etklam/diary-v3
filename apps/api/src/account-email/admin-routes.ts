import type { Context, Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { users, type Database } from '@diary/db'
import {
  adminEmailRevisionRequestSchema,
  adminEmailSettingsResponseSchema,
  adminEmailSettingsUpdateSchema,
  adminEmailTestRequestSchema,
} from '@diary/contracts/account-email'
import type { ErrorCode } from '@diary/contracts'
import type { z } from 'zod'
import type { AppEnv } from '../app.js'
import type { SmtpKeyring } from './secrets.js'
import type { SmtpTransportFactory } from './smtp.js'
import type { MailDispatchPool } from './dispatch-fence.js'
import {
  clearSmtpSettings,
  readAdminEmailSettings,
  setSmtpEnabled,
  SmtpAdminError,
  testSmtpSettings,
  updateSmtpSettings,
} from './settings.js'

interface AdminEmailDependencies {
  db: Database
  pool?: MailDispatchPool
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
  smtpTransportFactory?: SmtpTransportFactory
  smtpKeyring?: SmtpKeyring
  smtpHostLookup?: (hostname: string) => Promise<string[]>
  smtpAllowedPrivateHosts?: string
}

function mapError(error: unknown): { status: number; code: ErrorCode; message: string } {
  if (error instanceof SmtpAdminError) {
    if (error.code === 'AUTH_FORBIDDEN') return { status: 403, code: error.code, message: 'Admin access required' }
    if (error.code === 'ADMIN_EMAIL_ENCRYPTION_UNAVAILABLE') return { status: 503, code: error.code, message: 'SMTP encryption keys are unavailable' }
    if (error.code === 'ADMIN_EMAIL_CONFIG_CONFLICT') return { status: 409, code: error.code, message: 'The SMTP settings changed; reload and retry' }
    if (error.code === 'ADMIN_EMAIL_TEST_REQUIRED') return { status: 409, code: error.code, message: 'Test the current SMTP settings before enabling mail' }
    if (error.code === 'AUTH_RATE_LIMITED') return { status: 429, code: error.code, message: 'Too many SMTP tests. Please try again later' }
    return { status: 400, code: error.code, message: 'The SMTP settings are incomplete or invalid' }
  }
  if (error instanceof Error && error.message === 'ADMIN_EMAIL_SETTINGS_INVALID') {
    return { status: 400, code: 'ADMIN_EMAIL_SETTINGS_INVALID', message: 'The SMTP settings are incomplete or invalid' }
  }
  return { status: 500, code: 'SYS_INTERNAL_ERROR', message: 'Unable to update SMTP settings' }
}

export function registerAccountEmailAdminRoutes(app: Hono<AppEnv>, dependencies: AdminEmailDependencies) {
  const { db, now, fail, parseJson } = dependencies
  const smtpOptions = {
    ...(dependencies.pool ? { pool: dependencies.pool } : {}),
    ...(dependencies.smtpKeyring ? { keyring: dependencies.smtpKeyring } : {}),
    ...(dependencies.smtpHostLookup ? { lookup: dependencies.smtpHostLookup } : {}),
    ...(dependencies.smtpAllowedPrivateHosts !== undefined ? { allowedPrivateHosts: dependencies.smtpAllowedPrivateHosts } : {}),
    ...(dependencies.smtpTransportFactory ? { transportFactory: dependencies.smtpTransportFactory } : {}),
  }

  const requireAdmin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [current] = await db.select({ id: users.id, role: users.role, locale: users.locale })
      .from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!current) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (current.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return current
  }

  const safely = async <T>(context: Context<AppEnv>, operation: () => Promise<T>, serialize: (value: T) => unknown) => {
    try { return context.json(serialize(await operation())) }
    catch (error) {
      const mapped = mapError(error)
      return fail(mapped.status, mapped.code, mapped.message)
    }
  }

  const currentSettings = (at = now()) => readAdminEmailSettings(db, at)

  app.get('/api/admin/email-settings', async context => {
    await requireAdmin(context)
    return safely(context, currentSettings, value => adminEmailSettingsResponseSchema.parse(value))
  })

  app.put('/api/admin/email-settings', async context => {
    const admin = await requireAdmin(context)
    const input = await parseJson(context, adminEmailSettingsUpdateSchema)
    return safely(context, async () => {
      await updateSmtpSettings(db, input, admin.id, now(), smtpOptions)
      return currentSettings()
    }, value => adminEmailSettingsResponseSchema.parse(value))
  })

  app.post('/api/admin/email-settings/test', async context => {
    const admin = await requireAdmin(context)
    const input = await parseJson(context, adminEmailTestRequestSchema)
    return safely(context, () => testSmtpSettings(db, input, {
      userId: admin.id,
      locale: admin.locale as 'zh-TW' | 'zh-CN' | 'en',
    }, now(), smtpOptions), value => value)
  })

  app.post('/api/admin/email-settings/enable', async context => {
    const admin = await requireAdmin(context)
    const input = await parseJson(context, adminEmailRevisionRequestSchema)
    return safely(context, async () => {
      await setSmtpEnabled(db, input, admin.id, true, now(), smtpOptions)
      return currentSettings()
    }, value => adminEmailSettingsResponseSchema.parse(value))
  })

  app.post('/api/admin/email-settings/disable', async context => {
    const admin = await requireAdmin(context)
    const input = await parseJson(context, adminEmailRevisionRequestSchema)
    return safely(context, async () => {
      await setSmtpEnabled(db, input, admin.id, false, now(), smtpOptions)
      return currentSettings()
    }, value => adminEmailSettingsResponseSchema.parse(value))
  })

  app.post('/api/admin/email-settings/clear', async context => {
    const admin = await requireAdmin(context)
    const input = await parseJson(context, adminEmailRevisionRequestSchema)
    return safely(context, async () => {
      await clearSmtpSettings(db, input, admin.id, now(), smtpOptions)
      return currentSettings()
    }, value => adminEmailSettingsResponseSchema.parse(value))
  })
}
