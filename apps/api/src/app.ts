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
import { registerCompanyHubRoute } from './company-hub.js'
import { registerPostRoutes } from './posts.js'
import { registerAuthRoutes } from './auth-routes.js'
import { registerDiaryRoutes } from './diary-routes.js'
import { registerPortfolioRoutes } from './portfolio-routes.js'
import { registerArticleTranslationRoutes } from './article-translations/routes.js'
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
import { registerMarketRoutes } from './market-routes.js'
import { registerDiaryReviewRoutes } from './diary-review.js'
import { registerReviewQueueRoute } from './review-queue.js'
import { registerActivityTimelineRoute } from './activity-timeline.js'
import { registerInvestmentThesisRoutes } from './investment-thesis.js'
import { registerStockNoteRoutes } from './stock-notes.js'
import { registerEvidenceRoutes } from './evidence.js'
import { registerWatchlistRoutes } from './watchlist.js'
import { registerDiarySavedViewRoutes } from './diary-saved-views.js'
import { registerTradePlanRoutes } from './trade-plans.js'
import { createNagerHolidayProvider, registerHolidayRoutes, type HolidayProvider } from './holidays.js'
import { registerSecFilingRoutes } from './sec-filings.js'
import { createSecEdgarService, type SecEdgarService } from './sec-edgar/service.js'
import { registerAdminUserRoutes } from './admin-users.js'
import { registerAiReportRoutes } from './ai-reports/routes.js'
import { registerAiAdminRoutes } from './ai-reports/admin-routes.js'
import { AiReportService } from './ai-reports/report-service.js'
import type { AiTransport } from './ai-reports/outbound-policy.js'
import { registerAchievementRoutes } from './achievements.js'
import { registerGoalRoutes } from './goals.js'
import { registerResearchRoutes } from './research-studio/routes.js'
import type { ResearchEvidenceProvider, ResearchLatestCompletedSession, ResearchTransport } from './research-studio/service.js'
import { createLatestCompletedUsEquitySessionResolver, createResearchEvidenceProvider, createTavilySearchProvider, createVerifiedUsEquityCalendarProvider } from './research-studio/sources.js'
import { createOpenRouterResearchTransport } from './research-studio/transport.js'
import { TAVILY_SEARCH_POLICY } from './research-studio/source-policy.js'
import type { OfficialResearchSourceInput } from './research-studio/sources.js'
import { createPostgresTavilySearchBudget } from './research-studio/search-budget.js'
import { registerAccountEmailPublicRoutes } from './account-email/public-routes.js'
import { registerAccountEmailAdminRoutes } from './account-email/admin-routes.js'
import type { SmtpKeyring } from './account-email/secrets.js'
import type { SmtpTransportFactory } from './account-email/smtp.js'
import { createMemoryRateLimitRuntime, RATE_LIMIT_POLICIES, RateLimitStoreUnavailableError, rateLimitKey } from './rate-limit/index.js'
import type { RateLimitPolicy, RateLimitResult, RateLimitRuntime } from './rate-limit/index.js'
import { requestBodyLengthLimit, requestBodyLimit, RequestBodyLimitError } from './request-body-limit.js'
import {
  ApiError,
  clientIp,
  CSRF_COOKIE,
  CSRF_HEADER,
  fail,
  parseJson,
  PUBLIC_STATE_PATHS,
  safeEqual,
  validationError,
  type ApiConfig,
  type AppEnv,
} from './app-context.js'

