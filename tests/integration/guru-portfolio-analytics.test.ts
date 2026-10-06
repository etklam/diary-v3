import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  guruAnalyticsEventDeliveries,
  guruHoldingChanges,
  guruQuarterAnalytics,
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
import { runPendingGuruPortfolioAnalyticsOnce } from '../../apps/api/src/institutional/portfolio-analytics.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let managerNumber = 720000
let filingNumber = 1
const clock = new Date('2026-10-06T12:00:00Z')
beforeAll(async () => { database = await provisionTestDatabase('guru_portfolio_analytics') })
afterAll(async () => { await database?.dispose() })

function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }

async function createManager() {
  const [row] = await database.db.insert(institutionalManagers).values({ cik: String(managerNumber++).padStart(10, '0') }).returning()
  return row!
}

async function createActor() {
  const [row] = await database.db.insert(users).values({ email: `${randomUUID()}@example.test`, password: 'synthetic-test-password', role: 'ADMIN' }).returning()
  return row!
}

async function createSecurity(actorId: bigint, input: { issuer: string; ticker: string; sector?: string }) {
  const [security] = await database.db.insert(institutionalSecurities).values({
    issuer: input.issuer, titleOfClass: 'Common Stock', securityType: 'EQUITY', sector: input.sector ?? null,
    industry: input.sector ? `${input.sector} Industry` : null,
    sourceUrl: 'https://issuer.example.test/security', sourceVerifiedBy: actorId, sourceVerifiedAt: clock,
  }).returning()
  await database.db.insert(institutionalSecurityIdentifiers).values({
    securityId: security!.id, type: 'TICKER', value: input.ticker, validFrom: '2020-01-01', validTo: null,
    sourceUrl: 'https://issuer.example.test/ticker', sourceVerifiedBy: actorId, sourceVerifiedAt: clock, createdAt: clock,
  })
  return security!
}

interface HoldingFixture {
  securityId: bigint
  quantity: string
  reportedValue: string
}

async function publishSnapshot(input: {
  managerId: bigint
  periodEnd: string
  holdings: HoldingFixture[]
  emitEvent?: boolean
  supersedesSnapshotId?: bigint
}) {
  const accession = `${String(input.managerId).padStart(10, '0')}-26-${String(filingNumber++).padStart(6, '0')}`
  const [filing] = await database.db.insert(institutionalFilings).values({
    managerId: input.managerId, accession, form: '13F-HR', isAmendment: false, filingDate: input.periodEnd,
    filedAt: clock, periodEnd: input.periodEnd, sourceUrl: `https://www.sec.gov/fixture/${accession}`,
    status: 'READY', parserVersion: 'analytics-fixture-v1', parsedRowCount: input.holdings.length, rejectedRowCount: 0,
  }).returning()
  const [document] = await database.db.insert(institutionalFilingDocuments).values({
    filingId: filing!.id, basename: 'information.xml', sourceUrl: filing!.sourceUrl, isPrimary: true,
  }).returning()
  const body = `<fixture>${accession}</fixture>`
  const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
    documentId: document!.id, contentSha256: digest(body), artifactRef: `synthetic:${accession}`,
    rawContent: body, contentLength: BigInt(body.length), fetchedAt: clock,
  }).returning()
  const snapshotHash = digest(input.holdings.map(holding => `${holding.securityId}:${holding.quantity}:${holding.reportedValue}`).join('|'))
  const [snapshot] = await database.db.insert(institutionalEffectiveSnapshots).values({
    managerId: input.managerId, periodEnd: input.periodEnd, replayKey: digest(`replay:${snapshotHash}:${randomUUID()}`),
    snapshotHash, sourceManifestHash: digest(`manifest:${accession}`), resolverVersion: 'analytics-fixture-v1',
    holdingCount: input.holdings.length, createdAt: clock,
  }).returning()
  if (input.holdings.length) await database.db.insert(institutionalEffectiveHoldings).values(input.holdings.map((holding, index) => ({
    snapshotId: snapshot!.id, ordinal: index, sourceFilingId: filing!.id, sourceDocumentId: document!.id, sourceArtifactId: artifact!.id,
    sourceRowKey: digest(`${accession}:${index}`), sourceRowNumber: index + 1,
    securityId: holding.securityId, mappingStatus: 'MATCHED' as const, mappingVersion: 'analytics-fixture-v1',
    issuer: `Fixture Issuer ${holding.securityId}`, titleOfClass: 'Common Stock', cusip: null, figi: null,
    reportedValue: holding.reportedValue, reportedValueUnit: 'USD', quantity: holding.quantity, quantityType: 'SH' as const, putCall: null,
    sourceData: { accession, sourceUrl: filing!.sourceUrl },
  })))
  if (input.supersedesSnapshotId) await database.db.update(institutionalEffectiveSnapshotPublications).set({
    active: false, status: 'SUPERSEDED', updatedAt: clock,
  }).where(eq(institutionalEffectiveSnapshotPublications.snapshotId, input.supersedesSnapshotId))
  await database.db.insert(institutionalEffectiveSnapshotPublications).values({
    snapshotId: snapshot!.id, managerId: input.managerId, periodEnd: input.periodEnd, status: 'READY', active: true, updatedAt: clock,
  })
  await database.db.insert(institutionalEffectivePeriodStates).values({
    managerId: input.managerId, periodEnd: input.periodEnd, status: 'READY', reason: null,
    sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  }).onConflictDoUpdate({ target: [institutionalEffectivePeriodStates.managerId, institutionalEffectivePeriodStates.periodEnd], set: {
    status: 'READY', reason: null, sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  } })
  if (input.emitEvent) await database.db.insert(institutionalSnapshotChangeEvents).values({
    managerId: input.managerId, periodEnd: input.periodEnd, snapshotId: snapshot!.id,
    previousSnapshotId: input.supersedesSnapshotId ?? null, createdAt: clock,
  })
  return snapshot!
}

