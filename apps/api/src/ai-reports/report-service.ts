import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, max, ne, sql } from 'drizzle-orm'
import {
  aiPromptVersions,
  aiProviderConfigVersions,
  aiReportSources,
  aiReportRequests,
  aiReportAttempts,
  aiReports,
  aiRuntimeState,
  transactions,
  aiUserAccess,
  aiUserConsents,
  users,
  type Database,
} from '@diary/db'
import {
  aiCapabilitiesSchema,
  aiReportCoverageSchema,
  aiReportDetailSchema,
  aiReportListResponseSchema,
  aiReportPreviewSchema,
  aiReportSummarySchema,
  type AiCapabilities,
  type AiReportDetail,
  type AiReportGenerateRequest,
  type AiReportPreview,
  type AiReportSummary,
} from '@diary/contracts/ai-reports'
import { buildReportContext, readReportContext, type ReportContextBuildResult, type ReportContextLimits } from './context.js'
import { decryptAiSecret, encryptAiSecret } from './secrets.js'
import { buildAiMessages } from './prompt-renderer.js'
import { recordUserQuotaUsage, releaseUserQuota, reserveUserQuota, readUserQuota } from './quota.js'
import { cancelAiReport, deleteAiReport, lockAiGlobal, lockAiOwner } from './job-store.js'
import { releaseGlobalAiBudget, reserveGlobalAiBudget, settleGlobalAiBudget } from './budget.js'
import type { AiMessage } from './deepseek-provider.js'
export type AiBuildContext = (db: Database, input: Parameters<typeof buildReportContext>[1]) => ReturnType<typeof buildReportContext>

export interface AiReportServiceOptions {
  db: Database
  now: () => Date
  buildContext?: AiBuildContext
  contextLimits?: ReportContextLimits
  workerFreshnessMs?: number
}

export class AiReportServiceError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message = code) {
    super(message)
    this.name = 'AiReportServiceError'
  }
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}
function bucketMonth(now: Date): string { return `${now.toISOString().slice(0, 7)}-01` }
function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}
const emptyCoverage = () => ({
  diaries: { count: 0, available: false },
  transactions: { count: 0, available: false },
  holdings: { count: 0, available: false },
  disciplines: { count: 0, available: false },
  notes: ['Report body unavailable'],
})
function instant(value: Date | null): string | null { return value ? value.toISOString() : null }

function encodeCursor(row: { createdAt: Date; id: bigint }): string {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id.toString()])).toString('base64url')
}

function decodeCursor(value: string): { createdAt: Date; id: bigint } {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== 'string' || typeof decoded[1] !== 'string') throw new Error('invalid')
    const createdAt = new Date(decoded[0])
    if (Number.isNaN(createdAt.getTime()) || !/^\d+$/.test(decoded[1])) throw new Error('invalid')
    return { createdAt, id: BigInt(decoded[1]) }
  } catch {
    throw new AiReportServiceError('SYS_VALIDATION_ERROR', 400, 'Cursor is invalid')
  }
}

function periodFromRow(row: typeof aiReports.$inferSelect) {
  return { periodType: row.reportType, periodStart: row.periodStart, periodEndExclusive: row.periodEndExclusive, isPartialPeriod: row.isPartialPeriod }
}

export function serializeReportSummary(row: typeof aiReports.$inferSelect): AiReportSummary {
  const rawCoverage = parseJson(row.coverageJson, emptyCoverage())
  const coverage = aiReportCoverageSchema.safeParse(rawCoverage).success ? rawCoverage : emptyCoverage()
  const rawMetrics = parseJson(row.metricsJson, [])
  const metrics = Array.isArray(rawMetrics) ? rawMetrics : []
  return aiReportSummarySchema.parse({
    id: row.id.toString(), period: periodFromRow(row), timezone: row.timezone, locale: row.locale, status: row.status,
    sourceState: row.sourceState, coverage, metrics, revision: row.revision,
    createdAt: row.createdAt.toISOString(), snapshotCapturedAt: row.snapshotCapturedAt.toISOString(), startedAt: instant(row.startedAt), finishedAt: instant(row.finishedAt), generatedAt: row.status === 'succeeded' ? instant(row.finishedAt) : null,
    model: row.model, providerConfigVersion: row.providerConfigVersionId ? Number(row.providerConfigVersionId) : null,
    promptVersion: row.promptVersionId ? Number(row.promptVersionId) : null, schemaVersion: row.schemaVersion, errorCode: row.errorCode,
  })
}

