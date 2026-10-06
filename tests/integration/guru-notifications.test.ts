import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import {
  diaryGuruSnapshotListResponseSchema,
  diaryGuruSnapshotResponseSchema,
  guruNotificationListResponseSchema,
  guruNotificationPreferencesResponseSchema,
  guruStockWatchResponseSchema,
} from '@diary/contracts'
import {
  guruNotifications,
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
} from '@diary/db'
import { createApp } from '../../apps/api/src/app'
import { runPendingGuruPortfolioAnalyticsOnce } from '../../apps/api/src/institutional/portfolio-analytics.js'
import { runPendingGuruConsensusRebuildOnce } from '../../apps/api/src/institutional/guru-consensus.js'
import { runPendingGuruFollowNotificationsOnce, runPendingGuruStockNotificationsOnce } from '../../apps/api/src/guru-notifications/worker.js'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date
let guru: typeof gurus.$inferSelect
let securityId: bigint
let filingNumber = 1
let managerNumber = 980000
let ticker = 'SYNW0'

function digest(value: string) { return createHash('sha256').update(value).digest('hex') }

beforeAll(async () => { database = await provisionTestDatabase('guru_notifications') })
afterAll(async () => { await database?.dispose() })

beforeEach(async () => {
  clock = new Date('2026-09-01T10:00:00.000Z')
  const app = createApp({
    db: database.db, databasePool: database.pool, now: () => clock,
    config: { jwtSecret: 'synthetic-guru-notifications-secret-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const verifier = await database.pool.query('insert into users(email,password,role) values ($1,$2,$3) returning id', [`${randomUUID()}@example.test`, 'synthetic', 'ADMIN'])
  const [security] = await database.db.insert(institutionalSecurities).values({
    issuer: 'Synthetic Watch Issuer', titleOfClass: 'Common Stock', securityType: 'EQUITY', sector: 'Technology', industry: 'Software',
    sourceUrl: 'https://issuer.example.test/security', sourceVerifiedBy: BigInt(verifier.rows[0].id), sourceVerifiedAt: clock,
  }).returning()
  securityId = security!.id
  ticker = `SYNW${String(managerNumber).slice(-4)}`
  await database.db.insert(institutionalSecurityIdentifiers).values({
    securityId, type: 'TICKER', value: ticker, validFrom: '2020-01-01', validTo: null,
    sourceUrl: 'https://issuer.example.test/ticker', sourceVerifiedBy: BigInt(verifier.rows[0].id), sourceVerifiedAt: clock, createdAt: clock,
  })
  const cik = String(managerNumber++).padStart(10, '0')
  const [manager] = await database.db.insert(institutionalManagers).values({ cik }).returning()
  const [profile] = await database.db.insert(gurus).values({
    managerId: manager!.id, slug: `watch-guru-${cik}`, name: 'Synthetic Watch Capital', managerName: 'Synthetic Watch Management',
  }).returning()
  guru = profile!
})
afterEach(async () => { server.close(); await once(server, 'close') })

async function member() {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-member-password'
  const inserted = await database.pool.query('insert into users(email,password) values ($1,$2) returning id', [email, await bcrypt.hash(password, 4)])
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return { browser, id: BigInt(inserted.rows[0].id) }
}

function put(browser: BrowserSession, path: string, body: unknown = {}) {
  return browser.request(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! },
    body: JSON.stringify(body),
  })
}

async function publish(input: { periodEnd: string; quantity: string; reportedValue: string; managerId?: bigint; securityId?: bigint }) {
  const managerId = input.managerId ?? guru.managerId
  const holdingSecurityId = input.securityId ?? securityId
  const accession = `${String(managerId).padStart(10, '0')}-26-${String(filingNumber++).padStart(6, '0')}`
  const sourceUrl = `https://www.sec.gov/fixture/${accession}`
  const [filing] = await database.db.insert(institutionalFilings).values({
    managerId, accession, form: '13F-HR', isAmendment: false, filingDate: input.periodEnd,
    filedAt: clock, periodEnd: input.periodEnd, sourceUrl, status: 'READY', parserVersion: 'notify-fixture-v1',
    parsedRowCount: 1, rejectedRowCount: 0,
  }).returning()
  const [document] = await database.db.insert(institutionalFilingDocuments).values({ filingId: filing!.id, basename: 'information.xml', sourceUrl, isPrimary: true }).returning()
  const body = `<fixture>${accession}</fixture>`
  const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
    documentId: document!.id, contentSha256: digest(body), artifactRef: `synthetic:${accession}`,
    rawContent: body, contentLength: BigInt(body.length), fetchedAt: clock,
  }).returning()
  const snapshotHash = digest(`${holdingSecurityId}:${input.quantity}:${input.reportedValue}`)
  const [snapshot] = await database.db.insert(institutionalEffectiveSnapshots).values({
    managerId, periodEnd: input.periodEnd, replayKey: digest(`replay:${snapshotHash}:${randomUUID()}`),
    snapshotHash, sourceManifestHash: digest(`manifest:${accession}`), resolverVersion: 'notify-fixture-v1', holdingCount: 1, createdAt: clock,
  }).returning()
  await database.db.insert(institutionalEffectiveHoldings).values({
    snapshotId: snapshot!.id, ordinal: 0, sourceFilingId: filing!.id, sourceDocumentId: document!.id, sourceArtifactId: artifact!.id,
    sourceRowKey: digest(`row:${accession}`), sourceRowNumber: 1, securityId: holdingSecurityId,
    mappingStatus: 'MATCHED', mappingVersion: 'notify-fixture-v1', issuer: 'Synthetic Watch Issuer', titleOfClass: 'Common Stock',
    cusip: null, figi: null, reportedValue: input.reportedValue, reportedValueUnit: 'USD', quantity: input.quantity,
    quantityType: 'SH', putCall: null, sourceData: { accession, sourceUrl },
  })
  await database.db.update(institutionalEffectiveSnapshotPublications).set({ status: 'SUPERSEDED', active: false, updatedAt: clock })
    .where(and(
      eq(institutionalEffectiveSnapshotPublications.managerId, managerId),
      eq(institutionalEffectiveSnapshotPublications.periodEnd, input.periodEnd),
    ))
  await database.db.insert(institutionalEffectiveSnapshotPublications).values({
    snapshotId: snapshot!.id, managerId, periodEnd: input.periodEnd, status: 'READY', active: true, updatedAt: clock,
  })
  await database.db.insert(institutionalEffectivePeriodStates).values({
    managerId, periodEnd: input.periodEnd, status: 'READY', reason: null,
    sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  }).onConflictDoUpdate({ target: [institutionalEffectivePeriodStates.managerId, institutionalEffectivePeriodStates.periodEnd], set: {
    status: 'READY', reason: null, sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  } })
  await database.db.insert(institutionalSnapshotChangeEvents).values({
    managerId, periodEnd: input.periodEnd, snapshotId: snapshot!.id, createdAt: clock,
  })
  return { accession, filingId: filing!.id }
}