it('consumes snapshot events idempotently and persists versioned changes, USD weights, and sector allocation', async () => {
  const owner = await createManager()
  const actor = await createActor()
  const alpha = await createSecurity(actor.id, { issuer: 'Synthetic Alpha', ticker: 'AAA', sector: 'Technology' })
  const beta = await createSecurity(actor.id, { issuer: 'Synthetic Beta', ticker: 'BBB', sector: 'Finance' })
  await publishSnapshot({ managerId: owner.id, periodEnd: '2026-03-31', emitEvent: true, holdings: [
    { securityId: alpha.id, quantity: '100', reportedValue: '600' }, { securityId: beta.id, quantity: '100', reportedValue: '400' },
  ] })
  await publishSnapshot({ managerId: owner.id, periodEnd: '2026-06-30', emitEvent: true, holdings: [
    { securityId: alpha.id, quantity: '150', reportedValue: '700' }, { securityId: beta.id, quantity: '100', reportedValue: '300' },
  ] })

  const first = await runPendingGuruPortfolioAnalyticsOnce(database.db, clock)
  expect(first).toMatchObject({ status: 'READY', managerId: owner.id, periodEnd: '2026-03-31' })
  const [quarter] = await database.db.select().from(guruQuarterAnalytics).where(and(
    eq(guruQuarterAnalytics.managerId, owner.id), eq(guruQuarterAnalytics.periodEnd, '2026-06-30'),
  ))
  expect(quarter).toMatchObject({
    analyticsVersion: 'guru-portfolio-analytics-v1', status: 'READY', comparisonStatus: 'COMPARABLE',
    reportedValueUsd: '1000.00000000', holdingCount: 2, mappingCoveragePercent: '100.00000000',
    newCount: 0, strongAddCount: 1, unchangedCount: 1, exitCount: 0,
    disclosedWeightTurnoverPercent: '10.00000000', turnoverBand: 'MODERATE',
  })
  const storedChanges = await database.db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, quarter!.id)).orderBy(asc(guruHoldingChanges.positionKey))
  expect(storedChanges).toHaveLength(2)
  expect(storedChanges.find(change => change.securityId === alpha.id)).toMatchObject({ action: 'STRONG_ADD', quantityChangePercent: '50.00000000', ticker: 'AAA' })
  const q2Delivery = await database.db.select().from(guruAnalyticsEventDeliveries).where(eq(guruAnalyticsEventDeliveries.eventId, first!.eventId))
  expect(q2Delivery).toHaveLength(1)

  const beforeReplay = quarter!.inputHash
  expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 1000))).toMatchObject({ status: 'READY', periodEnd: '2026-06-30' })
  const [afterReplay] = await database.db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.id, quarter!.id))
  expect(afterReplay?.inputHash).toBe(beforeReplay)
  expect(await database.db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, quarter!.id))).toHaveLength(2)
})

