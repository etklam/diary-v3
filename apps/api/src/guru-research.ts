import { and, asc, desc, eq, ilike, inArray, isNotNull, or } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import {
  guruActivityQuerySchema,
  guruActivityResponseSchema,
  guruChangesResponseSchema,
  guruFilingsResponseSchema,
  guruHistoryResponseSchema,
  guruPortfolioResponseSchema,
  guruPositionHistoryQuerySchema,
  guruPositionHistoryResponseSchema,
  guruResearchQuerySchema,
  guruResearchQuarterSchema,
  type ErrorCode,
  type GuruActivityQuery,
  type GuruResearchQuery,
} from '@diary/contracts'
import {
  guruHoldingChanges,
  guruQuarterAnalytics,
  gurus,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshotSources,
  institutionalEffectiveSnapshots,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagers,
  institutionalSecurities,
  type Database,
} from '@diary/db'
import type { AppEnv } from './app-context.js'

type Dependencies = {
  db: Database
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: import('zod').ZodError) => never
}
type AnalyticsRow = typeof guruQuarterAnalytics.$inferSelect
type FilingRow = typeof institutionalFilings.$inferSelect
type ProfileRow = typeof gurus.$inferSelect

function decimalUnits(value: string | null | undefined): bigint | null {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value)) return null
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const units = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0').slice(0, 8))
  return negative ? -units : units
}

function compareDecimal(left: string | null | undefined, right: string | null | undefined): number {
  const a = decimalUnits(left)
  const b = decimalUnits(right)
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return a === b ? 0 : a > b ? -1 : 1
}

function absoluteUnits(value: string | null | undefined): bigint {
  const units = decimalUnits(value) ?? 0n
  return units < 0n ? -units : units
}

