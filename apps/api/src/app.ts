import { createHash, randomBytes, randomUUID as nodeRandomUUID } from 'node:crypto'
import { apiErrorResponseSchema } from '@diary/contracts'
import { apiKeyCredentials, users, type Database } from '@diary/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  ACCESS_COOKIE,
  ACCESS_SECONDS,
  REFRESH_COOKIE,
  REFRESH_SECONDS,
  createAuthSessionService,
  type SessionUser,
} from './auth-session.js'
import { createMarketData, createYahooUpstream } from './market-data/index.js'
import { safeErrorContext } from './diagnostics.js'
import { registerAuthRoutes } from './auth-routes.js'
import { registerDiaryRoutes } from './diary-routes.js'
import { registerPortfolioRoutes } from './portfolio-routes.js'
import type { HolidayProvider } from './holidays.js'
import type { SecEdgarService } from './sec-edgar/service.js'
import type { AiTransport } from './ai-reports/outbound-policy.js'
import type {
  ResearchEvidenceProvider,
  ResearchLatestCompletedSession,
  ResearchTransport,
} from './research-studio/service.js'
import {
  createLatestCompletedUsEquitySessionResolver,
  createResearchEvidenceProvider,
  createTavilySearchProvider,
  createVerifiedUsEquityCalendarProvider,
} from './research-studio/sources.js'
import { createOpenRouterResearchTransport } from './research-studio/transport.js'
import { TAVILY_SEARCH_POLICY } from './research-studio/source-policy.js'
import type { OfficialResearchSourceInput } from './research-studio/sources.js'
import { createPostgresTavilySearchBudget } from './research-studio/search-budget.js'
import type { SmtpKeyring } from './account-email/secrets.js'
import type { SmtpTransportFactory } from './account-email/smtp.js'
import {
  createMemoryRateLimitRuntime,
  RATE_LIMIT_POLICIES,
  RateLimitStoreUnavailableError,
  rateLimitKey,
} from './rate-limit/index.js'
import type { RateLimitPolicy, RateLimitResult, RateLimitRuntime } from './rate-limit/index.js'
import { requestBodyLengthLimit, requestBodyLimit, RequestBodyLimitError } from './request-body-limit.js'
import { responseCompression } from './response-compression.js'
// Route surfaces, in the order the composition root registers them.
import type { SurfaceContext } from './surfaces/context.js'
import { registerMarketSurface } from './surfaces/market-surface.js'
import { registerDiarySurface } from './surfaces/diary-surface.js'
import { registerAccountSurface } from './surfaces/account-surface.js'
import { registerPerformanceSurface } from './surfaces/performance-surface.js'
import { registerPublishingSurface } from './surfaces/publishing-surface.js'
import { registerAdminSurface } from './surfaces/admin-surface.js'
import { registerGuruSurface } from './surfaces/guru-surface.js'
import { registerInstitutionalSurface } from './surfaces/institutional-surface.js'
import { registerAiSurface } from './surfaces/ai-surface.js'
import { registerAccountEmailSurface } from './surfaces/account-email-surface.js'
import { registerResearchSurface } from './surfaces/research-surface.js'
import {
  ApiError,
  clientIp,
  CSRF_COOKIE,
  CSRF_HEADER,
  fail,
  PUBLIC_STATE_PATHS,
  safeEqual,
  type ApiConfig,
  type AppEnv,
} from './app-context.js'
export { resolveClientIp } from './app-context.js'
export type { ApiConfig, AppEnv } from './app-context.js'