it('rebuilds analytics when a published quarter becomes partial and restores changes when it returns to ready', async () => {
  const owner = await createManager()
  const actor = await createActor()
  const alpha = await createSecurity(actor.id, { issuer: 'Synthetic Quality Alpha', ticker: 'QAA' })
  const beta = await createSecurity(actor.id, { issuer: 'Synthetic Quality Beta', ticker: 'QBB' })
  await publishSnapshot({ managerId: owner.id, periodEnd: '2026-03-31', holdings: [
    { securityId: alpha.id, quantity: '100', reportedValue: '600' }, { securityId: beta.id, quantity: '100', reportedValue: '400' },
  ] })
  const current = await publishSnapshot({ managerId: owner.id, periodEnd: '2026-06-30', emitEvent: true, holdings: [
    { securityId: alpha.id, quantity: '150', reportedValue: '700' }, { securityId: beta.id, quantity: '100', reportedValue: '300' },
  ] })
  expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, clock)).toMatchObject({ status: 'READY', periodEnd: '2026-06-30' })
  const [analytics] = await database.db.select().from(guruQuarterAnalytics).where(and(
    eq(guruQuarterAnalytics.managerId, owner.id), eq(guruQuarterAnalytics.periodEnd, '2026-06-30'),
  ))
  expect(analytics).toMatchObject({ status: 'READY', strongAddCount: 1, result: expect.any(Object) })
  expect(await database.db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, analytics!.id))).toHaveLength(2)

  const enqueueStateEvent = async (status: 'PARTIAL' | 'READY', reason: string | null) => {
    await database.db.update(institutionalEffectivePeriodStates).set({ status, reason, checkedAt: new Date(clock.getTime() + 1000) }).where(and(
      eq(institutionalEffectivePeriodStates.managerId, owner.id), eq(institutionalEffectivePeriodStates.periodEnd, '2026-06-30'),
    ))
    await database.db.insert(institutionalSnapshotChangeEvents).values({
      managerId: owner.id, periodEnd: '2026-06-30', snapshotId: current.id,
      eventType: 'EFFECTIVE_PERIOD_STATE_CHANGED', createdAt: new Date(clock.getTime() + 1000),
    })
  }

  await enqueueStateEvent('PARTIAL', 'REBUILD_PENDING')
  expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 1000))).toMatchObject({ status: 'READY', periodEnd: '2026-06-30' })
  const [partial] = await database.db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.id, analytics!.id))
  expect(partial).toMatchObject({ status: 'PARTIAL', comparisonStatus: 'CURRENT_PARTIAL', result: null, addCount: 0, strongAddCount: 0, exitCount: 0 })
  expect(await database.db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, analytics!.id))).toHaveLength(0)

  await enqueueStateEvent('READY', null)
  expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 2000))).toMatchObject({ status: 'READY', periodEnd: '2026-06-30' })
  const [restored] = await database.db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.id, analytics!.id))
  expect(restored).toMatchObject({ status: 'READY', strongAddCount: 1, result: expect.any(Object) })
  expect(await database.db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, analytics!.id))).toHaveLength(2)
})

it('rebuilds the following quarter after a prior snapshot correction without duplicating rows', async () => {
  const owner = await createManager()
  const actor = await createActor()
  const alpha = await createSecurity(actor.id, { issuer: 'Synthetic Continuity', ticker: 'CCC', sector: 'Technology' })
  const beta = await createSecurity(actor.id, { issuer: 'Synthetic Stable', ticker: 'DDD', sector: 'Finance' })
  const q1 = await publishSnapshot({ managerId: owner.id, periodEnd: '2026-03-31', emitEvent: true, holdings: [
    { securityId: alpha.id, quantity: '100', reportedValue: '600' }, { securityId: beta.id, quantity: '100', reportedValue: '400' },
  ] })
  await publishSnapshot({ managerId: owner.id, periodEnd: '2026-06-30', emitEvent: true, holdings: [
    { securityId: alpha.id, quantity: '150', reportedValue: '700' }, { securityId: beta.id, quantity: '100', reportedValue: '300' },
  ] })
  await runPendingGuruPortfolioAnalyticsOnce(database.db, clock)
  const [before] = await database.db.select().from(guruQuarterAnalytics).where(and(
    eq(guruQuarterAnalytics.managerId, owner.id), eq(guruQuarterAnalytics.periodEnd, '2026-06-30'),
  ))
  expect(before?.strongAddCount).toBe(1)

  await publishSnapshot({ managerId: owner.id, periodEnd: '2026-03-31', supersedesSnapshotId: q1.id, emitEvent: true, holdings: [
    { securityId: alpha.id, quantity: '120', reportedValue: '500' }, { securityId: beta.id, quantity: '100', reportedValue: '500' },
  ] })
  await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 1000))
  const [after] = await database.db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.id, before!.id))
  expect(after?.inputHash).not.toBe(before?.inputHash)
  expect(after?.addCount).toBe(1)
  expect(after?.strongAddCount).toBe(0)
  expect(await database.db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, before!.id))).toHaveLength(2)
  expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 2000))).toMatchObject({ status: 'READY', periodEnd: '2026-03-31' })
})

