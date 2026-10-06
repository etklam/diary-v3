import { createHash } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import {
  guruAnalyticsEventDeliveries,
  guruHoldingChanges,
  guruQuarterAnalytics,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshots,
  institutionalSecurityIdentityEvents,
  institutionalSecurityIdentifiers,
  institutionalSecurities,
  institutionalSnapshotChangeEvents,
  type Database,
  type DatabaseTx,
} from '@diary/db'
import {
  calculateGuruPortfolioAnalytics,
  DEFAULT_GURU_ACTION_THRESHOLDS,
  GURU_PORTFOLIO_ANALYTICS_VERSION,
  type GuruAnalyticsHolding,
  type GuruAnalyticsSnapshot,
  type GuruPortfolioAnalytics,
  type GuruSecurityIdentityEvent,
} from '@diary/domain/guru-portfolio-analytics'

const ANALYTICS_EVENT_LOCK = 'guru-portfolio-analytics-event-consumer'
const FAILURE_BACKOFF_MS = 60_000

interface EffectivePortfolioInput {
  id: bigint
  snapshotHash: string
  periodEnd: string
  state: 'READY' | 'PARTIAL' | 'ERROR'
  stateReason: string | null
  holdings: GuruAnalyticsHolding[]
}

function stableJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function hash(value: unknown): string { return createHash('sha256').update(stableJson(value)).digest('hex') }

function previousQuarterEnd(periodEnd: string): string {
  const [year, month] = periodEnd.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 3, 0)).toISOString().slice(0, 10)
}

function nextQuarterEnd(periodEnd: string): string {
  const [year, month] = periodEnd.split('-').map(Number)
  return new Date(Date.UTC(year!, month! + 3, 0)).toISOString().slice(0, 10)
}

function periodState(value: string | null | undefined): EffectivePortfolioInput['state'] {
  if (value === 'READY' || value === 'ERROR') return value
  return 'PARTIAL'
}

async function readEffectivePortfolio(tx: DatabaseTx, managerId: bigint, periodEnd: string): Promise<EffectivePortfolioInput | undefined> {
  const [snapshot] = await tx.select({
    id: institutionalEffectiveSnapshots.id,
    snapshotHash: institutionalEffectiveSnapshots.snapshotHash,
    periodEnd: institutionalEffectiveSnapshots.periodEnd,
    state: institutionalEffectivePeriodStates.status,
    stateReason: institutionalEffectivePeriodStates.reason,
  }).from(institutionalEffectiveSnapshotPublications)
    .innerJoin(institutionalEffectiveSnapshots, eq(institutionalEffectiveSnapshots.id, institutionalEffectiveSnapshotPublications.snapshotId))
    .leftJoin(institutionalEffectivePeriodStates, and(
      eq(institutionalEffectivePeriodStates.managerId, institutionalEffectiveSnapshots.managerId),
      eq(institutionalEffectivePeriodStates.periodEnd, institutionalEffectiveSnapshots.periodEnd),
    ))
    .where(and(
      eq(institutionalEffectiveSnapshotPublications.managerId, managerId),
      eq(institutionalEffectiveSnapshotPublications.periodEnd, periodEnd),
      eq(institutionalEffectiveSnapshotPublications.active, true),
      eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
    )).limit(1)
  if (!snapshot) return undefined

  const rows = await tx.select({
    sourceRowKey: institutionalEffectiveHoldings.sourceRowKey,
    securityId: institutionalEffectiveHoldings.securityId,
    sourceIssuer: institutionalEffectiveHoldings.issuer,
    quantityType: institutionalEffectiveHoldings.quantityType,
    putCall: institutionalEffectiveHoldings.putCall,
    quantity: institutionalEffectiveHoldings.quantity,
    reportedValue: institutionalEffectiveHoldings.reportedValue,
    reportedValueUnit: institutionalEffectiveHoldings.reportedValueUnit,
    mappingStatus: institutionalEffectiveHoldings.mappingStatus,
    company: institutionalSecurities.issuer,
    sector: institutionalSecurities.sector,
    industry: institutionalSecurities.industry,
  }).from(institutionalEffectiveHoldings)
    .leftJoin(institutionalSecurities, eq(institutionalSecurities.id, institutionalEffectiveHoldings.securityId))
    .where(eq(institutionalEffectiveHoldings.snapshotId, snapshot.id))
    .orderBy(asc(institutionalEffectiveHoldings.ordinal))
  const securityIds = [...new Set(rows.flatMap(row => row.securityId === null ? [] : [row.securityId]))]
  const tickerRows = securityIds.length ? await tx.select({ securityId: institutionalSecurityIdentifiers.securityId, ticker: institutionalSecurityIdentifiers.value })
    .from(institutionalSecurityIdentifiers).where(and(
      inArray(institutionalSecurityIdentifiers.securityId, securityIds),
      eq(institutionalSecurityIdentifiers.type, 'TICKER'),
      lte(institutionalSecurityIdentifiers.validFrom, periodEnd),
      or(gte(institutionalSecurityIdentifiers.validTo, periodEnd), isNull(institutionalSecurityIdentifiers.validTo)),
    )).orderBy(desc(institutionalSecurityIdentifiers.validFrom), desc(institutionalSecurityIdentifiers.id)) : []
  const tickers = new Map<bigint, string>()
  for (const row of tickerRows) if (!tickers.has(row.securityId)) tickers.set(row.securityId, row.ticker)
  return {
    id: snapshot.id,
    snapshotHash: snapshot.snapshotHash,
    periodEnd: snapshot.periodEnd,
    state: periodState(snapshot.state),
    stateReason: snapshot.stateReason,
    holdings: rows.map(row => ({
      sourceRowKey: row.sourceRowKey,
      securityId: row.securityId?.toString() ?? null,
      ticker: row.securityId === null ? null : tickers.get(row.securityId) ?? null,
      company: row.company ?? row.sourceIssuer,
      sector: row.sector,
      industry: row.industry,
      quantityType: row.quantityType as GuruAnalyticsHolding['quantityType'],
      putCall: row.putCall as GuruAnalyticsHolding['putCall'],
      quantity: row.quantity,
      reportedValue: row.reportedValue,
      reportedValueUnit: row.reportedValueUnit as GuruAnalyticsHolding['reportedValueUnit'],
      mappingStatus: row.mappingStatus as GuruAnalyticsHolding['mappingStatus'],
    })),
  }
}

