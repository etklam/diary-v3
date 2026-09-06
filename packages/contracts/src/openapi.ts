import {marketRotationMonitorQuerySchema,marketRotationMonitorResponseSchema} from './rotation-monitor.js'
import {rotationBatchRequestSchema,rotationBatchResponseSchema} from './rotation.js'
import {marketStateSnapshotQuerySchema, marketStateHistoryQuerySchema, marketStateSnapshotSchema, marketStateHistoryResponseSchema} from './market-state.js'
import { etfProfileSchema, etfProfileQuerySchema } from './etf-profile.js'
import { etfWatchlistCreateSchema, etfWatchlistItemSchema, etfWatchlistListSchema } from './etf.js'
import { adminEtfCreateSchema, adminEtfCreatedSchema, adminEtfListSchema, adminEtfSeedSchema, adminEtfDeleteSchema, adminEtfInitializeSchema } from './etf.js'
import { agentTimelineBatchRequestSchema, agentTimelineBatchResponseSchema } from './evidence.js'
import { agentWatchlistResponseSchema } from './watchlist.js'
import { createApiKeySchema, apiKeyListResponseSchema, apiKeyCreateResponseSchema } from './api-keys.js'
import { partnerCompareQuerySchema, partnerCompareResponseSchema, invitePartnerSchema, updatePartnerSharingSchema, partnerListResponseSchema, partnerMutationResponseSchema } from './partners.js'
import { importDisciplineRequestSchema, importDisciplineResponseSchema, exportDisciplineQuerySchema, exportDisciplineResponseSchema } from './discipline-share.js'
import { writeDisciplineSchema, reorderDisciplinesSchema, disciplineResponseSchema, disciplineListSchema, randomDisciplineSchema } from './discipline.js'
import { createPriceAlertRequestSchema, updatePriceAlertRequestSchema, priceAlertListResponseSchema, priceAlertResponseSchema } from './price-alerts.js'
import { alertCreateRequestWireOpenApiSchema, alertListResponseSchema, alertResponseSchema } from './alerts.js'
import { performanceQuerySchema, performanceResponseSchema } from './performance.js'
import { portfolioAttentionQuerySchema, portfolioAttentionResponseSchema } from './portfolio-attention.js'
import { portfolioExposureResponseSchema } from './portfolio-exposure.js'
import { companyHubResponseSchema } from './company-hub.js'
import { reviewGroupsResponseSchema, reviewQueueQuerySchema } from './review-queue.js'
import { saveInvestmentThesisRequestSchema, completeThesisReviewRequestSchema, investmentThesisResponseSchema, investmentThesisMutationResponseSchema, thesisReviewResponseSchema, thesisReviewListParamsSchema } from './investment-thesis.js'
import { stockNoteCreateRequestSchema, stockNoteUpdateRequestSchema, stockNoteListParamsSchema, stockNoteListResponseSchema, stockNoteResponseSchema } from './stock-note.js'
import { webEvidenceRequestSchema, stockTimelineQuerySchema, stockTimelineRecordSchema, stockTimelineListResponseSchema, stockSymbolTimelineResponseSchema } from './evidence.js'
import { stockSymbolSchema } from './watchlist.js'
import { stockWatchlistCreateRequestSchema, stockWatchlistUpdateRequestSchema, stockWatchlistMutationResponseSchema, stockWatchlistResponseSchema } from './watchlist.js'
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { updateUserSettingsSchema, userSettingsResponseSchema } from './settings.js'
import { marketSymbolSchema, marketQuoteSchema, marketHistoricalSchema, marketRangeSchema, spxSessionSummarySchema } from './market.js'
import { holdingsResponseSchema, recentClosedTradesResponseSchema } from './ledger.js'
import { diaryListQuerySchema, diaryListResponseSchema } from './diary-list.js'
import { diaryActivityQuerySchema, diaryActivityResponseSchema } from './diary-activity.js'
import { holidayResponseSchema } from './calendar.js'
import { diaryReviewResponseSchema, structuredReviewInputSchema } from './review.js'
import { tradePlanInputSchema, tradePlanUpdateSchema, tradePlanListQuerySchema, tradePlanResponseSchema, tradePlanListResponseSchema, deleteTradePlanResponseSchema } from './trade-plan.js'
import {
  secApiResponseSchema,
  secBatchQuerySchema,
  secCompanySearchQuerySchema,
  secCompanySearchResultSchema,
  secFilingDetailSchema,
  secFilingListQuerySchema,
  secFilingPageSchema,
} from './sec-filings.js'
import { portfolioValuationResponseSchema } from './portfolio.js'
import {
  postAdminDetailSchema,
  postAdminListQuerySchema,
  postAdminListResponseSchema,
  postBulkRequestSchema,
  postBulkResponseSchema,
  postDeleteResponseSchema,
  postPublicDetailSchema,
  postPublicListResponseSchema,
  postWriteRequestSchema,
  postListQuerySchema,
} from './post.js'
import {
  adminDiaryListQuerySchema,
  adminDiaryListResponseSchema,
  adminStatsResponseSchema,
  adminUserDeleteResponseSchema,
  adminUserListQuerySchema,
  adminUserListResponseSchema,
  adminUserRoleResponseSchema,
  adminUserRoleUpdateRequestSchema,
} from './admin-users.js'
import {
  apiErrorResponseSchema,
  authMutationResponseSchema,
  authUserResponseSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  createDiaryRequestSchema,
  deleteDiaryResponseSchema,
  diaryByDateQuerySchema,
  diaryByDateResponseSchema,
  diaryResponseSchema,
  loginRequestSchema,
  nativeAuthResponseSchema,
  nativeLoginRequestSchema,
  nativeRefreshRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  serializedIdSchema,
  updateDiaryRequestSchema,
} from './index.js'

extendZodWithOpenApi(z)

const registry = new OpenAPIRegistry()

