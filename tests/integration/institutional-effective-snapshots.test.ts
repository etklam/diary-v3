import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  institutional13fHoldings, institutionalEffectiveHoldings, institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications, institutionalEffectiveSnapshotSources, institutionalEffectiveSnapshots,
  institutionalEffectiveSnapshotRebuildRequests, institutionalFilingArtifacts, institutionalFilingDocuments,
  institutionalFilings, institutionalHoldingSecurityMappings, institutionalManagers, institutionalSecurities,
  institutionalSnapshotChangeEvents, users,
} from '@diary/db'
import { createApp } from '../../apps/api/src/app.js'
import { buildEffectivePortfolioSnapshot, enqueueEffectivePortfolioForFiling, runPendingEffectiveSnapshotRebuildOnce } from '../../apps/api/src/institutional/effective-snapshots.js'
import { runGuruFilingDiscoveryOnce } from '../../apps/api/src/institutional/discovery-worker.js'
import type { SecEdgarService } from '../../apps/api/src/sec-edgar/service.js'
import { discover13FFilings, ingest13FFiling } from '../../apps/api/src/institutional/ingestion.js'
import { BrowserSession } from '../support/browser-session.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let nextCik = 700000
const periodEnd = '2026-06-30'
const now = new Date('2026-10-06T10:00:00Z')
beforeAll(async () => { database = await provisionTestDatabase('effective_snapshots') })
afterAll(async () => { await database?.dispose() })

async function manager() {
  const [row] = await database.db.insert(institutionalManagers).values({ cik: String(nextCik++).padStart(10, '0') }).returning()
  return row!
}

async function filing(managerId: bigint, number: number, options: { amendmentNumber?: number; amendmentType?: string; quantities?: string[]; status?: 'READY' | 'PARTIAL' | 'ERROR' } = {}) {
  const accession = `${String(managerId).padStart(10, '0')}-26-${String(number).padStart(6, '0')}`
  const quantities = options.quantities ?? ['100.12345678']
  const [row] = await database.db.insert(institutionalFilings).values({
    managerId, accession, form: options.amendmentNumber === undefined ? '13F-HR' : '13F-HR/A', isAmendment: options.amendmentNumber !== undefined,
    amendmentNumber: options.amendmentNumber ?? null, amendmentType: options.amendmentType ?? null,
    filingDate: '2026-08-14', filedAt: now, periodEnd, sourceUrl: `https://www.sec.gov/fixture/${accession}`,
    status: options.status ?? 'READY', parserVersion: 'fixture-parser-v1', parsedRowCount: quantities.length,
  }).returning()
  const [document] = await database.db.insert(institutionalFilingDocuments).values({ filingId: row!.id, basename: 'information.xml', sourceUrl: row!.sourceUrl, isPrimary: true }).returning()
  const rawContent = `<fixture>${accession}</fixture>`
  const contentSha256 = createHash('sha256').update(rawContent).digest('hex')
  const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
    documentId: document!.id, contentSha256, artifactRef: `synthetic:${accession}:${contentSha256}`,
    rawContent, contentLength: BigInt(rawContent.length), fetchedAt: now,
  }).returning()
  if (quantities.length) {
    const rows = await database.db.insert(institutional13fHoldings).values(quantities.map((quantity, index) => ({
      filingId: row!.id, documentId: document!.id, artifactId: artifact!.id, rowNumber: index + 1,
      issuer: 'Synthetic Shared Issuer', titleOfClass: 'COM', cusip: '111111111', figi: null,
      reportedValue: '123456789.12345678', reportedValueUnit: 'USD', valueUnitSource: 'synthetic exact fixture',
      quantity, quantityType: 'SH', putCall: null, rawRow: `<quantity>${quantity}</quantity>`, sourceUrl: document!.sourceUrl,
      parserVersion: 'fixture-parser-v1', ingestedAt: now,
    }))).returning()
    await database.db.insert(institutionalHoldingSecurityMappings).values(rows.map(holding => ({
      holdingId: holding.id, status: 'UNRESOLVED' as const, securityId: null, reason: 'NO_IDENTIFIER_MATCH', candidateSecurityIds: [],
      algorithmVersion: 'fixture-mapping-v1', resolvedAt: now,
    })))
  }
  return row!
}