async function currentProvider(db: Database) {
  const [runtime] = await db.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
  if (!runtime?.activeProviderConfigId) return null
  const [provider] = await db.select().from(aiProviderConfigVersions).where(and(eq(aiProviderConfigVersions.id, runtime.activeProviderConfigId), eq(aiProviderConfigVersions.status, 'published'))).limit(1)
  return provider ?? null
}

async function currentPrompt(db: Database, reportType: 'weekly' | 'monthly') {
  const [prompt] = await db.select().from(aiPromptVersions).where(and(eq(aiPromptVersions.reportType, reportType), eq(aiPromptVersions.status, 'published'))).orderBy(desc(aiPromptVersions.id)).limit(1)
  return prompt ?? null
}

export class AiReportService {
  private readonly db: Database
  private readonly now: () => Date
  private readonly buildContext: AiBuildContext
  private readonly contextLimits?: ReportContextLimits
  private readonly workerFreshnessMs: number
  private readonly customBuildContext?: AiBuildContext

  constructor(options: AiReportServiceOptions) {
    this.db = options.db
    this.now = options.now
    this.customBuildContext = options.buildContext
    this.buildContext = options.buildContext ?? ((db, input) => buildReportContext(db, input))
    this.contextLimits = options.contextLimits
    this.workerFreshnessMs = options.workerFreshnessMs ?? 60_000
  }

