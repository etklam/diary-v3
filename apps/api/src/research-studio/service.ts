import { createHash, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  researchArticleLinks,
  researchAttempts,
  researchBudgetSessions,
  researchEvidenceSnapshots,
  researchInstrumentProfiles,
  researchMethodProfiles,
  researchProviderConfigs,
  researchSearchBudgets,
  researchRevisions,
  researchRuns,
  researchRuntimeState,
  users,
  posts,
  type Database,
} from '@diary/db'
import {
  researchDraftSchema,
  researchEvidenceManifestSchema,
  researchEvidenceSchema,
  researchGenerateRequestSchema,
  researchHandoffRequestSchema,
  researchInstrumentProfileSchema,
  researchMethodProfileSchema,
  researchQaGateSchema,
  researchRunDetailSchema,
  researchRunListQuerySchema,
  researchRunSummarySchema,
  researchRuntimeSchema,
  researchRuntimeUpdateSchema,
  researchSourceAvailabilitySchema,
  researchSearchAvailabilitySchema,
  researchSourceRecordSchema,
  type ErrorCode,
  type ResearchBar,
  type ResearchDraft,
  type ResearchEvidence,
  type ResearchEvidenceManifest,
  type ResearchGenerateRequest,
  type ResearchHandoffRequest,
  type ResearchInstrumentProfile,
  type ResearchMethodProfile,
  type ResearchQaGate,
  type ResearchRevisionRequest,
  type ResearchRunDetail,
} from '@diary/contracts'
import { z } from 'zod'
import { decryptAiSecret, encryptAiSecret } from '../ai-reports/secrets.js'
import { RESEARCH_METHOD_DOCUMENTS, RESEARCH_REPORT_RULES } from './method-bundle.js'
import { ResearchTransportError } from './transport.js'
import { sourceRecordsAreVerifiedAllowed, sourceUseFromPolicy, TAVILY_SEARCH_POLICY, YAHOO_RESEARCH_POLICY, type ResearchSourcePolicy } from './source-policy.js'
import { lockResearchMutation, researchPublicationFreshnessIssue } from './publication.js'
import { researchQaApprovalIssue } from './qa.js'
import { researchOutputEvidenceIssue } from './output-validation.js'
import { renderResearchReport, researchReportCitationSources } from './render.js'

const DEFAULT_EXCHANGE_TIMEZONE = 'America/New_York'
const DEFAULT_DISPLAY_TIMEZONE = 'Asia/Hong_Kong'
const DEFAULT_BUDGET_KEY = 'live-test'
const FIXED_DISPATCH_GRACE_MS = 15_000
const MAX_EVIDENCE_PROMPT_CHARS = 1_800_000
const MODEL_METRIC_SERIES_WINDOW = 21
const MODEL_METRICS_PROJECTION_VERSION = 'research-writer-metrics-v1'
const PRIVATE_DATA_SENTINEL = /(?:PRIVATE[_ -](?:DATA|DIARY|PORTFOLIO|SENTINEL)|QZK9X7M2)/i
const NO_OFFICIAL_SOURCE_POLICY: ResearchSourcePolicy = {
  sourceId: 'OFFICIAL_SOURCE_REGISTRY',
  provider: 'Configured official research sources',
  scope: 'Fixed HTTPS sources with source-specific metadata extractors.',
  decisions: {
    automated_fetch: 'unknown',
    evidence_storage: 'unknown',
    llm_inference: 'unknown',
    publication_of_analysis_and_excerpts: 'unknown',
    raw_data_redistribution: 'unknown',
  },
  conditions: ['No official source adapters are configured; direct retrieval is disabled.'],
  basisUrl: null,
  checkedAt: '2026-09-25T00:00:00.000Z',
}

export type ResearchTransportRequest = {
  baseUrl: string
  model: 'openrouter/free'
  apiKey: string
  maxInputTokens: number
  maxOutputTokens: number
  timeoutMs: number
  payload: string
  signal?: AbortSignal
}

export type ResearchTransportResponse = {
  content: string
  model?: string | null
  requestId?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  reasoningTokens?: number | null
  reportedCostUsd?: string | null
}

export interface ResearchTransport {
  generate(request: ResearchTransportRequest): Promise<ResearchTransportResponse>
}

export type ResearchEvidencePreparation = {
  manifest: ResearchEvidenceManifest
  bars?: ResearchBar[]
  sources?: z.infer<typeof researchSourceRecordSchema>[]
  metrics?: Record<string, unknown>
  candidates?: Record<string, unknown>
  qa?: ResearchQaGate[]
}

export type ResearchEvidenceProvider = (input: {
  method: ResearchMethodProfile
  instrument: ResearchInstrumentProfile
  asOf: Date
  displayTimezone: string
  synthetic: boolean
}) => Promise<ResearchEvidencePreparation>

export type ResearchLatestCompletedSession = (input: {
  symbol: string
  exchangeTimezone: 'America/New_York'
  asOf: Date
  referenceSession?: string | null
}) => Promise<{ session: string; calendarVersion: string; verifiedSourceId: string } | null>

export class ResearchServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ResearchServiceError'
  }
}

function fail(statusCode: number, code: ErrorCode, message: string): never {
  throw new ResearchServiceError(statusCode, code, message)
}

function jsonObject(value: string | null | undefined, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (!value) return fallback
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : fallback
  } catch { return fallback }
}

function jsonArray<T>(value: string | null | undefined, fallback: T[] = []): T[] {
  if (!value) return fallback
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : fallback
  } catch { return fallback }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function iso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null
}

function safeDiagnostics(value: unknown): string {
  // Persist only a bounded, server-owned code. Provider messages can contain
  // credentials, URLs, prompts, or source text and are never audit-safe.
  if (value instanceof ResearchTransportError) return value.code
  if (value instanceof ResearchServiceError) return value.code
  return 'RESEARCH_PROVIDER_ERROR'
}

function methodFromRow(row: typeof researchMethodProfiles.$inferSelect): ResearchMethodProfile {
  return researchMethodProfileSchema.parse({
    id: String(row.id),
    key: row.methodKey,
    version: row.version,
    title: row.title,
    status: row.status,
    sourceUri: row.sourceUri,
    bundleHash: row.bundleHash,
    requirements: jsonObject(row.requirementsJson),
    coverageManifest: jsonObject(row.coverageManifestJson),
    createdAt: row.createdAt.toISOString(),
  })
}

