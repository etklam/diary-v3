import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import {
  institutional13fHoldings,
  institutionalFilingArtifacts,
  institutionalFilingArtifactFetches,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalManagers,
  type Database,
} from '@diary/db'
import type { SecFilingSummary } from '@diary/contracts/sec-filings'
import type { SecEdgarService } from '../sec-edgar/service.js'
import { buildSecUrls } from '../sec-edgar/client.js'
import { SecProviderError } from '../sec-edgar/errors.js'
import { canonicalizeCik } from '../sec-edgar/validation.js'
import {
  INSTITUTIONAL_13F_PARSER_VERSION,
  parse13fAmendmentMetadata,
  parse13fInformationTable,
} from './13f-parser.js'
import { resolveFilingHoldings } from './security-mapping.js'
import { enqueueEffectivePortfolioForFiling } from './effective-snapshots.js'

const MAX_13F_XML_BYTES = 32 * 1024 * 1024

function providerErrorCode(error: unknown): string {
  if (error instanceof SecProviderError) return error.code
  return error && typeof error === 'object' && 'code' in error && error.code === 'SEC_RAW_ARTIFACT_EXPIRED'
    ? 'SEC_RAW_ARTIFACT_EXPIRED'
    : 'SEC_13F_INGESTION_FAILED'
}

async function responseBytes(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'SEC XML response body is empty', 502)
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_13F_XML_BYTES) {
        void reader.cancel().catch(() => undefined)
        throw new SecProviderError('SEC_FILE_TOO_LARGE', 'SEC 13F XML exceeds the ingestion limit', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}

function toXml(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'SEC 13F XML is not valid UTF-8', 502) }
}

function filingSourceMetadata(filing: SecFilingSummary): Record<string, unknown> {
  return {
    accession: filing.accession,
    cik: filing.cik,
    filedAt: filing.acceptanceDateTime,
    filingDate: filing.filingDate,
    form: filing.form,
    isAmendment: filing.isAmendment,
    primaryDocument: filing.primaryDocument,
    primaryDocumentDescription: filing.primaryDocumentDescription,
    reportDate: filing.reportDate,
    size: filing.size,
  }
}

async function saveFilingMetadata(db: Database, managerId: bigint, filing: SecFilingSummary, now: Date): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filing.filingDate) || (filing.reportDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(filing.reportDate))) return
  const form = filing.form.toUpperCase()
  if (form !== '13F-HR' && form !== '13F-HR/A') return
  const filedAt = filing.acceptanceDateTime ? new Date(filing.acceptanceDateTime.replace(' ', 'T') + (filing.acceptanceDateTime.includes('Z') ? '' : 'Z')) : null
  const identity = {
    form, filingDate: filing.filingDate,
    filedAt: filedAt && !Number.isNaN(filedAt.getTime()) ? filedAt : null,
    periodEnd: filing.reportDate, isAmendment: form === '13F-HR/A',
  }
  await db.transaction(async tx => {
    const [created] = await tx.insert(institutionalFilings).values({
      managerId, accession: filing.accession, ...identity,
      sourceUrl: buildSecUrls.filingIndexHtml(filing.cik, filing.accession),
      rawMetadata: filingSourceMetadata(filing), discoveredAt: now, updatedAt: now,
    }).onConflictDoNothing({ target: [institutionalFilings.managerId, institutionalFilings.accession] }).returning({ id: institutionalFilings.id })
    if (created) {
      await enqueueEffectivePortfolioForFiling(tx, created.id, now)
      return
    }
    const [existing] = await tx.select().from(institutionalFilings).where(and(
      eq(institutionalFilings.managerId, managerId), eq(institutionalFilings.accession, filing.accession),
    )).limit(1).for('update')
    if (!existing) throw new Error('SEC_13F_FILING_METADATA_SAVE_FAILED')
    const changed = existing.form !== identity.form || existing.filingDate !== identity.filingDate
      || existing.filedAt?.getTime() !== identity.filedAt?.getTime()
      || existing.periodEnd !== identity.periodEnd || existing.isAmendment !== identity.isAmendment
    if (changed && existing.periodEnd !== identity.periodEnd) await enqueueEffectivePortfolioForFiling(tx, existing.id, now)
    await tx.update(institutionalFilings).set({ ...identity, rawMetadata: filingSourceMetadata(filing), updatedAt: now })
      .where(eq(institutionalFilings.id, existing.id))
    if (changed) await enqueueEffectivePortfolioForFiling(tx, existing.id, now)
  })
}

