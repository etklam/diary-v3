import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  adminGuruAnalysisListResponseSchema,
  adminGuruAnalysisRequestSchema,
  adminGuruAnalysisResponseSchema,
  adminGuruAnalysisRunSchema,
  guruAnalysisProvenanceSchema,
  guruAnalysisResponseSchema,
  guruAnalysisSchema,
  serializedIdSchema,
  type ErrorCode,
} from '@diary/contracts'
import { GURU_ANALYSIS_CAVEATS, guruAnalysisCaveatKeys } from '@diary/domain/guru-analysis'
import {
  aiProviderConfigVersions,
  guruAnalysisRuns,
  guruQuarterAnalytics,
  gurus,
  institutionalEffectiveSnapshotPublications,
  institutionalFilings,
  users,
  type Database,
} from '@diary/db'
import type { AppEnv } from '../app-context.js'
import { buildGuruAnalysisInput } from './context.js'
import { GuruAnalysisError, listGuruAnalysisRuns, readPendingGuruAnalysis, readPublishedGuruAnalysis, requestGuruAnalysis } from './service.js'

type Dependencies = {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}

type RunRow = typeof guruAnalysisRuns.$inferSelect

const caveats = guruAnalysisCaveatKeys.map(id => ({ id, text: GURU_ANALYSIS_CAVEATS[id] }))

function provenance(run: RunRow, providerName: string | null) {
  return {
    runId: run.id.toString(), periodEnd: run.periodEnd, status: run.status as 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled',
    sourceState: run.sourceState as 'current' | 'invalidated', reason: run.reason as 'INITIAL' | 'REGENERATION',
    schemaVersion: run.schemaVersion, contextVersion: run.contextVersion, analyticsVersion: run.analyticsVersion,
    consensusVersion: run.consensusVersion, inputHash: run.inputHash, promptKey: run.promptKey,
    promptSource: run.promptSource as 'system-default' | 'override', promptSystemVersion: run.promptSystemVersion,
    promptOverrideVersionId: run.promptOverrideVersionId?.toString() ?? null,
    provider: providerName, model: run.model, inputTokens: run.inputTokens, outputTokens: run.outputTokens,
    latencyMs: run.latencyMs, errorCode: run.errorCode,
    queuedAt: run.queuedAt.toISOString(), generatedAt: run.status === 'succeeded' ? run.finishedAt?.toISOString() ?? null : null,
  }
}

function contextFacts(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  const facts = record?.facts
  if (!Array.isArray(facts)) return []
  return facts.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    const fact = entry as { id?: unknown; label?: unknown; value?: unknown }
    return typeof fact.id === 'string' && typeof fact.label === 'string' && typeof fact.value === 'string'
      ? [{ id: fact.id, label: fact.label, value: fact.value }]
      : []
  })
}