function profile(guru: ProfileRow) {
  return {
    name: guru.name, managerName: guru.managerName, slug: guru.slug,
    description: guru.description, investmentPhilosophy: guru.investmentPhilosophy,
    styleTags: guru.styleTags, managerType: guru.managerType, website: guru.website,
    country: guru.country, imageUrl: guru.imageUrl, featured: guru.featured,
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function portfolioResult(row: AnalyticsRow | undefined) {
  return record(record(row?.result)?.portfolio)
}

function compareRank(a: number | null, b: number | null) {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return a - b
}

function actionGroup(action: string) {
  if (action === 'NEW') return 'new'
  if (action === 'ADD' || action === 'STRONG_ADD') return 'increased'
  if (action === 'REDUCE' || action === 'STRONG_REDUCE') return 'reduced'
  if (action === 'EXIT') return 'exited'
  return 'unchanged'
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  if (!/^-?\d+(?:\.\d+)?$/.test(text) && /^\s*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function csvResponse(context: Context<AppEnv>, filename: string, body: string) {
  context.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  return context.body(body, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  })
}

export function registerGuruResearchRoutes(app: Hono<AppEnv>, { db, fail, validationError }: Dependencies) {
  const publicCache = (context: Context<AppEnv>) => context.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')

  async function findGuru(slug: string) {
    return (await db.select({ guru: gurus, manager: institutionalManagers }).from(gurus)
      .innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id))
      .where(and(eq(gurus.slug, slug), eq(gurus.active, true))).limit(1))[0]
  }

  async function readPeriods(managerId: bigint) {
    const [analyticsRows, filingRows, stateRows, publicationRows] = await Promise.all([
      db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.managerId, managerId))
        .orderBy(desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.calculatedAt), desc(guruQuarterAnalytics.id)),
      db.select().from(institutionalFilings).where(and(
        eq(institutionalFilings.managerId, managerId), inArray(institutionalFilings.form, ['13F-HR', '13F-HR/A']),
      )).orderBy(desc(institutionalFilings.periodEnd), desc(institutionalFilings.filedAt), desc(institutionalFilings.id)),
      db.select().from(institutionalEffectivePeriodStates).where(eq(institutionalEffectivePeriodStates.managerId, managerId)),
      db.select().from(institutionalEffectiveSnapshotPublications).where(and(
        eq(institutionalEffectiveSnapshotPublications.managerId, managerId),
        eq(institutionalEffectiveSnapshotPublications.active, true),
        eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
      )).orderBy(desc(institutionalEffectiveSnapshotPublications.periodEnd), desc(institutionalEffectiveSnapshotPublications.snapshotId)),
    ])
    const analyticsByPeriod = new Map<string, AnalyticsRow>()
    for (const publication of publicationRows) {
      const analytics = analyticsRows.find(row => row.periodEnd === publication.periodEnd && row.snapshotId === publication.snapshotId)
      if (analytics && !analyticsByPeriod.has(publication.periodEnd)) analyticsByPeriod.set(publication.periodEnd, analytics)
    }
    const filingByPeriod = new Map<string, FilingRow>()
    for (const filing of filingRows) if (filing.periodEnd && !filingByPeriod.has(filing.periodEnd)) filingByPeriod.set(filing.periodEnd, filing)
    const stateByPeriod = new Map(stateRows.map(row => [row.periodEnd, row]))
    const publicationByPeriod = new Map(publicationRows.map(row => [row.periodEnd, row]))
    const periodEnds = [...new Set([
      ...filingByPeriod.keys(), ...analyticsRows.map(row => row.periodEnd), ...stateByPeriod.keys(), ...publicationByPeriod.keys(),
    ])].sort((a, b) => b.localeCompare(a))
    const periods = periodEnds.map(periodEnd => {
      const filing = filingByPeriod.get(periodEnd)
      const analytics = analyticsByPeriod.get(periodEnd)
      const state = stateByPeriod.get(periodEnd)
      const publication = publicationByPeriod.get(periodEnd)
      const status = state?.status === 'PARTIAL' || state?.status === 'ERROR'
        ? state.status
        : analytics?.status ?? 'PENDING'
      const ready = status === 'READY' && analytics !== undefined && publication?.snapshotId === analytics.snapshotId
      const result = portfolioResult(analytics)
      const summary = {
        periodEnd,
        filedAt: filing?.filedAt?.toISOString() ?? null,
        status: status as 'READY' | 'PARTIAL' | 'ERROR' | 'PENDING',
        reportedValueUsd: ready ? analytics!.reportedValueUsd : null,
        holdingCount: ready ? analytics!.holdingCount : null,
        topFiveConcentrationPercent: ready ? analytics!.topFiveConcentrationPercent : null,
        topTenConcentrationPercent: ready ? analytics!.topTenConcentrationPercent : null,
        hhi: ready ? analytics!.hhi : null,
        turnoverPercent: ready ? analytics!.disclosedWeightTurnoverPercent : null,
        turnoverBand: ready && ['LOW', 'MODERATE', 'HIGH'].includes(analytics!.turnoverBand ?? '') ? analytics!.turnoverBand as 'LOW' | 'MODERATE' | 'HIGH' : null,
        actionCounts: ready ? {
          new: analytics!.newCount,
          add: analytics!.addCount + analytics!.strongAddCount,
          reduce: analytics!.reduceCount + analytics!.strongReduceCount,
          exit: analytics!.exitCount,
        } : { new: 0, add: 0, reduce: 0, exit: 0 },
        largestPosition: ready && record(result?.largestPosition) ? result!.largestPosition : null,
        topHoldings: ready && Array.isArray(result?.topHoldings) ? result!.topHoldings : [],
        sectorAllocation: ready && Array.isArray(result?.sectorAllocation) ? result!.sectorAllocation : [],
        mappingCoveragePercent: analytics?.mappingCoveragePercent ?? null,
        accession: filing?.accession ?? null,
        form: filing?.form === '13F-HR' || filing?.form === '13F-HR/A' ? filing.form : null,
        sourceUrl: filing?.sourceUrl ?? null,
      }
      return guruResearchQuarterSchema.parse(summary)
    })
    return { periods, analyticsByPeriod, filingByPeriod, publicationByPeriod }
  }

  async function selectQuarter(managerId: bigint, period: string | undefined) {
    const data = await readPeriods(managerId)
    const quarter = period ? data.periods.find(row => row.periodEnd === period) : data.periods.find(row => row.status === 'READY') ?? data.periods[0]
    if (!quarter) return { ...data, quarter: undefined, analytics: undefined, filing: undefined }
    return {
      ...data,
      quarter,
      analytics: data.analyticsByPeriod.get(quarter.periodEnd!),
      filing: data.filingByPeriod.get(quarter.periodEnd!),
    }
  }

  async function holdingRows(snapshotId: bigint | undefined, analytics: AnalyticsRow | undefined, quarter: NonNullable<Awaited<ReturnType<typeof selectQuarter>>['quarter']>) {
    if (quarter.status !== 'READY' || !snapshotId || !analytics || analytics.snapshotId !== snapshotId) return []
    const changes = await db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, analytics.id))
    const securityIds = [...new Set(changes.flatMap(row => row.securityId === null ? [] : [row.securityId]))]
    const securityRows = securityIds.length ? await db.select({ id: institutionalSecurities.id, sector: institutionalSecurities.sector, industry: institutionalSecurities.industry, securityType: institutionalSecurities.securityType })
      .from(institutionalSecurities).where(inArray(institutionalSecurities.id, securityIds)) : []
    const securities = new Map(securityRows.map(row => [row.id, row]))
    const sourceSnapshotIds = [...new Set([snapshotId, analytics.previousSnapshotId].filter((id): id is bigint => id !== null))]
    const sourceRows = await db.select({
      snapshotId: institutionalEffectiveHoldings.snapshotId,
      securityId: institutionalEffectiveHoldings.securityId,
      sourceRowKey: institutionalEffectiveHoldings.sourceRowKey,
      quantityType: institutionalEffectiveHoldings.quantityType,
      putCall: institutionalEffectiveHoldings.putCall,
      accession: institutionalFilings.accession,
      sourceUrl: institutionalFilings.sourceUrl,
    }).from(institutionalEffectiveHoldings)
      .innerJoin(institutionalFilings, eq(institutionalFilings.id, institutionalEffectiveHoldings.sourceFilingId))
      .where(inArray(institutionalEffectiveHoldings.snapshotId, sourceSnapshotIds))
      .orderBy(asc(institutionalEffectiveHoldings.ordinal))
    const sources = new Map<string, Array<{ accession: string; sourceUrl: string }>>()
    for (const row of sourceRows) {
      const key = row.securityId === null
        ? `UNRESOLVED:${row.sourceRowKey}`
        : `SECURITY:${row.securityId}:${row.quantityType}:${row.putCall ?? 'NONE'}`
      const sourceKey = `${row.snapshotId}:${key}`
      const values = sources.get(sourceKey) ?? []
      if (!values.some(item => item.accession === row.accession)) values.push({ accession: row.accession, sourceUrl: row.sourceUrl })
      sources.set(sourceKey, values)
    }
    return changes.map(change => {
      const security = change.securityId === null ? undefined : securities.get(change.securityId)
      const group = actionGroup(change.action)
      return {
        positionKey: change.positionKey,
        securityId: change.securityId?.toString() ?? null,
        ticker: change.ticker,
        company: change.company,
        sector: security?.sector ?? null,
        industry: security?.industry ?? null,
        securityType: security?.securityType ?? null,
        quantityType: change.quantityType as 'SH' | 'PRN',
        putCall: change.putCall as 'PUT' | 'CALL' | null,
        action: change.action as 'NEW' | 'STRONG_ADD' | 'ADD' | 'UNCHANGED' | 'REDUCE' | 'STRONG_REDUCE' | 'EXIT',
        quantity: change.currentQuantity,
        reportedValueUsd: change.currentReportedValueUsd,
        weightPercent: change.currentWeightPercent,
        rank: change.currentRank,
        previousQuantity: change.previousQuantity,
        quantityChange: change.quantityChange,
        quantityChangePercent: change.quantityChangePercent,
        previousWeightPercent: change.previousWeightPercent,
        weightChangePercentagePoints: change.weightChangePercentagePoints,
        previousRank: change.previousRank,
        rankChange: change.rankChange,
        sources: [
          ...(analytics.previousSnapshotId ? sources.get(`${analytics.previousSnapshotId}:${change.positionKey}`) ?? [] : []),
          ...(sources.get(`${snapshotId}:${change.positionKey}`) ?? []),
        ].filter((source, index, all) => all.findIndex(item => item.accession === source.accession) === index),
        group,
      }
    })
  }

  function applyResearchFilters(rows: Awaited<ReturnType<typeof holdingRows>>, query: GuruResearchQuery) {
    const needle = query.search?.toLocaleLowerCase()
    return rows.filter(row => {
      if (needle && !`${row.ticker ?? ''} ${row.company}`.toLocaleLowerCase().includes(needle)) return false
      if (query.sector && row.sector?.toLocaleLowerCase() !== query.sector.toLocaleLowerCase()) return false
      if (query.securityType && row.securityType?.toLocaleLowerCase() !== query.securityType.toLocaleLowerCase()) return false
      if (query.quantityType && row.quantityType !== query.quantityType) return false
      if (query.action && row.action !== query.action) return false
      if (query.newOnly === 'true' && row.action !== 'NEW') return false
      if (query.increasedOnly === 'true' && row.group !== 'increased') return false
      if (query.reducedOnly === 'true' && row.group !== 'reduced') return false
      return true
    }).sort((left, right) => {
      if (query.sort === 'weight') return compareDecimal(right.weightPercent, left.weightPercent) || left.positionKey.localeCompare(right.positionKey)
      if (query.sort === 'value') return compareDecimal(right.reportedValueUsd, left.reportedValueUsd) || left.positionKey.localeCompare(right.positionKey)
      if (query.sort === 'change') return compareDecimal(right.quantityChangePercent, left.quantityChangePercent) || left.positionKey.localeCompare(right.positionKey)
      return compareRank(left.rank, right.rank) || left.positionKey.localeCompare(right.positionKey)
    })
  }

  /** The grouping key is an internal sort aid; it never reaches the API body. */
  function publicHolding({ group: _group, ...holding }: Awaited<ReturnType<typeof holdingRows>>[number]) {
    return holding
  }

  async function portfolio(slug: string, query: GuruResearchQuery) {
    const found = await findGuru(slug)
    if (!found) return undefined
    const selected = await selectQuarter(found.guru.managerId, query.period)
    if (!selected.quarter) return { found, selected, rows: [] as Awaited<ReturnType<typeof holdingRows>> }
    const snapshotId = selected.publicationByPeriod.get(selected.quarter.periodEnd!)?.snapshotId
    const rows = await holdingRows(snapshotId, selected.analytics, selected.quarter)
    return { found, selected, rows: applyResearchFilters(rows, query) }
  }

  app.get('/api/gurus/:slug/portfolio', async context => {
    const parsed = guruResearchQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    publicCache(context)
    const result = await portfolio(context.req.param('slug'), parsed.data)
    if (!result) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    return context.json(guruPortfolioResponseSchema.parse({ data: {
      profile: profile(result.found.guru),
      quarter: result.selected.quarter ?? { periodEnd: null, filedAt: null, status: 'PENDING', reportedValueUsd: null, holdingCount: null, topFiveConcentrationPercent: null, topTenConcentrationPercent: null, hhi: null, turnoverPercent: null, turnoverBand: null, actionCounts: { new: 0, add: 0, reduce: 0, exit: 0 }, largestPosition: null, topHoldings: [], sectorAllocation: [], mappingCoveragePercent: null, accession: null, form: null, sourceUrl: null },
      periods: result.selected.periods,
      holdings: result.rows.filter(row => row.quantity !== null && row.reportedValueUsd !== null).map(publicHolding),
    } }))
  })

  app.get('/api/gurus/:slug/changes', async context => {
    const parsed = guruResearchQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    publicCache(context)
    const result = await portfolio(context.req.param('slug'), parsed.data)
    if (!result) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const changes = result.rows.filter(row => row.action !== 'UNCHANGED')
    const byGroup = (group: string) => changes.filter(row => row.group === group)
    const largestWeightChanges = [...changes].sort((a, b) => {
      const left = absoluteUnits(a.weightChangePercentagePoints)
      const right = absoluteUnits(b.weightChangePercentagePoints)
      return left === right ? a.positionKey.localeCompare(b.positionKey) : right > left ? 1 : -1
    }).slice(0, 20)
    const largestRankChanges = [...changes].filter(row => row.rankChange !== null).sort((a, b) => Math.abs(b.rankChange!) - Math.abs(a.rankChange!) || a.positionKey.localeCompare(b.positionKey)).slice(0, 20)
    return context.json(guruChangesResponseSchema.parse({ data: {
      profile: profile(result.found.guru),
      quarter: result.selected.quarter ?? { periodEnd: null, filedAt: null, status: 'PENDING', reportedValueUsd: null, holdingCount: null, topFiveConcentrationPercent: null, topTenConcentrationPercent: null, hhi: null, turnoverPercent: null, turnoverBand: null, actionCounts: { new: 0, add: 0, reduce: 0, exit: 0 }, largestPosition: null, topHoldings: [], sectorAllocation: [], mappingCoveragePercent: null, accession: null, form: null, sourceUrl: null },
      periods: result.selected.periods,
      newPositions: byGroup('new').map(publicHolding), increasedPositions: byGroup('increased').map(publicHolding), reducedPositions: byGroup('reduced').map(publicHolding), exitedPositions: byGroup('exited').map(publicHolding),
      largestWeightChanges: largestWeightChanges.map(publicHolding), largestRankChanges: largestRankChanges.map(publicHolding),
    } }))
  })

  app.get('/api/gurus/:slug/history', async context => {
    publicCache(context)
    const found = await findGuru(context.req.param('slug'))
    if (!found) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const { periods } = await readPeriods(found.guru.managerId)
    return context.json(guruHistoryResponseSchema.parse({ data: { profile: profile(found.guru), periods } }))
  })

  async function positionHistory(slug: string, positionKey: string) {
    const found = await findGuru(slug)
    if (!found) return undefined
    const [analyticsRows, publications, states] = await Promise.all([
      db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.managerId, found.guru.managerId))
        .orderBy(desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.calculatedAt)),
      db.select().from(institutionalEffectiveSnapshotPublications).where(and(
        eq(institutionalEffectiveSnapshotPublications.managerId, found.guru.managerId),
        eq(institutionalEffectiveSnapshotPublications.active, true), eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
      )),
      db.select().from(institutionalEffectivePeriodStates).where(and(
        eq(institutionalEffectivePeriodStates.managerId, found.guru.managerId), eq(institutionalEffectivePeriodStates.status, 'READY'),
      )),
    ])
    const publicationBySnapshot = new Map(publications.map(row => [row.snapshotId, row]))
    const readyPeriods = new Set(states.map(row => row.periodEnd))
    const analyticsById = new Map(analyticsRows.filter(row => row.status === 'READY'
      && publicationBySnapshot.get(row.snapshotId)?.periodEnd === row.periodEnd && readyPeriods.has(row.periodEnd)).map(row => [row.id, row]))
    const changes = analyticsById.size ? await db.select({ change: guruHoldingChanges }).from(guruHoldingChanges)
      .innerJoin(guruQuarterAnalytics, eq(guruQuarterAnalytics.id, guruHoldingChanges.analyticsId))
      .where(and(inArray(guruHoldingChanges.analyticsId, [...analyticsById.keys()]), eq(guruHoldingChanges.positionKey, positionKey)))
      .orderBy(desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.id)) : []
    if (changes.length === 0) return { found, row: undefined, history: [] }
    const snapshotIds = [...new Set(changes.flatMap(({ change }) => {
      const analytics = analyticsById.get(change.analyticsId)
      return analytics ? [analytics.snapshotId, ...(analytics.previousSnapshotId ? [analytics.previousSnapshotId] : [])] : []
    }))]
    const sourceRows = snapshotIds.length ? await db.select({
      snapshotId: institutionalEffectiveHoldings.snapshotId,
      sourceRowKey: institutionalEffectiveHoldings.sourceRowKey,
      securityId: institutionalEffectiveHoldings.securityId,
      quantityType: institutionalEffectiveHoldings.quantityType,
      putCall: institutionalEffectiveHoldings.putCall,
      accession: institutionalFilings.accession,
      sourceUrl: institutionalFilings.sourceUrl,
    }).from(institutionalEffectiveHoldings)
      .innerJoin(institutionalFilings, eq(institutionalFilings.id, institutionalEffectiveHoldings.sourceFilingId))
      .where(inArray(institutionalEffectiveHoldings.snapshotId, snapshotIds))
      .orderBy(asc(institutionalEffectiveHoldings.ordinal)) : []
    const sourcesByPosition = new Map<string, Array<{ accession: string; sourceUrl: string }>>()
    for (const source of sourceRows) {
      const key = source.securityId === null
        ? `UNRESOLVED:${source.sourceRowKey}`
        : `SECURITY:${source.securityId}:${source.quantityType}:${source.putCall ?? 'NONE'}`
      const bucketKey = `${source.snapshotId}:${key}`
      const values = sourcesByPosition.get(bucketKey) ?? []
      if (!values.some(item => item.accession === source.accession)) values.push({ accession: source.accession, sourceUrl: source.sourceUrl })
      sourcesByPosition.set(bucketKey, values)
    }
    const first = changes[0]!.change
    const history = []
    for (const { change } of changes) {
      const analytics = analyticsById.get(change.analyticsId)
      if (!analytics) continue
      const key = change.securityId === null
        ? change.positionKey
        : `SECURITY:${change.securityId}:${change.quantityType}:${change.putCall ?? 'NONE'}`
      const sources = [
        ...(analytics.previousSnapshotId ? sourcesByPosition.get(`${analytics.previousSnapshotId}:${key}`) ?? [] : []),
        ...(sourcesByPosition.get(`${analytics.snapshotId}:${key}`) ?? []),
      ].filter((source, index, all) => all.findIndex(item => item.accession === source.accession) === index)
      history.push({
        periodEnd: analytics.periodEnd, action: change.action,
        quantity: change.currentQuantity, reportedValueUsd: change.currentReportedValueUsd,
        weightPercent: change.currentWeightPercent, rank: change.currentRank,
        source: sources,
      })
    }
    return { found, row: first, history }
  }

  app.get('/api/gurus/:slug/position-history', async context => {
    const parsed = guruPositionHistoryQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    publicCache(context)
    const result = await positionHistory(context.req.param('slug'), parsed.data.positionKey)
    if (!result) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    if (!result.row) return fail(404, 'GURU_NOT_FOUND', 'Position history not found')
    return context.json(guruPositionHistoryResponseSchema.parse({ data: {
      profile: profile(result.found.guru), positionKey: parsed.data.positionKey,
      ticker: result.row.ticker, company: result.row.company, history: result.history,
    } }))
  })

  app.get('/api/gurus/:slug/filings', async context => {
    publicCache(context)
    const found = await findGuru(context.req.param('slug'))
    if (!found) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const rows = await db.select().from(institutionalFilings).where(and(
      eq(institutionalFilings.managerId, found.guru.managerId), inArray(institutionalFilings.form, ['13F-HR', '13F-HR/A']),
    )).orderBy(desc(institutionalFilings.periodEnd), desc(institutionalFilings.filedAt), desc(institutionalFilings.id))
    const filingIds = rows.map(row => row.id)
    const documents = filingIds.length ? await db.select().from(institutionalFilingDocuments).where(inArray(institutionalFilingDocuments.filingId, filingIds)) : []
    const snapshotRows = await db.select({
      filingId: institutionalEffectiveSnapshotSources.filingId,
      operation: institutionalEffectiveSnapshotSources.operation,
      parserVersion: institutionalEffectiveSnapshotSources.parserVersion,
    }).from(institutionalEffectiveSnapshotSources)
      .innerJoin(institutionalEffectiveSnapshots, eq(institutionalEffectiveSnapshots.id, institutionalEffectiveSnapshotSources.snapshotId))
      .where(eq(institutionalEffectiveSnapshots.managerId, found.guru.managerId))
    const byDocument = new Map<bigint, typeof documents>()
    for (const document of documents) byDocument.set(document.filingId, [...(byDocument.get(document.filingId) ?? []), document])
    return context.json(guruFilingsResponseSchema.parse({ data: {
      profile: profile(found.guru),
      filings: rows.map(filing => ({
        accession: filing.accession, periodEnd: filing.periodEnd, form: filing.form,
        filingDate: filing.filingDate, filedAt: filing.filedAt?.toISOString() ?? null, status: filing.status,
        amendmentNumber: filing.amendmentNumber, amendmentType: filing.amendmentType,
        parserVersion: filing.parserVersion, mappingCoveragePercent: filing.mappingCoverage,
        sourceUrl: filing.sourceUrl,
        documents: (byDocument.get(filing.id) ?? []).map(document => ({ basename: document.basename, documentType: document.documentType, description: document.description, sourceUrl: document.sourceUrl })),
        effectiveOperations: snapshotRows.filter(source => source.filingId === filing.id).map(source => ({ operation: source.operation, parserVersion: source.parserVersion })),
      })),
    } }))
  })

  app.get('/api/gurus/activity', async context => {
    const parsed = guruActivityQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    publicCache(context)
    const query: GuruActivityQuery = parsed.data
    const profiles = await db.select({ guru: gurus, managerId: institutionalManagers.id })
      .from(gurus).innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id)).where(eq(gurus.active, true))
    if (profiles.length === 0) return context.json(guruActivityResponseSchema.parse({ data: { items: [], pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } } }))
    const matchingProfiles = query.guru ? profiles.filter(row => row.guru.slug === query.guru) : profiles
    const managerIds = matchingProfiles.map(row => row.managerId)
    if (managerIds.length === 0) return context.json(guruActivityResponseSchema.parse({ data: { items: [], pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } } }))
    const latestFiledPeriods = query.period ? [] : await db.selectDistinctOn([institutionalFilings.managerId], {
      managerId: institutionalFilings.managerId, periodEnd: institutionalFilings.periodEnd,
    }).from(institutionalFilings).where(and(
      inArray(institutionalFilings.managerId, managerIds), inArray(institutionalFilings.form, ['13F-HR', '13F-HR/A']),
      isNotNull(institutionalFilings.periodEnd),
    )).orderBy(institutionalFilings.managerId, desc(institutionalFilings.periodEnd), desc(institutionalFilings.filedAt), desc(institutionalFilings.id))
    const periodsForRead = query.period ? [] : latestFiledPeriods.flatMap(row => row.periodEnd ? [and(
      eq(guruQuarterAnalytics.managerId, row.managerId), eq(guruQuarterAnalytics.periodEnd, row.periodEnd),
    )!] : [])
    if (!query.period && periodsForRead.length === 0) return context.json(guruActivityResponseSchema.parse({ data: { items: [], pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } } }))
    const analyticsRows = await db.select({ analytics: guruQuarterAnalytics })
      .from(guruQuarterAnalytics).innerJoin(institutionalEffectiveSnapshotPublications, and(
        eq(institutionalEffectiveSnapshotPublications.snapshotId, guruQuarterAnalytics.snapshotId),
        eq(institutionalEffectiveSnapshotPublications.active, true), eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
      )).innerJoin(institutionalEffectivePeriodStates, and(
        eq(institutionalEffectivePeriodStates.managerId, guruQuarterAnalytics.managerId),
        eq(institutionalEffectivePeriodStates.periodEnd, guruQuarterAnalytics.periodEnd),
        eq(institutionalEffectivePeriodStates.status, 'READY'),
      )).where(and(
        inArray(guruQuarterAnalytics.managerId, managerIds), eq(guruQuarterAnalytics.status, 'READY'),
        query.period ? eq(guruQuarterAnalytics.periodEnd, query.period) : or(...periodsForRead),
      )).orderBy(guruQuarterAnalytics.managerId, desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.id))
    const analyticsByManager = new Map<bigint, AnalyticsRow>()
    for (const row of analyticsRows) if (!analyticsByManager.has(row.analytics.managerId)) analyticsByManager.set(row.analytics.managerId, row.analytics)
    const selectedAnalytics = [...analyticsByManager.values()]
    const analyticsIds = selectedAnalytics.map(row => row.id)
    const changes = analyticsIds.length ? await db.select({ change: guruHoldingChanges, managerId: guruQuarterAnalytics.managerId, periodEnd: guruQuarterAnalytics.periodEnd })
      .from(guruHoldingChanges).innerJoin(guruQuarterAnalytics, eq(guruQuarterAnalytics.id, guruHoldingChanges.analyticsId))
      .where(and(
        inArray(guruHoldingChanges.analyticsId, analyticsIds),
        query.action ? eq(guruHoldingChanges.action, query.action) : undefined,
        query.symbol ? ilike(guruHoldingChanges.ticker, query.symbol) : undefined,
      )) : []
    const securityIds = [...new Set(changes.flatMap(row => row.change.securityId === null ? [] : [row.change.securityId]))]
    const securities = securityIds.length ? await db.select({ id: institutionalSecurities.id, sector: institutionalSecurities.sector }).from(institutionalSecurities).where(inArray(institutionalSecurities.id, securityIds)) : []
    const sectors = new Map(securities.map(row => [row.id, row.sector]))
    const profileByManager = new Map(matchingProfiles.map(row => [row.managerId, row.guru]))
    const activitySourceRows = selectedAnalytics.length ? await db.select({
      managerId: institutionalEffectiveSnapshots.managerId,
      periodEnd: institutionalEffectiveSnapshots.periodEnd,
      accession: institutionalFilings.accession,
      sourceUrl: institutionalFilings.sourceUrl,
    }).from(institutionalEffectiveSnapshotSources)
      .innerJoin(institutionalEffectiveSnapshots, eq(institutionalEffectiveSnapshots.id, institutionalEffectiveSnapshotSources.snapshotId))
      .innerJoin(institutionalFilings, eq(institutionalFilings.id, institutionalEffectiveSnapshotSources.filingId))
      .where(inArray(institutionalEffectiveSnapshotSources.snapshotId, selectedAnalytics.map(row => row.snapshotId)))
      .orderBy(asc(institutionalEffectiveSnapshots.periodEnd), asc(institutionalEffectiveSnapshotSources.ordinal)) : []
    const activitySourcesByPeriod = new Map<string, Array<{ accession: string; sourceUrl: string }>>()
    for (const source of activitySourceRows) {
      const key = `${source.managerId}:${source.periodEnd}`
      const values = activitySourcesByPeriod.get(key) ?? []
      if (!values.some(item => item.accession === source.accession)) values.push({ accession: source.accession, sourceUrl: source.sourceUrl })
      activitySourcesByPeriod.set(key, values)
    }
    const minWeightUnits = decimalUnits(query.minWeight)
    const minChangeUnits = decimalUnits(query.minChangePercent)
    const items = changes.flatMap(({ change, managerId, periodEnd }) => {
      const guru = profileByManager.get(managerId)
      if (!guru || change.action === 'UNCHANGED') return []
      const sector = change.securityId === null ? null : sectors.get(change.securityId) ?? null
      const weight = change.currentWeightPercent ?? change.previousWeightPercent
      const weightUnits = decimalUnits(weight)
      const changeUnits = decimalUnits(change.quantityChangePercent)
      if (query.sector && sector?.toLocaleLowerCase() !== query.sector.toLocaleLowerCase()) return []
      if (minWeightUnits !== null && (weightUnits === null || weightUnits < minWeightUnits)) return []
      if (minChangeUnits !== null && (changeUnits === null || (changeUnits < 0n ? -changeUnits : changeUnits) < minChangeUnits)) return []
      return [{
        guru: profile(guru), periodEnd, ticker: change.ticker, company: change.company, sector,
        action: change.action, quantityChangePercent: change.quantityChangePercent,
        currentWeightPercent: change.currentWeightPercent, previousWeightPercent: change.previousWeightPercent,
        source: activitySourcesByPeriod.get(`${managerId}:${periodEnd}`) ?? [],
      }]
    }).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || a.guru.name.localeCompare(b.guru.name) || a.company.localeCompare(b.company))
    const total = items.length
    const offset = (query.page - 1) * query.limit
    return context.json(guruActivityResponseSchema.parse({ data: {
      items: items.slice(offset, offset + query.limit),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    } }))
  })

  app.get('/api/gurus/:slug/portfolio.csv', async context => {
    const parsed = guruResearchQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const result = await portfolio(context.req.param('slug'), parsed.data)
    if (!result) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const headers = ['ticker', 'company', 'sector', 'security_type', 'quantity_type', 'put_call', 'action', 'shares', 'reported_value_usd', 'weight_percent', 'rank', 'quantity_change_percent', 'reported_period', 'accession', 'source_url']
    return csvResponse(context, `${result.found.guru.slug}-${result.selected.quarter?.periodEnd ?? 'unknown'}-portfolio.csv`, toCsv([
      headers,
      ...result.rows.filter(row => row.quantity !== null && row.reportedValueUsd !== null).map(row => [
        row.ticker, row.company, row.sector, row.securityType, row.quantityType, row.putCall, row.action,
        row.quantity, row.reportedValueUsd, row.weightPercent, row.rank, row.quantityChangePercent,
        result.selected.quarter?.periodEnd, row.sources.map(source => source.accession).join('|'), row.sources.map(source => source.sourceUrl).join('|'),
      ]),
    ]))
  })

  app.get('/api/gurus/:slug/changes.csv', async context => {
    const parsed = guruResearchQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const result = await portfolio(context.req.param('slug'), parsed.data)
    if (!result) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const rows = result.rows.filter(row => row.action !== 'UNCHANGED')
    return csvResponse(context, `${result.found.guru.slug}-${result.selected.quarter?.periodEnd ?? 'unknown'}-changes.csv`, toCsv([
      ['ticker', 'company', 'action', 'previous_shares', 'current_shares', 'share_change_percent', 'previous_weight_percent', 'current_weight_percent', 'weight_change_percentage_points', 'previous_rank', 'current_rank', 'reported_period', 'accession', 'source_url'],
      ...rows.map(row => [row.ticker, row.company, row.action, row.previousQuantity, row.quantity, row.quantityChangePercent, row.previousWeightPercent, row.weightPercent, row.weightChangePercentagePoints, row.previousRank, row.rank, result.selected.quarter?.periodEnd, row.sources.map(source => source.accession).join('|'), row.sources.map(source => source.sourceUrl).join('|')]),
    ]))
  })

  app.get('/api/gurus/:slug/position-history.csv', async context => {
    const parsed = guruPositionHistoryQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const result = await positionHistory(context.req.param('slug'), parsed.data.positionKey)
    if (!result) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    if (!result.row) return fail(404, 'GURU_NOT_FOUND', 'Position history not found')
    return csvResponse(context, `${result.found.guru.slug}-position-history.csv`, toCsv([
      ['period_end', 'ticker', 'company', 'action', 'shares', 'reported_value_usd', 'weight_percent', 'rank', 'accession', 'source_url'],
      ...result.history.flatMap(row => row.source.length ? row.source.map(source => [row.periodEnd, result.row!.ticker, result.row!.company, row.action, row.quantity, row.reportedValueUsd, row.weightPercent, row.rank, source.accession, source.sourceUrl]) : [[row.periodEnd, result.row!.ticker, result.row!.company, row.action, row.quantity, row.reportedValueUsd, row.weightPercent, row.rank, '', '']]),
    ]))
  })
}
