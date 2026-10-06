import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import {
  guruConsensusSnapshots,
  guruHoldingChanges,
  guruQuarterAnalytics,
  guruSectorConsensus,
  guruStockConsensus,
  guruThemeMappings,
  gurus,
  institutionalEffectiveHoldings,
  institutionalEffectiveSnapshotPublications,
  institutionalSecurities,
  institutionalSecurityIdentifiers,
  type Database,
} from '@diary/db'
import type { GuruDecisionContext } from '@diary/contracts/guru-notifications'

export const GURU_DECISION_CONTEXT_VERSION = 'guru-decision-context-v1'

type Executor = Pick<Database, 'select'>

/** Resolve one active ticker to exactly one security. Ambiguity is never guessed. */
export async function resolveGuruSymbol(db: Executor, symbol: string, today: string) {
  const identifiers = await db.select({ securityId: institutionalSecurityIdentifiers.securityId })
    .from(institutionalSecurityIdentifiers).where(and(
      eq(institutionalSecurityIdentifiers.type, 'TICKER'), eq(institutionalSecurityIdentifiers.value, symbol),
      lte(institutionalSecurityIdentifiers.validFrom, today),
      or(isNull(institutionalSecurityIdentifiers.validTo), gte(institutionalSecurityIdentifiers.validTo, today)),
    ))
  const securityIds = [...new Set(identifiers.map(row => row.securityId))]
  if (securityIds.length !== 1) return { status: securityIds.length > 1 ? 'AMBIGUOUS' as const : 'UNRESOLVED' as const, securityId: null }
  return { status: 'MATCHED' as const, securityId: securityIds[0]! }
}

/**
 * Structured, prepared Guru context for one stock and quarter. It is the only
 * thing a research consumer or a decision-time snapshot reads: generated prose
 * is never part of it.
 */
