import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  adminInstitutionalDiagnosticsResponseSchema,
  adminInstitutionalFilingDetailResponseSchema,
  adminInstitutionalFilingListResponseSchema,
  adminInstitutionalJobResponseSchema,
  adminInstitutionalOverviewResponseSchema,
} from '@diary/contracts'
import {
  gurus,
  institutional13fHoldings,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshotRebuildRequests,
  institutionalEffectiveSnapshotSources,
  institutionalEffectiveSnapshots,
  institutionalFilingArtifacts,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalHoldingSecurityMappings,
  institutionalManagerDiscovery,
  institutionalManagers,
  institutionalSecurities,
  institutionalSnapshotChangeEvents,
} from '@diary/db'
import { createApp } from '../../apps/api/src/app'
import { runPendingGuruPortfolioAnalyticsOnce } from '../../apps/api/src/institutional/portfolio-analytics.js'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date
let guru: typeof gurus.$inferSelect
let securityId: bigint
let filingNumber = 1
let managerNumber = 960000

function digest(value: string) { return createHash('sha256').update(value).digest('hex') }

beforeAll(async () => { database = await provisionTestDatabase('institutional_operations') })
afterAll(async () => { await database?.dispose() })

beforeEach(async () => {
  clock = new Date('2026-08-20T09:00:00.000Z')
  const app = createApp({
    db: database.db, databasePool: database.pool, now: () => clock,
    config: { jwtSecret: 'synthetic-institutional-operations-secret-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const [actor] = await database.db.insert(institutionalSecurities).values({
    issuer: 'Synthetic Operations Issuer', titleOfClass: 'Common Stock', securityType: 'EQUITY', sector: 'Technology', industry: 'Software',
    sourceUrl: 'https://issuer.example.test/security', sourceVerifiedBy: await adminUserId(), sourceVerifiedAt: clock,
  }).returning()
  securityId = actor!.id
  const cik = String(managerNumber++).padStart(10, '0')
  const [manager] = await database.db.insert(institutionalManagers).values({ cik }).returning()
  const [profile] = await database.db.insert(gurus).values({
    managerId: manager!.id, slug: `operations-guru-${cik}`, name: 'Synthetic Operations Capital', managerName: 'Synthetic Operations Management',
  }).returning()
  guru = profile!
})
afterEach(async () => { server.close(); await once(server, 'close') })

async function adminUserId() {
  const result = await database.pool.query('insert into users(email,password,role) values ($1,$2,$3) returning id', [`${randomUUID()}@example.test`, 'synthetic', 'ADMIN'])
  return BigInt(result.rows[0].id)
}

async function session(role: 'ADMIN' | 'USER' = 'ADMIN') {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-operations-password'
  await database.pool.query('insert into users(email,password,role) values ($1,$2,$3)', [email, await bcrypt.hash(password, 4), role])
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return browser
}

function post(browser: BrowserSession, path: string, body: unknown = {}) {
  return browser.post(path, body)
}

async function publish(input: { periodEnd: string; quantity: string; reportedValue: string; amendment?: boolean }) {
  const accession = `${String(guru.managerId).padStart(10, '0')}-26-${String(filingNumber++).padStart(6, '0')}`
  const sourceUrl = `https://www.sec.gov/fixture/${accession}`
  const [filing] = await database.db.insert(institutionalFilings).values({
    managerId: guru.managerId, accession, form: input.amendment ? '13F-HR/A' : '13F-HR',
    isAmendment: Boolean(input.amendment), amendmentNumber: input.amendment ? 1 : null, amendmentType: input.amendment ? 'RESTATEMENT' : null,
    filingDate: input.periodEnd, filedAt: clock, periodEnd: input.periodEnd, sourceUrl, status: 'READY',
    parserVersion: 'operations-fixture-v1', parsedRowCount: 1, rejectedRowCount: 0, mappingCoverage: '100.00', ingestedAt: clock,
  }).returning()
  const [document] = await database.db.insert(institutionalFilingDocuments).values({
    filingId: filing!.id, basename: 'information-table.xml', sourceUrl, isPrimary: true, contentLength: 120n, downloadedAt: clock,
  }).returning()
  const body = `<fixture>${accession}</fixture>`
  const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
    documentId: document!.id, contentSha256: digest(body), artifactRef: `synthetic:${accession}`,
    rawContent: body, contentLength: BigInt(body.length), fetchedAt: clock,
  }).returning()
  const [holding] = await database.db.insert(institutional13fHoldings).values({
    filingId: filing!.id, documentId: document!.id, artifactId: artifact!.id, rowNumber: 1,
    issuer: 'Synthetic Operations Issuer', titleOfClass: 'Common Stock', cusip: '123456789', figi: null,
    reportedValue: input.reportedValue, reportedValueUnit: 'USD', valueUnitSource: 'form-13f-2023-dollars',
    quantity: input.quantity, quantityType: 'SH', putCall: null, investmentDiscretion: 'SOLE', otherManagers: [],
    votingAuthority: { sole: input.quantity }, sourceUrl, rawRow: body, warnings: [],
    parserVersion: 'operations-fixture-v1', ingestedAt: clock,
  }).returning()
  await database.db.insert(institutionalHoldingSecurityMappings).values({
    holdingId: holding!.id, status: 'MATCHED', securityId, reason: 'CUSIP_EXACT',
    candidateSecurityIds: [securityId.toString()], algorithmVersion: 'exact-identifiers-v1', resolvedAt: clock, updatedAt: clock,
  })
  const snapshotHash = digest(`${securityId}:${input.quantity}:${input.reportedValue}`)
  const [snapshot] = await database.db.insert(institutionalEffectiveSnapshots).values({
    managerId: guru.managerId, periodEnd: input.periodEnd, replayKey: digest(`replay:${snapshotHash}:${randomUUID()}`),
    snapshotHash, sourceManifestHash: digest(`manifest:${accession}`), resolverVersion: '13f-amendments-v1', holdingCount: 1, createdAt: clock,
  }).returning()
  await database.db.insert(institutionalEffectiveSnapshotSources).values({
    snapshotId: snapshot!.id, ordinal: 0, filingId: filing!.id, accession, operation: input.amendment ? 'RESTATEMENT' : 'ORIGINAL',
    amendmentNumber: input.amendment ? 1 : null, parserVersion: 'operations-fixture-v1', sourceManifest: { accession },
  })
  await database.db.insert(institutionalEffectiveHoldings).values({
    snapshotId: snapshot!.id, ordinal: 0, sourceFilingId: filing!.id, sourceDocumentId: document!.id, sourceArtifactId: artifact!.id,
    sourceRowKey: digest(`row:${accession}`), sourceRowNumber: 1, securityId,
    mappingStatus: 'MATCHED', mappingVersion: 'operations-fixture-v1', issuer: 'Synthetic Operations Issuer', titleOfClass: 'Common Stock',
    cusip: '123456789', figi: null, reportedValue: input.reportedValue, reportedValueUnit: 'USD', quantity: input.quantity,
    quantityType: 'SH', putCall: null, sourceData: { accession, sourceUrl },
  })
  await database.db.update(institutionalEffectiveSnapshotPublications).set({ status: 'SUPERSEDED', active: false, updatedAt: clock })
    .where(eq(institutionalEffectiveSnapshotPublications.periodEnd, input.periodEnd))
  await database.db.insert(institutionalEffectiveSnapshotPublications).values({
    snapshotId: snapshot!.id, managerId: guru.managerId, periodEnd: input.periodEnd, status: 'READY', active: true, updatedAt: clock,
  })
  await database.db.insert(institutionalEffectivePeriodStates).values({
    managerId: guru.managerId, periodEnd: input.periodEnd, status: 'READY', reason: null,
    sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  }).onConflictDoUpdate({ target: [institutionalEffectivePeriodStates.managerId, institutionalEffectivePeriodStates.periodEnd], set: {
    status: 'READY', reason: null, sourceManifestHash: digest(`manifest-state:${accession}`), checkedAt: clock,
  } })
  await database.db.insert(institutionalSnapshotChangeEvents).values({
    managerId: guru.managerId, periodEnd: input.periodEnd, snapshotId: snapshot!.id, createdAt: clock,
  })
  return { filingId: filing!.id, accession, artifactId: artifact!.id }
}