export async function discover13FFilings(input: {
  db: Database
  sec: SecEdgarService
  managerId: bigint
  cik: string
  now?: () => Date
  signal?: AbortSignal
}): Promise<{ discovered: number; stale: boolean }> {
  const now = input.now ?? (() => new Date())
  const discovered = new Map<string, SecFilingSummary>()
  let stale = false
  let cursor: string | undefined
  do {
    const page = await input.sec.listFilings(input.cik, { forms: ['13F-HR'], limit: 100, ...(cursor ? { cursor } : {}) }, input.signal)
    stale ||= page.stale
    for (const filing of page.value.filings) discovered.set(filing.accession, filing)
    cursor = page.value.nextCursor ?? undefined
  } while (cursor)

  for (const filing of discovered.values()) await saveFilingMetadata(input.db, input.managerId, filing, now())
  return { discovered: discovered.size, stale }
}

async function recordDocumentMetadata(db: Database, filingId: bigint, cik: string, accession: string, document: {
  basename: string
  description: string | null
  type: string | null
  size: number
  isPrimary: boolean
}): Promise<bigint> {
  const sourceUrl = buildSecUrls.document(cik, accession, document.basename)
  const [row] = await db.insert(institutionalFilingDocuments).values({
    filingId,
    basename: document.basename,
    documentType: document.type,
    description: document.description,
    isPrimary: document.isPrimary,
    sourceUrl,
    contentLength: BigInt(document.size),
  }).onConflictDoUpdate({
    target: [institutionalFilingDocuments.filingId, institutionalFilingDocuments.basename],
    set: { documentType: document.type, description: document.description, isPrimary: document.isPrimary, sourceUrl, contentLength: BigInt(document.size) },
  }).returning({ id: institutionalFilingDocuments.id })
  if (!row) throw new Error('SEC_13F_DOCUMENT_SAVE_FAILED')
  return row.id
}

