import type { Context, Hono } from 'hono'
import { fail, parseJson, type AppEnv } from '../app-context.js'
import { registerAccountEmailAdminRoutes } from '../account-email/admin-routes.js'
import { registerAccountEmailPublicRoutes } from '../account-email/public-routes.js'
import type { SmtpKeyring } from '../account-email/secrets.js'
import type { SmtpTransportFactory } from '../account-email/smtp.js'
import type { SurfaceContext } from './context.js'

interface AccountEmailSurfaceDependencies {
  databasePool?: Pick<import('pg').Pool, 'connect'>
  onAccountRevoked?: (userId: string) => void
  clearAuthCookies: (context: Context<AppEnv>) => void
  smtpTransportFactory?: SmtpTransportFactory
  smtpKeyring?: SmtpKeyring
  smtpHostLookup?: (hostname: string) => Promise<string[]>
  smtpAllowedPrivateHosts?: string
}

/**
 * Address verification and recovery, plus the operator SMTP configuration.
 *
 * Returns the lifecycle the auth surface needs: confirming an address can
 * revoke sessions and clear cookies, so the two surfaces share one object
 * rather than each reaching into the other. That return value is why this
 * surface is called before the auth routes in the root.
 */
export function registerAccountEmailSurface(
  app: Hono<AppEnv>,
  { db, config, now, clientIp }: SurfaceContext,
  dependencies: AccountEmailSurfaceDependencies,
) {
  const {
    databasePool,
    onAccountRevoked,
    clearAuthCookies,
    smtpTransportFactory,
    smtpKeyring,
    smtpHostLookup,
    smtpAllowedPrivateHosts,
  } = dependencies

  const lifecycle = registerAccountEmailPublicRoutes(app, {
    db,
    webOrigin: config.webOrigin,
    now,
    clientIp,
    fail,
    parseJson,
    onAccountRevoked,
    clearAuthCookies,
    ...(smtpKeyring ? { keyring: smtpKeyring } : {}),
  })

  registerAccountEmailAdminRoutes(app, {
    db,
    ...(databasePool ? { pool: databasePool } : {}),
    now,
    fail,
    parseJson,
    ...(smtpTransportFactory ? { smtpTransportFactory } : {}),
    ...(smtpKeyring ? { smtpKeyring } : {}),
    ...(smtpHostLookup ? { smtpHostLookup } : {}),
    ...(smtpAllowedPrivateHosts !== undefined ? { smtpAllowedPrivateHosts } : {}),
  })

  return lifecycle
}