async function readIdentityEvents(tx: DatabaseTx): Promise<GuruSecurityIdentityEvent[]> {
  const events = await tx.select().from(institutionalSecurityIdentityEvents)
    .orderBy(asc(institutionalSecurityIdentityEvents.effectiveOn), asc(institutionalSecurityIdentityEvents.id))
  return events.map(event => ({
    id: event.id.toString(),
    supersedesEventId: event.supersedesEventId?.toString() ?? null,
    kind: event.kind,
    fromSecurityId: event.fromSecurityId.toString(),
    toSecurityId: event.toSecurityId?.toString() ?? null,
    effectiveOn: event.effectiveOn,
    newSharesPerOldShare: event.newSharesPerOldShare,
    comparable: event.comparable,
  }))
}

function relevantIdentityEvents(
  current: EffectivePortfolioInput,
  previous: EffectivePortfolioInput | undefined,
  events: readonly GuruSecurityIdentityEvent[],
): GuruSecurityIdentityEvent[] {
  if (!previous) return []
  const inPeriod = events.filter(event => previous.periodEnd < event.effectiveOn && event.effectiveOn <= current.periodEnd)
  const relevant = new Set<string>()
  const reachable = new Set([...current.holdings, ...previous.holdings].flatMap(holding => holding.securityId ? [holding.securityId] : []))
  let added = true
  while (added) {
    added = false
    for (const event of inPeriod) {
      if (relevant.has(event.id) || (!reachable.has(event.fromSecurityId) && (!event.toSecurityId || !reachable.has(event.toSecurityId)))) continue
      relevant.add(event.id)
      reachable.add(event.fromSecurityId)
      if (event.toSecurityId) reachable.add(event.toSecurityId)
      added = true
    }
  }
  return inPeriod.filter(event => relevant.has(event.id))
}

function readyValues(result: GuruPortfolioAnalytics) {
  const { portfolio, actionCounts } = result
  return {
    comparisonStatus: result.comparisonStatus,
    reportedValueUsd: portfolio.reportedValueUsd,
    holdingCount: portfolio.holdingCount,
    sourceRowCount: portfolio.sourceRowCount,
    mappedRowCount: portfolio.mappedRowCount,
    mappingCoveragePercent: portfolio.mappingCoveragePercent,
    topOneConcentrationPercent: portfolio.topOneConcentrationPercent,
    topFiveConcentrationPercent: portfolio.topFiveConcentrationPercent,
    topTenConcentrationPercent: portfolio.topTenConcentrationPercent,
    hhi: portfolio.hhi,
    disclosedWeightTurnoverPercent: result.disclosedWeightTurnoverPercent,
    turnoverBand: result.turnoverBand,
    turnoverUnavailableReason: result.turnoverUnavailableReason,
    newCount: actionCounts.NEW,
    strongAddCount: actionCounts.STRONG_ADD,
    addCount: actionCounts.ADD,
    unchangedCount: actionCounts.UNCHANGED,
    reduceCount: actionCounts.REDUCE,
    strongReduceCount: actionCounts.STRONG_REDUCE,
    exitCount: actionCounts.EXIT,
    result: result as unknown as Record<string, unknown>,
  }
}

