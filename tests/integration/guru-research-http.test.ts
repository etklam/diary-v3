import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import {
  guruHoldingChanges,
  guruQuarterAnalytics,
  gurus,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshotSources,
  institutionalEffectiveSnapshots,
  institutionalFilingArtifacts,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagers,
  institutionalSecurityIdentifiers,
  institutionalSecurities,
  users,
} from '@diary/db'
import { createApp } from '../../apps/api/src/app.js'
import { provisionTestDatabase } from '../support/database.js'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl: string
const now = new Date('2026-10-06T08:00:00.000Z')

beforeAll(async () => { database = await provisionTestDatabase('guru_research_http') })
beforeEach(async () => {
  const app = createApp({
    db: database.db, databasePool: database.pool, now: () => now,
    config: { jwtSecret: 'synthetic-guru-research-secret-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })

function hash(value: string) { return createHash('sha256').update(value).digest('hex') }

it('serves prepared Guru portfolio, moves, history, activity, filing lineage and stable CSV exports', async () => {
  const [owner] = await database.db.insert(users).values({
    email: `${randomUUID()}@example.test`, password: await bcrypt.hash('synthetic-guru-research-password', 4), role: 'ADMIN',
  }).returning()
  const [manager] = await database.db.insert(institutionalManagers).values({ cik: '0081000001' }).returning()
  const [guru] = await database.db.insert(gurus).values({
    managerId: manager!.id, slug: `research-${randomUUID()}`, name: 'Research Manager', managerName: 'Synthetic Research Fund',
    styleTags: ['Value'], managerType: 'Hedge Fund', active: true, featured: false, directoryOrder: 0,
  }).returning()
  const [technology] = await database.db.insert(institutionalSecurities).values({
    issuer: '=Synthetic Industries', titleOfClass: 'Common Stock', securityType: 'Common Stock', sector: 'Technology', industry: 'Software',
    sourceUrl: 'https://issuer.example.test/security', sourceVerifiedBy: owner!.id, sourceVerifiedAt: now,
  }).returning()
  const [newSecurity] = await database.db.insert(institutionalSecurities).values({
    issuer: 'New Synthetic Systems', titleOfClass: 'Common Stock', securityType: 'Common Stock', sector: 'Technology', industry: 'Software',
    sourceUrl: 'https://issuer.example.test/new-security', sourceVerifiedBy: owner!.id, sourceVerifiedAt: now,
  }).returning()
  const [exitedSecurity] = await database.db.insert(institutionalSecurities).values({
    issuer: 'Exited Energy Co', titleOfClass: 'Common Stock', securityType: 'Common Stock', sector: 'Energy', industry: 'Oil & Gas',
    sourceUrl: 'https://issuer.example.test/exited-security', sourceVerifiedBy: owner!.id, sourceVerifiedAt: now,
  }).returning()
  for (const [security, ticker] of [[technology!, 'SYN'], [newSecurity!, 'NEW'], [exitedSecurity!, 'OLD']] as const) {
    await database.db.insert(institutionalSecurityIdentifiers).values({
      securityId: security.id, type: 'TICKER', value: ticker, validFrom: '2020-01-01', validTo: null,
      sourceUrl: 'https://issuer.example.test/ticker', sourceVerifiedBy: owner!.id, sourceVerifiedAt: now,
    })
  }

  const positionKey = (securityId: bigint) => `SECURITY:${securityId}:SH:NONE`
  const quarters = new Map<string, { snapshot: typeof institutionalEffectiveSnapshots.$inferSelect; filing: typeof institutionalFilings.$inferSelect }>()
  for (const [periodEnd, suffix] of [['2026-03-31', '000001'], ['2026-06-30', '000002']] as const) {
    const accession = `0081000001-26-${suffix}`
    const sourceUrl = `https://www.sec.gov/Archives/fixture/${accession}`
    const [filing] = await database.db.insert(institutionalFilings).values({
      managerId: manager!.id, accession, form: '13F-HR', filingDate: periodEnd, filedAt: new Date(`${periodEnd}T20:00:00.000Z`),
      periodEnd, sourceUrl, status: 'READY', parserVersion: 'synthetic-parser-v1', parsedRowCount: periodEnd === '2026-03-31' ? 2 : 2,
      mappingCoverage: '100', ingestedAt: now,
    }).returning()
    const documentUrl = `${sourceUrl}/information-table.xml`
    const [document] = await database.db.insert(institutionalFilingDocuments).values({
      filingId: filing!.id, basename: 'information-table.xml', documentType: '13F Information Table', description: 'Synthetic filing fixture', isPrimary: true, sourceUrl: documentUrl, contentLength: 16n, downloadedAt: now,
    }).returning()
    const digest = hash(`${accession}:artifact`)
    const [artifact] = await database.db.insert(institutionalFilingArtifacts).values({
      documentId: document!.id, artifactRef: `fixture/${accession}/information-table.xml`, contentSha256: digest,
      rawContent: '<fixture></fixture>', contentLength: 18n, fetchedAt: now, fetchedReason: 'initial', retainUntil: null,
    }).returning()
    const replayKey = hash(`${accession}:snapshot`)
    const [snapshot] = await database.db.insert(institutionalEffectiveSnapshots).values({
      managerId: manager!.id, periodEnd, replayKey, snapshotHash: replayKey, sourceManifestHash: replayKey,
      resolverVersion: 'fixture-resolver-v1', holdingCount: 2, createdAt: now,
    }).returning()
    await database.db.insert(institutionalEffectiveSnapshotSources).values({
      snapshotId: snapshot!.id, ordinal: 0, filingId: filing!.id, accession, operation: 'ORIGINAL', amendmentNumber: null,
      parserVersion: 'synthetic-parser-v1', sourceManifest: { fixture: true },
    })
    await database.db.insert(institutionalEffectiveSnapshotPublications).values({
      snapshotId: snapshot!.id, managerId: manager!.id, periodEnd, status: 'READY', active: true, updatedAt: now,
    })
    await database.db.insert(institutionalEffectivePeriodStates).values({
      managerId: manager!.id, periodEnd, status: 'READY', reason: null, sourceManifestHash: replayKey, checkedAt: now,
    })
    quarters.set(periodEnd, { snapshot: snapshot!, filing: filing! })

    const positions = periodEnd === '2026-03-31'
      ? [{ id: technology!.id, shares: '700', value: '500000', ordinal: 0 }, { id: exitedSecurity!.id, shares: '300', value: '300000', ordinal: 1 }]
      : [{ id: technology!.id, shares: '1200', value: '700000', ordinal: 0 }, { id: newSecurity!.id, shares: '1000', value: '300000', ordinal: 1 }]
    for (const item of positions) await database.db.insert(institutionalEffectiveHoldings).values({
      snapshotId: snapshot!.id, ordinal: item.ordinal, sourceFilingId: filing!.id, sourceDocumentId: document!.id, sourceArtifactId: artifact!.id,
      sourceRowKey: hash(`${accession}:${item.ordinal}`), sourceRowNumber: item.ordinal + 1, securityId: item.id,
      mappingStatus: 'MATCHED', mappingVersion: 'fixture-map-v1', issuer: item.id === technology!.id ? '=Synthetic Industries' : item.id === newSecurity!.id ? 'New Synthetic Systems' : 'Exited Energy Co',
      titleOfClass: 'Common Stock', cusip: null, figi: null, reportedValue: item.value, reportedValueUnit: 'USD',
      quantity: item.shares, quantityType: 'SH', putCall: null, sourceData: { fixture: true },
    })
  }

  const prior = quarters.get('2026-03-31')!
  const current = quarters.get('2026-06-30')!
  const q1Result = {
    portfolio: {
      largestPosition: { positionKey: positionKey(technology!.id), securityId: technology!.id.toString(), ticker: 'SYN', company: '=Synthetic Industries', quantityType: 'SH', putCall: null, quantity: '700', reportedValueUsd: '500000', weightPercent: '62.5', rank: 1 },
      topHoldings: [], sectorAllocation: [{ name: 'Technology', reportedValueUsd: '500000', weightPercent: '62.5' }, { name: 'Energy', reportedValueUsd: '300000', weightPercent: '37.5' }],
    },
  }
  const q2Result = {
    portfolio: {
      largestPosition: { positionKey: positionKey(technology!.id), securityId: technology!.id.toString(), ticker: 'SYN', company: '=Synthetic Industries', quantityType: 'SH', putCall: null, quantity: '1200', reportedValueUsd: '700000', weightPercent: '70', rank: 1 },
      topHoldings: [], sectorAllocation: [{ name: 'Technology', reportedValueUsd: '1000000', weightPercent: '100' }],
    },
  }
  const analyticsByPeriod = new Map<string, typeof guruQuarterAnalytics.$inferSelect>()
  for (const [periodEnd, quarter, value, count, result, previousSnapshotId] of [
    ['2026-03-31', prior, '800000', 2, q1Result, null],
    ['2026-06-30', current, '1000000', 2, q2Result, prior.snapshot.id],
  ] as const) {
    const [analytics] = await database.db.insert(guruQuarterAnalytics).values({
      managerId: manager!.id, periodEnd, snapshotId: quarter.snapshot.id, previousSnapshotId,
      analyticsVersion: 'guru-portfolio-analytics-v1', inputHash: hash(`${periodEnd}:input`), contextHash: hash(`${periodEnd}:context`),
      status: 'READY', comparisonStatus: 'COMPARABLE', reportedValueUsd: value, holdingCount: count, sourceRowCount: count, mappedRowCount: count,
      mappingCoveragePercent: '100', topOneConcentrationPercent: '70', topFiveConcentrationPercent: periodEnd === '2026-03-31' ? '100' : '100',
      topTenConcentrationPercent: '100', hhi: '0.5800', disclosedWeightTurnoverPercent: '20', turnoverBand: 'MODERATE', turnoverUnavailableReason: null,
      newCount: periodEnd === '2026-06-30' ? 1 : 2, strongAddCount: 0, addCount: 0, unchangedCount: 0, reduceCount: 0, strongReduceCount: 0, exitCount: periodEnd === '2026-06-30' ? 1 : 0,
      result, calculatedAt: now,
    }).returning()
    analyticsByPeriod.set(periodEnd, analytics!)
  }
  const q1 = analyticsByPeriod.get('2026-03-31')!
  const q2 = analyticsByPeriod.get('2026-06-30')!
  await database.db.insert(guruHoldingChanges).values([
    { analyticsId: q1.id, positionKey: positionKey(technology!.id), securityId: technology!.id, ticker: 'SYN', company: '=Synthetic Industries', action: 'NEW', quantityType: 'SH', putCall: null, previousQuantity: null, comparablePreviousQuantity: null, currentQuantity: '700', quantityChange: '700', quantityChangePercent: null, quantityAdjustmentFactor: null, corporateActionEventIds: [], previousWeightPercent: null, currentWeightPercent: '62.5', weightChangePercentagePoints: null, previousRank: null, currentRank: 1, rankChange: null, previousReportedValueUsd: null, currentReportedValueUsd: '500000', reportedValueChangeUsd: null },
    { analyticsId: q1.id, positionKey: positionKey(exitedSecurity!.id), securityId: exitedSecurity!.id, ticker: 'OLD', company: 'Exited Energy Co', action: 'NEW', quantityType: 'SH', putCall: null, previousQuantity: null, comparablePreviousQuantity: null, currentQuantity: '300', quantityChange: '300', quantityChangePercent: null, quantityAdjustmentFactor: null, corporateActionEventIds: [], previousWeightPercent: null, currentWeightPercent: '37.5', weightChangePercentagePoints: null, previousRank: null, currentRank: 2, rankChange: null, previousReportedValueUsd: null, currentReportedValueUsd: '300000', reportedValueChangeUsd: null },
    { analyticsId: q2.id, positionKey: positionKey(technology!.id), securityId: technology!.id, ticker: 'SYN', company: '=Synthetic Industries', action: 'STRONG_ADD', quantityType: 'SH', putCall: null, previousQuantity: '700', comparablePreviousQuantity: '700', currentQuantity: '1200', quantityChange: '500', quantityChangePercent: '71.42857143', quantityAdjustmentFactor: '1', corporateActionEventIds: [], previousWeightPercent: '62.5', currentWeightPercent: '70', weightChangePercentagePoints: '7.5', previousRank: 1, currentRank: 1, rankChange: 0, previousReportedValueUsd: '500000', currentReportedValueUsd: '700000', reportedValueChangeUsd: '200000' },
    { analyticsId: q2.id, positionKey: positionKey(newSecurity!.id), securityId: newSecurity!.id, ticker: 'NEW', company: 'New Synthetic Systems', action: 'NEW', quantityType: 'SH', putCall: null, previousQuantity: null, comparablePreviousQuantity: null, currentQuantity: '1000', quantityChange: '1000', quantityChangePercent: null, quantityAdjustmentFactor: null, corporateActionEventIds: [], previousWeightPercent: null, currentWeightPercent: '30', weightChangePercentagePoints: null, previousRank: null, currentRank: 2, rankChange: null, previousReportedValueUsd: null, currentReportedValueUsd: '300000', reportedValueChangeUsd: null },
    { analyticsId: q2.id, positionKey: positionKey(exitedSecurity!.id), securityId: exitedSecurity!.id, ticker: 'OLD', company: 'Exited Energy Co', action: 'EXIT', quantityType: 'SH', putCall: null, previousQuantity: '300', comparablePreviousQuantity: '300', currentQuantity: null, quantityChange: '-300', quantityChangePercent: '-100', quantityAdjustmentFactor: '1', corporateActionEventIds: [], previousWeightPercent: '37.5', currentWeightPercent: null, weightChangePercentagePoints: '-37.5', previousRank: 2, currentRank: null, rankChange: null, previousReportedValueUsd: '300000', currentReportedValueUsd: null, reportedValueChangeUsd: '-300000' },
  ])

  const portfolioResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/portfolio?period=2026-06-30&sector=Technology&increasedOnly=true`)
  const portfolio = await portfolioResponse.json() as { data: { quarter: { status: string }; periods: Array<{ periodEnd: string }>; holdings: Array<{ ticker: string; quantity: string; action: string; sources: Array<{ accession: string }> }> } }
  expect(portfolioResponse.status).toBe(200)
  expect(portfolio.data).toMatchObject({
    quarter: { status: 'READY', reportedValueUsd: '1000000.00000000' },
    holdings: [{ ticker: 'SYN', quantity: '1200.00000000', action: 'STRONG_ADD' }],
  })
  expect(portfolio.data.periods.map(row => row.periodEnd)).toEqual(['2026-06-30', '2026-03-31'])
  expect(portfolio.data.holdings[0]?.sources.map(row => row.accession)).toEqual([prior.filing.accession, current.filing.accession])

  const changesResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/changes?period=2026-06-30`)
  const changes = await changesResponse.json() as { data: { newPositions: Array<{ ticker: string }>; increasedPositions: Array<{ ticker: string; quantityChangePercent: string; previousRank: number; rank: number }>; exitedPositions: Array<{ ticker: string; sources: Array<{ accession: string }> }> } }
  expect(changes.data.newPositions.map(row => row.ticker)).toEqual(['NEW'])
  expect(changes.data.increasedPositions[0]).toMatchObject({ ticker: 'SYN', quantityChangePercent: '71.42857143', previousRank: 1, rank: 1 })
  expect(changes.data.exitedPositions[0]?.sources.map(row => row.accession)).toContain(prior.filing.accession)

  const historyResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/history`)
  const history = await historyResponse.json() as { data: { periods: Array<{ periodEnd: string; topFiveConcentrationPercent: string; turnoverPercent: string; sectorAllocation: Array<{ name: string }> }> } }
  expect(history.data.periods.map(row => row.periodEnd)).toEqual(['2026-06-30', '2026-03-31'])
  expect(history.data.periods[0]).toMatchObject({ topFiveConcentrationPercent: '100.00000000', turnoverPercent: '20.00000000', sectorAllocation: [{ name: 'Technology' }] })

  const positionHistoryResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/position-history?positionKey=${encodeURIComponent(positionKey(technology!.id))}`)
  const positionHistory = await positionHistoryResponse.json() as { data: { history: Array<{ periodEnd: string; quantity: string; action: string; source: Array<{ accession: string }> }> } }
  expect(positionHistory.data.history).toEqual([
    expect.objectContaining({ periodEnd: '2026-06-30', quantity: '1200.00000000', action: 'STRONG_ADD' }),
    expect.objectContaining({ periodEnd: '2026-03-31', quantity: '700.00000000', action: 'NEW' }),
  ])
  expect(positionHistory.data.history[0]?.source.map(row => row.accession)).toContain(current.filing.accession)

  const filingsResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/filings`)
  const filings = await filingsResponse.json() as { data: { filings: Array<{ accession: string; documents: Array<{ sourceUrl: string }>; effectiveOperations: Array<{ operation: string }> }> } }
  expect(filings.data.filings[0]).toMatchObject({
    accession: current.filing.accession,
    documents: [{ sourceUrl: `${current.filing.sourceUrl}/information-table.xml` }],
    effectiveOperations: [{ operation: 'ORIGINAL' }],
  })

  const activityResponse = await fetch(`${baseUrl}/api/gurus/activity?guru=${guru!.slug}&symbol=SYN&sector=Technology&period=2026-06-30&action=STRONG_ADD&minWeight=50&minChangePercent=50`)
  const activity = await activityResponse.json() as { data: { items: Array<{ ticker: string; action: string; periodEnd: string }> } }
  expect(activity.data.items).toMatchObject([{ ticker: 'SYN', action: 'STRONG_ADD', periodEnd: '2026-06-30' }])

  const exportResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/portfolio.csv?period=2026-06-30`)
  const exported = await exportResponse.text()
  expect(exportResponse.headers.get('content-type')).toContain('text/csv')
  expect(exportResponse.headers.get('content-disposition')).toContain('portfolio.csv')
  expect(exported).toContain('"reported_period","accession","source_url"')
  expect(exported).toContain("'=Synthetic Industries")
  expect(exported).toContain(current.filing.accession)

  const changesExportResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/changes.csv?period=2026-06-30`)
  const changesExport = await changesExportResponse.text()
  expect(changesExport).toContain('"share_change_percent","previous_weight_percent","current_weight_percent"')
  expect(changesExport).toContain(current.filing.accession)

  const positionExportResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/position-history.csv?positionKey=${encodeURIComponent(positionKey(technology!.id))}`)
  const positionExport = await positionExportResponse.text()
  expect(positionExport).toContain('"period_end","ticker","company","action","shares"')
  expect(positionExport).toContain(current.filing.accession)

  await database.db.update(guruHoldingChanges).set({ ticker: '=SYN' }).where(and(eq(guruHoldingChanges.analyticsId, q2.id), eq(guruHoldingChanges.positionKey, positionKey(technology!.id))))
  const escapedTickerResponse = await fetch(`${baseUrl}/api/gurus/${guru!.slug}/portfolio.csv?period=2026-06-30`)
  expect(await escapedTickerResponse.text()).toContain('"\'=SYN"')

  const exitedRow = await database.db.select().from(guruHoldingChanges).where(and(eq(guruHoldingChanges.analyticsId, q2.id), eq(guruHoldingChanges.ticker, 'OLD')))
  expect(exitedRow).toHaveLength(1)
})
