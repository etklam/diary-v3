import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import {
  guruConsensusRebuildRequests,
  guruConsensusSnapshots,
  guruHoldingChanges,
  guruQuarterAnalytics,
  guruSectorConsensus,
  guruStockConsensus,
  guruThemeMappings,
  gurus,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshots,
  institutionalFilings,
  institutionalManagers,
  institutionalSecurities,
  institutionalSecurityIdentifiers,
  type Database,
  type DatabaseTx,
} from '@diary/db'
import {
  calculateGuruConsensusSnapshot,
  GURU_CONSENSUS_VERSION,
  type GuruConsensusChange,
  type GuruConsensusHolding,
  type GuruConsensusManager,
  type GuruConsensusStatus,
} from '@diary/domain/guru-consensus'
import { GURU_PORTFOLIO_ANALYTICS_VERSION } from '@diary/domain/guru-portfolio-analytics'

const CONSENSUS_REBUILD_LOCK = 'guru-consensus-rebuild-worker'
const FAILURE_BACKOFF_MS = 60_000

function stableJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function hash(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function previousQuarterEnd(periodEnd: string): string {
  const [year, month] = periodEnd.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 3, 0)).toISOString().slice(0, 10)
}

function filingStatus(value: string | undefined): GuruConsensusStatus {
  if (value === 'PARTIAL') return 'PARTIAL'
  if (value === 'ERROR') return 'ERROR'
  if (value === 'SUPERSEDED') return 'SUPERSEDED'
  return value ? 'PENDING' : 'NO_FILING'
}

function snapshotReady(input: {
  managerId: bigint
  publication: typeof institutionalEffectiveSnapshotPublications.$inferSelect | undefined
  state: typeof institutionalEffectivePeriodStates.$inferSelect | undefined
  analytics: typeof guruQuarterAnalytics.$inferSelect | undefined
}): boolean {
  return input.publication?.active === true && input.publication.status === 'READY'
    && input.state?.status === 'READY' && input.analytics?.status === 'READY'
    && input.analytics.snapshotId === input.publication.snapshotId
    && input.analytics.managerId === input.managerId
}

