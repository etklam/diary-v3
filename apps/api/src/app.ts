import {readRotationMonitor} from './rotation-monitor.js'
import {marketRotationMonitorQuerySchema,marketRotationMonitorResponseSchema} from '@diary/contracts/rotation-monitor'
import {registerMarketStateRoutes} from './market-state-routes.js'
import {registerRotationAdmin} from './rotation-admin.js'
import {runRotationBatch} from './rotation-batch.js'
import { registerEtfProfileRoutes } from './etf-profile.js'
import { registerEtfWatchlistRoutes } from './etf-watchlist.js'
import { registerEtfAdminRoutes } from './etf-admin.js'
import { registerAgentStockRoutes } from './agent-stocks.js'
import { registerApiKeyRoutes } from './api-keys.js'
import { registerPartnerRoutes } from './partners.js'
import { registerDisciplineOg } from './discipline-og.js'
import { registerDisciplineRoutes } from './discipline.js'
import { registerPriceAlertRoutes } from './price-alerts.js'
import { registerAlertRoutes } from './alerts.js'
import { registerPerformanceRoute } from './performance.js'
import { registerPortfolioAttentionRoutes } from './portfolio-attention.js'
import { readPortfolioExposure } from './portfolio-exposure.js'
import { registerCompanyHubRoute } from './company-hub.js'
import { registerPostRoutes } from './posts.js'
import { createHash, randomBytes, randomUUID as nodeRandomUUID, timingSafeEqual } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import {
  apiErrorResponseSchema,
  authUserResponseSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  createDiaryRequestSchema,
  deleteDiaryResponseSchema,
  diaryByDateQuerySchema,
  loginRequestSchema,
  MAX_SERIALIZED_ID,
  authMutationResponseSchema,
  nativeAuthResponseSchema,
  nativeLoginRequestSchema,
  nativeLogoutRequestSchema,
  nativeRefreshRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  serializedIdSchema,
  updateDiaryRequestSchema,
  type ErrorCode,
  type NativeTokenPair,
} from '@diary/contracts'
import { recentClosedTradesQuerySchema } from '@diary/contracts/ledger'
import { apiKeyCredentials, refreshTokens, users, type Database } from '@diary/db'
import { currentUtcDate } from '@diary/domain'
import bcrypt from 'bcryptjs'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { updateUserSettingsSchema, userSettingsResponseSchema } from '@diary/contracts/settings'
import {
  ACCESS_COOKIE,
  ACCESS_SECONDS,
  REFRESH_COOKIE,
  REFRESH_SECONDS,
  authUser,
  createAuthSessionService,
  hashRefreshToken,
  nativeFamilyLock,
  type SessionUser,
  userSessionLock,
} from './auth-session.js'
import { getUserSettings, updateUserSettings } from './user-settings.js'
import { createMarketData, createYahooUpstream } from './market-data/index.js'
import { registerMarketRoutes } from './market-routes.js'
import { listDiaries, listDiarySummaries } from './diary-list.js'
import { diarySummaryListResponseSchema } from '@diary/contracts/diary-summary'
import { diaryActivity } from './diary-activity.js'
import { diaryActivityQuerySchema } from '@diary/contracts/diary-activity'
import { registerDiaryReviewRoutes } from './diary-review.js'
import { registerReviewQueueRoute } from './review-queue.js'
import { registerInvestmentThesisRoutes } from './investment-thesis.js'
import { registerStockNoteRoutes } from './stock-notes.js'
import { registerEvidenceRoutes } from './evidence.js'
import { registerWatchlistRoutes } from './watchlist.js'
import { registerTradePlanRoutes } from './trade-plans.js'
import { DiaryStockLimitError, listDiaryStocks } from './diary-stocks.js'
import { valuePortfolio, batchQuotePrices } from './portfolio.js'
import { exportClosedTrades, tradeExportFilename } from './trade-export.js'
import { createNagerHolidayProvider, registerHolidayRoutes, type HolidayProvider } from './holidays.js'
import { diaryListQuerySchema } from '@diary/contracts/diary-list'
import {
  createDiary,
  deleteDiary,
  findDiary,
  findDiaryByDate,
  findDiaryTransactions,
  listDiaryAlerts,
  serializeDiary,
  updateDiary,
} from './diary.js'
import { getHoldings, getRecentClosedTrades, LedgerValidationError } from './ledger.js'
import { listLinkedTradePlans } from './trade-plans.js'
import { registerSecFilingRoutes } from './sec-filings.js'
import { createSecEdgarService, type SecEdgarService } from './sec-edgar/service.js'
import { registerAdminUserRoutes } from './admin-users.js'

