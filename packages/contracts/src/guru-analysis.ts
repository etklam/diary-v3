import { z } from 'zod'
import { calendarDateSchema, serializedIdSchema, utcInstantSchema } from './common.js'

/** Code-owned disclosures. A model selects their identifiers; the server renders their text. */
export const guruAnalysisCaveatIdSchema = z.enum([
  'DELAYED_QUARTER_END',
  'TRADE_DATES_UNKNOWN',
  'SHORT_POSITIONS_UNDISCLOSED',
  'DERIVATIVES_MAY_BE_ABSENT',
  'CONFIDENTIAL_TREATMENT',
  'VALUE_CHANGE_IS_NOT_A_TRADE',
  'NOT_A_COMPLETE_PORTFOLIO',
])

export const guruAnalysisStatementSchema = z.object({
  text: z.string().trim().min(1).max(600),
  kind: z.enum(['fact', 'interpretation']),
  factRefs: z.array(z.string().min(1).max(80)).max(8),
  positionKeys: z.array(z.string().min(1).max(256)).max(8),
}).strict()

const section = (max: number) => guruAnalysisStatementSchema.array().max(max)

export const guruAnalysisSchema = z.object({
  executiveSummary: section(5).min(1),
  portfolioDirection: section(6),
  convictionPositions: section(10),
  newPositions: section(10),
  increasedPositions: section(10),
  reducedPositions: section(10),
  exitedPositions: section(10),
  sectorAndThemeChange: section(10),
  concentrationChange: section(6),
  turnoverInterpretation: section(4),
  historicalContext: section(6),
  consensusContext: section(6),
  risks: section(8).min(1),
  takeaways: section(5).min(1),
  caveatIds: guruAnalysisCaveatIdSchema.array().min(1).max(16),
}).strict()

export const guruAnalysisFactSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  value: z.string().min(1).max(400),
}).strict()

export const guruAnalysisCaveatSchema = z.object({ id: guruAnalysisCaveatIdSchema, text: z.string().min(1) }).strict()

export const guruAnalysisStateSchema = z.enum(['NOT_GENERATED', 'QUEUED', 'RUNNING', 'READY', 'STALE', 'FAILED', 'BLOCKED_BY_COVERAGE'])

export const guruAnalysisProvenanceSchema = z.object({
  runId: serializedIdSchema,
  periodEnd: calendarDateSchema,
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  sourceState: z.enum(['current', 'invalidated']),
  reason: z.enum(['INITIAL', 'REGENERATION']),
  schemaVersion: z.string().min(1).max(40),
  contextVersion: z.string().min(1).max(40),
  analyticsVersion: z.string().min(1).max(40),
  consensusVersion: z.string().min(1).max(40).nullable(),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  promptKey: z.string().min(1).max(100),
  promptSource: z.enum(['system-default', 'override']),
  promptSystemVersion: z.string().min(1).max(40),
  promptOverrideVersionId: serializedIdSchema.nullable(),
  provider: z.string().min(1).max(120).nullable(),
  model: z.string().min(1).max(200).nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  errorCode: z.string().max(80).nullable(),
  queuedAt: utcInstantSchema,
  generatedAt: utcInstantSchema.nullable(),
}).strict()

export const guruAnalysisCoverageSchema = z.object({
  quarterStatus: z.enum(['PENDING', 'READY', 'PARTIAL', 'ERROR']),
  mappingCoveragePercent: z.string().regex(/^-?\d+(?:\.\d+)?$/).nullable(),
  comparisonStatus: z.string().min(1).max(40).nullable(),
  consensusAvailable: z.boolean(),
  historyQuarterCount: z.number().int().nonnegative(),
  notes: z.string().max(200).array(),
}).strict()

export const guruAnalysisResponseSchema = z.object({
  data: z.object({
    profile: z.object({ name: z.string().min(1), managerName: z.string().min(1), slug: z.string().min(1) }).strict(),
    periodEnd: calendarDateSchema.nullable(),
    state: guruAnalysisStateSchema,
    coverage: guruAnalysisCoverageSchema,
    facts: guruAnalysisFactSchema.array(),
    analysis: guruAnalysisSchema.nullable(),
    caveats: guruAnalysisCaveatSchema.array(),
    provenance: guruAnalysisProvenanceSchema.nullable(),
    history: guruAnalysisProvenanceSchema.array(),
    source: z.object({
      accession: z.string().nullable(),
      periodEnd: calendarDateSchema.nullable(),
      filedAt: utcInstantSchema.nullable(),
      sourceUrl: z.string().url().nullable(),
    }).strict(),
  }).strict(),
}).strict()

export const adminGuruAnalysisRequestSchema = z.object({
  periodEnd: calendarDateSchema,
  mode: z.enum(['generate', 'regenerate']),
}).strict()

export const adminGuruAnalysisRunSchema = guruAnalysisProvenanceSchema.extend({
  requestedByUserId: serializedIdSchema.nullable(),
  attemptId: serializedIdSchema.nullable(),
  invalidatedAt: utcInstantSchema.nullable(),
  invalidationReason: z.string().max(80).nullable(),
}).strict()

export const adminGuruAnalysisResponseSchema = z.object({
  data: z.object({ run: adminGuruAnalysisRunSchema, reused: z.boolean() }).strict(),
}).strict()

export const adminGuruAnalysisListResponseSchema = z.object({ data: adminGuruAnalysisRunSchema.array() }).strict()

export type GuruAnalysis = z.infer<typeof guruAnalysisSchema>
export type GuruAnalysisCaveatId = z.infer<typeof guruAnalysisCaveatIdSchema>
export type GuruAnalysisFact = z.infer<typeof guruAnalysisFactSchema>
export type GuruAnalysisProvenance = z.infer<typeof guruAnalysisProvenanceSchema>
export type AdminGuruAnalysisRequest = z.infer<typeof adminGuruAnalysisRequestSchema>