async function build(managerId: bigint) { return buildEffectivePortfolioSnapshot({ db: database.db, managerId, periodEnd, now }) }
async function active(managerId: bigint) {
  const rows = await database.db.select().from(institutionalEffectiveSnapshotPublications)
    .where(and(eq(institutionalEffectiveSnapshotPublications.managerId, managerId), eq(institutionalEffectiveSnapshotPublications.active, true)))
  expect(rows).toHaveLength(1)
  return rows[0]!
}

it('publishes deterministic out-of-order amendments with immutable lineage and distinct unresolved source rows, including concurrent replay', async () => {
  const owner = await manager()
  await filing(owner.id, 4, { amendmentNumber: 3, amendmentType: 'NEW HOLDINGS', quantities: ['300'] })
  await filing(owner.id, 2, { amendmentNumber: 1, amendmentType: 'NEW HOLDINGS', quantities: ['150'] })
  const original = await filing(owner.id, 1)
  await filing(owner.id, 3, { amendmentNumber: 2, amendmentType: 'RESTATEMENT', quantities: ['200', '250'] })
  const results = await Promise.all([build(owner.id), build(owner.id), build(owner.id)])
  expect(results.every(result => result.status === 'READY')).toBe(true)
  expect(new Set(results.map(result => result.snapshotId)).size).toBe(1)
  expect(results.filter(result => result.status === 'READY' && !result.replayed)).toHaveLength(1)
  const published = await active(owner.id)
  const holdings = await database.db.select().from(institutionalEffectiveHoldings).where(eq(institutionalEffectiveHoldings.snapshotId, published.snapshotId)).orderBy(asc(institutionalEffectiveHoldings.ordinal))
  expect(holdings.map(row => row.quantity)).toEqual(['200.00000000', '250.00000000', '300.00000000'])
  expect(holdings.every(row => row.securityId === null && row.mappingStatus === 'UNRESOLVED')).toBe(true)
  expect(new Set(holdings.map(row => row.sourceRowKey)).size).toBe(3)
  expect(holdings[0]?.reportedValue).toBe('123456789.12345678')
  const sources = await database.db.select().from(institutionalEffectiveSnapshotSources).where(eq(institutionalEffectiveSnapshotSources.snapshotId, published.snapshotId)).orderBy(asc(institutionalEffectiveSnapshotSources.ordinal))
  expect(sources.map(row => [row.operation, row.amendmentNumber])).toEqual([['ORIGINAL', null], ['ADD_NEW_HOLDINGS', 1], ['RESTATEMENT', 2], ['ADD_NEW_HOLDINGS', 3]])
  expect(sources[0]?.filingId).toBe(original.id)
  expect(sources.every(row => row.parserVersion === 'fixture-parser-v1' && Array.isArray(row.sourceManifest.documents))).toBe(true)
  expect(await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.managerId, owner.id))).toHaveLength(1)
  for (const statement of [
    ['update institutional_effective_snapshots set holding_count=99 where id=$1', published.snapshotId],
    ['delete from institutional_effective_snapshot_sources where snapshot_id=$1', published.snapshotId],
    ['delete from institutional_effective_holdings where snapshot_id=$1', published.snapshotId],
    ['update institutional_snapshot_change_events set event_type=event_type where snapshot_id=$1', published.snapshotId],
  ] as const) await expect(database.pool.query(statement[0], [String(statement[1])])).rejects.toMatchObject({ code: 'P0001' })
})