function structuredContextHash(result: GuruPortfolioAnalytics, state: EffectivePortfolioInput['state'], stateReason: string | null): string {
  const publicChange = ({ corporateActionEventIds: _auditEventIds, ...change }: GuruPortfolioAnalytics['changes'][number]) => change
  const largestPosition = result.portfolio.largestPosition?.securityId === null
    ? { ...result.portfolio.largestPosition, positionKey: null }
    : result.portfolio.largestPosition
  if (state !== 'READY') return hash({ status: state, reason: stateReason, periodEnd: result.periodEnd, portfolio: { ...result.portfolio, largestPosition } })
  return hash({
    status: state,
    result: {
      ...result,
      portfolio: { ...result.portfolio, largestPosition },
      changes: result.changes.map(publicChange),
      largestAdds: result.largestAdds.map(publicChange),
      largestReductions: result.largestReductions.map(publicChange),
    },
  })
}

async function persistPeriod(tx: DatabaseTx, managerId: bigint, current: EffectivePortfolioInput, previous: EffectivePortfolioInput | undefined, identityEvents: readonly GuruSecurityIdentityEvent[], now: Date) {
  const currentSnapshot: GuruAnalyticsSnapshot = { periodEnd: current.periodEnd, status: current.state, holdings: current.holdings }
  const previousSnapshot: GuruAnalyticsSnapshot | undefined = previous
    ? { periodEnd: previous.periodEnd, status: previous.state, holdings: previous.holdings }
    : undefined
  const result = calculateGuruPortfolioAnalytics({
    current: current.state === 'READY' ? currentSnapshot : { ...currentSnapshot, status: 'READY' },
    ...(current.state === 'READY' && previousSnapshot ? { previous: previousSnapshot } : {}),
    thresholds: DEFAULT_GURU_ACTION_THRESHOLDS,
    identityEvents,
  })
  const ready = current.state === 'READY'
  const sourceHash = hash({
    analyticsVersion: GURU_PORTFOLIO_ANALYTICS_VERSION,
    thresholds: DEFAULT_GURU_ACTION_THRESHOLDS,
    current: { snapshotId: current.id, snapshotHash: current.snapshotHash, state: current.state, stateReason: current.stateReason, holdings: current.holdings },
    previous: previous ? { snapshotId: previous.id, snapshotHash: previous.snapshotHash, state: previous.state, stateReason: previous.stateReason, holdings: previous.holdings } : null,
    identityEvents,
  })
  const contextHash = structuredContextHash(result, current.state, current.stateReason)
  const [existing] = await tx.select().from(guruQuarterAnalytics).where(and(
    eq(guruQuarterAnalytics.managerId, managerId),
    eq(guruQuarterAnalytics.periodEnd, current.periodEnd),
    eq(guruQuarterAnalytics.analyticsVersion, GURU_PORTFOLIO_ANALYTICS_VERSION),
  )).limit(1)
  if (existing?.inputHash === sourceHash && existing.status === (ready ? 'READY' : current.state)) return { status: current.state, analyticsId: existing.id, changed: false }

  const values = {
    managerId,
    periodEnd: current.periodEnd,
    snapshotId: current.id,
    previousSnapshotId: previous?.id ?? null,
    analyticsVersion: GURU_PORTFOLIO_ANALYTICS_VERSION,
    inputHash: sourceHash,
    contextHash,
    status: ready ? 'READY' : current.state,
    ...readyValues(result),
    ...(ready ? {} : {
      comparisonStatus: `CURRENT_${current.state}`,
      disclosedWeightTurnoverPercent: null,
      turnoverBand: null,
      turnoverUnavailableReason: 'CURRENT_NOT_READY',
      newCount: 0, strongAddCount: 0, addCount: 0, unchangedCount: 0, reduceCount: 0, strongReduceCount: 0, exitCount: 0,
      result: null,
    }),
    calculatedAt: now,
  }
  const [stored] = existing
    ? await tx.update(guruQuarterAnalytics).set(values).where(eq(guruQuarterAnalytics.id, existing.id)).returning()
    : await tx.insert(guruQuarterAnalytics).values(values).returning()
  if (!stored) throw new Error('GURU_ANALYTICS_PERSIST_FAILED')
  await tx.delete(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, stored.id))
  if (ready && result.changes.length) {
    const changes = result.changes.map(change => ({
      analyticsId: stored.id,
      positionKey: change.positionKey,
      securityId: change.securityId === null ? null : BigInt(change.securityId),
      ticker: change.ticker,
      company: change.company,
      action: change.action,
      quantityType: change.quantityType,
      putCall: change.putCall,
      previousQuantity: change.previousQuantity,
      comparablePreviousQuantity: change.comparablePreviousQuantity,
      currentQuantity: change.currentQuantity,
      quantityChange: change.quantityChange,
      quantityChangePercent: change.quantityChangePercent,
      quantityAdjustmentFactor: change.quantityAdjustmentFactor,
      corporateActionEventIds: change.corporateActionEventIds,
      previousWeightPercent: change.previousWeightPercent,
      currentWeightPercent: change.currentWeightPercent,
      weightChangePercentagePoints: change.weightChangePercentagePoints,
      previousRank: change.previousRank,
      currentRank: change.currentRank,
      rankChange: change.rankChange,
      previousReportedValueUsd: change.previousReportedValueUsd,
      currentReportedValueUsd: change.currentReportedValueUsd,
      reportedValueChangeUsd: change.reportedValueChangeUsd,
    }))
    for (let offset = 0; offset < changes.length; offset += 250) await tx.insert(guruHoldingChanges).values(changes.slice(offset, offset + 250))
  }
  return { status: current.state, analyticsId: stored.id, changed: true }
}