const CSRF_COOKIE = 'csrf-token'
const CSRF_HEADER = 'x-csrf-token'
const PUBLIC_STATE_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/native/login',
  '/api/auth/native/refresh',
  '/api/auth/native/logout',
])

export interface ApiConfig {
  jwtSecret: string
  nodeEnv: 'development' | 'test' | 'production'
  trustProxy: boolean
  webOrigin: string
  secUserAgent?: string
}

type AuthTransport = 'cookie' | 'bearer' | 'api-key'

export interface AppEnv {
  Variables: {
    requestId: string
    user: SessionUser
    apiKey: { id: string; userId: string; label: string; scope: 'DIARY_CREATE' | 'AGENT_WRITE' }
    authTransport: AuthTransport
  }
}

export interface AppDependencies {
  databasePool?: Pick<import('pg').Pool,'connect'>
  onAccountRevoked?: (userId: string) => void
  db: Database
  config: ApiConfig
  marketData?: ReturnType<typeof createMarketData>
  holidays?: HolidayProvider
  secFilings?: SecEdgarService
  now?: () => Date
  randomUUID?: () => string
  logger?: {
    error(message: string, context: Record<string, unknown>): void
    info?(message: string, context?: Record<string, unknown>): void
  }
}

interface ErrorDetail {
  field?: string
  message?: string
  value?: unknown
}

class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] | null = null,
  ) {
    super(message)
  }
}

function fail(status: number, code: ErrorCode, message: string, details: ErrorDetail[] | null = null): never {
  throw new ApiError(status, code, message, details)
}

function validationError(error: z.ZodError): never {
  fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  })))
}

async function parseJson<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  try {
    const result = schema.safeParse(await c.req.json())
    if (!result.success) validationError(result.error)
    return result.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ message: 'Request body must be valid JSON' }])
  }
}

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown }
  const direct = candidate.code === '23505' && (!constraint || candidate.constraint === constraint)
  return direct || (candidate.cause !== undefined && isUniqueViolation(candidate.cause, constraint))
}

function instant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

function databaseId(value: string): bigint | undefined {
  if (!serializedIdSchema.safeParse(value).success
    || value.length > MAX_SERIALIZED_ID.length
    || (value.length === MAX_SERIALIZED_ID.length && value > MAX_SERIALIZED_ID)) return undefined
  return BigInt(value)
}

function clientIp(c: Context<AppEnv>, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')
    const trusted = forwarded?.split(',').at(-1)?.trim()
    if (trusted) return trusted
  }
  return getConnInfo(c).remote.address ?? 'unknown'
}

export interface InMemoryRateLimiter {
  consume(key: string, points: number, now: number): void
  readonly size: number
}

