import { z } from 'zod'
import { ledgerTransactionInputSchema, ledgerTransactionResponseSchema, ledgerTransactionUpdateInputSchema } from './ledger.js'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
import { alertDraftSchema, alertResponseSchema } from './alerts.js'
import { linkedTradePlanResponseSchema } from './trade-plan.js'

export { calendarDateSchema, MAX_SERIALIZED_ID, serializedIdSchema, utcInstantSchema } from './common.js'
export {
  postAdminDetailSchema,
  postAdminListItemSchema,
  postAdminListQuerySchema,
  postAdminListResponseSchema,
  postBulkRequestSchema,
  postBulkResponseSchema,
  postCategorySchema,
  postDeleteResponseSchema,
  postListQuerySchema,
  postPublicDetailSchema,
  postPublicListItemSchema,
  postPublicListResponseSchema,
  postStatusSchema,
  postWriteRequestSchema,
} from './post.js'
export type { PostAdminDetail, PostAdminListResponse, PostPublicDetail, PostPublicListResponse, PostStatus, PostWriteRequest } from './post.js'
export {
  adminDiaryListQuerySchema,
  adminDiaryListResponseSchema,
  adminDiarySchema,
  adminStatsResponseSchema,
  adminStatsSchema,
  adminUserDeleteResponseSchema,
  adminUserListItemSchema,
  adminUserListQuerySchema,
  adminUserListResponseSchema,
  adminUserRoleResponseSchema,
  adminUserRoleSchema,
  adminUserRoleUpdateRequestSchema,
} from './admin-users.js'
export type { AdminDiary, AdminStats, AdminUserListItem } from './admin-users.js'

export const errorCodes = [
  'AUTH_LOGIN_INVALID_CREDENTIALS',
  'AUTH_NO_REFRESH_TOKEN',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_INVALID',
  'AUTH_TOKEN_NOT_FOUND',
  'AUTH_TOKEN_REVOKED',
  'AUTH_UNAUTHORIZED',
  'AUTH_FORBIDDEN',
  'ETF_NOT_FOUND',
  'ETF_ALREADY_IN_WATCHLIST',
  'AUTH_API_KEY_SCOPE_DENIED',
  'AUTH_RATE_LIMITED',
  'CSRF_FAILED',
  'DIARY_NOT_FOUND',
  'ALERT_NOT_FOUND',
  'PRICE_ALERT_NOT_FOUND',
  'DISCIPLINE_NOT_FOUND',
  'DIARY_ALREADY_EXISTS',
  'TRADE_PLAN_NOT_FOUND',
  'WATCHLIST_ITEM_NOT_FOUND',
  'INVESTMENT_THESIS_NOT_FOUND',
  'INVESTMENT_THESIS_NOT_ACTIVE',
  'STOCK_NOTE_NOT_FOUND',
  'STOCK_NOTE_ACCESS_DENIED',
  'PARTNER_LINK_ACCESS_DENIED',
  'PARTNER_LINK_NOT_FOUND',
  'PARTNER_LINK_ALREADY_EXISTS',
  'PARTNER_LINK_PENDING',
  'USER_EMAIL_EXISTS',
  'USER_NOT_FOUND',
  'SYS_INTERNAL_ERROR',
  'ROTATION_BATCH_BUSY',
  'SYS_EXTERNAL_SERVICE_ERROR',
  'SYS_VALIDATION_ERROR',
  'SYS_NOT_FOUND',
  'BLOG_NOT_FOUND',
  'SEC_CONFIG_MISSING',
  'SEC_VALIDATION_ERROR',
  'SEC_COMPANY_NOT_FOUND',
  'SEC_FILING_NOT_FOUND',
  'SEC_DOCUMENT_NOT_FOUND',
  'SEC_UPSTREAM_RATE_LIMITED',
  'SEC_UPSTREAM_UNAVAILABLE',
  'SEC_UPSTREAM_INVALID_RESPONSE',
  'SEC_QUEUE_FULL',
  'SEC_UNSAFE_REDIRECT',
  'SEC_FILE_TOO_LARGE',
  'SEC_PACKAGE_LIMIT_EXCEEDED',
  'SEC_RATE_LIMITED',
] as const

export type ErrorCode = (typeof errorCodes)[number]

