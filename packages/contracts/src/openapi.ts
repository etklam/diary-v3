import { registerAiOpenApi } from './ai-openapi.js'
import { registerResearchOpenApi } from './research-openapi.js'
import {
  accountEmailMutationResponseSchema,
  accountEmailRequestSchema,
  adminEmailRevisionRequestSchema,
  adminEmailSettingsResponseSchema,
  adminEmailSettingsUpdateSchema,
  adminEmailTestRequestSchema,
  adminEmailTestResponseSchema,
  authCapabilitiesSchema,
  passwordResetCompleteRequestSchema,
  registrationCompleteRequestSchema,
} from './account-email.js'
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
import { writeAchievementSchema, achievementResponseSchema, achievementListSchema, deleteAchievementResponseSchema } from './achievements.js'
import { writeGoalSchema, goalResponseSchema, goalListSchema, deleteGoalResponseSchema } from './goals.js'
import { createPriceAlertRequestSchema, updatePriceAlertRequestSchema, priceAlertListResponseSchema, priceAlertResponseSchema } from './price-alerts.js'
import { alertCreateRequestWireOpenApiSchema, alertListResponseSchema, alertResponseSchema } from './alerts.js'
import { performanceQuerySchema, performanceResponseSchema } from './performance.js'
import { portfolioAttentionQuerySchema, portfolioAttentionResponseSchema } from './portfolio-attention.js'
import { portfolioLedgerResponseSchema, portfolioOverviewResponseSchema } from './portfolio-overview.js'
import { portfolioExposureResponseSchema } from './portfolio-exposure.js'
import { companyHubResponseSchema } from './company-hub.js'
import { reviewGroupsResponseSchema, reviewQueueQuerySchema } from './review-queue.js'
import { thesisScheduleInputSchema, saveInvestmentThesisRequestSchema, completeThesisReviewRequestSchema, investmentThesisResponseSchema, investmentThesisMutationResponseSchema, thesisReviewResponseSchema, thesisReviewListParamsSchema } from './investment-thesis.js'
import { stockNoteCreateRequestSchema, stockNoteUpdateRequestSchema, stockNoteListParamsSchema, stockNoteListResponseSchema, stockNoteResponseSchema } from './stock-note.js'
import { webEvidenceRequestSchema, stockTimelineQuerySchema, stockTimelineRecordSchema, stockTimelineListResponseSchema, stockSymbolTimelineResponseSchema } from './evidence.js'
import { stockSymbolSchema } from './watchlist.js'
import { stockWatchlistCreateRequestSchema, stockWatchlistUpdateRequestSchema, stockWatchlistMutationResponseSchema, stockWatchlistResponseSchema, stockWatchlistReorderRequestSchema, stockWatchlistReorderResponseSchema, stockWatchlistDeleteResponseSchema } from './watchlist.js'
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
import { diarySavedViewCreateRequestSchema, diarySavedViewDeleteResponseSchema, diarySavedViewListResponseSchema, diarySavedViewUpdateRequestSchema, diarySavedViewSchema } from './diary-saved-view.js'
import { diarySummaryListResponseSchema } from './diary-summary.js'
import { diaryActivityQuerySchema, diaryActivityResponseSchema } from './diary-activity.js'
import { recentDiaryTagsResponseSchema } from './diary-tags.js'
import { articleTranslationBatchRequestSchema, articleTranslationBatchResponseSchema, articleTranslationStatesQuerySchema, articleTranslationStatesResponseSchema } from './article-translation.js'
import { activityTimelineQuerySchema, activityTimelineResponseSchema } from './activity-timeline.js'
import { holidayResponseSchema } from './calendar.js'
import { diaryReviewWorkflowResponseSchema, diaryReviewWorkflowInputSchema, diaryReviewScheduleInputSchema, diaryReviewResponseSchema, structuredReviewInputSchema } from './review.js'
import { tradePlanInputSchema, tradePlanUpdateSchema, tradePlanListQuerySchema, tradePlanResponseSchema, tradePlanListResponseSchema, deleteTradePlanResponseSchema } from './trade-plan.js'
import { tradePlanExecutionBaselineCreateSchema, tradePlanExecutionBaselineHistoryQuerySchema, tradePlanExecutionBaselineHistoryResponseSchema, tradePlanExecutionCandidatesQuerySchema, tradePlanExecutionCandidatesResponseSchema, tradePlanExecutionComparisonSchema, tradePlanExecutionUpdateSchema } from './trade-plan-execution.js'
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
  postPublicMetadataSchema,
  postWriteRequestSchema,
  postListQuerySchema,
} from './post.js'
import {
  articleTranslationActionResponseSchema,
  articleTranslationAdminResponseSchema,
  articleTranslationAiDefaultUpdateSchema,
  articleTranslationAiProviderSaveSchema,
  articleTranslationAiProviderSchema,
  articleTranslationAiProvidersResponseSchema,
  articleTranslationAiProviderUpdateSchema,
  articleTranslationEditRequestSchema,
  articleTranslationJobRequestSchema,
  articleTranslationJobResponseSchema,
} from './article-translation.js'
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
  adminGuruCreateRequestSchema,
  adminGuruUpdateRequestSchema,
  adminGuruResponseSchema,
  adminGuruListQuerySchema,
  adminGuruListResponseSchema,
} from './admin-gurus.js'
import { guruDirectoryQuerySchema, guruDirectoryResponseSchema, guruFollowResponseSchema, guruOverviewResponseSchema } from './gurus.js'
import { sharedPromptActionSchema, sharedPromptAuditSchema, sharedPromptKeySchema, sharedPromptListSchema, sharedPromptPlaygroundResponseSchema, sharedPromptPlaygroundSchema, sharedPromptSaveSchema, sharedPromptVersionSchema } from './shared-prompts.js'
import {
  guruActivityQuerySchema,
  guruActivityResponseSchema,
  guruChangesResponseSchema,
  guruFilingsResponseSchema,
  guruHistoryResponseSchema,
  guruPortfolioResponseSchema,
  guruPositionHistoryQuerySchema,
  guruPositionHistoryResponseSchema,
  guruResearchQuerySchema,
} from './guru-research.js'
import {
  guruConsensusQuerySchema,
  guruConsensusResponseSchema,
  guruSectorsQuerySchema,
  guruSectorsResponseSchema,
  guruStocksExportQuerySchema,
  guruStocksQuerySchema,
  guruStocksResponseSchema,
} from './guru-consensus.js'
import { guruComparisonQuerySchema, guruComparisonResponseSchema } from './guru-comparison.js'
import { adminGuruAnalysisListResponseSchema, adminGuruAnalysisRequestSchema, adminGuruAnalysisResponseSchema, guruAnalysisResponseSchema } from './guru-analysis.js'
import {
  diaryGuruSnapshotCreateRequestSchema,
  diaryGuruSnapshotListResponseSchema,
  diaryGuruSnapshotResponseSchema,
  guruNotificationListQuerySchema,
  guruNotificationListResponseSchema,
  guruNotificationPreferencesResponseSchema,
  guruNotificationPreferencesUpdateSchema,
  guruNotificationReadRequestSchema,
  guruNotificationReadResponseSchema,
  guruStockWatchResponseSchema,
} from './guru-notifications.js'
import {
  adminInstitutionalDiagnosticsResponseSchema,
  adminInstitutionalFilingDetailResponseSchema,
  adminInstitutionalFilingListQuerySchema,
  adminInstitutionalFilingListResponseSchema,
  adminInstitutionalJobResponseSchema,
  adminInstitutionalOverviewResponseSchema,
  adminInstitutionalRebuildRequestSchema,
} from './admin-institutional-operations.js'
import { stockGuruResearchQuerySchema, stockGuruResearchResponseSchema } from './stock-gurus.js'
import {
  adminInstitutionalIdentityEventCreateRequestSchema,
  adminInstitutionalIdentityEventListQuerySchema,
  adminInstitutionalIdentityEventListResponseSchema,
  adminInstitutionalIdentityEventResponseSchema,
  adminInstitutionalMappingListQuerySchema,
  adminInstitutionalMappingListResponseSchema,
  adminInstitutionalMappingRefreshJobResponseSchema,
  adminInstitutionalMappingOverrideRequestSchema,
  adminInstitutionalMappingOverrideResponseSchema,
  adminInstitutionalSecurityCreateRequestSchema,
  adminInstitutionalSecurityCreateResponseSchema,
  adminInstitutionalSecurityListQuerySchema,
  adminInstitutionalSecurityListResponseSchema,
  adminInstitutionalSecurityResponseSchema,
} from './admin-institutional.js'
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
  updateDiaryV2RequestSchema,
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
const UpdateDiaryV2Request = registry.register('UpdateDiaryV2Request', updateDiaryV2RequestSchema.clone())
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
const DiarySummaryListResponse = registry.register('DiarySummaryListResponse', diarySummaryListResponseSchema.clone())
const DiarySearchSnippetHeaders = z.object({ 'x-diary-search-snippet': z.string().optional() }).strict()
const DiarySavedView = registry.register('DiarySavedView', diarySavedViewSchema.clone())
const DiarySavedViewListResponse = registry.register('DiarySavedViewListResponse', diarySavedViewListResponseSchema.clone())
const DiarySavedViewDeleteResponse = registry.register('DiarySavedViewDeleteResponse', diarySavedViewDeleteResponseSchema.clone())
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
const AdminGuruResponse = registry.register('AdminGuruResponse', adminGuruResponseSchema.clone())
const AdminGuruListResponse = registry.register('AdminGuruListResponse', adminGuruListResponseSchema.clone())
const GuruDirectoryResponse = registry.register('GuruDirectoryResponse', guruDirectoryResponseSchema.clone())
const GuruOverviewResponse = registry.register('GuruOverviewResponse', guruOverviewResponseSchema.clone())
const GuruFollowResponse = registry.register('GuruFollowResponse', guruFollowResponseSchema.clone())
const GuruPortfolioResponse = registry.register('GuruPortfolioResponse', guruPortfolioResponseSchema.clone())
const GuruChangesResponse = registry.register('GuruChangesResponse', guruChangesResponseSchema.clone())
const GuruHistoryResponse = registry.register('GuruHistoryResponse', guruHistoryResponseSchema.clone())
const GuruPositionHistoryResponse = registry.register('GuruPositionHistoryResponse', guruPositionHistoryResponseSchema.clone())
const GuruFilingsResponse = registry.register('GuruFilingsResponse', guruFilingsResponseSchema.clone())
const GuruActivityResponse = registry.register('GuruActivityResponse', guruActivityResponseSchema.clone())
const GuruComparisonResponse = registry.register('GuruComparisonResponse', guruComparisonResponseSchema.clone())
const GuruAnalysisResponse = registry.register('GuruAnalysisResponse', guruAnalysisResponseSchema.clone())
const AdminGuruAnalysisResponse = registry.register('AdminGuruAnalysisResponse', adminGuruAnalysisResponseSchema.clone())
const AdminGuruAnalysisListResponse = registry.register('AdminGuruAnalysisListResponse', adminGuruAnalysisListResponseSchema.clone())
const AdminInstitutionalOverviewResponse = registry.register('AdminInstitutionalOverviewResponse', adminInstitutionalOverviewResponseSchema.clone())
const AdminInstitutionalFilingListResponse = registry.register('AdminInstitutionalFilingListResponse', adminInstitutionalFilingListResponseSchema.clone())
const AdminInstitutionalFilingDetailResponse = registry.register('AdminInstitutionalFilingDetailResponse', adminInstitutionalFilingDetailResponseSchema.clone())
const AdminInstitutionalJobResponse = registry.register('AdminInstitutionalJobResponse', adminInstitutionalJobResponseSchema.clone())
const AdminInstitutionalDiagnosticsResponse = registry.register('AdminInstitutionalDiagnosticsResponse', adminInstitutionalDiagnosticsResponseSchema.clone())
const GuruNotificationPreferencesResponse = registry.register('GuruNotificationPreferencesResponse', guruNotificationPreferencesResponseSchema.clone())
const GuruNotificationListResponse = registry.register('GuruNotificationListResponse', guruNotificationListResponseSchema.clone())
const GuruNotificationReadResponse = registry.register('GuruNotificationReadResponse', guruNotificationReadResponseSchema.clone())
const GuruStockWatchResponse = registry.register('GuruStockWatchResponse', guruStockWatchResponseSchema.clone())
const DiaryGuruSnapshotResponse = registry.register('DiaryGuruSnapshotResponse', diaryGuruSnapshotResponseSchema.clone())
const DiaryGuruSnapshotListResponse = registry.register('DiaryGuruSnapshotListResponse', diaryGuruSnapshotListResponseSchema.clone())
const StockGuruResearchResponse = registry.register('StockGuruResearchResponse', stockGuruResearchResponseSchema.clone())
const SharedPromptListResponse = registry.register('SharedPromptListResponse', sharedPromptListSchema.clone())
const SharedPromptVersionResponse = registry.register('SharedPromptVersionResponse', sharedPromptVersionSchema.clone())
const SharedPromptPlaygroundResponse = registry.register('SharedPromptPlaygroundResponse', sharedPromptPlaygroundResponseSchema.clone())
const SharedPromptAuditResponse = registry.register('SharedPromptAuditResponse', sharedPromptAuditSchema.clone())
const AdminInstitutionalSecurityResponse = registry.register('AdminInstitutionalSecurityResponse', adminInstitutionalSecurityResponseSchema.clone())
const AdminInstitutionalSecurityCreateResponse = registry.register('AdminInstitutionalSecurityCreateResponse', adminInstitutionalSecurityCreateResponseSchema.clone())
const AdminInstitutionalSecurityListResponse = registry.register('AdminInstitutionalSecurityListResponse', adminInstitutionalSecurityListResponseSchema.clone())
const AdminInstitutionalMappingListResponse = registry.register('AdminInstitutionalMappingListResponse', adminInstitutionalMappingListResponseSchema.clone())
const AdminInstitutionalMappingOverrideResponse = registry.register('AdminInstitutionalMappingOverrideResponse', adminInstitutionalMappingOverrideResponseSchema.clone())
const AdminInstitutionalIdentityEventResponse = registry.register('AdminInstitutionalIdentityEventResponse', adminInstitutionalIdentityEventResponseSchema.clone())
const AdminInstitutionalIdentityEventListResponse = registry.register('AdminInstitutionalIdentityEventListResponse', adminInstitutionalIdentityEventListResponseSchema.clone())
const AdminInstitutionalMappingRefreshJobResponse = registry.register('AdminInstitutionalMappingRefreshJobResponse', adminInstitutionalMappingRefreshJobResponseSchema.clone())
const AuthCapabilities = registry.register('AuthCapabilities', authCapabilitiesSchema.clone())
const AccountEmailRequest = registry.register('AccountEmailRequest', accountEmailRequestSchema.clone())
const RegistrationCompleteRequest = registry.register('RegistrationCompleteRequest', registrationCompleteRequestSchema.clone())
const PasswordResetCompleteRequest = registry.register('PasswordResetCompleteRequest', passwordResetCompleteRequestSchema.clone())
const AccountEmailMutationResponse = registry.register('AccountEmailMutationResponse', accountEmailMutationResponseSchema.clone())
const AdminEmailSettingsResponse = registry.register('AdminEmailSettingsResponse', adminEmailSettingsResponseSchema.clone())
const AdminEmailSettingsUpdate = registry.register('AdminEmailSettingsUpdate', adminEmailSettingsUpdateSchema.clone())
const AdminEmailTestRequest = registry.register('AdminEmailTestRequest', adminEmailTestRequestSchema.clone())
const AdminEmailTestResponse = registry.register('AdminEmailTestResponse', adminEmailTestResponseSchema.clone())
const AdminEmailRevisionRequest = registry.register('AdminEmailRevisionRequest', adminEmailRevisionRequestSchema.clone())


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
registry.registerPath({ method: 'get', path: '/api/auth/capabilities', tags: ['Auth'], operationId: 'authCapabilities', responses: { 200: json(AuthCapabilities, 'Public registration and password recovery capabilities'), ...errors([500]) } })
registry.registerPath({ method: 'post', path: '/api/auth/registration/request', tags: ['Auth'], operationId: 'authRegistrationRequest', request: { body: json(AccountEmailRequest, 'Request registration verification') }, responses: { 200: json(AccountEmailMutationResponse, 'Generic registration email request accepted'), ...errors([400, 401, 429, 500]) } })
registry.registerPath({ method: 'post', path: '/api/auth/registration/complete', tags: ['Auth'], operationId: 'authRegistrationComplete', request: { body: json(RegistrationCompleteRequest, 'Complete email-verified registration') }, responses: { 200: json(AccountEmailMutationResponse, 'Account created'), ...errors([400, 401, 409, 429, 500]) } })
registry.registerPath({ method: 'post', path: '/api/auth/password-reset/request', tags: ['Auth'], operationId: 'authPasswordResetRequest', request: { body: json(AccountEmailRequest, 'Request password reset') }, responses: { 200: json(AccountEmailMutationResponse, 'Generic password reset email request accepted'), ...errors([400, 401, 429, 500]) } })
registry.registerPath({ method: 'post', path: '/api/auth/password-reset/complete', tags: ['Auth'], operationId: 'authPasswordResetComplete', request: { body: json(PasswordResetCompleteRequest, 'Complete password reset') }, responses: { 200: json(AccountEmailMutationResponse, 'Password changed and sessions ended'), ...errors([400, 401, 409, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/email-settings', tags: ['Admin mail'], operationId: 'adminEmailSettingsGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(AdminEmailSettingsResponse, 'SMTP configuration without secrets and recent delivery history'), ...errors([401, 403, 500]) } })
registry.registerPath({ method: 'put', path: '/api/admin/email-settings', tags: ['Admin mail'], operationId: 'adminEmailSettingsUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(AdminEmailSettingsUpdate, 'Save SMTP settings using the expected revision') }, responses: { 200: json(AdminEmailSettingsResponse, 'Saved SMTP settings'), ...errors([400, 401, 403, 409, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/email-settings/test', tags: ['Admin mail'], operationId: 'adminEmailSettingsTest', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(AdminEmailTestRequest, 'Test the saved SMTP revision with a fixed message') }, responses: { 200: json(AdminEmailTestResponse, 'SMTP test outcome'), ...errors([400, 401, 403, 409, 500]) } })
for (const action of ['enable', 'disable', 'clear'] as const) registry.registerPath({ method: 'post', path: `/api/admin/email-settings/${action}`, tags: ['Admin mail'], operationId: `adminEmailSettings${action[0]!.toUpperCase()}${action.slice(1)}`, security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(AdminEmailRevisionRequest, 'Apply action at expected settings revision') }, responses: { 200: json(AdminEmailSettingsResponse, `SMTP settings ${action}d`), ...errors([400, 401, 403, 409, 500]) } })
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
  method: 'put', path: '/api/diaries/{id}', tags: ['Diaries'], operationId: 'diariesUpdate',
  description: 'Compatibility operation. expectedRevision is optional; when omitted this preserves legacy last-writer replacement semantics. New clients should use the versioned operation.',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: {
    params: z.object({ id: serializedIdSchema }),
    body: { content: { 'application/json': { schema: UpdateDiaryRequest } } },
  },
  responses: { 200: json(DiaryResponse, 'Diary updated. Revision is optional for compatibility; when present it is checked.'), ...errors([400, 401, 403, 404, 409, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/v2/diaries/{id}', tags: ['Diaries'], operationId: 'diariesUpdateV2',
  description: 'Versioned full replacement. expectedRevision is required; stale revisions are rejected without mutation.',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: {
    params: z.object({ id: serializedIdSchema }),
    body: { content: { 'application/json': { schema: UpdateDiaryV2Request } } },
  },
  responses: { 200: json(DiaryResponse, 'Diary updated with optimistic concurrency'), ...errors([400, 401, 403, 404, 409, 500]) },
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
  method: 'get', path: '/api/diaries/summary', tags: ['Diaries'], operationId: 'diariesSummaryList',
  description: 'Bounded discovery feed: server-generated excerpt, display-bounded tags and symbols, plus transaction/alert counts. Full content, graphs and private Review text never appear.',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: diaryListQuerySchema.clone(), headers: DiarySearchSnippetHeaders },
  responses: { 200: json(DiarySummaryListResponse, 'Owner-scoped bounded diary summary page'), ...errors([400, 401, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/diaries/saved-views', tags: ['Diaries'], operationId: 'diarySavedViewsList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(DiarySavedViewListResponse, 'Owner saved diary views'), ...errors([401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/diaries/saved-views', tags: ['Diaries'], operationId: 'diarySavedViewCreate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: json(diarySavedViewCreateRequestSchema.clone(), 'Create a named diary view') },
  responses: { 201: json(DiarySavedView, 'Created owner saved diary view'), ...errors([400, 401, 409, 500]) },
})
registry.registerPath({
  method: 'patch', path: '/api/diaries/saved-views/{id}', tags: ['Diaries'], operationId: 'diarySavedViewUpdate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), body: json(diarySavedViewUpdateRequestSchema.clone(), 'Rename or update a saved diary view') },
  responses: { 200: json(DiarySavedView, 'Updated owner saved diary view'), ...errors([400, 401, 404, 409, 500]) },
})
registry.registerPath({
  method: 'delete', path: '/api/diaries/saved-views/{id}', tags: ['Diaries'], operationId: 'diarySavedViewDelete',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(DiarySavedViewDeleteResponse, 'Deleted owner saved diary view'), ...errors([400, 401, 404, 500]) },
})

const RecentDiaryTagsResponse = registry.register('RecentDiaryTagsResponse', recentDiaryTagsResponseSchema.clone())
registry.registerPath({
  method: 'get', path: '/api/diaries/recent-tags', tags: ['Diaries'], operationId: 'diariesRecentTagsGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  responses: { 200: json(RecentDiaryTagsResponse, 'Tags most recently used by the signed-in account'), ...errors([401, 500]) },
})

registry.registerPath({
  method: 'get', path: '/api/diaries/activity', tags: ['Diaries'], operationId: 'diariesActivityGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: diaryActivityQuerySchema.clone() },
  responses: { 200: json(DiaryActivityResponse, 'Civil-date activity for an inclusive range of at most 371 days'), ...errors([400, 401, 500]) },
})

const ActivityTimelineResponse = registry.register('ActivityTimelineResponse', activityTimelineResponseSchema.clone())
registry.registerPath({
  method: 'get', path: '/api/timeline', tags: ['Diaries'], operationId: 'activityTimelineGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: activityTimelineQuerySchema.clone() },
  responses: {
    200: json(ActivityTimelineResponse, 'Merged diary, trade and review events newest first; private reflection text is excluded by construction'),
    ...errors([400, 401, 500]),
  },
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
const TradePlanExecutionComparison = registry.register('TradePlanExecutionComparison', tradePlanExecutionComparisonSchema.clone())
const TradePlanExecutionCandidatesResponse = registry.register('TradePlanExecutionCandidatesResponse', tradePlanExecutionCandidatesResponseSchema.clone())
const TradePlanExecutionBaselineHistoryResponse = registry.register('TradePlanExecutionBaselineHistoryResponse', tradePlanExecutionBaselineHistoryResponseSchema.clone())
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
registry.registerPath({
  method: 'get', path: '/api/trade-plans/{id}/execution', tags: ['Trade Plans'], operationId: 'tradePlanExecutionGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(TradePlanExecutionComparison, 'Owner plan execution comparison'), ...errors([400, 401, 404, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/trade-plans/{id}/execution-baseline', tags: ['Trade Plans'], operationId: 'tradePlanExecutionBaselineCreate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: tradePlanExecutionBaselineCreateSchema.clone() } } } },
  responses: { 200: json(TradePlanExecutionComparison, 'Confirmed owner plan execution baseline'), ...errors([400, 401, 403, 404, 409, 500]) },
})
registry.registerPath({
  method: 'put', path: '/api/trade-plans/{id}/execution', tags: ['Trade Plans'], operationId: 'tradePlanExecutionUpdate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: tradePlanExecutionUpdateSchema.clone() } } } },
  responses: { 200: json(TradePlanExecutionComparison, 'Updated owner plan execution selection'), ...errors([400, 401, 403, 404, 409, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/trade-plans/{id}/execution-candidates', tags: ['Trade Plans'], operationId: 'tradePlanExecutionCandidatesList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), query: tradePlanExecutionCandidatesQuerySchema.clone() },
  responses: { 200: json(TradePlanExecutionCandidatesResponse, 'Owner execution candidates for a plan symbol'), ...errors([400, 401, 404, 500]) },
})
registry.registerPath({
  method: 'get', path: '/api/trade-plans/{id}/execution-baselines', tags: ['Trade Plans'], operationId: 'tradePlanExecutionBaselineHistoryList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { params: z.object({ id: serializedIdSchema }), query: tradePlanExecutionBaselineHistoryQuerySchema.clone() },
  responses: { 200: json(TradePlanExecutionBaselineHistoryResponse, 'Owner immutable plan execution baseline history'), ...errors([400, 401, 404, 500]) },
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
const WatchlistReorderResponse = registry.register('StockWatchlistReorderResponse', stockWatchlistReorderResponseSchema.clone())
const WatchlistManagementHeaders = z.object({ 'x-watchlist-features': z.string().optional() }).strict()
registry.registerPath({
  method: 'get', path: '/api/stocks/watchlist', tags: ['Stocks'], operationId: 'stockWatchlistList',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { headers: WatchlistManagementHeaders },
  responses: { 200: json(WatchlistResponse, 'First 100 active owner items ordered by sortOrder and ID'), ...errors([401, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/stocks/watchlist', tags: ['Stocks'], operationId: 'stockWatchlistUpsert',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { headers: WatchlistManagementHeaders, body: { content: { 'application/json': { schema: stockWatchlistCreateRequestSchema.clone() } } } },
  responses: { 200: json(WatchlistMutation, 'Created or restored owner item'), ...errors([400, 401, 403, 500]) },
})
registry.registerPath({
  method: 'patch', path: '/api/stocks/watchlist/{id}', tags: ['Stocks'], operationId: 'stockWatchlistUpdate',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { headers: WatchlistManagementHeaders, params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: stockWatchlistUpdateRequestSchema.clone() } } } },
  responses: { 200: json(WatchlistMutation, 'Updated owner item'), ...errors([400, 401, 403, 404, 500]) },
})
registry.registerPath({
  method: 'post', path: '/api/stocks/watchlist/reorder', tags: ['Stocks'], operationId: 'stockWatchlistReorder',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: json(stockWatchlistReorderRequestSchema.clone(), 'Move one owner item within its pinned group') },
  responses: { 200: json(WatchlistReorderResponse, 'Updated owner watchlist order'), ...errors([400, 401, 404, 500]) },
})
registry.registerPath({
  method: 'delete', path: '/api/stocks/watchlist/{id}', tags: ['Stocks'], operationId: 'stockWatchlistArchive',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) },
  responses: { 200: json(stockWatchlistDeleteResponseSchema.clone(), 'Archived owner item'), ...errors([400, 401, 403, 404, 500]) },
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
registry.registerPath({ method: 'get', path: '/api/reviews', tags: ['Review'], operationId: 'reviewQueueGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: reviewQueueQuerySchema.clone() }, responses: { 200: json(reviewGroupsResponseSchema.clone(), 'Five review groups with independent bucket pages (legacy page remains a fallback), plus absolute per-bucket counts for the requested target scope'), ...errors([400, 401, 500]) } })
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

registry.registerPath({ method: 'get', path: '/api/portfolio/ledger', tags: ['Stocks'], operationId: 'portfolioLedgerGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(portfolioLedgerResponseSchema.clone(), 'Owner ledger holdings, exposure and recent trades from one replay without provider requests'), ...errors([401, 500]) } })
registry.registerPath({ method: 'get', path: '/api/portfolio/overview', tags: ['Stocks'], operationId: 'portfolioOverviewGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(portfolioOverviewResponseSchema.clone(), 'Owner-scoped Overview valuation and attention sections from one ledger snapshot'), ...errors([401, 500]) } })

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

registry.registerPath({ method: 'get', path: '/api/achievements', tags: ['Achievements'], operationId: 'achievementsGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(achievementListSchema.clone(), 'Personal achievements ordered newest first'), ...errors([401, 500]) } })
registry.registerPath({ method: 'post', path: '/api/achievements', tags: ['Achievements'], operationId: 'achievementsCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(writeAchievementSchema.clone(), 'Personal achievement input') }, responses: { 200: json(achievementResponseSchema.clone(), 'Personal achievement created'), ...errors([400, 401, 500]) } })
registry.registerPath({ method: 'put', path: '/api/achievements/{id}', tags: ['Achievements'], operationId: 'achievementsUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(writeAchievementSchema.clone(), 'Personal achievement input') }, responses: { 200: json(achievementResponseSchema.clone(), 'Personal achievement updated'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/achievements/{id}', tags: ['Achievements'], operationId: 'achievementsDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(deleteAchievementResponseSchema.clone(), 'Personal achievement deleted'), ...errors([400, 401, 404, 500]) } })

registry.registerPath({ method: 'get', path: '/api/goals', tags: ['Achievements'], operationId: 'goalsGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(goalListSchema.clone(), 'Personal goals ordered active first, then by target date'), ...errors([401, 500]) } })
registry.registerPath({ method: 'post', path: '/api/goals', tags: ['Achievements'], operationId: 'goalsCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(writeGoalSchema.clone(), 'Personal goal input') }, responses: { 200: json(goalResponseSchema.clone(), 'Personal goal created'), ...errors([400, 401, 500]) } })
registry.registerPath({ method: 'put', path: '/api/goals/{id}', tags: ['Achievements'], operationId: 'goalsUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(writeGoalSchema.clone(), 'Personal goal input') }, responses: { 200: json(goalResponseSchema.clone(), 'Personal goal updated'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/goals/{id}', tags: ['Achievements'], operationId: 'goalsDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(deleteGoalResponseSchema.clone(), 'Personal goal deleted'), ...errors([400, 401, 404, 500]) } })

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
registry.registerPath({ method: 'get', path: '/api/admin/gurus', tags: ['Admin Gurus'], operationId: 'adminGurusList', description: 'Admin session required. Literal case-insensitive name, manager label, slug, and CIK search. Newest profiles first; editorial fields are separate from SEC manager identity.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: adminGuruListQuerySchema.clone() }, responses: { 200: json(AdminGuruListResponse, 'Paginated Guru profiles'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/gurus/{id}', tags: ['Admin Gurus'], operationId: 'adminGuruGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminGuruResponse, 'Guru editorial profile and manager identity'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/gurus', tags: ['Admin Gurus'], operationId: 'adminGuruCreate', description: 'Admin session required. Creates an editorial profile and a unique SEC manager identity atomically; CIK is stored as ten digits.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(adminGuruCreateRequestSchema.clone(), 'Guru editorial profile and positive CIK') }, responses: { 201: json(AdminGuruResponse, 'Created Guru profile'), ...errors([400, 401, 403, 409, 500]) } })
registry.registerPath({ method: 'put', path: '/api/admin/gurus/{id}', tags: ['Admin Gurus'], operationId: 'adminGuruUpdate', description: 'Admin session required. Replaces editable profile fields and CIK atomically.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(adminGuruUpdateRequestSchema.clone(), 'Replacement profile and manager CIK') }, responses: { 200: json(AdminGuruResponse, 'Updated Guru profile'), ...errors([400, 401, 403, 404, 409, 500]) } })

registry.registerPath({ method: 'get', path: '/api/gurus', tags: ['Gurus'], operationId: 'guruDirectory', description: 'Public Guru discovery backed by prepared portfolio analytics. Follower identities are never returned.', request: { query: guruDirectoryQuerySchema.clone() }, responses: { 200: json(GuruDirectoryResponse, 'Filtered and sorted Guru directory'), ...errors([400, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}', tags: ['Gurus'], operationId: 'guruOverview', description: 'Public editorial profile and prepared SEC-derived portfolio summary, with reported period and filing source metadata.', request: { params: z.object({ slug: z.string().min(1).max(80) }) }, responses: { 200: json(GuruOverviewResponse, 'Guru overview and prepared portfolio context'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/portfolio', tags: ['Gurus'], operationId: 'guruPortfolio', description: 'Quarter-aware holdings and filters from the active effective snapshot and prepared holding changes.', request: { params: z.object({ slug: z.string().min(1).max(80) }), query: guruResearchQuerySchema.clone() }, responses: { 200: json(GuruPortfolioResponse, 'Prepared Guru quarter holdings'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/changes', tags: ['Gurus'], operationId: 'guruChanges', description: 'Deterministic quarter actions calculated from comparable reported share counts.', request: { params: z.object({ slug: z.string().min(1).max(80) }), query: guruResearchQuerySchema.clone() }, responses: { 200: json(GuruChangesResponse, 'Categorized quarter changes'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/history', tags: ['Gurus'], operationId: 'guruHistory', description: 'Every ingested quarter with its data-quality state and prepared portfolio analytics.', request: { params: z.object({ slug: z.string().min(1).max(80) }) }, responses: { 200: json(GuruHistoryResponse, 'Prepared portfolio history'), ...errors([404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/position-history', tags: ['Gurus'], operationId: 'guruPositionHistory', description: 'Historical reported quantity, value, weight, rank and action for one stable position identity.', request: { params: z.object({ slug: z.string().min(1).max(80) }), query: guruPositionHistoryQuerySchema.clone() }, responses: { 200: json(GuruPositionHistoryResponse, 'Guru position history'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/filings', tags: ['Gurus'], operationId: 'guruFilings', description: 'Filing state and SEC source lineage, including amendment operations and source documents.', request: { params: z.object({ slug: z.string().min(1).max(80) }) }, responses: { 200: json(GuruFilingsResponse, 'Guru filing records and sources'), ...errors([404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/activity', tags: ['Gurus'], operationId: 'guruActivity', description: 'Prepared platform activity from each active Guru’s latest ready quarter, or a selected quarter.', request: { query: guruActivityQuerySchema.clone() }, responses: { 200: json(GuruActivityResponse, 'Filtered Guru activity'), ...errors([400, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/consensus', tags: ['Gurus'], operationId: 'guruConsensus', description: 'Prepared cross-Guru stock breadth and deterministic buyer/seller classification with quarter coverage.', request: { query: guruConsensusQuerySchema.clone() }, responses: { 200: json(guruConsensusResponseSchema, 'Prepared Guru consensus rankings'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/compare', tags: ['Gurus'], operationId: 'guruCompare', description: 'Compare two to five active Gurus using current effective SEC portfolios, prepared analytics, and deterministic holding actions.', request: { query: guruComparisonQuerySchema.clone() }, responses: { 200: json(GuruComparisonResponse, 'Quarter-aware Guru comparison'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/stocks/{symbol}/gurus', tags: ['Gurus'], operationId: 'stockGuruResearch', description: 'Guest-accessible stock Guru ownership and history backed by prepared consensus snapshots. Queued quarters suppress stale metrics.', request: { params: z.object({ symbol: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/) }), query: stockGuruResearchQuerySchema.clone() }, responses: { 200: json(StockGuruResearchResponse, 'Stock-level Guru holders, activity and history'), ...errors([400, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/stocks', tags: ['Gurus'], operationId: 'guruStocks', description: 'Prepared stock rankings by ownership breadth, adds, reductions, exits, aggregate portfolio weight, and quarter trend.', request: { query: guruStocksQuerySchema.clone() }, responses: { 200: json(guruStocksResponseSchema, 'Prepared Guru stock rankings'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/stocks.csv', tags: ['Gurus'], operationId: 'guruStocksExport', description: 'CSV export of prepared consensus stock rows with report period and coverage context.', request: { query: guruStocksExportQuerySchema.clone() }, responses: { 200: { description: 'CSV consensus stock export', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/sectors', tags: ['Gurus'], operationId: 'guruSectors', description: 'Prepared sector, industry, and explicitly mapped theme allocation and action direction.', request: { query: guruSectorsQuerySchema.clone() }, responses: { 200: json(guruSectorsResponseSchema, 'Prepared Guru sector intelligence'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/portfolio.csv', tags: ['Gurus'], operationId: 'guruPortfolioExport', description: 'CSV export of the filtered prepared holdings with report period and SEC source lineage.', request: { params: z.object({ slug: z.string().min(1).max(80) }), query: guruResearchQuerySchema.clone() }, responses: { 200: { description: 'CSV holdings export', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/changes.csv', tags: ['Gurus'], operationId: 'guruChangesExport', description: 'CSV export of deterministic quarter changes with report period and SEC source lineage.', request: { params: z.object({ slug: z.string().min(1).max(80) }), query: guruResearchQuerySchema.clone() }, responses: { 200: { description: 'CSV quarter changes export', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/position-history.csv', tags: ['Gurus'], operationId: 'guruPositionHistoryExport', description: 'CSV export of a position’s quarter history with report period and SEC source lineage.', request: { params: z.object({ slug: z.string().min(1).max(80) }), query: guruPositionHistoryQuerySchema.clone() }, responses: { 200: { description: 'CSV position history export', content: { 'text/csv': { schema: { type: 'string' } } } }, ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/{slug}/analysis', tags: ['Gurus'], operationId: 'guruAnalysis', description: 'Prepared structured facts and, when generated, the auditable AI interpretation for one reported quarter. Facts and interpretation are separate fields and the code-owned 13F disclosures are always present.', request: { params: z.object({ slug: z.string().min(1).max(80) }), query: z.object({ period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }) }, responses: { 200: json(GuruAnalysisResponse, 'Guru quarter facts, analysis state and generation provenance'), ...errors([400, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/gurus/{id}/analysis', tags: ['Admin Gurus'], operationId: 'adminGuruAnalysisList', description: 'Admin-only generation history with prompt, provider, token and invalidation provenance.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminGuruAnalysisListResponse, 'Guru analysis runs'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/gurus/{id}/analysis', tags: ['Admin Gurus'], operationId: 'adminGuruAnalysisRequest', description: 'Admin-only generation or explicit regeneration for one prepared quarter. An unchanged structured input and prompt version reuse the existing result instead of spending budget.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(adminGuruAnalysisRequestSchema.clone(), 'Quarter and generation mode') }, responses: { 200: json(AdminGuruAnalysisResponse, 'Reused existing analysis'), 202: json(AdminGuruAnalysisResponse, 'Queued analysis run'), ...errors([400, 401, 403, 404, 409, 429, 500, 503]) } })
registry.registerPath({ method: 'get', path: '/api/admin/ai/prompt-registry', tags: ['Admin AI'], operationId: 'sharedPromptRegistryList', description: 'Admin-only immutable system defaults and versioned database overrides for supported AI modules.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(SharedPromptListResponse, 'Prompt defaults and override versions'), ...errors([401, 403, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/ai/prompt-registry/{key}/versions', tags: ['Admin AI'], operationId: 'sharedPromptVersionSave', description: 'Admin-only immutable new prompt version. Variables and immutable guardrails are validated by the server.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ key: sharedPromptKeySchema.clone() }), body: json(sharedPromptSaveSchema.clone(), 'Versioned prompt template') }, responses: { 200: json(SharedPromptVersionResponse, 'Saved prompt version'), ...errors([400, 401, 403, 409, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/ai/prompt-registry/{key}/actions', tags: ['Admin AI'], operationId: 'sharedPromptVersionAction', description: 'Admin-only create, duplicate, activate, rollback, archive, or disable an override using optimistic revision checks.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ key: sharedPromptKeySchema.clone() }), body: json(sharedPromptActionSchema.clone(), 'Prompt lifecycle action') }, responses: { 200: json(sharedPromptVersionSchema.nullable(), 'Updated active version or empty override state'), ...errors([400, 401, 403, 404, 409, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/ai/prompt-registry/{key}/audit', tags: ['Admin AI'], operationId: 'sharedPromptAuditList', description: 'Admin-only immutable audit events for prompt changes, activation, rollback, archive, and tests.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ key: sharedPromptKeySchema.clone() }) }, responses: { 200: json(SharedPromptAuditResponse, 'Prompt lifecycle audit history'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/ai/prompt-registry/{key}/playground', tags: ['Admin AI'], operationId: 'sharedPromptPlayground', description: 'Admin-only rendered prompt preview or quota-accounted synthetic test. The response marks test usage separately from production.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ key: sharedPromptKeySchema.clone() }), body: json(sharedPromptPlaygroundSchema.clone(), 'Prompt preview or test') }, responses: { 200: json(SharedPromptPlaygroundResponse, 'Rendered prompts and validation/test output'), ...errors([400, 401, 403, 404, 409, 429, 500, 502, 503]) } })
registry.registerPath({ method: 'put', path: '/api/gurus/{slug}/follow', tags: ['Gurus'], operationId: 'guruFollow', description: 'Signed-in user action. Following is private; the response returns only the aggregate follower count and the caller’s follow state.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ slug: z.string().min(1).max(80) }) }, responses: { 200: json(GuruFollowResponse, 'Follow state and aggregate follower count'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/gurus/{slug}/follow', tags: ['Gurus'], operationId: 'guruUnfollow', description: 'Signed-in user action. Removes only the caller’s private follow.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ slug: z.string().min(1).max(80) }) }, responses: { 200: json(GuruFollowResponse, 'Follow state and aggregate follower count'), ...errors([400, 401, 404, 500]) } })

registry.registerPath({ method: 'get', path: '/api/gurus/notifications/preferences', tags: ['Gurus'], operationId: 'guruNotificationPreferencesRead', description: 'Signed-in member. Returns the caller\u2019s own notification settings, followed Gurus and watched stocks. Other members\u2019 follows are never returned.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(GuruNotificationPreferencesResponse, 'Notification settings and private watch lists'), ...errors([401, 500]) } })
registry.registerPath({ method: 'put', path: '/api/gurus/notifications/preferences', tags: ['Gurus'], operationId: 'guruNotificationPreferencesUpdate', description: 'Signed-in member. Each event type can be enabled or disabled, and meaningful-change thresholds accept a portfolio weight and/or a reported quantity-change percentage.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(guruNotificationPreferencesUpdateSchema.clone(), 'Notification settings') }, responses: { 200: json(GuruNotificationPreferencesResponse, 'Updated notification settings'), ...errors([400, 401, 500]) } })
registry.registerPath({ method: 'get', path: '/api/gurus/notifications', tags: ['Gurus'], operationId: 'guruNotificationList', description: 'Signed-in member inbox of delivered Guru events. Deliveries are idempotent, so a retried job never produces a duplicate row.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: guruNotificationListQuerySchema.clone() }, responses: { 200: json(GuruNotificationListResponse, 'Delivered notifications and unread count'), ...errors([400, 401, 500]) } })
registry.registerPath({ method: 'post', path: '/api/gurus/notifications/read', tags: ['Gurus'], operationId: 'guruNotificationMarkRead', description: 'Signed-in member. Marks the listed notifications, or every unread notification, as read.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(guruNotificationReadRequestSchema.clone(), 'Notification identifiers, or an empty object for all') }, responses: { 200: json(GuruNotificationReadResponse, 'Updated and remaining unread counts'), ...errors([400, 401, 500]) } })
registry.registerPath({ method: 'get', path: '/api/stocks/{symbol}/guru-watch', tags: ['Gurus'], operationId: 'guruStockWatchRead', description: 'Signed-in member. Returns only the caller\u2019s own watch state for a stock\u2019s Guru activity.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ symbol: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/) }) }, responses: { 200: json(GuruStockWatchResponse, 'Private watch state'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'put', path: '/api/stocks/{symbol}/guru-watch', tags: ['Gurus'], operationId: 'guruStockWatchAdd', description: 'Signed-in member. Watches a stock\u2019s Guru activity. The ticker must resolve to exactly one tracked security.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ symbol: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/) }) }, responses: { 200: json(GuruStockWatchResponse, 'Private watch state'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/stocks/{symbol}/guru-watch', tags: ['Gurus'], operationId: 'guruStockWatchRemove', description: 'Signed-in member. Removes only the caller\u2019s watch.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ symbol: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,14}$/) }) }, responses: { 200: json(GuruStockWatchResponse, 'Private watch state'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/diaries/{id}/guru-snapshots', tags: ['Gurus'], operationId: 'diaryGuruSnapshotList', description: 'Signed-in owner. Decision-time Guru context attached to one diary entry.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(DiaryGuruSnapshotListResponse, 'Attached decision snapshots'), ...errors([400, 401, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/diaries/{id}/guru-snapshots', tags: ['Gurus'], operationId: 'diaryGuruSnapshotCreate', description: 'Signed-in owner. Attaches the prepared Guru holder count, actions and weights the author saw. The stored snapshot is immutable: later quarters and analytics rebuilds cannot change it, and generated prose is never part of it.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(diaryGuruSnapshotCreateRequestSchema.clone(), 'Stock symbol and optional reported quarter') }, responses: { 200: json(DiaryGuruSnapshotResponse, 'Existing snapshot for this stock and quarter'), 201: json(DiaryGuruSnapshotResponse, 'Captured snapshot'), ...errors([400, 401, 404, 409, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/overview', tags: ['Admin Institutional'], operationId: 'adminInstitutionalOverview', description: 'Admin-only operational state: SEC scheduler fairness counters, queue depths, processing versions, and per-manager discovery, filing, quarter, mapping, and AI counts.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(AdminInstitutionalOverviewResponse, 'Institutional operations overview'), ...errors([401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/filings', tags: ['Admin Institutional'], operationId: 'adminInstitutionalFilingList', description: 'Admin-only filing index filtered by Guru, state, reported quarter, or literal accession/CIK/name search.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: adminInstitutionalFilingListQuerySchema.clone() }, responses: { 200: json(AdminInstitutionalFilingListResponse, 'Filings and ingestion state'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/filings/{id}', tags: ['Admin Institutional'], operationId: 'adminInstitutionalFilingDetail', description: 'Admin-only filing inspector: documents, preserved raw artifacts, parsed rows with their mapping state, the effective snapshot and its amendment sources, and the prepared analytics row.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminInstitutionalFilingDetailResponse, 'Filing lineage'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/gurus/{id}/sync', tags: ['Admin Institutional'], operationId: 'adminInstitutionalSync', description: 'Admin-only. Brings the next SEC discovery check forward. Repeating it cannot stack jobs and never interrupts a held worker lease.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminInstitutionalJobResponse, 'Already queued or running'), 202: json(AdminInstitutionalJobResponse, 'Discovery queued'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/institutional/filings/{id}/reprocess', tags: ['Admin Institutional'], operationId: 'adminInstitutionalReprocess', description: 'Admin-only. Returns one filing to the ingestion queue and reuses its preserved raw artifacts; parsed rows are replaced, never deleted without a replacement.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminInstitutionalJobResponse, 'Already queued'), 202: json(AdminInstitutionalJobResponse, 'Reprocess queued'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/gurus/{id}/rebuild', tags: ['Admin Institutional'], operationId: 'adminInstitutionalRebuild', description: 'Admin-only. Requests one more effective-snapshot rebuild revision for a reported quarter, which republishes analytics and consensus downstream.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(adminInstitutionalRebuildRequestSchema.clone(), 'Reported quarter end') }, responses: { 200: json(AdminInstitutionalJobResponse, 'Rebuild already pending'), 202: json(AdminInstitutionalJobResponse, 'Rebuild queued'), ...errors([400, 401, 403, 404, 409, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/diagnostics', tags: ['Admin Institutional'], operationId: 'adminInstitutionalDiagnostics', description: 'Admin-only diagnostics download. It reports processing versions, scheduler state, queue depths, and per-manager counts, and redacts provider credentials, raw filing content, AI text, and user identities.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(AdminInstitutionalDiagnosticsResponse, 'Diagnostics export'), ...errors([401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/securities', tags: ['Admin Institutional'], operationId: 'adminInstitutionalSecuritiesList', description: 'Admin-only securities master search. Identity is independent of ticker; identifiers carry validity dates and source provenance.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: adminInstitutionalSecurityListQuerySchema.clone() }, responses: { 200: json(AdminInstitutionalSecurityListResponse, 'Securities and dated identifiers'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/securities/{id}', tags: ['Admin Institutional'], operationId: 'adminInstitutionalSecurityGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminInstitutionalSecurityResponse, 'Security master record and complete dated identifier history'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/institutional/securities', tags: ['Admin Institutional'], operationId: 'adminInstitutionalSecurityCreate', description: 'Admin-only. Creates an independent security identity with a manually verified primary-source URL and exact dated CUSIP/FIGI/ticker identifiers, then starts a resumable mapping refresh job for matching historical filings.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(adminInstitutionalSecurityCreateRequestSchema.clone(), 'Security master record and dated identifiers') }, responses: { 201: json(AdminInstitutionalSecurityCreateResponse, 'Created security and mapping refresh job state'), ...errors([400, 401, 403, 409, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/mappings', tags: ['Admin Institutional'], operationId: 'adminInstitutionalMappingsList', description: 'Admin-only exact-identifier mapping queue. Omitting status shows unresolved and ambiguous holdings; status=MANUAL_OVERRIDE shows prior audited decisions. Search can match the accession; an exact unique accession also returns filing coverage.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: adminInstitutionalMappingListQuerySchema.clone() }, responses: { 200: json(AdminInstitutionalMappingListResponse, 'Holding resolutions, candidates, override audit and optional filing coverage'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/institutional/mappings/{holdingId}/override', tags: ['Admin Institutional'], operationId: 'adminInstitutionalMappingOverride', description: 'Admin-only append-only manual mapping. Each correction supersedes the preceding override and preserves its actor, timestamp, evidence and reason.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ holdingId: serializedIdSchema.clone() }), body: json(adminInstitutionalMappingOverrideRequestSchema.clone(), 'Security identity and manually verified source') }, responses: { 201: json(AdminInstitutionalMappingOverrideResponse, 'Saved manual mapping and immutable override audit'), ...errors([400, 401, 403, 404, 409, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/institutional/mappings/refresh-jobs/{id}/run', tags: ['Admin Institutional'], operationId: 'adminInstitutionalMappingRefreshJobRun', description: 'Admin-only resumable refresh of existing filings affected by a new exact security identifier. Processing is cursor-based, idempotent, bounded to 50 filings per call, and preserves manual overrides.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }) }, responses: { 200: json(AdminInstitutionalMappingRefreshJobResponse, 'Current refresh job state and batch size'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/admin/institutional/securities/{id}/identity-events', tags: ['Admin Institutional'], operationId: 'adminInstitutionalIdentityEventsList', description: 'Admin-only immutable corporate-action audit history; evidence URLs are manually verified issuer or SEC sources.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), query: adminInstitutionalIdentityEventListQuerySchema.clone() }, responses: { 200: json(AdminInstitutionalIdentityEventListResponse, 'Identity events for the security'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/institutional/securities/{id}/identity-events', tags: ['Admin Institutional'], operationId: 'adminInstitutionalIdentityEventCreate', description: 'Admin-only append-only identity event. Ticker changes keep one security ID; splits and class continuity require conversion ratios; mergers and spin-offs remain non-comparable; delisting has no successor.', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema.clone() }), body: json(adminInstitutionalIdentityEventCreateRequestSchema.clone(), 'Corporate-action event with manually verified issuer or SEC source') }, responses: { 201: json(AdminInstitutionalIdentityEventResponse, 'Saved immutable identity event'), ...errors([400, 401, 403, 404, 409, 500]) } })
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
const PostPublicMetadata = registry.register('PostPublicMetadata', postPublicMetadataSchema.clone())
const PostAdminListResponse = registry.register('PostAdminListResponse', postAdminListResponseSchema.clone())
const PostAdminDetail = registry.register('PostAdminDetail', postAdminDetailSchema.clone())
const PostWriteRequest = registry.register('PostWriteRequest', postWriteRequestSchema.clone())
const PostBulkRequest = registry.register('PostBulkRequest', postBulkRequestSchema.clone())
const PostBulkResponse = registry.register('PostBulkResponse', postBulkResponseSchema.clone())
const PostDeleteResponse = registry.register('PostDeleteResponse', postDeleteResponseSchema.clone())
const ArticleTranslationAdminResponse = registry.register('ArticleTranslationAdminResponse', articleTranslationAdminResponseSchema.clone())
const ArticleTranslationJobRequest = registry.register('ArticleTranslationJobRequest', articleTranslationJobRequestSchema.clone())
const ArticleTranslationJobResponse = registry.register('ArticleTranslationJobResponse', articleTranslationJobResponseSchema.clone())
const ArticleTranslationEditRequest = registry.register('ArticleTranslationEditRequest', articleTranslationEditRequestSchema.clone())
const ArticleTranslationActionResponse = registry.register('ArticleTranslationActionResponse', articleTranslationActionResponseSchema.clone())
const ArticleTranslationAiProvider = registry.register('ArticleTranslationAiProvider', articleTranslationAiProviderSchema.clone())
const ArticleTranslationAiProviderSave = registry.register('ArticleTranslationAiProviderSave', articleTranslationAiProviderSaveSchema.clone())
const ArticleTranslationAiProviderUpdate = registry.register('ArticleTranslationAiProviderUpdate', articleTranslationAiProviderUpdateSchema.clone())
const ArticleTranslationAiProvidersResponse = registry.register('ArticleTranslationAiProvidersResponse', articleTranslationAiProvidersResponseSchema.clone())
const ArticleTranslationAiDefaultUpdate = registry.register('ArticleTranslationAiDefaultUpdate', articleTranslationAiDefaultUpdateSchema.clone())

registry.registerPath({ method: 'get', path: '/api/blog', tags: ['Blog'], operationId: 'blogPublicList', security: [{}], request: { query: postListQuerySchema.clone() }, responses: { 200: json(PostPublicListResponse, 'Published public articles'), ...errors([400, 401, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/{slug}/metadata', tags: ['Blog'], operationId: 'blogPublicMetadata', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ slug: z.string().min(1).max(255) }) }, responses: { 200: json(PostPublicMetadata, 'Published article metadata without body content'), ...errors([401, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/{slug}', tags: ['Blog'], operationId: 'blogPublicDetail', security: [{}, { accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ slug: z.string().min(1).max(255) }) }, responses: { 200: json(PostPublicDetail, 'Published article body'), ...errors([401, 404, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/admin', tags: ['Blog'], operationId: 'blogAdminList', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { query: postAdminListQuerySchema.clone() }, responses: { 200: json(PostAdminListResponse, 'Admin article list'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/admin/{id}', tags: ['Blog'], operationId: 'blogAdminDetail', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostAdminDetail, 'Admin article detail'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog', tags: ['Blog'], operationId: 'blogCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(PostWriteRequest, 'Admin article') }, responses: { 200: json(PostAdminDetail, 'Created article'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'put', path: '/api/blog/{id}', tags: ['Blog'], operationId: 'blogUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }), body: json(PostWriteRequest, 'Admin article') }, responses: { 200: json(PostAdminDetail, 'Updated article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'delete', path: '/api/blog/{id}', tags: ['Blog'], operationId: 'blogDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostDeleteResponse, 'Deleted article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/{id}/publish', tags: ['Blog'], operationId: 'blogPublish', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostAdminDetail, 'Published article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/{id}/archive', tags: ['Blog'], operationId: 'blogArchive', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(PostAdminDetail, 'Archived article'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/bulk-publish', tags: ['Blog'], operationId: 'blogBulkPublish', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(PostBulkRequest, 'Article IDs') }, responses: { 200: json(PostBulkResponse, 'Published article count'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/bulk-delete', tags: ['Blog'], operationId: 'blogBulkDelete', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(PostBulkRequest, 'Article IDs') }, responses: { 200: json(PostBulkResponse, 'Deleted article count'), ...errors([400, 401, 403, 500]) } })
registry.registerPath({ method: 'get', path: '/api/blog/admin/{id}/translations', tags: ['Blog translations'], operationId: 'blogTranslationsAdminGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(ArticleTranslationAdminResponse, 'Translation drafts and published snapshots'), ...errors([400, 401, 403, 404, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/{id}/translations/jobs', tags: ['Blog translations'], operationId: 'blogTranslationJobsCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }), body: json(ArticleTranslationJobRequest, 'Locales and explicit provider selection') }, responses: { 200: json(ArticleTranslationJobResponse, 'Persistent translation job IDs'), ...errors([400, 401, 403, 404, 409, 500]) } })
registry.registerPath({ method: 'put', path: '/api/blog/admin/{id}/translations/{locale}', tags: ['Blog translations'], operationId: 'blogTranslationDraftEdit', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema, locale: z.enum(['zh-TW', 'zh-CN', 'en']) }), body: json(ArticleTranslationEditRequest, 'Manually edited translation draft') }, responses: { 200: json(ArticleTranslationActionResponse, 'Saved translation draft'), ...errors([400, 401, 403, 404, 500]) } })
for (const [action, operationId, description] of [
  ['review', 'blogTranslationDraftReview', 'Review the current translation draft'],
  ['publish', 'blogTranslationPublish', 'Publish a reviewed translation snapshot'],
  ['unpublish', 'blogTranslationUnpublish', 'Unpublish a translation snapshot'],
] as const) registry.registerPath({ method: 'post', path: `/api/blog/admin/{id}/translations/{locale}/${action}`, tags: ['Blog translations'], operationId, security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema, locale: z.enum(['zh-TW', 'zh-CN', 'en']) }) }, responses: { 200: json(ArticleTranslationActionResponse, description), ...errors([400, 401, 403, 404, 409, 500]) } })
registry.registerPath({ method: 'post', path: '/api/blog/admin/{id}/translations/{locale}/retranslate', tags: ['Blog translations'], operationId: 'blogTranslationRetranslate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema, locale: z.enum(['zh-TW', 'zh-CN', 'en']) }), body: json(articleTranslationJobRequestSchema.pick({ provider: true }).clone(), 'Explicit provider selection') }, responses: { 200: json(ArticleTranslationJobResponse, 'Persistent translation job ID'), ...errors([400, 401, 403, 404, 409, 500]) } })
const ArticleTranslationStatesResponse = registry.register('ArticleTranslationStatesResponse', articleTranslationStatesResponseSchema.clone())
registry.registerPath({
  method: 'get', path: '/api/admin/article-translations/states', tags: ['Articles'], operationId: 'articleTranslationStatesGet',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { query: articleTranslationStatesQuerySchema.clone() },
  responses: { 200: json(ArticleTranslationStatesResponse, 'Translation state for the requested admin articles'), ...errors([400, 401, 403, 500]) },
})
const ArticleTranslationBatchRequest = registry.register('ArticleTranslationBatchRequest', articleTranslationBatchRequestSchema.clone())
const ArticleTranslationBatchResponse = registry.register('ArticleTranslationBatchResponse', articleTranslationBatchResponseSchema.clone())
registry.registerPath({
  method: 'post', path: '/api/admin/article-translations/jobs', tags: ['Articles'], operationId: 'articleTranslationBatchJobsPost',
  security: [{ accessTokenCookie: [] }, { bearerAuth: [] }],
  request: { body: json(ArticleTranslationBatchRequest, 'Queue translation for several articles') },
  responses: { 200: json(ArticleTranslationBatchResponse, 'Per article and locale outcome'), ...errors([400, 401, 403, 429, 500]) },
})
registry.registerPath({ method: 'get', path: '/api/admin/article-translations/ai-providers', tags: ['Blog translations'], operationId: 'articleTranslationAiProvidersGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], responses: { 200: json(ArticleTranslationAiProvidersResponse, 'Configured OpenAI-compatible translation providers without API keys'), ...errors([401, 403, 500]) } })
registry.registerPath({ method: 'post', path: '/api/admin/article-translations/ai-providers', tags: ['Blog translations'], operationId: 'articleTranslationAiProviderCreate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(ArticleTranslationAiProviderSave, 'OpenAI-compatible Chat Completions provider profile') }, responses: { 200: json(ArticleTranslationAiProvider, 'Created provider profile without API key'), ...errors([400, 401, 403, 409, 500]) } })
registry.registerPath({ method: 'put', path: '/api/admin/article-translations/ai-providers/{id}', tags: ['Blog translations'], operationId: 'articleTranslationAiProviderUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }), body: json(ArticleTranslationAiProviderUpdate, 'Update provider profile at the expected revision') }, responses: { 200: json(ArticleTranslationAiProvider, 'Updated provider profile without API key'), ...errors([400, 401, 403, 404, 409, 500]) } })
registry.registerPath({ method: 'put', path: '/api/admin/article-translations/ai-providers/default', tags: ['Blog translations'], operationId: 'articleTranslationAiProviderDefaultUpdate', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { body: json(ArticleTranslationAiDefaultUpdate, 'Set or clear the default provider used by new translation jobs') }, responses: { 200: json(ArticleTranslationAiProvidersResponse, 'Selected default provider'), ...errors([400, 401, 403, 404, 409, 500]) } })

registerAiOpenApi(registry, ApiErrorResponse)
registerResearchOpenApi(registry, ApiErrorResponse)

registry.registerPath({ method: 'get', path: '/api/diaries/{id}/review-workflow', tags: ['Review'], operationId: 'diaryReviewWorkflowGet', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }) }, responses: { 200: json(diaryReviewWorkflowResponseSchema.clone(), 'Versioned owner review'), ...errors([401, 404, 500]) } })
registry.registerPath({ method: 'patch', path: '/api/diaries/{id}/review-workflow', tags: ['Review'], operationId: 'diaryReviewWorkflowSave', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: diaryReviewWorkflowInputSchema.clone() } } } }, responses: { 200: json(diaryReviewWorkflowResponseSchema.clone(), 'Confirmed review and new revision'), ...errors([400, 401, 404, 409, 500]) } })
registry.registerPath({ method: 'patch', path: '/api/diaries/{id}/review-schedule', tags: ['Review'], operationId: 'diaryReviewSchedule', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ id: serializedIdSchema }), body: { content: { 'application/json': { schema: diaryReviewScheduleInputSchema.clone() } } } }, responses: { 200: json(diaryReviewWorkflowResponseSchema.clone(), 'Schedule-only update'), ...errors([400, 401, 404, 409, 500]) } })
registry.registerPath({ method: 'patch', path: '/api/stocks/{symbol}/thesis/review-schedule', tags: ['Review'], operationId: 'thesisReviewSchedule', security: [{ accessTokenCookie: [] }, { bearerAuth: [] }], request: { params: z.object({ symbol: stockSymbolSchema }), body: { content: { 'application/json': { schema: thesisScheduleInputSchema.clone() } } } }, responses: { 200: json(investmentThesisMutationResponseSchema.clone(), 'Schedule-only update'), ...errors([400, 401, 404, 409, 500]) } })
