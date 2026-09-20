import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'
import { localeSchema, timezoneSchema } from './settings.js'

export const aiReportTypeSchema = z.enum(['weekly', 'monthly'])
export const aiReportStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
export const aiReportSourceStateSchema = z.enum(['current', 'changed', 'invalidated'])
export const aiReportEvidenceLevelSchema = z.enum(['recorded', 'interpretation', 'insufficient'])
export const aiReportDisciplineAssessmentSchema = z.enum([
  'supported_by_records', 'possible_deviation', 'insufficient_evidence',
])
export const aiReportSourceTypeSchema = z.enum(['diary', 'transaction', 'discipline', 'holding'])

const boundedText = (max: number) => z.string().trim().min(1).max(max)

export const aiAnalysisItemSchema = z.object({
  text: boundedText(4_000),
  sourceIds: z.array(z.string().regex(/^[A-Z][A-Z0-9]*\d+$/)).max(20),
  metricRefs: z.array(z.string().regex(/^[a-z][a-z0-9_.-]{0,80}$/)).max(20),
  evidenceLevel: aiReportEvidenceLevelSchema,
}).strict()

export const aiDisciplineCheckSchema = z.object({
  ruleSourceId: z.string().regex(/^R\d+$/),
  assessment: aiReportDisciplineAssessmentSchema,
  observation: aiAnalysisItemSchema,
  followUpQuestion: z.string().max(1_000).nullable(),
}).strict()

/** Model-owned content. Server-owned identity, dates, metrics and versions stay outside this schema. */
export const aiAnalysisSchema = z.object({
  summary: z.array(aiAnalysisItemSchema).max(12),
  decisionReview: z.array(aiAnalysisItemSchema).max(20),
  positionReview: z.array(aiAnalysisItemSchema).max(20),
  marketReflection: z.array(aiAnalysisItemSchema).max(12),
  disciplineChecks: z.array(aiDisciplineCheckSchema).max(50),
  nextPeriodFocus: z.array(aiAnalysisItemSchema).max(3),
  limitations: z.array(z.string().trim().min(1).max(1_000)).max(20),
}).strict()
export type AiAnalysis = z.infer<typeof aiAnalysisSchema>
export type AiAnalysisItem = z.infer<typeof aiAnalysisItemSchema>

export const aiReportMetricSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.-]{0,80}$/),
  label: boundedText(200),
  value: z.union([z.number().finite(), z.string().max(200), z.null()]),
  unit: z.string().max(40).nullable(),
  availability: z.enum(['available', 'zero', 'unavailable']),
  definition: boundedText(500),
  sourceIds: z.array(z.string().regex(/^[A-Z][A-Z0-9]*\d+$/)).max(10_000),
}).strict()

export const aiReportCoverageSchema = z.object({
  diaries: z.object({ count: z.number().int().nonnegative(), available: z.boolean() }).strict(),
  transactions: z.object({ count: z.number().int().nonnegative(), available: z.boolean() }).strict(),
  holdings: z.object({ count: z.number().int().nonnegative(), available: z.boolean() }).strict(),
  disciplines: z.object({ count: z.number().int().nonnegative(), available: z.boolean() }).strict(),
  notes: z.array(z.string().max(500)).max(20),
}).strict()

export const aiReportSourceSchema = z.object({
  alias: z.string().regex(/^[A-Z][A-Z0-9]*\d+$/),
  sourceType: aiReportSourceTypeSchema,
  sourceId: z.string().min(1).max(80),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  dependency: z.boolean(),
  /** Server-controlled navigation target; never taken from model output. */
  href: z.string().regex(/^\/api\/(?:diaries|discipline)(?:\/[0-9]+)?$/).nullable(),
}).strict()

export const aiReportPeriodSchema = z.object({
  periodType: aiReportTypeSchema,
  periodStart: calendarDateSchema,
  periodEndExclusive: calendarDateSchema,
  isPartialPeriod: z.boolean(),
}).strict()

export const aiReportPreviewRequestSchema = z.object({
  periodType: aiReportTypeSchema,
  periodStart: calendarDateSchema,
  locale: localeSchema.optional(),
}).strict()
export type AiReportPreviewRequest = z.infer<typeof aiReportPreviewRequestSchema>

export const aiReportPreviewSchema = z.object({
  period: aiReportPeriodSchema,
  timezone: timezoneSchema,
  locale: localeSchema,
  coverage: aiReportCoverageSchema,
  metrics: z.array(aiReportMetricSchema).max(10_000),
  previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  recipientRevision: z.number().int().positive(),
  providerConfigVersion: z.number().int().positive().nullable(),
  promptVersion: z.number().int().positive().nullable(),
  canGenerate: z.boolean(),
}).strict()
export type AiReportPreview = z.infer<typeof aiReportPreviewSchema>

