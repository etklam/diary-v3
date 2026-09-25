import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
import { timezoneSchema } from './settings.js'

export const researchExecutionStatusSchema = z.enum([
  'CREATED', 'COLLECTING', 'DATA_READY', 'GENERATING', 'DRAFT_READY', 'BLOCKED', 'FAILED', 'CANCELLED',
])
export const researchDispatchStatusSchema = z.enum([
  'NOT_SENT', 'DISPATCH_INTENT', 'SENT', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN',
])
export const researchQualitySchema = z.enum(['FULL', 'LIMITED', 'STALE', 'FAILED'])
export const researchQaStatusSchema = z.enum(['NOT_CHECKED', 'PASS', 'WARN', 'FAIL', 'N_A'])
export const researchReviewStatusSchema = z.enum(['DRAFT', 'CHANGES_REQUIRED', 'APPROVED'])
export const researchMethodStatusSchema = z.enum(['COMPLETE', 'INCOMPLETE', 'RETIRED'])
export const researchAssetTypeSchema = z.enum(['EQUITY', 'ETF'])
export const researchSourcePermissionSchema = z.enum(['allowed', 'restricted', 'unknown'])
export const researchSourcePermissionDetailSchema = z.object({
  status: researchSourcePermissionSchema,
  conditions: z.array(z.string().max(1_000)).max(20),
  basis: z.string().max(1_000).nullable(),
  checkedAt: utcInstantSchema.nullable(),
}).strict()
const boundedText = (max: number) => z.string().trim().min(1).max(max)
const jsonObjectSchema = z.record(z.string().max(120), z.unknown())
export const researchSourceUseSchema = z.object({
  automatedFetch: researchSourcePermissionDetailSchema,
  evidenceStorage: researchSourcePermissionDetailSchema,
  llmInference: researchSourcePermissionDetailSchema,
  publicationOfAnalysisAndExcerpts: researchSourcePermissionDetailSchema,
  rawDataRedistribution: researchSourcePermissionDetailSchema,
}).strict()
export const researchSourceAvailabilitySchema = z.object({
  sourceId: z.string().regex(/^[A-Z][A-Z0-9_.-]{1,80}$/),
  provider: boundedText(200),
  configured: z.boolean(),
  status: z.enum(['READY', 'NOT_CONFIGURED', 'POLICY_UNKNOWN', 'POLICY_RESTRICTED', 'BUDGET_NOT_CONFIGURED']),
  use: researchSourceUseSchema,
}).strict()
export const researchSearchAvailabilitySchema = z.object({
  status: z.enum(['SEARCH_NOT_CONFIGURED', 'SEARCH_QUOTA_EXCEEDED', 'SEARCH_BUDGET_NOT_CONFIGURED', 'READY']),
  configured: z.boolean(),
  budget: z.object({ limit: z.number().int().nonnegative().nullable(), reserved: z.number().int().nonnegative(), consumed: z.number().int().nonnegative(), unknown: z.number().int().nonnegative() }).strict(),
}).strict()

export const researchMethodProfileSchema = z.object({
  id: serializedIdSchema,
  key: z.string().regex(/^[a-z][a-z0-9-]{2,80}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: boundedText(200),
  status: researchMethodStatusSchema,
  sourceUri: z.string().url().nullable(),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  requirements: jsonObjectSchema,
  coverageManifest: jsonObjectSchema,
  createdAt: utcInstantSchema,
}).strict()
export type ResearchMethodProfile = z.infer<typeof researchMethodProfileSchema>

export const researchInstrumentProfileSchema = z.object({
  id: serializedIdSchema,
  methodProfileId: serializedIdSchema,
  symbol: z.string().regex(/^[A-Z0-9.-]{1,20}$/),
  name: boundedText(255),
  exchange: boundedText(32),
  currency: z.string().regex(/^[A-Z]{3}$/),
  assetType: researchAssetTypeSchema,
  benchmarks: z.array(z.string().regex(/^[A-Z0-9.-]{1,20}$/)).max(20),
  peers: z.array(z.string().regex(/^[A-Z0-9.-]{1,20}$/)).max(50),
  enabled: z.boolean(),
  configHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()
export type ResearchInstrumentProfile = z.infer<typeof researchInstrumentProfileSchema>

export const researchSourceRecordSchema = z.object({
  sourceId: z.string().regex(/^[A-Z][A-Z0-9_.-]{1,80}$/),
  purpose: z.string().regex(/^[a-z][a-z0-9_.-]{1,80}$/),
  requestedUrl: z.string().url().nullable(),
  resolvedUrl: z.string().url().nullable(),
  publisher: z.string().max(255).nullable(),
  title: z.string().max(500).nullable(),
  retrievedAt: utcInstantSchema.nullable(),
  dataAsOf: utcInstantSchema.nullable(),
  readRange: z.string().max(500).nullable(),
  evidenceLocator: z.string().max(500).nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  use: researchSourceUseSchema,
  limitations: z.array(z.string().max(1_000)).max(20),
}).strict()
export type ResearchSourceRecord = z.infer<typeof researchSourceRecordSchema>

export const researchBarSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9.-]{1,20}$/),
  date: calendarDateSchema,
  open: z.string().nullable(),
  high: z.string().nullable(),
  low: z.string().nullable(),
  close: z.string().nullable(),
  adjustedClose: z.string().nullable(),
  volume: z.string().nullable(),
  priceSourceId: z.string().max(80).nullable(),
  volumeSourceId: z.string().max(80).nullable(),
  adjustmentBasis: z.enum(['total_return_rebased', 'split_only', 'unavailable']),
  volumeBasis: z.enum(['raw', 'unavailable']),
  session: z.enum(['regular', 'pre', 'post']),
  dataAsOf: utcInstantSchema.nullable(),
  retrievedAt: utcInstantSchema,
}).strict()
export type ResearchBar = z.infer<typeof researchBarSchema>