async function rebuildPeriod(tx: DatabaseTx, periodEnd: string, now: Date) {
  const priorPeriodEnd = previousQuarterEnd(periodEnd)
  const managerRows = await tx.select({
    managerId: institutionalManagers.id,
    guruId: gurus.id,
  }).from(gurus).innerJoin(institutionalManagers, eq(institutionalManagers.id, gurus.managerId))
    .where(eq(gurus.active, true)).orderBy(asc(institutionalManagers.id))
  const managerIds = managerRows.map(row => row.managerId)
  const filings = managerIds.length ? await tx.select({
    managerId: institutionalFilings.managerId,
    status: institutionalFilings.status,
    accession: institutionalFilings.accession,
    filedAt: institutionalFilings.filedAt,
    id: institutionalFilings.id,
  }).from(institutionalFilings).where(and(
    inArray(institutionalFilings.managerId, managerIds),
    eq(institutionalFilings.periodEnd, periodEnd),
  )).orderBy(asc(institutionalFilings.managerId), desc(institutionalFilings.filedAt), desc(institutionalFilings.id)) : []
  const latestFiling = new Map<bigint, typeof filings[number]>()
  for (const row of filings) if (!latestFiling.has(row.managerId)) latestFiling.set(row.managerId, row)

  let currentPublications: (typeof institutionalEffectiveSnapshotPublications.$inferSelect)[] = []
  let previousPublications: (typeof institutionalEffectiveSnapshotPublications.$inferSelect)[] = []
  let states: (typeof institutionalEffectivePeriodStates.$inferSelect)[] = []
  let previousStates: (typeof institutionalEffectivePeriodStates.$inferSelect)[] = []
  let currentAnalytics: (typeof guruQuarterAnalytics.$inferSelect)[] = []
  let previousAnalytics: (typeof guruQuarterAnalytics.$inferSelect)[] = []
  if (managerIds.length) {
    currentPublications = await tx.select().from(institutionalEffectiveSnapshotPublications).where(and(eq(institutionalEffectiveSnapshotPublications.periodEnd, periodEnd), inArray(institutionalEffectiveSnapshotPublications.managerId, managerIds))).orderBy(desc(institutionalEffectiveSnapshotPublications.active), desc(institutionalEffectiveSnapshotPublications.snapshotId))
    previousPublications = await tx.select().from(institutionalEffectiveSnapshotPublications).where(and(eq(institutionalEffectiveSnapshotPublications.periodEnd, priorPeriodEnd), inArray(institutionalEffectiveSnapshotPublications.managerId, managerIds))).orderBy(desc(institutionalEffectiveSnapshotPublications.active), desc(institutionalEffectiveSnapshotPublications.snapshotId))
    states = await tx.select().from(institutionalEffectivePeriodStates).where(and(eq(institutionalEffectivePeriodStates.periodEnd, periodEnd), inArray(institutionalEffectivePeriodStates.managerId, managerIds)))
    previousStates = await tx.select().from(institutionalEffectivePeriodStates).where(and(eq(institutionalEffectivePeriodStates.periodEnd, priorPeriodEnd), inArray(institutionalEffectivePeriodStates.managerId, managerIds)))
    currentAnalytics = await tx.select().from(guruQuarterAnalytics).where(and(eq(guruQuarterAnalytics.periodEnd, periodEnd), eq(guruQuarterAnalytics.analyticsVersion, GURU_PORTFOLIO_ANALYTICS_VERSION), inArray(guruQuarterAnalytics.managerId, managerIds)))
    previousAnalytics = await tx.select().from(guruQuarterAnalytics).where(and(eq(guruQuarterAnalytics.periodEnd, priorPeriodEnd), eq(guruQuarterAnalytics.analyticsVersion, GURU_PORTFOLIO_ANALYTICS_VERSION), inArray(guruQuarterAnalytics.managerId, managerIds)))
  }

  const firstByManager = <T extends { managerId: bigint }>(rows: readonly T[]) => {
    const result = new Map<bigint, T>()
    for (const row of rows) if (!result.has(row.managerId)) result.set(row.managerId, row)
    return result
  }
  const publicationByManager = firstByManager(currentPublications)
  const previousPublicationByManager = firstByManager(previousPublications)
  const stateByManager = firstByManager(states)
  const previousStateByManager = firstByManager(previousStates)
  const analyticsByManager = firstByManager(currentAnalytics)
  const previousAnalyticsByManager = firstByManager(previousAnalytics)
  const currentReady = managerIds.flatMap(managerId => {
    const publication = publicationByManager.get(managerId)
    const analytics = analyticsByManager.get(managerId)
    const state = stateByManager.get(managerId)
    return snapshotReady({ managerId, publication, state, analytics }) ? [{ managerId, publication: publication!, analytics: analytics! }] : []
  })
  const previousReady = managerIds.flatMap(managerId => {
    const publication = previousPublicationByManager.get(managerId)
    const analytics = previousAnalyticsByManager.get(managerId)
    const state = previousStateByManager.get(managerId)
    return snapshotReady({ managerId, publication, state, analytics }) ? [{ managerId, publication: publication!, analytics: analytics! }] : []
  })
  const currentSnapshotIds = currentReady.map(row => row.publication.snapshotId)
  const previousSnapshotIds = previousReady.map(row => row.publication.snapshotId)
  const allSnapshotIds = [...new Set([...currentSnapshotIds, ...previousSnapshotIds])]
  const snapshotRows = allSnapshotIds.length ? await tx.select({ id: institutionalEffectiveSnapshots.id, snapshotHash: institutionalEffectiveSnapshots.snapshotHash })
    .from(institutionalEffectiveSnapshots).where(inArray(institutionalEffectiveSnapshots.id, allSnapshotIds)) : []
  const snapshotHashes = new Map(snapshotRows.map(row => [row.id, row.snapshotHash]))
  const effectiveRows = allSnapshotIds.length ? await tx.select({
    snapshotId: institutionalEffectiveHoldings.snapshotId,
    securityId: institutionalEffectiveHoldings.securityId,
    issuer: institutionalEffectiveHoldings.issuer,
    titleOfClass: institutionalEffectiveHoldings.titleOfClass,
    quantityType: institutionalEffectiveHoldings.quantityType,
    putCall: institutionalEffectiveHoldings.putCall,
    quantity: institutionalEffectiveHoldings.quantity,
    reportedValue: institutionalEffectiveHoldings.reportedValue,
    reportedValueUnit: institutionalEffectiveHoldings.reportedValueUnit,
    company: institutionalSecurities.issuer,
    securityType: institutionalSecurities.securityType,
    sector: institutionalSecurities.sector,
    industry: institutionalSecurities.industry,
  }).from(institutionalEffectiveHoldings).leftJoin(institutionalSecurities, eq(institutionalSecurities.id, institutionalEffectiveHoldings.securityId))
    .where(inArray(institutionalEffectiveHoldings.snapshotId, allSnapshotIds)).orderBy(asc(institutionalEffectiveHoldings.ordinal)) : []
  const securityIds = [...new Set(effectiveRows.flatMap(row => row.securityId === null ? [] : [row.securityId]))]
  const tickerRows = securityIds.length ? await tx.select({ securityId: institutionalSecurityIdentifiers.securityId, ticker: institutionalSecurityIdentifiers.value, validFrom: institutionalSecurityIdentifiers.validFrom, validTo: institutionalSecurityIdentifiers.validTo, id: institutionalSecurityIdentifiers.id })
    .from(institutionalSecurityIdentifiers).where(and(
      inArray(institutionalSecurityIdentifiers.securityId, securityIds),
      eq(institutionalSecurityIdentifiers.type, 'TICKER'),
      lte(institutionalSecurityIdentifiers.validFrom, periodEnd),
    )).orderBy(desc(institutionalSecurityIdentifiers.validFrom), desc(institutionalSecurityIdentifiers.id)) : []
  const tickerBySecurity = new Map<bigint, string>()
  for (const row of tickerRows) if ((row.validTo === null || row.validTo >= periodEnd) && !tickerBySecurity.has(row.securityId)) tickerBySecurity.set(row.securityId, row.ticker)
  const themeRows = securityIds.length ? await tx.select({ securityId: guruThemeMappings.securityId, themeKey: guruThemeMappings.themeKey, themeName: guruThemeMappings.themeName, version: guruThemeMappings.version, source: guruThemeMappings.source, sourceReference: guruThemeMappings.sourceReference })
    .from(guruThemeMappings).where(and(eq(guruThemeMappings.active, true), inArray(guruThemeMappings.securityId, securityIds)))
    .orderBy(asc(guruThemeMappings.securityId), asc(guruThemeMappings.themeKey), asc(guruThemeMappings.version)) : []
  const themesBySecurity = new Map<bigint, Array<{ key: string; name: string }>>()
  for (const row of themeRows) {
    const entries = themesBySecurity.get(row.securityId) ?? []
    entries.push({ key: row.themeKey, name: row.themeName })
    themesBySecurity.set(row.securityId, entries)
  }
  const themeMappingHash = hash(themeRows.map(row => ({ securityId: row.securityId.toString(), themeKey: row.themeKey, themeName: row.themeName, version: row.version, source: row.source, sourceReference: row.sourceReference })))

  const holdingsBySnapshot = new Map<bigint, GuruConsensusHolding[]>()
  for (const row of effectiveRows) {
    if (row.securityId === null) continue
    const values = holdingsBySnapshot.get(row.snapshotId) ?? []
    values.push({
      securityId: row.securityId.toString(), ticker: tickerBySecurity.get(row.securityId) ?? null,
      company: row.company ?? row.issuer, securityType: row.securityType ?? row.titleOfClass,
      sector: row.sector, industry: row.industry, quantityType: row.quantityType as 'SH' | 'PRN',
      putCall: row.putCall as 'PUT' | 'CALL' | null, quantity: row.quantity, reportedValue: row.reportedValue,
      reportedValueUnit: row.reportedValueUnit as 'USD' | 'THOUSANDS_USD', themes: themesBySecurity.get(row.securityId) ?? [],
    })
    holdingsBySnapshot.set(row.snapshotId, values)
  }

  const currentChangeRows = currentReady.length ? await tx.select({
    analyticsId: guruHoldingChanges.analyticsId,
    managerId: guruQuarterAnalytics.managerId,
    securityId: guruHoldingChanges.securityId,
    action: guruHoldingChanges.action,
    quantityType: guruHoldingChanges.quantityType,
    putCall: guruHoldingChanges.putCall,
    quantityChangePercent: guruHoldingChanges.quantityChangePercent,
  }).from(guruHoldingChanges).innerJoin(guruQuarterAnalytics, eq(guruQuarterAnalytics.id, guruHoldingChanges.analyticsId))
    .where(inArray(guruHoldingChanges.analyticsId, currentReady.map(row => row.analytics.id))) : []
  const securityById = new Map(effectiveRows.flatMap(row => row.securityId === null ? [] : [[row.securityId.toString(), {
    sector: row.sector,
    industry: row.industry,
    themes: themesBySecurity.get(row.securityId) ?? [],
  }] as const]))
  const changesByManager = new Map<bigint, GuruConsensusChange[]>()
  for (const row of currentChangeRows) {
    if (row.securityId === null) continue
    const securityId = row.securityId.toString()
    const metadata = securityById.get(securityId)
    const values = changesByManager.get(row.managerId) ?? []
    values.push({
      securityId, action: row.action as GuruConsensusChange['action'],
      quantityType: row.quantityType as 'SH' | 'PRN', putCall: row.putCall as 'PUT' | 'CALL' | null,
      quantityChangePercent: row.quantityChangePercent, sector: metadata?.sector ?? null,
      industry: metadata?.industry ?? null, themes: metadata?.themes ?? [],
    })
    changesByManager.set(row.managerId, values)
  }
  const filingByManager = latestFiling
  const managers: GuruConsensusManager[] = managerRows.map(({ managerId }) => {
    const current = currentReady.find(row => row.managerId === managerId)
    const previous = previousReady.find(row => row.managerId === managerId)
    const analytics = analyticsByManager.get(managerId)
    const state = stateByManager.get(managerId)
    const filing = filingByManager.get(managerId)
    const publicationStatus = publicationByManager.get(managerId)?.status === 'SUPERSEDED'
      || previousPublicationByManager.get(managerId)?.status === 'SUPERSEDED'
    let status: GuruConsensusStatus
    if (current) status = 'READY'
    else if (state?.status === 'PARTIAL' || analytics?.status === 'PARTIAL' || filing?.status === 'PARTIAL') status = 'PARTIAL'
    else if (state?.status === 'ERROR' || analytics?.status === 'ERROR' || filing?.status === 'ERROR') status = 'ERROR'
    else if (publicationStatus || filing?.status === 'SUPERSEDED') status = 'SUPERSEDED'
    else status = filingStatus(filing?.accession ? filing.status : undefined)
    return {
      managerId: managerId.toString(), status,
      sourceRowCount: analytics?.sourceRowCount ?? 0,
      mappedRowCount: analytics?.mappedRowCount ?? 0,
      comparisonStatus: current?.analytics.comparisonStatus ?? null,
      reportedPortfolioValueUsd: current?.analytics.reportedValueUsd ?? null,
      previousReportedPortfolioValueUsd: previous?.analytics.reportedValueUsd ?? null,
      holdings: current ? holdingsBySnapshot.get(current.publication.snapshotId) ?? [] : [],
      previousReady: Boolean(previous),
      previousHoldings: previous ? holdingsBySnapshot.get(previous.publication.snapshotId) ?? [] : [],
      changes: current ? changesByManager.get(managerId) ?? [] : [],
    }
  })
  const result = calculateGuruConsensusSnapshot({ periodEnd, themeMappingHash, managers })
  const inputHash = hash({
    version: result.version, periodEnd, themeMappingHash,
    managers: managers.map(manager => ({
      managerId: manager.managerId, status: manager.status, sourceRowCount: manager.sourceRowCount,
      mappedRowCount: manager.mappedRowCount, comparisonStatus: manager.comparisonStatus,
      currentSnapshotId: publicationByManager.get(BigInt(manager.managerId))?.snapshotId.toString() ?? null,
      currentSnapshotHash: currentReady.find(row => row.managerId.toString() === manager.managerId) ? snapshotHashes.get(currentReady.find(row => row.managerId.toString() === manager.managerId)!.publication.snapshotId) : null,
      currentAnalyticsHash: currentReady.find(row => row.managerId.toString() === manager.managerId)?.analytics.inputHash ?? null,
      previousSnapshotId: previousReady.find(row => row.managerId.toString() === manager.managerId)?.publication.snapshotId.toString() ?? null,
      previousSnapshotHash: previousReady.find(row => row.managerId.toString() === manager.managerId) ? snapshotHashes.get(previousReady.find(row => row.managerId.toString() === manager.managerId)!.publication.snapshotId) : null,
      previousAnalyticsHash: previousReady.find(row => row.managerId.toString() === manager.managerId)?.analytics.inputHash ?? null,
      holdings: manager.holdings, previousHoldings: manager.previousHoldings, changes: manager.changes,
    })),
  })
  const contextHash = hash({ version: result.version, periodEnd, cohort: result.cohort, stocks: result.stocks, groups: result.groups })
  const snapshotValues = {
    periodEnd, consensusVersion: GURU_CONSENSUS_VERSION, inputHash, contextHash, themeMappingHash,
    activeManagerCount: result.cohort.activeManagerCount,
    readyManagerCount: result.cohort.readyManagerCount,
    partialManagerCount: result.cohort.partialManagerCount,
    errorManagerCount: result.cohort.errorManagerCount,
    supersededManagerCount: result.cohort.supersededManagerCount,
    pendingManagerCount: result.cohort.pendingManagerCount,
    noFilingManagerCount: result.cohort.noFilingManagerCount,
    comparableManagerCount: result.cohort.comparableManagerCount,
    previousReadyManagerCount: previousReady.length,
    sourceRowCount: result.cohort.sourceRowCount,
    mappedRowCount: result.cohort.mappedRowCount,
    mappingCoveragePercent: result.cohort.mappingCoveragePercent,
    calculatedAt: now,
  }
  const [existing] = await tx.select().from(guruConsensusSnapshots).where(and(
    eq(guruConsensusSnapshots.periodEnd, periodEnd), eq(guruConsensusSnapshots.consensusVersion, GURU_CONSENSUS_VERSION),
  )).limit(1).for('update')
  if (existing?.inputHash === inputHash) return { changed: false, snapshotId: existing.id }
  const [snapshot] = existing
    ? await tx.update(guruConsensusSnapshots).set(snapshotValues).where(eq(guruConsensusSnapshots.id, existing.id)).returning()
    : await tx.insert(guruConsensusSnapshots).values(snapshotValues).returning()
  if (!snapshot) throw new Error('GURU_CONSENSUS_SNAPSHOT_PERSIST_FAILED')
  await tx.delete(guruStockConsensus).where(eq(guruStockConsensus.snapshotId, snapshot.id))
  await tx.delete(guruSectorConsensus).where(eq(guruSectorConsensus.snapshotId, snapshot.id))
  const stocks = result.stocks.map(row => ({ snapshotId: snapshot.id, securityId: BigInt(row.securityId),
    ticker: row.ticker, company: row.company, sector: row.sector, industry: row.industry,
    currentHolderCount: row.currentHolderCount, comparableCurrentHolderCount: row.comparableCurrentHolderCount,
    previousHolderCount: row.previousHolderCount, holderCountChange: row.holderCountChange,
    newBuyerCount: row.newBuyerCount, addCount: row.addCount, unchangedCount: row.unchangedCount,
    reduceCount: row.reduceCount, exitCount: row.exitCount, netBuyerCount: row.netBuyerCount,
    actionManagerCount: row.actionManagerCount, quantityChangeSampleCount: row.quantityChangeSampleCount,
    averageQuantityChangePercent: row.averageQuantityChangePercent, medianQuantityChangePercent: row.medianQuantityChangePercent,
    aggregateWeightPercent: row.aggregateWeightPercent, averagePortfolioWeightPercent: row.averagePortfolioWeightPercent,
    weightBreadthPercent: row.weightBreadthPercent, classification: row.classification, quarterTrend: row.quarterTrend,
  }))
  const sectorRows = result.groups.map(row => ({ snapshotId: snapshot.id, dimension: row.dimension,
    dimensionKey: row.dimensionKey, name: row.name, currentHolderCount: row.currentHolderCount,
    buyerCount: row.buyerCount, sellerCount: row.sellerCount, newPositionCount: row.newPositionCount,
    exitCount: row.exitCount, addCount: row.addCount, reduceCount: row.reduceCount,
    allocationManagerCount: row.allocationManagerCount, aggregateWeightPercent: row.aggregateWeightPercent,
    comparableCurrentAggregateWeightPercent: row.comparableCurrentAggregateWeightPercent,
    previousAggregateWeightPercent: row.previousAggregateWeightPercent,
    aggregateWeightChangePoints: row.aggregateWeightChangePoints,
    holderBreadthPercent: row.holderBreadthPercent, allocationCoveragePercent: row.allocationCoveragePercent,
    direction: row.direction,
  }))
  for (let offset = 0; offset < stocks.length; offset += 250) await tx.insert(guruStockConsensus).values(stocks.slice(offset, offset + 250))
  for (let offset = 0; offset < sectorRows.length; offset += 250) await tx.insert(guruSectorConsensus).values(sectorRows.slice(offset, offset + 250))
  return { changed: true, snapshotId: snapshot.id, stockCount: stocks.length, groupCount: sectorRows.length }
}