export const apiErrorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  statusMessage: z.string(),
  data: z.object({
    code: z.enum(errorCodes),
    details: z.array(z.object({
      field: z.string().optional(),
      message: z.string().optional(),
      value: z.unknown().optional(),
    }).strict()).nullable(),
    requestId: z.string().min(1),
  }).strict(),
}).strict()

export const authUserSchema = z.object({
  id: serializedIdSchema,
  email: z.email(),
  name: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
  expectedMonthlyTrades: z.number().int().nonnegative(),
  expectedProfit: z.string(),
  expectedAvgHolding: z.string(),
  timezone: z.string().min(1),
}).strict()

// bcrypt only consumes the first 72 UTF-8 bytes; rejecting longer input avoids
// two visibly different passwords authenticating as the same credential.
const bcryptPasswordSchema = z.string().max(72)
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password must be at most 72 UTF-8 bytes')

export const loginRequestSchema = z.object({
  email: z.email(),
  password: bcryptPasswordSchema.min(1),
}).strict()

export const registerRequestSchema = z.object({
  email: z.email(),
  password: bcryptPasswordSchema.min(8),
  name: z.string().optional(),
}).strict()

export const authUserResponseSchema = z.object({
  ok: z.literal(true),
  data: authUserSchema,
}).strict()

export const registerResponseSchema = z.object({
  success: z.literal(true),
  user: z.object({
    id: serializedIdSchema,
    email: z.email(),
    name: z.string().nullable(),
    role: z.enum(['USER', 'ADMIN']),
    expectedMonthlyTrades: z.number().int().nonnegative(),
    expectedProfit: z.string(),
    expectedAvgHolding: z.string(),
    createdAt: utcInstantSchema,
  }).strict(),
}).strict()

export const nativeLoginRequestSchema = z.object({
  email: z.email(),
  password: bcryptPasswordSchema.min(1),
  deviceName: z.string().trim().min(1).max(100).optional(),
}).strict()

export const nativeRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
}).strict()

export const nativeLogoutRequestSchema = nativeRefreshRequestSchema

export const nativeTokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: utcInstantSchema,
  refreshTokenExpiresAt: utcInstantSchema,
  user: authUserSchema,
}).strict()

export const nativeAuthResponseSchema = z.object({
  ok: z.literal(true),
  data: nativeTokenPairSchema,
}).strict()

export const nativeSessionResponseSchema = nativeAuthResponseSchema
export const authMutationResponseSchema = z.object({ ok: z.literal(true) }).strict()

export {
  marketStateSchema,
  marketStateSnapshotQuerySchema,
  marketStateHistoryQuerySchema,
  marketStateSnapshotSchema,
  marketStateHistoryItemSchema,
  marketStateHistoryResponseSchema,
} from './market-state.js'
export type { MarketState, MarketStateSnapshot, MarketStateHistoryItem } from './market-state.js'
export {
  secAmendmentFilterSchema,
  secApiResponseSchema,
  secBatchModeSchema,
  secBatchQuerySchema,
  secCacheMetaSchema,
  secCacheStatusSchema,
  secCompanySchema,
  secCompanySearchQuerySchema,
  secCompanySearchResultSchema,
  secDocumentClassSchema,
  secFilingDetailSchema,
  secFilingDocumentSchema,
  secFilingListQuerySchema,
  secFilingPageSchema,
  secFilingSummarySchema,
  secPackageIncludeSchema,
} from './sec-filings.js'
export type {
  SecAmendmentFilter,
  SecBatchMode,
  SecCacheMeta,
  SecCacheStatus,
  SecCompany,
  SecCompanySearchResult,
  SecDocumentClass,
  SecFilingDetail,
  SecFilingDocument,
  SecFilingFilters,
  SecFilingPage,
  SecFilingSummary,
  SecProviderErrorCode,
} from './sec-filings.js'

export const changePasswordRequestSchema = z.object({
  currentPassword: bcryptPasswordSchema.min(1),
  newPassword: bcryptPasswordSchema.min(8),
}).strict()

export const changePasswordResponseSchema = z.object({
  success: z.literal(true),
  message: z.literal('Password changed successfully. Please login again.'),
}).strict()

const diaryTagsSchema = z.array(z.string().trim().min(1).max(100)).max(50)
  .transform((tags) => [...new Set(tags)])