async function rawArtifact(db: Database, input: {
  sec: SecEdgarService
  cik: string
  accession: string
  documentId: bigint
  basename: string
  now: Date
  signal?: AbortSignal
}): Promise<{ artifactId: bigint; xml: string; sourceUrl: string }> {
  const [latestFetch] = await db.select({ artifact: institutionalFilingArtifacts })
    .from(institutionalFilingArtifactFetches)
    .innerJoin(institutionalFilingArtifacts, eq(institutionalFilingArtifacts.id, institutionalFilingArtifactFetches.artifactId))
    .where(eq(institutionalFilingArtifactFetches.documentId, input.documentId))
    .orderBy(desc(institutionalFilingArtifactFetches.fetchedAt), desc(institutionalFilingArtifactFetches.id))
    .limit(1)
  const priorArtifacts = await db.select().from(institutionalFilingArtifacts)
    .where(eq(institutionalFilingArtifacts.documentId, input.documentId))
    .orderBy(desc(institutionalFilingArtifacts.fetchedAt))
    .limit(1)
  const prior = latestFetch?.artifact ?? priorArtifacts[0]
  if (prior?.rawContent !== null && prior?.rawContent !== undefined) return { artifactId: prior.id, xml: prior.rawContent, sourceUrl: buildSecUrls.document(input.cik, input.accession, input.basename) }
  if (prior) throw Object.assign(new Error('SEC raw filing artifact expired; explicit refetch is required before reprocessing'), { code: 'SEC_RAW_ARTIFACT_EXPIRED' })

  const opened = await input.sec.openDocument(input.cik, input.accession, input.basename, input.signal)
  const bytes = await responseBytes(opened.response)
  const xml = toXml(bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const sourceUrl = opened.url
  const artifactRef = `sec-edgar://13f/${input.accession}/${encodeURIComponent(input.basename)}/${digest}`
  const [inserted] = await db.insert(institutionalFilingArtifacts).values({
    documentId: input.documentId,
    artifactRef,
    contentSha256: digest,
    rawContent: xml,
    contentLength: BigInt(bytes.byteLength),
    fetchedAt: input.now,
    fetchedReason: 'initial',
  }).onConflictDoNothing().returning({ id: institutionalFilingArtifacts.id })
  const [artifact] = inserted
    ? [{ id: inserted.id }]
    : await db.select({ id: institutionalFilingArtifacts.id, rawContent: institutionalFilingArtifacts.rawContent })
      .from(institutionalFilingArtifacts)
      .where(and(eq(institutionalFilingArtifacts.documentId, input.documentId), eq(institutionalFilingArtifacts.contentSha256, digest)))
      .limit(1)
  if (!artifact?.id) throw new Error('SEC_13F_ARTIFACT_SAVE_FAILED')
  const [sameArtifact] = await db.select({ rawContent: institutionalFilingArtifacts.rawContent }).from(institutionalFilingArtifacts).where(eq(institutionalFilingArtifacts.id, artifact.id)).limit(1)
  if (sameArtifact?.rawContent === null) throw new Error('SEC_13F_ARTIFACT_CONTENT_MISSING')
  await db.update(institutionalFilingDocuments).set({ contentLength: BigInt(bytes.byteLength), downloadedAt: input.now }).where(eq(institutionalFilingDocuments.id, input.documentId))
  return { artifactId: artifact.id, xml, sourceUrl }
}

export async function refetchExpired13fArtifact(input: {
  db: Database
  sec: SecEdgarService
  documentId: bigint
  cik: string
  accession: string
  operationKey: string
  now?: () => Date
  signal?: AbortSignal
}): Promise<bigint> {
  const now = (input.now ?? (() => new Date()))()
  const operationKey = input.operationKey.trim()
  if (!operationKey || operationKey.length > 128) throw new Error('SEC_RAW_ARTIFACT_REFETCH_KEY_INVALID')
  const [document] = await input.db.select({ basename: institutionalFilingDocuments.basename, filingId: institutionalFilings.id, accession: institutionalFilings.accession, cik: institutionalManagers.cik })
    .from(institutionalFilingDocuments)
    .innerJoin(institutionalFilings, eq(institutionalFilings.id, institutionalFilingDocuments.filingId))
    .innerJoin(institutionalManagers, eq(institutionalManagers.id, institutionalFilings.managerId))
    .where(eq(institutionalFilingDocuments.id, input.documentId))
    .limit(1)
  if (!document || document.accession !== input.accession || document.cik !== canonicalizeCik(input.cik)) throw new Error('SEC_RAW_ARTIFACT_SOURCE_MISMATCH')

  const [priorOperation] = await input.db.select().from(institutionalFilingArtifactFetches)
    .where(eq(institutionalFilingArtifactFetches.operationKey, operationKey)).limit(1)
  if (priorOperation) {
    if (priorOperation.documentId !== input.documentId) throw new Error('SEC_RAW_ARTIFACT_REFETCH_KEY_CONFLICT')
    return priorOperation.artifactId
  }

  const [latestFetch] = await input.db.select({ artifact: institutionalFilingArtifacts })
    .from(institutionalFilingArtifactFetches)
    .innerJoin(institutionalFilingArtifacts, eq(institutionalFilingArtifacts.id, institutionalFilingArtifactFetches.artifactId))
    .where(eq(institutionalFilingArtifactFetches.documentId, input.documentId))
    .orderBy(desc(institutionalFilingArtifactFetches.fetchedAt), desc(institutionalFilingArtifactFetches.id))
    .limit(1)
  const [latestArtifact] = latestFetch
    ? [latestFetch.artifact]
    : await input.db.select().from(institutionalFilingArtifacts)
      .where(eq(institutionalFilingArtifacts.documentId, input.documentId))
      .orderBy(desc(institutionalFilingArtifacts.fetchedAt), desc(institutionalFilingArtifacts.id))
      .limit(1)
  const expired = latestArtifact
  if (expired?.rawContent !== null || !expired?.retainUntil || expired.retainUntil > now) throw new Error('SEC_RAW_ARTIFACT_NOT_EXPIRED')

  const opened = await input.sec.openDocument(input.cik, input.accession, document.basename, input.signal)
  const bytes = await responseBytes(opened.response)
  const xml = toXml(bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  return input.db.transaction(async tx => {
    await tx.select({ id: institutionalFilingDocuments.id }).from(institutionalFilingDocuments)
      .where(eq(institutionalFilingDocuments.id, input.documentId)).limit(1).for('update')
    const [replayedOperation] = await tx.select().from(institutionalFilingArtifactFetches)
      .where(eq(institutionalFilingArtifactFetches.operationKey, operationKey)).limit(1)
    if (replayedOperation) {
      if (replayedOperation.documentId !== input.documentId) throw new Error('SEC_RAW_ARTIFACT_REFETCH_KEY_CONFLICT')
      return replayedOperation.artifactId
    }

    const [currentFetch] = await tx.select({ artifact: institutionalFilingArtifacts })
      .from(institutionalFilingArtifactFetches)
      .innerJoin(institutionalFilingArtifacts, eq(institutionalFilingArtifacts.id, institutionalFilingArtifactFetches.artifactId))
      .where(eq(institutionalFilingArtifactFetches.documentId, input.documentId))
      .orderBy(desc(institutionalFilingArtifactFetches.fetchedAt), desc(institutionalFilingArtifactFetches.id))
      .limit(1)
    const [currentArtifact] = currentFetch
      ? [currentFetch.artifact]
      : await tx.select().from(institutionalFilingArtifacts)
        .where(eq(institutionalFilingArtifacts.documentId, input.documentId))
        .orderBy(desc(institutionalFilingArtifacts.fetchedAt), desc(institutionalFilingArtifacts.id))
        .limit(1)
    if (!currentArtifact || currentArtifact.id !== expired.id) throw new Error('SEC_RAW_ARTIFACT_REFETCH_SOURCE_CHANGED')

    const [existingDigest] = await tx.select().from(institutionalFilingArtifacts).where(and(
      eq(institutionalFilingArtifacts.documentId, input.documentId),
      eq(institutionalFilingArtifacts.contentSha256, digest),
    )).limit(1)
    let artifactId: bigint
    if (existingDigest) {
      artifactId = existingDigest.id
      if (existingDigest.rawContent === null) {
        await tx.update(institutionalFilingArtifacts).set({ rawContent: xml, retainUntil: null })
          .where(eq(institutionalFilingArtifacts.id, existingDigest.id))
      }
    } else {
      const artifactRef = `sec-edgar://13f/${input.accession}/${encodeURIComponent(document.basename)}/${digest}`
      const [inserted] = await tx.insert(institutionalFilingArtifacts).values({
        documentId: input.documentId,
        artifactRef,
        contentSha256: digest,
        rawContent: xml,
        contentLength: BigInt(bytes.byteLength),
        fetchedAt: now,
        fetchedReason: 'reprocess-refetch',
        supersedesArtifactId: expired.id,
      }).returning({ id: institutionalFilingArtifacts.id })
      if (!inserted) throw new Error('SEC_RAW_ARTIFACT_REFETCH_SAVE_FAILED')
      artifactId = inserted.id
    }

    await tx.insert(institutionalFilingArtifactFetches).values({
      documentId: input.documentId,
      sourceArtifactId: expired.id,
      artifactId,
      operationKey,
      contentSha256: digest,
      sourceUrl: opened.url,
      contentLength: BigInt(bytes.byteLength),
      fetchedAt: now,
      fetchedReason: 'reprocess-refetch',
    })
    await tx.update(institutionalFilingDocuments).set({ contentLength: BigInt(bytes.byteLength), downloadedAt: now })
      .where(eq(institutionalFilingDocuments.id, input.documentId))
    await tx.update(institutionalFilings).set({ status: 'DOWNLOADED', errorCode: null, updatedAt: now })
      .where(and(eq(institutionalFilings.id, document.filingId), eq(institutionalFilings.accession, input.accession)))
    return artifactId
  })
}

export async function ingest13FFiling(input: {
  db: Database
  sec: SecEdgarService
  filingId: bigint
  cik: string
  accession: string
  now?: () => Date
  signal?: AbortSignal
}): Promise<'READY' | 'PARTIAL' | 'ERROR'> {
  const now = input.now ?? (() => new Date())
  const [filing] = await input.db.select().from(institutionalFilings).where(eq(institutionalFilings.id, input.filingId)).limit(1)
  if (!filing) throw new Error('SEC_13F_FILING_NOT_FOUND')

  try {
    const detail = await input.sec.getFilingDetail(input.cik, input.accession, input.signal)
    const documentRows = new Map<string, bigint>()
    for (const document of detail.value.documents) {
      const id = await recordDocumentMetadata(input.db, input.filingId, input.cik, input.accession, document)
      documentRows.set(document.basename, id)
    }
    const candidates = detail.value.documents.filter(document => /\.xml$/i.test(document.basename))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Number(/info.?table|13f/i.test(b.basename)) - Number(/info.?table|13f/i.test(a.basename)))
    if (candidates.length === 0) throw new SecProviderError('SEC_DOCUMENT_NOT_FOUND', 'SEC 13F filing has no XML source document', 404)

    let table: { parsed: ReturnType<typeof parse13fInformationTable>; artifactId: bigint; documentId: bigint; sourceUrl: string } | undefined
    let amendment: ReturnType<typeof parse13fAmendmentMetadata> = { amendmentNumber: null, amendmentType: null }
    let downloadedAny = false
    for (const document of candidates) {
      const documentId = documentRows.get(document.basename)
      if (!documentId) continue
      const source = await rawArtifact(input.db, {
        sec: input.sec,
        cik: input.cik,
        accession: input.accession,
        documentId,
        basename: document.basename,
        now: now(),
        signal: input.signal,
      })
      downloadedAny = true
      await input.db.update(institutionalFilingDocuments).set({ downloadedAt: now() }).where(eq(institutionalFilingDocuments.id, documentId))
      const parsed = parse13fInformationTable(source.xml, { filedDate: filing.filingDate })
      if (document.isPrimary) amendment = parse13fAmendmentMetadata(source.xml)
      if (parsed.isInformationTable) {
        table = { parsed, artifactId: source.artifactId, documentId, sourceUrl: source.sourceUrl }
        break
      }
    }
    if (downloadedAny) await input.db.update(institutionalFilings).set({ status: 'DOWNLOADED', errorCode: null, updatedAt: now() }).where(eq(institutionalFilings.id, input.filingId))
    if (!table) {
      await input.db.transaction(async tx => {
        await tx.update(institutionalFilings).set({
          status: 'PARTIAL', amendmentNumber: amendment.amendmentNumber, amendmentType: amendment.amendmentType,
          parserVersion: INSTITUTIONAL_13F_PARSER_VERSION, errorCode: 'SEC_13F_INFORMATION_TABLE_MISSING', updatedAt: now(),
        }).where(eq(institutionalFilings.id, input.filingId))
        await enqueueEffectivePortfolioForFiling(tx, input.filingId, now())
      })
      return 'PARTIAL'
    }

    const parsed = table.parsed
    const ingestedAt = now()
    const rowWarnings = parsed.holdings.some(holding => holding.warnings.length > 0)
    const status = parsed.rejectedRows > 0 || rowWarnings ? 'PARTIAL' : 'READY'
    await input.db.transaction(async tx => {
      await tx.delete(institutional13fHoldings).where(eq(institutional13fHoldings.documentId, table!.documentId))
      if (parsed.holdings.length) await tx.insert(institutional13fHoldings).values(parsed.holdings.map(holding => ({
        filingId: input.filingId,
        documentId: table!.documentId,
        artifactId: table!.artifactId,
        rowNumber: holding.rowNumber,
        issuer: holding.issuer,
        titleOfClass: holding.titleOfClass,
        cusip: holding.cusip,
        figi: holding.figi,
        reportedValue: holding.reportedValue,
        reportedValueUnit: holding.reportedValueUnit,
        valueUnitSource: holding.valueUnitSource,
        quantity: holding.quantity,
        quantityType: holding.quantityType,
        putCall: holding.putCall,
        investmentDiscretion: holding.investmentDiscretion,
        otherManagers: holding.otherManagers,
        votingAuthority: holding.votingAuthority,
        sourceUrl: table!.sourceUrl,
        rawRow: holding.rawRow,
        warnings: holding.warnings,
        parserVersion: INSTITUTIONAL_13F_PARSER_VERSION,
        ingestedAt,
      })))
      await tx.update(institutionalFilings).set({
        status: 'PARSED', parserVersion: INSTITUTIONAL_13F_PARSER_VERSION, parsedRowCount: parsed.holdings.length,
        rejectedRowCount: parsed.rejectedRows, amendmentNumber: amendment.amendmentNumber, amendmentType: amendment.amendmentType,
        ingestedAt, errorCode: null, updatedAt: ingestedAt,
      }).where(eq(institutionalFilings.id, input.filingId))
    })
    await input.db.update(institutionalFilings).set({ status, errorCode: null, updatedAt: now() }).where(eq(institutionalFilings.id, input.filingId))
    await resolveFilingHoldings(input.db, input.filingId, ingestedAt)
    return status
  } catch (error) {
    await input.db.transaction(async tx => {
      await tx.update(institutionalFilings).set({
        status: 'ERROR',
        parserVersion: INSTITUTIONAL_13F_PARSER_VERSION,
        errorCode: providerErrorCode(error),
        updatedAt: now(),
      }).where(eq(institutionalFilings.id, input.filingId))
      await enqueueEffectivePortfolioForFiling(tx, input.filingId, now())
    })
    return 'ERROR'
  }
}

export async function processUnfinished13FFilings(input: {
  db: Database
  sec: SecEdgarService
  managerId: bigint
  cik: string
  now?: () => Date
  signal?: AbortSignal
  limit?: number
}): Promise<{ processed: number; errors: number }> {
  const pending = await input.db.select({ id: institutionalFilings.id, accession: institutionalFilings.accession })
    .from(institutionalFilings)
    .where(and(
      eq(institutionalFilings.managerId, input.managerId),
      inArray(institutionalFilings.status, ['PENDING', 'DOWNLOADED', 'PARSED', 'ERROR']),
      or(isNull(institutionalFilings.errorCode), ne(institutionalFilings.errorCode, 'SEC_RAW_ARTIFACT_EXPIRED')),
    ))
    .orderBy(asc(institutionalFilings.filingDate), asc(institutionalFilings.accession))
    .limit(input.limit ?? 20)
  let errors = 0
  let processed = 0
  const { db, sec, cik, now, signal } = input
  for (const filing of pending) {
    if (signal?.aborted) break
    processed++
    if (await ingest13FFiling({ db, sec, cik, now, signal, filingId: filing.id, accession: filing.accession }) === 'ERROR') errors++
  }
  return { processed, errors }
}
