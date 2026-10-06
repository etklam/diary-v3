import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { eq } from 'drizzle-orm'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import {
  adminInstitutionalIdentityEventListResponseSchema,
  adminInstitutionalMappingListResponseSchema,
  adminInstitutionalSecurityListResponseSchema,
  adminInstitutionalSecurityCreateResponseSchema,
  adminInstitutionalSecurityResponseSchema,
} from '@diary/contracts'
import {
  institutional13fHoldings,
  institutionalFilingArtifacts,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagers,
  institutionalSecurityIdentityEvents,
  institutionalSecurityIdentifiers,
  institutionalSecurityMappingOverrides,
  institutionalSecurityMappingRefreshJobs,
  institutionalSecurities,
} from '@diary/db'
import { createApp } from '../../apps/api/src/app.js'
import { resolveFilingHoldings, compareSecurityIdentity, resolveSecurityIdentifier } from '../../apps/api/src/institutional/security-mapping.js'
import { runGuruFilingDiscoveryOnce } from '../../apps/api/src/institutional/discovery-worker.js'
import type { SecEdgarService } from '../../apps/api/src/sec-edgar/service.js'
import { BrowserSession } from '../support/browser-session.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date

beforeAll(async () => { database = await provisionTestDatabase('institutional_security_map') })
beforeEach(async () => {
  clock = new Date('2026-10-06T08:00:00.000Z')
  const app = createApp({
    db: database.db, databasePool: database.pool, now: () => clock,
    config: { jwtSecret: 'synthetic-institutional-map-secret-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

async function account(role: 'ADMIN' | 'USER' = 'ADMIN') {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-security-map-password'
  const result = await database.pool.query('insert into users(email,password,role) values ($1,$2,$3) returning id', [email, await bcrypt.hash(password, 4), role])
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  expect((await browser.request('/api/auth/me')).status).toBe(200)
  return { browser, id: String(result.rows[0].id) }
}

async function createSecurity(browser: BrowserSession, issuer: string, identifiers: Array<{ type: 'CUSIP' | 'FIGI' | 'TICKER'; value: string; validFrom: string; validTo?: string | null }>) {
  const response = await browser.post('/api/admin/institutional/securities', {
    issuer, titleOfClass: 'Common Stock', exchange: 'NYSE', securityType: 'EQUITY', sector: 'Technology', industry: 'Software',
    sourceUrl: `https://issuer.example.test/${encodeURIComponent(issuer)}`,
    confirmPrimarySource: true,
    identifiers: identifiers.map(identifier => ({ ...identifier, validTo: identifier.validTo ?? null })),
  })
  expect(response.status).toBe(201)
  return adminInstitutionalSecurityCreateResponseSchema.parse(await response.json()).data
}

async function createFiling() {
  const [manager] = await database.db.insert(institutionalManagers).values({ cik: '0000098765' }).returning()
  const [filing] = await database.db.insert(institutionalFilings).values({
    managerId: manager!.id, accession: '0000098765-26-000001', form: '13F-HR',
    filingDate: '2026-08-14', filedAt: new Date('2026-08-14T20:00:00Z'), periodEnd: '2026-06-30',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/98765/000009876526000001/13f.htm', status: 'PARSED',
  }).returning()
  const [document] = await database.db.insert(institutionalFilingDocuments).values({
    filingId: filing!.id, basename: 'information.xml', documentType: '13F INFORMATION TABLE',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/98765/000009876526000001/information.xml',
  }).returning()
  const digest = randomUUID().replaceAll('-', '').padStart(64, '0')
  const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
    documentId: document!.id, artifactRef: `synthetic:${digest}`, contentSha256: digest,
    rawContent: '<informationTable/>', contentLength: 20n, fetchedAt: clock,
  }).returning()
  const holdings = await database.db.insert(institutional13fHoldings).values([
    { rowNumber: 1, issuer: 'Synthetic Alpha', titleOfClass: 'Common Stock', cusip: '333333333', figi: 'BBG000000003' },
    { rowNumber: 2, issuer: 'Synthetic Reused ID', titleOfClass: 'Common Stock', cusip: '111111111', figi: null },
    { rowNumber: 3, issuer: 'Synthetic Conflict', titleOfClass: 'Common Stock', cusip: '444444444', figi: 'BBG000000005' },
    { rowNumber: 4, issuer: 'Synthetic Alpha', titleOfClass: 'Class B', cusip: null, figi: null },
    { rowNumber: 5, issuer: 'Synthetic Future ID', titleOfClass: 'Common Stock', cusip: '555555555', figi: null },
  ].map(row => ({
    filingId: filing!.id, documentId: document!.id, artifactId: artifact!.id,
    rowNumber: row.rowNumber,
    issuer: row.issuer, titleOfClass: row.titleOfClass, cusip: row.cusip, figi: row.figi,
    reportedValue: '100.25000000', reportedValueUnit: 'USD', valueUnitSource: 'synthetic fixture',
    quantity: '10.00000000', quantityType: 'SH' as const, putCall: null,
    investmentDiscretion: 'SOLE', otherManagers: [], votingAuthority: { sole: '10', shared: '0', none: '0' },
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/98765/000009876526000001/information.xml',
    rawRow: `<infoTable><nameOfIssuer>${row.issuer}</nameOfIssuer></infoTable>`, warnings: [],
    parserVersion: 'synthetic-parser-v1', ingestedAt: clock,
  }))).returning()
  return { filing: filing!, holdings }
}

it('resolves only exact period-valid identifiers, preserves overrides, and keeps comparison semantics explicit', async () => {
  const admin = await account()
  const ordinary = await account('USER')
  for (const path of ['/api/admin/institutional/securities', '/api/admin/institutional/mappings']) {
    expect((await fetch(`${baseUrl}${path}`)).status).toBe(401)
    expect((await ordinary.browser.request(path)).status).toBe(403)
  }

  const alpha = await createSecurity(admin.browser, 'Synthetic Alpha Inc.', [
    { type: 'CUSIP', value: '333333333', validFrom: '2020-01-01' },
    { type: 'FIGI', value: 'BBG000000003', validFrom: '2020-01-01' },
    { type: 'TICKER', value: 'AAA', validFrom: '2020-01-01' },
  ])
  await expect(database.db.insert(institutionalSecurityMappingRefreshJobs).values({
    securityId: BigInt(alpha.id), createdBy: BigInt(admin.id), status: 'RUNNING', createdAt: clock, updatedAt: clock,
  })).rejects.toMatchObject({ cause: { code: '23514' } })
  await createSecurity(admin.browser, 'Synthetic Reuse One', [{ type: 'CUSIP', value: '111111111', validFrom: '2020-01-01' }])
  await createSecurity(admin.browser, 'Synthetic Reuse Two', [{ type: 'CUSIP', value: '111111111', validFrom: '2020-01-01' }])
  await createSecurity(admin.browser, 'Synthetic CUSIP Conflict', [{ type: 'CUSIP', value: '444444444', validFrom: '2020-01-01' }])
  await createSecurity(admin.browser, 'Synthetic FIGI Conflict', [{ type: 'FIGI', value: 'BBG000000005', validFrom: '2020-01-01' }])
  const future = await createSecurity(admin.browser, 'Synthetic Future Identifier', [{ type: 'CUSIP', value: '555555555', validFrom: '2026-07-01' }])
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await runGuruFilingDiscoveryOnce({
      db: database.db, sec: {} as SecEdgarService, now: () => clock, workerId: 'synthetic-mapping-worker',
    })
    if (result.status === 'idle') break
    expect(result.status).toBe('mapping-refreshed')
  }
  const { filing, holdings } = await createFiling()

  expect(await resolveFilingHoldings(database.db, filing.id, clock)).toEqual({
    filingId: filing.id.toString(), totalPositions: 5, mappedPositions: 1, mappingCoverage: '20.00',
  })
  const queueResponse = await admin.browser.request(`/api/admin/institutional/mappings?filingId=${filing.id}&limit=50`)
  expect(queueResponse.status).toBe(200)
  const queue = adminInstitutionalMappingListResponseSchema.parse(await queueResponse.json())
  expect(queue.filing).toMatchObject({ id: filing.id.toString(), periodEnd: '2026-06-30', mappingCoverage: '20.00', parsedRowCount: 5 })
  expect(queue.data.map(row => row.resolution.status)).toEqual(['AMBIGUOUS', 'AMBIGUOUS', 'UNRESOLVED', 'UNRESOLVED'])
  expect(queue.data.find(row => row.holding.id === holdings[0]!.id.toString())).toBeUndefined()
  expect(queue.data.find(row => row.holding.id === holdings[1]!.id.toString())?.resolution.reason).toBe('IDENTIFIER_REUSED')
  expect(queue.data.find(row => row.holding.id === holdings[2]!.id.toString())?.resolution.reason).toBe('IDENTIFIERS_CONFLICT')
  expect(queue.data.find(row => row.holding.id === holdings[3]!.id.toString())?.resolution.reason).toBe('NO_STABLE_IDENTIFIER')
  expect(queue.data.find(row => row.holding.id === holdings[4]!.id.toString())?.resolution.reason).toBe('NO_IDENTIFIER_MATCH')
  expect(queue.data.find(row => row.holding.id === holdings[3]!.id.toString())?.candidates).toEqual([])

  await database.db.update(institutional13fHoldings).set({ cusip: '666666666' }).where(eq(institutional13fHoldings.id, holdings[3]!.id))
  const lateSecurityResponse = await admin.browser.post('/api/admin/institutional/securities', {
    issuer: 'Synthetic Alpha Inc.', titleOfClass: 'Class B', exchange: 'NASDAQ', securityType: 'EQUITY',
    sector: 'Technology', industry: 'Software', sourceUrl: 'https://issuer.example.test/late-master',
    confirmPrimarySource: true, identifiers: [{ type: 'CUSIP', value: '666666666', validFrom: '2020-01-01', validTo: null }],
  })
  expect(lateSecurityResponse.status).toBe(201)
  const lateSecurityCreated = adminInstitutionalSecurityCreateResponseSchema.parse(await lateSecurityResponse.json())
  expect(lateSecurityCreated.mappingRefreshJob).toMatchObject({ status: 'PENDING', lastBatchProcessed: 0 })
  const workerResult = await runGuruFilingDiscoveryOnce({
    db: database.db, sec: {} as SecEdgarService, now: () => clock, workerId: 'synthetic-mapping-worker',
  })
  expect(workerResult).toMatchObject({ status: 'mapping-refreshed', processed: 1, completed: true })
  const lateMapping = await admin.browser.request(`/api/admin/institutional/mappings?status=MATCHED&search=${encodeURIComponent(filing.accession)}`)
  expect(lateMapping.status).toBe(200)
  const lateMappingResponse = adminInstitutionalMappingListResponseSchema.parse(await lateMapping.json())
  expect(lateMappingResponse.filing).toMatchObject({ id: filing.id.toString(), accession: filing.accession, mappingCoverage: '40.00', parsedRowCount: 5 })
  expect(lateMappingResponse.data.find(row => row.holding.id === holdings[3]!.id.toString())?.resolution)
    .toMatchObject({ status: 'MATCHED', securityId: lateSecurityCreated.data.id })
  expect(lateSecurityCreated.data.id).not.toBe(alpha.id)
  expect(lateSecurityCreated.data).toMatchObject({ issuer: 'Synthetic Alpha Inc.', titleOfClass: 'Class B' })

  await expect(database.db.insert(institutionalSecurityIdentifiers).values({
    securityId: BigInt(alpha.id), type: 'TICKER', value: 'invalid ticker', validFrom: '2020-01-01', validTo: null,
    sourceUrl: 'https://issuer.example.test/invalid', sourceVerifiedBy: BigInt(admin.id), sourceVerifiedAt: clock, createdAt: clock,
  })).rejects.toMatchObject({ cause: { code: '23514' } })
  await expect(database.db.insert(institutionalSecurities).values({
    issuer: 'Synthetic orphan actor', titleOfClass: 'Common Stock', securityType: 'EQUITY',
    sourceUrl: 'https://issuer.example.test/orphan', sourceVerifiedBy: 9_223_372_036_854_775_000n, sourceVerifiedAt: clock,
  })).rejects.toMatchObject({ cause: { code: '23503' } })
  await expect(database.db.insert(institutionalSecurityMappingOverrides).values({
    holdingId: holdings[0]!.id, securityId: BigInt(alpha.id), version: 3, actorUserId: 9_223_372_036_854_775_000n,
    reason: 'Synthetic invalid actor', evidenceUrl: 'https://www.sec.gov/Archives/edgar/data/1/invalid-actor', createdAt: clock,
  })).rejects.toMatchObject({ cause: { code: '23503' } })
  await expect(database.db.insert(institutionalSecurityIdentityEvents).values({
    kind: 'TICKER_CHANGE', fromSecurityId: BigInt(alpha.id), toSecurityId: BigInt(alpha.id), effectiveOn: '2026-01-01',
    newTicker: 'ZZZ', newSharesPerOldShare: null, comparable: true, reason: 'Synthetic invalid actor event',
    evidenceUrl: 'https://issuer.example.test/invalid-actor', actorUserId: 9_223_372_036_854_775_000n,
    verifiedAt: clock, createdAt: clock,
  })).rejects.toMatchObject({ cause: { code: '23503' } })

  const searched = await admin.browser.request('/api/admin/institutional/securities?q=333333333')
  expect(adminInstitutionalSecurityListResponseSchema.parse(await searched.json()).data.map(row => row.id)).toContain(alpha.id)
  const detail = await admin.browser.request(`/api/admin/institutional/securities/${alpha.id}`)
  expect(adminInstitutionalSecurityResponseSchema.parse(await detail.json()).data).toMatchObject({ id: alpha.id, issuer: 'Synthetic Alpha Inc.' })
  expect((await ordinary.browser.post(`/api/admin/institutional/mappings/${holdings[0]!.id}/override`, {
    securityId: alpha.id, reason: 'Synthetic correction', evidenceUrl: 'https://www.sec.gov/Archives/edgar/data/1/example', confirmPrimarySource: true,
  })).status).toBe(403)

  const firstOverrideResponse = await admin.browser.post(`/api/admin/institutional/mappings/${holdings[0]!.id}/override`, {
    securityId: future.id, reason: 'Synthetic ambiguous identity review', evidenceUrl: 'https://www.sec.gov/Archives/edgar/data/1/first', confirmPrimarySource: true,
  })
  expect(firstOverrideResponse.status).toBe(201)
  const firstOverride = (await firstOverrideResponse.json()).data.override
  clock = new Date('2026-10-06T09:00:00.000Z')
  const secondOverrideResponse = await admin.browser.post(`/api/admin/institutional/mappings/${holdings[0]!.id}/override`, {
    securityId: alpha.id, reason: 'Synthetic verified correction', evidenceUrl: 'https://www.sec.gov/Archives/edgar/data/1/second', confirmPrimarySource: true,
  })
  expect(secondOverrideResponse.status).toBe(201)
  expect((await secondOverrideResponse.json()).data.override).toMatchObject({ version: 2, supersedesOverrideId: firstOverride.id, actorUserId: admin.id })
  expect(await resolveFilingHoldings(database.db, filing.id, clock)).toMatchObject({ mappedPositions: 2, mappingCoverage: '40.00' })
  const manualQueue = adminInstitutionalMappingListResponseSchema.parse(await (await admin.browser.request(`/api/admin/institutional/mappings?filingId=${filing.id}&status=MANUAL_OVERRIDE`)).json())
  expect(manualQueue.data).toHaveLength(1)
  expect(manualQueue.data[0]).toMatchObject({
    resolution: { status: 'MANUAL_OVERRIDE', securityId: alpha.id, reason: 'ADMIN_OVERRIDE' },
    override: { version: 2, actorUserId: admin.id, reason: 'Synthetic verified correction', supersedesOverrideId: firstOverride.id },
    overrideHistory: [
      { version: 2, actorUserId: admin.id, reason: 'Synthetic verified correction', evidenceUrl: 'https://www.sec.gov/Archives/edgar/data/1/second', supersedesOverrideId: firstOverride.id },
      { id: firstOverride.id, version: 1, actorUserId: admin.id, reason: 'Synthetic ambiguous identity review', evidenceUrl: 'https://www.sec.gov/Archives/edgar/data/1/first', supersedesOverrideId: null },
    ],
  })
  await expect(database.db.update(institutionalSecurityMappingOverrides).set({ reason: 'mutated' })).rejects.toMatchObject({ cause: { code: 'P0001' } })

  const ticker = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'TICKER_CHANGE', newTicker: 'BBB', effectiveOn: '2026-01-01', reason: 'Synthetic ticker change',
    evidenceUrl: 'https://issuer.example.test/investor/notice', confirmPrimarySource: true,
  })
  expect(ticker.status).toBe(201)
  const tickerEvent = (await ticker.json()).data
  expect(tickerEvent).toMatchObject({ kind: 'TICKER_CHANGE', fromSecurityId: alpha.id, toSecurityId: alpha.id, newTicker: 'BBB', comparable: true })
  const identifiersAfterTicker = await database.db.select().from(institutionalSecurityIdentifiers).where(eq(institutionalSecurityIdentifiers.securityId, BigInt(alpha.id)))
  expect(identifiersAfterTicker.find(row => row.value === 'AAA')).toMatchObject({ validTo: '2025-12-31' })
  expect(identifiersAfterTicker.find(row => row.value === 'BBB')).toMatchObject({ validFrom: '2026-01-01', validTo: null })
  const tickerCorrection = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'TICKER_CHANGE', newTicker: 'CCC', effectiveOn: '2026-01-01', supersedesEventId: tickerEvent.id,
    reason: 'Synthetic corrected ticker', evidenceUrl: 'https://issuer.example.test/investor/corrected-notice', confirmPrimarySource: true,
  })
  expect(tickerCorrection.status).toBe(201)
  const tickerCorrectionEvent = (await tickerCorrection.json()).data
  expect(tickerCorrectionEvent).toMatchObject({ newTicker: 'CCC', supersedesEventId: tickerEvent.id })
  const tickerRowsAfterCorrection = await database.db.select().from(institutionalSecurityIdentifiers).where(eq(institutionalSecurityIdentifiers.securityId, BigInt(alpha.id)))
  const tickerAAA = tickerRowsAfterCorrection.find(row => row.value === 'AAA')!
  const tickerBBB = tickerRowsAfterCorrection.find(row => row.value === 'BBB')!
  const tickerCCC = tickerRowsAfterCorrection.find(row => row.value === 'CCC')!
  expect(tickerAAA).toMatchObject({ validTo: '2025-12-31' })
  expect(tickerBBB).toMatchObject({ supersedesIdentifierId: tickerAAA.id, validFrom: '2026-01-01', validTo: null })
  expect(tickerCCC).toMatchObject({ supersedesIdentifierId: tickerBBB.id, validFrom: '2026-01-01', validTo: null })
  expect(await resolveSecurityIdentifier(database.db, 'TICKER', 'AAA', '2025-12-31')).toMatchObject({ status: 'MATCHED', securityId: alpha.id })
  expect(await resolveSecurityIdentifier(database.db, 'TICKER', 'BBB', '2026-01-10')).toMatchObject({ status: 'UNRESOLVED', securityId: null })
  expect(await resolveSecurityIdentifier(database.db, 'TICKER', 'CCC', '2026-01-10')).toMatchObject({ status: 'MATCHED', securityId: alpha.id })

  const tickerLater = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'TICKER_CHANGE', newTicker: 'DDD', effectiveOn: '2026-02-01', reason: 'Synthetic later ticker change',
    evidenceUrl: 'https://issuer.example.test/investor/later-ticker', confirmPrimarySource: true,
  })
  expect(tickerLater.status).toBe(201)
  const tickerLatest = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'TICKER_CHANGE', newTicker: 'EEE', effectiveOn: '2026-03-01', reason: 'Synthetic latest ticker change',
    evidenceUrl: 'https://issuer.example.test/investor/latest-ticker', confirmPrimarySource: true,
  })
  expect(tickerLatest.status).toBe(201)
  expect((await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'TICKER_CHANGE', newTicker: 'FFF', effectiveOn: '2026-02-01', supersedesEventId: (await tickerLater.json()).data.id,
    reason: 'Synthetic non-latest ticker correction', evidenceUrl: 'https://issuer.example.test/investor/invalid-correction', confirmPrimarySource: true,
  })).status).toBe(409)
  const tickerTimeline = await database.db.select().from(institutionalSecurityIdentifiers).where(eq(institutionalSecurityIdentifiers.securityId, BigInt(alpha.id)))
  expect(tickerTimeline.every(row => row.validTo === null || row.validTo >= row.validFrom)).toBe(true)

  const split = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'STOCK_SPLIT', newSharesPerOldShare: '2', effectiveOn: '2026-03-01', reason: 'Synthetic 2-for-1 split',
    evidenceUrl: 'https://issuer.example.test/investor/split', confirmPrimarySource: true,
  })
  expect(split.status).toBe(201)
  const splitEvent = (await split.json()).data
  expect(splitEvent).toMatchObject({ kind: 'STOCK_SPLIT', newSharesPerOldShare: '2.000000000000', comparable: true })
  const splitCorrection = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'STOCK_SPLIT', newSharesPerOldShare: '3', effectiveOn: '2026-03-01', supersedesEventId: splitEvent.id,
    reason: 'Synthetic corrected split factor', evidenceUrl: 'https://issuer.example.test/investor/split-correction', confirmPrimarySource: true,
  })
  expect(splitCorrection.status).toBe(201)
  const splitCorrectionEvent = (await splitCorrection.json()).data
  expect(splitCorrectionEvent).toMatchObject({ supersedesEventId: splitEvent.id, newSharesPerOldShare: '3.000000000000' })
  expect((await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'STOCK_SPLIT', effectiveOn: '2026-04-01', reason: 'Missing conversion', evidenceUrl: 'https://issuer.example.test/split', confirmPrimarySource: true,
  })).status).toBe(400)

  const classContinuity = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'SHARE_CLASS_CONTINUITY', relatedSecurityId: future.id, comparable: true, newSharesPerOldShare: '1.25',
    effectiveOn: '2026-04-01', reason: 'Synthetic class conversion', evidenceUrl: 'https://issuer.example.test/investor/class', confirmPrimarySource: true,
  })
  expect(classContinuity.status).toBe(201)
  const classEvent = (await classContinuity.json()).data
  expect(classEvent).toMatchObject({ kind: 'SHARE_CLASS_CONTINUITY', toSecurityId: future.id, comparable: true })

  const merger = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'MERGER', relatedSecurityId: future.id, effectiveOn: '2026-05-01', reason: 'Synthetic merger relation',
    evidenceUrl: 'https://issuer.example.test/investor/merger', confirmPrimarySource: true,
  })
  expect(merger.status).toBe(201)
  expect((await merger.json()).data).toMatchObject({ kind: 'MERGER', newSharesPerOldShare: null, comparable: false })

  const spinOff = await admin.browser.post(`/api/admin/institutional/securities/${alpha.id}/identity-events`, {
    kind: 'SPIN_OFF', relatedSecurityId: future.id, effectiveOn: '2026-05-02', reason: 'Synthetic spin-off relation',
    evidenceUrl: 'https://issuer.example.test/investor/spin-off', confirmPrimarySource: true,
  })
  expect(spinOff.status).toBe(201)
  expect((await spinOff.json()).data).toMatchObject({ kind: 'SPIN_OFF', newSharesPerOldShare: null, comparable: false })

  const delisting = await admin.browser.post(`/api/admin/institutional/securities/${future.id}/identity-events`, {
    kind: 'DELISTING', effectiveOn: '2026-06-01', reason: 'Synthetic delisting',
    evidenceUrl: 'https://issuer.example.test/investor/delisting', confirmPrimarySource: true,
  })
  expect(delisting.status).toBe(201)
  expect((await delisting.json()).data).toMatchObject({ kind: 'DELISTING', toSecurityId: null, comparable: false })
  expect((await database.db.select().from(institutionalSecurities).where(eq(institutionalSecurities.id, BigInt(future.id))))[0]).toMatchObject({ status: 'DELISTED' })

  const eventsResponse = await admin.browser.request(`/api/admin/institutional/securities/${alpha.id}/identity-events?limit=50`)
  const events = adminInstitutionalIdentityEventListResponseSchema.parse(await eventsResponse.json()).data
  expect(events.map(event => event.kind)).toEqual(expect.arrayContaining(['TICKER_CHANGE', 'STOCK_SPLIT', 'SHARE_CLASS_CONTINUITY', 'MERGER', 'SPIN_OFF']))
  expect(events.find(event => event.id === classEvent.id)?.actorUserId).toBe(admin.id)
  await expect(database.db.delete(institutionalSecurityIdentityEvents)).rejects.toMatchObject({ cause: { code: 'P0001' } })

  const storedEvents = await database.db.select().from(institutionalSecurityIdentityEvents)
  const comparabilityEvents = storedEvents.map(event => ({
    id: event.id.toString(), supersedesEventId: event.supersedesEventId?.toString() ?? null,
    kind: event.kind, fromSecurityId: event.fromSecurityId.toString(), toSecurityId: event.toSecurityId?.toString() ?? null,
    effectiveOn: event.effectiveOn, newSharesPerOldShare: event.newSharesPerOldShare, comparable: event.comparable,
  }))
  expect(compareSecurityIdentity(alpha.id, alpha.id, '2026-02-28', '2026-03-02', comparabilityEvents)).toMatchObject({ comparable: true, quantityFactor: '3', reason: 'VERIFIED_SPLIT_CONVERSION' })
  expect(compareSecurityIdentity(alpha.id, future.id, '2026-03-30', '2026-04-02', comparabilityEvents)).toMatchObject({ comparable: true, quantityFactor: '1.25', reason: 'VERIFIED_CLASS_CONVERSION' })
  expect(compareSecurityIdentity(alpha.id, future.id, '2026-04-30', '2026-05-02', comparabilityEvents)).toMatchObject({ comparable: false, quantityFactor: null, reason: 'TRANSFORMATION_NON_COMPARABLE' })
  expect(await database.db.select().from(institutionalSecurityIdentityEvents)).toHaveLength(10)
})