export function createRateLimiter(options: { windowMs?: number; maxBuckets?: number } = {}): InMemoryRateLimiter {
  const windowMs = options.windowMs ?? 60_000
  const maxBuckets = options.maxBuckets ?? 10_000
  const attempts = new Map<string, number[]>()
  let nextCleanupAt = 0

  const cleanup = (now: number) => {
    const cutoff = now - windowMs
    for (const [key, timestamps] of attempts) {
      const recent = timestamps.filter((time) => time > cutoff)
      if (recent.length === 0) attempts.delete(key)
      else if (recent.length !== timestamps.length) attempts.set(key, recent)
    }
    nextCleanupAt = now + windowMs
  }

  return {
    consume(key, points, now) {
      if (now >= nextCleanupAt) cleanup(now)
      const recent = (attempts.get(key) ?? []).filter((time) => time > now - windowMs)
      if (recent.length >= points) fail(429, 'AUTH_RATE_LIMITED', 'Too many requests. Please try again later.', [{ message: 'Retry after 60 seconds' }])
      if (!attempts.has(key) && attempts.size >= maxBuckets) {
        // Fail closed rather than evicting active buckets and weakening rate limits.
        fail(429, 'AUTH_RATE_LIMITED', 'Too many requests. Please try again later.', [{ message: 'Retry after 60 seconds' }])
      }
      recent.push(now)
      attempts.set(key, recent)
    },
    get size() { return attempts.size },
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createApp({
  db,
  databasePool,
  config,
  now = () => new Date(),
  randomUUID = nodeRandomUUID,
  logger = console,
  marketData,
  holidays,
  secFilings,
  onAccountRevoked,
}: AppDependencies) {
  const rateLimiter = createRateLimiter()
  const app = new Hono<AppEnv>()

  const findUserByEmail = async (email: string) => {
    const [user] = await db.select().from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1)
    return user
  }

  const session = createAuthSessionService({ db, jwtSecret: config.jwtSecret, now, randomUUID, fail })

  const authCookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'Strict' as const,
    path: '/',
  }

  const setAccessCookie = (c: Context<AppEnv>, token: string) => {
    setCookie(c, ACCESS_COOKIE, token, { ...authCookieOptions, maxAge: ACCESS_SECONDS })
  }

  const clearAuthCookies = (c: Context<AppEnv>) => {
    deleteCookie(c, ACCESS_COOKIE, { path: '/' })
    deleteCookie(c, REFRESH_COOKIE, { path: '/' })
    deleteCookie(c, 'auth-token', { path: undefined })
    deleteCookie(c, 'auth-token', { path: '/' })
  }

  app.use('*', async (c, next) => {
    const incoming = c.req.header('x-request-id')
    const requestId = incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : randomUUID()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    const startedAt = Date.now()
    await next()
    if (config.nodeEnv === 'production') {
      logger.info?.(JSON.stringify({
        operation: 'http_request',
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      }))
    }
  })

  app.get('/healthz', c => c.json({ status: 'ok' }))
  app.get('/readyz', async c => {
    try {
      await db.execute(sql`select 1`)
      return c.json({ status: 'ready' })
    } catch {
      return c.json({ status: 'not_ready' }, 503)
    }
  })

  app.use('/api/*', cors({
    origin: config.webOrigin,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID', 'X-API-Key'],
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }))

  const authentication: MiddlewareHandler<AppEnv> = async (c, next) => {
    const authorization = c.req.header('authorization')
    const apiKey = c.req.header('x-api-key')
    if (authorization !== undefined || apiKey !== undefined) {
      if (authorization !== undefined && apiKey !== undefined) fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
      const match = authorization === undefined ? null : /^Bearer\s+(\S+)$/i.exec(authorization)
      if (authorization !== undefined && !match) fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
      const token = apiKey !== undefined ? apiKey.trim() : match![1]!
      if (apiKey !== undefined || token.startsWith('dva_')) {
        if (!/^dva_[0-9a-f]{48}$/.test(token)) fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
        const [credential] = await db.update(apiKeyCredentials).set({ lastUsedAt: now() }).where(and(eq(apiKeyCredentials.keyHash, createHash('sha256').update(token).digest('hex')), isNull(apiKeyCredentials.revokedAt))).returning({ id: apiKeyCredentials.id, userId: apiKeyCredentials.userId, label: apiKeyCredentials.label, scope: apiKeyCredentials.scope })
        if (!credential) fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
        c.set('apiKey', { ...credential, id: String(credential.id), userId: String(credential.userId) })
        c.set('authTransport', 'api-key')
      } else {
        c.set('user', await session.authenticateAccess(token))
        c.set('authTransport', 'bearer')
      }
      await next()
      return
    }

    // These handlers own their cookie semantics. In particular, logout must
    // still clear cookies when refresh-token persistence is unavailable.
    if (c.req.path === '/api/auth/refresh' || c.req.path === '/api/auth/logout') {
      await next()
      return
    }

    const accessToken = getCookie(c, ACCESS_COOKIE)
    const refreshToken = getCookie(c, REFRESH_COOKIE)
    if (accessToken) {
      let accessSession: SessionUser | undefined
      try {
        accessSession = await session.authenticateAccess(accessToken)
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'AUTH_TOKEN_INVALID') throw error
        // Invalid ambient access may still recover through the stable Web refresh session.
      }
      if (accessSession) {
        c.set('user', accessSession)
        c.set('authTransport', 'cookie')
        await next()
        return
      }
    }
    if (refreshToken) {
      try {
        const refreshed = await session.refreshWebSession(refreshToken)
        setAccessCookie(c, refreshed.accessToken)
        c.set('user', refreshed.sessionUser)
        c.set('authTransport', 'cookie')
      } catch (error) {
        // Invalid ambient cookies are anonymous; database failures remain 500.
        if (!(error instanceof ApiError) || error.statusCode !== 401) throw error
      }
    }
    await next()
  }
  app.use('/api/*', authentication)

  app.use('/api/*', async (c, next) => {
    const method = c.req.method.toUpperCase()
    if (!new Set(['POST', 'PUT', 'PATCH', 'DELETE']).has(method)) {
      if (!getCookie(c, CSRF_COOKIE)) {
        setCookie(c, CSRF_COOKIE, randomBytes(32).toString('hex'), {
          httpOnly: false,
          secure: config.nodeEnv === 'production',
          sameSite: 'Strict',
          maxAge: 86_400,
          path: '/',
        })
      }
      await next()
      return
    }

    if (c.get('authTransport') === 'bearer' || c.get('authTransport') === 'api-key' || PUBLIC_STATE_PATHS.has(c.req.path)) {
      await next()
      return
    }
    const cookie = getCookie(c, CSRF_COOKIE)
    const header = c.req.header(CSRF_HEADER)
    if (!cookie || !header || !safeEqual(cookie, header)) fail(403, 'CSRF_FAILED', 'CSRF token validation failed')
    await next()
  })

  const market = marketData ?? createMarketData({ upstream: createYahooUpstream(), now })
  registerMarketRoutes(app, {
    market,
    now,
    consume: (key, points, timestamp) => rateLimiter.consume(key, points, timestamp),
    clientIp: (c) => clientIp(c, config.trustProxy),
    fail,
    validationError,
  })
  registerSecFilingRoutes(app, {
    service: secFilings ?? createSecEdgarService(config.secUserAgent ?? ''),
    consume: (key, points, timestamp) => rateLimiter.consume(key, points, timestamp),
    clientIp: (c) => clientIp(c, config.trustProxy),
    now,
    fail,
    validationError,
  })

  app.get('/api/market/rotation-monitor',async c=>{
    c.header('Cache-Control','no-store');
    const query=marketRotationMonitorQuerySchema.safeParse(c.req.query());if(!query.success)return validationError(query.error);
    const context=await readRotationMonitor(db,query.data.scope,now().toISOString().slice(0,10));
    if(!context)return fail(404,'SYS_NOT_FOUND','No qualified rotation snapshots available');
    return c.json(marketRotationMonitorResponseSchema.parse(context.payload));
  })
  registerMarketStateRoutes(app, { db, fail, validationError })
  registerRotationAdmin(app,{run:databasePool?scope=>runRotationBatch({db,pool:databasePool,market,now},scope):undefined,parseJson,fail})
  registerEtfProfileRoutes(app, { market, now, validationError })
  registerEtfWatchlistRoutes(app, { db, now, fail, validationError, parseJson })
  registerEtfAdminRoutes(app, { db, now, market, fail, validationError, parseJson })
  registerHolidayRoutes(app, { holidays: holidays ?? createNagerHolidayProvider(), fail, validationError })
  registerDiaryReviewRoutes(app, { db, now, fail, validationError, parseJson })
  registerTradePlanRoutes(app, { db, now, fail, validationError, parseJson })
  registerWatchlistRoutes(app, { db, now, fail, validationError, parseJson })
  registerEvidenceRoutes(app, { db, now, fail, validationError, parseJson })
  registerStockNoteRoutes(app, { db, now, fail, validationError, parseJson })
  registerInvestmentThesisRoutes(app, { db, now, fail, validationError, parseJson })
  registerReviewQueueRoute(app, { db, now, fail, validationError })
  registerDisciplineOg(app)
  registerAgentStockRoutes(app, { db, now, fail, validationError, parseJson })
  registerApiKeyRoutes(app, { db, now, fail, validationError, parseJson, consume: (key, points, timestamp) => rateLimiter.consume(key, points, timestamp) })
  registerPartnerRoutes(app, { db, now, fail, validationError, parseJson })
  registerDisciplineRoutes(app, { db, now, fail, validationError, parseJson })
  registerPriceAlertRoutes(app, { db, now, fail, validationError, parseJson })
  registerAlertRoutes(app, { db, now, fail, validationError, parseJson })
  registerPerformanceRoute(app, { db, fail, validationError })
  registerPortfolioAttentionRoutes(app, { db, now, market, fail, validationError })
  registerCompanyHubRoute(app, { db, now, market, fail, validationError })
  registerPostRoutes(app, { db, now, fail, validationError, parseJson })
  registerAdminUserRoutes(app, { db, now, onAccountRevoked, fail, validationError, parseJson })

  app.post('/api/auth/register', async (c) => {
    const ip = clientIp(c, config.trustProxy)
    rateLimiter.consume(`register:ip:${ip}`, 3, now().getTime())
    const input = await parseJson(c, registerRequestSchema)
    rateLimiter.consume(`register:email:${input.email.trim().toLowerCase()}`, 3, now().getTime())

    if (await findUserByEmail(input.email)) fail(409, 'USER_EMAIL_EXISTS', `Email ${input.email} already registered`)
    try {
      const [user] = await db.insert(users).values({
        email: input.email,
        password: await bcrypt.hash(input.password, 10),
        name: input.name,
      }).returning()
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
    rateLimiter.consume(`login:ip:${ip}`, 5, now().getTime())
    const input = await parseJson(c, loginRequestSchema)
    rateLimiter.consume(`login:email:${input.email.trim().toLowerCase()}`, 5, now().getTime())
    const user = await findUserByEmail(input.email)
    if (!user || !await bcrypt.compare(input.password, user.password)) {
      fail(401, 'AUTH_LOGIN_INVALID_CREDENTIALS', 'Invalid email or password')
    }

    const result = await session.createLoginSession({
      candidate: user, password: input.password, clientType: 'WEB',
    })
    if (result.clientType !== 'WEB') throw new Error('Unexpected login session type')
    setAccessCookie(c, result.accessToken)
    setCookie(c, REFRESH_COOKIE, result.refreshToken, { ...authCookieOptions, maxAge: REFRESH_SECONDS })
    return c.json(authUserResponseSchema.parse({ ok: true, data: authUser(result.user) }), 200)
  })

  app.post('/api/auth/refresh', async (c) => {
    if (c.get('authTransport') && c.get('authTransport') !== 'cookie') {
      fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
    }
    const refreshToken = getCookie(c, REFRESH_COOKIE)
    if (!refreshToken) fail(401, 'AUTH_NO_REFRESH_TOKEN', 'No refresh token provided')
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
    rateLimiter.consume(`login:ip:${ip}`, 5, now().getTime())
    const input = await parseJson(c, nativeLoginRequestSchema)
    rateLimiter.consume(`login:email:${input.email.trim().toLowerCase()}`, 5, now().getTime())
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
    const timestamp = now().getTime()
    rateLimiter.consume(`refresh:ip:${clientIp(c, config.trustProxy)}`, 10, timestamp)
    rateLimiter.consume(`refresh:token:${tokenHash.slice(0, 24)}`, 10, timestamp)
    const payload = await session.verifyRefreshToken(input.refreshToken)

    const [stored] = await db.select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      clientType: refreshTokens.clientType,
      familyId: refreshTokens.familyId,
      deviceName: refreshTokens.deviceName,
      revokedAt: refreshTokens.revokedAt,
      expiresAt: refreshTokens.expiresAt,
      user: users,
    }).from(refreshTokens)
      .innerJoin(users, eq(users.id, refreshTokens.userId))
      .where(eq(refreshTokens.token, tokenHash))
      .limit(1)

    if (!stored || stored.clientType !== 'NATIVE') fail(401, 'AUTH_TOKEN_NOT_FOUND', 'Token not found')

    type RefreshOutcome =
      | { ok: true; pair: NativeTokenPair }
      | { ok: false; reason: 'not-found' | 'revoked' | 'expired' }

    const outcome: RefreshOutcome = await db.transaction(async (tx) => {
      // Account-wide operations serialize before family-specific rotation.
      await tx.execute(userSessionLock(stored.userId))
      // Every mutation in one native family takes this transaction-scoped lock.
      // The post-lock read gets a fresh READ COMMITTED snapshot, so replay/logout
      // sees any descendant committed by the previous lock holder.
      await tx.execute(nativeFamilyLock(stored.familyId))
      const [current] = await tx.select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        clientType: refreshTokens.clientType,
        familyId: refreshTokens.familyId,
        deviceName: refreshTokens.deviceName,
        revokedAt: refreshTokens.revokedAt,
        expiresAt: refreshTokens.expiresAt,
        user: users,
      }).from(refreshTokens)
        .innerJoin(users, eq(users.id, refreshTokens.userId))
        .where(eq(refreshTokens.id, stored.id))
        .limit(1)

      if (!current || current.clientType !== 'NATIVE') return { ok: false, reason: 'not-found' }
      if (current.revokedAt) {
        await tx.update(refreshTokens).set({
          revokedAt: now(), revocationReason: 'REUSE_DETECTED',
        }).where(and(
          eq(refreshTokens.userId, current.userId),
          eq(refreshTokens.familyId, current.familyId),
          eq(refreshTokens.clientType, 'NATIVE'),
          isNull(refreshTokens.revokedAt),
        ))
        return { ok: false, reason: 'revoked' }
      }

      const operationNow = now()
      if (current.expiresAt <= operationNow) {
        await tx.update(refreshTokens).set({
          revokedAt: operationNow, revocationReason: 'EXPIRED',
        }).where(and(eq(refreshTokens.id, current.id), isNull(refreshTokens.revokedAt)))
        return { ok: false, reason: 'expired' }
      }
      if (current.user.tokenVersion !== payload.tokenVersion || current.user.id.toString() !== payload.id) {
        return { ok: false, reason: 'revoked' }
      }

      const replacementMaterial = await session.buildNativeTokenPair(current.user)
      await tx.update(refreshTokens).set({
        revokedAt: operationNow, revocationReason: 'ROTATED',
      }).where(eq(refreshTokens.id, current.id))
      const [replacement] = await tx.insert(refreshTokens).values({
        token: hashRefreshToken(replacementMaterial.rawRefreshToken),
        userId: current.userId,
        clientType: 'NATIVE',
        familyId: current.familyId,
        deviceName: current.deviceName,
        parentId: current.id,
        expiresAt: replacementMaterial.refreshExpiresAt,
      }).returning({ id: refreshTokens.id })
      if (!replacement) throw new Error('Refresh replacement insert returned no row')
      await tx.update(refreshTokens).set({ replacementId: replacement.id })
        .where(eq(refreshTokens.id, current.id))
      return { ok: true, pair: replacementMaterial.pair }
    })

    if (!outcome.ok) {
      if (outcome.reason === 'not-found') fail(401, 'AUTH_TOKEN_NOT_FOUND', 'Token not found')
      if (outcome.reason === 'expired') fail(401, 'AUTH_TOKEN_EXPIRED', 'Token expired')
      fail(401, 'AUTH_TOKEN_REVOKED', 'Token has been revoked')
    }
    return c.json(nativeAuthResponseSchema.parse({ ok: true, data: outcome.pair }), 200)
  })

  app.post('/api/auth/native/logout', async (c) => {
    const input = await parseJson(c, nativeLogoutRequestSchema)
    const tokenHash = hashRefreshToken(input.refreshToken)
    const [stored] = await db.select({
      userId: refreshTokens.userId,
      familyId: refreshTokens.familyId,
      clientType: refreshTokens.clientType,
    }).from(refreshTokens).where(eq(refreshTokens.token, tokenHash)).limit(1)
    if (stored?.clientType === 'NATIVE') {
      await db.transaction(async (tx) => {
        await tx.execute(userSessionLock(stored.userId))
        await tx.execute(nativeFamilyLock(stored.familyId))
        await tx.update(refreshTokens).set({
          revokedAt: now(), revocationReason: 'LOGOUT',
        }).where(and(
          eq(refreshTokens.userId, stored.userId),
          eq(refreshTokens.familyId, stored.familyId),
          eq(refreshTokens.clientType, 'NATIVE'),
          isNull(refreshTokens.revokedAt),
        ))
      })
    }
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
    const timestamp = now().getTime()
    rateLimiter.consume(`password:ip:${clientIp(c, config.trustProxy)}`, 3, timestamp)
    rateLimiter.consume(`password:user:${authenticated.id}`, 3, timestamp)
    const input = await parseJson(c, changePasswordRequestSchema)
    await session.changePassword(BigInt(authenticated.id), input.currentPassword, input.newPassword)
    onAccountRevoked?.(authenticated.id)
    clearAuthCookies(c)
    return c.json(changePasswordResponseSchema.parse({
      success: true,
      message: 'Password changed successfully. Please login again.',
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

  app.post('/api/agent/diaries', async c => {
    const key = c.get('apiKey')
    if (!key) fail(401, 'AUTH_TOKEN_INVALID', 'API key required')
    const input = await parseJson(c, createDiaryRequestSchema)
    if (input.appendToToday) fail(400, 'SYS_VALIDATION_ERROR', 'appendToToday is not available for API key diary creation')
    const diaryDate = input.date ?? currentUtcDate(now())
    try {
      const result = await createDiary(db, BigInt(key.userId), input, diaryDate, now, { createdVia: 'API_KEY', createdByLabel: key.label })
      c.header('Cache-Control', 'no-store')
      return c.json(serializeDiary(result.diary, false, result.transactions, [], result.stockSymbols, result.alerts), 201)
    } catch (error) {
      if (isUniqueViolation(error, 'diaries_user_date_key')) fail(409, 'DIARY_ALREADY_EXISTS', `Diary already exists for ${diaryDate}`)
      if (error instanceof LedgerValidationError) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      throw error
    }
  })

  app.post('/api/diaries', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const input = await parseJson(c, createDiaryRequestSchema)
    const diaryDate = input.date ?? currentUtcDate(now())
    try {
      const result = await createDiary(db, BigInt(session.id), input, diaryDate, now)
      return c.json(serializeDiary(result.diary, false, result.transactions, [], result.stockSymbols, result.alerts), 201)
    } catch (error) {
      if (isUniqueViolation(error, 'diaries_user_date_key')) fail(409, 'DIARY_ALREADY_EXISTS', `Diary already exists for ${diaryDate}`)
      if (error instanceof DiaryStockLimitError) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'stockSymbols', message: error.message }])
      if (error instanceof LedgerValidationError) {
        fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      }
      throw error
    }
  })

  app.get('/api/diaries', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryListQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(await listDiaries(db, BigInt(session.id), query.data, now()))
  })

  app.get('/api/diaries/activity', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryActivityQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(await diaryActivity(db, BigInt(session.id), query.data.dateFrom, query.data.dateTo))
  })

  app.get('/api/diaries/by-date', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryByDateQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    const diary = await findDiaryByDate(db, query.data.date, BigInt(session.id))
    if (!diary) return c.json(null, 200)
    const transactionRows = await findDiaryTransactions(db, diary.id, BigInt(session.id))
    const stockSymbols = (await listDiaryStocks(db, BigInt(session.id), [diary.id])).map(row => row.symbol)
    return c.json(serializeDiary(diary, false, transactionRows, [], stockSymbols, await listDiaryAlerts(db, BigInt(session.id), [diary.id])), 200)
  })

  // Summary discovery feed; registered before '/api/diaries/:id' so the
  // parameterized route never swallows the literal 'summary' segment.
  app.get('/api/diaries/summary', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = diaryListQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(diarySummaryListResponseSchema.parse(await listDiarySummaries(db, BigInt(session.id), query.data, now())))
  })

  app.get('/api/diaries/:id', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = c.req.param('id')
    if (!serializedIdSchema.safeParse(id).success) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'id', message: 'Invalid id', value: id }])
    const parsedId = databaseId(id)
    if (parsedId === undefined) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    const diary = await findDiary(db, parsedId, BigInt(session.id))
    if (!diary) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    const transactionRows = await findDiaryTransactions(db, diary.id, BigInt(session.id))
    const planRows = await listLinkedTradePlans(db, BigInt(session.id), [diary.id])
    const stockSymbols = (await listDiaryStocks(db, BigInt(session.id), [diary.id])).map(row => row.symbol)
    return c.json(serializeDiary(diary, true, transactionRows, planRows, stockSymbols, await listDiaryAlerts(db, BigInt(session.id), [diary.id])), 200)
  })

  app.put('/api/diaries/:id', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = c.req.param('id')
    if (!serializedIdSchema.safeParse(id).success) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'id', message: 'Invalid id', value: id }])
    const parsedId = databaseId(id)
    if (parsedId === undefined) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    const input = await parseJson(c, updateDiaryRequestSchema)
    try {
      const result = await updateDiary(db, parsedId, BigInt(session.id), input, now())
      if (!result) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
      const planRows = await listLinkedTradePlans(db, BigInt(session.id), [result.diary.id])
      return c.json(serializeDiary(result.diary, true, result.transactions, planRows, result.stockSymbols, result.alerts), 200)
    } catch (error) {
      if (isUniqueViolation(error, 'diaries_user_date_key')) {
        fail(409, 'DIARY_ALREADY_EXISTS', `Diary already exists for ${input.date}`)
      }
      if (error instanceof LedgerValidationError) {
        fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      }
      throw error
    }
  })

  app.delete('/api/diaries/:id', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = c.req.param('id')
    if (!serializedIdSchema.safeParse(id).success) fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'id', message: 'Invalid id', value: id }])
    const parsedId = databaseId(id)
    if (parsedId === undefined) fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
    try {
      if (!await deleteDiary(db, parsedId, BigInt(session.id))) {
        fail(404, 'DIARY_NOT_FOUND', `Diary ${id} not found`)
      }
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        fail(400, 'SYS_VALIDATION_ERROR', 'Validation failed', [{ field: 'transactions', message: error.message }])
      }
      throw error
    }
    return c.json(deleteDiaryResponseSchema.parse({ success: true }), 200)
  })

  app.get('/api/stocks/exposure', async c => {
    c.header('Cache-Control', 'no-store')
    const user = c.get('user'); if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return c.json(await readPortfolioExposure(db, BigInt(user.id), now().toISOString().slice(0, 10)))
  })

  app.get('/api/stocks/holdings', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return c.json(await getHoldings(db, BigInt(session.id)), 200)
  })

  app.get('/api/stocks/portfolio', async c => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    c.header('Cache-Control', 'no-store')
    return c.json(await valuePortfolio(db, BigInt(session.id), market, now()))
  })

  app.post('/api/stocks/prices', async c => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const input = await parseJson(c, z.object({ symbols: z.array(z.string().max(32)).min(1).max(25) }).strict())
    rateLimiter.consume(`market:ip:${clientIp(c, config.trustProxy)}`, 60, now().getTime())
    const quotes = await batchQuotePrices(market, input.symbols)
    if (Object.keys(quotes).length === 0) fail(502, 'SYS_EXTERNAL_SERVICE_ERROR', 'Prices unavailable. Please try again later.')
    c.header('Cache-Control', 'no-store')
    return c.json(quotes)
  })

  app.get('/api/stats/recent-trades', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = recentClosedTradesQuerySchema.safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    return c.json(await getRecentClosedTrades(db, BigInt(session.id), query.data, now()), 200)
  })

  app.get('/api/stats/export-trades', async (c) => {
    const session = c.get('user')
    if (!session) fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const query = z.object({ symbol: z.string().trim().max(20).transform(value => value.toUpperCase()).optional() }).strict().safeParse(c.req.query())
    if (!query.success) validationError(query.error)
    const csv = await exportClosedTrades(db, BigInt(session.id), query.data.symbol)
    c.header('Content-Type', 'text/csv; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="${tradeExportFilename(now(), query.data.symbol)}"`)
    c.header('Cache-Control', 'no-store')
    return c.body(csv)
  })

  app.notFound((c) => {
    const error = new ApiError(404, 'SYS_NOT_FOUND', 'Resource not found')
    return c.json(apiErrorResponseSchema.parse({
      statusCode: error.statusCode,
      statusMessage: error.message,
      data: { code: error.code, details: null, requestId: c.get('requestId') },
    }), 404)
  })

  app.onError((error, c) => {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError(500, 'SYS_INTERNAL_ERROR', 'Internal server error')
    const body = apiErrorResponseSchema.parse({
      statusCode: apiError.statusCode,
      statusMessage: apiError.message,
      data: { code: apiError.code, details: apiError.details, requestId: c.get('requestId') },
    })
    return c.json(body, apiError.statusCode as 400)
  })

  return app
}