// Runtime schemas may already have been constructed before this generator-only
// module is imported. Zod 4 installs extension methods when a schema instance is
// created, so clone each top-level schema after extending Zod.
const LoginRequest = registry.register('LoginRequest', loginRequestSchema.clone())
const RegisterRequest = registry.register('RegisterRequest', registerRequestSchema.clone())
const AuthUserResponse = registry.register('AuthUserResponse', authUserResponseSchema.clone())
const RegisterResponse = registry.register('RegisterResponse', registerResponseSchema.clone())
const CreateDiaryRequest = registry.register('CreateDiaryRequest', createDiaryRequestSchema.clone())
const DiaryResponse = registry.register('DiaryResponse', diaryResponseSchema.clone())
const DiaryByDateResponse = registry.register('DiaryByDateResponse', diaryByDateResponseSchema.clone())
const UpdateDiaryRequest = registry.register('UpdateDiaryRequest', updateDiaryRequestSchema.clone())
const DeleteDiaryResponse = registry.register('DeleteDiaryResponse', deleteDiaryResponseSchema.clone())
const ApiErrorResponse = registry.register('ApiErrorResponse', apiErrorResponseSchema.clone())
const NativeLoginRequest = registry.register('NativeLoginRequest', nativeLoginRequestSchema.clone())
const NativeRefreshRequest = registry.register('NativeRefreshRequest', nativeRefreshRequestSchema.clone())
const NativeAuthResponse = registry.register('NativeAuthResponse', nativeAuthResponseSchema.clone())
const AuthMutationResponse = registry.register('AuthMutationResponse', authMutationResponseSchema.clone())
const ChangePasswordRequest = registry.register('ChangePasswordRequest', changePasswordRequestSchema.clone())
const ChangePasswordResponse = registry.register('ChangePasswordResponse', changePasswordResponseSchema.clone())
const UpdateUserSettings = registry.register('UpdateUserSettings', updateUserSettingsSchema.clone())
const UserSettingsResponse = registry.register('UserSettingsResponse', userSettingsResponseSchema.clone())
const MarketQuote = registry.register('MarketQuote', marketQuoteSchema.clone())
const MarketHistorical = registry.register('MarketHistorical', marketHistoricalSchema.clone())
const DiaryListResponse = registry.register('DiaryListResponse', diaryListResponseSchema.clone())
const SpxSessionSummary = registry.register('SpxSessionSummary', spxSessionSummarySchema.clone())
const HoldingsResponse = registry.register('HoldingsResponse', holdingsResponseSchema.clone())
const RecentClosedTradesResponse = registry.register('RecentClosedTradesResponse', recentClosedTradesResponseSchema.clone())
const MarketStateSnapshot = registry.register('MarketStateSnapshot', marketStateSnapshotSchema.clone())
const MarketStateHistory = registry.register('MarketStateHistory', marketStateHistoryResponseSchema.clone())
const SecCompanySearchResponse = registry.register('SecCompanySearchResponse', secApiResponseSchema(secCompanySearchResultSchema.array().max(20)).clone())
const SecFilingPageResponse = registry.register('SecFilingPageResponse', secApiResponseSchema(secFilingPageSchema).clone())
const SecFilingDetailResponse = registry.register('SecFilingDetailResponse', secApiResponseSchema(secFilingDetailSchema).clone())
const AdminUserListResponse = registry.register('AdminUserListResponse', adminUserListResponseSchema.clone())
const AdminUserRoleResponse = registry.register('AdminUserRoleResponse', adminUserRoleResponseSchema.clone())
const AdminUserDeleteResponse = registry.register('AdminUserDeleteResponse', adminUserDeleteResponseSchema.clone())
const AdminDiaryListResponse = registry.register('AdminDiaryListResponse', adminDiaryListResponseSchema.clone())
const AdminStatsResponse = registry.register('AdminStatsResponse', adminStatsResponseSchema.clone())


const DiaryActivityResponse = registry.register('DiaryActivityResponse', diaryActivityResponseSchema.clone())
const HolidayResponse = registry.register('HolidayResponse', holidayResponseSchema.clone())
const DiaryReviewResponse = registry.register('DiaryReviewResponse', diaryReviewResponseSchema.clone())
const StructuredReviewInput = registry.register('StructuredReviewInput', structuredReviewInputSchema.clone())

registry.registerComponent('securitySchemes', 'accessTokenCookie', {
  type: 'apiKey', in: 'cookie', name: 'access-token',
})
registry.registerComponent('securitySchemes', 'refreshTokenCookie', {
  type: 'apiKey', in: 'cookie', name: 'refresh-token',
})
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
})

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const errors = (statuses: number[]) => Object.fromEntries(
  statuses.map((status) => [status, json(ApiErrorResponse, `HTTP ${status} error`)]),
)