it('retains the previous READY snapshot for partial/error/superseded filings and incomplete amendment metadata', async () => {
  const owner = await manager()
  await filing(owner.id, 1)
  const original = await build(owner.id)
  const amendment = await filing(owner.id, 3, { amendmentNumber: 2, amendmentType: 'RESTATEMENT', quantities: [] })
  expect(await build(owner.id)).toMatchObject({ status: 'PARTIAL', reason: 'AMENDMENT_SEQUENCE_INCOMPLETE', snapshotId: original.snapshotId })
  await database.db.update(institutionalFilings).set({ amendmentNumber: 1 }).where(eq(institutionalFilings.id, amendment.id))
  for (const status of ['PARTIAL', 'ERROR', 'SUPERSEDED'] as const) {
    await database.db.update(institutionalFilings).set({ status }).where(eq(institutionalFilings.id, amendment.id))
    expect(await build(owner.id)).toMatchObject({ status: status === 'ERROR' ? 'ERROR' : 'PARTIAL', reason: 'FILING_NOT_READY', snapshotId: original.snapshotId })
    expect((await active(owner.id)).snapshotId).toBe(original.snapshotId)
  }
  await database.db.update(institutionalFilings).set({ status: 'READY', amendmentType: 'UNKNOWN' }).where(eq(institutionalFilings.id, amendment.id))
  expect(await build(owner.id)).toMatchObject({ status: 'PARTIAL', reason: 'AMENDMENT_METADATA_INVALID' })
  expect(await database.db.select().from(institutionalEffectiveSnapshots).where(eq(institutionalEffectiveSnapshots.managerId, owner.id))).toHaveLength(1)
  expect(await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.managerId, owner.id))).toHaveLength(6)
})

it('survives replacement of transient parsed row IDs and republishes when parser/mapping versions change', async () => {
  const owner = await manager()
  const original = await filing(owner.id, 1)
  const first = await build(owner.id)
  const [source] = await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, original.id))
  const { id: oldId, ...sameData } = source!
  await database.db.delete(institutional13fHoldings).where(eq(institutional13fHoldings.id, oldId))
  const [replacement] = await database.db.insert(institutional13fHoldings).values(sameData).returning()
  expect(replacement!.id).not.toBe(oldId)
  await database.db.insert(institutionalHoldingSecurityMappings).values({ holdingId: replacement!.id, status: 'UNRESOLVED', securityId: null, reason: 'NO_IDENTIFIER_MATCH', candidateSecurityIds: [], algorithmVersion: 'fixture-mapping-v1', resolvedAt: new Date(now.getTime() + 1000) })
  expect(await build(owner.id)).toMatchObject({ status: 'READY', snapshotId: first.snapshotId, replayed: true })
  await database.db.update(institutionalFilings).set({ parserVersion: 'fixture-parser-v2' }).where(eq(institutionalFilings.id, original.id))
  await database.db.update(institutional13fHoldings).set({ parserVersion: 'fixture-parser-v2' }).where(eq(institutional13fHoldings.id, replacement!.id))
  const second = await build(owner.id)
  expect(second.status).toBe('READY')
  expect(second.snapshotId).not.toBe(first.snapshotId)
  await database.db.update(institutionalHoldingSecurityMappings).set({ algorithmVersion: 'fixture-mapping-v2' }).where(eq(institutionalHoldingSecurityMappings.holdingId, replacement!.id))
  const third = await build(owner.id)
  expect(third.snapshotId).not.toBe(second.snapshotId)
  expect(await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.managerId, owner.id))).toHaveLength(3)
  const oldContents = await database.db.select().from(institutionalEffectiveHoldings).where(eq(institutionalEffectiveHoldings.snapshotId, first.snapshotId!))
  expect(oldContents[0]?.sourceData.parserVersion).toBe('fixture-parser-v1')
  expect(oldContents[0]?.mappingVersion).toBe('fixture-mapping-v1')
})