  private async ownerSettings(userId: bigint, executor: Pick<Database, 'select'> = this.db) {
    const [user] = await executor.select({ timezone: users.timezone, locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new AiReportServiceError('AUTH_UNAUTHORIZED', 401, 'Authentication required')
    return user
  }

  private async contextFor(userId: bigint, request: { periodType: 'weekly' | 'monthly'; periodStart: string; locale?: 'zh-TW' | 'zh-CN' | 'en' }, executor: Pick<Database, 'select'> = this.db, capturedAt = this.now()) {
    const settings = await this.ownerSettings(userId, executor)
    const input = {
      userId, periodType: request.periodType, periodStart: request.periodStart, timezone: settings.timezone,
      locale: request.locale ?? (settings.locale as 'zh-TW' | 'zh-CN' | 'en'), capturedAt, limits: this.contextLimits,
    }
    // Submission uses the caller's READ COMMITTED transaction and owner lock.
    // Preview remains a standalone read transaction. Test callers may inject
    // a deterministic builder for either path.
    if (executor !== this.db && !this.customBuildContext) return readReportContext(executor, input)
    return this.buildContext(executor as Database, input)
  }

  private async fingerprint(input: { context: ReportContextBuildResult; providerId: bigint | null; promptId: bigint | null; recipientRevision: number; locale: string; timezone: string }) {
    return hash(stableJson({ period: input.context.context.period, timezone: input.timezone, locale: input.locale, inputHash: input.context.inputHash, providerId: input.providerId?.toString() ?? null, promptId: input.promptId?.toString() ?? null, recipientRevision: input.recipientRevision }))
  }

  async capabilities(userId: bigint): Promise<AiCapabilities> {
    const now = this.now()
    const [runtime] = await this.db.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
    const [access] = await this.db.select().from(aiUserAccess).where(eq(aiUserAccess.userId, userId)).limit(1)
    const provider = await currentProvider(this.db)
    const [consent] = await this.db.select().from(aiUserConsents).where(eq(aiUserConsents.userId, userId)).limit(1)
    const quota = access ? await readUserQuota(this.db, { userId, bucketMonth: bucketMonth(now), monthlyQuota: access.monthlyQuota }) : null
    const workerAvailable = Boolean(runtime?.workerHeartbeatAt && now.getTime() - runtime.workerHeartbeatAt.getTime() <= this.workerFreshnessMs)
    let reason: string | null = null
    if (!runtime?.generationEnabled) reason = 'AI_REPORTS_DISABLED'
    else if (!access?.enabled) reason = 'AI_ACCESS_DENIED'
    else if (!provider?.encryptedApiKey || !provider.model) reason = 'AI_NOT_CONFIGURED'
    else if (!consent?.acceptedAt || consent.revokedAt || consent.recipientRevision !== provider.recipientRevision) reason = 'AI_CONSENT_REQUIRED'
    else if (!workerAvailable) reason = 'AI_WORKER_UNAVAILABLE'
    else if ((quota?.remaining ?? 0) <= 0) reason = 'AI_QUOTA_EXCEEDED'
    return aiCapabilitiesSchema.parse({ enabled: Boolean(runtime?.generationEnabled), canGenerate: reason === null, reason, remainingQuota: quota?.remaining ?? null, monthlyQuota: access?.monthlyQuota ?? null, recipientRevision: provider?.recipientRevision ?? null, disclosureVersion: provider?.disclosureVersion ?? null, recipientName: provider?.recipientName ?? null, disclosureText: provider?.disclosureText ?? null, consentAcceptedAt: consent?.acceptedAt?.toISOString() ?? null, workerAvailable })
  }

  async consent(userId: bigint) {
    const [row] = await this.db.select().from(aiUserConsents).where(eq(aiUserConsents.userId, userId)).limit(1)
    return row ? { recipientRevision: row.recipientRevision, disclosureVersion: row.disclosureVersion, acceptedAt: instant(row.acceptedAt), revokedAt: instant(row.revokedAt) } : null
  }

  async acceptConsent(userId: bigint, input: { recipientRevision: number; disclosureVersion: string }) {
    const provider = await currentProvider(this.db)
    if (!provider || provider.recipientRevision !== input.recipientRevision || provider.disclosureVersion !== input.disclosureVersion) throw new AiReportServiceError('AI_CONSENT_REQUIRED', 409, 'The disclosure has changed')
    const now = this.now()
    const [row] = await this.db.insert(aiUserConsents).values({ userId, recipientRevision: input.recipientRevision, disclosureVersion: input.disclosureVersion, acceptedAt: now, revokedAt: null, updatedAt: now }).onConflictDoUpdate({ target: aiUserConsents.userId, set: { recipientRevision: input.recipientRevision, disclosureVersion: input.disclosureVersion, acceptedAt: now, revokedAt: null, updatedAt: now } }).returning()
    return { recipientRevision: row!.recipientRevision, disclosureVersion: row!.disclosureVersion, acceptedAt: now.toISOString(), revokedAt: null }
  }

  async revokeConsent(userId: bigint) {
    const now = this.now()
    const row = await this.db.transaction(async tx => {
      await lockAiGlobal(tx)
      await lockAiOwner(tx, userId)
      const [updated] = await tx.update(aiUserConsents).set({ revokedAt: now, updatedAt: now }).where(eq(aiUserConsents.userId, userId)).returning()
      const active = await tx.select({ id: aiReports.id, createdAt: aiReports.createdAt, dispatchedAt: aiReports.dispatchedAt, reservationBucketMonth: aiReports.reservationBucketMonth, reservationCostCents: aiReports.reservationCostCents })
        .from(aiReports).where(and(eq(aiReports.userId, userId), sql`${aiReports.status} in ('queued','running')`, isNull(aiReports.deletedAt))).for('update')
      for (const report of active) {
        await tx.update(aiReports).set({ status: 'cancelled', errorCode: 'AI_CONSENT_REQUIRED', finishedAt: now, leaseToken: null, workerId: null, leaseExpiresAt: null, heartbeatAt: null, updatedAt: now }).where(eq(aiReports.id, report.id))
        if (report.dispatchedAt === null) {
          await releaseUserQuota(tx, { userId, bucketMonth: `${report.createdAt.toISOString().slice(0, 7)}-01`, reservationCostCents: 0 })
          if (report.reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: report.reservationBucketMonth, reservationCostCents: report.reservationCostCents })
        }
        else {
          const [attempt] = await tx.update(aiReportAttempts).set({ status: 'cancelled', errorCode: 'AI_CONSENT_REQUIRED', finishedAt: now }).where(and(eq(aiReportAttempts.reportId, report.id), eq(aiReportAttempts.status, 'dispatched'))).returning({ id: aiReportAttempts.id })
          if (attempt) {
            if (report.reservationCostCents > 0) await settleGlobalAiBudget(tx, { month: report.reservationBucketMonth, reservationCostCents: report.reservationCostCents, actualCostCents: null, inputTokens: null, outputTokens: null })
            await recordUserQuotaUsage(tx, { userId, bucketMonth: `${report.createdAt.toISOString().slice(0, 7)}-01`, reservationCostCents: 0 }, { unknown: true })
          }
        }
      }
      return updated ?? null
    })
    return row ? { recipientRevision: row.recipientRevision, disclosureVersion: row.disclosureVersion, acceptedAt: instant(row.acceptedAt), revokedAt: instant(row.revokedAt) } : null
  }

  async preview(userId: bigint, request: { periodType: 'weekly' | 'monthly'; periodStart: string; locale?: 'zh-TW' | 'zh-CN' | 'en' }): Promise<AiReportPreview> {
    const previewNow = this.now()
    const [access] = await this.db.select({ enabled: aiUserAccess.enabled }).from(aiUserAccess).where(eq(aiUserAccess.userId, userId)).limit(1)
    if (!access?.enabled) throw new AiReportServiceError('AI_ACCESS_DENIED', 403)
    const [runtime] = await this.db.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).limit(1)
    const provider = await currentProvider(this.db)
    const prompt = await currentPrompt(this.db, request.periodType)
    const [consent] = await this.db.select().from(aiUserConsents).where(eq(aiUserConsents.userId, userId)).limit(1)
    const workerAvailable = Boolean(runtime?.workerHeartbeatAt && previewNow.getTime() - runtime.workerHeartbeatAt.getTime() <= this.workerFreshnessMs)
    const quota = await readUserQuota(this.db, { userId, bucketMonth: bucketMonth(previewNow), monthlyQuota: (await this.db.select({ monthlyQuota: aiUserAccess.monthlyQuota }).from(aiUserAccess).where(eq(aiUserAccess.userId, userId)).limit(1))[0]?.monthlyQuota ?? 0 })
    const context = await this.contextFor(userId, request, this.db, previewNow)
    const locale = context.context.locale
    const timezone = context.context.timezone
    const previewFingerprint = await this.fingerprint({ context, providerId: provider?.id ?? null, promptId: prompt?.id ?? null, recipientRevision: provider?.recipientRevision ?? 0, locale, timezone })
    const canGenerate = Boolean(runtime?.generationEnabled && provider?.encryptedApiKey && prompt && workerAvailable && consent?.acceptedAt && !consent.revokedAt && consent.recipientRevision === provider.recipientRevision && quota.remaining > 0)
    return aiReportPreviewSchema.parse({ period: context.context.period, timezone, locale, coverage: context.context.coverage, metrics: context.context.metrics, previewFingerprint, recipientRevision: provider?.recipientRevision ?? 1, providerConfigVersion: provider?.id ? Number(provider.id) : null, promptVersion: prompt?.id ? Number(prompt.id) : null, canGenerate })
  }

