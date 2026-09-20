import { aiUserAccess, diaries, disciplines, transactions, type Database } from '@diary/db'
import {
  buildReportContext as buildDomainReportContext,
  canonicalizeReportPeriod,
  DEFAULT_REPORT_CONTEXT_LIMITS,
  type AiReportLocale,
  type AiReportPeriodType,
  type ReportContextBuildResult,
  type ReportContextLimits,
} from '@diary/domain/ai-reports/context'
import { and, asc, eq, gte, lt, lte } from 'drizzle-orm'
import type { BuiltReportContext } from './types.js'

export interface BuildReportContextInput {
  userId: bigint
  periodType: AiReportPeriodType
  periodStart: string
  timezone: string
  locale: AiReportLocale
  capturedAt: Date
  limits?: ReportContextLimits
}

/**
 * The transaction-safe read path. Call this after the caller has acquired the
 * owner advisory lock when generating a report. It deliberately does not open
 * another transaction, so all source rows and the data revision are read from
 * the caller's transaction boundary.
 */
export async function readReportContext(
  tx: Pick<Database, 'select'>,
  input: BuildReportContextInput,
): Promise<BuiltReportContext & ReportContextBuildResult> {
  const period = canonicalizeReportPeriod(input)
  const configuredMaxRows = input.limits?.maxRows ?? DEFAULT_REPORT_CONTEXT_LIMITS.maxRows
  const maxRows = Number.isFinite(configuredMaxRows) ? Math.max(0, Math.floor(configuredMaxRows)) : DEFAULT_REPORT_CONTEXT_LIMITS.maxRows
  // Read one sentinel row past the configured bound. The domain builder then
  // returns AI_REPORT_CONTEXT_TOO_LARGE without truncating the provider input.
  // This also bounds memory before the limit check for each source family.
  const sourceRowLimit = maxRows + 1
  const diaryRows = await tx.select().from(diaries).where(and(
    eq(diaries.userId, input.userId),
    gte(diaries.date, period.periodStart),
    lt(diaries.date, period.effectiveEndDateExclusive),
  )).orderBy(asc(diaries.date), asc(diaries.id)).limit(sourceRowLimit)
  const transactionRows = await tx.select().from(transactions).where(and(
    eq(transactions.userId, input.userId),
    lt(transactions.tradeDate, new Date(period.effectiveEndInstant)),
  )).orderBy(asc(transactions.tradeDate), asc(transactions.id)).limit(sourceRowLimit)
  const disciplineRows = await tx.select().from(disciplines).where(and(
    eq(disciplines.userId, input.userId),
    lte(disciplines.createdAt, input.capturedAt),
  )).orderBy(asc(disciplines.order), asc(disciplines.id)).limit(sourceRowLimit)
  const accessRows = await tx.select({ dataRevision: aiUserAccess.dataRevision }).from(aiUserAccess)
    .where(eq(aiUserAccess.userId, input.userId)).limit(1)

  const result = await buildDomainReportContext({
    userId: input.userId,
    periodType: input.periodType,
    periodStart: input.periodStart,
    timezone: input.timezone,
    locale: input.locale,
    capturedAt: input.capturedAt,
  }, {
    diaries: diaryRows.map(row => ({
      id: row.id.toString(), date: row.date, title: row.title, content: row.content, tags: row.tags,
      thesis: row.thesis, risk: row.risk, execution: row.execution, reviewStatus: row.reviewStatus,
      reviewedAt: row.reviewedAt, reviewOutcome: row.reviewOutcome, reviewSummary: row.reviewSummary,
      reviewLearning: row.reviewLearning, reviewAdjustment: row.reviewAdjustment,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    })),
    transactions: transactionRows.map(row => ({
      id: row.id.toString(), diaryId: row.diaryId.toString(), symbol: row.symbol, type: row.type,
      quantity: row.quantity, price: row.price, tradeDate: row.tradeDate,
      notes: row.notes, strategy: row.strategy, emotion: row.emotion,
    })),
    disciplines: disciplineRows.map(row => ({
      id: row.id.toString(), content: row.content, order: row.order, createdAt: row.createdAt,
    })),
  }, input.limits)

  return toBuiltReportContext(result, accessRows[0]?.dataRevision ?? 0)
}

/**
 * Preview-friendly standalone wrapper. Submission code should use
 * readReportContext inside its owner-locked transaction instead.
 */
export async function buildReportContext(
  db: Database,
  input: BuildReportContextInput,
): Promise<BuiltReportContext & ReportContextBuildResult> {
  return db.transaction(tx => readReportContext(tx, input), { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

function toBuiltReportContext(
  result: ReportContextBuildResult,
  dataRevision: number,
): BuiltReportContext & ReportContextBuildResult {
  return {
    period: { ...result.context.period, timezone: result.context.timezone },
    coverage: result.context.coverage,
    metrics: result.context.metrics,
    // Keep the provider context alias-only; the server-facing result carries
    // the owner-scoped IDs and hashes in the manifest for persistence.
    sources: result.sourceManifest.map(source => ({
      alias: source.alias,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      contentHash: source.contentHash,
      dependency: source.dependency,
    })),
    context: result.context,
    inputSnapshotHash: result.inputHash,
    dataRevision,
    sourceManifest: result.sourceManifest,
    hashInput: result.hashInput,
    inputHash: result.inputHash,
  }
}

export { ReportContextError, ReportContextNoDataError, ReportContextTooLargeError } from '@diary/domain/ai-reports/context'
export type {
  ReportContext,
  ReportContextBuildResult,
  ReportContextLimits,
  ReportSourceManifestEntry,
} from '@diary/domain/ai-reports/context'