it('enforces the unique active publication constraint and rolls back an aborted publication including its durable event', async () => {
  const owner = await manager()
  await filing(owner.id, 1)
  const first = await build(owner.id)
  await filing(owner.id, 2, { amendmentNumber: 1, amendmentType: 'NEW HOLDINGS' })
  const second = await build(owner.id)
  await expect(database.db.update(institutionalEffectiveSnapshotPublications).set({ active: true, status: 'READY' }).where(eq(institutionalEffectiveSnapshotPublications.snapshotId, first.snapshotId!)))
    .rejects.toMatchObject({ cause: { code: '23505', constraint: 'institutional_effective_snapshot_publications_active_unique' } })
  const before = await database.db.select().from(institutionalEffectivePeriodStates).where(eq(institutionalEffectivePeriodStates.managerId, owner.id))
  await filing(owner.id, 3, { amendmentNumber: 2, amendmentType: 'RESTATEMENT', quantities: [] })
  await database.pool.query("create function fail_effective_event_fixture() returns trigger language plpgsql as $$ begin raise exception 'Synthetic event publication failure'; end $$")
  await database.pool.query('create trigger fail_effective_event_fixture before insert on institutional_snapshot_change_events for each row execute function fail_effective_event_fixture()')
  try { await expect(build(owner.id)).rejects.toMatchObject({ cause: { code: 'P0001' } }) }
  finally {
    await database.pool.query('drop trigger fail_effective_event_fixture on institutional_snapshot_change_events')
    await database.pool.query('drop function fail_effective_event_fixture()')
  }
  expect((await active(owner.id)).snapshotId).toBe(second.snapshotId)
  expect(await database.db.select().from(institutionalEffectiveSnapshots).where(eq(institutionalEffectiveSnapshots.managerId, owner.id))).toHaveLength(2)
  expect(await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.managerId, owner.id))).toHaveLength(2)
  expect(await database.db.select().from(institutionalEffectivePeriodStates).where(eq(institutionalEffectivePeriodStates.managerId, owner.id))).toEqual(before)
})

async function waitForGate(key: number) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const result = await database.pool.query("select count(*)::int as count from pg_locks where locktype='advisory' and not granted and objid=$1", [key])
    if (result.rows[0].count > 0) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Synthetic snapshot gate was not reached')
}

it('rechecks the source manifest after computation and refuses publication when a mapping writer changed the source', async () => {
  const owner = await manager()
  const original = await filing(owner.id, 1)
  const gate = await database.pool.connect()
  await gate.query('select pg_advisory_lock(41004)')
  await database.pool.query("create function gate_effective_snapshot_fixture() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(41004); return new; end $$")
  await database.pool.query('create trigger gate_effective_snapshot_fixture before insert on institutional_effective_snapshots for each row execute function gate_effective_snapshot_fixture()')
  let result: { error?: unknown } | undefined
  try {
    const outcome = build(owner.id).then(() => ({ error: undefined }), error => ({ error }))
    await waitForGate(41004)
    await database.pool.query('update institutional_holding_security_mappings set algorithm_version=$1 where holding_id in (select id from institutional_13f_holdings where filing_id=$2)', ['concurrent-mapping-v2', String(original.id)])
    await gate.query('select pg_advisory_unlock(41004)')
    result = await outcome
  } finally {
    await gate.query('select pg_advisory_unlock(41004)')
    gate.release()
    await database.pool.query('drop trigger gate_effective_snapshot_fixture on institutional_effective_snapshots')
    await database.pool.query('drop function gate_effective_snapshot_fixture()')
  }
  expect(result?.error).toMatchObject({ message: 'EFFECTIVE_SNAPSHOT_SOURCE_CHANGED' })
  expect(await database.db.select().from(institutionalEffectiveSnapshots).where(eq(institutionalEffectiveSnapshots.managerId, owner.id))).toHaveLength(0)
  expect(await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.managerId, owner.id))).toHaveLength(0)
})

