import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  researchApproveRequestSchema,
  researchGenerateRequestSchema,
  researchGenerateResponseSchema,
  researchHandoffRequestSchema,
  researchHandoffResponseSchema,
  researchImportArticleRevisionRequestSchema,
  researchMethodProfileSchema,
  researchPrepareRequestSchema,
  researchProviderSettingsSchema,
  researchProviderUpdateSchema,
  researchRevisionRequestSchema,
  researchRevisionSchema,
  researchRunDetailSchema,
  researchRunListQuerySchema,
  researchRunListResponseSchema,
  researchRuntimeResponseSchema,
  researchRuntimeUpdateSchema,
  researchSettingsResponseSchema,
  researchInstrumentProfileSchema,
} from './research-studio.js'

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

export function registerResearchOpenApi(registry: OpenAPIRegistry, errorSchema: z.ZodType) {
  const security: Array<Record<string, string[]>> = [{ accessTokenCookie: [] }, { bearerAuth: [] }]
  const failures = Object.fromEntries([400, 401, 403, 404, 409, 413, 500, 503].map(status => [status, json(errorSchema, `HTTP ${status} error`)]))
  const id = z.object({ id: z.string().regex(/^[1-9]\d*$/) })

  const Method = registry.register('ResearchMethodProfile', researchMethodProfileSchema.clone())
  const Instrument = registry.register('ResearchInstrumentProfile', researchInstrumentProfileSchema.clone())
  const RunList = registry.register('ResearchRunListResponse', researchRunListResponseSchema.clone())
  const RunDetail = registry.register('ResearchRunDetail', researchRunDetailSchema.clone())
  const Revision = registry.register('ResearchRevision', researchRevisionSchema.clone())
  const GenerateResponse = registry.register('ResearchGenerateResponse', researchGenerateResponseSchema.clone())
  const HandoffResponse = registry.register('ResearchHandoffResponse', researchHandoffResponseSchema.clone())
  const Runtime = registry.register('ResearchRuntime', researchRuntimeResponseSchema.clone())
  const Settings = registry.register('ResearchSettingsResponse', researchSettingsResponseSchema.clone())
  const Provider = registry.register('ResearchProviderSettings', researchProviderSettingsSchema.clone())

  registry.registerPath({ method: 'get', path: '/api/admin/research/methods', tags: ['Research Studio'], operationId: 'researchMethods', security, responses: { 200: json(z.array(Method), 'Research method profiles'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/research/instruments', tags: ['Research Studio'], operationId: 'researchInstruments', security, responses: { 200: json(z.array(Instrument), 'Configured research instruments'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/research/runs', tags: ['Research Studio'], operationId: 'researchRuns', security, request: { query: researchRunListQuerySchema.clone() }, responses: { 200: json(RunList, 'Research runs'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/research/runs', tags: ['Research Studio'], operationId: 'researchPrepare', security, request: { body: json(researchPrepareRequestSchema.clone(), 'Prepare a research run') }, responses: { 200: json(RunDetail, 'Prepared research run'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/research/runs/{id}', tags: ['Research Studio'], operationId: 'researchRunDetail', security, request: { params: id }, responses: { 200: json(RunDetail, 'Research run detail'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/research/runs/{id}/generate', tags: ['Research Studio'], operationId: 'researchGenerate', security, request: { params: id, body: json(researchGenerateRequestSchema.clone(), 'Explicit one-shot generation request') }, responses: { 202: json(GenerateResponse, 'Generation admitted'), 200: json(GenerateResponse, 'Existing idempotent generation'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/research/runs/{id}/cancel', tags: ['Research Studio'], operationId: 'researchCancel', security, request: { params: id }, responses: { 200: json(RunDetail, 'Cancelled research run'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/research/runs/{id}/revisions', tags: ['Research Studio'], operationId: 'researchRevision', security, request: { params: id, body: json(researchRevisionRequestSchema.clone(), 'Create a CAS-checked revision') }, responses: { 200: json(Revision, 'Saved revision'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/research/runs/{id}/import-article-revision', tags: ['Research Studio'], operationId: 'researchImportArticleRevision', security, request: { params: id, body: json(researchImportArticleRevisionRequestSchema.clone(), 'Import current linked article edits for exact-content review') }, responses: { 200: json(Revision, 'Imported linked article revision'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/research/runs/{id}/approve', tags: ['Research Studio'], operationId: 'researchApprove', security, request: { params: id, body: json(researchApproveRequestSchema.clone(), 'Approve an exact revision') }, responses: { 200: json(RunDetail, 'Approved research revision'), ...failures } })
  registry.registerPath({ method: 'post', path: '/api/admin/research/runs/{id}/handoff', tags: ['Research Studio'], operationId: 'researchHandoff', security, request: { params: id, body: json(researchHandoffRequestSchema.clone(), 'Create or return the linked article draft') }, responses: { 200: json(HandoffResponse, 'Article draft handoff'), ...failures } })
  registry.registerPath({ method: 'get', path: '/api/admin/research/settings', tags: ['Research Studio'], operationId: 'researchSettings', security, responses: { 200: json(Settings, 'Research runtime and provider settings'), ...failures } })
  registry.registerPath({ method: 'put', path: '/api/admin/research/runtime', tags: ['Research Studio'], operationId: 'researchRuntime', security, request: { body: json(researchRuntimeUpdateSchema.clone(), 'Research feature and generation switches') }, responses: { 200: json(Runtime, 'Research runtime state'), ...failures } })
  registry.registerPath({ method: 'put', path: '/api/admin/research/provider', tags: ['Research Studio'], operationId: 'researchProvider', security, request: { body: json(researchProviderUpdateSchema.clone(), 'Research writer configuration') }, responses: { 200: json(Provider, 'Saved provider settings'), ...failures } })
}
