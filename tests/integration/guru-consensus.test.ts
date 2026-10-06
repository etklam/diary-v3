import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { Hono } from 'hono'
import {
  guruConsensusRebuildRequests,
  guruConsensusSnapshots,
  guruSectorConsensus,
  guruStockConsensus,
  guruThemeMappings,
  gurus,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshots,
  institutionalFilingArtifacts,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagers,
  institutionalSecurities,
  institutionalSecurityIdentifiers,
  institutionalSnapshotChangeEvents,
  users,
} from '@diary/db'
import { runPendingGuruConsensusRebuildOnce } from '../../apps/api/src/institutional/guru-consensus.js'
import { runPendingGuruPortfolioAnalyticsOnce } from '../../apps/api/src/institutional/portfolio-analytics.js'
import { registerGuruConsensusRoutes } from '../../apps/api/src/guru-consensus-routes.js'
import { registerGuruComparisonRoutes } from '../../apps/api/src/guru-comparison-routes.js'
import { fail, validationError, type AppEnv } from '../../apps/api/src/app-context.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
const clock = new Date()
let filingNumber = 1
let managerNumber = 730000

beforeAll(async () => { database = await provisionTestDatabase('guru_consensus') })
afterAll(async () => { await database?.dispose() })

function digest(value: string) { return createHash('sha256').update(value).digest('hex') }

async function createGuru(name: string) {
  const cik = String(managerNumber++).padStart(10, '0')
  const [manager] = await database.db.insert(institutionalManagers).values({ cik }).returning()
  const [guru] = await database.db.insert(gurus).values({ managerId: manager!.id, slug: `fixture-guru-${cik}`, name, managerName: `${name} Management` }).returning()
  return { managerId: manager!.id, guruId: guru!.id }
}

async function publish(input: { managerId: bigint; periodEnd: string; securityId: bigint; quantity: string; reportedValue: string }) {
  const accession = `${String(input.managerId).padStart(10, '0')}-26-${String(filingNumber++).padStart(6, '0')}`
  const sourceUrl = `https://www.sec.gov/fixture/${accession}`
  const [filing] = await database.db.insert(institutionalFilings).values({
    managerId: input.managerId, accession, form: '13F-HR', isAmendment: false, filingDate: input.periodEnd,
    filedAt: clock, periodEnd: input.periodEnd, sourceUrl, status: 'READY', parserVersion: 'consensus-fixture-v1',
    parsedRowCount: 1, rejectedRowCount: 0,
  }).returning()
  const [document] = await database.db.insert(institutionalFilingDocuments).values({ filingId: filing!.id, basename: 'information.xml', sourceUrl, isPrimary: true }).returning()
  const body = `<fixture>${accession}</fixture>`
  const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
    documentId: document!.id, contentSha256: digest(body), artifactRef: `synthetic:${accession}`,
    rawContent: body, contentLength: BigInt(body.length), fetchedAt: clock,
  }).returning()
  const snapshotHash = digest(`${input.securityId}:${input.quantity}:${input.reportedValue}`)
  const [snapshot] = await database.db.insert(institutionalEffectiveSnapshots).values({
    managerId: input.managerId, periodEnd: input.periodEnd, replayKey: digest(`replay:${snapshotHash}:${randomUUID()}`),
    snapshotHash, sourceManifestHash: digest(`manifest:${accession}`), resolverVersion: 'consensus-fixture-v1', holdingCount: 1, createdAt: clock,
  }).returning()
  await database.db.insert(institutionalEffectiveHoldings).values({
    snapshotId: snapshot!.id, ordinal: 0, sourceFilingId: filing!.id, sourceDocumentId: document!.id, sourceArtifactId: artifact!.id,
    sourceRowKey: digest(`row:${accession}`), sourceRowNumber: 1, securityId: input.securityId,
    mappingStatus: 'MATCHED', mappingVersion: 'consensus-fixture-v1', issuer: 'Synthetic Alpha Issuer', titleOfClass: 'Common Stock',
    cusip: null, figi: null, reportedValue: input.reportedValue, reportedValueUnit: 'USD', quantity: input.quantity,
    quantityType: 'SH', putCall: null, sourceData: { accession, sourceUrl },
  })
  await database.db.insert(institutionalEffectiveSnapshotPublications).values({
    snapshotId: snapshot!.id, managerId: input.managerId, periodEnd: input.periodEnd, status: 'READY', active: true, updatedAt: clock,
  })
  await database.db.insert(institutionalEffectivePeriodStates).values({
    managerId: input.managerId, periodEnd: input.periodEnd, status: 'READY', reason: null,
    sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  }).onConflictDoUpdate({ target: [institutionalEffectivePeriodStates.managerId, institutionalEffectivePeriodStates.periodEnd], set: {
    status: 'READY', reason: null, sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  } })
  await database.db.insert(institutionalSnapshotChangeEvents).values({
    managerId: input.managerId, periodEnd: input.periodEnd, snapshotId: snapshot!.id, createdAt: clock,
  })
}