it('updates source lineage without changing the structured context hash when normalized analytics are identical', async () => {
  const owner = await createManager()
  const actor = await createActor()
  const alpha = await createSecurity(actor.id, { issuer: 'Synthetic Hash Alpha', ticker: 'HAA' })
  const beta = await createSecurity(actor.id, { issuer: 'Synthetic Hash Beta', ticker: 'HBB' })
  const priorRows = [
    { securityId: alpha.id, quantity: '100', reportedValue: '600' },
    { securityId: beta.id, quantity: '100', reportedValue: '400' },
  ]
  const q1 = await publishSnapshot({ managerId: owner.id, periodEnd: '2026-03-31', emitEvent: true, holdings: priorRows })
  await publishSnapshot({ managerId: owner.id, periodEnd: '2026-06-30', emitEvent: true, holdings: [
    { securityId: alpha.id, quantity: '110', reportedValue: '620' }, { securityId: beta.id, quantity: '100', reportedValue: '380' },
  ] })
  await runPendingGuruPortfolioAnalyticsOnce(database.db, clock)
  const [before] = await database.db.select().from(guruQuarterAnalytics).where(and(
    eq(guruQuarterAnalytics.managerId, owner.id), eq(guruQuarterAnalytics.periodEnd, '2026-06-30'),
  ))

  const replacement = await publishSnapshot({ managerId: owner.id, periodEnd: '2026-03-31', supersedesSnapshotId: q1.id, emitEvent: true, holdings: priorRows })
  await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 1000))
  const [after] = await database.db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.id, before!.id))
  const [q2Publication] = await database.db.select().from(institutionalEffectiveSnapshotPublications).where(and(
    eq(institutionalEffectiveSnapshotPublications.managerId, owner.id),
    eq(institutionalEffectiveSnapshotPublications.periodEnd, '2026-06-30'),
    eq(institutionalEffectiveSnapshotPublications.active, true),
  ))
  expect(after?.snapshotId).toBe(q2Publication?.snapshotId)
  expect(after?.previousSnapshotId).toBe(replacement.id)
  expect(after?.inputHash).not.toBe(before?.inputHash)
  expect(after?.contextHash).toBe(before?.contextHash)
  expect(await database.db.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, before!.id))).toHaveLength(2)
  expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 2000))).toMatchObject({ status: 'READY', periodEnd: '2026-03-31' })
})

it('records failed event attempts, backs off, and replays the transaction after restart', async () => {
  const owner = await createManager()
  const actor = await createActor()
  const alpha = await createSecurity(actor.id, { issuer: 'Synthetic Retry', ticker: 'EEE' })
  await publishSnapshot({ managerId: owner.id, periodEnd: '2026-03-31', holdings: [{ securityId: alpha.id, quantity: '100', reportedValue: '100' }] })
  const current = await publishSnapshot({ managerId: owner.id, periodEnd: '2026-06-30', emitEvent: true, holdings: [{ securityId: alpha.id, quantity: '120', reportedValue: '100' }] })
  const [event] = await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.snapshotId, current.id))
  await database.pool.query("create function fail_guru_analytics_fixture() returns trigger language plpgsql as $$ begin raise exception 'Synthetic analytics write failure'; end $$")
  await database.pool.query('create trigger fail_guru_analytics_fixture before insert on guru_quarter_analytics for each row execute function fail_guru_analytics_fixture()')
  try {
    expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, clock)).toMatchObject({ status: 'ERROR', eventId: event!.id })
  } finally {
    await database.pool.query('drop trigger fail_guru_analytics_fixture on guru_quarter_analytics')
    await database.pool.query('drop function fail_guru_analytics_fixture()')
  }
  const [delivery] = await database.db.select().from(guruAnalyticsEventDeliveries).where(eq(guruAnalyticsEventDeliveries.eventId, event!.id))
  expect(delivery).toMatchObject({ attemptCount: 1, lastError: 'GURU_ANALYTICS_REBUILD_FAILED', processedAt: null })
  expect(await database.db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.managerId, owner.id))).toHaveLength(0)
  expect(await runPendingGuruPortfolioAnalyticsOnce(database.db, new Date(clock.getTime() + 60_000))).toMatchObject({ status: 'READY', eventId: event!.id })
  expect(await database.db.select().from(guruAnalyticsEventDeliveries).where(eq(guruAnalyticsEventDeliveries.eventId, event!.id))).toMatchObject([
    expect.objectContaining({ attemptCount: 1, processedAt: expect.any(Date), lastError: null }),
  ])
  expect(await database.db.select().from(guruQuarterAnalytics).where(eq(guruQuarterAnalytics.managerId, owner.id))).toHaveLength(1)
})