export const aiReportGenerateRequestSchema = z.object({
  periodType: aiReportTypeSchema,
  periodStart: calendarDateSchema,
  locale: localeSchema.optional(),
  confirmedRecipientRevision: z.number().int().positive(),
  previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  regenerateFromReportId: serializedIdSchema.optional(),
}).strict()
export type AiReportGenerateRequest = z.infer<typeof aiReportGenerateRequestSchema>

const aiReportServerFields = {
  id: serializedIdSchema,
  period: aiReportPeriodSchema,
  timezone: timezoneSchema,
  locale: localeSchema,
  status: aiReportStatusSchema,
  sourceState: aiReportSourceStateSchema,
  coverage: aiReportCoverageSchema,
  metrics: z.array(aiReportMetricSchema).max(10_000),
  revision: z.number().int().positive(),
  createdAt: utcInstantSchema,
  snapshotCapturedAt: utcInstantSchema,
  startedAt: utcInstantSchema.nullable(),
  finishedAt: utcInstantSchema.nullable(),
  generatedAt: utcInstantSchema.nullable(),
  model: z.string().max(200).nullable(),
  providerConfigVersion: z.number().int().positive().nullable(),
  promptVersion: z.number().int().positive().nullable(),
  schemaVersion: z.string().max(40),
  errorCode: z.string().max(80).nullable(),
}

export const aiReportSummarySchema = z.object(aiReportServerFields).strict()
export type AiReportSummary = z.infer<typeof aiReportSummarySchema>

export const aiReportDetailSchema = z.object({
  ...aiReportServerFields,
  analysis: aiAnalysisSchema.nullable(),
  sources: z.array(aiReportSourceSchema).max(10_000),
  regeneratedFromReportId: serializedIdSchema.nullable(),
}).strict()
export type AiReportDetail = z.infer<typeof aiReportDetailSchema>

export const aiReportListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  periodType: aiReportTypeSchema.optional(),
}).strict()
export const aiReportListResponseSchema = z.object({
  data: z.array(aiReportSummarySchema),
  nextCursor: z.string().max(200).nullable(),
}).strict()

export const aiReportMutationResponseSchema = z.object({
  data: aiReportSummarySchema,
  reused: z.boolean().optional(),
}).strict()

/** Cancellation is intentionally content-free so it remains safe after access is revoked. */
export const aiReportCancelResponseSchema = z.object({
  id: serializedIdSchema,
  status: aiReportStatusSchema,
}).strict()
export type AiReportCancelResponse = z.infer<typeof aiReportCancelResponseSchema>

export const aiCapabilitiesSchema = z.object({
  enabled: z.boolean(),
  canGenerate: z.boolean(),
  reason: z.string().max(120).nullable(),
  remainingQuota: z.number().int().nonnegative().nullable(),
  monthlyQuota: z.number().int().nonnegative().nullable(),
  recipientRevision: z.number().int().positive().nullable(),
  disclosureVersion: z.string().max(80).nullable(),
  recipientName: z.string().max(200).nullable(),
  disclosureText: z.string().max(10_000).nullable(),
  consentAcceptedAt: utcInstantSchema.nullable(),
  workerAvailable: z.boolean(),
}).strict()
export type AiCapabilities = z.infer<typeof aiCapabilitiesSchema>

export const aiConsentSchema = z.object({
  recipientRevision: z.number().int().positive(),
  disclosureVersion: z.string().max(80),
  acceptedAt: utcInstantSchema.nullable(),
  revokedAt: utcInstantSchema.nullable(),
}).strict()
export const aiConsentUpdateSchema = z.object({
  recipientRevision: z.number().int().positive(),
  disclosureVersion: z.string().trim().min(1).max(80),
}).strict()

export const aiUsageSchema = z.object({
  month: calendarDateSchema,
  reserved: z.number().int().nonnegative(),
  consumed: z.number().int().nonnegative(),
  released: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
}).strict()

export type AiReportType = z.infer<typeof aiReportTypeSchema>
export type AiReportStatus = z.infer<typeof aiReportStatusSchema>
export type AiReportSourceState = z.infer<typeof aiReportSourceStateSchema>
export type AiReportCoverage = z.infer<typeof aiReportCoverageSchema>
export type AiReportMetric = z.infer<typeof aiReportMetricSchema>