async function drain(run: () => Promise<unknown>) {
  for (let count = 0; count < 20; count += 1) if (!await run()) return
  throw new Error('QUEUE_DID_NOT_DRAIN')
}

async function otherSecurity() {
  const verifier = await database.pool.query('insert into users(email,password,role) values ($1,$2,$3) returning id', [`${randomUUID()}@example.test`, 'synthetic', 'ADMIN'])
  const [other] = await database.db.insert(institutionalSecurities).values({
    issuer: `Synthetic Other Issuer ${randomUUID().slice(0, 8)}`, titleOfClass: 'Common Stock', securityType: 'EQUITY',
    sector: 'Industrials', industry: 'Machinery', sourceUrl: 'https://issuer.example.test/other',
    sourceVerifiedBy: BigInt(verifier.rows[0].id), sourceVerifiedAt: clock,
  }).returning()
  return other!.id
}

/** A manager whose previous quarter is comparable, so the watched stock is a genuine new buy. */
async function newEntrant() {
  const cik = String(managerNumber++).padStart(10, '0')
  const [manager] = await database.db.insert(institutionalManagers).values({ cik }).returning()
  await database.db.insert(gurus).values({
    managerId: manager!.id, slug: `entrant-guru-${cik}`, name: 'Synthetic Entrant Capital', managerName: 'Synthetic Entrant Management',
  })
  await publish({ periodEnd: '2026-03-31', quantity: '600', reportedValue: '6000', managerId: manager!.id, securityId: await otherSecurity() })
  return manager!.id
}