async function rebuildAffectedPeriods(tx: DatabaseTx, managerId: bigint, changedPeriod: string, now: Date) {
  const periods = [changedPeriod, nextQuarterEnd(changedPeriod)]
  const identityEvents = await readIdentityEvents(tx)
  const results = []
  for (const periodEnd of periods) {
    const current = await readEffectivePortfolio(tx, managerId, periodEnd)
    if (!current) continue
    const prior = await readEffectivePortfolio(tx, managerId, previousQuarterEnd(periodEnd))
    results.push(await persistPeriod(tx, managerId, current, prior, relevantIdentityEvents(current, prior, identityEvents), now))
  }
  return results
}

export async function runPendingGuruPortfolioAnalyticsOnce(db: Database, now = new Date()) {
  let attemptedEventId: bigint | undefined
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ANALYTICS_EVENT_LOCK}, 0))`)
      const [event] = await tx.select({
        id: institutionalSnapshotChangeEvents.id,
        managerId: institutionalSnapshotChangeEvents.managerId,
        periodEnd: institutionalSnapshotChangeEvents.periodEnd,
      }).from(institutionalSnapshotChangeEvents)
        .leftJoin(guruAnalyticsEventDeliveries, eq(guruAnalyticsEventDeliveries.eventId, institutionalSnapshotChangeEvents.id))
        .where(and(
          isNull(guruAnalyticsEventDeliveries.processedAt),
          or(isNull(guruAnalyticsEventDeliveries.eventId), lte(guruAnalyticsEventDeliveries.nextAttemptAt, now)),
        ))
        .orderBy(asc(institutionalSnapshotChangeEvents.id)).limit(1)
      if (!event) return undefined
      attemptedEventId = event.id
      const result = await rebuildAffectedPeriods(tx, event.managerId, event.periodEnd, now)
      await tx.insert(guruAnalyticsEventDeliveries).values({ eventId: event.id, attemptCount: 0, nextAttemptAt: now, processedAt: now, lastError: null })
        .onConflictDoUpdate({ target: guruAnalyticsEventDeliveries.eventId, set: { nextAttemptAt: now, processedAt: now, lastError: null } })
      return { eventId: event.id, managerId: event.managerId, periodEnd: event.periodEnd, status: 'READY' as const, analytics: result }
    })
  } catch {
    if (attemptedEventId === undefined) throw new Error('GURU_ANALYTICS_EVENT_CLAIM_FAILED')
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ANALYTICS_EVENT_LOCK}, 0))`)
      const [previous] = await tx.select({ attemptCount: guruAnalyticsEventDeliveries.attemptCount }).from(guruAnalyticsEventDeliveries)
        .where(eq(guruAnalyticsEventDeliveries.eventId, attemptedEventId!)).limit(1)
      await tx.insert(guruAnalyticsEventDeliveries).values({
        eventId: attemptedEventId!, attemptCount: 1, nextAttemptAt: new Date(now.getTime() + FAILURE_BACKOFF_MS),
        lastError: 'GURU_ANALYTICS_REBUILD_FAILED', processedAt: null,
      }).onConflictDoUpdate({ target: guruAnalyticsEventDeliveries.eventId, set: {
        attemptCount: (previous?.attemptCount ?? 0) + 1,
        nextAttemptAt: new Date(now.getTime() + FAILURE_BACKOFF_MS),
        lastError: 'GURU_ANALYTICS_REBUILD_FAILED',
        processedAt: null,
      } })
    })
    return { eventId: attemptedEventId, status: 'ERROR' as const }
  }
}