it('enqueues Admin overrides durably, keeps prior READY visible, and lets the existing worker publish corrected mapping', async () => {
  const owner = await manager()
  const original = await filing(owner.id, 1)
  const first = await build(owner.id)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-effective-snapshot-admin'
  const [admin] = await database.db.insert(users).values({ email, password: await bcrypt.hash(password, 4), role: 'ADMIN' }).returning()
  const [security] = await database.db.insert(institutionalSecurities).values({
    issuer: 'Verified Synthetic Issuer', titleOfClass: 'COM', securityType: 'EQUITY', sourceUrl: 'https://issuer.example.test/verified', sourceVerifiedBy: admin!.id, sourceVerifiedAt: now,
  }).returning()
  const [holding] = await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, original.id))
  const app = createApp({ db: database.db, databasePool: database.pool, now: () => now,
    config: { jwtSecret: 'synthetic-effective-snapshot-http-secret-with-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' } })
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  const browser = new BrowserSession(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  try {
    expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
    expect((await browser.request('/api/auth/me')).status).toBe(200)
    const overridden = await browser.post(`/api/admin/institutional/mappings/${holding!.id}/override`, { securityId: security!.id.toString(), reason: 'Verified primary-source correction', evidenceUrl: 'https://issuer.example.test/verified', confirmPrimarySource: true })
    expect(overridden.status).toBe(201)
    expect((await active(owner.id)).snapshotId).toBe(first.snapshotId)
    expect((await database.db.select().from(institutionalEffectivePeriodStates).where(eq(institutionalEffectivePeriodStates.managerId, owner.id)))[0]).toMatchObject({ status: 'PARTIAL', reason: 'REBUILD_PENDING' })
    const sec = { listFilings: async () => { throw new Error('Unexpected SEC request in synthetic rebuild fixture') } } as unknown as SecEdgarService
    const result = await runGuruFilingDiscoveryOnce({ db: database.db, sec, now: () => now })
    expect(result).toMatchObject({ managerId: owner.id, status: 'snapshot-rebuilt', snapshotStatus: 'READY' })
    const second = await active(owner.id)
    expect(second.snapshotId).not.toBe(first.snapshotId)
    const contents = await database.db.select().from(institutionalEffectiveHoldings).where(eq(institutionalEffectiveHoldings.snapshotId, second.snapshotId))
    expect(contents[0]).toMatchObject({ securityId: security!.id, mappingStatus: 'MANUAL_OVERRIDE' })
    expect(await runPendingEffectiveSnapshotRebuildOnce(database.db, now)).toBeUndefined()
    expect(await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.managerId, owner.id))).toHaveLength(3)
  } finally { server.close(); await once(server, 'close') }
})

it('does not acknowledge a newer rebuild request with an older worker revision and retries failures while retaining prior READY', async () => {
  const owner = await manager()
  const original = await filing(owner.id, 1)
  const first = await build(owner.id)
  await database.db.transaction(tx => enqueueEffectivePortfolioForFiling(tx, original.id, now))
  const gate = await database.pool.connect()
  const lockKey = `institutional-effective:${owner.id}:${periodEnd}`
  await gate.query('select pg_advisory_lock(hashtextextended($1,0))', [lockKey])
  const outcome = runPendingEffectiveSnapshotRebuildOnce(database.db, now)
  try {
    const deadline = Date.now() + 3000
    while (true) {
      const waiting = await database.pool.query("select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event='advisory'")
      if (waiting.rows[0].count > 0) break
      if (Date.now() > deadline) throw new Error('Expected worker period-lock wait')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    await database.db.transaction(tx => enqueueEffectivePortfolioForFiling(tx, original.id, now))
    await gate.query('select pg_advisory_unlock(hashtextextended($1,0))', [lockKey])
    await outcome
  } finally { await gate.query('select pg_advisory_unlock(hashtextextended($1,0))', [lockKey]); gate.release() }
  const [request] = await database.db.select().from(institutionalEffectiveSnapshotRebuildRequests).where(eq(institutionalEffectiveSnapshotRebuildRequests.managerId, owner.id))
  expect(request).toMatchObject({ requestedRevision: 2n, processedRevision: 1n })
  expect(await runPendingEffectiveSnapshotRebuildOnce(database.db, now)).toMatchObject({ status: 'READY' })
  expect((await active(owner.id)).snapshotId).toBe(first.snapshotId)
  await database.db.update(institutionalHoldingSecurityMappings).set({ algorithmVersion: 'fixture-mapping-new' })
    .where(eq(institutionalHoldingSecurityMappings.holdingId, (await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, original.id)))[0]!.id))
  await database.db.transaction(tx => enqueueEffectivePortfolioForFiling(tx, original.id, now))
  await database.pool.query("create function fail_worker_event_fixture() returns trigger language plpgsql as $$ begin raise exception 'Synthetic worker publication failure'; end $$")
  await database.pool.query('create trigger fail_worker_event_fixture before insert on institutional_snapshot_change_events for each row execute function fail_worker_event_fixture()')
  try { expect(await runPendingEffectiveSnapshotRebuildOnce(database.db, now)).toMatchObject({ status: 'ERROR' }) }
  finally { await database.pool.query('drop trigger fail_worker_event_fixture on institutional_snapshot_change_events'); await database.pool.query('drop function fail_worker_event_fixture()') }
  expect((await active(owner.id)).snapshotId).toBe(first.snapshotId)
  expect((await database.db.select().from(institutionalEffectivePeriodStates).where(eq(institutionalEffectivePeriodStates.managerId, owner.id)))[0]).toMatchObject({ status: 'PARTIAL', reason: 'REBUILD_PENDING' })
  expect((await database.db.select().from(institutionalEffectiveSnapshotRebuildRequests).where(eq(institutionalEffectiveSnapshotRebuildRequests.managerId, owner.id)))[0]).toMatchObject({ requestedRevision: 3n, processedRevision: 2n, lastError: 'EFFECTIVE_SNAPSHOT_REBUILD_FAILED' })
  expect(await runPendingEffectiveSnapshotRebuildOnce(database.db, new Date(now.getTime() + 60000))).toMatchObject({ status: 'READY' })
})

