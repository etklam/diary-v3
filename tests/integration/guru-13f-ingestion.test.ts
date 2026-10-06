import { readFile } from 'node:fs/promises'
import { and, asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  institutional13fHoldings,
  institutionalFilingArtifacts,
  institutionalFilingArtifactFetches,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagerDiscovery,
  institutionalManagers,
  gurus,
  secRequestSchedulerState,
} from '@diary/db'
import { buildSecUrls } from '../../apps/api/src/sec-edgar/client.js'
import { createPostgresSecSharedScheduler } from '../../apps/api/src/sec-edgar/postgres-scheduler.js'
import { createSecFixtureService } from '../../apps/api/src/sec-edgar/service.js'
import type { SecEdgarService } from '../../apps/api/src/sec-edgar/service.js'
import { discover13FFilings, processUnfinished13FFilings, refetchExpired13fArtifact } from '../../apps/api/src/institutional/ingestion.js'
import { runGuruFilingDiscoveryOnce } from '../../apps/api/src/institutional/discovery-worker.js'
import { provisionTestDatabase } from '../support/database.js'

const cik = '0000012345'
const accession = '0000012345-22-000001'
const infoXml = await readFile(new URL('../fixtures/guru-13f/historical-information-table.xml', import.meta.url), 'utf8')
const primaryXml = '<edgarSubmission><formData><coverPage><amendmentNo>1</amendmentNo><amendmentType>RESTATEMENT</amendmentType></coverPage></formData></edgarSubmission>'

function fixtureSec() {
  let submissionsFailures = 1
  let primaryTransportFailures = 1
  let documentRequests = 0
  let currentInfoXml = infoXml
  const submissions = {
    cik,
    name: 'Synthetic Institutional Manager',
    tickers: [],
    exchanges: [],
    filings: {
      recent: {
        accessionNumber: [accession],
        filingDate: ['2022-11-14'],
        reportDate: ['2022-09-30'],
        acceptanceDateTime: ['2022-11-14T17:00:00.000Z'],
        form: ['13F-HR/A'],
        primaryDocument: ['primary_doc.xml'],
        primaryDocDescription: ['13F-HR/A cover page'],
        fileNumber: ['028-00001'],
        filmNumber: ['synthetic-film'],
        items: [null],
        size: [1024],
      },
      files: [],
    },
  }
  const service = createSecFixtureService({
    async getJson<T>(url: string): Promise<T> {
      if (url === buildSecUrls.submissions(cik)) {
        if (submissionsFailures-- > 0) throw new Error('Synthetic SEC submissions transport failure')
        return submissions as T
      }
      if (url === buildSecUrls.filingIndexJson(cik, accession)) return { directory: { item: [
        { name: 'primary_doc.xml', size: primaryXml.length, type: 'XML' },
        { name: 'form13fInfoTable.xml', size: infoXml.length, type: 'XML' },
      ] } } as T
      throw new Error(`Unexpected synthetic SEC JSON URL: ${url}`)
    },
    async getText(url: string): Promise<string> {
      if (url !== buildSecUrls.filingIndexHtml(cik, accession)) throw new Error(`Unexpected synthetic SEC text URL: ${url}`)
      return '<table><tr><td>1</td><td>13F-HR/A cover page</td><td>primary_doc.xml</td><td>XML</td></tr><tr><td>2</td><td>13F information table</td><td>form13fInfoTable.xml</td><td>XML</td></tr></table>'
    },
    async getStream(url: string): Promise<Response> {
      documentRequests++
      if (url === buildSecUrls.document(cik, accession, 'primary_doc.xml')) {
        if (primaryTransportFailures-- > 0) return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('Synthetic SEC document transport failure')) } }))
        return new Response(primaryXml, { headers: { 'content-type': 'application/xml' } })
      }
      if (url === buildSecUrls.document(cik, accession, 'form13fInfoTable.xml')) return new Response(currentInfoXml, { headers: { 'content-type': 'application/xml' } })
      throw new Error(`Unexpected synthetic SEC document URL: ${url}`)
    },
  })
  return { service, documentRequests: () => documentRequests, setInfoXml: (value: string) => { currentInfoXml = value } }
}

