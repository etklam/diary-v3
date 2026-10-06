import { createHash } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  guruConsensusSnapshots,
  guruQuarterAnalytics,
  guruSectorConsensus,
  guruStockConsensus,
  guruThemeMappings,
  gurus,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalFilings,
  type Database,
} from '@diary/db'
import {
  buildGuruAnalysisContext,
  type GuruAnalysisConsensusInput,
  type GuruAnalysisHistoryPoint,
  type GuruAnalysisQuarterStatus,
} from '@diary/domain/guru-analysis'
import { DEFAULT_GURU_ACTION_THRESHOLDS, type GuruPortfolioAnalytics } from '@diary/domain/guru-portfolio-analytics'

const HISTORY_LIMIT = 8

export type GuruAnalysisContextFailure =
  | 'QUARTER_NOT_READY'
  | 'ANALYTICS_NOT_PREPARED'
  | 'ANALYTICS_SUPERSEDED'

type Executor = Pick<Database, 'select'>

function analyticsResult(row: typeof guruQuarterAnalytics.$inferSelect): GuruPortfolioAnalytics | null {
  const value = row.result
  return value && typeof value === 'object' && !Array.isArray(value) ? value as unknown as GuruPortfolioAnalytics : null
}

function quarterStatus(state: string | undefined, analyticsStatus: string | undefined): GuruAnalysisQuarterStatus {
  if (state === 'PARTIAL' || state === 'ERROR') return state
  if (analyticsStatus === 'READY' || analyticsStatus === 'PARTIAL' || analyticsStatus === 'ERROR') return analyticsStatus
  return 'PENDING'
}

/** Latest prepared analytics row for a manager quarter, in the current analytics version. */
export async function readPreparedAnalytics(db: Executor, managerId: bigint, periodEnd: string) {
  const [analytics] = await db.select().from(guruQuarterAnalytics)
    .where(and(eq(guruQuarterAnalytics.managerId, managerId), eq(guruQuarterAnalytics.periodEnd, periodEnd)))
    .orderBy(desc(guruQuarterAnalytics.calculatedAt), desc(guruQuarterAnalytics.id)).limit(1)
  return analytics
}

/**
 * Build the structured Guru analysis input from prepared institutional data.
 * It never reads filing documents, parsed rows or raw SEC XML.
 */
export async function buildGuruAnalysisInput(db: Executor, input: { guru: typeof gurus.$inferSelect; periodEnd: string }) {
  const managerId = input.guru.managerId
  const analytics = await readPreparedAnalytics(db, managerId, input.periodEnd)
  if (!analytics) return { ok: false as const, reason: 'ANALYTICS_NOT_PREPARED' as GuruAnalysisContextFailure }
  const [publication] = await db.select().from(institutionalEffectiveSnapshotPublications).where(and(
    eq(institutionalEffectiveSnapshotPublications.managerId, managerId),
    eq(institutionalEffectiveSnapshotPublications.periodEnd, input.periodEnd),
    eq(institutionalEffectiveSnapshotPublications.active, true),
    eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
  )).limit(1)
  if (!publication || publication.snapshotId !== analytics.snapshotId) return { ok: false as const, reason: 'ANALYTICS_SUPERSEDED' as GuruAnalysisContextFailure }
  const [state] = await db.select().from(institutionalEffectivePeriodStates).where(and(
    eq(institutionalEffectivePeriodStates.managerId, managerId),
    eq(institutionalEffectivePeriodStates.periodEnd, input.periodEnd),
  )).limit(1)
  const status = quarterStatus(state?.status, analytics.status)
  const result = analyticsResult(analytics)
  if (status !== 'READY' || analytics.status !== 'READY' || !result) return { ok: false as const, reason: 'QUARTER_NOT_READY' as GuruAnalysisContextFailure }

  const [filing] = await db.select().from(institutionalFilings).where(and(
    eq(institutionalFilings.managerId, managerId), eq(institutionalFilings.periodEnd, input.periodEnd),
  )).orderBy(desc(institutionalFilings.filedAt), desc(institutionalFilings.id)).limit(1)

  const historyRows = await db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.managerId, managerId))
    .orderBy(desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.calculatedAt), desc(guruQuarterAnalytics.id)).limit(HISTORY_LIMIT * 2)
  const seen = new Set<string>()
  const history: GuruAnalysisHistoryPoint[] = []
  for (const row of historyRows) {
    if (row.periodEnd === input.periodEnd || seen.has(row.periodEnd) || history.length >= HISTORY_LIMIT) continue
    seen.add(row.periodEnd)
    const ready = row.status === 'READY'
    history.push({
      periodEnd: row.periodEnd,
      status: row.status as GuruAnalysisQuarterStatus,
      reportedValueUsd: ready ? row.reportedValueUsd : null,
      holdingCount: ready ? row.holdingCount : null,
      topTenConcentrationPercent: ready ? row.topTenConcentrationPercent : null,
      turnoverPercent: ready ? row.disclosedWeightTurnoverPercent : null,
      turnoverBand: ready && (row.turnoverBand === 'LOW' || row.turnoverBand === 'MODERATE' || row.turnoverBand === 'HIGH') ? row.turnoverBand : null,
    })
  }

  const consensus = await readConsensus(db, { periodEnd: input.periodEnd, analytics: result })
  const built = buildGuruAnalysisContext({
    profile: { name: input.guru.name, managerName: input.guru.managerName, slug: input.guru.slug, managerType: input.guru.managerType, styleTags: input.guru.styleTags },
    quarter: {
      periodEnd: input.periodEnd, status, mappingCoveragePercent: analytics.mappingCoveragePercent,
      accession: filing?.accession ?? null, filedAt: filing?.filedAt?.toISOString() ?? null,
    },
    analyticsVersion: analytics.analyticsVersion,
    analytics: result,
    thresholds: DEFAULT_GURU_ACTION_THRESHOLDS,
    history,
    consensus: consensus?.input ?? null,
  })
  return {
    ok: true as const,
    analytics,
    consensusSnapshotId: consensus?.snapshotId ?? null,
    consensusVersion: consensus?.input.consensusVersion ?? null,
    context: built.context,
    facts: built.facts,
    contextVersion: built.contextVersion,
    inputHash: createHash('sha256').update(built.canonicalJson).digest('hex'),
  }
}

