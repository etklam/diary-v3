import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import {
  guruFollowers,
  guruHoldingChanges,
  guruQuarterAnalytics,
  gurus,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshots,
  institutionalFilings,
  institutionalManagers,
  users,
} from '@diary/db'
import { createApp } from '../../apps/api/src/app.js'
import { BrowserSession } from '../support/browser-session.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
let clock: Date
let managerNumber = 810000
let filingNumber = 1

beforeAll(async () => { database = await provisionTestDatabase('gurus_http') })
beforeEach(async () => {
  clock = new Date('2026-10-06T08:00:00.000Z')
  const app = createApp({
    db: database.db, databasePool: database.pool, now: () => clock,
    config: { jwtSecret: 'synthetic-guru-http-secret-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

function digest(value: string) { return createHash('sha256').update(value).digest('hex') }

async function account(role: 'ADMIN' | 'USER' = 'USER') {
  const browser = new BrowserSession(baseUrl)
  const email = `${randomUUID()}@example.test`
  const password = 'synthetic-guru-http-password'
  const [user] = await database.db.insert(users).values({ email, password: await bcrypt.hash(password, 4), role }).returning()
  expect((await browser.post('/api/auth/login', { email, password })).status).toBe(200)
  return { browser, id: user!.id.toString(), email }
}

async function createGuru(input: {
  name: string
  slug: string
  styles: string[]
  managerType: string
  featured?: boolean
  directoryOrder?: number
}) {
  const cik = String(managerNumber++).padStart(10, '0')
  const [manager] = await database.db.insert(institutionalManagers).values({ cik }).returning()
  const [guru] = await database.db.insert(gurus).values({
    managerId: manager!.id, slug: input.slug, name: input.name, managerName: `${input.name} Capital`,
    description: `${input.name} editorial profile`, investmentPhilosophy: 'Synthetic long-term approach',
    styleTags: input.styles, managerType: input.managerType, website: 'https://fund.example.test', country: 'US',
    featured: input.featured ?? false, active: true, directoryOrder: input.directoryOrder ?? 0,
  }).returning()
  return { manager: manager!, guru: guru! }
}

const position = {
  positionKey: 'security:unknown:SH', securityId: null, ticker: 'SYN', company: 'Synthetic Systems',
  quantityType: 'SH', putCall: null, quantity: '1200', reportedValueUsd: '720000', weightPercent: '36', rank: 1,
}

async function addQuarter(input: {
  managerId: bigint
  periodEnd: string
  filedAt?: string
  value?: string
  status?: 'READY' | 'PARTIAL' | 'ERROR'
  topTen?: string
  turnover?: string
  newCount?: number
  addCount?: number
}) {
  const value = input.value ?? '2000000'
  const accession = `${String(input.managerId).padStart(10, '0')}-26-${String(filingNumber++).padStart(6, '0')}`
  const filedAt = new Date(input.filedAt ?? `${input.periodEnd}T20:00:00.000Z`)
  const [filing] = await database.db.insert(institutionalFilings).values({
    managerId: input.managerId, accession, form: '13F-HR', filingDate: filedAt.toISOString().slice(0, 10), filedAt,
    periodEnd: input.periodEnd, sourceUrl: `https://www.sec.gov/Archives/fixture/${accession}`, status: 'READY',
  }).returning()
  const hash = digest(`${input.managerId}:${input.periodEnd}:${randomUUID()}`)
  const [snapshot] = await database.db.insert(institutionalEffectiveSnapshots).values({
    managerId: input.managerId, periodEnd: input.periodEnd, replayKey: hash, snapshotHash: hash,
    sourceManifestHash: hash, resolverVersion: 'guru-http-fixture-v1', holdingCount: 1, createdAt: clock,
  }).returning()
  const status = input.status ?? 'READY'
  const result = status === 'READY' ? {
    portfolio: {
      largestPosition: position,
      topHoldings: [{ ...position, reportedValueUsd: value, weightPercent: '36' }],
      sectorAllocation: [{ name: 'Technology', reportedValueUsd: value, weightPercent: '60' }],
    },
  } : null
  const [analytics] = await database.db.insert(guruQuarterAnalytics).values({
    managerId: input.managerId, periodEnd: input.periodEnd, snapshotId: snapshot!.id, previousSnapshotId: null,
    analyticsVersion: 'guru-portfolio-analytics-v1', inputHash: hash, contextHash: hash, status,
    comparisonStatus: 'COMPARABLE', reportedValueUsd: value, holdingCount: 1, sourceRowCount: 1, mappedRowCount: 1,
    mappingCoveragePercent: '100', topOneConcentrationPercent: '36', topFiveConcentrationPercent: '60',
    topTenConcentrationPercent: input.topTen ?? '60', hhi: '0.4500', disclosedWeightTurnoverPercent: input.turnover ?? '12', turnoverBand: 'MODERATE',
    turnoverUnavailableReason: null, newCount: status === 'READY' ? input.newCount ?? 1 : 0, strongAddCount: 0, addCount: status === 'READY' ? input.addCount ?? 0 : 0,
    unchangedCount: 0, reduceCount: 0, strongReduceCount: 0, exitCount: 0, result, calculatedAt: clock,
  }).returning()
  await database.db.insert(institutionalEffectivePeriodStates).values({
    managerId: input.managerId, periodEnd: input.periodEnd, status, reason: status === 'READY' ? null : 'MAPPING_INCOMPLETE',
    sourceManifestHash: hash, checkedAt: clock,
  })
  await database.db.insert(institutionalEffectiveSnapshotPublications).values({
    snapshotId: snapshot!.id, managerId: input.managerId, periodEnd: input.periodEnd, status: 'READY', active: true, updatedAt: clock,
  })
  return { filing: filing!, snapshot: snapshot!, analytics: analytics! }
}

it('filters, searches, sorts and paginates prepared Guru directory data without exposing follower identities', async () => {
  const valueGuru = await createGuru({ name: 'Zulu Investor', slug: `zulu-${randomUUID()}`, styles: ['Value', 'Quality'], managerType: 'Hedge Fund', featured: true, directoryOrder: 3 })
  const growthGuru = await createGuru({ name: 'Alpha Partners', slug: `alpha-${randomUUID()}`, styles: ['Growth'], managerType: 'Family Office', directoryOrder: 1 })
  const thirdGuru = await createGuru({ name: 'Beta Capital', slug: `beta-${randomUUID()}`, styles: ['Value'], managerType: 'Hedge Fund', directoryOrder: 2 })
  await addQuarter({ managerId: valueGuru.manager.id, periodEnd: '2026-06-30', filedAt: '2026-08-14T20:00:00.000Z', topTen: '80', turnover: '12', newCount: 1, addCount: 2 })
  await addQuarter({ managerId: growthGuru.manager.id, periodEnd: '2026-06-30', filedAt: '2026-09-01T20:00:00.000Z', value: '1000000', topTen: '50', turnover: '30', newCount: 0 })
  await addQuarter({ managerId: thirdGuru.manager.id, periodEnd: '2026-06-30', filedAt: '2026-08-01T20:00:00.000Z', value: '500000', topTen: '65', turnover: '5', newCount: 0 })
  const actor = await account()

  const search = await actor.browser.request('/api/gurus?search=zUlU%20iNvEsToR')
  expect(search.status).toBe(200)
  expect(search.headers.get('cache-control')).toContain('private')
  const searchBody = await search.json() as { data: Array<{ profile: { name: string }; latest: { periodEnd: string; reportedValueUsd: string } }> }
  expect(searchBody.data).toHaveLength(1)
  expect(searchBody.data[0]).toMatchObject({ profile: { name: 'Zulu Investor' }, latest: { periodEnd: '2026-06-30', reportedValueUsd: '2000000.00000000' } })

  const filtered = await actor.browser.request('/api/gurus?style=Value&managerType=Hedge%20Fund&sector=Technology')
  expect((await filtered.json() as { data: unknown[] }).data).toHaveLength(2)
  const featured = await actor.browser.request('/api/gurus?featured=true')
  expect((await featured.json() as { data: unknown[] }).data).toHaveLength(1)
  const az = await actor.browser.request('/api/gurus?sort=az&limit=2')
  const azBody = await az.json() as { data: Array<{ profile: { name: string } }>; pagination: { total: number; totalPages: number } }
  expect(azBody.data.map(entry => entry.profile.name)).toEqual(['Alpha Partners', 'Beta Capital'])
  expect(azBody.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 })
  const secondPage = await actor.browser.request('/api/gurus?sort=az&limit=2&page=2')
  expect((await secondPage.json() as { data: Array<{ profile: { name: string } }> }).data[0]?.profile.name).toBe('Zulu Investor')
  const custom = await actor.browser.request('/api/gurus?sort=custom')
  expect((await custom.json() as { data: Array<{ profile: { name: string } }> }).data.map(entry => entry.profile.name)).toEqual(['Zulu Investor', 'Alpha Partners', 'Beta Capital'])
  const concentration = await actor.browser.request('/api/gurus?sort=concentration')
  expect((await concentration.json() as { data: Array<{ profile: { name: string } }> }).data.map(entry => entry.profile.name)[0]).toBe('Zulu Investor')
  const turnover = await actor.browser.request('/api/gurus?sort=turnover')
  expect((await turnover.json() as { data: Array<{ profile: { name: string } }> }).data.map(entry => entry.profile.name)[0]).toBe('Alpha Partners')
  const activity = await actor.browser.request('/api/gurus?sort=activity')
  expect((await activity.json() as { data: Array<{ profile: { name: string } }> }).data.map(entry => entry.profile.name)[0]).toBe('Zulu Investor')
  const latestFiling = await actor.browser.request('/api/gurus?sort=latest_filing')
  expect((await latestFiling.json() as { data: Array<{ profile: { name: string } }> }).data.map(entry => entry.profile.name)[0]).toBe('Alpha Partners')

  const forbidden = await fetch(`${baseUrl}/api/gurus?sort=az`)
  const publicBody = await forbidden.json() as { data: Array<Record<string, unknown>> }
  expect(forbidden.headers.get('cache-control')).toContain('public')
  expect(forbidden.headers.get('vary')).toContain('Cookie')
  expect(JSON.stringify(publicBody)).not.toContain(actor.email)
  expect(JSON.stringify(publicBody)).not.toContain('userId')

  const anonymous = new BrowserSession(baseUrl)
  await anonymous.request('/api/gurus')
  expect((await anonymous.request(`/api/gurus/${valueGuru.guru.slug}/follow`, {
    method: 'PUT', headers: { 'x-csrf-token': anonymous.cookies.get('csrf-token')! },
  })).status).toBe(401)
  const follow = async () => actor.browser.request(`/api/gurus/${valueGuru.guru.slug}/follow`, {
    method: 'PUT', headers: { 'x-csrf-token': actor.browser.cookies.get('csrf-token')! },
  })
  expect((await (await follow()).json()).data).toEqual({ following: true, followerCount: 1 })
  expect((await (await follow()).json()).data).toEqual({ following: true, followerCount: 1 })
  const followedDirectory = await actor.browser.request('/api/gurus?sort=followers')
  const followedRows = (await followedDirectory.json() as { data: Array<{ profile: { name: string }; followedByMe: boolean; followerCount: number }> }).data
  expect(followedRows[0]).toMatchObject({ profile: { name: 'Zulu Investor' }, followedByMe: true, followerCount: 1 })
  expect(await database.db.select().from(guruFollowers).where(and(eq(guruFollowers.guruId, valueGuru.guru.id), eq(guruFollowers.userId, BigInt(actor.id))))).toHaveLength(1)
  const unfollow = await actor.browser.request(`/api/gurus/${valueGuru.guru.slug}/follow`, {
    method: 'DELETE', headers: { 'x-csrf-token': actor.browser.cookies.get('csrf-token')! },
  })
  expect((await unfollow.json()).data).toEqual({ following: false, followerCount: 0 })
})

it('serves traceable overview history and hides portfolio values and moves when the latest quarter is partial', async () => {
  const created = await createGuru({ name: 'History Manager', slug: `history-${randomUUID()}`, styles: ['Value'], managerType: 'Hedge Fund' })
  await addQuarter({ managerId: created.manager.id, periodEnd: '2026-03-31', value: '1500000' })
  const latest = await addQuarter({ managerId: created.manager.id, periodEnd: '2026-06-30', value: '2000000' })
  await database.db.insert(guruHoldingChanges).values({
    analyticsId: latest.analytics.id, positionKey: position.positionKey, securityId: null, ticker: position.ticker,
    company: position.company, action: 'STRONG_ADD', quantityType: 'SH', putCall: null,
    previousQuantity: '800', comparablePreviousQuantity: '800', currentQuantity: '1200', quantityChange: '400', quantityChangePercent: '50',
    quantityAdjustmentFactor: '1', corporateActionEventIds: [], previousWeightPercent: '30', currentWeightPercent: '36',
    weightChangePercentagePoints: '6', previousRank: 2, currentRank: 1, previousReportedValueUsd: '600000',
    currentReportedValueUsd: '720000', reportedValueChangeUsd: '120000',
  })
  const browser = new BrowserSession(baseUrl)
  const readyResponse = await browser.request(`/api/gurus/${created.guru.slug}`)
  expect(readyResponse.status).toBe(200)
  const ready = await readyResponse.json() as { data: { cik: string; latest: { status: string; reportedValueUsd: string; holdingCount: number; topHoldings: Array<{ ticker: string }> }; latestMoves: Array<{ action: string; quantityChangePercent: string }>; history: Array<{ periodEnd: string }>; source: { accession: string; form: string; sourceUrl: string } } }
  expect(ready.data).toMatchObject({
    cik: String(created.manager.cik),
    latest: { status: 'READY', reportedValueUsd: '2000000.00000000', holdingCount: 1, topHoldings: [{ ticker: 'SYN' }] },
    latestMoves: [{ action: 'STRONG_ADD', quantityChangePercent: '50.00000000' }],
    history: [{ periodEnd: '2026-06-30' }, { periodEnd: '2026-03-31' }],
    source: { accession: latest.filing.accession, form: '13F-HR', sourceUrl: latest.filing.sourceUrl },
  })

  await database.db.update(institutionalEffectiveSnapshotPublications).set({ active: false, status: 'SUPERSEDED' }).where(eq(
    institutionalEffectiveSnapshotPublications.snapshotId, latest.snapshot.id,
  ))
  const staleHash = digest(`replacement:${randomUUID()}`)
  const [replacement] = await database.db.insert(institutionalEffectiveSnapshots).values({
    managerId: created.manager.id, periodEnd: '2026-06-30', replayKey: staleHash, snapshotHash: staleHash,
    sourceManifestHash: staleHash, resolverVersion: 'guru-http-fixture-v2', holdingCount: 1, createdAt: clock,
  }).returning()
  await database.db.insert(institutionalEffectiveSnapshotPublications).values({
    snapshotId: replacement!.id, managerId: created.manager.id, periodEnd: '2026-06-30', status: 'READY', active: true, updatedAt: clock,
  })
  const rebuildingResponse = await browser.request(`/api/gurus/${created.guru.slug}`)
  const rebuilding = await rebuildingResponse.json() as { data: { latest: { status: string; reportedValueUsd: string | null; topHoldings: unknown[] }; latestMoves: unknown[] } }
  expect(rebuilding.data).toMatchObject({ latest: { status: 'PENDING', reportedValueUsd: null, topHoldings: [] }, latestMoves: [] })

  await database.db.update(institutionalEffectivePeriodStates).set({ status: 'PARTIAL', reason: 'MAPPING_INCOMPLETE' }).where(and(
    eq(institutionalEffectivePeriodStates.managerId, created.manager.id), eq(institutionalEffectivePeriodStates.periodEnd, '2026-06-30'),
  ))
  const partialResponse = await browser.request(`/api/gurus/${created.guru.slug}`)
  const partial = await partialResponse.json() as { data: { latest: { status: string; reportedValueUsd: string | null; holdingCount: number | null; topHoldings: unknown[] }; latestMoves: unknown[] } }
  expect(partial.data).toMatchObject({ latest: { status: 'PARTIAL', reportedValueUsd: null, holdingCount: null, topHoldings: [] }, latestMoves: [] })
})