async function preparedQuarters(options: { withEntrant?: boolean } = {}) {
  await publish({ periodEnd: '2026-03-31', quantity: '100', reportedValue: '1000' })
  await publish({ periodEnd: '2026-06-30', quantity: '400', reportedValue: '4000' })
  if (options.withEntrant) await publish({ periodEnd: '2026-06-30', quantity: '250', reportedValue: '2500', managerId: await newEntrant() })
  await drain(() => runPendingGuruPortfolioAnalyticsOnce(database.db, clock))
  await drain(() => runPendingGuruConsensusRebuildOnce(database.db, new Date(Date.now() + 1_000)))
}

async function drainFollowNotifications() {
  let delivered = 0
  for (let count = 0; count < 20; count += 1) {
    const result = await runPendingGuruFollowNotificationsOnce(database.db, clock)
    if (!result) return delivered
    if (result.status === 'PROCESSED') delivered += result.delivered
  }
  throw new Error('NOTIFICATION_QUEUE_DID_NOT_DRAIN')
}

async function drainStockNotifications() {
  let delivered = 0
  for (let count = 0; count < 20; count += 1) {
    const result = await runPendingGuruStockNotificationsOnce(database.db, clock)
    if (!result) return delivered
    if (result.status === 'PROCESSED') delivered += result.delivered
  }
  throw new Error('STOCK_NOTIFICATION_QUEUE_DID_NOT_DRAIN')
}

it('delivers followed-Guru events once, honours thresholds, and never duplicates on retry', async () => {
  const follower = await member()
  const quiet = await member()
  for (const account of [follower, quiet]) {
    expect((await put(account.browser, `/api/gurus/${guru.slug}/follow`)).status).toBe(200)
  }
  expect((await put(quiet.browser, '/api/gurus/notifications/preferences', {
    newFiling: false, newPosition: true, exitedPosition: true, strongAdd: true, strongReduce: true,
    newStockHolder: true, consensusChange: false, minWeightPercent: '99', minQuantityChangePercent: null,
  })).status).toBe(200)

  await preparedQuarters()
  const delivered = await drainFollowNotifications()
  expect(delivered).toBeGreaterThan(0)

  const inbox = guruNotificationListResponseSchema.parse(await (await follower.browser.request('/api/gurus/notifications')).json())
  expect(inbox.unreadCount).toBe(inbox.data.length)
  expect(inbox.data.some(row => row.eventType === 'NEW_FILING')).toBe(true)
  expect(inbox.data.some(row => row.eventType === 'STRONG_ADD' || row.eventType === 'NEW_POSITION')).toBe(true)
  expect(inbox.data.every(row => row.guru?.slug === guru.slug)).toBe(true)

  // The quiet member disabled filings and set a weight threshold no move clears.
  const quietInbox = guruNotificationListResponseSchema.parse(await (await quiet.browser.request('/api/gurus/notifications')).json())
  expect(quietInbox.data.some(row => row.eventType === 'NEW_FILING')).toBe(false)
  expect(quietInbox.data.length).toBeLessThan(inbox.data.length)

  // A retried delivery job must not notify twice.
  const before = await database.db.select().from(guruNotifications)
  await database.pool.query('update guru_notification_event_deliveries set processed_at = null, next_attempt_at = $1', [clock])
  expect(await drainFollowNotifications()).toBe(0)
  const after = await database.db.select().from(guruNotifications)
  expect(after).toHaveLength(before.length)
})