  async generate(userId: bigint, idempotencyKey: string, request: AiReportGenerateRequest) {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new AiReportServiceError('SYS_VALIDATION_ERROR', 400, 'Idempotency-Key is invalid')
    const idempotencyHash = hash(idempotencyKey)
    const normalizedRequestHash = hash(stableJson(request))
    const now = this.now()
    const result = await this.db.transaction(async tx => {
      await lockAiGlobal(tx)
      await lockAiOwner(tx, userId)
      const [access] = await tx.select().from(aiUserAccess).where(eq(aiUserAccess.userId, userId)).for('update')
      if (!access?.enabled) throw new AiReportServiceError('AI_ACCESS_DENIED', 403)
      const [requestAlias] = await tx.select().from(aiReportRequests).where(and(eq(aiReportRequests.userId, userId), eq(aiReportRequests.idempotencyKeyHash, idempotencyHash))).limit(1).for('update')
      if (requestAlias) {
        if (requestAlias.normalizedRequestHash !== normalizedRequestHash) throw new AiReportServiceError('AI_IDEMPOTENCY_CONFLICT', 409)
        if (requestAlias.tombstoneUntil && requestAlias.tombstoneUntil <= now) {
          await tx.delete(aiReportRequests).where(eq(aiReportRequests.id, requestAlias.id))
        } else if (requestAlias.reportId) {
          const [mapped] = await tx.select().from(aiReports).where(and(eq(aiReports.id, requestAlias.reportId), eq(aiReports.userId, userId))).limit(1)
          if (mapped && !mapped.deletedAt) return { row: mapped, reused: true }
          throw new AiReportServiceError('SYS_NOT_FOUND', 404)
        } else {
          throw new AiReportServiceError('SYS_NOT_FOUND', 404)
        }
      }
      const [existing] = await tx.select().from(aiReports).where(and(eq(aiReports.userId, userId), eq(aiReports.idempotencyKeyHash, idempotencyHash))).limit(1)
      if (existing) {
        if (existing.normalizedRequestHash !== normalizedRequestHash) throw new AiReportServiceError('AI_IDEMPOTENCY_CONFLICT', 409)
        if (existing.deletedAt) throw new AiReportServiceError('SYS_NOT_FOUND', 404)
        await tx.insert(aiReportRequests).values({ userId, idempotencyKeyHash: idempotencyHash, normalizedRequestHash, reportId: existing.id, createdAt: now, updatedAt: now }).onConflictDoNothing()
        return { row: existing, reused: true }
      }
      const [runtime] = await tx.select().from(aiRuntimeState).where(eq(aiRuntimeState.singleton, 'default')).for('update')
      if (!runtime?.generationEnabled) throw new AiReportServiceError('AI_REPORTS_DISABLED', 503)
      if (!runtime.workerHeartbeatAt || now.getTime() - runtime.workerHeartbeatAt.getTime() > this.workerFreshnessMs) throw new AiReportServiceError('AI_WORKER_UNAVAILABLE', 503)
      const [provider] = runtime.activeProviderConfigId
        ? await tx.select().from(aiProviderConfigVersions).where(and(eq(aiProviderConfigVersions.id, runtime.activeProviderConfigId), eq(aiProviderConfigVersions.status, 'published'))).limit(1)
        : []
      const [prompt] = await tx.select().from(aiPromptVersions).where(and(eq(aiPromptVersions.reportType, request.periodType), eq(aiPromptVersions.status, 'published'))).orderBy(desc(aiPromptVersions.id)).limit(1)
      if (!provider?.encryptedApiKey || !prompt) throw new AiReportServiceError('AI_NOT_CONFIGURED', 503)
      const [consent] = await tx.select().from(aiUserConsents).where(eq(aiUserConsents.userId, userId)).for('update')
      if (!consent?.acceptedAt || consent.revokedAt || consent.recipientRevision !== provider.recipientRevision) throw new AiReportServiceError('AI_CONSENT_REQUIRED', 403)
      const [active] = await tx.select({ id: aiReports.id }).from(aiReports).where(and(eq(aiReports.userId, userId), sql`${aiReports.status} in ('queued','running')`, isNull(aiReports.deletedAt))).limit(1).for('update')
      if (active) throw new AiReportServiceError('AI_REPORT_ALREADY_RUNNING', 409)
      if (request.regenerateFromReportId) {
        const [previous] = await tx.select({ id: aiReports.id, createdAt: aiReports.createdAt, reportType: aiReports.reportType, periodStart: aiReports.periodStart }).from(aiReports).where(and(eq(aiReports.id, BigInt(request.regenerateFromReportId)), eq(aiReports.userId, userId), isNull(aiReports.deletedAt))).limit(1)
        if (!previous) throw new AiReportServiceError('SYS_NOT_FOUND', 404)
        if (previous.reportType !== request.periodType || previous.periodStart !== request.periodStart) {
          throw new AiReportServiceError('AI_CONFIG_CHANGED', 409, 'Regeneration must keep the original report period')
        }
        if (now.getTime() - previous.createdAt.getTime() < 60_000) throw new AiReportServiceError('AI_REPORT_ALREADY_RUNNING', 429, 'Please wait before regenerating this report')
      }
      // Context is read only after the owner lock and idempotency lookup. A
      // source writer participates in the same lock through the DB trigger.
      const context = await this.contextFor(userId, request, tx, now)
      const fingerprint = await this.fingerprint({ context, providerId: provider.id, promptId: prompt.id, recipientRevision: provider.recipientRevision, locale: context.context.locale, timezone: context.context.timezone })
      if (fingerprint !== request.previewFingerprint) throw new AiReportServiceError('AI_PREVIEW_CHANGED', 409)
      if (request.confirmedRecipientRevision !== provider.recipientRevision) throw new AiReportServiceError('AI_CONFIG_CHANGED', 409)
      const admissionMessages = buildAiMessages({ template: prompt.template, locale: context.context.locale, periodLabel: `${context.context.period.periodStart} to ${context.context.period.periodEndExclusive}`, periodStart: context.context.period.periodStart, periodEnd: context.context.period.periodEndExclusive, context: context.context })
      if (Buffer.byteLength(JSON.stringify(admissionMessages), 'utf8') > provider.maxInputTokens) throw new AiReportServiceError('AI_REPORT_CONTEXT_TOO_LARGE', 413)
      const snapshot = encryptAiSecret(JSON.stringify(context.context), 'report-context')
      if (!request.regenerateFromReportId) {
        const [same] = await tx.select().from(aiReports).where(and(eq(aiReports.userId, userId), eq(aiReports.reportType, request.periodType), eq(aiReports.periodStart, context.context.period.periodStart), eq(aiReports.timezone, context.context.timezone), eq(aiReports.locale, context.context.locale), eq(aiReports.inputSnapshotHash, context.inputHash), eq(aiReports.providerConfigVersionId, provider.id), eq(aiReports.promptVersionId, prompt.id), eq(aiReports.schemaVersion, 'ai-analysis-v1'), eq(aiReports.status, 'succeeded'), eq(aiReports.sourceState, 'current'), isNull(aiReports.deletedAt))).orderBy(desc(aiReports.revision)).limit(1)
        if (same) {
          await tx.insert(aiReportRequests).values({ userId, idempotencyKeyHash: idempotencyHash, normalizedRequestHash, reportId: same.id, createdAt: now, updatedAt: now }).onConflictDoNothing()
          return { row: same, reused: true }
        }
      }
      const [latest] = await tx.select({ revision: max(aiReports.revision) }).from(aiReports).where(and(eq(aiReports.userId, userId), eq(aiReports.reportType, request.periodType), eq(aiReports.periodStart, context.context.period.periodStart), eq(aiReports.timezone, context.context.timezone), eq(aiReports.locale, context.context.locale)))
      const reservationCostCents = provider.reservationCostCents
      if (reservationCostCents > 0 && !await reserveGlobalAiBudget(tx, { month: bucketMonth(now), reservationCostCents, monthlyBudgetCents: provider.monthlyBudgetCents })) throw new AiReportServiceError('AI_QUOTA_EXCEEDED', 429)
      const reservation = await reserveUserQuota(tx, { userId, bucketMonth: bucketMonth(now), monthlyQuota: access.monthlyQuota })
      if (!reservation) {
        if (reservationCostCents > 0) await releaseGlobalAiBudget(tx, { month: bucketMonth(now), reservationCostCents })
        throw new AiReportServiceError('AI_QUOTA_EXCEEDED', 429)
      }
      const [row] = await tx.insert(aiReports).values({
        userId, reportType: request.periodType, periodStart: context.context.period.periodStart, periodEndExclusive: context.context.period.periodEndExclusive, timezone: context.context.timezone, locale: context.context.locale,
        revision: Number(latest?.revision ?? 0) + 1, status: 'queued', sourceState: 'current', isPartialPeriod: context.context.period.isPartialPeriod, inputSnapshotEncrypted: snapshot,
        inputSnapshotHash: context.inputHash, coverageJson: JSON.stringify(context.context.coverage), metricsJson: JSON.stringify(context.context.metrics), model: provider.model,
        providerConfigVersionId: provider.id, promptVersionId: prompt.id, recipientRevision: provider.recipientRevision, capturedDataRevision: access.dataRevision, reservationBucketMonth: bucketMonth(now), reservationCostCents,
        idempotencyKeyHash: idempotencyHash, normalizedRequestHash, regeneratedFromReportId: request.regenerateFromReportId ? BigInt(request.regenerateFromReportId) : null, queuedAt: now, snapshotCapturedAt: now, createdAt: now, updatedAt: now,
      }).returning()
      await tx.insert(aiReportRequests).values({ userId, idempotencyKeyHash: idempotencyHash, normalizedRequestHash, reportId: row!.id, createdAt: now, updatedAt: now })
      await tx.insert(aiReportSources).values(context.sourceManifest.map(source => ({ reportId: row!.id, userId, alias: source.alias, sourceType: source.sourceType, sourceId: source.sourceId, contentHash: source.contentHash, dependency: source.dependency })))
      return { row: row!, reused: false }
    })
    return { data: serializeReportSummary(result.row), reused: result.reused }
  }

