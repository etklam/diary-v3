import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import {
  adminInstitutionalDiagnosticsResponseSchema,
  adminInstitutionalFilingDetailResponseSchema,
  adminInstitutionalFilingListQuerySchema,
  adminInstitutionalFilingListResponseSchema,
  adminInstitutionalJobResponseSchema,
  adminInstitutionalOverviewResponseSchema,
  adminInstitutionalRebuildRequestSchema,
  serializedIdSchema,
  type ErrorCode,
} from '@diary/contracts'
import {
  guruAnalysisRuns,
  guruAnalyticsEventDeliveries,
  guruConsensusRebuildRequests,
  guruQuarterAnalytics,
  gurus,
  institutional13fHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshotRebuildRequests,
  institutionalEffectiveSnapshotSources,
  institutionalEffectiveSnapshots,
  institutionalFilingArtifacts,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalHoldingSecurityMappings,
  institutionalManagerDiscovery,
  institutionalManagers,
  institutionalSecurityMappingRefreshJobs,
  institutionalSnapshotChangeEvents,
  secRequestSchedulerState,
  users,
  type Database,
} from '@diary/db'
import { GURU_CONSENSUS_VERSION } from '@diary/domain/guru-consensus'
import { GURU_PORTFOLIO_ANALYTICS_VERSION } from '@diary/domain/guru-portfolio-analytics'
import { GURU_ANALYSIS_CONTEXT_VERSION, GURU_ANALYSIS_SCHEMA_VERSION } from '@diary/domain/guru-analysis'
import type { AppEnv } from '../app-context.js'
import { INSTITUTIONAL_13F_PARSER_VERSION } from './13f-parser.js'
import { EFFECTIVE_SNAPSHOT_RESOLVER_VERSION } from './effective-snapshots.js'
import { SECURITY_MAPPING_ALGORITHM_VERSION } from './security-mapping.js'

type Dependencies = {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}

const PARSED_ROW_SAMPLE = 50
const REPROCESSABLE = ['PARSED', 'PARTIAL', 'READY', 'ERROR'] as const

/** Code-owned versions that any diagnostics export and overview must report. */
const processingVersions = {
  parser: INSTITUTIONAL_13F_PARSER_VERSION,
  resolver: EFFECTIVE_SNAPSHOT_RESOLVER_VERSION,
  securityMapping: SECURITY_MAPPING_ALGORITHM_VERSION,
  analytics: GURU_PORTFOLIO_ANALYTICS_VERSION,
  consensus: GURU_CONSENSUS_VERSION,
  analysisContext: GURU_ANALYSIS_CONTEXT_VERSION,
  analysisSchema: GURU_ANALYSIS_SCHEMA_VERSION,
}

const instant = (value: Date | null | undefined) => value ? value.toISOString() : null

function discoveryState(value: string | undefined) {
  return value === 'PENDING' || value === 'RUNNING' || value === 'READY' || value === 'STALE' || value === 'ERROR' ? value : null
}