it('delivers watched-stock events idempotently and keeps watch state private to its owner', async () => {
  const watcher = await member()
  const other = await member()
  await preparedQuarters({ withEntrant: true })
  await drainFollowNotifications()

  const watch = guruStockWatchResponseSchema.parse(await (await put(watcher.browser, `/api/stocks/${ticker}/guru-watch`)).json())
  expect(watch.data).toMatchObject({ watching: true, symbol: ticker })
  expect(guruStockWatchResponseSchema.parse(await (await other.browser.request(`/api/stocks/${ticker}/guru-watch`)).json()).data.watching).toBe(false)

  expect(await drainStockNotifications()).toBeGreaterThan(0)
  const inbox = guruNotificationListResponseSchema.parse(await (await watcher.browser.request('/api/gurus/notifications')).json())
  expect(inbox.data.some(row => row.eventType === 'NEW_STOCK_HOLDER')).toBe(true)
  const otherInbox = guruNotificationListResponseSchema.parse(await (await other.browser.request('/api/gurus/notifications')).json())
  expect(otherInbox.data).toHaveLength(0)

  const before = await database.db.select().from(guruNotifications)
  await database.pool.query('update guru_notification_consensus_deliveries set processed_at = null, next_attempt_at = $1', [clock])
  expect(await drainStockNotifications()).toBe(0)
  expect(await database.db.select().from(guruNotifications)).toHaveLength(before.length)

  const preferences = guruNotificationPreferencesResponseSchema.parse(await (await watcher.browser.request('/api/gurus/notifications/preferences')).json())
  expect(preferences.data.watchedStocks).toMatchObject([{ symbol: ticker }])
  const otherPreferences = guruNotificationPreferencesResponseSchema.parse(await (await other.browser.request('/api/gurus/notifications/preferences')).json())
  expect(otherPreferences.data.watchedStocks).toHaveLength(0)
  expect((await database.pool.query('select count(*)::int as count from guru_stock_watches')).rows[0].count).toBe(1)
})

it('attaches an immutable decision-time snapshot of prepared context only, scoped to its owner', async () => {
  const author = await member()
  const stranger = await member()
  await preparedQuarters()
  const diary = await database.pool.query(
    "insert into diaries(user_id,title,content,date) values ($1,'Synthetic decision','Recorded a decision.','2026-09-01') returning id",
    [author.id],
  )
  const diaryId = String(diary.rows[0].id)

  const created = await author.browser.post(`/api/diaries/${diaryId}/guru-snapshots`, { symbol: ticker })
  expect(created.status).toBe(201)
  const snapshot = diaryGuruSnapshotResponseSchema.parse(await created.json())
  expect(snapshot).toMatchObject({ reused: false, data: { symbol: ticker, periodEnd: '2026-06-30' } })
  expect(snapshot.data.context.source).toBe('prepared-institutional-analytics')
  expect(snapshot.data.context.holders.some(holder => holder.guruSlug === guru.slug)).toBe(true)
  expect(JSON.stringify(snapshot.data.context)).not.toMatch(/executiveSummary|interpretation|caveatIds/i)
  const captured = JSON.stringify(snapshot.data)

  const repeated = await author.browser.post(`/api/diaries/${diaryId}/guru-snapshots`, { symbol: ticker })
  expect(repeated.status).toBe(200)
  expect(diaryGuruSnapshotResponseSchema.parse(await repeated.json()).reused).toBe(true)

  // Rebuild the quarter. The attached snapshot must not change.
  await publish({ periodEnd: '2026-06-30', quantity: '900', reportedValue: '9000' })
  await drain(() => runPendingGuruPortfolioAnalyticsOnce(database.db, clock))
  await drain(() => runPendingGuruConsensusRebuildOnce(database.db, new Date(Date.now() + 2_000)))
  const reread = diaryGuruSnapshotListResponseSchema.parse(await (await author.browser.request(`/api/diaries/${diaryId}/guru-snapshots`)).json())
  expect(reread.data).toHaveLength(1)
  expect(JSON.stringify(reread.data[0])).toBe(captured)

  expect((await stranger.browser.request(`/api/diaries/${diaryId}/guru-snapshots`)).status).toBe(404)
  expect((await stranger.browser.post(`/api/diaries/${diaryId}/guru-snapshots`, { symbol: ticker })).status).toBe(404)
  expect((await (await fetch(`${baseUrl}/api/diaries/${diaryId}/guru-snapshots`)).status)).toBe(401)
})
