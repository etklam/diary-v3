import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { serializedIdSchema } from './common.js'
import * as ai from './ai-reports.js'
import * as admin from './admin-ai.js'

export function registerAiOpenApi(registry: OpenAPIRegistry, errorSchema: z.ZodType) {
  const schemas = new Map<z.ZodType, z.ZodType>()
  for (const [name, schema] of Object.entries({ ...ai, ...admin })) {
    if (schema instanceof z.ZodType) schemas.set(schema, registry.register(name.replace(/Schema$/, '').replace(/^./, letter => letter.toUpperCase()), schema.clone()))
  }
  const json = (schema: z.ZodType, description: string) => ({ description, content: { 'application/json': { schema: schemas.get(schema) ?? schema.clone() } } })
  const failures = Object.fromEntries([400, 401, 403, 404, 409, 413, 429, 500, 502, 503].map(status => [status, json(errorSchema, 'Request could not be completed')]))
  const security: Array<Record<string, string[]>> = [{ accessTokenCookie: [] }, { bearerAuth: [] }]
  const id = z.object({ id: serializedIdSchema })
  const key = z.object({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/) })
  const ok = z.object({ ok: z.literal(true) })
  registry.registerPath({ method: 'get', path: '/api/ai/capabilities', operationId: 'aiCapabilities', tags: ['AI reports'], security, responses: { 200: json(ai.aiCapabilitiesSchema, 'Generation capability and recipient'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/ai/consent', operationId: 'aiConsent', tags: ['AI reports'], security, responses: { 200: json(ai.aiConsentSchema.nullable(), 'Current consent, if recorded'), ...failures } })
  registry.registerPath({ method: 'put', path: '/api/ai/consent', operationId: 'aiAcceptConsent', tags: ['AI reports'], security, request: { body: json(ai.aiConsentUpdateSchema, 'Explicit current-recipient consent') }, responses: { 200: json(ai.aiConsentSchema, 'Accepted consent'), ...failures } })
  registry.registerPath({ method: 'delete', path: '/api/ai/consent', operationId: 'aiWithdrawConsent', tags: ['AI reports'], security, responses: { 200: json(ai.aiConsentSchema.nullable(), 'Withdrawn consent, if recorded'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/ai/reports/preview', operationId: 'aiPreview', tags: ['AI reports'], security, request: { body: json(ai.aiReportPreviewRequestSchema, 'Local period preview') }, responses: { 200: json(ai.aiReportPreviewSchema, 'No provider call or quota reservation'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/ai/reports', operationId: 'aiGenerate', tags: ['AI reports'], security, request: { headers: key, body: json(ai.aiReportGenerateRequestSchema, 'Explicit generation request') }, responses: { 200: json(ai.aiReportMutationResponseSchema, 'Existing report'), 202: json(ai.aiReportMutationResponseSchema, 'Queued report'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/ai/reports', operationId: 'aiReportList', tags: ['AI reports'], security, request: { query: ai.aiReportListQuerySchema.clone() }, responses: { 200: json(ai.aiReportListResponseSchema, 'Owner report history'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/ai/reports/{id}', operationId: 'aiReportDetail', tags: ['AI reports'], security, request: { params: id }, responses: { 200: json(ai.aiReportDetailSchema, 'Owner report'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/ai/reports/{id}/regenerate', operationId: 'aiRegenerate', tags: ['AI reports'], security, request: { params: id, headers: key, body: json(ai.aiReportGenerateRequestSchema, 'Explicit new revision') }, responses: { 200: json(ai.aiReportMutationResponseSchema, 'Idempotent existing revision'), 202: json(ai.aiReportMutationResponseSchema, 'Queued revision'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/ai/reports/{id}/cancel', operationId: 'aiCancel', tags: ['AI reports'], security, request: { params: id }, responses: { 200: json(ai.aiReportCancelResponseSchema, 'Cancelled owner job'), ...failures } })
  registry.registerPath({ method: 'delete', path: '/api/ai/reports/{id}', operationId: 'aiDelete', tags: ['AI reports'], security, request: { params: id }, responses: { 200: json(ok, 'Deleted owner report'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/ai/settings', operationId: 'adminAiSettings', tags: ['AI administration'], security, responses: { 200: json(admin.aiAdminSettingsResponseSchema, 'Safe settings; never returns credentials'), ...failures } })
  registry.registerPath({ method: 'put', path: '/api/admin/ai/runtime', operationId: 'adminAiRuntime', tags: ['AI administration'], security, request: { body: json(admin.aiAdminRuntimeUpdateSchema, 'Explicit generation switch') }, responses: { 200: json(admin.aiAdminRuntimeStateSchema, 'Current generation and worker state'), ...failures } })
  registry.registerPath({ method: 'put', path: '/api/admin/ai/settings/draft', operationId: 'adminAiSaveDraft', tags: ['AI administration'], security, request: { body: json(admin.aiProviderDraftSchema, 'Provider draft and write-only key action') }, responses: { 200: json(admin.aiProviderSettingsSchema, 'Saved provider draft'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/ai/settings/publish', operationId: 'adminAiPublish', tags: ['AI administration'], security, request: { body: json(admin.aiProviderPublishSchema, 'Publish tested revision') }, responses: { 200: json(admin.aiProviderSettingsSchema, 'Published settings'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/ai/settings/test', operationId: 'adminAiTest', tags: ['AI administration'], security, request: { body: json(admin.aiProviderTestSchema, 'Explicit synthetic paid test') }, responses: { 200: json(admin.aiProviderSettingsSchema, 'Tested provider draft'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/ai/models/refresh', operationId: 'adminAiModels', tags: ['AI administration'], security, responses: { 200: json(z.object({ data: z.array(z.string()) }), 'Available model identifiers'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/ai/prompts', operationId: 'adminAiPrompts', tags: ['AI administration'], security, responses: { 200: json(z.object({ data: z.array(admin.aiPromptVersionSchema) }), 'Prompt history'), ...failures } })
  for (const action of ['draft', 'test', 'publish', 'restore-default'] as const) {
    registry.registerPath({ method: 'post', path: `/api/admin/ai/prompts/{type}/${action}`, operationId: `adminAiPrompt${action.replace('-', '')}`, tags: ['AI administration'], security, request: { params: z.object({ type: ai.aiReportTypeSchema }), body: json(action === 'draft' ? admin.aiPromptDraftSchema : admin.aiProviderPublishSchema, 'Prompt revision action') }, responses: { 200: json(action === 'test' ? z.object({ analysis: ai.aiAnalysisSchema }) : admin.aiPromptVersionSchema, 'Prompt action result'), ...failures } })
  }
  registry.registerPath({ method: 'get', path: '/api/admin/ai/access', operationId: 'adminAiAccess', tags: ['AI administration'], security, request: { query: admin.aiAccessListQuerySchema.clone() }, responses: { 200: json(admin.aiAccessListResponseSchema, 'Explicit user access'), ...failures } })
  registry.registerPath({ method: 'put', path: '/api/admin/ai/access/{userId}', operationId: 'adminAiUpdateAccess', tags: ['AI administration'], security, request: { params: z.object({ userId: serializedIdSchema }), body: json(admin.aiAccessUpdateSchema, 'Grant or revoke and quota') }, responses: { 200: json(admin.aiAccessItemSchema, 'Updated access'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/ai/usage', operationId: 'adminAiUsage', tags: ['AI administration'], security, request: { query: admin.aiAdminUsageQuerySchema.clone() }, responses: { 200: json(admin.aiAdminUsageResponseSchema, 'Content-free usage'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/ai/audit', operationId: 'adminAiAudit', tags: ['AI administration'], security, request: { query: admin.aiAdminAuditQuerySchema.clone() }, responses: { 200: json(admin.aiAdminAuditResponseSchema, 'Content-free audit history'), ...failures } })
}