export interface AppDependencies {
  databasePool?: Pick<import('pg').Pool, 'connect'>
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
  aiTransport?: AiTransport
  researchTransport?: ResearchTransport
  researchEvidenceProvider?: ResearchEvidenceProvider
  researchLatestCompletedSession?: ResearchLatestCompletedSession
  allowSyntheticEvidence?: boolean
  researchOfficialSources?: readonly OfficialResearchSourceInput[]
  smtpTransportFactory?: SmtpTransportFactory
  smtpKeyring?: SmtpKeyring
  smtpHostLookup?: (hostname: string) => Promise<string[]>
  smtpAllowedPrivateHosts?: string
  rateLimiter?: RateLimitRuntime
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
  aiTransport,
  researchTransport,
  researchEvidenceProvider,
  researchLatestCompletedSession,
  allowSyntheticEvidence = false,
  researchOfficialSources,
  smtpTransportFactory,
  smtpKeyring,
  smtpHostLookup,
  smtpAllowedPrivateHosts,
  rateLimiter: injectedRateLimiter,
}: AppDependencies) {
  const rateLimiter = injectedRateLimiter ?? createMemoryRateLimitRuntime()
  const app = new Hono<AppEnv>()
  const lastRateLimitLogAt = new Map<string, number>()

  const consumeRateLimit = async (
    context: Context<AppEnv>,
    policy: RateLimitPolicy,
    scope: string,
    identity: string,
  ) => {
    const timestamp = now().getTime()
    let result: RateLimitResult
    try {
      result = await rateLimiter.consume(rateLimitKey(policy.name, scope, identity), {
        limit: policy.limit,
        windowMs: policy.windowMs,
        now: timestamp,
      })
    } catch (error) {
      if (!(error instanceof RateLimitStoreUnavailableError)) throw error
      context.set('rateLimitBackendUnavailable', true)
      fail(503, 'SYS_EXTERNAL_SERVICE_ERROR', 'Service temporarily unavailable.')
    }
    if (result.allowed) return
    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
    context.set('rateLimitRetryAfterSeconds', retryAfterSeconds)
    const logKey = `${policy.name}:${scope}`
    if (timestamp - (lastRateLimitLogAt.get(logKey) ?? Number.NEGATIVE_INFINITY) >= 60_000) {
      lastRateLimitLogAt.set(logKey, timestamp)
      logger.info?.(
        JSON.stringify({
          operation: 'rate_limit_rejected',
          limiter: policy.name,
          scopeType: scope,
          requestId: context.get('requestId'),
          backend: rateLimiter.backend,
        }),
      )
    }
    fail(429, 'AUTH_RATE_LIMITED', 'Too many requests. Please try again later.', [
      { message: `Retry after ${retryAfterSeconds} seconds` },
    ])
  }

  const findUserByEmail = async (email: string) => {
    const [user] = await db
      .select()
      .from(users)
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

  const setRefreshCookie = (c: Context<AppEnv>, token: string) => {
    setCookie(c, REFRESH_COOKIE, token, { ...authCookieOptions, maxAge: REFRESH_SECONDS })
  }

  const clearAuthCookies = (c: Context<AppEnv>) => {
    deleteCookie(c, ACCESS_COOKIE, { path: '/' })
    deleteCookie(c, REFRESH_COOKIE, { path: '/' })
    deleteCookie(c, 'auth-token', { path: undefined })
    deleteCookie(c, 'auth-token', { path: '/' })
  }

  // Compression is transport-level, so it sits outside everything the
  // application logs and serves.
  app.use('*', responseCompression())

  app.use('*', async (c, next) => {
    const incoming = c.req.header('x-request-id')
    const requestId = incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : randomUUID()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    const startedAt = Date.now()
    await next()
    if (config.nodeEnv === 'production') {
      logger.info?.(
        JSON.stringify({
          operation: 'http_request',
          requestId,
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          durationMs: Date.now() - startedAt,
        }),
      )
    }
  })

  // Reject declared oversized bodies before authentication; the bounded read
  // runs after authentication so API-key revocation can observe the request.
  app.use('/api/*', requestBodyLengthLimit())

  app.get('/healthz', c => c.json({ status: 'ok' }))
  app.get('/readyz', async c => {
    try {
      await db.execute(sql`select 1`)
      if (rateLimiter.mode === 'redis' && !rateLimiter.ready) return c.json({ status: 'not_ready' }, 503)
      if (rateLimiter.mode === 'auto' && rateLimiter.degraded) return c.json({ status: 'ready', rateLimit: 'degraded' })
      return c.json({ status: 'ready' })
    } catch {
      return c.json({ status: 'not_ready' }, 503)
    }
  })

  app.use(
    '/api/*',
    cors({
      origin: config.webOrigin,
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-ID', 'X-API-Key'],
      allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  )

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
        const [credential] = await db
          .update(apiKeyCredentials)
          .set({ lastUsedAt: now() })
          .where(
            and(
              eq(apiKeyCredentials.keyHash, createHash('sha256').update(token).digest('hex')),
              isNull(apiKeyCredentials.revokedAt),
            ),
          )
          .returning({
            id: apiKeyCredentials.id,
            userId: apiKeyCredentials.userId,
            label: apiKeyCredentials.label,
            scope: apiKeyCredentials.scope,
          })
        if (!credential) fail(401, 'AUTH_TOKEN_INVALID', 'Invalid token')
        c.set('apiKey', { ...credential, id: String(credential.id), userId: String(credential.userId) })
        c.set('authTransport', 'api-key')
        await consumeRateLimit(c, RATE_LIMIT_POLICIES.apiKeyRequest, 'api_key', String(credential.id))
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

    if (
      c.get('authTransport') === 'bearer' ||
      c.get('authTransport') === 'api-key' ||
      PUBLIC_STATE_PATHS.has(c.req.path)
    ) {
      await next()
      return
    }
    const cookie = getCookie(c, CSRF_COOKIE)
    const header = c.req.header(CSRF_HEADER)
    if (!cookie || !header || !safeEqual(cookie, header)) fail(403, 'CSRF_FAILED', 'CSRF token validation failed')
    await next()
  })

  app.use('/api/*', requestBodyLimit())
  // --- Shared services ------------------------------------------------------
  // Composed here because more than one surface needs them, or because they are
  // injectable for tests. Anything a single surface owns is composed there.

  const market = marketData ?? createMarketData({ upstream: createYahooUpstream(), now })
  const researchCalendar = createVerifiedUsEquityCalendarProvider()
  const researchSearchBudget = createPostgresTavilySearchBudget(db)
  const evidenceProvider =
    researchEvidenceProvider ??
    createResearchEvidenceProvider({
      market,
      calendar: researchCalendar,
      now,
      officialSources: researchOfficialSources,
      search: {
        // A prepare makes one search call. Create its bounded adapter per call so
        // the adapter-local maxCallsPerRun counter cannot leak across runs.
        provider: {
          search(query, signal) {
            return createTavilySearchProvider({
              apiKey: process.env.TAVILY_API_KEY,
              policy: TAVILY_SEARCH_POLICY,
              now,
              budget: researchSearchBudget,
            }).search(query, signal)
          },
        },
        policy: TAVILY_SEARCH_POLICY,
        query: instrument => `${instrument.symbol} ${instrument.name} recent official events and news`,
      },
    })
  // Shared by the research and publishing surfaces: an article's figures are
  // stated as of a completed session, not as of now.
  const latestResearchSession =
    researchLatestCompletedSession ?? createLatestCompletedUsEquitySessionResolver(researchCalendar)

  const surface: SurfaceContext = {
    db,
    config,
    now,
    logger,
    market,
    consume: consumeRateLimit,
    clientIp: c => clientIp(c, config.trustProxy),
  }

  // --- Route surfaces -------------------------------------------------------
  // Hono matches in registration order, so this list is behaviour. Keep it in
  // this order and keep each surface's internal order; the frozen surface in
  // tests/unit/api-route-order.test.ts is what makes a reordering visible.

  registerMarketSurface(app, surface, { secFilings, holidays, databasePool })
  registerDiarySurface(app, surface)
  registerAccountSurface(app, surface)
  registerPerformanceSurface(app, surface)
  registerPublishingSurface(app, surface, { latestCompletedSession: latestResearchSession })
  registerAdminSurface(app, surface, { onAccountRevoked })
  registerGuruSurface(app, surface)
  registerInstitutionalSurface(app, surface)
  registerAiSurface(app, surface, { aiTransport })
  // Returns the lifecycle the auth surface needs, which is why it precedes it.
  const accountEmailLifecycle = registerAccountEmailSurface(app, surface, {
    databasePool,
    onAccountRevoked,
    clearAuthCookies,
    smtpTransportFactory,
    smtpKeyring,
    smtpHostLookup,
    smtpAllowedPrivateHosts,
  })
  registerResearchSurface(app, surface, {
    transport: researchTransport ?? createOpenRouterResearchTransport(aiTransport),
    evidenceProvider,
    latestCompletedSession: latestResearchSession,
    allowSyntheticEvidence,
    researchOfficialSources,
  })

  // These three stay in the root: each closes over session state the root owns
  // — the session service, the auth cookie writers, and the rate limiter.
  registerAuthRoutes(app, {
    db,
    config,
    now,
    logger,
    session,
    accountEmailLifecycle,
    findUserByEmail,
    setAccessCookie,
    setRefreshCookie,
    clearAuthCookies,
    ...(onAccountRevoked ? { onAccountRevoked } : {}),
    consume: consumeRateLimit,
  })

  // Literal diary segments must register before the `:id` parameter route;
  // diary-routes.ts:1-6 owns that constraint internally.
  registerDiaryRoutes(app, { db, now })

  registerPortfolioRoutes(app, { db, config, now, market, consume: consumeRateLimit })

  app.notFound(c => {
    const error = new ApiError(404, 'SYS_NOT_FOUND', 'Resource not found')
    return c.json(
      apiErrorResponseSchema.parse({
        statusCode: error.statusCode,
        statusMessage: error.message,
        data: { code: error.code, details: null, requestId: c.get('requestId') },
      }),
      404,
    )
  })

  app.onError((error, c) => {
    const apiError =
      error instanceof RequestBodyLimitError
        ? new ApiError(413, 'SYS_VALIDATION_ERROR', error.message)
        : error instanceof ApiError
          ? error
          : new ApiError(500, 'SYS_INTERNAL_ERROR', 'Internal server error')
    if (apiError.statusCode === 429 && apiError.code === 'AUTH_RATE_LIMITED') {
      c.header('Retry-After', String(c.get('rateLimitRetryAfterSeconds') ?? 60))
    }
    if (apiError.statusCode >= 500 && !c.get('rateLimitBackendUnavailable')) {
      logger.error('Unhandled API request error', {
        operation: 'http_request',
        requestId: c.get('requestId'),
        method: c.req.method,
        path: c.req.path,
        ...safeErrorContext(error, { codeField: 'databaseCode' }),
      })
    }
    const body = apiErrorResponseSchema.parse({
      statusCode: apiError.statusCode,
      statusMessage: apiError.message,
      data: { code: apiError.code, details: apiError.details, requestId: c.get('requestId') },
    })
    return c.json(body, apiError.statusCode as 400)
  })

  return app
}