it('reports operational state, drills through filing lineage, and refuses non-admin access', async () => {
  const original = await publish({ periodEnd: '2026-03-31', quantity: '100', reportedValue: '1000' })
  const amendment = await publish({ periodEnd: '2026-03-31', quantity: '150', reportedValue: '1500', amendment: true })
  for (let count = 0; count < 5; count += 1) if (!await runPendingGuruPortfolioAnalyticsOnce(database.db, clock)) break
  const admin = await session()

  const overview = adminInstitutionalOverviewResponseSchema.parse(await (await admin.request('/api/admin/institutional/overview')).json()).data
  expect(overview.versions).toMatchObject({ parser: '13f-xml-v1', resolver: '13f-amendments-v1', analytics: 'guru-portfolio-analytics-v1', analysisSchema: 'guru-analysis-v1' })
  const manager = overview.managers.find(row => row.guruId === guru.id.toString())!
  expect(manager).toMatchObject({ cik: expect.stringMatching(/^\d{10}$/), filings: { total: 2, ready: 2 }, quarters: { ready: 1 } })
  expect(manager.mappingCoveragePercent).toBe('100.00000000')
  expect(overview.scheduler.requestCount).toMatch(/^\d+$/)

  const filings = adminInstitutionalFilingListResponseSchema.parse(await (await admin.request(`/api/admin/institutional/filings?guruId=${guru.id}`)).json())
  expect(filings.pagination.total).toBe(2)
  expect(filings.data.map(row => row.accession)).toContain(amendment.accession)
  const filtered = adminInstitutionalFilingListResponseSchema.parse(await (await admin.request(`/api/admin/institutional/filings?search=${original.accession}`)).json())
  expect(filtered.data.map(row => row.accession)).toEqual([original.accession])

  const detail = adminInstitutionalFilingDetailResponseSchema.parse(await (await admin.request(`/api/admin/institutional/filings/${amendment.filingId}`)).json()).data
  expect(detail.filing).toMatchObject({ accession: amendment.accession, isAmendment: true, amendmentType: 'RESTATEMENT' })
  expect(detail.documents[0]!.artifacts[0]).toMatchObject({ rawContentRetained: true, fetchedReason: 'initial' })
  expect(detail.parsedRows.total).toBe(1)
  expect(detail.parsedRows.sample[0]).toMatchObject({ mappingStatus: 'MATCHED', valueUnitSource: 'form-13f-2023-dollars' })
  expect(detail.effective.snapshot).toMatchObject({ resolverVersion: '13f-amendments-v1', holdingCount: 1 })
  expect(detail.effective.publication).toMatchObject({ status: 'READY', active: true })
  expect(detail.effective.periodState).toMatchObject({ status: 'READY' })
  expect(detail.amendments.map(row => row.accession)).toEqual([original.accession, amendment.accession])
  expect(detail.analytics).toMatchObject({ status: 'READY', analyticsVersion: 'guru-portfolio-analytics-v1' })

  const member = await session('USER')
  expect((await member.request('/api/admin/institutional/overview')).status).toBe(403)
  expect((await post(member, `/api/admin/gurus/${guru.id}/sync`)).status).toBe(403)
  expect((await member.request('/api/admin/institutional/diagnostics')).status).toBe(403)
})