  async list(userId: bigint, input: { limit: number; cursor?: string; periodType?: 'weekly' | 'monthly' }) {
    const [access] = await this.db.select({ enabled: aiUserAccess.enabled }).from(aiUserAccess).where(eq(aiUserAccess.userId, userId)).limit(1)
    if (!access?.enabled) throw new AiReportServiceError('AI_ACCESS_DENIED', 403)
    const cursor = input.cursor ? decodeCursor(input.cursor) : null
    const where = and(eq(aiReports.userId, userId), isNull(aiReports.deletedAt), ne(aiReports.sourceState, 'invalidated'), input.periodType ? eq(aiReports.reportType, input.periodType) : undefined, cursor ? sql`(${aiReports.createdAt}, ${aiReports.id}) < (${cursor.createdAt.toISOString()}, ${cursor.id})` : undefined)
    const rows = await this.db.select().from(aiReports).where(where).orderBy(desc(aiReports.createdAt), desc(aiReports.id)).limit(input.limit + 1)
    const page = rows.slice(0, input.limit)
    const nextCursor = rows.length > input.limit && page.at(-1) ? encodeCursor(page.at(-1)!) : null
    return aiReportListResponseSchema.parse({ data: page.map(serializeReportSummary), nextCursor })
  }

  async detail(userId: bigint, reportId: bigint): Promise<AiReportDetail> {
    const [access] = await this.db.select({ enabled: aiUserAccess.enabled }).from(aiUserAccess).where(eq(aiUserAccess.userId, userId)).limit(1)
    if (!access?.enabled) throw new AiReportServiceError('AI_ACCESS_DENIED', 403)
    const [row] = await this.db.select().from(aiReports).where(and(eq(aiReports.id, reportId), eq(aiReports.userId, userId), isNull(aiReports.deletedAt))).limit(1)
    if (!row || row.sourceState === 'invalidated') throw new AiReportServiceError('SYS_NOT_FOUND', 404)
    const { aiReportSources } = await import('@diary/db')
    const sources = await this.db.select().from(aiReportSources).where(and(eq(aiReportSources.reportId, row.id), eq(aiReportSources.userId, userId))).orderBy(asc(aiReportSources.id))
    const transactionIds = sources.filter(source => source.sourceType === 'transaction' && /^\d+$/.test(source.sourceId)).map(source => BigInt(source.sourceId))
    const transactionRows = transactionIds.length === 0 ? [] : await this.db.select({ id: transactions.id, diaryId: transactions.diaryId }).from(transactions).where(and(eq(transactions.userId, userId), inArray(transactions.id, transactionIds)))
    const diaryByTransaction = new Map(transactionRows.map(transaction => [transaction.id.toString(), transaction.diaryId.toString()]))
    return aiReportDetailSchema.parse({ ...serializeReportSummary(row), analysis: parseJson(row.analysisJson, null), sources: sources.map(source => ({ alias: source.alias, sourceType: source.sourceType, sourceId: source.sourceId, contentHash: source.contentHash, dependency: source.dependency, href: source.sourceType === 'diary' ? `/api/diaries/${source.sourceId}` : source.sourceType === 'transaction' ? (diaryByTransaction.has(source.sourceId) ? `/api/diaries/${diaryByTransaction.get(source.sourceId)!}` : null) : null })), regeneratedFromReportId: row.regeneratedFromReportId?.toString() ?? null })
  }