export const researchEvidenceManifestSchema = z.object({
  referenceSession: calendarDateSchema.nullable(),
  asOf: utcInstantSchema,
  displayTimezone: timezoneSchema,
  exchangeTimezone: timezoneSchema,
  calendarVersion: z.string().max(120).nullable(),
  normalizationVersion: z.string().max(120),
  targetSessions: z.number().int().nonnegative(),
  rowCount: z.number().int().nonnegative(),
  completeOhlcRows: z.number().int().nonnegative(),
  closeRows: z.number().int().nonnegative(),
  volumeRows: z.number().int().nonnegative(),
  missingSessions: z.array(calendarDateSchema).max(1_000),
  warnings: z.array(z.string().max(1_000)).max(100),
  sourceIds: z.array(z.string().max(80)).max(100),
  synthetic: z.boolean(),
}).strict()
export type ResearchEvidenceManifest = z.infer<typeof researchEvidenceManifestSchema>

export const researchSearchResultSchema = z.object({
  title: z.string().max(500),
  url: z.url({ protocol: /^https$/ }).max(2_000),
  snippet: z.string().max(2_000),
  score: z.number().finite().nullable(),
  publishedDate: z.string().max(100).nullable(),
}).strict()
export const researchSearchStatusSchema = z.object({
  status: z.enum(['SEARCH_NOT_CONFIGURED', 'SEARCH_QUOTA_EXCEEDED', 'SEARCH_BUDGET_NOT_CONFIGURED', 'READY']),
  discoveryOnly: z.literal(true).optional(),
  query: z.string().max(500).optional(),
  results: z.array(researchSearchResultSchema).max(10).optional(),
  retrievedAt: utcInstantSchema.optional(),
  usage: z.object({ calls: z.number().int().nonnegative(), returnedResults: z.number().int().nonnegative(), billedCredits: z.number().nonnegative().nullable() }).strict().optional(),
}).strict()
export const researchEvidenceCandidatesSchema = z.object({ search: researchSearchStatusSchema.optional() }).catchall(z.unknown())

export const researchQaGateSchema = z.object({
  gateId: z.string().regex(/^G(?:0[1-9]|10)$/),
  severity: z.enum(['CORE', 'OPTIONAL']),
  status: researchQaStatusSchema,
  evidence: z.array(z.string().max(1_000)).max(20),
  reason: z.string().max(2_000).nullable(),
  remediation: z.string().max(2_000).nullable(),
  reviewerId: serializedIdSchema.nullable(),
  reviewedAt: utcInstantSchema.nullable(),
}).strict()
export type ResearchQaGate = z.infer<typeof researchQaGateSchema>

export const researchClaimSchema = z.object({
  claimId: z.string().regex(/^[A-Z][A-Z0-9_.-]{1,80}$/),
  section: z.number().int().min(1).max(10),
  text: boundedText(8_000),
  type: z.enum(['observed', 'computed', 'inference', 'plan']),
  sourceIds: z.array(z.string().max(80)).max(50),
  metricPaths: z.array(z.string().max(120)).max(50),
  zoneIds: z.array(z.string().max(80)).max(20),
  planIds: z.array(z.string().max(80)).max(20),
  status: z.enum(['SUPPORTED', 'LIMITED', 'UNSUPPORTED']),
}).strict()
export type ResearchClaim = z.infer<typeof researchClaimSchema>