it('queues sync, reprocess, and rebuild idempotently without destroying preserved data', async () => {
  const filing = await publish({ periodEnd: '2026-03-31', quantity: '100', reportedValue: '1000' })
  const admin = await session()

  const firstSync = await post(admin, `/api/admin/gurus/${guru.id}/sync`)
  expect(firstSync.status).toBe(202)
  expect(adminInstitutionalJobResponseSchema.parse(await firstSync.json()).data).toMatchObject({ jobType: 'FILING_DISCOVERY', status: 'QUEUED' })
  const secondSync = await post(admin, `/api/admin/gurus/${guru.id}/sync`)
  expect(secondSync.status).toBe(200)
  expect(adminInstitutionalJobResponseSchema.parse(await secondSync.json()).data.status).toBe('ALREADY_QUEUED')
  const [discovery] = await database.db.select().from(institutionalManagerDiscovery).where(eq(institutionalManagerDiscovery.managerId, guru.managerId))
  expect(discovery).toMatchObject({ status: 'PENDING' })

  const firstReprocess = await post(admin, `/api/admin/institutional/filings/${filing.filingId}/reprocess`)
  expect(firstReprocess.status).toBe(202)
  expect(adminInstitutionalJobResponseSchema.parse(await firstReprocess.json()).data).toMatchObject({ jobType: 'FILING_REPROCESS', status: 'QUEUED' })
  const secondReprocess = await post(admin, `/api/admin/institutional/filings/${filing.filingId}/reprocess`)
  expect(secondReprocess.status).toBe(200)
  expect(adminInstitutionalJobResponseSchema.parse(await secondReprocess.json()).data.status).toBe('ALREADY_QUEUED')
  const [queued] = await database.db.select().from(institutionalFilings).where(eq(institutionalFilings.id, filing.filingId))
  expect(queued).toMatchObject({ status: 'PENDING', errorCode: null })
  const artifacts = await database.db.select().from(institutionalFilingArtifacts).where(eq(institutionalFilingArtifacts.id, filing.artifactId))
  expect(artifacts).toHaveLength(1)
  const parsed = await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, filing.filingId))
  expect(parsed).toHaveLength(1)

  const firstRebuild = await post(admin, `/api/admin/gurus/${guru.id}/rebuild`, { periodEnd: '2026-03-31' })
  expect(firstRebuild.status).toBe(202)
  expect(adminInstitutionalJobResponseSchema.parse(await firstRebuild.json()).data).toMatchObject({ jobType: 'ANALYTICS_REBUILD', status: 'QUEUED', revision: '1' })
  const secondRebuild = await post(admin, `/api/admin/gurus/${guru.id}/rebuild`, { periodEnd: '2026-03-31' })
  expect(secondRebuild.status).toBe(200)
  expect(adminInstitutionalJobResponseSchema.parse(await secondRebuild.json()).data).toMatchObject({ status: 'ALREADY_QUEUED', revision: '1' })
  const requests = await database.db.select().from(institutionalEffectiveSnapshotRebuildRequests)
  expect(requests).toHaveLength(1)
  expect(requests[0]!.requestedRevision).toBe(1n)

  const unknownQuarter = await post(admin, `/api/admin/gurus/${guru.id}/rebuild`, { periodEnd: '2024-03-31' })
  expect(unknownQuarter.status).toBe(409)
  expect((await post(admin, '/api/admin/institutional/filings/999999/reprocess')).status).toBe(404)
})

it('exports diagnostics with processing versions, no secrets and no user identities', async () => {
  await publish({ periodEnd: '2026-03-31', quantity: '100', reportedValue: '1000' })
  const admin = await session()
  const response = await admin.request('/api/admin/institutional/diagnostics')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-disposition')).toContain('institutional-diagnostics-2026-08-20.json')
  expect(response.headers.get('cache-control')).toBe('no-store')
  const text = await response.text()
  const diagnostics = adminInstitutionalDiagnosticsResponseSchema.parse(JSON.parse(text))
  expect(diagnostics.versions.consensus).toBe('guru-consensus-v1')
  expect(diagnostics.redactions).toContain('provider-credentials')
  const diagnosed = diagnostics.managers.find(row => row.slug === guru.slug)!
  expect(diagnosed).toMatchObject({ active: true, filings: { total: 1 } })
  expect(text).not.toMatch(/@example\.test|password|encrypted_api_key|<fixture>|requestedByUserId/i)
})
