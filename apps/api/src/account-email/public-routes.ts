import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { accountEmailMutationResponseSchema, accountEmailRequestSchema, authCapabilitiesSchema, passwordResetCompleteRequestSchema, registrationCompleteRequestSchema } from '@diary/contracts/account-email'
import { mailSettings } from '@diary/db'
import { eq } from 'drizzle-orm'
import type { Database } from '@diary/db'
import type { AppEnv } from '../app.js'
import { createAccountEmailLifecycle, type EmailFail } from './lifecycle.js'
import { environmentSmtpKeyring, type SmtpKeyring } from './secrets.js'

interface AccountEmailPublicRouteDependencies {
  db: Database
  webOrigin: string
  now: () => Date
  clientIp: (context: Context<AppEnv>) => string
  fail: EmailFail
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
  onAccountRevoked?: (userId: string) => void
  clearAuthCookies?: (context: Context<AppEnv>) => void
  keyring?: SmtpKeyring
}

export function registerAccountEmailPublicRoutes(app: Hono<AppEnv>, dependencies: AccountEmailPublicRouteDependencies) {
  const { db, fail, parseJson } = dependencies
  const lifecycle = createAccountEmailLifecycle({
    db,
    now: dependencies.now,
    webOrigin: dependencies.webOrigin,
    keyring: dependencies.keyring ?? environmentSmtpKeyring(),
  })
  const noStore = (context: Context<AppEnv>) => context.header('Cache-Control', 'no-store, private')

  app.get('/api/auth/capabilities', async context => {
    noStore(context)
    const [settings] = await db.select({ enabled: mailSettings.enabled }).from(mailSettings)
      .where(eq(mailSettings.singleton, 'default')).limit(1)
    const enabled = settings?.enabled ?? false
    return context.json(authCapabilitiesSchema.parse({
      registrationMode: enabled ? 'email' : 'direct',
      passwordRecoveryAvailable: enabled,
    }))
  })

  app.post('/api/auth/registration/request', async context => {
    noStore(context)
    const input = await parseJson(context, accountEmailRequestSchema)
    const response = await lifecycle.requestRegistration(input, dependencies.clientIp(context), fail)
    context.header('Retry-After', '60')
    return context.json(accountEmailMutationResponseSchema.parse(response), 200)
  })

  app.post('/api/auth/registration/complete', async context => {
    noStore(context)
    const input = await parseJson(context, registrationCompleteRequestSchema)
    const response = await lifecycle.completeRegistration(input, dependencies.clientIp(context), fail)
    return context.json(accountEmailMutationResponseSchema.parse(response), 200)
  })

  app.post('/api/auth/password-reset/request', async context => {
    noStore(context)
    const input = await parseJson(context, accountEmailRequestSchema)
    const response = await lifecycle.requestPasswordReset(input, dependencies.clientIp(context), fail)
    context.header('Retry-After', '60')
    return context.json(accountEmailMutationResponseSchema.parse(response), 200)
  })

  app.post('/api/auth/password-reset/complete', async context => {
    noStore(context)
    const input = await parseJson(context, passwordResetCompleteRequestSchema)
    const response = await lifecycle.completePasswordReset(input, dependencies.clientIp(context), fail)
    dependencies.onAccountRevoked?.(response.userId)
    dependencies.clearAuthCookies?.(context)
    return context.json(accountEmailMutationResponseSchema.parse({ success: response.success }), 200)
  })

  return lifecycle
}

export type AccountEmailPublicRouteRegistration = ReturnType<typeof registerAccountEmailPublicRoutes>