it('atomically queues newly discovered amendments and pre-mapping failures without enqueueing unchanged periodic discoveries', async () => {
  const owner = await manager()
  await filing(owner.id, 1)
  const previous = await build(owner.id)
  const accession = `${owner.cik}-26-000002`
  const sec = {
    async listFilings() {
      return { stale: false, value: { filings: [{
        cik: owner.cik, accession, form: '13F-HR/A', filingDate: '2026-08-15', reportDate: periodEnd,
        acceptanceDateTime: '2026-08-15T20:00:00Z', isAmendment: true, primaryDocument: 'cover.xml', primaryDocumentDescription: 'Synthetic amendment', size: 50,
      }], nextCursor: null } }
    },
    async getFilingDetail() { throw new Error('Synthetic SEC cover download failure before mapping') },
  } as unknown as SecEdgarService
  expect(await discover13FFilings({ db: database.db, sec, managerId: owner.id, cik: owner.cik, now: () => now })).toEqual({ discovered: 1, stale: false })
  const [firstRequest] = await database.db.select().from(institutionalEffectiveSnapshotRebuildRequests).where(eq(institutionalEffectiveSnapshotRebuildRequests.managerId, owner.id))
  expect(firstRequest).toMatchObject({ requestedRevision: 1n, processedRevision: 0n })
  expect((await active(owner.id)).snapshotId).toBe(previous.snapshotId)
  expect(await runPendingEffectiveSnapshotRebuildOnce(database.db, now)).toMatchObject({ status: 'PARTIAL' })
  await discover13FFilings({ db: database.db, sec, managerId: owner.id, cik: owner.cik, now: () => now })
  const [unchangedRequest] = await database.db.select().from(institutionalEffectiveSnapshotRebuildRequests).where(eq(institutionalEffectiveSnapshotRebuildRequests.managerId, owner.id))
  expect(unchangedRequest?.requestedRevision).toBe(firstRequest!.requestedRevision)
  const [amendment] = await database.db.select().from(institutionalFilings).where(and(eq(institutionalFilings.managerId, owner.id), eq(institutionalFilings.accession, accession)))
  expect(await ingest13FFiling({ db: database.db, sec, filingId: amendment!.id, cik: owner.cik, accession, now: () => now })).toBe('ERROR')
  expect(await runPendingEffectiveSnapshotRebuildOnce(database.db, now)).toMatchObject({ status: 'ERROR' })
  expect((await active(owner.id)).snapshotId).toBe(previous.snapshotId)
  const [state] = await database.db.select().from(institutionalEffectivePeriodStates).where(eq(institutionalEffectivePeriodStates.managerId, owner.id))
  expect(state).toMatchObject({ status: 'ERROR', reason: 'FILING_NOT_READY' })
  expect(await database.db.select().from(institutionalSnapshotChangeEvents).where(eq(institutionalSnapshotChangeEvents.managerId, owner.id))).toHaveLength(5)
})