  async cancel(userId: bigint, reportId: bigint) {
    const row = await cancelAiReport(this.db, { reportId, userId, now: this.now() })
    if (!row) throw new AiReportServiceError('SYS_NOT_FOUND', 404)
    return { id: row.id.toString(), status: row.status }
  }

  async delete(userId: bigint, reportId: bigint) {
    const now = this.now()
    const row = await deleteAiReport(this.db, { reportId, userId, now })
    if (!row) throw new AiReportServiceError('SYS_NOT_FOUND', 404)
    const tombstoneUntil = new Date(now.getTime() + 86_400_000)
    await this.db.update(aiReportRequests).set({ tombstoneUntil, updatedAt: now }).where(and(eq(aiReportRequests.userId, userId), eq(aiReportRequests.reportId, reportId), isNull(aiReportRequests.tombstoneUntil)))
    return { ok: true as const }
  }

  /** Worker-only helper: decrypts the captured context and returns immutable provider inputs. */
  async dispatchInput(row: typeof aiReports.$inferSelect): Promise<{ config: typeof aiProviderConfigVersions.$inferSelect; messages: AiMessage[]; validationContext: { sources: Array<{ alias: string; sourceType: string }>; metrics: Array<{ id: string }> } }> {
    if (!row.inputSnapshotEncrypted || !row.providerConfigVersionId || !row.promptVersionId) throw new AiReportServiceError('AI_OUTPUT_INVALID', 500)
    const [config] = await this.db.select().from(aiProviderConfigVersions).where(eq(aiProviderConfigVersions.id, row.providerConfigVersionId)).limit(1)
    const [prompt] = await this.db.select().from(aiPromptVersions).where(eq(aiPromptVersions.id, row.promptVersionId)).limit(1)
    if (!config || !prompt || !config.encryptedApiKey) throw new AiReportServiceError('AI_NOT_CONFIGURED', 503)
    const context = parseJson(decryptAiSecret(row.inputSnapshotEncrypted, 'report-context'), {})
    const messages = buildAiMessages({ template: prompt.template, locale: row.locale, periodLabel: `${row.periodStart} to ${row.periodEndExclusive}`, periodStart: row.periodStart, periodEnd: row.periodEndExclusive, context })
    const sourceValues: unknown[] = context && typeof context === 'object' && Array.isArray((context as { sources?: unknown }).sources) ? (context as { sources: unknown[] }).sources : []
    const metricValues: unknown[] = context && typeof context === 'object' && Array.isArray((context as { metrics?: unknown }).metrics) ? (context as { metrics: unknown[] }).metrics : []
    const sources = sourceValues.flatMap(value => {
      if (!value || typeof value !== 'object') return []
      const candidate = value as { alias?: unknown; sourceType?: unknown }
      return typeof candidate.alias === 'string' && typeof candidate.sourceType === 'string' ? [{ alias: candidate.alias, sourceType: candidate.sourceType }] : []
    })
    const metrics = metricValues.flatMap(value => {
      if (!value || typeof value !== 'object') return []
      const candidate = value as { id?: unknown }
      return typeof candidate.id === 'string' ? [{ id: candidate.id }] : []
    })
    return { config, messages, validationContext: { sources, metrics } }
  }
}