function instrumentFromRow(row: typeof researchInstrumentProfiles.$inferSelect): ResearchInstrumentProfile {
  return researchInstrumentProfileSchema.parse({
    id: String(row.id),
    methodProfileId: String(row.methodProfileId),
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    assetType: row.assetType,
    benchmarks: jsonArray<string>(row.benchmarksJson),
    peers: jsonArray<string>(row.peersJson),
    enabled: row.enabled,
    configHash: row.configHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function defaultQa(method: ResearchMethodProfile, synthetic: boolean): ResearchQaGate[] {
  const status: ResearchQaGate['status'] = method.status === 'COMPLETE' ? 'NOT_CHECKED' : 'WARN'
  const reason = synthetic ? 'Synthetic evidence is for offline engineering tests only.' : 'No approved source adapter is configured.'
  return Array.from({ length: 10 }, (_, index) => ({
    gateId: `G${String(index + 1).padStart(2, '0')}`,
    severity: 'CORE' as const,
    status,
    evidence: [],
    reason,
    remediation: 'Import approved source evidence and complete human QA.',
    reviewerId: null,
    reviewedAt: null,
  }))
}

const RESEARCH_GATE_IDS = Array.from({ length: 10 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`)
const RESEARCH_COMPUTED_GATE_IDS = new Set(RESEARCH_GATE_IDS.slice(0, 6))

function exactQa(value: unknown): ResearchQaGate[] {
  const parsed = z.array(researchQaGateSchema).length(10).safeParse(value)
  if (!parsed.success) fail(400, 'RESEARCH_QA_FAILED', 'Exactly ten QA gates are required')
  const seen = new Set(parsed.data.map(gate => gate.gateId))
  if (seen.size !== RESEARCH_GATE_IDS.length || RESEARCH_GATE_IDS.some(id => !seen.has(id))) {
    fail(400, 'RESEARCH_QA_FAILED', 'QA gates must contain each of G01 through G10 exactly once')
  }
  for (const gate of parsed.data) {
    if (gate.severity !== 'CORE') fail(400, 'RESEARCH_QA_FAILED', `QA severity for ${gate.gateId} is server-defined`)
  }
  return parsed.data
}

function qaById(gates: readonly ResearchQaGate[]): Map<string, ResearchQaGate> {
  return new Map(gates.map(gate => [gate.gateId, gate]))
}

function sourceAvailability(policy: ResearchSourcePolicy, configured: boolean) {
  const use = sourceUseFromPolicy(policy)
  const required = [use.automatedFetch, use.evidenceStorage, use.llmInference]
  const status = required.some(item => item.status === 'restricted')
    ? 'POLICY_RESTRICTED'
    : required.some(item => item.status === 'unknown')
      ? 'POLICY_UNKNOWN'
      : configured ? 'READY' : 'NOT_CONFIGURED'
  return researchSourceAvailabilitySchema.parse({ sourceId: policy.sourceId, provider: policy.provider, configured, status, use })
}

function prepareReviewedQa(input: {
  submitted: readonly ResearchQaGate[]
  baseline: readonly ResearchQaGate[]
  actorId: bigint
  now: Date
}): ResearchQaGate[] {
  const submitted = qaById(input.submitted)
  const baseline = qaById(input.baseline)
  const reviewedAt = input.now.toISOString()
  return RESEARCH_GATE_IDS.map((gateId, index) => {
    const received = submitted.get(gateId)
    const frozen = baseline.get(gateId)
    if (!received || !frozen || received.severity !== 'CORE' || frozen.severity !== 'CORE') {
      fail(409, 'RESEARCH_QA_FAILED', `Gate ${gateId} is missing or has invalid server-owned severity`)
    }
    if (received.reviewerId !== null || received.reviewedAt !== null) {
      fail(400, 'RESEARCH_QA_FAILED', `Reviewer identity and time for ${gateId} are assigned by the server`)
    }
    if (index < 6) {
      if (received.status !== frozen.status
        || received.evidence.join('|') !== frozen.evidence.join('|')
        || received.reason !== frozen.reason
        || received.remediation !== frozen.remediation) {
        fail(409, 'RESEARCH_QA_FAILED', `Computed gate ${gateId} must match frozen evidence`)
      }
      return frozen
    }
    if (frozen.status === 'FAIL' && received.status !== 'FAIL') {
      fail(409, 'RESEARCH_QA_FAILED', `Frozen FAIL for ${gateId} cannot be cleared`)
    }
    if (received.status === 'N_A' && gateId !== 'G07' && gateId !== 'G08') {
      fail(409, 'RESEARCH_QA_FAILED', `${gateId} cannot be marked N_A`)
    }
    const reviewed = received.status === 'PASS' || received.status === 'FAIL' || received.status === 'N_A'
    if (reviewed && !received.evidence.some(note => note.trim())) {
      fail(409, 'RESEARCH_QA_FAILED', `${gateId} review requires an evidence note`)
    }
    if (reviewed && received.evidence.every(note => frozen.evidence.includes(note))) {
      fail(409, 'RESEARCH_QA_FAILED', `${gateId} requires a reviewer-authored note for this revision`)
    }
    if (received.status === 'N_A' && !received.reason?.trim()) {
      fail(409, 'RESEARCH_QA_FAILED', `${gateId} N_A requires an explicit limitation`)
    }
    return reviewed
      ? { ...received, reviewerId: String(input.actorId), reviewedAt }
      : { ...received, reviewerId: null, reviewedAt: null }
  })
}

function pathExists(root: unknown, path: string): boolean {
  if (!path || path.length > 120) return false
  const parts = path.replace(/\[(\d+)\]/gu, '.$1').split('.').filter(Boolean)
  let value: unknown = root
  for (const part of parts) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return false
    value = (value as Record<string, unknown>)[part]
  }
  return value !== null && value !== undefined
}

function collectNamedIds(value: unknown, key: string, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedIds(item, key, into)
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record[key] === 'string') into.add(record[key] as string)
    for (const item of Object.values(record)) collectNamedIds(item, key, into)
  }
  return into
}

function validateDraftReferences(draft: ResearchDraft, evidence: {
  sources: z.infer<typeof researchSourceRecordSchema>[]
  metrics: Record<string, unknown>
  candidates: Record<string, unknown>
}) {
  const sectionIds = new Set(draft.sections.map(section => section.section))
  if (sectionIds.size !== 10 || RESEARCH_GATE_IDS.some((_id, index) => !sectionIds.has(index + 1))) {
    fail(409, 'RESEARCH_OUTPUT_INVALID', 'The report must contain each section from 1 through 10 exactly once')
  }
  const claims = new Map<string, ResearchDraft['claims'][number]>()
  for (const claim of draft.claims) {
    if (claims.has(claim.claimId)) fail(409, 'RESEARCH_OUTPUT_INVALID', 'Claim identifiers must be unique')
    claims.set(claim.claimId, claim)
  }
  const sourceIds = new Set(evidence.sources.map(source => source.sourceId))
  const zoneIds = collectNamedIds(evidence.candidates, 'zoneId')
  const planIds = collectNamedIds(evidence.candidates, 'planId')
  for (const section of draft.sections) {
    if (section.claimIds.length === 0 || section.claimIds.some(id => claims.get(id)?.section !== section.section)) {
      fail(409, 'RESEARCH_OUTPUT_INVALID', 'Every report section must reference valid claims from that section')
    }
  }
  for (const answer of draft.finalAnswers) {
    if (answer.claimIds.length === 0 || answer.claimIds.some(id => !claims.has(id))) {
      fail(409, 'RESEARCH_OUTPUT_INVALID', 'Every final answer must reference valid claims')
    }
  }
  for (const claim of draft.claims) {
    if (claim.sourceIds.some(id => !sourceIds.has(id))
      || claim.metricPaths.some(path => !pathExists(evidence.metrics, path))
      || claim.zoneIds.some(id => !zoneIds.has(id))
      || claim.planIds.some(id => !planIds.has(id))) {
      fail(409, 'RESEARCH_OUTPUT_INVALID', 'A claim contains a source or evidence identifier outside the frozen snapshot')
    }
    if (claim.status === 'SUPPORTED' && claim.sourceIds.length + claim.metricPaths.length + claim.zoneIds.length + claim.planIds.length === 0) {
      fail(409, 'RESEARCH_OUTPUT_INVALID', 'A supported claim must cite at least one frozen evidence path')
    }
  }
  const outputIssue = researchOutputEvidenceIssue(draft, evidence)
  if (outputIssue) fail(409, 'RESEARCH_OUTPUT_INVALID', outputIssue)
}

function titleHash(title: string): string {
  return sha256(title)
}

function safeTokenEstimate(value: string): number {
  // This deliberately overestimates mixed CJK/ASCII text. The provider's own
  // token counts remain authoritative after a completed response.
  return Math.ceil(value.length / 2)
}

function defaultEvidence(method: ResearchMethodProfile, instrument: ResearchInstrumentProfile, asOf: Date, displayTimezone: string, synthetic: boolean): ResearchEvidencePreparation {
  const manifest = researchEvidenceManifestSchema.parse({
    // A timestamp is not proof that the exchange session has completed.
    referenceSession: null,
    asOf: asOf.toISOString(),
    displayTimezone,
    exchangeTimezone: DEFAULT_EXCHANGE_TIMEZONE,
    calendarVersion: null,
    normalizationVersion: 'research-evidence-v1',
    targetSessions: Number(method.requirements.targetSessions ?? 400),
    rowCount: 0,
    completeOhlcRows: 0,
    closeRows: 0,
    volumeRows: 0,
    missingSessions: [],
    warnings: [
      synthetic ? 'Synthetic evidence is not publishable.' : 'No approved source adapter is configured.',
      `Instrument ${instrument.symbol} is prepared without private account data.`,
    ],
    sourceIds: [],
    synthetic,
  })
  return { manifest, bars: [], sources: [], metrics: {}, candidates: { search: { status: 'SEARCH_NOT_CONFIGURED' } }, qa: defaultQa(method, synthetic) }
}

function deriveQuality(method: ResearchMethodProfile, evidence: ResearchEvidence): 'FULL' | 'LIMITED' | 'STALE' | 'FAILED' {
  const manifest = evidence.manifest
  const required = Number(method.requirements.minimumCloses ?? 260)
  const complete = Number(method.requirements.minimumCompleteOhlc ?? 150)
  const volume = Number(method.requirements.minimumVolumeRows ?? 21)
  const coreQa = evidence.qa.filter(gate => RESEARCH_COMPUTED_GATE_IDS.has(gate.gateId))
  const sourceRights = sourceRecordsAreVerifiedAllowed(evidence.sources, ['automated_fetch', 'evidence_storage', 'llm_inference'])
  if (method.status !== 'COMPLETE' || manifest.synthetic || !manifest.referenceSession) return 'LIMITED'
  if (manifest.closeRows < required || manifest.completeOhlcRows < complete || manifest.volumeRows < volume) return 'LIMITED'
  if (!sourceRights || coreQa.some(gate => gate.status === 'FAIL' || gate.status === 'NOT_CHECKED' || gate.status === 'WARN')) return 'LIMITED'
  if (coreQa.length !== 6 || coreQa.some(gate => gate.status !== 'PASS')) return 'LIMITED'
  return 'FULL'
}

function evidenceFromRows(row: typeof researchEvidenceSnapshots.$inferSelect, method: ResearchMethodProfile, _instrument: ResearchInstrumentProfile): ResearchEvidence {
  const manifest = researchEvidenceManifestSchema.parse(jsonObject(row.manifestJson))
  const evidence = researchEvidenceSchema.parse({
    id: String(row.id),
    runId: String(row.runId),
    version: row.version,
    manifest,
    bars: jsonArray(row.barsJson),
    sources: jsonArray(row.sourcesJson),
    metrics: jsonObject(row.metricsJson),
    candidates: jsonObject(row.candidatesJson),
    qa: jsonArray(row.qaJson),
    quality: row.quality,
    hash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  })
  // Re-evaluate quality from server-owned method requirements and rights. The
  // client cannot promote a LIMITED snapshot to FULL by editing its payload.
  const quality = deriveQuality(method, evidence)
  const hashable = { manifest: evidence.manifest, bars: evidence.bars, sources: evidence.sources, metrics: evidence.metrics, candidates: evidence.candidates, qa: evidence.qa, quality: row.quality }
  if (sha256(stableJson(hashable)) !== row.contentHash) fail(409, 'RESEARCH_EVIDENCE_INVALID', 'Stored evidence hash does not match its immutable snapshot')
  return { ...evidence, quality }
}

function revisionView(row: typeof researchRevisions.$inferSelect) {
  return { id: String(row.id), runId: String(row.runId), revision: row.revision, parentRevision: row.parentRevision, structured: jsonObject(row.structuredJson), content: row.content, titleHash: row.titleHash, bodyHash: row.bodyHash, qaStatus: row.qaStatus, reviewStatus: row.reviewStatus, approvedBy: row.approvedBySnapshot === null ? null : String(row.approvedBySnapshot), approvedAt: iso(row.approvedAt), createdBy: row.createdBy === null ? null : String(row.createdBy), createdAt: row.createdAt.toISOString() }
}

function providerView(row: typeof researchProviderConfigs.$inferSelect) {
  return {
    id: String(row.id), revision: row.revision, status: row.status, provider: 'openrouter' as const,
    protocol: 'chat_completions' as const, baseUrl: row.baseUrl, model: 'openrouter/free' as const,
    maxInputTokens: row.maxInputTokens, maxOutputTokens: row.maxOutputTokens, timeoutMs: row.timeoutMs,
    hasSecret: Boolean(row.encryptedApiKey), updatedAt: row.updatedAt.toISOString(),
  }
}

function modelSafeCandidates(value: Record<string, unknown>): Record<string, unknown> {
  const candidates = { ...value }
  const search = candidates.search
  if (!search || typeof search !== 'object' || Array.isArray(search)) return candidates
  const status = search as Record<string, unknown>
  if (!Array.isArray(status.results)) return candidates
  candidates.search = {
    ...status,
    results: status.results.map(result => {
      if (!result || typeof result !== 'object' || Array.isArray(result)) return result
      const discoveryLead = { ...result as Record<string, unknown> }
      delete discoveryLead.snippet
      return discoveryLead
    }),
  }
  return candidates
}

/** Project bulky canonical metrics for the writer while keeping the full snapshot immutable. */
function modelSafeMetrics(value: Record<string, unknown>): Record<string, unknown> {
  const metrics = { ...value }
  const sourceSeries = metrics.series
  let maxSeriesLength = 0
  if (sourceSeries && typeof sourceSeries === 'object' && !Array.isArray(sourceSeries)) {
    const boundedSeries: Record<string, Record<string, unknown>> = {}
    for (const [key, series] of Object.entries(sourceSeries as Record<string, unknown>)) {
      if (!Array.isArray(series)) continue
      maxSeriesLength = Math.max(maxSeriesLength, series.length)
      const fromIndex = Math.max(0, series.length - MODEL_METRIC_SERIES_WINDOW)
      boundedSeries[key] = Object.fromEntries(series.slice(fromIndex).map((entry, offset) => [String(fromIndex + offset), entry]))
    }
    metrics.series = boundedSeries
  }

  if (Array.isArray(metrics.completedWeeks)) {
    metrics.completedWeekCount = metrics.completedWeeks.length
    const latestWeekIndex = metrics.completedWeeks.length - 1
    const latestWeek = metrics.completedWeeks.at(-1)
    metrics.completedWeeks = latestWeek === undefined ? {} : { [String(latestWeekIndex)]: latestWeek }
  }
  // These fields are never part of the authored report context. Full bars and
  // series remain available in the immutable evidence snapshot and reviewer UI.
  delete metrics.bars
  delete metrics.closes
  delete metrics.indicatorOhlc
  metrics.writerProjection = {
    version: MODEL_METRICS_PROJECTION_VERSION,
    dailySeriesWindow: MODEL_METRIC_SERIES_WINDOW,
    sourceSeriesLength: maxSeriesLength,
    indexSemantics: 'series.<name>[n] and completedWeeks[n] retain original zero-based source indices; cite only indices present in the supplied objects.',
    omitted: ['older indicator-series values', 'full completed-week history', 'raw OHLC bars'],
  }
  return metrics
}

export interface ResearchServiceOptions {
  db: Database
  now?: () => Date
  transport?: ResearchTransport
  evidenceProvider?: ResearchEvidenceProvider
  latestCompletedSession?: ResearchLatestCompletedSession
  allowSyntheticEvidence?: boolean
  officialSourcePolicies?: readonly ResearchSourcePolicy[]
  resolveApiKey?: (envelope: string) => string
  workerId?: string
}

export class ResearchStudioService {
  private readonly db: Database
  private readonly now: () => Date
  private readonly transport?: ResearchTransport
  private readonly evidenceProvider?: ResearchEvidenceProvider
  private readonly latestCompletedSession?: ResearchLatestCompletedSession
  private readonly allowSyntheticEvidence: boolean
  private readonly officialSourcePolicies: readonly ResearchSourcePolicy[]
  private readonly resolveApiKey: (envelope: string) => string
  private readonly workerId: string

  constructor(options: ResearchServiceOptions) {
    this.db = options.db
    this.now = options.now ?? (() => new Date())
    this.transport = options.transport
    this.evidenceProvider = options.evidenceProvider
    this.latestCompletedSession = options.latestCompletedSession
    this.allowSyntheticEvidence = options.allowSyntheticEvidence === true
    this.officialSourcePolicies = options.officialSourcePolicies ?? []
    this.resolveApiKey = options.resolveApiKey ?? (envelope => decryptAiSecret(envelope, 'research-openrouter'))
    this.workerId = options.workerId ?? `research-worker-${randomUUID()}`
  }

  private async ensureRuntime(tx: Database | Parameters<Parameters<Database['transaction']>[0]>[0], lock = false) {
    const [state] = await tx.select().from(researchRuntimeState).where(eq(researchRuntimeState.singleton, 'default')).limit(1)
    if (state) {
      if (!lock) return state
      const [locked] = await tx.select().from(researchRuntimeState).where(eq(researchRuntimeState.singleton, 'default')).limit(1).for('update')
      return locked ?? state
    }
    await tx.insert(researchRuntimeState).values({ singleton: 'default' }).onConflictDoNothing()
    const [created] = await tx.select().from(researchRuntimeState).where(eq(researchRuntimeState.singleton, 'default')).limit(1)
    if (!created) fail(503, 'RESEARCH_DISABLED', 'Research runtime state is unavailable')
    return created
  }

  private async ensureBudget(tx: Database | Parameters<Parameters<Database['transaction']>[0]>[0], lock = false) {
    const [budget] = await tx.select().from(researchBudgetSessions).where(eq(researchBudgetSessions.budgetKey, DEFAULT_BUDGET_KEY)).limit(1)
    if (!budget) fail(503, 'RESEARCH_BUDGET_EXCEEDED', 'Durable research dispatch budget is unavailable')
    if (!lock) return budget
    const [locked] = await tx.select().from(researchBudgetSessions).where(eq(researchBudgetSessions.id, budget.id)).limit(1).for('update')
    if (!locked) fail(503, 'RESEARCH_BUDGET_EXCEEDED', 'Durable research dispatch budget is unavailable')
    return locked
  }

  private assertRuntimeEnabled(runtime: typeof researchRuntimeState.$inferSelect) {
    if (!runtime.featureEnabled) fail(503, 'RESEARCH_DISABLED', 'Research Studio is disabled')
  }

  async methods() {
    const rows = await this.db.select().from(researchMethodProfiles).orderBy(asc(researchMethodProfiles.methodKey), desc(researchMethodProfiles.version))
    return rows.map(methodFromRow)
  }

  async instruments(methodProfileId?: bigint) {
    const rows = await this.db.select().from(researchInstrumentProfiles)
      .where(methodProfileId === undefined ? eq(researchInstrumentProfiles.enabled, true) : and(eq(researchInstrumentProfiles.methodProfileId, methodProfileId), eq(researchInstrumentProfiles.enabled, true)))
      .orderBy(asc(researchInstrumentProfiles.symbol))
    return rows.map(instrumentFromRow)
  }

  async settings() {
    const [runtime, provider, budget, searchBudgets] = await Promise.all([
      this.db.select().from(researchRuntimeState).where(eq(researchRuntimeState.singleton, 'default')).limit(1),
      this.db.select().from(researchProviderConfigs).where(eq(researchProviderConfigs.status, 'ACTIVE')).orderBy(desc(researchProviderConfigs.revision)).limit(1),
      this.db.select().from(researchBudgetSessions).where(eq(researchBudgetSessions.budgetKey, DEFAULT_BUDGET_KEY)).limit(1),
      this.db.select().from(researchSearchBudgets).where(eq(researchSearchBudgets.singleton, 'default')).limit(1),
    ])
    const state = runtime[0] ?? { revision: 1, featureEnabled: false, generationEnabled: false, workerId: null, workerHeartbeatAt: null }
    const currentBudget = budget[0]
    const searchBudget = searchBudgets[0]
    const tavilyConfigured = Boolean(process.env.TAVILY_API_KEY?.trim())
    const searchStatus = !tavilyConfigured
      ? 'SEARCH_NOT_CONFIGURED'
      : !searchBudget?.enabled || searchBudget.callLimit <= 0
        ? 'SEARCH_BUDGET_NOT_CONFIGURED'
        : searchBudget.reserved + searchBudget.consumed + searchBudget.unknown >= searchBudget.callLimit
          ? 'SEARCH_QUOTA_EXCEEDED'
          : 'READY'
    return {
      runtime: researchRuntimeSchema.parse({
        revision: state.revision,
        featureEnabled: state.featureEnabled,
        generationEnabled: state.generationEnabled,
        workerAvailable: Boolean(state.workerHeartbeatAt && this.now().getTime() - state.workerHeartbeatAt.getTime() < 120_000),
        workerId: state.workerId,
        workerHeartbeatAt: iso(state.workerHeartbeatAt),
        budget: {
          sessionId: currentBudget ? String(currentBudget.id) : null,
          limit: currentBudget?.dispatchLimit ?? 0,
          reserved: currentBudget?.reserved ?? 0,
          consumed: currentBudget?.consumed ?? 0,
          unknown: currentBudget?.unknown ?? 0,
        },
      }),
      provider: provider[0] ? providerView(provider[0]) : null,
      sources: [
        sourceAvailability(YAHOO_RESEARCH_POLICY, Boolean(this.evidenceProvider)),
        sourceAvailability(TAVILY_SEARCH_POLICY, tavilyConfigured && searchStatus === 'READY'),
        ...(this.officialSourcePolicies.length > 0
          ? this.officialSourcePolicies.map(policy => sourceAvailability(policy, true))
          : [sourceAvailability(NO_OFFICIAL_SOURCE_POLICY, false)]),
      ],
      search: researchSearchAvailabilitySchema.parse({
        status: searchStatus,
        configured: tavilyConfigured,
        budget: {
          limit: searchBudget?.enabled ? searchBudget.callLimit : null,
          reserved: searchBudget?.reserved ?? 0,
          consumed: searchBudget?.consumed ?? 0,
          unknown: searchBudget?.unknown ?? 0,
        },
      }),
    }
  }

  async updateRuntime(input: z.infer<typeof researchRuntimeUpdateSchema>, actorId: bigint) {
    researchRuntimeUpdateSchema.parse(input)
    await this.db.transaction(async tx => {
      const current = await this.ensureRuntime(tx, true)
      await this.ensureBudget(tx, true)
      if (current.revision !== input.expectedRevision) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Research runtime settings changed; reload and retry')
      const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
      if (actor?.role !== 'ADMIN') fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
      const [next] = await tx.update(researchRuntimeState).set({
        featureEnabled: input.featureEnabled ?? current.featureEnabled,
        generationEnabled: input.generationEnabled ?? current.generationEnabled,
        revision: current.revision + 1,
        updatedAt: this.now(),
      }).where(eq(researchRuntimeState.singleton, 'default')).returning()
      if (!next) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Research runtime settings changed; reload and retry')
    })
    return (await this.settings()).runtime
  }

  async updateProvider(input: {
    expectedRevision: number
    baseUrl: string
    model: 'openrouter/free'
    maxInputTokens: number
    maxOutputTokens: number
    timeoutMs: number
    apiKey?: string
  }, actorId: bigint) {
    if (input.model !== 'openrouter/free') fail(400, 'SYS_VALIDATION_ERROR', 'Only openrouter/free is allowed for Research Studio')
    const created = await this.db.transaction(async tx => {
      await this.ensureRuntime(tx, true)
      await this.ensureBudget(tx, true)
      const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
      if (actor?.role !== 'ADMIN') fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
      const currentRows = await tx.select().from(researchProviderConfigs).orderBy(desc(researchProviderConfigs.revision)).limit(1).for('update')
      const current = currentRows[0]
      const currentRevision = current?.revision ?? 0
      if (input.expectedRevision !== currentRevision) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Research provider settings changed; reload and retry')
      let encryptedApiKey = current?.encryptedApiKey ?? null
      if (input.apiKey) {
        try { encryptedApiKey = encryptAiSecret(input.apiKey, 'research-openrouter') }
        catch { fail(503, 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'Server encryption for provider credentials is unavailable') }
      }
      const [saved] = await tx.insert(researchProviderConfigs).values({
        revision: currentRevision + 1,
        status: 'ACTIVE',
        provider: 'openrouter',
        protocol: 'chat_completions',
        baseUrl: input.baseUrl,
        model: input.model,
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        timeoutMs: input.timeoutMs,
        encryptedApiKey,
        createdBy: actorId,
        createdAt: this.now(),
        updatedAt: this.now(),
      }).returning()
      if (!saved) throw new Error('Research provider was not saved')
      await tx.update(researchProviderConfigs).set({ status: 'RETIRED', updatedAt: this.now() }).where(and(eq(researchProviderConfigs.status, 'ACTIVE'), sql`${researchProviderConfigs.id} <> ${saved.id}`))
      return saved
    })
    return providerView(created)
  }

  private async readProfile(methodProfileId: bigint | undefined, instrumentProfileId: bigint | undefined, symbol: string | undefined) {
    let instrument: typeof researchInstrumentProfiles.$inferSelect | undefined
    if (instrumentProfileId !== undefined) {
      const rows = await this.db.select().from(researchInstrumentProfiles).where(and(eq(researchInstrumentProfiles.id, instrumentProfileId), eq(researchInstrumentProfiles.enabled, true), methodProfileId === undefined ? undefined : eq(researchInstrumentProfiles.methodProfileId, methodProfileId))).limit(1)
      instrument = rows[0]
    } else if (symbol) {
      const rows = await this.db.select().from(researchInstrumentProfiles).where(and(eq(researchInstrumentProfiles.symbol, symbol), eq(researchInstrumentProfiles.enabled, true), methodProfileId === undefined ? undefined : eq(researchInstrumentProfiles.methodProfileId, methodProfileId))).limit(1)
      instrument = rows[0]
    }
    if (!instrument) fail(404, 'RESEARCH_UNSUPPORTED_INSTRUMENT', 'Configured research instrument was not found')
    const methods = await this.db.select().from(researchMethodProfiles).where(eq(researchMethodProfiles.id, methodProfileId ?? instrument.methodProfileId)).limit(1)
    const method = methods[0]
    if (!method) fail(404, 'RESEARCH_METHOD_INCOMPLETE', 'Research method profile was not found')
    return { method, instrument }
  }

  async prepare(actorId: bigint, input: { instrumentProfileId?: string; symbol?: string; methodProfileId?: string; asOf?: string; displayTimezone?: string; synthetic: boolean }) {
    if (input.synthetic && !this.allowSyntheticEvidence) fail(403, 'RESEARCH_SYNTHETIC_NOT_ALLOWED', 'Synthetic evidence is disabled for this runtime')
    const runtime = await this.db.select().from(researchRuntimeState).where(eq(researchRuntimeState.singleton, 'default')).limit(1)
    this.assertRuntimeEnabled(runtime[0] ?? { featureEnabled: false } as never)
    const [requester] = await this.db.select({ role: users.role, timezone: users.timezone }).from(users).where(eq(users.id, actorId)).limit(1)
    if (requester?.role !== 'ADMIN') fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    const { method, instrument } = await this.readProfile(
      input.methodProfileId ? BigInt(input.methodProfileId) : undefined,
      input.instrumentProfileId ? BigInt(input.instrumentProfileId) : undefined,
      input.symbol?.toUpperCase(),
    )
    const methodView = methodFromRow(method)
    const instrumentView = instrumentFromRow(instrument)
    if (input.asOf && !input.synthetic) fail(400, 'SYS_VALIDATION_ERROR', 'Real research runs use the server clock')
    const asOf = input.synthetic && input.asOf ? new Date(input.asOf) : this.now()
    if (Number.isNaN(asOf.getTime())) fail(400, 'SYS_VALIDATION_ERROR', 'Invalid asOf instant')
    const displayTimezone = requester.timezone?.trim() || DEFAULT_DISPLAY_TIMEZONE
    const prepared = this.evidenceProvider
      ? await this.evidenceProvider({ method: methodView, instrument: instrumentView, asOf, displayTimezone, synthetic: input.synthetic })
      : defaultEvidence(methodView, instrumentView, asOf, displayTimezone, input.synthetic)
    if (prepared.manifest.synthetic !== input.synthetic) fail(400, 'RESEARCH_EVIDENCE_INVALID', 'Evidence provenance must match the server-authorized run mode')
    const evidence = {
      manifest: researchEvidenceManifestSchema.parse(prepared.manifest),
      bars: prepared.bars ?? [],
      sources: (prepared.sources ?? []).map(source => researchSourceRecordSchema.parse(source)),
      metrics: prepared.metrics ?? {},
      candidates: { search: { status: 'SEARCH_NOT_CONFIGURED' }, ...(prepared.candidates ?? {}) },
      qa: exactQa(prepared.qa ?? defaultQa(methodView, input.synthetic)),
      quality: 'LIMITED' as const,
    }
    const parsedEvidence = researchEvidenceSchema.omit({ id: true, runId: true, version: true, hash: true, createdAt: true }).parse(evidence)
    let quality = deriveQuality(methodView, { ...parsedEvidence, id: '1', runId: '1', version: 1, hash: '0'.repeat(64), createdAt: asOf.toISOString() })
    if (!input.synthetic && quality === 'FULL') {
      const latest = await this.latestCompletedSession?.({ symbol: instrument.symbol, exchangeTimezone: DEFAULT_EXCHANGE_TIMEZONE, asOf })
      if (!latest || latest.session !== parsedEvidence.manifest.referenceSession || latest.calendarVersion !== parsedEvidence.manifest.calendarVersion) {
        quality = latest && parsedEvidence.manifest.referenceSession && latest.session > parsedEvidence.manifest.referenceSession ? 'STALE' : 'LIMITED'
      }
    }
    const immutableEvidence = { ...parsedEvidence, quality }
    const evidenceHash = sha256(stableJson(immutableEvidence))
    const executionStatus = method.status === 'COMPLETE' && quality === 'FULL' ? 'DATA_READY' : 'BLOCKED'
    const now = this.now()
    const result = await this.db.transaction(async tx => {
      const [created] = await tx.insert(researchRuns).values({
        requesterId: actorId,
        methodProfileId: method.id,
        instrumentProfileId: instrument.id,
        executionStatus,
        dispatchStatus: 'NOT_SENT',
        quality,
        reviewStatus: 'DRAFT',
        referenceSession: prepared.manifest.referenceSession,
        asOf,
        displayTimezone,
        exchangeTimezone: DEFAULT_EXCHANGE_TIMEZONE,
        profileSnapshotJson: stableJson({ method: methodView, instrument: instrumentView }),
        evidenceHash,
        currentRevision: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }).returning()
      if (!created) throw new Error('Research run was not created')
      const [snapshot] = await tx.insert(researchEvidenceSnapshots).values({
        runId: created.id,
        version: 1,
        manifestJson: stableJson(immutableEvidence.manifest),
        barsJson: stableJson(immutableEvidence.bars),
        sourcesJson: stableJson(immutableEvidence.sources),
        metricsJson: stableJson(immutableEvidence.metrics),
        candidatesJson: stableJson(immutableEvidence.candidates),
        qaJson: stableJson(immutableEvidence.qa),
        quality,
        contentHash: evidenceHash,
        createdAt: now,
      }).returning()
      if (!snapshot) throw new Error('Research evidence was not created')
      return created.id
    })
    return this.detail(actorId, result)
  }

  private async readRun(actorId: bigint, runId: bigint, lock = false) {
    const query = this.db.select({ run: researchRuns, method: researchMethodProfiles, instrument: researchInstrumentProfiles })
      .from(researchRuns)
      .innerJoin(researchMethodProfiles, eq(researchMethodProfiles.id, researchRuns.methodProfileId))
      .innerJoin(researchInstrumentProfiles, eq(researchInstrumentProfiles.id, researchRuns.instrumentProfileId))
      .where(eq(researchRuns.id, runId))
      .limit(1)
    const rows = lock ? await query.for('update') : await query
    return rows[0]
  }

  private async summary(actorId: bigint, runId: bigint) {
    const row = await this.readRun(actorId, runId)
    if (!row) fail(404, 'RESEARCH_NOT_FOUND', 'Research run not found')
    return researchRunSummarySchema.parse({
      id: String(row.run.id), requesterId: row.run.requesterId === null ? null : String(row.run.requesterId), method: methodFromRow(row.method), instrument: instrumentFromRow(row.instrument),
      executionStatus: row.run.executionStatus, dispatchStatus: row.run.dispatchStatus, quality: row.run.quality, reviewStatus: row.run.reviewStatus,
      referenceSession: row.run.referenceSession, asOf: iso(row.run.asOf), displayTimezone: row.run.displayTimezone, evidenceHash: row.run.evidenceHash,
      currentRevision: row.run.currentRevision, version: row.run.version, linkedPostId: row.run.linkedPostId ? String(row.run.linkedPostId) : null,
      createdAt: row.run.createdAt.toISOString(), updatedAt: row.run.updatedAt.toISOString(),
    })
  }

  async list(actorId: bigint, input: z.infer<typeof researchRunListQuerySchema>) {
    const clauses = [
      input.symbol ? eq(researchInstrumentProfiles.symbol, input.symbol) : undefined,
      input.executionStatus ? eq(researchRuns.executionStatus, input.executionStatus) : undefined,
      input.quality ? eq(researchRuns.quality, input.quality) : undefined,
      input.reviewStatus ? eq(researchRuns.reviewStatus, input.reviewStatus) : undefined,
    ]
    const rows = await this.db.select({ run: researchRuns, method: researchMethodProfiles, instrument: researchInstrumentProfiles })
      .from(researchRuns).innerJoin(researchMethodProfiles, eq(researchMethodProfiles.id, researchRuns.methodProfileId)).innerJoin(researchInstrumentProfiles, eq(researchInstrumentProfiles.id, researchRuns.instrumentProfileId))
      .where(and(...clauses)).orderBy(desc(researchRuns.createdAt), desc(researchRuns.id)).limit(input.limit).offset((input.page - 1) * input.limit)
    const [total] = await this.db.select({ total: sql<number>`count(*)` }).from(researchRuns).innerJoin(researchInstrumentProfiles, eq(researchInstrumentProfiles.id, researchRuns.instrumentProfileId)).where(and(...clauses))
    return {
      data: rows.map(row => researchRunSummarySchema.parse({
        id: String(row.run.id), requesterId: row.run.requesterId === null ? null : String(row.run.requesterId), method: methodFromRow(row.method), instrument: instrumentFromRow(row.instrument), executionStatus: row.run.executionStatus, dispatchStatus: row.run.dispatchStatus, quality: row.run.quality, reviewStatus: row.run.reviewStatus, referenceSession: row.run.referenceSession, asOf: iso(row.run.asOf), displayTimezone: row.run.displayTimezone, evidenceHash: row.run.evidenceHash, currentRevision: row.run.currentRevision, version: row.run.version, linkedPostId: row.run.linkedPostId ? String(row.run.linkedPostId) : null, createdAt: row.run.createdAt.toISOString(), updatedAt: row.run.updatedAt.toISOString(),
      })),
      pagination: { page: input.page, limit: input.limit, total: Number(total?.total ?? 0), totalPages: Math.ceil(Number(total?.total ?? 0) / input.limit) },
    }
  }

  async detail(actorId: bigint, runId: bigint): Promise<ResearchRunDetail> {
    const row = await this.readRun(actorId, runId)
    if (!row) fail(404, 'RESEARCH_NOT_FOUND', 'Research run not found')
    const [snapshot] = await this.db.select().from(researchEvidenceSnapshots).where(eq(researchEvidenceSnapshots.runId, runId)).orderBy(desc(researchEvidenceSnapshots.version)).limit(1)
    const revisions = await this.db.select().from(researchRevisions).where(eq(researchRevisions.runId, runId)).orderBy(desc(researchRevisions.revision)).limit(1_000)
    const attempts = await this.db.select().from(researchAttempts).where(eq(researchAttempts.runId, runId)).orderBy(desc(researchAttempts.createdAt), desc(researchAttempts.id)).limit(100)
    const summary = await this.summary(actorId, runId)
    return researchRunDetailSchema.parse({
      ...summary,
      evidence: snapshot ? evidenceFromRows(snapshot, methodFromRow(row.method), instrumentFromRow(row.instrument)) : null,
      revisions: revisions.map(revision => ({ id: String(revision.id), runId: String(revision.runId), revision: revision.revision, parentRevision: revision.parentRevision, structured: jsonObject(revision.structuredJson), content: revision.content, titleHash: revision.titleHash, bodyHash: revision.bodyHash, qaStatus: revision.qaStatus, reviewStatus: revision.reviewStatus, approvedBy: revision.approvedBySnapshot ? String(revision.approvedBySnapshot) : null, approvedAt: iso(revision.approvedAt), createdBy: revision.createdBy === null ? null : String(revision.createdBy), createdAt: revision.createdAt.toISOString() })),
      attempts: attempts.map(attempt => ({ id: String(attempt.id), runId: String(attempt.runId), idempotencyKey: attempt.idempotencyKey, dispatchStatus: attempt.dispatchStatus, leaseToken: attempt.leaseToken, workerId: attempt.workerId, providerRevision: attempt.providerRevision, model: attempt.model, inputTokens: attempt.inputTokens, outputTokens: attempt.outputTokens, reasoningTokens: attempt.reasoningTokens, requestId: attempt.requestId, reportedCostUsd: attempt.reportedCostUsd, reservedCostCents: attempt.reservedCostCents, estimatedCostCents: attempt.estimatedCostCents, diagnostics: attempt.diagnostics, createdAt: attempt.createdAt.toISOString(), dispatchedAt: iso(attempt.dispatchedAt), finishedAt: iso(attempt.finishedAt) })),
      latestQa: snapshot ? jsonArray(snapshot.qaJson) : [],
    })
  }

  private async activeProvider() {
    const [provider] = await this.db.select().from(researchProviderConfigs).where(eq(researchProviderConfigs.status, 'ACTIVE')).orderBy(desc(researchProviderConfigs.revision)).limit(1)
    if (provider) return provider
    fail(503, 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'Research writer provider is not configured')
  }

  async generate(actorId: bigint, runId: bigint, input: ResearchGenerateRequest) {
    researchGenerateRequestSchema.parse(input)
    const result = await this.db.transaction(async tx => {
      const runtime = await this.ensureRuntime(tx, true)
      await this.ensureBudget(tx, true)
      const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
      if (actor?.role !== 'ADMIN') fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
      const [existing] = await tx.select().from(researchAttempts).where(and(eq(researchAttempts.runId, runId), eq(researchAttempts.idempotencyKeyHash, sha256(input.idempotencyKey)))).limit(1).for('update')
      if (existing) return { attempt: existing, reused: true }
      const rows = await tx.select({ run: researchRuns, method: researchMethodProfiles, instrument: researchInstrumentProfiles }).from(researchRuns).innerJoin(researchMethodProfiles, eq(researchMethodProfiles.id, researchRuns.methodProfileId)).innerJoin(researchInstrumentProfiles, eq(researchInstrumentProfiles.id, researchRuns.instrumentProfileId)).where(eq(researchRuns.id, runId)).limit(1).for('update')
      const current = rows[0]
      if (!current) fail(404, 'RESEARCH_NOT_FOUND', 'Research run not found')
      this.assertRuntimeEnabled(runtime ?? { featureEnabled: false } as never)
      if (!runtime?.generationEnabled) fail(503, 'RESEARCH_GENERATION_DISABLED', 'Research generation is disabled')
      if (current.method.status !== 'COMPLETE') fail(409, 'RESEARCH_METHOD_INCOMPLETE', 'The imported method bundle is incomplete')
      if (current.run.version !== input.expectedVersion) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Research run changed; reload and retry')
      const [priorAttempt] = await tx.select().from(researchAttempts).where(eq(researchAttempts.runId, runId)).limit(1).for('update')
      if (priorAttempt?.dispatchStatus === 'OUTCOME_UNKNOWN' || current.run.dispatchStatus === 'OUTCOME_UNKNOWN') fail(409, 'RESEARCH_OUTCOME_UNKNOWN', 'Dispatch outcome is unknown and cannot be resent')
      if (priorAttempt || current.run.executionStatus === 'CANCELLED') fail(409, 'RESEARCH_IDEMPOTENCY_CONFLICT', 'This run already has its initial generation or was cancelled; it cannot be dispatched again')
      if (current.run.executionStatus === 'GENERATING') fail(409, 'RESEARCH_IDEMPOTENCY_CONFLICT', 'Research generation is already running')
      if (!current.run.evidenceHash) fail(409, 'RESEARCH_EVIDENCE_INVALID', 'Research evidence is not prepared')
      const [snapshot] = await tx.select().from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, runId), eq(researchEvidenceSnapshots.contentHash, current.run.evidenceHash))).limit(1)
      if (!snapshot) fail(409, 'RESEARCH_EVIDENCE_INVALID', 'Research evidence snapshot is missing or corrupt')
      try { evidenceFromRows(snapshot, methodFromRow(current.method), instrumentFromRow(current.instrument)) }
      catch { fail(409, 'RESEARCH_EVIDENCE_INVALID', 'Research evidence snapshot is missing or corrupt') }
      const manifest = researchEvidenceManifestSchema.parse(jsonObject(snapshot.manifestJson))
      const synthetic = manifest.synthetic
      if (synthetic && (!this.allowSyntheticEvidence || !this.transport)) fail(403, 'RESEARCH_SYNTHETIC_NOT_ALLOWED', 'Synthetic generation is limited to the injected offline runtime')
      if (!synthetic) {
        if (current.run.quality !== 'FULL' || current.run.referenceSession !== manifest.referenceSession) fail(409, 'RESEARCH_EVIDENCE_INVALID', 'Only current, fully verified evidence can be sent for generation')
        const latest = await this.latestCompletedSession?.({ symbol: current.instrument.symbol, exchangeTimezone: DEFAULT_EXCHANGE_TIMEZONE, asOf: this.now(), referenceSession: current.run.referenceSession })
        if (!latest || latest.session !== current.run.referenceSession || latest.calendarVersion !== manifest.calendarVersion) fail(409, 'RESEARCH_EVIDENCE_STALE', 'Research evidence is not the latest verified completed session')
        const sources = jsonArray<unknown>(snapshot.sourcesJson).map(source => researchSourceRecordSchema.parse(source))
        if (!sourceRecordsAreVerifiedAllowed(sources, ['automated_fetch', 'evidence_storage', 'llm_inference'])) {
          fail(409, 'RESEARCH_SOURCE_POLICY_BLOCKED', 'Source rights do not allow this evidence to be sent for inference')
        }
      }
      const providerRows = await tx.select().from(researchProviderConfigs).where(eq(researchProviderConfigs.status, 'ACTIVE')).orderBy(desc(researchProviderConfigs.revision)).limit(1)
      const provider = providerRows[0]
      if (!provider && !synthetic) fail(503, 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'Research writer provider is not configured')
      if (provider && (!provider.encryptedApiKey || provider.baseUrl !== 'https://openrouter.ai/api/v1' || provider.model !== 'openrouter/free')) {
        if (!synthetic) fail(503, 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'Research writer credentials or configuration are unavailable')
      }
      let apiKey = 'offline-fixture-only'
      if (provider?.encryptedApiKey) {
        try { apiKey = this.resolveApiKey(provider.encryptedApiKey) }
        catch { if (!synthetic) fail(503, 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'Research writer credentials are unavailable') }
      }
      if (!this.transport) fail(503, 'RESEARCH_PROVIDER_NOT_CONFIGURED', 'Research worker transport is unavailable')
      if (PRIVATE_DATA_SENTINEL.test(stableJson({ method: current.method.methodKey, symbol: current.instrument.symbol, manifest: jsonObject(snapshot.manifestJson), metrics: jsonObject(snapshot.metricsJson) }))) {
        fail(409, 'RESEARCH_PRIVATE_DATA_SENTINEL', 'Private data was detected in the evidence snapshot')
      }
      const now = this.now()
      const [attempt] = await tx.insert(researchAttempts).values({ runId, idempotencyKey: input.idempotencyKey, idempotencyKeyHash: sha256(input.idempotencyKey), dispatchStatus: 'DISPATCH_INTENT', runtimeRevision: runtime.revision, leaseToken: randomUUID(), workerId: null, providerRevision: provider?.revision ?? null, model: provider?.model ?? 'openrouter/free', reservedCostCents: 0, estimatedCostCents: null, createdAt: now }).returning()
      if (!attempt) throw new Error('Research attempt was not created')
      if (!synthetic) await reserveResearchLiveDispatch(tx, now)
      const [updatedRun] = await tx.update(researchRuns).set({ executionStatus: 'GENERATING', dispatchStatus: 'DISPATCH_INTENT', version: current.run.version + 1, updatedAt: now }).where(and(eq(researchRuns.id, runId), eq(researchRuns.version, input.expectedVersion))).returning({ id: researchRuns.id })
      if (!updatedRun) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Research run changed; reload and retry')
      return { attempt, reused: false, apiKey }
    })
    return { run: await this.summary(actorId, runId), attempt: this.attemptView(result.attempt), reused: result.reused }
  }

  private attemptView(attempt: typeof researchAttempts.$inferSelect) {
    return { id: String(attempt.id), runId: String(attempt.runId), idempotencyKey: attempt.idempotencyKey, dispatchStatus: attempt.dispatchStatus, leaseToken: null, workerId: attempt.workerId, providerRevision: attempt.providerRevision, model: attempt.model, inputTokens: attempt.inputTokens, outputTokens: attempt.outputTokens, reasoningTokens: attempt.reasoningTokens, requestId: attempt.requestId, reportedCostUsd: attempt.reportedCostUsd, reservedCostCents: attempt.reservedCostCents, estimatedCostCents: attempt.estimatedCostCents, diagnostics: attempt.diagnostics, createdAt: attempt.createdAt.toISOString(), dispatchedAt: iso(attempt.dispatchedAt), finishedAt: iso(attempt.finishedAt) }
  }

  private async claimAttempt() {
    return this.db.transaction(async tx => {
      const runtime = await this.ensureRuntime(tx, true)
      const budget = await this.ensureBudget(tx, true)
      const now = this.now()
      if (runtime.activeAttemptId && runtime.activeLeaseExpiresAt && runtime.activeLeaseExpiresAt <= now) {
        await this.expireActiveAttempt(tx, runtime, budget, now)
      } else if (runtime.activeAttemptId) {
        await tx.update(researchRuntimeState).set({ workerId: this.workerId, workerHeartbeatAt: now, updatedAt: now }).where(eq(researchRuntimeState.singleton, 'default'))
        return null
      }
      const rows = await tx.select({ attempt: researchAttempts, run: researchRuns, method: researchMethodProfiles, instrument: researchInstrumentProfiles }).from(researchAttempts).innerJoin(researchRuns, eq(researchRuns.id, researchAttempts.runId)).innerJoin(researchMethodProfiles, eq(researchMethodProfiles.id, researchRuns.methodProfileId)).innerJoin(researchInstrumentProfiles, eq(researchInstrumentProfiles.id, researchRuns.instrumentProfileId)).where(eq(researchAttempts.dispatchStatus, 'DISPATCH_INTENT')).orderBy(asc(researchAttempts.createdAt), asc(researchAttempts.id)).limit(1).for('update')
      const row = rows[0]
      if (!row) return null
      const [attempt] = await tx.select().from(researchAttempts).where(eq(researchAttempts.id, row.attempt.id)).limit(1).for('update')
      const [run] = await tx.select().from(researchRuns).where(eq(researchRuns.id, row.run.id)).limit(1).for('update')
      const method = methodFromRow(row.method)
      const instrument = instrumentFromRow(row.instrument)
      const [snapshot] = run?.evidenceHash ? await tx.select().from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, run.id), eq(researchEvidenceSnapshots.contentHash, run.evidenceHash))).limit(1) : []
      const validationCode = await this.preDispatchFailure(tx, runtime, attempt, run, method, instrument, snapshot, now)
      if (validationCode) {
        await this.settlePreDispatchFailure(tx, attempt, run, budget, validationCode, now)
        return null
      }
      if (!attempt || !run || !snapshot || !this.transport) return null
      const manifest = researchEvidenceManifestSchema.parse(jsonObject(snapshot.manifestJson))
      const synthetic = manifest.synthetic
      const providerRows = attempt.providerRevision === null
        ? []
        : await tx.select().from(researchProviderConfigs).where(and(eq(researchProviderConfigs.revision, attempt.providerRevision), eq(researchProviderConfigs.status, 'ACTIVE'))).limit(1)
      const provider = providerRows[0]
      let apiKey = 'offline-fixture-only'
      if (provider?.encryptedApiKey) {
        try { apiKey = this.resolveApiKey(provider.encryptedApiKey) }
        catch { await this.settlePreDispatchFailure(tx, attempt, run, budget, 'RESEARCH_PROVIDER_NOT_CONFIGURED', now); return null }
      }
      if (!synthetic && (!provider || !provider.encryptedApiKey || provider.baseUrl !== 'https://openrouter.ai/api/v1' || provider.model !== 'openrouter/free')) {
        await this.settlePreDispatchFailure(tx, attempt, run, budget, 'RESEARCH_PROVIDER_NOT_CONFIGURED', now)
        return null
      }
      const payload = this.buildResearchPayload(method, instrument, snapshot)
      const maxInputTokens = provider?.maxInputTokens ?? 200_000
      if (payload.length > MAX_EVIDENCE_PROMPT_CHARS || safeTokenEstimate(payload) > maxInputTokens) {
        await this.settlePreDispatchFailure(tx, attempt, run, budget, 'RESEARCH_INPUT_TOO_LARGE', now)
        return null
      }
      const timeoutMs = provider?.timeoutMs ?? 30_000
      const [claimed] = await tx.update(researchAttempts).set({ dispatchStatus: 'SENT', workerId: this.workerId, dispatchedAt: now }).where(and(eq(researchAttempts.id, attempt.id), eq(researchAttempts.dispatchStatus, 'DISPATCH_INTENT'))).returning()
      if (!claimed) return null
      await tx.update(researchRuns).set({ dispatchStatus: 'SENT', version: run.version + 1, updatedAt: now }).where(and(eq(researchRuns.id, run.id), eq(researchRuns.dispatchStatus, 'DISPATCH_INTENT')))
      const [lease] = await tx.update(researchRuntimeState).set({ workerId: this.workerId, workerHeartbeatAt: now, activeAttemptId: attempt.id, activeLeaseToken: attempt.leaseToken!, activeLeaseExpiresAt: new Date(now.getTime() + timeoutMs + FIXED_DISPATCH_GRACE_MS), updatedAt: now }).where(eq(researchRuntimeState.singleton, 'default')).returning()
      if (!lease) throw new Error('Research worker lease could not be recorded')
      return { attempt: claimed, run: { ...run, dispatchStatus: 'SENT' as const, version: run.version + 1 }, method, instrument, snapshot, provider, apiKey, payload, timeoutMs }
    })
  }

  private bundleHash(): string {
    return sha256(RESEARCH_METHOD_DOCUMENTS.map(document => [document.name, document.title, document.content].join('\n')).join('\n\n'))
  }

  private buildResearchPayload(method: ResearchMethodProfile, instrument: ResearchInstrumentProfile, snapshot: typeof researchEvidenceSnapshots.$inferSelect): string {
    const bundle = RESEARCH_METHOD_DOCUMENTS.map(({ name, title, content }) => ({ name, title, content }))
    if (bundle.length !== 8 || bundle[0]?.name !== 'main' || bundle.slice(1).length !== 7 || bundle.some(document => !document.content.trim())) {
      fail(409, 'RESEARCH_METHOD_INCOMPLETE', 'The complete versioned method bundle is unavailable')
    }
    const payload = stableJson({
      schemaVersion: 'research-request-v1',
      method: { key: method.key, version: method.version, bundleHash: method.bundleHash, requirements: method.requirements, coverageManifest: method.coverageManifest },
      completeMethodBundle: bundle,
      backendSafetyRules: RESEARCH_REPORT_RULES,
      instrument,
      untrustedEvidenceSnapshot: {
        contentHash: snapshot.contentHash,
        manifest: jsonObject(snapshot.manifestJson),
        sources: jsonArray(snapshot.sourcesJson),
        metrics: modelSafeMetrics(jsonObject(snapshot.metricsJson)),
        candidates: modelSafeCandidates(jsonObject(snapshot.candidatesJson)),
        qa: jsonArray(snapshot.qaJson),
      },
      outputContract: {
        schemaVersion: 'research-draft-v1',
        sections: 'Exactly sections 1 through 10, once each; every section cites claim IDs from that section.',
        finalAnswers: 'Exactly eight answers; every answer cites at least one claim ID.',
        claims: 'Unique claim IDs; every cited source, metric path, zone ID and plan ID must come from the frozen evidence snapshot.',
        metrics: `Use supplied latest scalar values and the ${MODEL_METRICS_PROJECTION_VERSION} projection only. Daily series expose their trailing ${MODEL_METRIC_SERIES_WINDOW} values keyed by original zero-based index; the latest completed weekly summary is keyed by its original completedWeeks index. Cite paths such as series.ema10[399] or completedWeeks[79].close only when that index is present. Older series, complete weekly history, and raw bars are intentionally absent from the writer context.`,
        qa: 'QA statuses are server-owned and must not be generated or changed by the model.',
        absentEvidence: 'State the limitation. Never infer missing values or use external knowledge as evidence.',
      },
      outputLanguage: 'Traditional Chinese',
    })
    if (payload.length > MAX_EVIDENCE_PROMPT_CHARS) fail(413, 'RESEARCH_INPUT_TOO_LARGE', 'Research evidence exceeds the local prompt safety limit')
    return payload
  }

  private async preDispatchFailure(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    runtime: typeof researchRuntimeState.$inferSelect,
    attempt: typeof researchAttempts.$inferSelect | undefined,
    run: typeof researchRuns.$inferSelect | undefined,
    method: ResearchMethodProfile,
    instrument: ResearchInstrumentProfile,
    snapshot: typeof researchEvidenceSnapshots.$inferSelect | undefined,
    now: Date,
  ): Promise<ErrorCode | null> {
    if (!attempt || !run || !snapshot) return 'RESEARCH_EVIDENCE_INVALID'
    if (!runtime.featureEnabled) return 'RESEARCH_DISABLED'
    if (!runtime.generationEnabled) return 'RESEARCH_GENERATION_DISABLED'
    if (attempt.runtimeRevision !== runtime.revision) return 'RESEARCH_REVISION_CONFLICT'
    if (attempt.dispatchStatus !== 'DISPATCH_INTENT' || run.dispatchStatus !== 'DISPATCH_INTENT' || run.executionStatus !== 'GENERATING') return 'RESEARCH_DISPATCH_NOT_AUTHORIZED'
    if (method.status !== 'COMPLETE' || method.bundleHash !== this.bundleHash()) return 'RESEARCH_METHOD_INCOMPLETE'
    if (run.evidenceHash !== snapshot.contentHash) return 'RESEARCH_EVIDENCE_INVALID'
    const [requester] = run.requesterId === null ? [] : await tx.select({ role: users.role }).from(users).where(eq(users.id, run.requesterId)).limit(1)
    if (requester?.role !== 'ADMIN') return 'RESEARCH_DISPATCH_NOT_AUTHORIZED'
    const [activeProvider] = await tx.select().from(researchProviderConfigs).where(eq(researchProviderConfigs.status, 'ACTIVE')).orderBy(desc(researchProviderConfigs.revision)).limit(1)
    if ((activeProvider?.revision ?? null) !== attempt.providerRevision) return 'RESEARCH_PROVIDER_NOT_CONFIGURED'
    const manifestResult = researchEvidenceManifestSchema.safeParse(jsonObject(snapshot.manifestJson))
    if (!manifestResult.success) return 'RESEARCH_EVIDENCE_INVALID'
    try { evidenceFromRows(snapshot, method, instrument) }
    catch { return 'RESEARCH_EVIDENCE_INVALID' }
    const manifest = manifestResult.data
    if (manifest.synthetic) {
      return this.allowSyntheticEvidence && this.transport ? null : 'RESEARCH_SYNTHETIC_NOT_ALLOWED'
    }
    if (run.quality !== 'FULL' || !run.referenceSession || run.referenceSession !== manifest.referenceSession || !this.latestCompletedSession) return 'RESEARCH_EVIDENCE_STALE'
    const latest = await this.latestCompletedSession({ symbol: instrument.symbol, exchangeTimezone: DEFAULT_EXCHANGE_TIMEZONE, asOf: now, referenceSession: run.referenceSession })
    if (!latest || latest.session !== run.referenceSession || latest.calendarVersion !== manifest.calendarVersion) return 'RESEARCH_EVIDENCE_STALE'
    const sourceResult = z.array(researchSourceRecordSchema).max(100).safeParse(jsonArray(snapshot.sourcesJson))
    if (!sourceResult.success || !sourceRecordsAreVerifiedAllowed(sourceResult.data, ['automated_fetch', 'evidence_storage', 'llm_inference'])) return 'RESEARCH_SOURCE_POLICY_BLOCKED'
    const provider = activeProvider
    if (!provider || !provider.encryptedApiKey || provider.baseUrl !== 'https://openrouter.ai/api/v1' || provider.model !== 'openrouter/free') return 'RESEARCH_PROVIDER_NOT_CONFIGURED'
    try { this.resolveApiKey(provider.encryptedApiKey) }
    catch { return 'RESEARCH_PROVIDER_NOT_CONFIGURED' }
    return null
  }

  private async settlePreDispatchFailure(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    attempt: typeof researchAttempts.$inferSelect | undefined,
    run: typeof researchRuns.$inferSelect | undefined,
    budget: typeof researchBudgetSessions.$inferSelect,
    code: ErrorCode,
    now: Date,
  ) {
    if (!attempt || !run) return
    const [settled] = await tx.update(researchAttempts).set({ dispatchStatus: 'FAILED', diagnostics: code, finishedAt: now }).where(and(eq(researchAttempts.id, attempt.id), eq(researchAttempts.dispatchStatus, 'DISPATCH_INTENT'))).returning({ id: researchAttempts.id })
    if (!settled) return
    const [snapshot] = await tx.select({ manifestJson: researchEvidenceSnapshots.manifestJson }).from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, run.id), eq(researchEvidenceSnapshots.contentHash, run.evidenceHash ?? ''))).limit(1)
    const synthetic = researchEvidenceManifestSchema.safeParse(jsonObject(snapshot?.manifestJson)).data?.synthetic === true
    if (!synthetic) await tx.update(researchBudgetSessions).set({ reserved: sql`greatest(0, ${researchBudgetSessions.reserved} - 1)`, updatedAt: now }).where(eq(researchBudgetSessions.id, budget.id))
    await tx.update(researchRuns).set({ executionStatus: 'BLOCKED', dispatchStatus: 'FAILED', version: run.version + 1, updatedAt: now }).where(and(eq(researchRuns.id, run.id), eq(researchRuns.dispatchStatus, 'DISPATCH_INTENT')))
  }

  private async expireActiveAttempt(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    runtime: typeof researchRuntimeState.$inferSelect,
    budget: typeof researchBudgetSessions.$inferSelect,
    now: Date,
  ) {
    const activeId = runtime.activeAttemptId
    const token = runtime.activeLeaseToken
    const [attempt] = activeId ? await tx.select().from(researchAttempts).where(eq(researchAttempts.id, activeId)).limit(1).for('update') : []
    const [run] = attempt ? await tx.select().from(researchRuns).where(eq(researchRuns.id, attempt.runId)).limit(1).for('update') : []
    if (attempt?.dispatchStatus === 'SENT' && attempt.leaseToken === token) {
      const [settled] = await tx.update(researchAttempts).set({ dispatchStatus: 'OUTCOME_UNKNOWN', diagnostics: 'RESEARCH_DISPATCH_EXPIRED', finishedAt: now }).where(and(eq(researchAttempts.id, attempt.id), eq(researchAttempts.dispatchStatus, 'SENT'), eq(researchAttempts.leaseToken, token!))).returning({ id: researchAttempts.id })
      if (settled) {
        const [snapshot] = await tx.select({ manifestJson: researchEvidenceSnapshots.manifestJson }).from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, run?.id ?? 0n), eq(researchEvidenceSnapshots.contentHash, run?.evidenceHash ?? ''))).limit(1)
        const synthetic = researchEvidenceManifestSchema.safeParse(jsonObject(snapshot?.manifestJson)).data?.synthetic === true
        if (!synthetic) await tx.update(researchBudgetSessions).set({ reserved: sql`greatest(0, ${researchBudgetSessions.reserved} - 1)`, unknown: sql`${researchBudgetSessions.unknown} + 1`, updatedAt: now }).where(eq(researchBudgetSessions.id, budget.id))
        if (run && run.dispatchStatus === 'SENT') await tx.update(researchRuns).set({ executionStatus: run.executionStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED', dispatchStatus: 'OUTCOME_UNKNOWN', quality: run.executionStatus === 'CANCELLED' ? run.quality : 'FAILED', version: run.version + 1, updatedAt: now }).where(and(eq(researchRuns.id, run.id), eq(researchRuns.dispatchStatus, 'SENT')))
      }
    }
    await tx.update(researchRuntimeState).set({ activeAttemptId: null, activeLeaseToken: null, activeLeaseExpiresAt: null, workerHeartbeatAt: now, workerId: this.workerId, updatedAt: now }).where(eq(researchRuntimeState.singleton, 'default'))
  }

  private async finishSuccessfulAttempt(attemptId: bigint, runId: bigint, leaseToken: string, draft: ResearchDraft, method: ResearchMethodProfile, content: string, bodyHash: string, response: ResearchTransportResponse) {
    const now = this.now()
    await this.db.transaction(async tx => {
      const runtime = await this.ensureRuntime(tx, true)
      const budget = await this.ensureBudget(tx, true)
      const [attempt] = await tx.select().from(researchAttempts).where(eq(researchAttempts.id, attemptId)).limit(1).for('update')
      if (!attempt || attempt.dispatchStatus !== 'SENT' || attempt.leaseToken !== leaseToken) return
      const [run] = await tx.select().from(researchRuns).where(eq(researchRuns.id, runId)).limit(1).for('update')
      const ownsLease = runtime.activeAttemptId === attemptId && runtime.activeLeaseToken === leaseToken && runtime.activeLeaseExpiresAt !== null && runtime.activeLeaseExpiresAt > now
      if (!ownsLease) {
        await this.settleLockedAttempt(tx, attempt, run, runtime, budget, 'OUTCOME_UNKNOWN', 'RESEARCH_DISPATCH_EXPIRED', response, now)
        return
      }
      if (!run || run.dispatchStatus !== 'SENT') {
        await this.settleLockedAttempt(tx, attempt, run, runtime, budget, 'OUTCOME_UNKNOWN', 'RESEARCH_DISPATCH_EXPIRED', response, now)
        return
      }
      const [snapshot] = run.evidenceHash ? await tx.select().from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, runId), eq(researchEvidenceSnapshots.contentHash, run.evidenceHash))).limit(1) : []
      if (!snapshot || method.status !== 'COMPLETE' || method.bundleHash !== this.bundleHash() || content.length > 200_000) {
        await this.settleLockedAttempt(tx, attempt, run, runtime, budget, 'FAILED', 'RESEARCH_OUTPUT_INVALID', response, now)
        return
      }
      if (run.executionStatus === 'CANCELLED') {
        await this.settleLockedAttempt(tx, attempt, run, runtime, budget, 'SUCCEEDED', 'RESEARCH_CANCELLED_AFTER_DISPATCH', response, now)
        return
      }
      const qa = exactQa(jsonArray(snapshot.qaJson))
      const revisionNumber = run.currentRevision + 1
      const [revision] = await tx.insert(researchRevisions).values({ runId, revision: revisionNumber, parentRevision: run.currentRevision || null, structuredJson: stableJson({ ...draft, qa }), content, titleHash: titleHash(draft.title), bodyHash, qaStatus: qa.some(gate => gate.status === 'FAIL') ? 'FAIL' : qa.some(gate => gate.status === 'WARN') ? 'WARN' : qa.some(gate => gate.status === 'NOT_CHECKED') ? 'NOT_CHECKED' : 'PASS', reviewStatus: 'DRAFT', createdBy: run.requesterId, createdAt: now }).returning({ id: researchRevisions.id })
      if (!revision) throw new Error('Research revision was not created')
      await this.settleLockedAttempt(tx, attempt, run, runtime, budget, 'SUCCEEDED', null, response, now, { revisionNumber })
    })
  }

  private async finishAttempt(attemptId: bigint, runId: bigint, leaseToken: string, status: 'FAILED' | 'OUTCOME_UNKNOWN', diagnostics: string, response: ResearchTransportResponse | null) {
    const now = this.now()
    await this.db.transaction(async tx => {
      const runtime = await this.ensureRuntime(tx, true)
      const budget = await this.ensureBudget(tx, true)
      const [attempt] = await tx.select().from(researchAttempts).where(eq(researchAttempts.id, attemptId)).limit(1).for('update')
      if (!attempt || attempt.dispatchStatus !== 'SENT' || attempt.leaseToken !== leaseToken) return
      const [run] = await tx.select().from(researchRuns).where(eq(researchRuns.id, runId)).limit(1).for('update')
      const ownsLease = runtime.activeAttemptId === attemptId && runtime.activeLeaseToken === leaseToken && runtime.activeLeaseExpiresAt !== null && runtime.activeLeaseExpiresAt > now
      const finalStatus = ownsLease ? status : 'OUTCOME_UNKNOWN'
      await this.settleLockedAttempt(tx, attempt, run, runtime, budget, finalStatus, ownsLease ? diagnostics : 'RESEARCH_DISPATCH_EXPIRED', response, now)
    })
  }

  private async settleLockedAttempt(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    attempt: typeof researchAttempts.$inferSelect,
    run: typeof researchRuns.$inferSelect | undefined,
    runtime: typeof researchRuntimeState.$inferSelect,
    budget: typeof researchBudgetSessions.$inferSelect,
    status: 'SUCCEEDED' | 'FAILED' | 'OUTCOME_UNKNOWN',
    diagnostics: string | null,
    response: ResearchTransportResponse | null,
    now: Date,
    success?: { revisionNumber: number },
  ) {
    const [snapshot] = run ? await tx.select({ manifestJson: researchEvidenceSnapshots.manifestJson }).from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, run.id), eq(researchEvidenceSnapshots.contentHash, run.evidenceHash ?? ''))).limit(1) : []
    const synthetic = researchEvidenceManifestSchema.safeParse(jsonObject(snapshot?.manifestJson)).data?.synthetic === true
    const [settled] = await tx.update(researchAttempts).set({
      dispatchStatus: status,
      inputTokens: response?.inputTokens ?? null,
      outputTokens: response?.outputTokens ?? null,
      reasoningTokens: response?.reasoningTokens ?? null,
      requestId: response?.requestId ?? null,
      reportedCostUsd: response?.reportedCostUsd ?? null,
      model: response?.model ?? attempt.model,
      diagnostics,
      finishedAt: now,
    }).where(and(eq(researchAttempts.id, attempt.id), eq(researchAttempts.dispatchStatus, 'SENT'), eq(researchAttempts.leaseToken, attempt.leaseToken!))).returning({ id: researchAttempts.id })
    if (!settled) return
    if (!synthetic) {
      const consumed = status === 'SUCCEEDED' || status === 'FAILED' ? 1 : 0
      const unknown = status === 'OUTCOME_UNKNOWN' ? 1 : 0
      const hasUnexpectedCost = response?.reportedCostUsd !== null && response?.reportedCostUsd !== undefined && Number(response.reportedCostUsd) > 0
      const nextReserved = Math.max(0, budget.reserved - 1)
      const nextConsumed = budget.consumed + consumed
      const nextUnknown = budget.unknown + unknown
      await tx.update(researchBudgetSessions).set({
        reserved: nextReserved,
        consumed: nextConsumed,
        unknown: nextUnknown,
        dispatchLimit: hasUnexpectedCost ? Math.min(budget.dispatchLimit, nextReserved + nextConsumed + nextUnknown) : budget.dispatchLimit,
        updatedAt: now,
      }).where(eq(researchBudgetSessions.id, budget.id))
    }
    if (run && run.dispatchStatus === 'SENT') {
      if (run.executionStatus === 'CANCELLED') {
        await tx.update(researchRuns).set({ dispatchStatus: status, version: run.version + 1, updatedAt: now }).where(and(eq(researchRuns.id, run.id), eq(researchRuns.dispatchStatus, 'SENT')))
      } else if (status === 'SUCCEEDED' && success) {
        await tx.update(researchRuns).set({ executionStatus: 'DRAFT_READY', dispatchStatus: 'SUCCEEDED', currentRevision: success.revisionNumber, reviewStatus: 'DRAFT', version: run.version + 1, updatedAt: now }).where(and(eq(researchRuns.id, run.id), eq(researchRuns.dispatchStatus, 'SENT')))
      } else {
        await tx.update(researchRuns).set({ executionStatus: 'FAILED', dispatchStatus: status, quality: status === 'OUTCOME_UNKNOWN' ? 'FAILED' : run.quality, version: run.version + 1, updatedAt: now }).where(and(eq(researchRuns.id, run.id), eq(researchRuns.dispatchStatus, 'SENT')))
      }
    }
    if (runtime.activeAttemptId === attempt.id && runtime.activeLeaseToken === attempt.leaseToken) {
      await tx.update(researchRuntimeState).set({ activeAttemptId: null, activeLeaseToken: null, activeLeaseExpiresAt: null, workerHeartbeatAt: now, updatedAt: now }).where(eq(researchRuntimeState.singleton, 'default'))
    }
  }

  async runOnce(): Promise<ResearchRunDetail | null> {
    const claimed = await this.claimAttempt()
    if (!claimed) return null
    const { attempt, run, method, instrument, snapshot, provider, apiKey, payload, timeoutMs } = claimed
    let response: ResearchTransportResponse | null = null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      response = await this.transport!.generate({ baseUrl: provider?.baseUrl ?? 'https://openrouter.ai/api/v1', model: 'openrouter/free', apiKey, maxInputTokens: provider?.maxInputTokens ?? 200_000, maxOutputTokens: provider?.maxOutputTokens ?? 6_000, timeoutMs, payload, signal: controller.signal })
      if (PRIVATE_DATA_SENTINEL.test(response.content)) {
        await this.finishAttempt(attempt.id, run.id, attempt.leaseToken!, 'FAILED', 'RESEARCH_PRIVATE_DATA_SENTINEL', response)
        return this.detail(run.requesterId ?? BigInt(0), run.id)
      }
      let parsed: unknown
      try { parsed = JSON.parse(response.content) }
      catch {
        await this.finishAttempt(attempt.id, run.id, attempt.leaseToken!, 'FAILED', 'RESEARCH_OUTPUT_INVALID', response)
        return this.detail(run.requesterId ?? BigInt(0), run.id)
      }
      const draftResult = researchDraftSchema.safeParse(parsed)
      if (!draftResult.success) {
        await this.finishAttempt(attempt.id, run.id, attempt.leaseToken!, 'FAILED', 'RESEARCH_OUTPUT_INVALID', response)
        return this.detail(run.requesterId ?? BigInt(0), run.id)
      }
      const draft = draftResult.data
      let frozenEvidence: ResearchEvidence
      try {
        frozenEvidence = evidenceFromRows(snapshot, method, instrument)
        validateDraftReferences(draft, {
          sources: researchReportCitationSources(frozenEvidence.sources),
          metrics: modelSafeMetrics(frozenEvidence.metrics),
          candidates: frozenEvidence.candidates,
        })
      }
      catch {
        await this.finishAttempt(attempt.id, run.id, attempt.leaseToken!, 'FAILED', 'RESEARCH_OUTPUT_INVALID', response)
        return this.detail(run.requesterId ?? BigInt(0), run.id)
      }
      const content = renderResearchReport(draft, frozenEvidence)
      const bodyHash = sha256(content)
      await this.finishSuccessfulAttempt(attempt.id, run.id, attempt.leaseToken!, draft, method, content, bodyHash, response)
      return this.detail(run.requesterId ?? BigInt(0), run.id)
    } catch (error) {
      const unknown = error instanceof ResearchTransportError ? error.outcomeUnknown : response === null
      await this.finishAttempt(attempt.id, run.id, attempt.leaseToken!, unknown ? 'OUTCOME_UNKNOWN' : 'FAILED', safeDiagnostics(error), response)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  async cancel(actorId: bigint, runId: bigint) {
    const updated = await this.db.transaction(async tx => {
      const runtime = await this.ensureRuntime(tx, true)
      const budget = await this.ensureBudget(tx, true)
      const [attempt] = await tx.select().from(researchAttempts).where(and(eq(researchAttempts.runId, runId), inArray(researchAttempts.dispatchStatus, ['DISPATCH_INTENT', 'SENT']))).orderBy(desc(researchAttempts.createdAt)).limit(1).for('update')
      const [run] = await tx.select().from(researchRuns).where(eq(researchRuns.id, runId)).limit(1).for('update')
      if (!run) fail(404, 'RESEARCH_NOT_FOUND', 'Research run not found')
      const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
      if (actor?.role !== 'ADMIN') fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
      if (run.executionStatus === 'DRAFT_READY' || run.executionStatus === 'CANCELLED' || (!attempt && run.dispatchStatus !== 'NOT_SENT')) return run.id
      const now = this.now()
      const sent = attempt?.dispatchStatus === 'SENT'
      if (attempt?.dispatchStatus === 'DISPATCH_INTENT') {
        await tx.update(researchAttempts).set({ dispatchStatus: 'FAILED', diagnostics: 'RESEARCH_CANCELLED_BEFORE_DISPATCH', finishedAt: now }).where(and(eq(researchAttempts.id, attempt.id), eq(researchAttempts.dispatchStatus, 'DISPATCH_INTENT')))
        const [snapshot] = await tx.select({ manifestJson: researchEvidenceSnapshots.manifestJson }).from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, run.id), eq(researchEvidenceSnapshots.contentHash, run.evidenceHash ?? ''))).limit(1)
        const synthetic = researchEvidenceManifestSchema.safeParse(jsonObject(snapshot?.manifestJson)).data?.synthetic === true
        if (!synthetic) await tx.update(researchBudgetSessions).set({ reserved: sql`greatest(0, ${researchBudgetSessions.reserved} - 1)`, updatedAt: now }).where(eq(researchBudgetSessions.id, budget.id))
      }
      // A SENT request keeps its lease and reservation through its fixed
      // dispatch deadline. The response settles usage but can never add a draft.
      await tx.update(researchRuns).set({ executionStatus: 'CANCELLED', dispatchStatus: sent ? 'SENT' : attempt ? 'FAILED' : run.dispatchStatus, version: run.version + 1, updatedAt: now }).where(eq(researchRuns.id, run.id))
      void runtime
      return run.id
    })
    return this.detail(actorId, updated)
  }

  private async reviewContext(tx: Parameters<Parameters<Database['transaction']>[0]>[0], actorId: bigint, runId: bigint, expectedVersion: number) {
    await lockResearchMutation(tx)
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1)
    if (actor?.role !== 'ADMIN') fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    const [run] = await tx.select().from(researchRuns).where(eq(researchRuns.id, runId)).for('update')
    if (!run) fail(404, 'RESEARCH_NOT_FOUND', 'Research run not found')
    if (run.version !== expectedVersion) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Research run changed; reload and retry')
    if (run.executionStatus !== 'DRAFT_READY') fail(409, 'RESEARCH_ARTICLE_NOT_APPROVED', 'A completed research draft is required')
    const [method] = await tx.select().from(researchMethodProfiles).where(eq(researchMethodProfiles.id, run.methodProfileId))
    const [instrument] = await tx.select().from(researchInstrumentProfiles).where(eq(researchInstrumentProfiles.id, run.instrumentProfileId))
    const [snapshot] = await tx.select().from(researchEvidenceSnapshots).where(and(eq(researchEvidenceSnapshots.runId, runId), eq(researchEvidenceSnapshots.contentHash, run.evidenceHash ?? '')))
    if (!method || !instrument || !snapshot) fail(409, 'RESEARCH_EVIDENCE_INVALID', 'Immutable research provenance is incomplete')
    const evidence = evidenceFromRows(snapshot, methodFromRow(method), instrumentFromRow(instrument))
    return { run, method, instrument, snapshot, evidence }
  }

  async createRevision(actorId: bigint, runId: bigint, input: ResearchRevisionRequest) {
    const row = await this.db.transaction(async tx => {
      const { run, evidence } = await this.reviewContext(tx, actorId, runId, input.expectedVersion)
      if (input.expectedRevision !== undefined && input.expectedRevision !== run.currentRevision) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Research revision changed; reload and retry')
      const draft = researchDraftSchema.safeParse(input.structured)
      if (!draft.success) fail(400, 'SYS_VALIDATION_ERROR', 'Revision structured content must match research-draft-v1')
      validateDraftReferences(draft.data, evidence)
      const submittedQa = prepareReviewedQa({ submitted: exactQa(input.qa), baseline: exactQa(evidence.qa), actorId, now: this.now() })
      const nextRevision = run.currentRevision + 1
      const [revision] = await tx.insert(researchRevisions).values({ runId, revision: nextRevision, parentRevision: run.currentRevision || null, titleHash: titleHash(draft.data.title), structuredJson: stableJson({ ...draft.data, qa: submittedQa }), content: input.content, bodyHash: sha256(input.content), qaStatus: submittedQa.some(gate => gate.status === 'FAIL') ? 'FAIL' : submittedQa.every(gate => gate.status === 'PASS' || gate.status === 'N_A') ? 'PASS' : 'NOT_CHECKED', reviewStatus: 'DRAFT', createdBy: actorId, createdAt: this.now() }).returning()
      if (!revision) throw new Error('Research revision was not created')
      await tx.update(researchRuns).set({ currentRevision: nextRevision, reviewStatus: 'DRAFT', version: run.version + 1, updatedAt: this.now() }).where(eq(researchRuns.id, runId))
      return revision
    })
    return revisionView(row)
  }

  async importArticleRevision(actorId: bigint, runId: bigint, input: { expectedVersion: number }) {
    const row = await this.db.transaction(async tx => {
      const { run, evidence } = await this.reviewContext(tx, actorId, runId, input.expectedVersion)
      const [link] = await tx.select().from(researchArticleLinks).where(eq(researchArticleLinks.runId, runId)).for('update')
      if (!link || run.linkedPostId !== link.postId || link.evidenceHash !== run.evidenceHash) fail(409, 'RESEARCH_ARTICLE_PROVENANCE', 'Linked article provenance is unavailable')
      const [post] = await tx.select().from(posts).where(eq(posts.id, link.postId)).for('update')
      const [parent] = await tx.select().from(researchRevisions).where(and(eq(researchRevisions.runId, runId), eq(researchRevisions.revision, run.currentRevision)))
      if (!post || post.status !== 'DRAFT' || !parent) fail(409, 'RESEARCH_ARTICLE_NOT_APPROVED', 'Only an existing unpublished linked article can be imported for review')
      const structured = jsonObject(parent.structuredJson)
      delete structured.qa
      const draft = researchDraftSchema.safeParse({ ...structured, title: post.title })
      if (!draft.success) fail(409, 'RESEARCH_OUTPUT_INVALID', 'The linked research structure is unavailable')
      const qa = exactQa(evidence.qa).map((gate, index) => index < 6 || gate.status === 'FAIL' ? gate : { ...gate, status: 'NOT_CHECKED' as const, evidence: [], reason: 'The imported article requires a new review.', reviewerId: null, reviewedAt: null })
      const [revision] = await tx.insert(researchRevisions).values({ runId, revision: run.currentRevision + 1, parentRevision: run.currentRevision, titleHash: titleHash(post.title), bodyHash: sha256(post.content), structuredJson: stableJson({ ...draft.data, qa }), content: post.content, qaStatus: 'NOT_CHECKED', reviewStatus: 'DRAFT', createdBy: actorId, createdAt: this.now() }).returning()
      if (!revision) throw new Error('Research article revision was not imported')
      await tx.update(researchRuns).set({ currentRevision: revision.revision, reviewStatus: 'DRAFT', version: run.version + 1, updatedAt: this.now() }).where(eq(researchRuns.id, runId))
      return revision
    })
    return revisionView(row)
  }

  async approve(actorId: bigint, runId: bigint, input: { expectedVersion: number; revision: number; bodyHash: string }) {
    await this.db.transaction(async tx => {
      const { run, evidence } = await this.reviewContext(tx, actorId, runId, input.expectedVersion)
      const [revision] = await tx.select().from(researchRevisions).where(and(eq(researchRevisions.runId, runId), eq(researchRevisions.revision, input.revision))).for('update')
      if (!revision || run.currentRevision !== input.revision || revision.bodyHash !== input.bodyHash || sha256(revision.content) !== input.bodyHash) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Only the exact current revision can be approved')
      const structured = jsonObject(revision.structuredJson)
      const qaProblem = researchQaApprovalIssue({ qa: structured.qa, structured, sources: evidence.sources, frozenQa: evidence.qa })
      if (qaProblem) fail(409, 'RESEARCH_QA_FAILED', qaProblem)
      if (typeof structured.title !== 'string' || revision.titleHash !== titleHash(structured.title)) fail(409, 'RESEARCH_ARTICLE_PROVENANCE', 'Revision title integrity check failed')
      const [updated] = await tx.update(researchRevisions).set({ reviewStatus: 'APPROVED', qaStatus: 'PASS', approvedBy: actorId, approvedBySnapshot: actorId, approvedAt: this.now() }).where(and(eq(researchRevisions.id, revision.id), eq(researchRevisions.reviewStatus, 'DRAFT'))).returning({ id: researchRevisions.id })
      if (!updated) fail(409, 'RESEARCH_REVISION_CONFLICT', 'Revision was already reviewed')
      await tx.update(researchRuns).set({ reviewStatus: 'APPROVED', version: run.version + 1, updatedAt: this.now() }).where(eq(researchRuns.id, runId))
    })
    return this.detail(actorId, runId)
  }

  async handoff(actorId: bigint, runId: bigint, input: ResearchHandoffRequest) {
    researchHandoffRequestSchema.parse(input)
    const result = await this.db.transaction(async tx => {
      const { run, instrument, evidence } = await this.reviewContext(tx, actorId, runId, input.expectedVersion)
      const [revision] = await tx.select().from(researchRevisions).where(and(eq(researchRevisions.runId, runId), eq(researchRevisions.revision, input.revision))).for('update')
      if (!revision || run.currentRevision !== input.revision || run.reviewStatus !== 'APPROVED' || revision.reviewStatus !== 'APPROVED' || !revision.approvedBySnapshot || !revision.approvedAt || revision.bodyHash !== input.bodyHash || sha256(revision.content) !== input.bodyHash) fail(409, 'RESEARCH_ARTICLE_NOT_APPROVED', 'Only the exact current approved revision can be handed off')
      if (evidence.quality === 'FAILED' || evidence.quality === 'STALE') fail(409, 'RESEARCH_ARTICLE_NOT_APPROVED', 'Failed or stale research cannot be handed off')
      const structured = jsonObject(revision.structuredJson)
      const title = typeof structured.title === 'string' ? structured.title : ''
      if (!title || title.length > 255 || revision.titleHash !== titleHash(title)) fail(409, 'RESEARCH_ARTICLE_PROVENANCE', 'Revision title integrity check failed')
      const qaProblem = researchQaApprovalIssue({ qa: structured.qa, structured, sources: evidence.sources, frozenQa: evidence.qa })
      if (qaProblem) fail(409, 'RESEARCH_QA_FAILED', qaProblem)
      if (!evidence.manifest.synthetic) {
        if (!sourceRecordsAreVerifiedAllowed(evidence.sources, ['publication_of_analysis_and_excerpts'])) fail(409, 'RESEARCH_ARTICLE_PROVENANCE', 'A source does not permit publication of analysis and excerpts')
        const fresh = await researchPublicationFreshnessIssue({ symbol: instrument.symbol, referenceSession: run.referenceSession ?? '', now: this.now(), latestCompletedSession: this.latestCompletedSession })
        if (fresh) fail(409, fresh.code, fresh.message)
      }
      const [link] = await tx.select().from(researchArticleLinks).where(eq(researchArticleLinks.runId, runId)).for('update')
      const timestamp = this.now()
      if (link) {
        const [post] = await tx.select().from(posts).where(eq(posts.id, link.postId)).for('update')
        if (!post || run.linkedPostId !== post.id || link.evidenceHash !== run.evidenceHash) fail(409, 'RESEARCH_ARTICLE_PROVENANCE', 'Linked article provenance is incomplete')
        if (link.revisionId === revision.id && link.bodyHash === revision.bodyHash && link.titleHash === revision.titleHash && sha256(post.content) === revision.bodyHash && titleHash(post.title) === revision.titleHash) return { postId: post.id, created: false, status: post.status, access: post.access }
        if (post.status === 'PUBLISHED') fail(409, 'RESEARCH_ARTICLE_NOT_APPROVED', 'The linked article must be drafted before replacing its approved content')
        await tx.update(posts).set({ title, content: revision.content, excerpt: null, excerptAuthored: false, status: 'DRAFT', access: 'MEMBER', publishedAt: null, updatedAt: timestamp }).where(eq(posts.id, post.id))
        await tx.update(researchArticleLinks).set({ revisionId: revision.id, titleHash: revision.titleHash, bodyHash: revision.bodyHash, evidenceHash: evidence.hash, referenceSession: run.referenceSession }).where(eq(researchArticleLinks.postId, post.id))
        await tx.update(researchRuns).set({ version: run.version + 1, updatedAt: timestamp }).where(eq(researchRuns.id, runId))
        return { postId: post.id, created: false, status: 'DRAFT' as const, access: 'MEMBER' as const }
      }
      if (run.linkedPostId !== null || run.handoffPostId !== null) fail(409, 'RESEARCH_ARTICLE_PROVENANCE', 'A detached article link cannot be recreated silently')
      // An automatically derived excerpt would expose a Member article body as a public teaser.
      const [post] = await tx.insert(posts).values({ authorId: actorId, title, slug: `research-${instrument.symbol.toLowerCase()}-${runId}`, content: revision.content, excerpt: null, excerptAuthored: false, category: input.category, tags: input.tags.join(','), status: 'DRAFT', access: 'MEMBER', publishedAt: null, createdAt: timestamp, updatedAt: timestamp }).returning()
      if (!post) throw new Error('Research handoff article was not created')
      await tx.insert(researchArticleLinks).values({ postId: post.id, runId, revisionId: revision.id, titleHash: revision.titleHash, bodyHash: revision.bodyHash, evidenceHash: evidence.hash, referenceSession: run.referenceSession, createdAt: timestamp })
      await tx.update(researchRuns).set({ linkedPostId: post.id, handoffPostId: post.id, version: run.version + 1, updatedAt: timestamp }).where(eq(researchRuns.id, runId))
      return { postId: post.id, created: true, status: post.status, access: post.access }
    })
    return { postId: String(result.postId), runId: String(runId), revision: input.revision, created: result.created, status: result.status, access: result.access }
  }

}

export async function runResearchOnce(service: ResearchStudioService) {
  return service.runOnce()
}

export function createResearchStudioService(options: ResearchServiceOptions): ResearchStudioService {
  return new ResearchStudioService(options)
}

export async function runResearchWorkerOnce(service: ResearchStudioService) {
  return service.runOnce()
}


/** Fixed-key atomic reservation; caller keeps attempt creation in this same transaction. */
export async function reserveResearchLiveDispatch(tx: Parameters<Parameters<Database['transaction']>[0]>[0], now: Date): Promise<void> {
  const [reserved] = await tx.update(researchBudgetSessions).set({ reserved: sql`${researchBudgetSessions.reserved} + 1`, updatedAt: now }).where(and(
    eq(researchBudgetSessions.budgetKey, DEFAULT_BUDGET_KEY),
    sql`${researchBudgetSessions.reserved} + ${researchBudgetSessions.consumed} + ${researchBudgetSessions.unknown} < ${researchBudgetSessions.dispatchLimit}`,
  )).returning({ id: researchBudgetSessions.id })
  if (!reserved) fail(429, 'RESEARCH_BUDGET_EXCEEDED', 'Research live-test budget has been exhausted or is unavailable')
}
