import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import {
  guruComparisonQuerySchema,
  guruComparisonResponseSchema,
  stockGuruResearchQuerySchema,
  stockGuruResearchResponseSchema,
  type ErrorCode,
} from '@diary/contracts'
import { GURU_PORTFOLIO_ANALYTICS_VERSION } from '@diary/domain/guru-portfolio-analytics'
import {
  guruConsensusRebuildRequests,
  guruConsensusSnapshots,
  guruHoldingChanges,
  guruQuarterAnalytics,
  guruStockConsensus,
  gurus,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshotSources,
  institutionalFilings,
  institutionalManagers,
  institutionalSecurities,
  institutionalSecurityIdentifiers,
  type Database,
} from '@diary/db'
import type { AppEnv } from './app-context.js'

type Dependencies = {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: import('zod').ZodError) => never
}

const SCALE = 100_000_000n
const ACTION_BUY = new Set(['NEW', 'ADD', 'STRONG_ADD'])
const ACTION_SELL = new Set(['REDUCE', 'STRONG_REDUCE', 'EXIT'])

function units(value: string | null | undefined): bigint {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return 0n
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const result = BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0').slice(0, 8))
  return negative ? -result : result
}

function decimal(value: bigint): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const fraction = (absolute % SCALE).toString().padStart(8, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${absolute / SCALE}${fraction ? `.${fraction}` : ''}`
}

function percent(numerator: bigint, denominator: bigint): string | null {
  if (denominator <= 0n) return null
  const value = (numerator * 100n * SCALE + (numerator >= 0n ? denominator / 2n : -denominator / 2n)) / denominator
  return decimal(value)
}

function usd(value: string, unit: string): bigint {
  const amount = units(value)
  return unit === 'THOUSANDS_USD' ? amount * 1_000n : amount
}

function positionKey(securityId: string, quantityType: string, putCall: string | null) {
  return `SECURITY:${securityId}:${quantityType}:${putCall ?? 'NONE'}`
}

function profile(row: typeof gurus.$inferSelect) {
  return {
    name: row.name, managerName: row.managerName, slug: row.slug,
    description: row.description, investmentPhilosophy: row.investmentPhilosophy,
    styleTags: row.styleTags, managerType: row.managerType, website: row.website,
    country: row.country, imageUrl: row.imageUrl, featured: row.featured,
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function allocations(analytics: typeof guruQuarterAnalytics.$inferSelect | undefined) {
  const portfolio = record(record(analytics?.result)?.portfolio)
  if (!Array.isArray(portfolio?.sectorAllocation)) return []
  return portfolio.sectorAllocation.flatMap(value => {
    const item = record(value)
    return item && typeof item.name === 'string' && typeof item.weightPercent === 'string'
      ? [{ name: item.name, weightPercent: item.weightPercent }]
      : []
  })
}

function exposureKey(securityId: bigint, quantityType: string, putCall: string | null) {
  return positionKey(securityId.toString(), quantityType, putCall)
}

function actionCounts(analytics: typeof guruQuarterAnalytics.$inferSelect | undefined) {
  return analytics ? {
    new: analytics.newCount,
    add: analytics.addCount + analytics.strongAddCount,
    reduce: analytics.reduceCount + analytics.strongReduceCount,
    exit: analytics.exitCount,
  } : { new: 0, add: 0, reduce: 0, exit: 0 }
}

export function registerGuruComparisonRoutes(app: Hono<AppEnv>, { db, now, fail, validationError }: Dependencies) {
  const cached = (context: Context<AppEnv>) => context.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')

  app.get('/api/gurus/compare', async context => {
    const parsed = guruComparisonQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const slugs = parsed.data.slugs.split(',').map(value => value.trim())
    const selectedProfilesRows = await db.select({ guru: gurus, manager: institutionalManagers })
      .from(gurus).innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id))
      .where(and(inArray(gurus.slug, slugs), eq(gurus.active, true)))
    if (selectedProfilesRows.length !== slugs.length) return fail(404, 'GURU_NOT_FOUND', 'One or more active Gurus were not found')
    const profileBySlug = new Map(selectedProfilesRows.map(row => [row.guru.slug, row]))
    const selectedProfiles = slugs.flatMap(slug => profileBySlug.has(slug) ? [profileBySlug.get(slug)!] : [])
    const managerIds = selectedProfiles.map(row => row.manager.id)
    const [periodStates, publications, analyticsRows, filings, consensusPeriods] = await Promise.all([
      db.select().from(institutionalEffectivePeriodStates).where(inArray(institutionalEffectivePeriodStates.managerId, managerIds)),
      db.select().from(institutionalEffectiveSnapshotPublications).where(inArray(institutionalEffectiveSnapshotPublications.managerId, managerIds)),
      db.select().from(guruQuarterAnalytics).where(and(
        inArray(guruQuarterAnalytics.managerId, managerIds),
        eq(guruQuarterAnalytics.analyticsVersion, GURU_PORTFOLIO_ANALYTICS_VERSION),
      )).orderBy(desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.calculatedAt)),
      db.select().from(institutionalFilings).where(and(
        inArray(institutionalFilings.managerId, managerIds), inArray(institutionalFilings.form, ['13F-HR', '13F-HR/A']),
      )).orderBy(desc(institutionalFilings.filedAt), desc(institutionalFilings.id)),
      db.select({ periodEnd: guruConsensusSnapshots.periodEnd }).from(guruConsensusSnapshots).orderBy(desc(guruConsensusSnapshots.periodEnd)),
    ])
    const periods = [...new Set([
      ...consensusPeriods.map(row => row.periodEnd), ...periodStates.map(row => row.periodEnd),
      ...publications.map(row => row.periodEnd), ...analyticsRows.map(row => row.periodEnd),
      ...filings.flatMap(row => row.periodEnd ? [row.periodEnd] : []),
    ])].sort((a, b) => b.localeCompare(a))
    const stateFor = (managerId: bigint, periodEnd: string) => periodStates.find(row => row.managerId === managerId && row.periodEnd === periodEnd)
    const publicationFor = (managerId: bigint, periodEnd: string) => publications.find(row => row.managerId === managerId && row.periodEnd === periodEnd && row.active && row.status === 'READY')
    const filingFor = (managerId: bigint, periodEnd: string) => filings.find(row => row.managerId === managerId && row.periodEnd === periodEnd)
    const analyticsFor = (managerId: bigint, periodEnd: string, snapshotId?: bigint) => analyticsRows.find(row =>
      row.managerId === managerId && row.periodEnd === periodEnd && (snapshotId === undefined || row.snapshotId === snapshotId),
    )
    const quality = (managerId: bigint, periodEnd: string) => {
      const state = stateFor(managerId, periodEnd)
      const publication = publicationFor(managerId, periodEnd)
      const analytics = publication ? analyticsFor(managerId, periodEnd, publication.snapshotId) : undefined
      if (publication && state?.status === 'READY' && analytics?.status === 'READY') return { status: 'READY' as const, publication, analytics }
      if (state?.status === 'PARTIAL') return { status: 'PARTIAL' as const, publication, analytics }
      if (state?.status === 'ERROR' || analytics?.status === 'ERROR') return { status: 'ERROR' as const, publication, analytics }
      if (publications.some(row => row.managerId === managerId && row.periodEnd === periodEnd && row.status === 'SUPERSEDED')) return { status: 'SUPERSEDED' as const, publication, analytics }
      if (!filingFor(managerId, periodEnd) && !state) return { status: 'NO_FILING' as const, publication, analytics }
      return { status: 'PENDING' as const, publication, analytics }
    }
    const periodEnd = parsed.data.period ?? periods.find(period => selectedProfiles.every(row => quality(row.manager.id, period).status === 'READY')) ?? periods[0] ?? null
    const statuses = periodEnd ? selectedProfiles.map(row => ({ row, state: quality(row.manager.id, periodEnd) })) : selectedProfiles.map(row => ({ row, state: { status: 'NO_FILING' as const, publication: undefined, analytics: undefined } }))
    const ready = statuses.filter(item => item.state.status === 'READY' && item.state.publication && item.state.analytics)
    const snapshotIds = ready.flatMap(item => item.state.publication ? [item.state.publication.snapshotId] : [])
    const analyticsIds = ready.flatMap(item => item.state.analytics ? [item.state.analytics.id] : [])
    const [holdingRows, changeRows, sourceRows] = await Promise.all([
      snapshotIds.length ? db.select({ holding: institutionalEffectiveHoldings, security: institutionalSecurities })
        .from(institutionalEffectiveHoldings).leftJoin(institutionalSecurities, eq(institutionalSecurities.id, institutionalEffectiveHoldings.securityId))
        .where(inArray(institutionalEffectiveHoldings.snapshotId, snapshotIds)).orderBy(asc(institutionalEffectiveHoldings.ordinal)) : [],
      analyticsIds.length ? db.select().from(guruHoldingChanges).where(inArray(guruHoldingChanges.analyticsId, analyticsIds)) : [],
      snapshotIds.length ? db.select({ snapshotId: institutionalEffectiveSnapshotSources.snapshotId, accession: institutionalFilings.accession, form: institutionalFilings.form, filedAt: institutionalFilings.filedAt, sourceUrl: institutionalFilings.sourceUrl })
        .from(institutionalEffectiveSnapshotSources).innerJoin(institutionalFilings, eq(institutionalFilings.id, institutionalEffectiveSnapshotSources.filingId))
        .where(inArray(institutionalEffectiveSnapshotSources.snapshotId, snapshotIds)).orderBy(desc(institutionalEffectiveSnapshotSources.ordinal)) : [],
    ])
    const securityIds = [...new Set([
      ...holdingRows.flatMap(row => row.holding.securityId ? [row.holding.securityId] : []),
      ...changeRows.flatMap(row => row.securityId ? [row.securityId] : []),
    ])]
    const [securityRows, tickerRows] = await Promise.all([
      securityIds.length ? db.select({ id: institutionalSecurities.id, issuer: institutionalSecurities.issuer, securityType: institutionalSecurities.securityType })
        .from(institutionalSecurities).where(inArray(institutionalSecurities.id, securityIds)) : [],
      periodEnd && securityIds.length ? db.select({ securityId: institutionalSecurityIdentifiers.securityId, value: institutionalSecurityIdentifiers.value })
        .from(institutionalSecurityIdentifiers).where(and(
          eq(institutionalSecurityIdentifiers.type, 'TICKER'), lte(institutionalSecurityIdentifiers.validFrom, periodEnd),
          inArray(institutionalSecurityIdentifiers.securityId, securityIds),
          or(isNull(institutionalSecurityIdentifiers.validTo), gte(institutionalSecurityIdentifiers.validTo, periodEnd)),
        )) : [],
    ])
    const securityMap = new Map(securityRows.map(row => [row.id, row]))
    const tickersBySecurity = new Map<bigint, Set<string>>()
    for (const row of tickerRows) tickersBySecurity.set(row.securityId, (tickersBySecurity.get(row.securityId) ?? new Set()).add(row.value))
    const tickerFor = (securityId: bigint | null) => {
      if (securityId === null) return null
      const tickers = tickersBySecurity.get(securityId)
      return tickers?.size === 1 ? [...tickers][0]! : null
    }
    const sourceBySnapshot = new Map<bigint, typeof sourceRows[number]>()
    for (const row of sourceRows) if (!sourceBySnapshot.has(row.snapshotId)) sourceBySnapshot.set(row.snapshotId, row)
    const changesByAnalyticsPosition = new Map<string, typeof changeRows[number]>()
    for (const row of changeRows) if (row.securityId !== null) changesByAnalyticsPosition.set(`${row.analyticsId}:${exposureKey(row.securityId, row.quantityType, row.putCall)}`, row)
    type HoldingAggregate = {
      key: string; securityId: string; ticker: string | null; company: string; securityType: string | null
      quantityType: 'SH' | 'PRN'; putCall: 'PUT' | 'CALL' | null; heldBy: Map<string, {
        slug: string; name: string; action: string | null; quantity: bigint; previousQuantity: string | null
        value: bigint; weight: string | null; previousWeight: string | null; rank: number | null
      }>
    }
    const aggregate = new Map<string, HoldingAggregate>()
    for (const { row, state } of ready) {
      const snapshotId = state.publication!.snapshotId
      const analytics = state.analytics!
      const managerKey = row.guru.slug
      const perManager = new Map<string, { holding: typeof holdingRows[number]['holding']; quantity: bigint; value: bigint; company: string; ticker: string | null; securityType: string | null }>()
      for (const { holding, security } of holdingRows) {
        if (holding.snapshotId !== snapshotId) continue
        const mappedId = holding.securityId
        const stable = mappedId === null ? `UNRESOLVED:${managerKey}:${holding.sourceRowKey}` : exposureKey(mappedId, holding.quantityType, holding.putCall)
        const existing = perManager.get(stable)
        const value = usd(holding.reportedValue, holding.reportedValueUnit)
        if (existing) { existing.quantity += units(holding.quantity); existing.value += value; continue }
        perManager.set(stable, {
          holding, quantity: units(holding.quantity), value,
          company: security?.issuer ?? holding.issuer, ticker: tickerFor(mappedId), securityType: security?.securityType ?? null,
        })
      }
      const ranked = [...perManager.entries()].sort((a, b) => a[1].value === b[1].value ? a[0].localeCompare(b[0]) : a[1].value > b[1].value ? -1 : 1)
      for (const [rankIndex, [stable, data]] of ranked.entries()) {
        const holding = data.holding
        const id = holding.securityId?.toString() ?? stable
        const key = holding.securityId === null ? stable : positionKey(id, holding.quantityType, holding.putCall)
        const item = aggregate.get(key) ?? {
          key, securityId: id, ticker: data.ticker, company: data.company, securityType: data.securityType,
          quantityType: holding.quantityType as 'SH' | 'PRN', putCall: holding.putCall as 'PUT' | 'CALL' | null, heldBy: new Map(),
        }
        const change = holding.securityId === null ? undefined : changesByAnalyticsPosition.get(`${analytics.id}:${exposureKey(holding.securityId, holding.quantityType, holding.putCall)}`)
        item.heldBy.set(managerKey, {
          slug: managerKey, name: row.guru.name, action: change?.action ?? null, quantity: data.quantity,
          previousQuantity: change?.previousQuantity ?? null, value: data.value,
          weight: percent(data.value, units(analytics.reportedValueUsd)), previousWeight: change?.previousWeightPercent ?? null,
          rank: rankIndex + 1,
        })
        aggregate.set(key, item)
      }
    }
    const positions = [...aggregate.values()].map(item => {
      const members = [...item.heldBy.values()].sort((a, b) => a.name.localeCompare(b.name)).map(member => ({
        guruSlug: member.slug, guruName: member.name, action: member.action as 'NEW' | 'STRONG_ADD' | 'ADD' | 'UNCHANGED' | 'REDUCE' | 'STRONG_REDUCE' | 'EXIT' | null,
        currentQuantity: decimal(member.quantity), previousQuantity: member.previousQuantity,
        reportedValueUsd: decimal(member.value), weightPercent: member.weight, previousWeightPercent: member.previousWeight, currentRank: member.rank,
      }))
      return {
        positionKey: item.key, securityId: item.securityId, ticker: item.ticker, company: item.company, securityType: item.securityType,
        quantityType: item.quantityType, putCall: item.putCall, heldByCount: members.length, readyGuruCount: ready.length,
        selectedGuruCount: selectedProfiles.length, commonOrUnique: members.length > 1 ? 'COMMON' as const : 'UNIQUE' as const, members,
      }
    }).sort((a, b) => b.heldByCount - a.heldByCount || a.company.localeCompare(b.company))
    const opposing = new Map<string, typeof changeRows>()
    for (const row of changeRows) {
      if (row.securityId === null) continue
      const key = exposureKey(row.securityId, row.quantityType, row.putCall)
      opposing.set(key, [...(opposing.get(key) ?? []), row])
    }
    const moveGroups = new Map<string, {
      positionKey: string; securityId: string | null; ticker: string | null; company: string
      quantityType: 'SH' | 'PRN'; putCall: 'PUT' | 'CALL' | null
      members: Array<{
        guruSlug: string; guruName: string; action: string; currentQuantity: string | null; previousQuantity: string | null
        reportedValueUsd: string | null; weightPercent: string | null; previousWeightPercent: string | null; currentRank: number | null
      }>
    }>()
    for (const row of changeRows) {
      if (row.action === 'UNCHANGED') continue
      const owner = ready.find(item => item.state.analytics?.id === row.analyticsId)
      if (!owner) continue
      const stablePositionKey = row.securityId === null ? `${owner.row.guru.slug}:${row.positionKey}` : row.positionKey
      const security = row.securityId === null ? undefined : securityMap.get(row.securityId)
      const item = moveGroups.get(stablePositionKey) ?? {
        positionKey: row.positionKey, securityId: row.securityId?.toString() ?? null,
        ticker: row.ticker ?? tickerFor(row.securityId), company: security?.issuer ?? row.company,
        quantityType: row.quantityType as 'SH' | 'PRN', putCall: row.putCall as 'PUT' | 'CALL' | null, members: [],
      }
      item.members.push({
        guruSlug: owner.row.guru.slug, guruName: owner.row.guru.name,
        action: row.action, currentQuantity: row.currentQuantity, previousQuantity: row.previousQuantity,
        reportedValueUsd: row.currentReportedValueUsd, weightPercent: row.currentWeightPercent,
        previousWeightPercent: row.previousWeightPercent, currentRank: row.currentRank,
      })
      moveGroups.set(stablePositionKey, item)
    }
    const quarterMoves = [...moveGroups.values()].map(item => ({
      ...item,
      members: item.members.sort((a, b) => a.guruName.localeCompare(b.guruName)),
    })).sort((a, b) => b.members.length - a.members.length || a.company.localeCompare(b.company))
    const opposingActions = [...opposing.values()].flatMap(rows => {
      if (!rows.some(row => ACTION_BUY.has(row.action)) || !rows.some(row => ACTION_SELL.has(row.action))) return []
      const first = rows[0]!
      const security = securityMap.get(first.securityId!)
      const members = rows.map(change => {
        const owner = ready.find(item => item.state.analytics?.id === change.analyticsId)!
        return {
          guruSlug: owner.row.guru.slug, guruName: owner.row.guru.name, action: change.action as 'NEW' | 'STRONG_ADD' | 'ADD' | 'UNCHANGED' | 'REDUCE' | 'STRONG_REDUCE' | 'EXIT',
          currentQuantity: change.currentQuantity, previousQuantity: change.previousQuantity, reportedValueUsd: change.currentReportedValueUsd,
          weightPercent: change.currentWeightPercent, previousWeightPercent: change.previousWeightPercent, currentRank: change.currentRank,
        }
      })
      return [{ positionKey: positionKey(first.securityId!.toString(), first.quantityType, first.putCall), securityId: first.securityId!.toString(), ticker: first.ticker ?? tickerFor(first.securityId!), company: security?.issuer ?? first.company, members }]
    })
    const managers = statuses.map(({ row, state }) => {
      const source = state.publication ? sourceBySnapshot.get(state.publication.snapshotId) : undefined
      const filing = source ?? (periodEnd ? filingFor(row.manager.id, periodEnd) : undefined)
      const analytics = state.analytics
      return {
        profile: profile(row.guru), status: state.status,
        reportedValueUsd: state.status === 'READY' ? analytics?.reportedValueUsd ?? null : null,
        holdingCount: state.status === 'READY' ? analytics?.holdingCount ?? null : null,
        topTenConcentrationPercent: state.status === 'READY' ? analytics?.topTenConcentrationPercent ?? null : null,
        turnoverPercent: state.status === 'READY' ? analytics?.disclosedWeightTurnoverPercent ?? null : null,
        sectorAllocation: state.status === 'READY' ? allocations(analytics) : [], actionCounts: state.status === 'READY' ? actionCounts(analytics) : actionCounts(undefined),
        source: {
          form: filing?.form === '13F-HR' || filing?.form === '13F-HR/A' ? filing.form : null,
          accession: filing?.accession ?? null, filedAt: filing?.filedAt?.toISOString() ?? null, sourceUrl: filing?.sourceUrl ?? null,
        },
      }
    })
    cached(context)
    return context.json(guruComparisonResponseSchema.parse({ data: {
      periodEnd, source: 'SEC Form 13F', selectedGuruCount: selectedProfiles.length, readyGuruCount: ready.length, managers,
      positions, commonHoldings: positions.filter(item => item.heldByCount > 1), uniqueHoldings: positions.filter(item => item.heldByCount === 1), quarterMoves,
      opposingActions, periods,
    } }))
  })

  app.get('/api/stocks/:symbol/gurus', async context => {
    const symbol = context.req.param('symbol').toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid stock symbol')
    const parsed = stockGuruResearchQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const today = now().toISOString().slice(0, 10)
    const identifiers = await db.select({ securityId: institutionalSecurityIdentifiers.securityId })
      .from(institutionalSecurityIdentifiers).where(and(
        eq(institutionalSecurityIdentifiers.type, 'TICKER'), eq(institutionalSecurityIdentifiers.value, symbol),
        lte(institutionalSecurityIdentifiers.validFrom, today),
        or(isNull(institutionalSecurityIdentifiers.validTo), gte(institutionalSecurityIdentifiers.validTo, today)),
      ))
    const securityIds = [...new Set(identifiers.map(row => row.securityId))]
    const mappingStatus = securityIds.length === 1 ? 'MATCHED' as const : securityIds.length > 1 ? 'AMBIGUOUS' as const : 'UNRESOLVED' as const
    const securityId = securityIds.length === 1 ? securityIds[0]! : null
    const [security] = securityId === null ? [] : await db.select().from(institutionalSecurities).where(eq(institutionalSecurities.id, securityId)).limit(1)
    const [snapshots, rebuilds] = await Promise.all([
      db.select().from(guruConsensusSnapshots).orderBy(asc(guruConsensusSnapshots.periodEnd)),
      db.select().from(guruConsensusRebuildRequests),
    ])
    const periodEnds = [...new Set([...snapshots.map(row => row.periodEnd), ...rebuilds.map(row => row.periodEnd)])].sort((a, b) => a.localeCompare(b))
    const selectedPeriod = parsed.data.period ?? periodEnds.at(-1) ?? null
    const consensus = selectedPeriod ? snapshots.find(row => row.periodEnd === selectedPeriod) : undefined
    const rebuild = selectedPeriod ? rebuilds.find(row => row.periodEnd === selectedPeriod) : undefined
    const pending = Boolean(rebuild && rebuild.requestedRevision > rebuild.processedRevision)
    const consensusStock = consensus && securityId !== null
      ? (await db.select().from(guruStockConsensus).where(and(eq(guruStockConsensus.snapshotId, consensus.id), eq(guruStockConsensus.securityId, securityId))).limit(1))[0]
      : undefined
    const recentPeriods = [...new Set([
      ...snapshots.map(row => row.periodEnd),
      ...rebuilds.filter(row => row.requestedRevision > row.processedRevision).map(row => row.periodEnd),
    ])].sort((a, b) => a.localeCompare(b)).slice(-12)
    const historyPeriodEnds = [...new Set([...recentPeriods, ...(selectedPeriod ? [selectedPeriod] : [])])].sort((a, b) => a.localeCompare(b))
    const histories = securityId === null ? [] : await db.select({ snapshot: guruConsensusSnapshots, stock: guruStockConsensus })
      .from(guruConsensusSnapshots).leftJoin(guruStockConsensus, and(
        eq(guruStockConsensus.snapshotId, guruConsensusSnapshots.id), eq(guruStockConsensus.securityId, securityId),
      )).where(inArray(guruConsensusSnapshots.periodEnd, historyPeriodEnds)).orderBy(asc(guruConsensusSnapshots.periodEnd))
    const historiesByPeriod = new Map(histories.map(row => [row.snapshot.periodEnd, row]))
    const history = securityId === null ? [] : historyPeriodEnds.map(period => {
      const entry = historiesByPeriod.get(period)
      const snapshot = entry?.snapshot
      const stock = entry?.stock
      const queued = rebuilds.find(row => row.periodEnd === period && row.requestedRevision > row.processedRevision)
      const isPending = Boolean(queued)
      const isReady = Boolean(snapshot && !isPending)
      return {
        periodEnd: period, status: isPending ? 'PENDING' as const : isReady ? 'READY' as const : 'UNAVAILABLE' as const,
        activeGuruCount: isReady ? snapshot!.activeManagerCount : null, readyGuruCount: isReady ? snapshot!.readyManagerCount : null,
        quarterCoveragePercent: isReady ? percent(BigInt(snapshot!.readyManagerCount) * SCALE, BigInt(snapshot!.activeManagerCount) * SCALE) : null,
        mappingCoveragePercent: isReady ? snapshot?.mappingCoveragePercent ?? null : null,
        holderCount: isReady ? stock?.currentHolderCount ?? 0 : null,
        weightBreadthPercent: isReady ? stock?.weightBreadthPercent ?? '0' : null,
        averagePortfolioWeightPercent: isReady ? stock?.averagePortfolioWeightPercent ?? null : null,
        netBuyerCount: isReady ? stock?.netBuyerCount ?? 0 : null,
        classification: isReady ? stock?.classification ?? null : null,
      }
    })
    let currentHolders: Array<Record<string, unknown>> = []
    let latestMoves: Array<Record<string, unknown>> = []
    if (selectedPeriod && consensus && !pending && securityId !== null) {
      const activeRows = await db.select({ publication: institutionalEffectiveSnapshotPublications, analytics: guruQuarterAnalytics })
        .from(institutionalEffectiveSnapshotPublications)
        .innerJoin(institutionalEffectivePeriodStates, and(
          eq(institutionalEffectivePeriodStates.managerId, institutionalEffectiveSnapshotPublications.managerId),
          eq(institutionalEffectivePeriodStates.periodEnd, institutionalEffectiveSnapshotPublications.periodEnd),
          eq(institutionalEffectivePeriodStates.status, 'READY'),
        )).innerJoin(guruQuarterAnalytics, and(
          eq(guruQuarterAnalytics.managerId, institutionalEffectiveSnapshotPublications.managerId),
          eq(guruQuarterAnalytics.periodEnd, institutionalEffectiveSnapshotPublications.periodEnd),
          eq(guruQuarterAnalytics.snapshotId, institutionalEffectiveSnapshotPublications.snapshotId),
          eq(guruQuarterAnalytics.analyticsVersion, GURU_PORTFOLIO_ANALYTICS_VERSION), eq(guruQuarterAnalytics.status, 'READY'),
        )).where(and(
          eq(institutionalEffectiveSnapshotPublications.periodEnd, selectedPeriod),
          eq(institutionalEffectiveSnapshotPublications.active, true), eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
        ))
      const snapshotIds = activeRows.map(row => row.publication.snapshotId)
      const analyticsIds = activeRows.map(row => row.analytics.id)
      const managerIds = activeRows.map(row => row.publication.managerId)
      const [holdings, changes, profiles, sources] = await Promise.all([
        snapshotIds.length ? db.select().from(institutionalEffectiveHoldings).where(and(
          inArray(institutionalEffectiveHoldings.snapshotId, snapshotIds), eq(institutionalEffectiveHoldings.securityId, securityId),
          eq(institutionalEffectiveHoldings.quantityType, 'SH'), isNull(institutionalEffectiveHoldings.putCall),
        )) : [],
        analyticsIds.length ? db.select().from(guruHoldingChanges).where(and(
          inArray(guruHoldingChanges.analyticsId, analyticsIds), eq(guruHoldingChanges.securityId, securityId),
          eq(guruHoldingChanges.quantityType, 'SH'), isNull(guruHoldingChanges.putCall), ne(guruHoldingChanges.action, 'UNCHANGED'),
        )) : [],
        managerIds.length ? db.select().from(gurus).where(and(inArray(gurus.managerId, managerIds), eq(gurus.active, true))) : [],
        snapshotIds.length ? db.select({ snapshotId: institutionalEffectiveSnapshotSources.snapshotId, accession: institutionalFilings.accession, form: institutionalFilings.form, filedAt: institutionalFilings.filedAt, sourceUrl: institutionalFilings.sourceUrl })
          .from(institutionalEffectiveSnapshotSources).innerJoin(institutionalFilings, eq(institutionalFilings.id, institutionalEffectiveSnapshotSources.filingId))
          .where(inArray(institutionalEffectiveSnapshotSources.snapshotId, snapshotIds)).orderBy(desc(institutionalEffectiveSnapshotSources.ordinal)) : [],
      ])
      const profileByManager = new Map(profiles.map(row => [row.managerId, row]))
      const sourceBySnapshot = new Map<bigint, typeof sources[number]>()
      for (const row of sources) if (!sourceBySnapshot.has(row.snapshotId)) sourceBySnapshot.set(row.snapshotId, row)
      const analyticsById = new Map(activeRows.map(row => [row.analytics.id, row]))
      const grouped = new Map<bigint, { quantity: bigint; value: bigint; company: string }>()
      for (const holding of holdings) {
        const existing = grouped.get(holding.snapshotId)
        if (existing) { existing.quantity += units(holding.quantity); existing.value += usd(holding.reportedValue, holding.reportedValueUnit); continue }
        grouped.set(holding.snapshotId, { quantity: units(holding.quantity), value: usd(holding.reportedValue, holding.reportedValueUnit), company: holding.issuer })
      }
      currentHolders = [...grouped.entries()].flatMap(([snapshotId, values]) => {
        const owner = activeRows.find(row => row.publication.snapshotId === snapshotId)
        if (!owner) return []
        const guru = profileByManager.get(owner.publication.managerId)
        if (!guru) return []
        const change = changes.find(row => row.analyticsId === owner.analytics.id)
        const source = sourceBySnapshot.get(snapshotId)
        return [{
          profile: profile(guru), action: (change?.action ?? null) as 'NEW' | 'STRONG_ADD' | 'ADD' | 'UNCHANGED' | 'REDUCE' | 'STRONG_REDUCE' | 'EXIT' | null,
          quantity: decimal(values.quantity), quantityChangePercent: change?.quantityChangePercent ?? null,
          weightPercent: percent(values.value, units(owner.analytics.reportedValueUsd)), previousWeightPercent: change?.previousWeightPercent ?? null,
          source: { accession: source?.accession ?? null, form: source?.form === '13F-HR' || source?.form === '13F-HR/A' ? source.form : null, filedAt: source?.filedAt?.toISOString() ?? null, sourceUrl: source?.sourceUrl ?? null },
        }]
      }).sort((a, b) => String(a.profile.name).localeCompare(String(b.profile.name)))
      latestMoves = changes.flatMap(change => {
        const owner = analyticsById.get(change.analyticsId)
        const guru = owner ? profileByManager.get(owner.publication.managerId) : undefined
        const source = owner ? sourceBySnapshot.get(owner.publication.snapshotId) : undefined
        return !guru ? [] : [{
          profile: profile(guru), action: change.action as 'NEW' | 'STRONG_ADD' | 'ADD' | 'UNCHANGED' | 'REDUCE' | 'STRONG_REDUCE' | 'EXIT',
          quantity: change.currentQuantity, quantityChangePercent: change.quantityChangePercent,
          weightPercent: change.currentWeightPercent ?? change.previousWeightPercent, previousWeightPercent: change.previousWeightPercent,
          source: { accession: source?.accession ?? null, form: source?.form === '13F-HR' || source?.form === '13F-HR/A' ? source.form : null, filedAt: source?.filedAt?.toISOString() ?? null, sourceUrl: source?.sourceUrl ?? null },
        }]
      }).sort((a, b) => String(a.profile.name).localeCompare(String(b.profile.name)))
    }
    const activeGuruCount = consensus?.activeManagerCount ?? 0
    const readyGuruCount = consensus?.readyManagerCount ?? 0
    const quarterCoverage = consensus ? percent(BigInt(readyGuruCount) * SCALE, BigInt(activeGuruCount) * SCALE) : null
    const dataStatus = securityId === null ? 'UNAVAILABLE' as const : pending ? 'PENDING' as const : consensus ? 'READY' as const : 'UNAVAILABLE' as const
    const metricsReady = dataStatus === 'READY'
    const summary = {
      symbol, mappingStatus, securityId: securityId?.toString() ?? null, company: security?.issuer ?? null,
      sector: security?.sector ?? null, industry: security?.industry ?? null, periodEnd: selectedPeriod,
      dataStatus, calculatedAt: metricsReady ? consensus?.calculatedAt.toISOString() ?? null : null,
      contextHash: metricsReady ? consensus?.contextHash ?? null : null,
      activeGuruCount: metricsReady ? activeGuruCount : null, readyGuruCount: metricsReady ? readyGuruCount : null,
      quarterCoveragePercent: metricsReady ? quarterCoverage : null, mappingCoveragePercent: metricsReady ? consensus?.mappingCoveragePercent ?? null : null,
      currentHolderCount: metricsReady ? consensusStock?.currentHolderCount ?? 0 : null,
      averagePortfolioWeightPercent: metricsReady ? consensusStock?.averagePortfolioWeightPercent ?? null : null,
      weightBreadthPercent: metricsReady ? consensusStock?.weightBreadthPercent ?? '0' : null,
      newBuyerCount: metricsReady ? consensusStock?.newBuyerCount ?? 0 : null, addCount: metricsReady ? consensusStock?.addCount ?? 0 : null,
      reduceCount: metricsReady ? consensusStock?.reduceCount ?? 0 : null, exitCount: metricsReady ? consensusStock?.exitCount ?? 0 : null,
      netBuyerCount: metricsReady ? consensusStock?.netBuyerCount ?? 0 : null, classification: metricsReady ? consensusStock?.classification ?? null : null,
      source: 'SEC Form 13F' as const,
    }
    cached(context)
    return context.json(stockGuruResearchResponseSchema.parse({ data: { summary, currentHolders, latestMoves, history } }))
  })
}