describe('Guru 13F discovery and ingestion with disposable PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof provisionTestDatabase>>

  beforeAll(async () => { database = await provisionTestDatabase('guru_13f_ingestion') })
  afterAll(async () => { await database?.dispose() })

  it('recovers from SEC discovery and document failures without duplicating filings, artifacts, or parsed rows', async () => {
    const [manager] = await database.db.insert(institutionalManagers).values({ cik }).returning({ id: institutionalManagers.id })
    const managerId = manager!.id
    await database.db.insert(gurus).values({ managerId, slug: 'synthetic-13f-manager', name: 'Synthetic Manager', managerName: 'Synthetic Fund' })
    const { service: sec, documentRequests, setInfoXml } = fixtureSec()

    await expect(discover13FFilings({ db: database.db, sec, managerId, cik })).rejects.toThrow('Synthetic SEC submissions transport failure')
    expect(await discover13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ discovered: 1, stale: false })
    expect(await discover13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ discovered: 1, stale: false })
    const discovered = await database.db.select().from(institutionalFilings).where(eq(institutionalFilings.managerId, managerId))
    expect(discovered).toHaveLength(1)
    expect(discovered[0]).toMatchObject({ accession, form: '13F-HR/A', filingDate: '2022-11-14', periodEnd: '2022-09-30', isAmendment: true, status: 'PENDING' })

    const failed = await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })
    expect(failed).toEqual({ processed: 1, errors: 1 })
    const [afterFailure] = await database.db.select().from(institutionalFilings).where(eq(institutionalFilings.managerId, managerId))
    expect(afterFailure).toMatchObject({ status: 'ERROR', errorCode: 'SEC_13F_INGESTION_FAILED' })
    expect(await database.db.select().from(institutionalFilingArtifacts)).toHaveLength(0)

    const recovered = await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })
    expect(recovered).toEqual({ processed: 1, errors: 0 })
    const [ready] = await database.db.select().from(institutionalFilings).where(eq(institutionalFilings.managerId, managerId))
    expect(ready).toMatchObject({ status: 'PARTIAL', amendmentNumber: 1, amendmentType: 'RESTATEMENT', parserVersion: '13f-xml-v1', parsedRowCount: 2, rejectedRowCount: 1, mappingCoverage: '0.00' })

    expect(await database.db.select().from(institutionalFilingDocuments).where(eq(institutionalFilingDocuments.filingId, ready!.id))).toHaveLength(2)
    const artifacts = await database.db.select().from(institutionalFilingArtifacts)
    expect(artifacts).toHaveLength(2)
    expect(artifacts.every(artifact => artifact.rawContent !== null && /^[a-f0-9]{64}$/.test(artifact.contentSha256) && artifact.artifactRef.includes(artifact.contentSha256))).toBe(true)
    const rows = await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, ready!.id))
    expect(rows).toHaveLength(2)
    expect(rows.find(row => row.quantityType === 'PRN')).toMatchObject({ putCall: 'PUT', cusip: null, warnings: ['CUSIP_MISSING'] })

    const requestsBeforeRetry = documentRequests()
    await database.db.update(institutionalFilings).set({ status: 'ERROR', errorCode: 'SYNTHETIC_WORKER_RESTART' }).where(eq(institutionalFilings.id, ready!.id))
    expect(await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ processed: 1, errors: 0 })
    expect(documentRequests()).toBe(requestsBeforeRetry)
    expect(await database.db.select().from(institutionalFilingArtifacts)).toHaveLength(2)
    expect(await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, ready!.id))).toHaveLength(2)

    expect(await discover13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ discovered: 1, stale: false })
    expect(await database.db.select().from(institutionalFilings).where(and(eq(institutionalFilings.managerId, managerId), eq(institutionalFilings.accession, accession)))).toHaveLength(1)
    expect(await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ processed: 0, errors: 0 })
    expect(await database.db.select().from(institutionalFilingArtifacts)).toHaveLength(2)
    expect(await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, ready!.id))).toHaveLength(2)

    const workerNow = new Date('2026-10-06T08:00:00.000Z')
    const workerResult = await runGuruFilingDiscoveryOnce({ db: database.db, sec, now: () => workerNow, intervalMs: 60 * 60_000 })
    expect(workerResult).toMatchObject({ status: 'succeeded', managerId, discovered: 1, processed: 0 })
    const [discoveryState] = await database.db.select().from(institutionalManagerDiscovery).where(eq(institutionalManagerDiscovery.managerId, managerId))
    expect(discoveryState).toMatchObject({ status: 'READY', lastCheckAt: workerNow, lastSuccessAt: workerNow, nextCheckAt: new Date(workerNow.getTime() + 60 * 60_000), lastErrorCode: null })
    expect(await runGuruFilingDiscoveryOnce({ db: database.db, sec, now: () => workerNow, intervalMs: 60 * 60_000 })).toEqual({ status: 'idle' })

    const staleNow = new Date(workerNow.getTime() + 60 * 60_000)
    const staleSec = {
      async listFilings() {
        return {
          value: {
            company: { cik, name: 'Synthetic Institutional Manager', tickers: [], exchanges: [] },
            filings: [{ cik, accession, filingDate: '2022-11-14', reportDate: '2022-09-30', acceptanceDateTime: '2022-11-14T17:00:00.000Z', form: '13F-HR/A', isAmendment: true, primaryDocument: 'primary_doc.xml', primaryDocumentDescription: null, fileNumber: null, filmNumber: null, items: null, size: 1024 }],
            nextCursor: null,
          },
          stale: true,
          cacheStatus: 'stale' as const,
          fetchedAt: workerNow.toISOString(),
        }
      },
    } as unknown as SecEdgarService
    expect(await runGuruFilingDiscoveryOnce({ db: database.db, sec: staleSec, now: () => staleNow, intervalMs: 60 * 60_000 }))
      .toMatchObject({ status: 'stale', managerId, discovered: 1, processed: 0, errorCode: 'SEC_SOURCE_STALE' })
    const [staleState] = await database.db.select().from(institutionalManagerDiscovery).where(eq(institutionalManagerDiscovery.managerId, managerId))
    expect(staleState).toMatchObject({ status: 'STALE', lastSuccessAt: workerNow, lastErrorCode: 'SEC_SOURCE_STALE', nextCheckAt: new Date(staleNow.getTime() + 15 * 60_000) })

    const [infoDocument] = await database.db.select().from(institutionalFilingDocuments)
      .where(and(eq(institutionalFilingDocuments.filingId, ready!.id), eq(institutionalFilingDocuments.basename, 'form13fInfoTable.xml')))
    const [infoArtifact] = await database.db.select().from(institutionalFilingArtifacts).where(eq(institutionalFilingArtifacts.documentId, infoDocument!.id))
    await database.db.update(institutionalFilingArtifacts).set({ rawContent: null, retainUntil: new Date(workerNow.getTime() - 1_000) }).where(eq(institutionalFilingArtifacts.id, infoArtifact!.id))
    await database.db.update(institutionalFilings).set({ status: 'ERROR', errorCode: null }).where(eq(institutionalFilings.id, ready!.id))
    expect(await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ processed: 1, errors: 1 })
    const [expired] = await database.db.select().from(institutionalFilings).where(eq(institutionalFilings.id, ready!.id))
    expect(expired).toMatchObject({ status: 'ERROR', errorCode: 'SEC_RAW_ARTIFACT_EXPIRED' })
    expect(await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ processed: 0, errors: 0 })
    const requestsBeforeRefetch = documentRequests()
    await expect(refetchExpired13fArtifact({ db: database.db, sec, documentId: infoDocument!.id, cik, accession, operationKey: 'same-bytes-refetch-1', now: () => workerNow }))
      .resolves.toBe(infoArtifact!.id)
    await expect(refetchExpired13fArtifact({ db: database.db, sec, documentId: infoDocument!.id, cik, accession, operationKey: 'same-bytes-refetch-1', now: () => workerNow }))
      .resolves.toBe(infoArtifact!.id)
    expect(documentRequests()).toBe(requestsBeforeRefetch + 1)
    expect(await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ processed: 1, errors: 0 })
    expect(await database.db.select().from(institutionalFilingArtifacts)).toHaveLength(2)
    expect(await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, ready!.id))).toHaveLength(2)

    const [sameDigestArtifact] = await database.db.select().from(institutionalFilingArtifacts).where(eq(institutionalFilingArtifacts.id, infoArtifact!.id))
    expect(sameDigestArtifact).toMatchObject({ fetchedAt: infoArtifact!.fetchedAt, fetchedReason: 'initial', rawContent: infoXml, retainUntil: null })
    const sameDigestFetches = await database.db.select().from(institutionalFilingArtifactFetches)
      .where(eq(institutionalFilingArtifactFetches.documentId, infoDocument!.id))
    expect(sameDigestFetches).toMatchObject([{
      sourceArtifactId: infoArtifact!.id, artifactId: infoArtifact!.id, operationKey: 'same-bytes-refetch-1',
      contentSha256: infoArtifact!.contentSha256, fetchedReason: 'reprocess-refetch',
    }])

    const changedXml = `${infoXml}\n`
    setInfoXml(changedXml)
    const expiredAgain = new Date(workerNow.getTime() - 2_000)
    await database.db.update(institutionalFilingArtifacts).set({ rawContent: null, retainUntil: expiredAgain }).where(eq(institutionalFilingArtifacts.id, infoArtifact!.id))
    await database.db.update(institutionalFilings).set({ status: 'ERROR', errorCode: null }).where(eq(institutionalFilings.id, ready!.id))
    const requestsBeforeChangedBytes = documentRequests()
    const changedArtifactId = await refetchExpired13fArtifact({
      db: database.db, sec, documentId: infoDocument!.id, cik, accession,
      operationKey: 'changed-bytes-refetch-1', now: () => workerNow,
    })
    expect(changedArtifactId).not.toBe(infoArtifact!.id)
    expect(documentRequests()).toBe(requestsBeforeChangedBytes + 1)
    expect(await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ processed: 1, errors: 0 })

    const [changedArtifact] = await database.db.select().from(institutionalFilingArtifacts).where(eq(institutionalFilingArtifacts.id, changedArtifactId))
    expect(changedArtifact?.contentSha256).not.toBe(infoArtifact!.contentSha256)
    expect(changedArtifact).toMatchObject({ supersedesArtifactId: infoArtifact!.id })
    await database.db.update(institutionalFilingArtifacts).set({ rawContent: null, retainUntil: expiredAgain }).where(eq(institutionalFilingArtifacts.id, changedArtifactId))
    await database.db.update(institutionalFilings).set({ status: 'ERROR', errorCode: null }).where(eq(institutionalFilings.id, ready!.id))
    setInfoXml(infoXml)
    const requestsBeforeExistingDigest = documentRequests()
    await expect(refetchExpired13fArtifact({
      db: database.db, sec, documentId: infoDocument!.id, cik, accession,
      operationKey: 'existing-digest-refetch-1', now: () => workerNow,
    })).resolves.toBe(infoArtifact!.id)
    expect(documentRequests()).toBe(requestsBeforeExistingDigest + 1)
    expect(await processUnfinished13FFilings({ db: database.db, sec, managerId, cik })).toEqual({ processed: 1, errors: 0 })
    expect(await database.db.select().from(institutionalFilingArtifacts)).toHaveLength(3)
    expect(await database.db.select().from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, ready!.id))).toHaveLength(2)
    const fetchHistory = await database.db.select().from(institutionalFilingArtifactFetches)
      .where(eq(institutionalFilingArtifactFetches.documentId, infoDocument!.id))
      .orderBy(asc(institutionalFilingArtifactFetches.fetchedAt), asc(institutionalFilingArtifactFetches.id))
    expect(fetchHistory.map(fetch => [fetch.sourceArtifactId, fetch.artifactId, fetch.contentSha256])).toEqual([
      [infoArtifact!.id, infoArtifact!.id, infoArtifact!.contentSha256],
      [infoArtifact!.id, changedArtifactId, changedArtifact!.contentSha256],
      [changedArtifactId, infoArtifact!.id, infoArtifact!.contentSha256],
    ])
    expect(fetchHistory.every(fetch => fetch.sourceUrl.startsWith('https://www.sec.gov/'))).toBe(true)
    await expect(database.db.update(institutionalFilingArtifactFetches).set({ sourceUrl: 'https://issuer.example.test/mutated' }))
      .rejects.toMatchObject({ cause: { code: 'P0001' } })
  })

  it('paces request starts across separate scheduler clients and persists request failure metrics', async () => {
    const firstScheduler = createPostgresSecSharedScheduler(database.db, 100)
    const secondScheduler = createPostgresSecSharedScheduler(database.db, 100)
    const startedAt: number[] = []
    await Promise.all(Array.from({ length: 4 }, async (_, index) => {
      const scheduler = index % 2 === 0 ? firstScheduler : secondScheduler
      const { response } = await scheduler.start(async () => { startedAt.push(Date.now()); return index })
      await response
    }))
    const ordered = startedAt.sort((a, b) => a - b)
    expect(ordered).toHaveLength(4)
    expect(ordered.slice(1).every((time, index) => time - ordered[index]! >= 80)).toBe(true)
    await firstScheduler.recordResult(false)
    const [metrics] = await database.db.select().from(secRequestSchedulerState)
    expect(metrics).toMatchObject({ singleton: 1, requestCount: 4n, failureCount: 1n })
  })
})