export async function runPendingGuruConsensusRebuildOnce(db: Database, now = new Date()) {
  let attemptedPeriod: string | undefined
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${CONSENSUS_REBUILD_LOCK}, 0))`)
      const [request] = await tx.select().from(guruConsensusRebuildRequests)
        .where(and(sql`${guruConsensusRebuildRequests.requestedRevision} > ${guruConsensusRebuildRequests.processedRevision}`, lte(guruConsensusRebuildRequests.nextAttemptAt, now)))
        .orderBy(asc(guruConsensusRebuildRequests.periodEnd)).limit(1).for('update')
      if (!request) return undefined
      attemptedPeriod = request.periodEnd
      const result = await rebuildPeriod(tx, request.periodEnd, now)
      await tx.update(guruConsensusRebuildRequests).set({
        processedRevision: request.requestedRevision, attemptCount: 0, nextAttemptAt: now,
        lastError: null, updatedAt: now,
      }).where(eq(guruConsensusRebuildRequests.periodEnd, request.periodEnd))
      return { periodEnd: request.periodEnd, status: 'READY' as const, ...result }
    })
  } catch {
    if (!attemptedPeriod) throw new Error('GURU_CONSENSUS_REBUILD_CLAIM_FAILED')
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${CONSENSUS_REBUILD_LOCK}, 0))`)
      const [request] = await tx.select().from(guruConsensusRebuildRequests).where(eq(guruConsensusRebuildRequests.periodEnd, attemptedPeriod!)).limit(1)
      if (!request) return
      await tx.update(guruConsensusRebuildRequests).set({
        attemptCount: request.attemptCount + 1,
        nextAttemptAt: new Date(now.getTime() + FAILURE_BACKOFF_MS),
        lastError: 'GURU_CONSENSUS_REBUILD_FAILED', updatedAt: now,
      }).where(eq(guruConsensusRebuildRequests.periodEnd, attemptedPeriod!))
    })
    return { periodEnd: attemptedPeriod, status: 'ERROR' as const }
  }
}