registry.registerPath({
  method: 'post', path: '/api/auth/register', tags: ['Auth'], operationId: 'authRegister',
  request: { body: { content: { 'application/json': { schema: RegisterRequest } } } },
  responses: { 200: json(RegisterResponse, 'Account created'), ...errors([400, 409, 429, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/auth/login', tags: ['Auth'], operationId: 'authLogin',
  request: { body: { content: { 'application/json': { schema: LoginRequest } } } },
  responses: { 200: json(AuthUserResponse, 'Browser session created'), ...errors([400, 401, 429, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/auth/refresh', tags: ['Auth'], operationId: 'authRefresh',
  security: [{ refreshTokenCookie: [] }],
  responses: { 200: json(AuthMutationResponse, 'Browser access token refreshed'), ...errors([401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/auth/logout', tags: ['Auth'], operationId: 'authLogout',
  security: [{ refreshTokenCookie: [] }, {}],
  responses: { 200: json(AuthMutationResponse, 'Current browser session ended'), ...errors([401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/auth/logout-all', tags: ['Auth'], operationId: 'authLogoutAll',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(AuthMutationResponse, 'Every session ended'), ...errors([401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/user/password', tags: ['Auth'], operationId: 'userChangePassword',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: ChangePasswordRequest } } } },
  responses: { 200: json(ChangePasswordResponse, 'Password changed and sessions ended'), ...errors([400, 401, 403, 404, 429, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/user/settings', tags: ['Users'], operationId: 'userSettingsGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(UserSettingsResponse, 'Current user settings'), ...errors([401, 404, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/user/settings', tags: ['Users'], operationId: 'userSettingsUpdate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: UpdateUserSettings } } } },
  responses: { 200: json(UserSettingsResponse, 'User settings updated'), ...errors([400, 401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/auth/me', tags: ['Auth'], operationId: 'authMe', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(AuthUserResponse, 'Current user'), ...errors([401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/auth/native/login', tags: ['Auth'], operationId: 'nativeLogin',
  request: { body: { content: { 'application/json': { schema: NativeLoginRequest } } } },
  responses: { 200: json(NativeAuthResponse, 'Native session created'), ...errors([400, 401, 429, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/auth/native/refresh', tags: ['Auth'], operationId: 'nativeRefresh',
  request: { body: { content: { 'application/json': { schema: NativeRefreshRequest } } } },
  responses: { 200: json(NativeAuthResponse, 'Native session refreshed'), ...errors([400, 401, 429, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/auth/native/logout', tags: ['Auth'], operationId: 'nativeLogout',
  request: { body: { content: { 'application/json': { schema: NativeRefreshRequest } } } },
  responses: { 200: json(AuthMutationResponse, 'Native session revoked'), ...errors([400, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/diaries', tags: ['Diaries'], operationId: 'diariesCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: CreateDiaryRequest } } } },
  responses: { 201: json(DiaryResponse, 'Diary created or appended'), ...errors([400, 401, 403, 409, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/diaries/by-date', tags: ['Diaries'], operationId: 'diariesByDate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: diaryByDateQuerySchema },
  responses: { 200: json(DiaryByDateResponse, 'Diary for the date, or null'), ...errors([400, 401, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/diaries/{id}', tags: ['Diaries'], operationId: 'diariesGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(DiaryResponse, 'Diary detail'), ...errors([400, 401, 404, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/diaries/{id}', tags: ['Diaries'], operationId: 'diariesUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: {
    params: z.object({ id: serializedIdSchema }),
    body: { content: { 'application/json': { schema: UpdateDiaryRequest } } },
  },
  responses: { 200: json(DiaryResponse, 'Diary updated'), ...errors([400, 401, 403, 404, 409, 500]) },
})
registry.registerPath({
  method: 'delete', path: '/api/diaries/{id}', tags: ['Diaries'], operationId: 'diariesDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(DeleteDiaryResponse, 'Diary deleted'), ...errors([400, 401, 403, 404, 500]) },
})

registry.registerPath({
  method: 'get', path: '/api/diaries', tags: ['Diaries'], operationId: 'diariesList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: diaryListQuerySchema.clone() },
  responses: { 200: json(DiaryListResponse, 'Owner-scoped filtered diary page'), ...errors([400, 401, 500]) },
})

registry.registerPath({
  method: 'get', path: '/api/diaries/activity', tags: ['Diaries'], operationId: 'diariesActivityGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: diaryActivityQuerySchema.clone() },
  responses: { 200: json(DiaryActivityResponse, 'Civil-date activity for an inclusive range of at most 371 days'), ...errors([400, 401, 500]) },
})

const marketSymbolParameter = z.string().min(1).max(32).regex(/^[A-Za-z0-9^][A-Za-z0-9.^=-]*$/)
const marketNoCacheParameter = z.enum(['1', 'true', '0', 'false']).optional()
const marketFreshnessHeaders = {
  'X-Market-Data-Source': { description: 'Whether the result came from upstream, server cache or stale fallback.', schema: { type: 'string' as const, enum: ['upstream', 'cache', 'stale'] } },
  'X-Market-Data-Fetched-At': { description: 'UTC instant of the successful upstream fetch; unchanged for stale fallback.', schema: { type: 'string' as const, format: 'date-time' } },
}
registry.registerPath({
  method: 'get', path: '/api/market/quote/{symbol}', tags: ['Market'], operationId: 'marketQuoteGet',
  description: 'Guest-accessible quote. Explicit invalid credentials are rejected. Symbols are trimmed, uppercased and canonical index aliases normalized.',
  security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: marketSymbolParameter }), query: z.object({ nocache: marketNoCacheParameter }) },
  responses: { 200: { ...json(MarketQuote, 'Canonical quote with nullable unavailable metadata'), headers: marketFreshnessHeaders }, ...errors([400, 401, 429, 502, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/market/historical', tags: ['Market'], operationId: 'marketHistoricalGet',
  description: 'Guest-accessible daily closing prices. Invalid explicit credentials are rejected; missing data is not interpolated.',
  security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: z.object({ symbol: marketSymbolParameter, range: marketRangeSchema.default('1y'), nocache: marketNoCacheParameter }) },
  responses: { 200: { ...json(MarketHistorical, 'Available daily prices with Unix-second timestamps'), headers: marketFreshnessHeaders }, ...errors([400, 401, 429, 502, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/market/spx-session', tags: ['Market'], operationId: 'marketSpxSessionGet',
  description: 'Authenticated SPX session classification from a quote and matching New York trading-day intraday bars. Missing inputs are reported as unavailable.',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: { ...json(SpxSessionSummary, 'SPX session classification'), headers: marketFreshnessHeaders }, ...errors([401, 429, 502, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/stocks/holdings', tags: ['Stocks'], operationId: 'stocksHoldingsGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(HoldingsResponse, 'Owner holdings with decimal-string quantity and cost'), ...errors([401, 500]) },
})

registry.registerPath({
  method: 'get', path: '/api/holidays', tags: ['Calendar'], operationId: 'holidaysGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: z.object({ year: z.coerce.number().int().min(1900).max(2100), countryCode: z.string().regex(/^[A-Za-z]{2}$/) }).strict() },
  responses: { 200: json(HolidayResponse, 'Public holidays in the requested country/year'), ...errors([400, 401, 502, 500]) },
})

registry.registerPath({
  method: 'get', path: '/api/diaries/{id}/review', tags: ['Reviews'], operationId: 'diaryReviewGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(DiaryReviewResponse, 'Owner review with original reasoning'), ...errors([400, 401, 404, 500]) },
})
registry.registerPath({
  method: 'patch', path: '/api/diaries/{id}/review', tags: ['Reviews'], operationId: 'diaryReviewSave',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: StructuredReviewInput } } } },
  responses: { 200: json(DiaryReviewResponse, 'Structured review saved using server time'), ...errors([400, 401, 403, 404, 500]) },
})

registry.registerPath({
  method: 'get', path: '/api/stats/recent-trades', tags: ['Stocks'], operationId: 'recentClosedTradesGet',
  description: 'Recent owner SELL results, using full prior ledger history to calculate basis. Invalid/nonpositive query numbers use defaults; days is capped at 90 and limit at 100.',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: z.object({ days: z.string().optional(), limit: z.string().optional() }).strict() },
  responses: { 200: json(RecentClosedTradesResponse, 'Recent realized SELL results as decimal strings'), ...errors([400, 401, 500]) },
})

registry.registerPath({
  method: 'get', path: '/api/stats/export-trades', tags: ['Stocks'], operationId: 'exportClosedTradesGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: z.object({ symbol: z.string().max(20).optional() }) },
  responses: {
    200: { description: 'Owner closed trades, chronological CSV attachment with exact decimal values', content: { 'text/csv': { schema: z.string() } } },
    ...errors([400, 401, 500]),
  },
})

const TradePlanInput = registry.register('TradePlanInput', tradePlanInputSchema.clone())
const TradePlanUpdate = registry.register('TradePlanUpdate', tradePlanUpdateSchema.clone())
const TradePlanResponse = registry.register('TradePlanResponse', tradePlanResponseSchema.clone())
const TradePlanListResponse = registry.register('TradePlanListResponse', tradePlanListResponseSchema.clone())
const DeleteTradePlanResponse = registry.register('DeleteTradePlanResponse', deleteTradePlanResponseSchema.clone())
registry.registerPath({
  method: 'get', path: '/api/trade-plans', tags: ['Trade Plans'], operationId: 'tradePlansList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: tradePlanListQuerySchema.clone() },
  responses: { 200: json(TradePlanListResponse, 'Owner trade plans'), ...errors([400, 401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/trade-plans', tags: ['Trade Plans'], operationId: 'tradePlanCreate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: TradePlanInput } } } },
  responses: { 200: json(TradePlanResponse, 'Trade plan created'), ...errors([400, 401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/trade-plans/{id}', tags: ['Trade Plans'], operationId: 'tradePlanGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(TradePlanResponse, 'Owner trade plan'), ...errors([400, 401, 404, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/trade-plans/{id}', tags: ['Trade Plans'], operationId: 'tradePlanUpdate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: TradePlanUpdate } } } },
  responses: { 200: json(TradePlanResponse, 'Trade plan updated'), ...errors([400, 401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'delete', path: '/api/trade-plans/{id}', tags: ['Trade Plans'], operationId: 'tradePlanDelete',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(DeleteTradePlanResponse, 'Trade plan deleted'), ...errors([400, 401, 403, 404, 500]) },
})
const PortfolioValuationResponse = registry.register('PortfolioValuationResponse', portfolioValuationResponseSchema.clone())
registry.registerPath({
  method: 'get', path: '/api/stocks/portfolio', tags: ['Stocks'], operationId: 'portfolioValuationGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(PortfolioValuationResponse, 'Owner portfolio with complete or partial quote coverage'), ...errors([401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/stocks/prices', tags: ['Stocks'], operationId: 'stockPricesBatch',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: z.object({ symbols: z.array(z.string().max(32)).min(1).max(25) }).strict() } } } },
  responses: { 200: json(z.record(z.string(), MarketQuote), 'Successful quotes keyed by first trimmed input symbol'), ...errors([400, 401, 403, 429, 502, 500]) },
})
const WatchlistResponse = registry.register('StockWatchlistResponse', stockWatchlistResponseSchema.clone())
const WatchlistMutation = registry.register('StockWatchlistMutation', stockWatchlistMutationResponseSchema.clone())
registry.registerPath({
  method: 'get', path: '/api/stocks/watchlist', tags: ['Stocks'], operationId: 'stockWatchlistList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(WatchlistResponse, 'First 100 active owner items ordered by sortOrder and ID'), ...errors([401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/stocks/watchlist', tags: ['Stocks'], operationId: 'stockWatchlistUpsert',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: stockWatchlistCreateRequestSchema.clone() } } } },
  responses: { 200: json(WatchlistMutation, 'Created or restored owner item'), ...errors([400, 401, 403, 500]) },
})
registry.registerPath({
  method: 'patch', path: '/api/stocks/watchlist/{id}', tags: ['Stocks'], operationId: 'stockWatchlistUpdate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: stockWatchlistUpdateRequestSchema.clone() } } } },
  responses: { 200: json(WatchlistMutation, 'Updated owner item'), ...errors([400, 401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'delete', path: '/api/stocks/watchlist/{id}', tags: ['Stocks'], operationId: 'stockWatchlistArchive',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(z.object({ success: z.literal(true) }).strict(), 'Archived owner item'), ...errors([400, 401, 403, 404, 500]) },
})
const EvidenceRecord = registry.register('EvidenceRecord', stockTimelineRecordSchema.clone())
registry.registerPath({
  method: 'post', path: '/api/stocks/{symbol}/evidence', tags: ['Stocks'], operationId: 'stockEvidenceCapture',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: stockSymbolSchema }), body: { content: { 'application/json': { schema: webEvidenceRequestSchema.clone() } } } },
  responses: { 200: json(EvidenceRecord, 'Created or existing immutable evidence'), ...errors([400, 401, 403, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/stocks/{symbol}/timeline', tags: ['Stocks'], operationId: 'stockTimelineBySymbol',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: stockSymbolSchema }), query: stockTimelineQuerySchema.clone() },
  responses: { 200: json(stockSymbolTimelineResponseSchema.clone(), 'Owner evidence ordered by occurredAt and ID descending'), ...errors([400, 401, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/stocks/timeline', tags: ['Stocks'], operationId: 'stockTimelineList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: stockTimelineQuerySchema.clone() },
  responses: { 200: json(stockTimelineListResponseSchema.clone(), 'Owner evidence across companies'), ...errors([400, 401, 500]) },
})
const StockNoteResponse = registry.register('StockNoteResponse', stockNoteResponseSchema.clone())
registry.registerPath({
  method: 'get', path: '/api/stocks/{symbol}/notes', tags: ['Stocks'], operationId: 'stockNoteList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: stockSymbolSchema }), query: stockNoteListParamsSchema.clone() },
  responses: { 200: json(stockNoteListResponseSchema.clone(), 'Company notes ordered by date and ID descending'), ...errors([400, 401, 403, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/stocks/{symbol}/notes', tags: ['Stocks'], operationId: 'stockNoteCreate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: stockSymbolSchema }), body: { content: { 'application/json': { schema: stockNoteCreateRequestSchema.clone() } } } },
  responses: { 200: json(StockNoteResponse, 'Created owner note'), ...errors([400, 401, 403, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/stocks/{symbol}/notes/{id}', tags: ['Stocks'], operationId: 'stockNoteUpdate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: stockSymbolSchema, id: serializedIdSchema }), body: { content: { 'application/json': { schema: stockNoteUpdateRequestSchema.clone() } } } },
  responses: { 200: json(StockNoteResponse, 'Updated user-created note'), ...errors([400, 401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'delete', path: '/api/stocks/{symbol}/notes/{id}', tags: ['Stocks'], operationId: 'stockNoteDelete',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ symbol: stockSymbolSchema, id: serializedIdSchema }) },
  responses: { 200: json(z.object({ success: z.literal(true) }).strict(), 'Deleted user-created note'), ...errors([400, 401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/stocks/{symbol}/thesis', tags: ['Thesis'], operationId: 'investmentThesisGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ symbol: stockSymbolSchema }), query: thesisReviewListParamsSchema.clone() },
  responses: { 200: json(investmentThesisResponseSchema.clone(), 'Current owner thesis with bounded review history'), ...errors([400, 401, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/stocks/{symbol}/thesis', tags: ['Thesis'], operationId: 'investmentThesisReplace',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: stockSymbolSchema }), body: { content: { 'application/json': { schema: saveInvestmentThesisRequestSchema.clone() } } } },
  responses: { 200: json(investmentThesisMutationResponseSchema.clone(), 'Full replacement of current owner thesis'), ...errors([400, 401, 403, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/stocks/{symbol}/thesis/reviews', tags: ['Thesis'], operationId: 'thesisReviewComplete',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ symbol: stockSymbolSchema }), body: { content: { 'application/json': { schema: completeThesisReviewRequestSchema.clone() } } } },
  responses: { 200: json(thesisReviewResponseSchema.clone(), 'Review with atomically captured thesis snapshot'), ...errors([400, 401, 403, 404, 409, 500]) },
})
registry.registerPath({ method: 'get', path: '/api/reviews', tags: ['Review'], operationId: 'reviewQueueGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: reviewQueueQuerySchema.clone() }, responses: { 200: json(reviewGroupsResponseSchema.clone(), 'Five review groups with page/limit applied independently per group'), ...errors([400, 401, 500]) } })
export const openApiRegistry = registry

export function createOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Diary API', version: '0.1.0' },
    servers: [{ url: '/' }],
  })
}

registry.registerPath({ method: 'get', path: '/api/stocks/{symbol}/hub', tags: ['Stocks'], operationId: 'companyHubGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ symbol: stockSymbolSchema.clone() }) }, responses: { 200: json(companyHubResponseSchema.clone(), 'Owner Company Hub with bounded recent research and cost-basis position'), ...errors([400, 401, 500]) } })

registry.registerPath({ method: 'get', path: '/api/stocks/exposure', tags: ['Stocks'], operationId: 'portfolioExposureGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(portfolioExposureResponseSchema.clone(), 'Cost-basis exposure and optional rotation allocation comparison'), ...errors([401, 500]) } })

for (const [path, operationId] of [['/api/portfolio/attention', 'portfolioAttentionGet'], ['/api/stocks/attention', 'stocksAttentionGet']]) registry.registerPath({ method: 'get', path: path!, tags: ['Stocks'], operationId: operationId!, security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: portfolioAttentionQuerySchema.clone() }, responses: { 200: json(portfolioAttentionResponseSchema.clone(), 'Prioritized owner attention items, maximum 50'), ...errors([400, 401, 500]) } })

registry.registerPath({ method: 'get', path: '/api/stats/performance', tags: ['Stocks'], operationId: 'performanceGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: performanceQuerySchema.clone() }, responses: { 200: json(performanceResponseSchema.clone(), 'Owner strategy and realized-trade performance'), ...errors([400, 401, 500]) } })

registry.registerPath({ method: 'get', path: '/api/alerts', tags: ['Alerts'], operationId: 'alertsGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(alertListResponseSchema.clone(), 'Active reminders, maximum 100'), ...errors([401, 500]) } })
registry.registerPath({ method: 'post', path: '/api/alerts', tags: ['Alerts'], operationId: 'alertsCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(alertCreateRequestWireOpenApiSchema, 'Reminder wire body; message plus diaryId or diary_id is required. For paired keys snake_case wins when non-nullish; null falls back to camelCase when supplied. Omit trigger keys to use the request clock.') }, responses: { 200: json(alertResponseSchema.clone().nullable(), 'Created reminder or empty recurring set'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'put', path: '/api/alerts/{id}/dismiss', tags: ['Alerts'], operationId: 'alertDismiss', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(alertResponseSchema.clone(), 'Dismissed reminder'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'get', path: '/api/stocks/alerts', tags: ['PriceAlerts'], operationId: 'priceAlertsGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(priceAlertListResponseSchema.clone(), 'Latest 100 price alerts'), ...errors([401, 500]) } })
registry.registerPath({ method: 'post', path: '/api/stocks/alerts', tags: ['PriceAlerts'], operationId: 'priceAlertsCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(createPriceAlertRequestSchema.clone(), 'Price alert') }, responses: { 200: json(priceAlertResponseSchema.clone(), 'Created price alert'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'put', path: '/api/stocks/alerts/{id}', tags: ['PriceAlerts'], operationId: 'priceAlertsUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(updatePriceAlertRequestSchema.clone(), 'Price alert changes') }, responses: { 200: json(priceAlertResponseSchema.clone(), 'Updated price alert'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/stocks/alerts/{id}', tags: ['PriceAlerts'], operationId: 'priceAlertsDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(deleteDiaryResponseSchema.clone(), 'Deleted price alert'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'get', path: '/api/discipline', tags: ['Discipline'], operationId: 'disciplinesGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(disciplineListSchema.clone(), 'Discipline result'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'get', path: '/api/discipline/random', tags: ['Discipline'], operationId: 'disciplineRandom', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(randomDisciplineSchema.clone(), 'Discipline result'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'post', path: '/api/discipline', tags: ['Discipline'], operationId: 'disciplineCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(writeDisciplineSchema.clone(), 'Discipline input') }, responses: { 200: json(disciplineResponseSchema.clone(), 'Discipline result'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'patch', path: '/api/discipline/reorder', tags: ['Discipline'], operationId: 'disciplineReorder', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(reorderDisciplinesSchema.clone(), 'Discipline input') }, responses: { 200: json(disciplineListSchema.clone(), 'Discipline result'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'put', path: '/api/discipline/{id}', tags: ['Discipline'], operationId: 'disciplineUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(writeDisciplineSchema.clone(), 'Discipline input') }, responses: { 200: json(disciplineResponseSchema.clone(), 'Discipline result'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'delete', path: '/api/discipline/{id}', tags: ['Discipline'], operationId: 'disciplineDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(deleteDiaryResponseSchema.clone(), 'Discipline result'), ...errors([400, 401, 403, 404, 500]) } })

registry.registerPath({ method: 'get', path: '/api/discipline/export', tags: ['Discipline'], operationId: 'disciplineExport', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: exportDisciplineQuerySchema.clone() }, responses: { 200: json(exportDisciplineResponseSchema.clone(), 'Exported discipline share document'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/discipline/import', tags: ['Discipline'], operationId: 'disciplineImport', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(importDisciplineRequestSchema.clone(), 'Share JSON and import strategy') }, responses: { 200: json(importDisciplineResponseSchema.clone(), 'Imported disciplines'), ...errors([400, 401, 403, 500]) } })

registry.registerPath({ method: 'get', path: '/api/og/discipline.svg', tags: ['Discipline'], operationId: 'disciplineOgImage', request: { query: z.object({ title: z.string().optional(), author: z.string().optional(), count: z.string().optional() }) }, responses: { 200: { description: 'Public escaped SVG preview with bounded display text', content: { 'image/svg+xml': { schema: z.string() } } }, ...errors([500]) } })

registry.registerPath({ method: 'get', path: '/api/partners', tags: ['Partners'], operationId: 'partnersGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(partnerListResponseSchema.clone(), 'Partner result'), ...errors([400, 401, 403, 404, 409, 500]) } })

registry.registerPath({ method: 'post', path: '/api/partners', tags: ['Partners'], operationId: 'partnerInvite', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(invitePartnerSchema.clone(), 'Partner input') }, responses: { 200: json(partnerMutationResponseSchema.clone(), 'Partner result'), ...errors([400, 401, 403, 404, 409, 500]) } })

registry.registerPath({ method: 'post', path: '/api/partners/{id}/accept', tags: ['Partners'], operationId: 'partnerAccept', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(partnerMutationResponseSchema.clone(), 'Partner result'), ...errors([400, 401, 403, 404, 409, 500]) } })

registry.registerPath({ method: 'put', path: '/api/partners/{id}/sharing', tags: ['Partners'], operationId: 'partnerSharing', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(updatePartnerSharingSchema.clone(), 'Partner input') }, responses: { 200: json(partnerMutationResponseSchema.clone(), 'Partner result'), ...errors([400, 401, 403, 404, 409, 500]) } })

registry.registerPath({ method: 'delete', path: '/api/partners/{id}', tags: ['Partners'], operationId: 'partnerRemove', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(deleteDiaryResponseSchema.clone(), 'Partner result'), ...errors([400, 401, 403, 404, 409, 500]) } })

registry.registerPath({ method: 'get', path: '/api/partners/compare', tags: ['Partners'], operationId: 'partnerCompare', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: partnerCompareQuerySchema }, responses: { 200: json(partnerCompareResponseSchema, 'Date-aligned shared diaries'), ...errors([400, 401, 404, 409, 500]) } })

registry.registerPath({ method: 'get', path: '/api/api-keys', tags: ['API Keys'], operationId: 'apiKeysList', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(apiKeyListResponseSchema, 'Credential summaries without secrets'), ...errors([401, 500]) } })
registry.registerPath({ method: 'post', path: '/api/api-keys', tags: ['API Keys'], operationId: 'apiKeyCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(createApiKeySchema, 'Key label and scope') }, responses: { 200: json(apiKeyCreateResponseSchema, 'Secret returned once'), ...errors([400, 401, 403, 429, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/api-keys/{id}', tags: ['API Keys'], operationId: 'apiKeyRevoke', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(deleteDiaryResponseSchema, 'Key revoked'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerComponent('securitySchemes', 'apiKeyHeader', { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'User-owned scoped API key; cannot be combined with Authorization.' })
registry.registerComponent('securitySchemes', 'apiKeyBearer', { type: 'http', scheme: 'bearer', description: 'User-owned dva_ API key; cannot be combined with X-API-Key.' })
registry.registerPath({ method: 'post', path: '/api/agent/diaries', tags: ['Agent'], operationId: 'agentDiaryCreate', description: 'Requires DIARY_CREATE or AGENT_WRITE. Creates for the key owner, labels the source, and rejects appendToToday=true.', security: [{ apiKeyHeader: [] }, { apiKeyBearer: [] }], request: { body: json(CreateDiaryRequest, 'Diary creation; appendToToday must be false or omitted') }, responses: { 201: json(DiaryResponse, 'Diary created by key owner'), ...errors([400, 401, 409, 500]) } })

registry.registerPath({ method: 'get', path: '/api/agent/stocks/watchlist', tags: ['Agent'], operationId: 'agentWatchlist', security: [{ apiKeyHeader: [] }, { apiKeyBearer: [] }], responses: { 200: json(agentWatchlistResponseSchema, 'Key owner active watchlist'), ...errors([401, 403, 500]) } })
registry.registerPath({ method: 'post', path: '/api/agent/stocks/{symbol}/notes', tags: ['Agent'], operationId: 'agentStockNoteCreate', security: [{ apiKeyHeader: [] }, { apiKeyBearer: [] }], request: { params: z.object({ symbol: stockSymbolSchema }), body: json(stockNoteCreateRequestSchema, 'Agent research note') }, responses: { 200: json(stockNoteResponseSchema, 'Agent note created'), ...errors([400, 401, 403, 500]) } })

registry.registerPath({ method: 'post', path: '/api/agent/stocks/records', tags: ['Agent'], operationId: 'agentTimelineBatch', description: 'AGENT_WRITE only. Validates up to 100 records before writing. Existing owner/stock/idempotency keys are skipped without modifying immutable evidence.', security: [{ apiKeyHeader: [] }, { apiKeyBearer: [] }], request: { body: json(agentTimelineBatchRequestSchema, 'Agent evidence batch') }, responses: { 200: json(agentTimelineBatchResponseSchema, 'Created IDs and skipped records'), ...errors([400, 401, 403, 500]) } })

registry.registerPath({ method: 'get', path: '/api/admin/etf', tags: ['Admin ETF'], operationId: 'adminEtfList', description: 'Admin session required.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],  responses: { 200: json(adminEtfListSchema, 'ETF result'), ...errors([400, 401, 403, 404, 409, 429, 500, 502]) } })

registry.registerPath({ method: 'get', path: '/api/admin/users', tags: ['Admin Users'], operationId: 'adminUsersList', description: 'Admin session required. Search is a case-insensitive email/name substring.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: adminUserListQuerySchema.clone() }, responses: { 200: json(AdminUserListResponse, 'Paginated admin user list'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'put', path: '/api/admin/users/{id}/role', tags: ['Admin Users'], operationId: 'adminUserRoleUpdate', description: 'Admin session required. Administrators cannot modify their own role.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(adminUserRoleUpdateRequestSchema.clone(), 'User role') }, responses: { 200: json(AdminUserRoleResponse, 'Updated user role'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/admin/users/{id}', tags: ['Admin Users'], operationId: 'adminUserDelete', description: 'Admin session required. Administrators cannot delete themselves; dependent data is deleted with the account.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminUserDeleteResponse, 'Deleted user'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/diaries', tags: ['Admin Users'], operationId: 'adminDiariesList', description: 'Admin session required. Review outcome and reflection text are owner-private and omitted.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: adminDiaryListQuerySchema.clone() }, responses: { 200: json(AdminDiaryListResponse, 'Paginated admin Diary list'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/stats', tags: ['Admin Users'], operationId: 'adminStats', description: 'Admin session required. Recent Diary projections omit owner-private Review text.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(AdminStatsResponse, 'Admin system counts and recent activity'), ...errors([401, 403, 500]) } })

registry.registerPath({ method: 'post', path: '/api/admin/etf', tags: ['Admin ETF'], operationId: 'adminEtfCreate', description: 'Admin session required.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(adminEtfCreateSchema, 'ETF input') }, responses: { 200: json(adminEtfCreatedSchema, 'ETF result'), ...errors([400, 401, 403, 404, 409, 429, 500, 502]) } })

registry.registerPath({ method: 'post', path: '/api/admin/etf/seed', tags: ['Admin ETF'], operationId: 'adminEtfSeed', description: 'Admin session required.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],  responses: { 200: json(adminEtfSeedSchema, 'ETF result'), ...errors([400, 401, 403, 404, 409, 429, 500, 502]) } })

registry.registerPath({ method: 'post', path: '/api/admin/etf/{id}/initialize', tags: ['Admin ETF'], operationId: 'adminEtfInitialize', description: 'Admin session required.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(adminEtfInitializeSchema, 'ETF result'), ...errors([400, 401, 403, 404, 409, 429, 500, 502]) } })

registry.registerPath({ method: 'delete', path: '/api/admin/etf/{id}', tags: ['Admin ETF'], operationId: 'adminEtfDelete', description: 'Admin session required.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(adminEtfDeleteSchema, 'ETF result'), ...errors([400, 401, 403, 404, 409, 429, 500, 502]) } })

registry.registerPath({ method:'get', path:'/api/etf/watchlist', tags:['ETF'], operationId:'etfWatchlistList', security:[{accessTokenCookie:[]},{bearerAuth:[]}],  responses:{200:json(etfWatchlistListSchema,'ETF watchlist result'),...errors([400,401,403,404,409,500])} })

registry.registerPath({ method:'post', path:'/api/etf/watchlist', tags:['ETF'], operationId:'etfWatchlistAdd', security:[{accessTokenCookie:[]},{bearerAuth:[]}], request: { body: json(etfWatchlistCreateSchema, 'Catalog symbol') }, responses:{200:json(etfWatchlistItemSchema,'ETF watchlist result'),...errors([400,401,403,404,409,500])} })

registry.registerPath({ method:'delete', path:'/api/etf/watchlist/{id}', tags:['ETF'], operationId:'etfWatchlistRemove', security:[{accessTokenCookie:[]},{bearerAuth:[]}], request: { params: z.object({ id: serializedIdSchema }) }, responses:{200:json(deleteDiaryResponseSchema,'ETF watchlist result'),...errors([400,401,403,404,409,500])} })

registry.registerPath({method:'get',path:'/api/market/rotation-monitor',tags:['Market'],operationId:'rotationMonitor',description:'Guest-accessible persisted market rotation monitor. Filters, sorting and exports are computed from the public payload.',security:[{}, {accessTokenCookie:[]}, {bearerAuth:[]}],request:{query:marketRotationMonitorQuerySchema},responses:{200:json(marketRotationMonitorResponseSchema,'Persisted rotation monitor'),...errors([400,401,404,500])}})
registry.registerPath({method:'get',path:'/api/market/state/snapshot',tags:['Market'],operationId:'marketStateSnapshot',description:'Guest-accessible persisted market breadth state. Stale or under-covered rows resolve to unknown.',security:[{}, {accessTokenCookie:[]}, {bearerAuth:[]}],request:{query:marketStateSnapshotQuerySchema},responses:{200:json(MarketStateSnapshot,'Latest configured-universe market state'),...errors([400,401,404,500])}})
registry.registerPath({method:'get',path:'/api/market/state/history',tags:['Market'],operationId:'marketStateHistory',description:'Guest-accessible persisted market breadth history, newest first.',security:[{}, {accessTokenCookie:[]}, {bearerAuth:[]}],request:{query:marketStateHistoryQuerySchema},responses:{200:json(MarketStateHistory,'Market state history'),...errors([400,401,500])}})
registry.registerPath({method:'post',path:'/api/admin/market/rotation-batch',tags:['Admin'],operationId:'rotationBatch',security:[{accessTokenCookie:[]},{bearerAuth:[]}],request:{body:json(rotationBatchRequestSchema,'Rotation scope')},responses:{200:json(rotationBatchResponseSchema,'Completed rotation scope results'),...errors([400,401,403,409,500,503])}})

registry.registerPath({ method:'get',path:'/api/etf/{symbol}/profile',tags:['ETF'],operationId:'etfProfile',description:'Guest-accessible ETF research with partial and stale metadata.',security:[{}, {accessTokenCookie:[]}, {bearerAuth:[]}],request:{params:z.object({symbol:marketSymbolSchema}),query:etfProfileQuerySchema},responses:{200:json(etfProfileSchema,'Public ETF research with partial/stale metadata'),...errors([400,401,500])} })

registry.registerPath({ method:'get',path:'/api/etf/{symbol}/risk',tags:['ETF'],operationId:'etfRisk',description:'Guest-accessible ETF risk research with partial and stale metadata.',security:[{}, {accessTokenCookie:[]}, {bearerAuth:[]}],request:{params:z.object({symbol:marketSymbolSchema}),query:etfProfileQuerySchema},responses:{200:json(etfProfileSchema.pick({ symbol:true,benchmark:true,period:true,risk:true,meta:true }),'Public ETF research with partial/stale metadata'),...errors([400,401,500])} })

registry.registerPath({ method:'get',path:'/api/etf/{symbol}/valuation',tags:['ETF'],operationId:'etfValuation',description:'Guest-accessible ETF fund details with partial and stale metadata.',security:[{}, {accessTokenCookie:[]}, {bearerAuth:[]}],request:{params:z.object({symbol:marketSymbolSchema}),query:etfProfileQuerySchema},responses:{200:json(etfProfileSchema.pick({ symbol:true,benchmark:true,period:true,valuation:true,meta:true }),'Public ETF research with partial/stale metadata'),...errors([400,401,500])} })

registry.registerPath({ method:'get',path:'/api/etf/{symbol}/rs',tags:['ETF'],operationId:'etfRs',description:'Guest-accessible ETF relative-return research with partial and stale metadata.',security:[{}, {accessTokenCookie:[]}, {bearerAuth:[]}],request:{params:z.object({symbol:marketSymbolSchema}),query:etfProfileQuerySchema},responses:{200:json(etfProfileSchema.pick({ symbol:true,benchmark:true,period:true,rs:true,meta:true }),'Public ETF research with partial/stale metadata'),...errors([400,401,500])} })

registry.registerPath({ method: 'get', path: '/api/tools/sec-filings/companies', tags: ['SEC Filings'], operationId: 'secCompanySearch', description: 'Guest-accessible SEC company search backed by a configured SEC EDGAR provider.', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: secCompanySearchQuerySchema }, responses: { 200: json(SecCompanySearchResponse, 'SEC company search results and cache metadata'), ...errors([400, 401, 429, 502, 503]) } })
registry.registerPath({ method: 'get', path: '/api/tools/sec-filings/companies/{cik}/filings', tags: ['SEC Filings'], operationId: 'secFilingList', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ cik: z.string().regex(/^\d{1,10}$/) }), query: secFilingListQuerySchema }, responses: { 200: json(SecFilingPageResponse, 'SEC filing page and cache metadata'), ...errors([400, 401, 404, 429, 502, 503]) } })
registry.registerPath({ method: 'get', path: '/api/tools/sec-filings/companies/{cik}/filings/{accession}', tags: ['SEC Filings'], operationId: 'secFilingDetail', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ cik: z.string().regex(/^\d{1,10}$/), accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/) }) }, responses: { 200: json(SecFilingDetailResponse, 'SEC filing detail and document index'), ...errors([400, 401, 404, 429, 502, 503]) } })
const secBinaryResponse = { description: 'SEC document or ZIP package', content: { 'application/octet-stream': { schema: z.string().openapi({ format: 'binary' }) }, 'application/zip': { schema: z.string().openapi({ format: 'binary' }) } } }
registry.registerPath({ method: 'get', path: '/api/tools/sec-filings/companies/{cik}/filings/{accession}/documents/{basename}', tags: ['SEC Filings'], operationId: 'secFilingDocument', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ cik: z.string().regex(/^\d{1,10}$/), accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/), basename: z.string().min(1).max(255) }) }, responses: { 200: secBinaryResponse, ...errors([400, 401, 404, 413, 429, 502, 503]) } })
registry.registerPath({ method: 'get', path: '/api/tools/sec-filings/companies/{cik}/filings/{accession}/package', tags: ['SEC Filings'], operationId: 'secFilingPackage', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ cik: z.string().regex(/^\d{1,10}$/), accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/) }), query: z.object({ include: z.array(z.enum(['all', 'primary', 'complete', 'xbrl', 'exhibits', 'pdf'])).optional() }) }, responses: { 200: secBinaryResponse, ...errors([400, 401, 404, 413, 429, 502, 503]) } })
registry.registerPath({ method: 'get', path: '/api/tools/sec-filings/batch', tags: ['SEC Filings'], operationId: 'secFilingBatchPackage', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: secBatchQuerySchema }, responses: { 200: secBinaryResponse, ...errors([400, 401, 404, 413, 429, 502, 503]) } })

const PostPublicListResponse = registry.register('PostPublicListResponse', postPublicListResponseSchema.clone())
const PostPublicDetail = registry.register('PostPublicDetail', postPublicDetailSchema.clone())
const PostAdminListResponse = registry.register('PostAdminListResponse', postAdminListResponseSchema.clone())
const PostAdminDetail = registry.register('PostAdminDetail', postAdminDetailSchema.clone())
const PostWriteRequest = registry.register('PostWriteRequest', postWriteRequestSchema.clone())
const PostBulkRequest = registry.register('PostBulkRequest', postBulkRequestSchema.clone())
const PostBulkResponse = registry.register('PostBulkResponse', postBulkResponseSchema.clone())
const PostDeleteResponse = registry.register('PostDeleteResponse', postDeleteResponseSchema.clone())

registry.registerPath({ method: 'get', path: '/api/blog', tags: ['Blog'], operationId: 'blogPublicList', security: [{}], request: { query: postListQuerySchema.clone() }, responses: { 200: json(PostPublicListResponse, 'Published public articles'), ...errors([400, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/{slug}', tags: ['Blog'], operationId: 'blogPublicDetail', security: [{}], request: { params: z.object({ slug: z.string().min(1).max(255) }) }, responses: { 200: json(PostPublicDetail, 'Published public article'), ...errors([404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/admin', tags: ['Blog'], operationId: 'blogAdminList', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: postAdminListQuerySchema.clone() }, responses: { 200: json(PostAdminListResponse, 'Admin article list'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/admin/{id}', tags: ['Blog'], operationId: 'blogAdminDetail', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostAdminDetail, 'Admin article detail'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog', tags: ['Blog'], operationId: 'blogCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(PostWriteRequest, 'Admin article') }, responses: { 200: json(PostAdminDetail, 'Created article'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'put', path: '/api/blog/{id}', tags: ['Blog'], operationId: 'blogUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }), body: json(PostWriteRequest, 'Admin article') }, responses: { 200: json(PostAdminDetail, 'Updated article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/blog/{id}', tags: ['Blog'], operationId: 'blogDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostDeleteResponse, 'Deleted article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/{id}/publish', tags: ['Blog'], operationId: 'blogPublish', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostAdminDetail, 'Published article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/{id}/archive', tags: ['Blog'], operationId: 'blogArchive', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostAdminDetail, 'Archived article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/bulk-publish', tags: ['Blog'], operationId: 'blogBulkPublish', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(PostBulkRequest, 'Article IDs') }, responses: { 200: json(PostBulkResponse, 'Published article count'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/bulk-delete', tags: ['Blog'], operationId: 'blogBulkDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(PostBulkRequest, 'Article IDs') }, responses: { 200: json(PostBulkResponse, 'Deleted article count'), ...errors([400, 401, 403, 500]) } })