export const researchDraftSectionSchema = z.object({
  section: z.number().int().min(1).max(10),
  title: boundedText(200),
  content: boundedText(40_000),
  claimIds: z.array(z.string().max(80)).max(200),
}).strict()

export const researchDraftSchema = z.object({
  schemaVersion: z.literal('research-draft-v1'),
  title: boundedText(255),
  sections: z.array(researchDraftSectionSchema).length(10),
  claims: z.array(researchClaimSchema).max(10_000),
  finalAnswers: z.array(z.object({
    question: boundedText(500),
    answer: boundedText(4_000),
    claimIds: z.array(z.string().max(80)).max(50),
  }).strict()).length(8),
  limitations: z.array(boundedText(2_000)).max(100),
}).strict()
export type ResearchDraft = z.infer<typeof researchDraftSchema>

const researchRunFields = {
  id: serializedIdSchema,
  requesterId: serializedIdSchema.nullable(),
  method: researchMethodProfileSchema,
  instrument: researchInstrumentProfileSchema,
  executionStatus: researchExecutionStatusSchema,
  dispatchStatus: researchDispatchStatusSchema,
  quality: researchQualitySchema,
  reviewStatus: researchReviewStatusSchema,
  referenceSession: calendarDateSchema.nullable(),
  asOf: utcInstantSchema.nullable(),
  displayTimezone: timezoneSchema,
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  currentRevision: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  linkedPostId: serializedIdSchema.nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}

export const researchRunSummarySchema = z.object(researchRunFields).strict()
export type ResearchRunSummary = z.infer<typeof researchRunSummarySchema>

export const researchRevisionSchema = z.object({
  id: serializedIdSchema,
  runId: serializedIdSchema,
  revision: z.number().int().positive(),
  parentRevision: z.number().int().positive().nullable(),
  structured: jsonObjectSchema,
  content: boundedText(200_000),
  titleHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  qaStatus: researchQaStatusSchema,
  reviewStatus: researchReviewStatusSchema,
  approvedBy: serializedIdSchema.nullable(),
  approvedAt: utcInstantSchema.nullable(),
  createdBy: serializedIdSchema.nullable(),
  createdAt: utcInstantSchema,
}).strict()
export type ResearchRevision = z.infer<typeof researchRevisionSchema>

export const researchEvidenceSchema = z.object({
  id: serializedIdSchema,
  runId: serializedIdSchema,
  version: z.number().int().positive(),
  manifest: researchEvidenceManifestSchema,
  bars: z.array(researchBarSchema).max(10_000),
  sources: z.array(researchSourceRecordSchema).max(100),
  metrics: jsonObjectSchema,
  candidates: researchEvidenceCandidatesSchema,
  qa: z.array(researchQaGateSchema).max(10),
  quality: researchQualitySchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: utcInstantSchema,
}).strict()
export type ResearchEvidence = z.infer<typeof researchEvidenceSchema>

export const researchAttemptSchema = z.object({
  id: serializedIdSchema,
  runId: serializedIdSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
  dispatchStatus: researchDispatchStatusSchema,
  leaseToken: z.string().max(128).nullable(),
  workerId: z.string().max(128).nullable(),
  providerRevision: z.number().int().positive().nullable(),
  model: z.string().max(200).nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
  requestId: z.string().max(200).nullable(),
  reportedCostUsd: z.string().regex(/^\d+(?:\.\d{1,9})?$/).nullable(),
  reservedCostCents: z.number().int().nonnegative(),
  estimatedCostCents: z.number().int().nonnegative().nullable(),
  diagnostics: z.string().max(4_000).nullable(),
  createdAt: utcInstantSchema,
  dispatchedAt: utcInstantSchema.nullable(),
  finishedAt: utcInstantSchema.nullable(),
}).strict()
export type ResearchAttempt = z.infer<typeof researchAttemptSchema>

export const researchRunDetailSchema = researchRunSummarySchema.extend({
  evidence: researchEvidenceSchema.nullable(),
  revisions: z.array(researchRevisionSchema).max(1_000),
  attempts: z.array(researchAttemptSchema).max(100),
  latestQa: z.array(researchQaGateSchema).max(10),
}).strict()
export type ResearchRunDetail = z.infer<typeof researchRunDetailSchema>

