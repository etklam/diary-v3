import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import {
  guruDirectoryQuerySchema,
  guruDirectoryResponseSchema,
  guruFollowResponseSchema,
  guruOverviewResponseSchema,
  guruPositionSummarySchema,
  guruSectorAllocationSchema,
  type GuruDirectoryItem,
  type GuruPeriodSummary,
  type ErrorCode,
} from '@diary/contracts'
import {
  guruFollowers,
  guruHoldingChanges,
  guruQuarterAnalytics,
  gurus,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalFilings,
  institutionalManagers,
  users,
  type Database,
} from '@diary/db'
import { instant, type AppEnv } from './app-context.js'

type GuruRoutesDependencies = {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: import('zod').ZodError) => never
}

type AnalyticsRow = typeof guruQuarterAnalytics.$inferSelect
type FilingRow = typeof institutionalFilings.$inferSelect
type PeriodStateRow = typeof institutionalEffectivePeriodStates.$inferSelect
type PublicationRow = typeof institutionalEffectiveSnapshotPublications.$inferSelect

function decimalUnits(value: string | null): bigint | null {
  if (value === null || !/^-?\d+(?:\.\d+)?$/.test(value)) return null
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const units = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0').slice(0, 8))
  return negative ? -units : units
}

function descendingDecimal(left: string | null, right: string | null): number {
  const a = decimalUnits(left)
  const b = decimalUnits(right)
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return a === b ? 0 : a > b ? -1 : 1
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function analyticsPortfolio(row: AnalyticsRow | undefined) {
  const result = asRecord(row?.result)
  return asRecord(result?.portfolio)
}

function mappedTopHoldings(row: AnalyticsRow | undefined) {
  const raw = analyticsPortfolio(row)?.topHoldings
  if (!Array.isArray(raw)) return []
  return raw.flatMap(value => {
    const parsed = guruPositionSummarySchema.safeParse(value)
    return parsed.success ? [parsed.data] : []
  })
}

function mappedLargestPosition(row: AnalyticsRow | undefined) {
  const raw = analyticsPortfolio(row)?.largestPosition
  const parsed = guruPositionSummarySchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

function mappedSectors(row: AnalyticsRow | undefined) {
  const raw = analyticsPortfolio(row)?.sectorAllocation
  if (!Array.isArray(raw)) return []
  return raw.flatMap(value => {
    const parsed = guruSectorAllocationSchema.safeParse(value)
    return parsed.success ? [parsed.data] : []
  })
}

function actionCounts(row: AnalyticsRow | undefined) {
  if (!row || row.status !== 'READY') return { new: 0, add: 0, reduce: 0, exit: 0 }
  return {
    new: row.newCount,
    add: row.addCount + row.strongAddCount,
    reduce: row.reduceCount + row.strongReduceCount,
    exit: row.exitCount,
  }
}

function periodSummary(input: {
  analytics?: AnalyticsRow
  filing?: FilingRow
  state?: PeriodStateRow
  effectiveSnapshotId?: bigint
}): GuruPeriodSummary {
  const { analytics, filing, state, effectiveSnapshotId } = input
  const periodEnd = filing?.periodEnd ?? analytics?.periodEnd ?? null
  const periodState = state?.periodEnd === periodEnd ? state.status : undefined
  const analyticsCurrent = analytics?.periodEnd === periodEnd && effectiveSnapshotId !== undefined && analytics.snapshotId === effectiveSnapshotId
  const quality = periodState === 'PARTIAL' || periodState === 'ERROR'
    ? periodState
    : analyticsCurrent ? analytics.status : 'PENDING'
  const ready = quality === 'READY' && analyticsCurrent && analytics?.status === 'READY'
  return {
    periodEnd,
    filedAt: filing?.filedAt ? instant(filing.filedAt) : null,
    status: quality as GuruPeriodSummary['status'],
    reportedValueUsd: ready && analytics ? analytics.reportedValueUsd : null,
    holdingCount: ready && analytics ? analytics.holdingCount : null,
    topFiveConcentrationPercent: ready && analytics ? analytics.topFiveConcentrationPercent : null,
    topTenConcentrationPercent: ready && analytics ? analytics.topTenConcentrationPercent : null,
    hhi: ready && analytics ? analytics.hhi : null,
    turnoverPercent: ready && analytics ? analytics.disclosedWeightTurnoverPercent : null,
    turnoverBand: ready && analytics && (analytics.turnoverBand === 'LOW' || analytics.turnoverBand === 'MODERATE' || analytics.turnoverBand === 'HIGH') ? analytics.turnoverBand : null,
    actionCounts: ready ? actionCounts(analytics) : { new: 0, add: 0, reduce: 0, exit: 0 },
    largestPosition: ready ? mappedLargestPosition(analytics) : null,
    topHoldings: ready ? mappedTopHoldings(analytics) : [],
    sectorAllocation: ready ? mappedSectors(analytics) : [],
  }
}

function profile(guru: typeof gurus.$inferSelect) {
  return {
    name: guru.name,
    managerName: guru.managerName,
    slug: guru.slug,
    description: guru.description,
    investmentPhilosophy: guru.investmentPhilosophy,
    styleTags: guru.styleTags,
    managerType: guru.managerType,
    website: guru.website,
    country: guru.country,
    imageUrl: guru.imageUrl,
    featured: guru.featured,
  }
}

function findStatus(statusRows: readonly PeriodStateRow[], managerId: bigint, periodEnd: string | null) {
  return periodEnd ? statusRows.find(row => row.managerId === managerId && row.periodEnd === periodEnd) : undefined
}

async function privateRelationship(db: Database, guruId: bigint, userId: bigint) {
  const [relationship] = await db.select({ guruId: guruFollowers.guruId }).from(guruFollowers).where(and(
    eq(guruFollowers.guruId, guruId), eq(guruFollowers.userId, userId),
  )).limit(1)
  const [aggregate] = await db.select({ followerCount: count() }).from(guruFollowers).where(eq(guruFollowers.guruId, guruId))
  return { following: Boolean(relationship), followerCount: Number(aggregate?.followerCount ?? 0) }
}

function latestRecord<T extends { managerId: bigint }>(rows: readonly T[]) {
  const output = new Map<bigint, T>()
  for (const row of rows) if (!output.has(row.managerId)) output.set(row.managerId, row)
  return output
}

export function registerGuruRoutes(app: Hono<AppEnv>, dependencies: GuruRoutesDependencies) {
  const { db, now, fail, validationError } = dependencies

  async function adminSafeUserId(context: Context<AppEnv>): Promise<bigint | undefined> {
    const session = context.get('user')
    if (!session) return undefined
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    return user?.id
  }

  app.get('/api/gurus', async context => {
    const parsed = guruDirectoryQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const query = parsed.data
    const userId = await adminSafeUserId(context)
    context.header('Vary', 'Cookie, Authorization, X-API-Key', { append: true })
    context.header('Cache-Control', userId === undefined ? 'public, max-age=30, stale-while-revalidate=60' : 'private, no-store')
    const pattern = query.search ? `%${query.search.replace(/[\\%_]/g, '\\$&')}%` : undefined
    const matchingProfiles = await db.select({ guru: gurus, cik: institutionalManagers.cik })
      .from(gurus).innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id))
      .where(and(
        eq(gurus.active, true),
        pattern ? or(ilike(gurus.name, pattern), ilike(gurus.managerName, pattern), ilike(gurus.slug, pattern), ilike(institutionalManagers.cik, pattern)) : undefined,
        query.managerType ? eq(gurus.managerType, query.managerType) : undefined,
        query.featured ? eq(gurus.featured, query.featured === 'true') : undefined,
      ))
    const guruIds = matchingProfiles.map(row => row.guru.id)
    const managerIds = [...new Set(matchingProfiles.map(row => row.guru.managerId))]
    const analyticsRows = managerIds.length ? await db.selectDistinctOn([guruQuarterAnalytics.managerId]).from(guruQuarterAnalytics)
      .where(inArray(guruQuarterAnalytics.managerId, managerIds))
      .orderBy(guruQuarterAnalytics.managerId, desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.id)) : []
    const filingRows = managerIds.length ? await db.selectDistinctOn([institutionalFilings.managerId]).from(institutionalFilings)
      .where(and(inArray(institutionalFilings.managerId, managerIds), inArray(institutionalFilings.form, ['13F-HR', '13F-HR/A'])))
      .orderBy(institutionalFilings.managerId, desc(institutionalFilings.periodEnd), desc(institutionalFilings.filedAt), desc(institutionalFilings.id)) : []
    const statusRows = managerIds.length ? await db.select().from(institutionalEffectivePeriodStates).where(inArray(institutionalEffectivePeriodStates.managerId, managerIds)) : []
    const publicationRows = managerIds.length ? await db.select().from(institutionalEffectiveSnapshotPublications).where(and(
      inArray(institutionalEffectiveSnapshotPublications.managerId, managerIds),
      eq(institutionalEffectiveSnapshotPublications.active, true),
      eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
    )).orderBy(institutionalEffectiveSnapshotPublications.managerId, desc(institutionalEffectiveSnapshotPublications.periodEnd), desc(institutionalEffectiveSnapshotPublications.snapshotId)) : []
    const followerRows = guruIds.length ? await db.select({ guruId: guruFollowers.guruId, followerCount: count() })
      .from(guruFollowers).where(inArray(guruFollowers.guruId, guruIds)).groupBy(guruFollowers.guruId) : []
    const followingRows = userId && guruIds.length ? await db.select({ guruId: guruFollowers.guruId }).from(guruFollowers).where(and(
      eq(guruFollowers.userId, userId), inArray(guruFollowers.guruId, guruIds),
    )) : []
    const analyticsByManager = latestRecord(analyticsRows)
    const filingByManager = latestRecord(filingRows)
    const publicationByManager = latestRecord(publicationRows)
    const followerCounts = new Map(followerRows.map(row => [row.guruId, Number(row.followerCount)]))
    const followed = new Set(followingRows.map(row => row.guruId))
    const states = statusRows
    const entries: GuruDirectoryItem[] = matchingProfiles.map(({ guru, cik }) => {
      const latestFiling = filingByManager.get(guru.managerId)
      const latestAnalytics = analyticsByManager.get(guru.managerId)
      const periodEnd = latestFiling?.periodEnd ?? latestAnalytics?.periodEnd ?? null
      const analytics = latestAnalytics?.periodEnd === periodEnd ? latestAnalytics : undefined
      const state = findStatus(states, guru.managerId, periodEnd)
      const publication = publicationByManager.get(guru.managerId)
      return {
        profile: profile(guru), cik, directoryOrder: guru.directoryOrder,
        followerCount: followerCounts.get(guru.id) ?? 0, followedByMe: followed.has(guru.id),
        latest: periodSummary({ analytics, filing: latestFiling, state, effectiveSnapshotId: publication?.periodEnd === periodEnd ? publication.snapshotId : undefined }),
      }
    }).filter(entry => !query.style || entry.profile.styleTags.some(tag => tag.toLocaleLowerCase() === query.style!.toLocaleLowerCase()))
      .filter(entry => !query.sector || entry.latest.sectorAllocation.some(bucket => bucket.name.toLocaleLowerCase() === query.sector!.toLocaleLowerCase()))

    const styles = [...new Set(matchingProfiles.flatMap(row => row.guru.styleTags))].sort((a, b) => a.localeCompare(b))
    const managerTypes = [...new Set(matchingProfiles.flatMap(row => row.guru.managerType ? [row.guru.managerType] : []))].sort((a, b) => a.localeCompare(b))
    const sectors = [...new Set(entries.flatMap(entry => entry.latest.sectorAllocation.map(bucket => bucket.name)))].sort((a, b) => a.localeCompare(b))
    entries.sort((left, right) => {
      switch (query.sort) {
        case 'concentration': return descendingDecimal(left.latest.topTenConcentrationPercent, right.latest.topTenConcentrationPercent) || left.profile.name.localeCompare(right.profile.name)
        case 'turnover': return descendingDecimal(left.latest.turnoverPercent, right.latest.turnoverPercent) || left.profile.name.localeCompare(right.profile.name)
        case 'activity': {
          const leftCount = Object.values(left.latest.actionCounts).reduce((sum, value) => sum + value, 0)
          const rightCount = Object.values(right.latest.actionCounts).reduce((sum, value) => sum + value, 0)
          return rightCount - leftCount || left.profile.name.localeCompare(right.profile.name)
        }
        case 'latest_filing': return (right.latest.filedAt ?? '').localeCompare(left.latest.filedAt ?? '') || left.profile.name.localeCompare(right.profile.name)
        case 'followers': return right.followerCount - left.followerCount || left.profile.name.localeCompare(right.profile.name)
        case 'az': return left.profile.name.localeCompare(right.profile.name)
        case 'custom': return Number(right.profile.featured) - Number(left.profile.featured) || left.directoryOrder - right.directoryOrder || left.profile.name.localeCompare(right.profile.name)
      }
    })
    const total = entries.length
    const offset = (query.page - 1) * query.limit
    return context.json(guruDirectoryResponseSchema.parse({
      data: entries.slice(offset, offset + query.limit),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      facets: { styles, managerTypes, sectors },
    }))
  })

  app.get('/api/gurus/:slug', async context => {
    const slug = context.req.param('slug')
    const userId = await adminSafeUserId(context)
    context.header('Vary', 'Cookie, Authorization, X-API-Key', { append: true })
    context.header('Cache-Control', userId === undefined ? 'public, max-age=30, stale-while-revalidate=60' : 'private, no-store')
    const [row] = await db.select({ guru: gurus, cik: institutionalManagers.cik }).from(gurus)
      .innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id))
      .where(and(eq(gurus.slug, slug), eq(gurus.active, true))).limit(1)
    if (!row) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    const [analyticsRows, filingRows, statusRows, publicationRows] = await Promise.all([
      db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.managerId, row.guru.managerId))
        .orderBy(desc(guruQuarterAnalytics.periodEnd), desc(guruQuarterAnalytics.id)).limit(8),
      db.select().from(institutionalFilings).where(and(
        eq(institutionalFilings.managerId, row.guru.managerId), inArray(institutionalFilings.form, ['13F-HR', '13F-HR/A']),
      )).orderBy(desc(institutionalFilings.periodEnd), desc(institutionalFilings.filedAt), desc(institutionalFilings.id)),
      db.select().from(institutionalEffectivePeriodStates).where(eq(institutionalEffectivePeriodStates.managerId, row.guru.managerId)),
      db.select().from(institutionalEffectiveSnapshotPublications).where(and(
        eq(institutionalEffectiveSnapshotPublications.managerId, row.guru.managerId),
        eq(institutionalEffectiveSnapshotPublications.active, true),
        eq(institutionalEffectiveSnapshotPublications.status, 'READY'),
      )).orderBy(desc(institutionalEffectiveSnapshotPublications.periodEnd), desc(institutionalEffectiveSnapshotPublications.snapshotId)),
    ])
    const latestFiling = filingRows[0]
    const analyticsByPeriod = new Map<string, AnalyticsRow>()
    for (const analytics of analyticsRows) if (!analyticsByPeriod.has(analytics.periodEnd)) analyticsByPeriod.set(analytics.periodEnd, analytics)
    const filingsByPeriod = new Map<string, FilingRow>()
    for (const filing of filingRows) if (filing.periodEnd && !filingsByPeriod.has(filing.periodEnd)) filingsByPeriod.set(filing.periodEnd, filing)
    const historyPeriods = [...new Set([
      ...(latestFiling?.periodEnd ? [latestFiling.periodEnd] : []),
      ...analyticsRows.map(analytics => analytics.periodEnd),
      ...publicationRows.map(publication => publication.periodEnd),
    ])].sort((left, right) => right.localeCompare(left)).slice(0, 8)
    const publicationByPeriod = new Map<string, PublicationRow>()
    for (const publication of publicationRows) if (!publicationByPeriod.has(publication.periodEnd)) publicationByPeriod.set(publication.periodEnd, publication)
    const history = historyPeriods.map(periodEnd => periodSummary({
      analytics: analyticsByPeriod.get(periodEnd),
      filing: filingsByPeriod.get(periodEnd),
      state: statusRows.find(state => state.periodEnd === periodEnd),
      effectiveSnapshotId: publicationByPeriod.get(periodEnd)?.snapshotId,
    }))
    const latest = history[0] ?? periodSummary({ filing: latestFiling })
    const latestAnalytics = latest.periodEnd ? analyticsByPeriod.get(latest.periodEnd) : undefined
    const ready = latest.status === 'READY' && latestAnalytics?.status === 'READY'
    const relationship = userId ? await privateRelationship(db, row.guru.id, userId) : undefined
    const latestMoves = ready && latestAnalytics ? await db.select().from(guruHoldingChanges)
      .where(eq(guruHoldingChanges.analyticsId, latestAnalytics.id))
      .then(changes => changes.filter(change => change.action !== 'UNCHANGED').sort((left, right) => {
        const leftWeight = decimalUnits(left.currentWeightPercent ?? left.previousWeightPercent)
        const rightWeight = decimalUnits(right.currentWeightPercent ?? right.previousWeightPercent)
        const leftMagnitude = leftWeight === null ? 0n : leftWeight < 0n ? -leftWeight : leftWeight
        const rightMagnitude = rightWeight === null ? 0n : rightWeight < 0n ? -rightWeight : rightWeight
        return leftMagnitude === rightMagnitude ? left.positionKey.localeCompare(right.positionKey) : leftMagnitude > rightMagnitude ? -1 : 1
      }).slice(0, 10).map(change => ({
        positionKey: change.positionKey, securityId: change.securityId?.toString() ?? null,
        ticker: change.ticker, company: change.company, action: change.action,
        previousQuantity: change.previousQuantity, currentQuantity: change.currentQuantity,
        quantityChange: change.quantityChange, quantityChangePercent: change.quantityChangePercent,
        previousWeightPercent: change.previousWeightPercent, currentWeightPercent: change.currentWeightPercent,
        previousRank: change.previousRank, currentRank: change.currentRank,
      }))) : []
    return context.json(guruOverviewResponseSchema.parse({
      data: {
        profile: profile(row.guru), cik: row.cik,
        followerCount: relationship?.followerCount ?? (await db.select({ followerCount: count() }).from(guruFollowers).where(eq(guruFollowers.guruId, row.guru.id)))[0]?.followerCount ?? 0,
        followedByMe: relationship?.following ?? false,
        latest, latestMoves, history,
        source: {
          accession: latestFiling?.accession ?? null,
          form: latestFiling?.form === '13F-HR' || latestFiling?.form === '13F-HR/A' ? latestFiling.form : null,
          periodEnd: latestFiling?.periodEnd ?? null,
          filedAt: latestFiling?.filedAt ? instant(latestFiling.filedAt) : null,
          sourceUrl: latestFiling?.sourceUrl ?? null,
        },
        aiSummaryState: 'NOT_GENERATED',
      },
    }))
  })

  async function mutateFollow(context: Context<AppEnv>, follow: boolean) {
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [guru] = await db.select({ id: gurus.id }).from(gurus).where(and(
      eq(gurus.slug, context.req.param('slug') ?? ''), eq(gurus.active, true),
    )).limit(1)
    if (!guru) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    if (follow) await db.insert(guruFollowers).values({ guruId: guru.id, userId: user.id, createdAt: now() }).onConflictDoNothing()
    else await db.delete(guruFollowers).where(and(eq(guruFollowers.guruId, guru.id), eq(guruFollowers.userId, user.id)))
    return context.json(guruFollowResponseSchema.parse({ data: await privateRelationship(db, guru.id, user.id) }))
  }

  app.put('/api/gurus/:slug/follow', context => mutateFollow(context, true))
  app.delete('/api/gurus/:slug/follow', context => mutateFollow(context, false))
}