export async function buildGuruDecisionContext(db: Executor, input: { securityId: bigint; symbol: string; periodEnd?: string }): Promise<{ context: GuruDecisionContext; consensusSnapshotId: bigint | null; consensusVersion: string | null } | null> {
  const [security] = await db.select().from(institutionalSecurities).where(eq(institutionalSecurities.id, input.securityId)).limit(1)
  if (!security) return null
  const snapshots = await db.select().from(guruConsensusSnapshots).orderBy(desc(guruConsensusSnapshots.periodEnd), desc(guruConsensusSnapshots.id))
  const snapshot = input.periodEnd ? snapshots.find(row => row.periodEnd === input.periodEnd) : snapshots[0]
  const periodEnd = input.periodEnd ?? snapshot?.periodEnd
  if (!periodEnd) return null
  const [consensusRow] = snapshot
    ? await db.select().from(guruStockConsensus).where(and(
      eq(guruStockConsensus.snapshotId, snapshot.id), eq(guruStockConsensus.securityId, input.securityId),
    )).limit(1)
    : []

  const analyticsRows = await db.select({ analytics: guruQuarterAnalytics, guru: gurus })
    .from(guruQuarterAnalytics)
    .innerJoin(gurus, eq(gurus.managerId, guruQuarterAnalytics.managerId))
    .innerJoin(institutionalEffectiveSnapshotPublications, and(
      eq(institutionalEffectiveSnapshotPublications.snapshotId, guruQuarterAnalytics.snapshotId),
      eq(institutionalEffectiveSnapshotPublications.active, true),
      eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
    ))
    .where(and(eq(guruQuarterAnalytics.periodEnd, periodEnd), eq(guruQuarterAnalytics.status, 'READY'), eq(gurus.active, true)))
  const analyticsIds = analyticsRows.map(row => row.analytics.id)
  const [changeRows, holdingRows] = await Promise.all([
    analyticsIds.length ? db.select().from(guruHoldingChanges).where(and(
      inArray(guruHoldingChanges.analyticsId, analyticsIds), eq(guruHoldingChanges.securityId, input.securityId),
    )) : [],
    analyticsIds.length ? db.select({
      snapshotId: institutionalEffectiveHoldings.snapshotId,
      quantity: institutionalEffectiveHoldings.quantity,
    }).from(institutionalEffectiveHoldings).where(and(
      inArray(institutionalEffectiveHoldings.snapshotId, analyticsRows.map(row => row.analytics.snapshotId)),
      eq(institutionalEffectiveHoldings.securityId, input.securityId),
      eq(institutionalEffectiveHoldings.quantityType, 'SH'),
      isNull(institutionalEffectiveHoldings.putCall),
    )) : [],
  ])
  const changeByAnalytics = new Map(changeRows.map(row => [row.analyticsId.toString(), row]))
  const quantityBySnapshot = new Map(holdingRows.map(row => [row.snapshotId.toString(), row.quantity]))
  const holders = analyticsRows.flatMap(({ analytics, guru }) => {
    const change = changeByAnalytics.get(analytics.id.toString())
    const quantity = quantityBySnapshot.get(analytics.snapshotId.toString()) ?? null
    if (!change && quantity === null) return []
    return [{
      guruSlug: guru.slug, guruName: guru.name,
      action: change?.action ?? null,
      weightPercent: change?.currentWeightPercent ?? null,
      quantity,
      rank: change?.currentRank ?? null,
    }]
  }).sort((left, right) => left.guruName.localeCompare(right.guruName))

  const themeKeys = (await db.select({ themeKey: guruThemeMappings.themeKey }).from(guruThemeMappings)
    .where(and(eq(guruThemeMappings.securityId, input.securityId), eq(guruThemeMappings.active, true)))).map(row => row.themeKey)
  const sectorRows = snapshot ? await db.select().from(guruSectorConsensus).where(eq(guruSectorConsensus.snapshotId, snapshot.id)).orderBy(asc(guruSectorConsensus.name)) : []
  const sectors = sectorRows.filter(row =>
    (row.dimension === 'SECTOR' && row.name === security.sector)
    || (row.dimension === 'INDUSTRY' && row.name === security.industry)
    || (row.dimension === 'THEME' && themeKeys.includes(row.dimensionKey)),
  ).map(row => ({
    dimension: row.dimension as 'SECTOR' | 'INDUSTRY' | 'THEME', name: row.name,
    direction: row.direction as 'INCREASING' | 'STABLE' | 'REDUCING' | null,
    aggregateWeightPercent: row.aggregateWeightPercent,
    aggregateWeightChangePoints: row.aggregateWeightChangePoints,
  }))

  return {
    consensusSnapshotId: snapshot?.id ?? null,
    consensusVersion: snapshot?.consensusVersion ?? null,
    context: {
      contextVersion: GURU_DECISION_CONTEXT_VERSION,
      source: 'prepared-institutional-analytics',
      symbol: input.symbol,
      company: security.issuer,
      periodEnd,
      consensus: consensusRow ? {
        holderCount: consensusRow.currentHolderCount,
        previousHolderCount: consensusRow.previousHolderCount,
        newBuyerCount: consensusRow.newBuyerCount,
        addCount: consensusRow.addCount,
        reduceCount: consensusRow.reduceCount,
        exitCount: consensusRow.exitCount,
        netBuyerCount: consensusRow.netBuyerCount,
        averagePortfolioWeightPercent: consensusRow.averagePortfolioWeightPercent,
        aggregateWeightPercent: consensusRow.aggregateWeightPercent,
        classification: consensusRow.classification as 'ACCUMULATION' | 'NEUTRAL' | 'DISTRIBUTION' | null,
        quarterTrend: consensusRow.quarterTrend as 'RISING' | 'STABLE' | 'FALLING' | 'UNAVAILABLE',
        eligibleManagerCount: snapshot!.activeManagerCount,
        readyManagerCount: snapshot!.readyManagerCount,
      } : null,
      holders,
      sectors,
    },
  }
}
