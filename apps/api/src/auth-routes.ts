/**
 * Credential and account-identity endpoints: registration, the browser and
 * native session lifecycles, password change, and the authenticated account's
 * own settings. These share the cookie helpers and session service that
 * `createApp` owns, so they arrive as dependencies rather than module state.
 */
import { authUser, hashRefreshToken, REFRESH_COOKIE, type createAuthSessionService } from './auth-session.js'
import {
  authMutationResponseSchema,
  authUserResponseSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  CHANGE_PASSWORD_SESSION_RETAINED,
  CHANGE_PASSWORD_SIGN_IN_AGAIN,
  loginRequestSchema,
  nativeAuthResponseSchema,
  nativeLoginRequestSchema,
  nativeLogoutRequestSchema,
  nativeRefreshRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
} from '@diary/contracts'
import { updateUserSettingsSchema, userSettingsResponseSchema } from '@diary/contracts/settings'
import { mailSettings, refreshTokens, users, type Database } from '@diary/db'
import { and, eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import type { Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { clientIp, fail, instant, isUniqueViolation, parseJson, type ApiConfig, type AppEnv } from './app-context.js'
import { RATE_LIMIT_POLICIES } from './rate-limit/index.js'
import type { RateLimitPolicy } from './rate-limit/index.js'
import { getUserSettings, updateUserSettings } from './user-settings.js'
import type { createAccountEmailLifecycle } from './account-email/lifecycle.js'

export function registerAuthRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  config: ApiConfig
  now: () => Date
  logger: { error(message: string, context: Record<string, unknown>): void }
  session: ReturnType<typeof createAuthSessionService>
  accountEmailLifecycle: ReturnType<typeof createAccountEmailLifecycle>
  findUserByEmail: (email: string) => Promise<typeof users.$inferSelect | undefined>
  setAccessCookie: (c: Context<AppEnv>, token: string) => void
  setRefreshCookie: (c: Context<AppEnv>, token: string) => void
  clearAuthCookies: (c: Context<AppEnv>) => void
  onAccountRevoked?: (userId: string) => void
  consume: (context: Context<AppEnv>, policy: RateLimitPolicy, scope: string, identity: string) => Promise<void>
}) {
  const {
    db, config, now, logger, session, accountEmailLifecycle, findUserByEmail,
    setAccessCookie, setRefreshCookie, clearAuthCookies, onAccountRevoked,
    consume: consumeRateLimit,
  } = dependencies

  app.post('/api/auth/register', async (c) => {
    const ip = clientIp(c, config.trustProxy)
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.registerIp, 'ip', ip)
    const input = await parseJson(c, registerRequestSchema)
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.registerAccount, 'account', input.email.trim().toLowerCase())

    try {
      const password = await bcrypt.hash(input.password, 10)
      const user = await db.transaction(async tx => {
        const [settings] = await tx.select({ enabled: mailSettings.enabled }).from(mailSettings)
          .where(eq(mailSettings.singleton, 'default')).for('update').limit(1)
        if (settings?.enabled) fail(409, 'AUTH_EMAIL_VERIFICATION_REQUIRED', 'Verify your email before creating an account')
        const [existing] = await tx.select({ id: users.id }).from(users)
          .where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`).limit(1)
        if (existing) fail(409, 'USER_EMAIL_EXISTS', `Email ${input.email} already registered`)
        const [created] = await tx.insert(users).values({
          email: input.email,
          password,
          name: input.name,
        }).returning()
        return created
      })
      if (!user) throw new Error('User insert returned no row')
      return c.json(registerResponseSchema.parse({
        success: true,
        user: {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          expectedMonthlyTrades: user.expectedMonthlyTrades,
          expectedProfit: user.expectedProfit,
          expectedAvgHolding: user.expectedAvgHolding,
          createdAt: instant(user.createdAt),
        },
      }), 200)
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_lower_key')) fail(409, 'USER_EMAIL_EXISTS', `Email ${input.email} already registered`)
      throw error
    }
  })

  app.post('/api/auth/login', async (c) => {
    const ip = clientIp(c, config.trustProxy)
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.loginIp, 'ip', ip)
    const input = await parseJson(c, loginRequestSchema)
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.loginAccount, 'account', input.email.trim().toLowerCase())
    const user = await findUserByEmail(input.email)
    if (!user || !await bcrypt.compare(input.password, user.password)) {
      fail(401, 'AUTH_LOGIN_INVALID_CREDENTIALS', 'Invalid email or password')
    }

    const result = await session.createLoginSession({
      candidate: user, password: input.password, clientType: 'WEB',
    })
    if (result.clientType !== 'WEB') throw new Error('Unexpected login session type')
    setAccessCookie(c, result.accessToken)
    setRefreshCookie(c, result.refreshToken)
    return c.json(authUserResponseSchema.parse({ ok: true, data: authUser(result.user) }), 200)
  })

  app.post('/api/auth/refresh', async (c) => {
    if (c.get('authTransport') && c.get('authTransport') !== 'cookie') {
      fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
    }
    const refreshToken = getCookie(c, REFRESH_COOKIE)
    if (!refreshToken) fail(401, 'AUTH_NO_REFRESH_TOKEN', 'No refresh token provided')
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.refreshIp, 'ip', clientIp(c, config.trustProxy))
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.refreshToken, 'token', hashRefreshToken(refreshToken).slice(0, 24))
    const refreshed = await session.refreshWebSession(refreshToken)
    setAccessCookie(c, refreshed.accessToken)
    return c.json(authMutationResponseSchema.parse({ ok: true }), 200)
  })

  app.post('/api/auth/logout', async (c) => {
    const transport = c.get('authTransport')
    const isCookieSession = transport === undefined || transport === 'cookie'
    if (isCookieSession) {
      const refreshToken = getCookie(c, REFRESH_COOKIE)
      if (refreshToken) {
        try {
          await db.delete(refreshTokens).where(and(
            eq(refreshTokens.token, hashRefreshToken(refreshToken)),
            eq(refreshTokens.clientType, 'WEB'),
          ))
        } catch (error) {
          // Browser logout is fail-safe: clearing the local credentials must not
          // depend on refresh-token persistence being available.
          const candidate = error && typeof error === 'object'
            ? error as { name?: unknown; code?: unknown }
            : undefined
          logger.error('Browser refresh-token cleanup failed', {
            operation: 'auth_logout_cleanup',
            requestId: c.get('requestId'),
            errorName: typeof candidate?.name === 'string' ? candidate.name : 'Error',
            errorCode: typeof candidate?.code === 'string' ? candidate.code : undefined,
          })
        }
      }
      clearAuthCookies(c)
    }
    return c.json(authMutationResponseSchema.parse({ ok: true }), 200)
  })

  app.post('/api/auth/native/login', async (c) => {
    const ip = clientIp(c, config.trustProxy)
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.loginIp, 'ip', ip)
    const input = await parseJson(c, nativeLoginRequestSchema)
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.loginAccount, 'account', input.email.trim().toLowerCase())
    const user = await findUserByEmail(input.email)
    if (!user || !await bcrypt.compare(input.password, user.password)) {
      fail(401, 'AUTH_LOGIN_INVALID_CREDENTIALS', 'Invalid email or password')
    }
    const result = await session.createLoginSession({
      candidate: user,
      password: input.password,
      clientType: 'NATIVE',
      deviceName: input.deviceName,
    })
    if (result.clientType !== 'NATIVE') throw new Error('Unexpected login session type')
    return c.json(nativeAuthResponseSchema.parse({ ok: true, data: result.pair }), 200)
  })

  app.post('/api/auth/native/refresh', async (c) => {
    const input = await parseJson(c, nativeRefreshRequestSchema)
    const tokenHash = hashRefreshToken(input.refreshToken)
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.refreshIp, 'ip', clientIp(c, config.trustProxy))
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.refreshToken, 'token', tokenHash.slice(0, 24))
    const outcome = await session.refreshNativeSession(input.refreshToken)
    if (!outcome.ok) {
      if (outcome.reason === 'invalid') fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
      if (outcome.reason === 'not-found') fail(401, 'AUTH_TOKEN_NOT_FOUND', 'Token not found')
      if (outcome.reason === 'expired') fail(401, 'AUTH_TOKEN_EXPIRED', 'Token expired')
      fail(401, 'AUTH_TOKEN_REVOKED', 'Token has been revoked')
    }
    return c.json(nativeAuthResponseSchema.parse({ ok: true, data: outcome.pair }), 200)
  })

  app.post('/api/auth/native/logout', async (c) => {
    const input = await parseJson(c, nativeLogoutRequestSchema)
    await session.logoutNativeSession(input.refreshToken)
    return c.json(authMutationResponseSchema.parse({ ok: true }), 200)
  })

  app.post('/api/auth/logout-all', async (c) => {
    const authenticated = c.get('user')
    if (!authenticated) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    await session.logoutAllSessions(BigInt(authenticated.id))
    onAccountRevoked?.(authenticated.id)
    clearAuthCookies(c)
    return c.json(authMutationResponseSchema.parse({ ok: true }), 200)
  })

  app.put('/api/user/password', async (c) => {
    const authenticated = c.get('user')
    if (!authenticated) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.passwordIp, 'ip', clientIp(c, config.trustProxy))
    await consumeRateLimit(c, RATE_LIMIT_POLICIES.passwordUser, 'user', authenticated.id)
    const input = await parseJson(c, changePasswordRequestSchema)
    // Only an ambient browser session can be handed a replacement here; a
    // bearer or API-key caller holds credentials this response cannot update.
    const reissueWebSession = c.get('authTransport') === 'cookie'
    const replacement = await session.changePassword(BigInt(authenticated.id), input.currentPassword, input.newPassword, {
      reissueWebSession,
      afterPasswordChanged: async (tx, user) => {
        await accountEmailLifecycle.invalidateForPasswordChange(tx, {
          id: BigInt(authenticated.id),
          email: user.email,
          locale: user.locale,
        }, now())
      },
    })
    // Sockets still hold the previous token version, including this device's.
    // The browser reconnects with the credentials set below.
    onAccountRevoked?.(authenticated.id)
    if (replacement) {
      setAccessCookie(c, replacement.accessToken)
      setRefreshCookie(c, replacement.refreshToken)
    } else {
      clearAuthCookies(c)
    }
    return c.json(changePasswordResponseSchema.parse({
      success: true,
      sessionRetained: replacement !== undefined,
      message: replacement ? CHANGE_PASSWORD_SESSION_RETAINED : CHANGE_PASSWORD_SIGN_IN_AGAIN,
    }), 200)
  })

  app.get('/api/user/settings', async (c) => {
    const authenticated = c.get('user')
    if (!authenticated) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const settings = await getUserSettings(db, BigInt(authenticated.id))
    if (!settings) fail(404, 'USER_NOT_FOUND', 'User not found')
    return c.json(userSettingsResponseSchema.parse({ success: true, settings }), 200)
  })

  app.put('/api/user/settings', async (c) => {
    const authenticated = c.get('user')
    if (!authenticated) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const input = await parseJson(c, updateUserSettingsSchema)
    const settings = await updateUserSettings(db, BigInt(authenticated.id), input, now())
    if (!settings) fail(404, 'USER_NOT_FOUND', 'User not found')
    return c.json(userSettingsResponseSchema.parse({ success: true, settings }), 200)
  })

  app.get('/api/auth/me', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [user] = await db.select().from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!user) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return c.json(authUserResponseSchema.parse({ ok: true, data: authUser(user) }), 200)
  })
}