export { resolveClientIp } from './app-context.js'
export type { ApiConfig, AppEnv } from './app-context.js'

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
      logger.info?.(JSON.stringify({
        operation: 'rate_limit_rejected',
        limiter: policy.name,
        scopeType: scope,
        requestId: context.get('requestId'),
        backend: rateLimiter.backend,
      }))
    }
    fail(429, 'AUTH_RATE_LIMITED', 'Too many requests. Please try again later.', [{ message: `Retry after ${retryAfterSeconds} seconds` }])
  }

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

  const setRefreshCookie = (c: Context<AppEnv>, token: string) => {
    setCookie(c, REFRESH_COOKIE, token, { ...authCookieOptions, maxAge: REFRESH_SECONDS })
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

    if (c.get('authTransport') === 'bearer' || c.get('authTransport') === 'api-key' || PUBLIC_STATE_PATHS.has(c.req.path)) {
      await next()
      return
    }
    const cookie = getCookie(c, CSRF_COOKIE)
    const header = c.req.header(CSRF_HEADER)
    if (!cookie || !header || !safeEqual(cookie, header)) fail(403, 'CSRF_FAILED', 'CSRF token validation failed')
    await next()
  })

  app.use('/api/*', requestBodyLimit())

  const market = marketData ?? createMarketData({ upstream: createYahooUpstream(), now })
  const researchCalendar = createVerifiedUsEquityCalendarProvider()
  const researchSearchBudget = createPostgresTavilySearchBudget(db)
  const evidenceProvider = researchEvidenceProvider ?? createResearchEvidenceProvider({
    market,
    calendar: researchCalendar,
    now,
    officialSources: researchOfficialSources,
    search: {
      // A prepare makes one search call. Create its bounded adapter per call so
      // the adapter-local maxCallsPerRun counter cannot leak across runs.
      provider: {
        search(query, signal) {
          return createTavilySearchProvider({ apiKey: process.env.TAVILY_API_KEY, policy: TAVILY_SEARCH_POLICY, now, budget: researchSearchBudget }).search(query, signal)
        },
      },
      policy: TAVILY_SEARCH_POLICY,
      query: instrument => `${instrument.symbol} ${instrument.name} recent official events and news`,
    },
  })
  const latestResearchSession = researchLatestCompletedSession ?? createLatestCompletedUsEquitySessionResolver(researchCalendar)
  registerMarketRoutes(app, {
    market,
    consume: consumeRateLimit,
    clientIp: (c) => clientIp(c, config.trustProxy),
    fail,
    validationError,
  })
  registerSecFilingRoutes(app, {
    service: secFilings ?? createSecEdgarService(config.secUserAgent ?? ''),
    consume: consumeRateLimit,
    clientIp: (c) => clientIp(c, config.trustProxy),
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
  registerDiarySavedViewRoutes(app, { db, now, fail, validationError, parseJson })
  registerTradePlanRoutes(app, { db, now, fail, validationError, parseJson })
  registerWatchlistRoutes(app, { db, now, fail, validationError, parseJson })
  registerEvidenceRoutes(app, { db, now, fail, validationError, parseJson })
  registerStockNoteRoutes(app, { db, now, fail, validationError, parseJson })
  registerInvestmentThesisRoutes(app, { db, now, fail, validationError, parseJson })
  registerReviewQueueRoute(app, { db, now, fail, validationError })
  registerActivityTimelineRoute(app, { db, fail, validationError })
  registerDisciplineOg(app)
  registerAgentStockRoutes(app, { db, now, fail, validationError, parseJson })
  registerApiKeyRoutes(app, { db, now, fail, validationError, parseJson, consume: consumeRateLimit })
  registerPartnerRoutes(app, { db, now, fail, validationError, parseJson })
  registerDisciplineRoutes(app, { db, now, fail, validationError, parseJson })
  registerAchievementRoutes(app, { db, now, fail, validationError, parseJson })
  registerGoalRoutes(app, { db, now, fail, validationError, parseJson })
  registerPriceAlertRoutes(app, { db, now, fail, validationError, parseJson })
  registerAlertRoutes(app, { db, now, fail, validationError, parseJson })
  registerPerformanceRoute(app, { db, fail, validationError })
  registerPortfolioAttentionRoutes(app, { db, now, market, fail, validationError, logger })
  registerCompanyHubRoute(app, { db, now, market, fail, validationError })
  registerPostRoutes(app, { db, now, latestCompletedSession: latestResearchSession, logger, fail, validationError, parseJson, consume: consumeRateLimit, clientIp: c => clientIp(c, config.trustProxy) })
  registerArticleTranslationRoutes(app, { db, now, latestCompletedSession: latestResearchSession, fail, validationError, parseJson, consume: consumeRateLimit })
  registerAdminUserRoutes(app, { db, now, onAccountRevoked, fail, validationError, parseJson })
  const aiReportService = new AiReportService({ db, now })
  registerAiReportRoutes(app, { db, now, service: aiReportService, fail, validationError, parseJson, consume: consumeRateLimit })
  registerAiAdminRoutes(app, { db, now, transport: aiTransport, fail, validationError, parseJson })
  const accountEmailLifecycle = registerAccountEmailPublicRoutes(app, {
    db,
    webOrigin: config.webOrigin,
    now,
    clientIp: context => clientIp(context, config.trustProxy),
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
  registerResearchRoutes(app, {
    db,
    now,
    transport: researchTransport ?? createOpenRouterResearchTransport(aiTransport),
    evidenceProvider,
    latestCompletedSession: latestResearchSession,
    allowSyntheticEvidence,
    officialSourcePolicies: researchOfficialSources?.map(source => source.policy),
    fail,
    validationError,
    parseJson,
    consume: consumeRateLimit,
  })

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

  registerDiaryRoutes(app, { db, now })

  registerPortfolioRoutes(app, { db, config, now, market, consume: consumeRateLimit })

  app.notFound((c) => {
    const error = new ApiError(404, 'SYS_NOT_FOUND', 'Resource not found')
    return c.json(apiErrorResponseSchema.parse({
      statusCode: error.statusCode,
      statusMessage: error.message,
      data: { code: error.code, details: null, requestId: c.get('requestId') },
    }), 404)
  })

  app.onError((error, c) => {
    const apiError = error instanceof RequestBodyLimitError
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