export const researchRunListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  symbol: z.string().regex(/^[A-Z0-9.-]{1,20}$/).optional(),
  executionStatus: researchExecutionStatusSchema.optional(),
  quality: researchQualitySchema.optional(),
  reviewStatus: researchReviewStatusSchema.optional(),
}).strict()
export const researchRunListResponseSchema = z.object({
  data: z.array(researchRunSummarySchema),
  pagination: z.object({ page: z.number().int().positive(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict(),
}).strict()

export const researchPrepareRequestSchema = z.object({
  instrumentProfileId: serializedIdSchema.optional(),
  symbol: z.string().regex(/^[A-Z0-9.-]{1,20}$/).optional(),
  methodProfileId: serializedIdSchema.optional(),
  asOf: utcInstantSchema.optional(),
  displayTimezone: timezoneSchema.optional(),
  synthetic: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (!value.instrumentProfileId && !value.symbol) context.addIssue({ code: 'custom', path: ['symbol'], message: 'instrumentProfileId or symbol is required' })
})
export type ResearchPrepareRequest = z.infer<typeof researchPrepareRequestSchema>

export const researchGenerateRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,200}$/),
}).strict()
export type ResearchGenerateRequest = z.infer<typeof researchGenerateRequestSchema>

export const researchRevisionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  expectedRevision: z.number().int().positive().optional(),
  structured: jsonObjectSchema,
  content: boundedText(200_000),
  qa: z.array(researchQaGateSchema).length(10),
}).strict()
export type ResearchRevisionRequest = z.infer<typeof researchRevisionRequestSchema>

export const researchImportArticleRevisionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
}).strict()
export type ResearchImportArticleRevisionRequest = z.infer<typeof researchImportArticleRevisionRequestSchema>

export const researchApproveRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  revision: z.number().int().positive(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type ResearchApproveRequest = z.infer<typeof researchApproveRequestSchema>

export const researchHandoffRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  revision: z.number().int().positive(),
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  access: z.enum(['PUBLIC', 'MEMBER']).default('MEMBER'),
  category: z.string().trim().min(1).max(100).default('technical'),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
}).strict()
export type ResearchHandoffRequest = z.infer<typeof researchHandoffRequestSchema>

export const researchRuntimeSchema = z.object({
  revision: z.number().int().positive(),
  featureEnabled: z.boolean(),
  generationEnabled: z.boolean(),
  workerAvailable: z.boolean(),
  workerId: z.string().max(128).nullable(),
  workerHeartbeatAt: utcInstantSchema.nullable(),
  budget: z.object({
    sessionId: serializedIdSchema.nullable(),
    limit: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    consumed: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }).strict(),
}).strict()
export const researchRuntimeUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  featureEnabled: z.boolean().optional(),
  generationEnabled: z.boolean().optional(),
}).strict().refine(value => value.featureEnabled !== undefined || value.generationEnabled !== undefined, 'At least one setting is required')

export const researchProviderSettingsSchema = z.object({
  id: serializedIdSchema,
  revision: z.number().int().positive(),
  status: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']),
  provider: z.literal('openrouter'),
  protocol: z.literal('chat_completions'),
  baseUrl: z.url({ protocol: /^https$/ }).max(500),
  model: z.literal('openrouter/free'),
  maxInputTokens: z.number().int().positive().max(200_000),
  maxOutputTokens: z.number().int().positive().max(32_000),
  timeoutMs: z.number().int().min(1_000).max(300_000),
  hasSecret: z.boolean(),
  updatedAt: utcInstantSchema,
}).strict()
export type ResearchProviderSettings = z.infer<typeof researchProviderSettingsSchema>
export const researchProviderUpdateSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  baseUrl: z.url({ protocol: /^https$/ }).max(500),
  model: z.literal('openrouter/free'),
  maxInputTokens: z.number().int().positive().max(200_000),
  maxOutputTokens: z.number().int().positive().max(32_000),
  timeoutMs: z.number().int().min(1_000).max(300_000),
  apiKey: z.string().trim().min(1).max(4_096).optional(),
}).strict()

export const researchSettingsResponseSchema = z.object({
  runtime: researchRuntimeSchema,
  provider: researchProviderSettingsSchema.nullable(),
  sources: z.array(researchSourceAvailabilitySchema).max(20),
  search: researchSearchAvailabilitySchema,
}).strict()

export const researchHandoffResponseSchema = z.object({
  postId: serializedIdSchema,
  runId: serializedIdSchema,
  revision: z.number().int().positive(),
  created: z.boolean(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  access: z.enum(['PUBLIC', 'MEMBER']),
}).strict()

export const researchGenerateResponseSchema = z.object({
  run: researchRunSummarySchema,
  attempt: researchAttemptSchema,
  reused: z.boolean(),
}).strict()

export const researchRuntimeResponseSchema = researchRuntimeSchema