async function readConsensus(db: Executor, input: { periodEnd: string; analytics: GuruPortfolioAnalytics }): Promise<{ snapshotId: bigint; input: GuruAnalysisConsensusInput } | null> {
  const [snapshot] = await db.select().from(guruConsensusSnapshots)
    .where(eq(guruConsensusSnapshots.periodEnd, input.periodEnd))
    .orderBy(desc(guruConsensusSnapshots.calculatedAt), desc(guruConsensusSnapshots.id)).limit(1)
  if (!snapshot) return null
  const securityIds = [...new Set(input.analytics.portfolio.topHoldings.flatMap(holding => holding.securityId ? [BigInt(holding.securityId)] : []))]
  const positionRows = securityIds.length ? await db.select().from(guruStockConsensus).where(and(
    eq(guruStockConsensus.snapshotId, snapshot.id), inArray(guruStockConsensus.securityId, securityIds),
  )) : []
  const positionBySecurity = new Map(positionRows.map(row => [row.securityId.toString(), row]))
  const sectorNames = input.analytics.portfolio.sectorAllocation.map(bucket => bucket.name)
  const themeRows = securityIds.length ? await db.select({ themeKey: guruThemeMappings.themeKey }).from(guruThemeMappings).where(and(
    inArray(guruThemeMappings.securityId, securityIds), eq(guruThemeMappings.active, true),
  )) : []
  const themeKeys = [...new Set(themeRows.map(row => row.themeKey))]
  const sectorRows = await db.select().from(guruSectorConsensus).where(eq(guruSectorConsensus.snapshotId, snapshot.id))
  const sectors = sectorRows.filter(row =>
    (row.dimension === 'SECTOR' && sectorNames.includes(row.name)) || (row.dimension === 'THEME' && themeKeys.includes(row.dimensionKey)),
  ).sort((left, right) => left.dimension.localeCompare(right.dimension) || left.name.localeCompare(right.name))
  return {
    snapshotId: snapshot.id,
    input: {
      periodEnd: snapshot.periodEnd,
      consensusVersion: snapshot.consensusVersion,
      eligibleManagerCount: snapshot.activeManagerCount,
      readyManagerCount: snapshot.readyManagerCount,
      positions: input.analytics.portfolio.topHoldings.flatMap(holding => {
        const row = holding.securityId ? positionBySecurity.get(holding.securityId) : undefined
        if (!row) return []
        return [{
          positionKey: holding.positionKey, ticker: row.ticker, company: row.company,
          currentHolderCount: row.currentHolderCount, previousHolderCount: row.previousHolderCount, holderCountChange: row.holderCountChange,
          newBuyerCount: row.newBuyerCount, addCount: row.addCount, reduceCount: row.reduceCount, exitCount: row.exitCount,
          netBuyerCount: row.netBuyerCount, averagePortfolioWeightPercent: row.averagePortfolioWeightPercent,
          classification: row.classification as 'ACCUMULATION' | 'NEUTRAL' | 'DISTRIBUTION' | null,
        }]
      }),
      sectors: sectors.map(row => ({
        dimension: row.dimension as 'SECTOR' | 'INDUSTRY' | 'THEME', name: row.name,
        direction: row.direction as 'INCREASING' | 'STABLE' | 'REDUCING' | null,
        buyerCount: row.buyerCount, sellerCount: row.sellerCount, newPositionCount: row.newPositionCount, exitCount: row.exitCount,
        aggregateWeightPercent: row.aggregateWeightPercent, aggregateWeightChangePoints: row.aggregateWeightChangePoints,
        holderBreadthPercent: row.holderBreadthPercent,
      })),
    },
  }
}