export function registerAdminInstitutionalOperationRoutes(app: Hono<AppEnv>, dependencies: Dependencies) {
  const { db, now, fail, validationError, parseJson } = dependencies

  const requireAdmin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [actor] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!actor) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (actor.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return actor.id
  }

  const parseId = (context: Context<AppEnv>, name = 'id') => {
    const parsed = serializedIdSchema.safeParse(context.req.param(name))
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }

  async function queueDepths() {
    const [filings] = await db.select({
      pending: sql<number>`count(*) filter (where ${institutionalFilings.status} in ('PENDING', 'DOWNLOADED', 'PARSED'))::int`,
      partial: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'PARTIAL')::int`,
      error: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'ERROR')::int`,
    }).from(institutionalFilings)
    const [snapshots] = await db.select({ pending: sql<number>`count(*)::int` }).from(institutionalEffectiveSnapshotRebuildRequests)
      .where(sql`${institutionalEffectiveSnapshotRebuildRequests.processedRevision} < ${institutionalEffectiveSnapshotRebuildRequests.requestedRevision}`)
    const [analyticsEvents] = await db.select({
      pending: sql<number>`count(*) filter (where ${guruAnalyticsEventDeliveries.eventId} is null or ${guruAnalyticsEventDeliveries.processedAt} is null)::int`,
      failed: sql<number>`count(*) filter (where ${guruAnalyticsEventDeliveries.processedAt} is null and ${guruAnalyticsEventDeliveries.lastError} is not null)::int`,
    }).from(institutionalSnapshotChangeEvents)
      .leftJoin(guruAnalyticsEventDeliveries, eq(guruAnalyticsEventDeliveries.eventId, institutionalSnapshotChangeEvents.id))
    const [consensus] = await db.select({ pending: sql<number>`count(*)::int` }).from(guruConsensusRebuildRequests)
      .where(sql`${guruConsensusRebuildRequests.processedRevision} < ${guruConsensusRebuildRequests.requestedRevision}`)
    const [mappingJobs] = await db.select({ pending: sql<number>`count(*)::int` }).from(institutionalSecurityMappingRefreshJobs)
      .where(inArray(institutionalSecurityMappingRefreshJobs.status, ['PENDING', 'RUNNING']))
    const [mappings] = await db.select({
      unresolved: sql<number>`count(*) filter (where ${institutionalHoldingSecurityMappings.status} = 'UNRESOLVED')::int`,
      ambiguous: sql<number>`count(*) filter (where ${institutionalHoldingSecurityMappings.status} = 'AMBIGUOUS')::int`,
    }).from(institutionalHoldingSecurityMappings)
    const [quarters] = await db.select({
      partial: sql<number>`count(*) filter (where ${institutionalEffectivePeriodStates.status} = 'PARTIAL')::int`,
      error: sql<number>`count(*) filter (where ${institutionalEffectivePeriodStates.status} = 'ERROR')::int`,
    }).from(institutionalEffectivePeriodStates)
    const [analysis] = await db.select({
      queued: sql<number>`count(*) filter (where ${guruAnalysisRuns.status} = 'queued')::int`,
      running: sql<number>`count(*) filter (where ${guruAnalysisRuns.status} = 'running')::int`,
      failed: sql<number>`count(*) filter (where ${guruAnalysisRuns.status} = 'failed')::int`,
      invalidated: sql<number>`count(*) filter (where ${guruAnalysisRuns.sourceState} = 'invalidated')::int`,
    }).from(guruAnalysisRuns)
    return {
      filingsPending: Number(filings?.pending ?? 0),
      filingsPartial: Number(filings?.partial ?? 0),
      filingsError: Number(filings?.error ?? 0),
      snapshotRebuildsPending: Number(snapshots?.pending ?? 0),
      analyticsEventsPending: Number(analyticsEvents?.pending ?? 0),
      analyticsEventsFailed: Number(analyticsEvents?.failed ?? 0),
      consensusRebuildsPending: Number(consensus?.pending ?? 0),
      mappingRefreshJobsPending: Number(mappingJobs?.pending ?? 0),
      unresolvedMappings: Number(mappings?.unresolved ?? 0),
      ambiguousMappings: Number(mappings?.ambiguous ?? 0),
      partialQuarters: Number(quarters?.partial ?? 0),
      errorQuarters: Number(quarters?.error ?? 0),
      analysisQueued: Number(analysis?.queued ?? 0),
      analysisRunning: Number(analysis?.running ?? 0),
      analysisFailed: Number(analysis?.failed ?? 0),
      analysisInvalidated: Number(analysis?.invalidated ?? 0),
    }
  }

  async function schedulerState() {
    const [row] = await db.select().from(secRequestSchedulerState).where(eq(secRequestSchedulerState.singleton, 1)).limit(1)
    return {
      nextAllowedAt: instant(row?.nextAllowedAt),
      lastRequestAt: instant(row?.lastRequestAt),
      requestCount: (row?.requestCount ?? 0n).toString(),
      failureCount: (row?.failureCount ?? 0n).toString(),
    }
  }

  async function managerRows(timestamp: Date) {
    const managers = await db.select({ manager: institutionalManagers, guru: gurus })
      .from(institutionalManagers).leftJoin(gurus, eq(gurus.managerId, institutionalManagers.id))
      .orderBy(asc(institutionalManagers.cik))
    const ids = managers.map(row => row.manager.id)
    if (!ids.length) return []
    const [discovery, filingCounts, latestFilings, periodStates, analytics, analysisCounts] = await Promise.all([
      db.select().from(institutionalManagerDiscovery).where(inArray(institutionalManagerDiscovery.managerId, ids)),
      db.select({
        managerId: institutionalFilings.managerId,
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'PENDING')::int`,
        downloaded: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'DOWNLOADED')::int`,
        parsed: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'PARSED')::int`,
        partial: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'PARTIAL')::int`,
        ready: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'READY')::int`,
        error: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'ERROR')::int`,
        superseded: sql<number>`count(*) filter (where ${institutionalFilings.status} = 'SUPERSEDED')::int`,
      }).from(institutionalFilings).where(inArray(institutionalFilings.managerId, ids)).groupBy(institutionalFilings.managerId),
      db.selectDistinctOn([institutionalFilings.managerId]).from(institutionalFilings)
        .where(inArray(institutionalFilings.managerId, ids))
        .orderBy(institutionalFilings.managerId, desc(institutionalFilings.filingDate), desc(institutionalFilings.id)),
      db.select().from(institutionalEffectivePeriodStates).where(inArray(institutionalEffectivePeriodStates.managerId, ids)),
      db.selectDistinctOn([guruQuarterAnalytics.managerId]).from(guruQuarterAnalytics)
        .where(inArray(guruQuarterAnalytics.managerId, ids))
        .orderBy(guruQuarterAnalytics.managerId, desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.id)),
      db.select({
        managerId: guruAnalysisRuns.managerId,
        queued: sql<number>`count(*) filter (where ${guruAnalysisRuns.status} = 'queued')::int`,
        running: sql<number>`count(*) filter (where ${guruAnalysisRuns.status} = 'running')::int`,
        succeeded: sql<number>`count(*) filter (where ${guruAnalysisRuns.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${guruAnalysisRuns.status} = 'failed')::int`,
        invalidated: sql<number>`count(*) filter (where ${guruAnalysisRuns.sourceState} = 'invalidated')::int`,
      }).from(guruAnalysisRuns).where(inArray(guruAnalysisRuns.managerId, ids)).groupBy(guruAnalysisRuns.managerId),
    ])
    const discoveryByManager = new Map(discovery.map(row => [row.managerId.toString(), row]))
    const countsByManager = new Map(filingCounts.map(row => [row.managerId.toString(), row]))
    const latestByManager = new Map(latestFilings.map(row => [row.managerId.toString(), row]))
    const analyticsByManager = new Map(analytics.map(row => [row.managerId.toString(), row]))
    const analysisByManager = new Map(analysisCounts.map(row => [row.managerId.toString(), row]))
    return managers.map(({ manager, guru }) => {
      const key = manager.id.toString()
      const job = discoveryByManager.get(key)
      const counts = countsByManager.get(key)
      const latest = latestByManager.get(key)
      const states = periodStates.filter(row => row.managerId === manager.id)
      const analyticsRow = analyticsByManager.get(key)
      const runs = analysisByManager.get(key)
      return {
        guruId: guru?.id.toString() ?? null,
        managerId: key,
        slug: guru?.slug ?? null,
        name: guru?.name ?? null,
        managerName: guru?.managerName ?? null,
        cik: manager.cik,
        active: guru?.active ?? false,
        discovery: {
          status: discoveryState(job?.status),
          lastCheckAt: instant(job?.lastCheckAt),
          lastSuccessAt: instant(job?.lastSuccessAt),
          nextCheckAt: instant(job?.nextCheckAt),
          lastErrorCode: job?.lastErrorCode ?? null,
          leaseHeld: Boolean(job?.leaseExpiresAt && job.leaseExpiresAt > timestamp),
        },
        filings: {
          total: Number(counts?.total ?? 0), pending: Number(counts?.pending ?? 0), downloaded: Number(counts?.downloaded ?? 0),
          parsed: Number(counts?.parsed ?? 0), partial: Number(counts?.partial ?? 0), ready: Number(counts?.ready ?? 0),
          error: Number(counts?.error ?? 0), superseded: Number(counts?.superseded ?? 0),
        },
        latestFiling: latest ? {
          id: latest.id.toString(), accession: latest.accession, form: latest.form, periodEnd: latest.periodEnd,
          filedAt: instant(latest.filedAt), status: latest.status, errorCode: latest.errorCode,
        } : null,
        quarters: {
          ready: states.filter(row => row.status === 'READY').length,
          partial: states.filter(row => row.status === 'PARTIAL').length,
          error: states.filter(row => row.status === 'ERROR').length,
        },
        mappingCoveragePercent: analyticsRow?.mappingCoveragePercent ?? null,
        analysis: {
          queued: Number(runs?.queued ?? 0), running: Number(runs?.running ?? 0), succeeded: Number(runs?.succeeded ?? 0),
          failed: Number(runs?.failed ?? 0), invalidated: Number(runs?.invalidated ?? 0),
        },
      }
    })
  }

  app.get('/api/admin/institutional/overview', async context => {
    await requireAdmin(context)
    const timestamp = now()
    return context.json(adminInstitutionalOverviewResponseSchema.parse({
      data: { scheduler: await schedulerState(), queues: await queueDepths(), versions: processingVersions, managers: await managerRows(timestamp) },
    }))
  })

  function filingRow(filing: typeof institutionalFilings.$inferSelect, manager: { cik: string }, guru: typeof gurus.$inferSelect | null) {
    return {
      id: filing.id.toString(), managerId: filing.managerId.toString(),
      guruId: guru?.id.toString() ?? null, guruSlug: guru?.slug ?? null, guruName: guru?.name ?? null, cik: manager.cik,
      accession: filing.accession, form: filing.form, filingDate: filing.filingDate, filedAt: instant(filing.filedAt),
      periodEnd: filing.periodEnd, status: filing.status, isAmendment: filing.isAmendment,
      amendmentNumber: filing.amendmentNumber, amendmentType: filing.amendmentType, parserVersion: filing.parserVersion,
      parsedRowCount: filing.parsedRowCount, rejectedRowCount: filing.rejectedRowCount, mappingCoverage: filing.mappingCoverage,
      errorCode: filing.errorCode, sourceUrl: filing.sourceUrl, discoveredAt: instant(filing.discoveredAt)!,
      ingestedAt: instant(filing.ingestedAt), updatedAt: instant(filing.updatedAt)!,
    }
  }

  app.get('/api/admin/institutional/filings', async context => {
    await requireAdmin(context)
    const parsed = adminInstitutionalFilingListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const query = parsed.data
    const pattern = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : undefined
    const where = and(
      query.guruId ? eq(gurus.id, BigInt(query.guruId)) : undefined,
      query.status ? eq(institutionalFilings.status, query.status) : undefined,
      query.periodEnd ? eq(institutionalFilings.periodEnd, query.periodEnd) : undefined,
      pattern ? or(ilike(institutionalFilings.accession, pattern), ilike(institutionalManagers.cik, pattern), ilike(gurus.name, pattern), ilike(gurus.slug, pattern)) : undefined,
    )
    const [totals, rows] = await Promise.all([
      db.select({ count: count() }).from(institutionalFilings)
        .innerJoin(institutionalManagers, eq(institutionalManagers.id, institutionalFilings.managerId))
        .leftJoin(gurus, eq(gurus.managerId, institutionalFilings.managerId)).where(where),
      db.select({ filing: institutionalFilings, manager: institutionalManagers, guru: gurus }).from(institutionalFilings)
        .innerJoin(institutionalManagers, eq(institutionalManagers.id, institutionalFilings.managerId))
        .leftJoin(gurus, eq(gurus.managerId, institutionalFilings.managerId)).where(where)
        .orderBy(desc(institutionalFilings.filingDate), desc(institutionalFilings.id))
        .limit(query.limit).offset(query.offset),
    ])
    return context.json(adminInstitutionalFilingListResponseSchema.parse({
      data: rows.map(row => filingRow(row.filing, row.manager, row.guru)),
      pagination: { limit: query.limit, offset: query.offset, total: Number(totals[0]?.count ?? 0) },
    }))
  })

  app.get('/api/admin/institutional/filings/:id', async context => {
    await requireAdmin(context)
    const id = parseId(context)
    const [row] = await db.select({ filing: institutionalFilings, manager: institutionalManagers, guru: gurus })
      .from(institutionalFilings)
      .innerJoin(institutionalManagers, eq(institutionalManagers.id, institutionalFilings.managerId))
      .leftJoin(gurus, eq(gurus.managerId, institutionalFilings.managerId))
      .where(eq(institutionalFilings.id, id)).limit(1)
    if (!row) return fail(404, 'SEC_FILING_NOT_FOUND', 'Filing not found')
    const { filing } = row
    const documents = await db.select().from(institutionalFilingDocuments).where(eq(institutionalFilingDocuments.filingId, id)).orderBy(desc(institutionalFilingDocuments.isPrimary), asc(institutionalFilingDocuments.basename))
    const artifacts = documents.length
      ? await db.select().from(institutionalFilingArtifacts).where(inArray(institutionalFilingArtifacts.documentId, documents.map(document => document.id))).orderBy(desc(institutionalFilingArtifacts.fetchedAt), desc(institutionalFilingArtifacts.id))
      : []
    const [parsedTotal] = await db.select({ count: count() }).from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, id))
    const parsedRows = await db.select({ holding: institutional13fHoldings, mapping: institutionalHoldingSecurityMappings })
      .from(institutional13fHoldings)
      .leftJoin(institutionalHoldingSecurityMappings, eq(institutionalHoldingSecurityMappings.holdingId, institutional13fHoldings.id))
      .where(eq(institutional13fHoldings.filingId, id))
      .orderBy(asc(institutional13fHoldings.rowNumber)).limit(PARSED_ROW_SAMPLE)
    const siblings = filing.periodEnd
      ? await db.select().from(institutionalFilings).where(and(
        eq(institutionalFilings.managerId, filing.managerId), eq(institutionalFilings.periodEnd, filing.periodEnd),
      )).orderBy(asc(institutionalFilings.filingDate), asc(institutionalFilings.id))
      : [filing]
    const [publication] = filing.periodEnd
      ? await db.select().from(institutionalEffectiveSnapshotPublications).where(and(
        eq(institutionalEffectiveSnapshotPublications.managerId, filing.managerId),
        eq(institutionalEffectiveSnapshotPublications.periodEnd, filing.periodEnd),
        eq(institutionalEffectiveSnapshotPublications.active, true),
      )).limit(1)
      : []
    const [snapshot] = publication ? await db.select().from(institutionalEffectiveSnapshots).where(eq(institutionalEffectiveSnapshots.id, publication.snapshotId)).limit(1) : []
    const sources = snapshot ? await db.select().from(institutionalEffectiveSnapshotSources).where(eq(institutionalEffectiveSnapshotSources.snapshotId, snapshot.id)).orderBy(asc(institutionalEffectiveSnapshotSources.ordinal)) : []
    const [periodState] = filing.periodEnd
      ? await db.select().from(institutionalEffectivePeriodStates).where(and(
        eq(institutionalEffectivePeriodStates.managerId, filing.managerId),
        eq(institutionalEffectivePeriodStates.periodEnd, filing.periodEnd),
      )).limit(1)
      : []
    const [analytics] = filing.periodEnd
      ? await db.select().from(guruQuarterAnalytics).where(and(
        eq(guruQuarterAnalytics.managerId, filing.managerId), eq(guruQuarterAnalytics.periodEnd, filing.periodEnd),
      )).orderBy(desc(guruQuarterAnalytics.calculatedAt), desc(guruQuarterAnalytics.id)).limit(1)
      : []
    const operationByFiling = new Map(sources.map(source => [source.filingId.toString(), source.operation]))
    return context.json(adminInstitutionalFilingDetailResponseSchema.parse({
      data: {
        filing: filingRow(filing, row.manager, row.guru),
        documents: documents.map(document => ({
          id: document.id.toString(), basename: document.basename, documentType: document.documentType,
          description: document.description, isPrimary: document.isPrimary, sourceUrl: document.sourceUrl,
          contentLength: document.contentLength === null ? null : document.contentLength.toString(),
          downloadedAt: instant(document.downloadedAt),
          artifacts: artifacts.filter(artifact => artifact.documentId === document.id).map(artifact => ({
            id: artifact.id.toString(), artifactRef: artifact.artifactRef, contentSha256: artifact.contentSha256,
            contentLength: artifact.contentLength.toString(), fetchedAt: instant(artifact.fetchedAt)!,
            fetchedReason: artifact.fetchedReason, retainUntil: instant(artifact.retainUntil),
            rawContentRetained: artifact.rawContent !== null,
            supersedesArtifactId: artifact.supersedesArtifactId?.toString() ?? null,
          })),
        })),
        parsedRows: {
          total: Number(parsedTotal?.count ?? 0),
          sample: parsedRows.map(({ holding, mapping }) => ({
            id: holding.id.toString(), rowNumber: holding.rowNumber, issuer: holding.issuer, titleOfClass: holding.titleOfClass,
            cusip: holding.cusip, figi: holding.figi, quantity: holding.quantity, quantityType: holding.quantityType as 'SH' | 'PRN',
            putCall: holding.putCall as 'PUT' | 'CALL' | null, reportedValue: holding.reportedValue,
            reportedValueUnit: holding.reportedValueUnit, valueUnitSource: holding.valueUnitSource,
            warnings: holding.warnings, parserVersion: holding.parserVersion,
            mappingStatus: mapping?.status ?? null, securityId: mapping?.securityId?.toString() ?? null,
          })),
        },
        effective: {
          snapshot: snapshot ? {
            id: snapshot.id.toString(), periodEnd: snapshot.periodEnd, snapshotHash: snapshot.snapshotHash,
            replayKey: snapshot.replayKey, sourceManifestHash: snapshot.sourceManifestHash,
            resolverVersion: snapshot.resolverVersion, holdingCount: snapshot.holdingCount, createdAt: instant(snapshot.createdAt)!,
          } : null,
          publication: publication ? { status: publication.status, active: publication.active, updatedAt: instant(publication.updatedAt)! } : null,
          periodState: periodState ? { status: periodState.status, reason: periodState.reason, checkedAt: instant(periodState.checkedAt)! } : null,
          sources: sources.map(source => ({
            ordinal: source.ordinal, filingId: source.filingId.toString(), accession: source.accession,
            operation: source.operation, amendmentNumber: source.amendmentNumber, parserVersion: source.parserVersion,
          })),
        },
        amendments: siblings.map(sibling => ({
          id: sibling.id.toString(), accession: sibling.accession, form: sibling.form, isAmendment: sibling.isAmendment,
          amendmentNumber: sibling.amendmentNumber, amendmentType: sibling.amendmentType, filedAt: instant(sibling.filedAt),
          status: sibling.status, operation: operationByFiling.get(sibling.id.toString()) ?? null, sourceUrl: sibling.sourceUrl,
        })),
        analytics: analytics ? {
          status: analytics.status, analyticsVersion: analytics.analyticsVersion,
          mappingCoveragePercent: analytics.mappingCoveragePercent, holdingCount: analytics.holdingCount,
          comparisonStatus: analytics.comparisonStatus, calculatedAt: instant(analytics.calculatedAt)!,
        } : null,
      },
    }))
  })

  async function guruForOperation(context: Context<AppEnv>) {
    const [guru] = await db.select().from(gurus).where(eq(gurus.id, parseId(context))).limit(1)
    if (!guru) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    return guru
  }

  /** Bring the manager's next SEC discovery forward. Repeating it cannot stack jobs. */
  app.post('/api/admin/gurus/:id/sync', async context => {
    await requireAdmin(context)
    const guru = await guruForOperation(context)
    const timestamp = now()
    const result = await db.transaction(async tx => {
      const [existing] = await tx.select().from(institutionalManagerDiscovery)
        .where(eq(institutionalManagerDiscovery.managerId, guru.managerId)).limit(1).for('update')
      if (existing?.status === 'RUNNING' && existing.leaseExpiresAt && existing.leaseExpiresAt > timestamp) {
        return { status: 'RUNNING' as const, nextCheckAt: existing.nextCheckAt }
      }
      if (existing && existing.nextCheckAt <= timestamp && existing.status === 'PENDING') {
        return { status: 'ALREADY_QUEUED' as const, nextCheckAt: existing.nextCheckAt }
      }
      const [row] = await tx.insert(institutionalManagerDiscovery)
        .values({ managerId: guru.managerId, status: 'PENDING', nextCheckAt: timestamp, updatedAt: timestamp })
        .onConflictDoUpdate({ target: institutionalManagerDiscovery.managerId, set: { status: 'PENDING', nextCheckAt: timestamp, updatedAt: timestamp } })
        .returning()
      return { status: 'QUEUED' as const, nextCheckAt: row!.nextCheckAt }
    })
    return context.json(adminInstitutionalJobResponseSchema.parse({
      data: {
        jobType: 'FILING_DISCOVERY', jobId: `discovery:${guru.managerId}`, status: result.status,
        managerId: guru.managerId.toString(), filingId: null, periodEnd: null, revision: null,
        requestedAt: timestamp.toISOString(),
        detail: result.status === 'RUNNING' ? 'A discovery run already holds this manager lease' : `Next SEC check scheduled for ${result.nextCheckAt.toISOString()}`,
      },
    }), result.status === 'QUEUED' ? 202 : 200)
  })

  /** Return a filing to the ingestion queue without deleting its preserved artifacts. */
  app.post('/api/admin/institutional/filings/:id/reprocess', async context => {
    await requireAdmin(context)
    const id = parseId(context)
    const timestamp = now()
    const result = await db.transaction(async tx => {
      const [filing] = await tx.select().from(institutionalFilings).where(eq(institutionalFilings.id, id)).limit(1).for('update')
      if (!filing) return undefined
      if (!(REPROCESSABLE as readonly string[]).includes(filing.status)) {
        return { filing, status: 'ALREADY_QUEUED' as const }
      }
      await tx.update(institutionalFilings).set({ status: 'PENDING', errorCode: null, updatedAt: timestamp })
        .where(and(eq(institutionalFilings.id, id), inArray(institutionalFilings.status, [...REPROCESSABLE])))
      await tx.insert(institutionalManagerDiscovery)
        .values({ managerId: filing.managerId, status: 'PENDING', nextCheckAt: timestamp, updatedAt: timestamp })
        .onConflictDoUpdate({ target: institutionalManagerDiscovery.managerId, set: { nextCheckAt: timestamp, updatedAt: timestamp } })
      return { filing, status: 'QUEUED' as const }
    })
    if (!result) return fail(404, 'SEC_FILING_NOT_FOUND', 'Filing not found')
    return context.json(adminInstitutionalJobResponseSchema.parse({
      data: {
        jobType: 'FILING_REPROCESS', jobId: `filing:${result.filing.id}`, status: result.status,
        managerId: result.filing.managerId.toString(), filingId: result.filing.id.toString(),
        periodEnd: result.filing.periodEnd, revision: null, requestedAt: timestamp.toISOString(),
        detail: result.status === 'QUEUED'
          ? `Filing ${result.filing.accession} returned to the ingestion queue; preserved artifacts are reused`
          : `Filing ${result.filing.accession} is already waiting for ingestion`,
      },
    }), result.status === 'QUEUED' ? 202 : 200)
  })

  /** Request one more effective-snapshot and analytics rebuild revision for a quarter. */
  app.post('/api/admin/gurus/:id/rebuild', async context => {
    await requireAdmin(context)
    const guru = await guruForOperation(context)
    const input = await parseJson(context, adminInstitutionalRebuildRequestSchema)
    const timestamp = now()
    const [filing] = await db.select({ id: institutionalFilings.id }).from(institutionalFilings).where(and(
      eq(institutionalFilings.managerId, guru.managerId), eq(institutionalFilings.periodEnd, input.periodEnd),
    )).limit(1)
    if (!filing) return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'No ingested filing exists for this quarter')
    const request = await db.transaction(async tx => {
      const [existing] = await tx.select().from(institutionalEffectiveSnapshotRebuildRequests).where(and(
        eq(institutionalEffectiveSnapshotRebuildRequests.managerId, guru.managerId),
        eq(institutionalEffectiveSnapshotRebuildRequests.periodEnd, input.periodEnd),
      )).limit(1).for('update')
      if (existing && existing.processedRevision < existing.requestedRevision) return { row: existing, status: 'ALREADY_QUEUED' as const }
      const [row] = await tx.insert(institutionalEffectiveSnapshotRebuildRequests)
        .values({ managerId: guru.managerId, periodEnd: input.periodEnd, requestedRevision: 1n, processedRevision: 0n, requestedAt: timestamp, nextAttemptAt: timestamp })
        .onConflictDoUpdate({
          target: [institutionalEffectiveSnapshotRebuildRequests.managerId, institutionalEffectiveSnapshotRebuildRequests.periodEnd],
          set: { requestedRevision: sql`${institutionalEffectiveSnapshotRebuildRequests.requestedRevision} + 1`, requestedAt: timestamp, nextAttemptAt: timestamp, lastError: null },
        }).returning()
      return { row: row!, status: 'QUEUED' as const }
    })
    return context.json(adminInstitutionalJobResponseSchema.parse({
      data: {
        jobType: 'ANALYTICS_REBUILD', jobId: `rebuild:${guru.managerId}:${input.periodEnd}`, status: request.status,
        managerId: guru.managerId.toString(), filingId: null, periodEnd: input.periodEnd,
        revision: request.row.requestedRevision.toString(), requestedAt: timestamp.toISOString(),
        detail: request.status === 'QUEUED'
          ? `Rebuild revision ${request.row.requestedRevision} requested for ${input.periodEnd}`
          : `Rebuild revision ${request.row.requestedRevision} for ${input.periodEnd} is still pending`,
      },
    }), request.status === 'QUEUED' ? 202 : 200)
  })

  /**
   * Operational diagnostics. Secrets, raw filing content, follower identities and
   * requesting-admin identities are never included.
   */
  app.get('/api/admin/institutional/diagnostics', async context => {
    await requireAdmin(context)
    const timestamp = now()
    const managers = await managerRows(timestamp)
    const body = adminInstitutionalDiagnosticsResponseSchema.parse({
      generatedAt: timestamp.toISOString(),
      versions: processingVersions,
      scheduler: await schedulerState(),
      queues: await queueDepths(),
      managers: managers.map(manager => ({
        cik: manager.cik, slug: manager.slug, active: manager.active,
        discoveryStatus: manager.discovery.status, lastCheckAt: manager.discovery.lastCheckAt,
        lastSuccessAt: manager.discovery.lastSuccessAt, lastErrorCode: manager.discovery.lastErrorCode,
        filings: { total: manager.filings.total, partial: manager.filings.partial, error: manager.filings.error },
        quarters: manager.quarters,
        analysis: { queued: manager.analysis.queued, running: manager.analysis.running, failed: manager.analysis.failed, invalidated: manager.analysis.invalidated },
      })),
      redactions: ['provider-credentials', 'raw-filing-content', 'ai-prompt-and-result-text', 'follower-identities', 'requesting-user-identities'],
    })
    return context.body(`${JSON.stringify(body, null, 2)}\n`, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="institutional-diagnostics-${timestamp.toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    })
  })
}