const nullableDiaryTextSchema = z.string().max(10_000).nullable().optional()
export const diaryAlertInputSchema = alertDraftSchema.extend({ id: serializedIdSchema.optional() }).strict()
export const MAX_DIARY_STOCK_SYMBOLS = 10
const diaryWriteFields = {
  alerts: z.array(diaryAlertInputSchema).max(50).optional(),
  title: z.string().trim().min(1).max(500),
  content: z.string().min(1).max(500_000),
  tags: diaryTagsSchema.optional(),
  date: calendarDateSchema.optional(),
  thesis: nullableDiaryTextSchema,
  risk: nullableDiaryTextSchema,
  execution: nullableDiaryTextSchema,
  reviewDueAt: utcInstantSchema.nullable().optional(),
  stockSymbols: z.array(z.string().trim().min(1).max(20).transform(value => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9. -]*$/))).max(20)
    .transform(values => [...new Set(values)]).pipe(z.array(z.string()).max(MAX_DIARY_STOCK_SYMBOLS)).optional(),
}

export const createDiaryRequestSchema = z.object({
  ...diaryWriteFields,
  transactions: z.array(ledgerTransactionInputSchema).max(100).optional(),
  appendToToday: z.boolean().optional(),
}).strict()
export const updateDiaryRequestSchema = z.object({
  ...diaryWriteFields,
  transactions: z.array(ledgerTransactionUpdateInputSchema).max(100)
    .superRefine((rows, context) => {
      const seen = new Set<string>()
      rows.forEach((row, index) => {
        if (row.id === undefined) return
        if (seen.has(row.id)) context.addIssue({
          code: 'custom', path: [index, 'id'], message: 'Transaction id must not be duplicated',
        })
        seen.add(row.id)
      })
    }).optional(),
}).strict()
export const deleteDiaryResponseSchema = z.object({ success: z.literal(true) }).strict()

export const diaryResponseSchema = z.object({
  id: serializedIdSchema,
  userId: serializedIdSchema,
  title: z.string(),
  content: z.string().nullable(),
  tags: z.array(z.string()),
  tagsString: z.string().nullable(),
  createdVia: z.enum(['WEB', 'API_KEY', 'TELEGRAM_BOT']),
  createdByLabel: z.string().nullable(),
  date: calendarDateSchema,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
  transactions: z.array(ledgerTransactionResponseSchema).optional(),
  alerts: z.array(alertResponseSchema).optional(),
  tradePlans: z.array(linkedTradePlanResponseSchema).optional(),
  tradePlanSummary: z.object({
    total: z.number().int().nonnegative(),
    statuses: z.array(z.object({
      status: z.enum(['draft', 'active', 'closed', 'cancelled']),
      count: z.number().int().positive(),
    }).strict()),
  }).strict().optional(),
  thesis: z.string().nullable().optional(),
  risk: z.string().nullable().optional(),
  execution: z.string().nullable().optional(),
  reviewDueAt: utcInstantSchema.nullable().optional(),
  reviewStatus: z.enum(['none', 'pending', 'reviewed']).nullable().optional(),
  reviewedAt: utcInstantSchema.nullable().optional(),
  reviewOutcome: z.enum(['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR']).nullable().optional(),
  reviewSummary: z.string().nullable().optional(),
  reviewLearning: z.string().nullable().optional(),
  reviewAdjustment: z.string().nullable().optional(),
  stockSymbols: z.array(z.string()),
}).strict()

export const diaryByDateQuerySchema = z.object({ date: calendarDateSchema }).strict()
export const diaryByDateResponseSchema = diaryResponseSchema.nullable()

export type AuthUser = z.infer<typeof authUserSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type RegisterRequest = z.infer<typeof registerRequestSchema>
export type NativeLoginRequest = z.infer<typeof nativeLoginRequestSchema>
export type NativeTokenPair = z.infer<typeof nativeTokenPairSchema>
export type NativeSession = NativeTokenPair
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
export type CreateDiaryRequest = z.infer<typeof createDiaryRequestSchema>
export type UpdateDiaryRequest = z.infer<typeof updateDiaryRequestSchema>
export type DiaryResponse = z.infer<typeof diaryResponseSchema>
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>