async function drainAnalytics() {
  for (let count = 0; count < 20; count += 1) {
    const result = await runPendingGuruPortfolioAnalyticsOnce(database.db, clock)
    if (!result) return
  }
  throw new Error('ANALYTICS_QUEUE_DID_NOT_DRAIN')
}

async function drainConsensus() {
  const results = []
  for (let count = 0; count < 20; count += 1) {
    const result = await runPendingGuruConsensusRebuildOnce(database.db, new Date(Date.now() + 1000))
    if (!result) return results
    results.push(result)
  }
  throw new Error('CONSENSUS_QUEUE_DID_NOT_DRAIN')
}

it('rebuilds quarter consensus from READY effective snapshots and preserves denominator, theme, and retry semantics', async () => {
  const actor = (await database.db.insert(users).values({ email: `${randomUUID()}@example.test`, password: 'synthetic-test-password', role: 'ADMIN' }).returning())[0]!
  const [security] = await database.db.insert(institutionalSecurities).values({
    issuer: 'Synthetic Alpha Issuer', titleOfClass: 'Common Stock', securityType: 'EQUITY', sector: 'Technology', industry: 'Software',
    sourceUrl: 'https://issuer.example.test/security', sourceVerifiedBy: actor.id, sourceVerifiedAt: clock,
  }).returning()
  await database.db.insert(institutionalSecurityIdentifiers).values({
    securityId: security!.id, type: 'TICKER', value: 'SYN', validFrom: '2020-01-01', validTo: null,
    sourceUrl: 'https://issuer.example.test/ticker', sourceVerifiedBy: actor.id, sourceVerifiedAt: clock, createdAt: clock,
  })
  const [themeMapping] = await database.db.insert(guruThemeMappings).values({
    securityId: security!.id, themeKey: 'ai-infrastructure', themeName: 'AI Infrastructure', version: 1,
    source: 'ADMIN', sourceReference: 'https://research.example.test/theme-map/alpha', active: true, createdBy: actor.id, createdAt: clock,
  }).returning()
  const first = await createGuru('Synthetic North Capital')
  const second = await createGuru('Synthetic South Capital')
  const newEntrant = await createGuru('Synthetic New Capital')
  await createGuru('Synthetic No Filing Capital')

  for (const manager of [first, second]) await publish({ managerId: manager.managerId, periodEnd: '2026-03-31', securityId: security!.id, quantity: '100', reportedValue: '1000' })
  await publish({ managerId: first.managerId, periodEnd: '2026-06-30', securityId: security!.id, quantity: '150', reportedValue: '1200' })
  await publish({ managerId: second.managerId, periodEnd: '2026-06-30', securityId: security!.id, quantity: '100', reportedValue: '1000' })
  await publish({ managerId: newEntrant.managerId, periodEnd: '2026-06-30', securityId: security!.id, quantity: '50', reportedValue: '500' })

  await drainAnalytics()
  const rebuilt = await drainConsensus()
  expect(rebuilt).toHaveLength(2)
  expect(rebuilt.every(item => item.status === 'READY')).toBe(true)

  const snapshots = await database.db.select().from(guruConsensusSnapshots).orderBy(asc(guruConsensusSnapshots.periodEnd))
  expect(snapshots).toHaveLength(2)
  const current = snapshots.find(row => row.periodEnd === '2026-06-30')!
  expect(current).toMatchObject({ activeManagerCount: 4, readyManagerCount: 3, noFilingManagerCount: 1, previousReadyManagerCount: 2, comparableManagerCount: 2, mappingCoveragePercent: '100.00000000' })
  const [stock] = await database.db.select().from(guruStockConsensus).where(eq(guruStockConsensus.snapshotId, current.id))
  expect(stock).toMatchObject({
    securityId: security!.id, ticker: 'SYN', currentHolderCount: 3, comparableCurrentHolderCount: 2,
    previousHolderCount: 2, holderCountChange: 0, addCount: 1, unchangedCount: 1, netBuyerCount: 1,
    averageQuantityChangePercent: '25.00000000', aggregateWeightPercent: '300.00000000',
    averagePortfolioWeightPercent: '100.00000000', weightBreadthPercent: '100.00000000', classification: 'ACCUMULATION', quarterTrend: 'STABLE',
  })
  const [sector] = await database.db.select().from(guruSectorConsensus).where(and(eq(guruSectorConsensus.snapshotId, current.id), eq(guruSectorConsensus.dimension, 'SECTOR')))
  expect(sector).toMatchObject({
    name: 'Technology', buyerCount: 1, sellerCount: 0, currentHolderCount: 3,
    aggregateWeightPercent: '300.00000000', comparableCurrentAggregateWeightPercent: '200.00000000',
    previousAggregateWeightPercent: '200.00000000', aggregateWeightChangePoints: '0.00000000', direction: 'INCREASING',
  })
  const [theme] = await database.db.select().from(guruSectorConsensus).where(and(eq(guruSectorConsensus.snapshotId, current.id), eq(guruSectorConsensus.dimension, 'THEME')))
  expect(theme).toMatchObject({ dimensionKey: 'ai-infrastructure', name: 'AI Infrastructure', currentHolderCount: 3 })

  const routeApp = new Hono<AppEnv>()
  registerGuruConsensusRoutes(routeApp, { db: database.db, fail, validationError })
  const consensusResponse = await routeApp.request('/api/gurus/consensus?period=2026-06-30&sort=net-buyers')
  expect(consensusResponse.status).toBe(200)
  expect(await consensusResponse.json()).toMatchObject({ data: {
    period: { periodEnd: '2026-06-30', activeManagerCount: 4, readyManagerCount: 3, quarterCoveragePercent: '75' },
    items: [{ ticker: 'SYN', currentHolderCount: 3, netBuyerCount: 1, classification: 'ACCUMULATION' }],
  } })
  const stocksResponse = await routeApp.request('/api/gurus/stocks?period=2026-06-30&ranking=most-added')
  expect(stocksResponse.status).toBe(200)
  expect(await stocksResponse.json()).toMatchObject({ data: { ranking: 'most-added', items: [{ ticker: 'SYN' }] } })
  for (const ranking of ['most-held', 'most-added', 'most-reduced', 'most-new', 'most-exited', 'largest-weight', 'fastest-rising', 'fastest-falling']) {
    const response = await routeApp.request(`/api/gurus/stocks?period=2026-06-30&ranking=${ranking}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { ranking } })
  }
  const sectorsResponse = await routeApp.request('/api/gurus/sectors?period=2026-06-30&dimension=THEME')
  expect(sectorsResponse.status).toBe(200)
  expect(await sectorsResponse.json()).toMatchObject({ data: { dimension: 'THEME', items: [{ name: 'AI Infrastructure' }] } })
  const exportResponse = await routeApp.request('/api/gurus/stocks.csv?period=2026-06-30&ranking=most-held')
  expect(exportResponse.status).toBe(200)
  expect(exportResponse.headers.get('content-disposition')).toContain('guru-consensus-2026-06-30.csv')
  expect(await exportResponse.text()).toContain('"reported_period","source","quarter_coverage_percent","mapping_coverage_percent"')

  const request = await database.db.select().from(guruConsensusRebuildRequests).where(eq(guruConsensusRebuildRequests.periodEnd, '2026-06-30'))
  await database.db.update(institutionalFilings).set({ status: 'READY' }).where(eq(institutionalFilings.periodEnd, '2026-06-30'))
  const retry = await runPendingGuruConsensusRebuildOnce(database.db, new Date(Date.now() + 1000))
  expect(request.length).toBe(1)
  expect(retry).toMatchObject({ periodEnd: '2026-06-30', status: 'READY', changed: false, snapshotId: current.id })
  const after = await database.db.select().from(guruConsensusSnapshots).where(eq(guruConsensusSnapshots.periodEnd, '2026-06-30'))
  expect(after).toHaveLength(1)
  expect(await database.db.select().from(guruStockConsensus).where(eq(guruStockConsensus.snapshotId, current.id))).toHaveLength(1)
  expect(await runPendingGuruConsensusRebuildOnce(database.db, new Date(Date.now() + 1000))).toBeUndefined()
  expect(await database.db.select({ count: sql<number>`count(*)::int` }).from(guruConsensusSnapshots)).toMatchObject([{ count: 2 }])

  await database.db.update(guruThemeMappings).set({ themeName: 'AI Infrastructure Systems', version: 2 }).where(eq(guruThemeMappings.id, themeMapping!.id))
  const themeRebuilds = await drainConsensus()
  expect(themeRebuilds).toHaveLength(2)
  expect(themeRebuilds.every(item => item.status === 'READY' && item.changed)).toBe(true)
  const [refreshed] = await database.db.select().from(guruConsensusSnapshots).where(eq(guruConsensusSnapshots.periodEnd, '2026-06-30'))
  expect(refreshed).toMatchObject({ id: current.id })
  expect(refreshed!.inputHash).not.toBe(current.inputHash)
  expect(refreshed!.contextHash).not.toBe(current.contextHash)
  expect(refreshed!.themeMappingHash).not.toBe(current.themeMappingHash)
  const refreshedThemes = await database.db.select().from(guruSectorConsensus).where(and(eq(guruSectorConsensus.snapshotId, current.id), eq(guruSectorConsensus.dimension, 'THEME')))
  expect(refreshedThemes).toMatchObject([{ name: 'AI Infrastructure Systems' }])
  expect(await database.db.select({ count: sql<number>`count(*)::int` }).from(guruConsensusSnapshots)).toMatchObject([{ count: 2 }])
})

it('compares two, three, and five ready Gurus and serves stock ownership from prepared data only', async () => {
  const actor = (await database.db.insert(users).values({ email: `${randomUUID()}@example.test`, password: 'synthetic-test-password', role: 'ADMIN' }).returning())[0]!
  const [security] = await database.db.insert(institutionalSecurities).values({
    issuer: 'Synthetic Comparison Issuer', titleOfClass: 'Common Stock', securityType: 'EQUITY', sector: 'Technology', industry: 'Software',
    sourceUrl: 'https://issuer.example.test/security-comparison', sourceVerifiedBy: actor.id, sourceVerifiedAt: clock,
  }).returning()
  await database.db.insert(institutionalSecurityIdentifiers).values({
    securityId: security!.id, type: 'TICKER', value: 'T09', validFrom: '2020-01-01', validTo: null,
    sourceUrl: 'https://issuer.example.test/ticker-comparison', sourceVerifiedBy: actor.id, sourceVerifiedAt: clock, createdAt: clock,
  })
  const managers = await Promise.all(['North', 'South', 'East', 'West', 'Central'].map(name => createGuru(`Synthetic ${name} Comparison`)))
  for (let index = 0; index < managers.length; index += 1) {
    await publish({ managerId: managers[index]!.managerId, periodEnd: '2026-03-31', securityId: security!.id, quantity: '100', reportedValue: '1000' })
    const currentQuantity = index === 0 ? '150' : index === 1 ? '50' : '100'
    await publish({ managerId: managers[index]!.managerId, periodEnd: '2026-06-30', securityId: security!.id, quantity: currentQuantity, reportedValue: '1000' })
  }
  await drainAnalytics()
  await drainConsensus()

  const routeApp = new Hono<AppEnv>()
  registerGuruComparisonRoutes(routeApp, { db: database.db, now: () => clock, fail, validationError })
  const slugs = managers.map(manager => database.db.select({ slug: gurus.slug }).from(gurus).where(eq(gurus.managerId, manager.managerId)).then(rows => rows[0]!.slug))
  const selected = await Promise.all(slugs)
  for (const count of [2, 3, 5]) {
    const response = await routeApp.request(`/api/gurus/compare?slugs=${selected.slice(0, count).join(',')}`)
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { selectedGuruCount: number; readyGuruCount: number; periodEnd: string; commonHoldings: Array<{ ticker: string | null; heldByCount: number; readyGuruCount: number }>; quarterMoves: Array<{ ticker: string | null; members: Array<{ action: string }> }>; opposingActions: Array<{ ticker: string | null; members: Array<{ action: string }> }> } }
    expect(body.data).toMatchObject({ selectedGuruCount: count, readyGuruCount: count, periodEnd: '2026-06-30' })
    expect(body.data.commonHoldings).toContainEqual(expect.objectContaining({ ticker: 'T09', heldByCount: count, readyGuruCount: count }))
    expect(body.data.quarterMoves.find(item => item.ticker === 'T09')?.members.map(member => member.action)).toEqual(expect.arrayContaining(['STRONG_ADD', 'STRONG_REDUCE']))
    if (count >= 2) expect(body.data.opposingActions.find(item => item.ticker === 'T09')?.members.map(member => member.action)).toEqual(expect.arrayContaining(['STRONG_ADD', 'STRONG_REDUCE']))
  }

  const readyStock = await routeApp.request('/api/stocks/T09/gurus?period=2026-06-30')
  expect(readyStock.status).toBe(200)
  expect(await readyStock.json()).toMatchObject({ data: {
    summary: { symbol: 'T09', mappingStatus: 'MATCHED', dataStatus: 'READY', currentHolderCount: 5 },
    currentHolders: expect.arrayContaining([expect.objectContaining({ profile: expect.objectContaining({ name: 'Synthetic North Comparison' }), action: 'STRONG_ADD' })]),
    history: expect.arrayContaining([expect.objectContaining({ periodEnd: '2026-06-30', status: 'READY', holderCount: 5 })]),
  } })

  await database.db.update(guruConsensusRebuildRequests).set({ requestedRevision: 2n, processedRevision: 1n }).where(eq(guruConsensusRebuildRequests.periodEnd, '2026-06-30'))
  const pendingStock = await routeApp.request('/api/stocks/T09/gurus?period=2026-06-30')
  expect(await pendingStock.json()).toMatchObject({ data: {
    summary: { dataStatus: 'PENDING', currentHolderCount: null, netBuyerCount: null }, currentHolders: [], latestMoves: [],
    history: expect.arrayContaining([expect.objectContaining({ periodEnd: '2026-06-30', status: 'PENDING', holderCount: null })]),
  } })
  const unmappedStock = await routeApp.request('/api/stocks/ZZZ/gurus?period=2026-06-30')
  expect(await unmappedStock.json()).toMatchObject({ data: { summary: { mappingStatus: 'UNRESOLVED', dataStatus: 'UNAVAILABLE', currentHolderCount: null } } })
  const unavailableQuarter = await routeApp.request('/api/stocks/T09/gurus?period=2025-06-30')
  expect(await unavailableQuarter.json()).toMatchObject({ data: {
    summary: { mappingStatus: 'MATCHED', dataStatus: 'UNAVAILABLE', currentHolderCount: null },
    history: expect.arrayContaining([expect.objectContaining({ periodEnd: '2025-06-30', status: 'UNAVAILABLE', holderCount: null })]),
  } })
})