export function registerGuruAnalysisRoutes(app: Hono<AppEnv>, dependencies: Dependencies) {
  const { db, now, fail, validationError, parseJson } = dependencies

  async function providerNames(runs: readonly RunRow[]) {
    const ids = [...new Set(runs.flatMap(run => run.providerConfigVersionId ? [run.providerConfigVersionId] : []))]
    if (!ids.length) return new Map<string, string>()
    const rows = await db.select({ id: aiProviderConfigVersions.id, displayName: aiProviderConfigVersions.displayName })
      .from(aiProviderConfigVersions).where(inArray(aiProviderConfigVersions.id, ids))
    return new Map(rows.map(row => [row.id.toString(), row.displayName]))
  }

  const requireAdmin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [actor] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!actor) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (actor.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return actor.id
  }

  async function latestReadyPeriod(managerId: bigint) {
    const [row] = await db.select({ periodEnd: guruQuarterAnalytics.periodEnd }).from(guruQuarterAnalytics)
      .innerJoin(institutionalEffectiveSnapshotPublications, and(
        eq(institutionalEffectiveSnapshotPublications.snapshotId, guruQuarterAnalytics.snapshotId),
        eq(institutionalEffectiveSnapshotPublications.active, true),
        eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
      ))
      .where(and(eq(guruQuarterAnalytics.managerId, managerId), eq(guruQuarterAnalytics.status, 'READY')))
      .orderBy(desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.id)).limit(1)
    return row?.periodEnd ?? null
  }

  app.get('/api/gurus/:slug/analysis', async context => {
    context.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
    const [guru] = await db.select().from(gurus).where(and(eq(gurus.slug, context.req.param('slug') ?? ''), eq(gurus.active, true))).limit(1)
    if (!guru) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const requested = context.req.query('period')
    const periodEnd = requested ?? await latestReadyPeriod(guru.managerId)
    const runs = await listGuruAnalysisRuns(db, guru.managerId, 10)
    const names = await providerNames(runs)
    const nameFor = (run: RunRow) => run.providerConfigVersionId ? names.get(run.providerConfigVersionId.toString()) ?? null : null
    const [filing] = periodEnd ? await db.select().from(institutionalFilings).where(and(
      eq(institutionalFilings.managerId, guru.managerId), eq(institutionalFilings.periodEnd, periodEnd),
    )).orderBy(desc(institutionalFilings.filedAt), desc(institutionalFilings.id)).limit(1) : []

    const built = periodEnd ? await buildGuruAnalysisInput(db, { guru, periodEnd }) : null
    const published = periodEnd ? await readPublishedGuruAnalysis(db, guru.managerId, periodEnd) : undefined
    const pending = periodEnd ? await readPendingGuruAnalysis(db, guru.managerId, periodEnd) : undefined
    const failed = periodEnd ? runs.find(run => run.periodEnd === periodEnd && run.status === 'failed') : undefined
    const fresh = built?.ok ? built : null
    const stale = Boolean(published && (published.sourceState !== 'current' || !fresh || published.analyticsContextHash !== fresh.analytics.contextHash))
    const analysis = published ? guruAnalysisSchema.safeParse(published.result) : undefined
    const state = pending
      ? (pending.status === 'running' ? 'RUNNING' : 'QUEUED')
      : published
        ? (stale ? 'STALE' : 'READY')
        : !periodEnd || (built && !built.ok)
          ? 'BLOCKED_BY_COVERAGE'
          : failed ? 'FAILED' : 'NOT_GENERATED'

    const analyticsRow = fresh?.analytics
    return context.json(guruAnalysisResponseSchema.parse({
      data: {
        profile: { name: guru.name, managerName: guru.managerName, slug: guru.slug },
        periodEnd: periodEnd ?? null,
        state,
        coverage: {
          quarterStatus: (analyticsRow?.status ?? 'PENDING') as 'PENDING' | 'READY' | 'PARTIAL' | 'ERROR',
          mappingCoveragePercent: analyticsRow?.mappingCoveragePercent ?? null,
          comparisonStatus: analyticsRow?.comparisonStatus ?? null,
          consensusAvailable: Boolean(fresh?.consensusSnapshotId),
          historyQuarterCount: runs.length,
          notes: built && !built.ok ? [built.reason] : [],
        },
        facts: published ? contextFacts(published.context) : fresh?.facts ?? [],
        analysis: analysis?.success ? analysis.data : null,
        caveats,
        provenance: published ? guruAnalysisProvenanceSchema.parse(provenance(published, nameFor(published))) : null,
        history: runs.map(run => guruAnalysisProvenanceSchema.parse(provenance(run, nameFor(run)))),
        source: {
          accession: filing?.accession ?? null, periodEnd: filing?.periodEnd ?? null,
          filedAt: filing?.filedAt?.toISOString() ?? null, sourceUrl: filing?.sourceUrl ?? null,
        },
      },
    }))
  })

  const parseGuruId = (context: Context<AppEnv>) => {
    const parsed = serializedIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }

  function adminRun(run: RunRow, providerName: string | null) {
    return adminGuruAnalysisRunSchema.parse({
      ...provenance(run, providerName),
      requestedByUserId: run.requestedByUserId?.toString() ?? null,
      attemptId: run.attemptId?.toString() ?? null,
      invalidatedAt: run.invalidatedAt?.toISOString() ?? null,
      invalidationReason: run.invalidationReason,
    })
  }

  app.get('/api/admin/gurus/:id/analysis', async context => {
    await requireAdmin(context)
    const [guru] = await db.select().from(gurus).where(eq(gurus.id, parseGuruId(context))).limit(1)
    if (!guru) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const runs = await listGuruAnalysisRuns(db, guru.managerId, 50)
    const names = await providerNames(runs)
    return context.json(adminGuruAnalysisListResponseSchema.parse({
      data: runs.map(run => adminRun(run, run.providerConfigVersionId ? names.get(run.providerConfigVersionId.toString()) ?? null : null)),
    }))
  })

  app.post('/api/admin/gurus/:id/analysis', async context => {
    const actorUserId = await requireAdmin(context)
    const [guru] = await db.select().from(gurus).where(eq(gurus.id, parseGuruId(context))).limit(1)
    if (!guru) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const input = await parseJson(context, adminGuruAnalysisRequestSchema)
    try {
      const { run, reused } = await requestGuruAnalysis(db, { guru, periodEnd: input.periodEnd, mode: input.mode, actorUserId, now: now() })
      const names = await providerNames([run])
      return context.json(adminGuruAnalysisResponseSchema.parse({
        data: { run: adminRun(run, run.providerConfigVersionId ? names.get(run.providerConfigVersionId.toString()) ?? null : null), reused },
      }), reused ? 200 : 202)
    } catch (error) {
      if (error instanceof GuruAnalysisError) {
        const code: ErrorCode = error.code === 'GURU_ANALYSIS_BLOCKED'
          ? 'GURU_ANALYSIS_UNAVAILABLE'
          : error.code === 'AI_QUOTA_EXCEEDED' ? 'AI_QUOTA_EXCEEDED'
            : error.code === 'AI_REPORTS_DISABLED' ? 'AI_REPORTS_DISABLED'
              : error.code === 'AI_REPORT_ALREADY_RUNNING' ? 'AI_REPORT_ALREADY_RUNNING' : 'AI_NOT_CONFIGURED'
        return fail(error.statusCode, code, error.message)
      }
      throw error
    }
  })
}
