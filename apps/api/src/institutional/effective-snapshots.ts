import { createHash } from 'node:crypto'
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import {
  institutional13fHoldings,
  institutionalEffectiveHoldings,
  institutionalEffectivePeriodStates,
  institutionalEffectiveSnapshotPublications,
  institutionalEffectiveSnapshotSources,
  institutionalEffectiveSnapshots,
  institutionalEffectiveSnapshotRebuildRequests,
  institutionalFilingArtifacts,
  institutionalFilingArtifactFetches,
  institutionalFilingDocuments,
  institutionalFilings,
  institutionalHoldingSecurityMappings,
  institutionalSnapshotChangeEvents,
  type Database,
  type DatabaseTx,
} from '@diary/db'
import { calendarDateSchema } from '@diary/contracts'

export const EFFECTIVE_SNAPSHOT_RESOLVER_VERSION = '13f-amendments-v1'
export type AmendmentOperation = 'ORIGINAL' | 'RESTATEMENT' | 'ADD_NEW_HOLDINGS'
export interface AmendmentSource<T> {
  accession: string
  form: string
  isAmendment: boolean
  amendmentNumber: number | null
  amendmentType: string | null
  status: string
  filedAt: string | null
  holdings: T[]
}

/** SEC cover-page values map exactly to the two supported amendment operations. */
function amendmentOperation(value: string | null): AmendmentOperation | undefined {
  if (value === 'RESTATEMENT') return 'RESTATEMENT'
  if (value === 'NEW HOLDINGS' || value === 'ADD_NEW_HOLDINGS') return 'ADD_NEW_HOLDINGS'
  return undefined
}

export function resolveEffectivePortfolio<T>(sources: readonly AmendmentSource<T>[]) {
  const incomplete = (reason: string) => ({ status: sources.some(source => source.status === 'ERROR') ? 'ERROR' as const : 'PARTIAL' as const, reason })
  if (sources.length === 0) return incomplete('ORIGINAL_MISSING')
  if (sources.some(source => source.status !== 'READY')) return incomplete('FILING_NOT_READY')
  if (sources.some(source => (source.form === '13F-HR/A') !== source.isAmendment || !['13F-HR', '13F-HR/A'].includes(source.form))) return incomplete('FILING_FORM_MISMATCH')
  const originals = sources.filter(source => !source.isAmendment)
  if (originals.length !== 1) return incomplete(originals.length ? 'ORIGINAL_AMBIGUOUS' : 'ORIGINAL_MISSING')
  const original = originals[0]!
  if (original.amendmentNumber !== null || original.amendmentType !== null) return incomplete('ORIGINAL_AMENDMENT_METADATA')
  const amendments = sources.filter(source => source.isAmendment)
  if (amendments.some(source => !Number.isSafeInteger(source.amendmentNumber) || source.amendmentNumber! < 1 || source.amendmentNumber! > 2147483647 || !amendmentOperation(source.amendmentType))) return incomplete('AMENDMENT_METADATA_INVALID')
  if (new Set(amendments.map(source => source.amendmentNumber)).size !== amendments.length) return incomplete('AMENDMENT_NUMBER_DUPLICATE')
  amendments.sort((left, right) => left.amendmentNumber! - right.amendmentNumber!
    || (left.filedAt ?? '').localeCompare(right.filedAt ?? '') || left.accession.localeCompare(right.accession))
  if (amendments.some((source, index) => source.amendmentNumber !== index + 1)) return incomplete('AMENDMENT_SEQUENCE_INCOMPLETE')
  let holdings = [...original.holdings]
  const lineage = [{ source: original, operation: 'ORIGINAL' as AmendmentOperation }]
  for (const source of amendments) {
    const operation = amendmentOperation(source.amendmentType)!
    holdings = operation === 'RESTATEMENT' ? [...source.holdings] : [...holdings, ...source.holdings]
    lineage.push({ source, operation })
  }
  return { status: 'READY' as const, reason: null, holdings, lineage }
}

/** Sort JSON object keys and serialize exact numeric strings without number coercion. */
function stableJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
function digest(value: unknown): string { return createHash('sha256').update(stableJson(value)).digest('hex') }

type EffectiveHoldingInput = Omit<typeof institutionalEffectiveHoldings.$inferInsert, 'id' | 'snapshotId' | 'ordinal'>
type FilingSource = AmendmentSource<EffectiveHoldingInput> & {
  filingId: bigint
  parserVersion: string | null
  parsedRowCount: number | null
  rejectedRowCount: number
  manifest: Record<string, unknown>
}

async function sourceManifest(tx: DatabaseTx, managerId: bigint, periodEnd: string) {
  const filings = await tx.select().from(institutionalFilings)
    .where(and(eq(institutionalFilings.managerId, managerId), eq(institutionalFilings.periodEnd, periodEnd)))
    .orderBy(asc(institutionalFilings.accession))
  const ids = filings.map(filing => filing.id)
  const documents = ids.length ? await tx.select().from(institutionalFilingDocuments)
    .where(inArray(institutionalFilingDocuments.filingId, ids)).orderBy(asc(institutionalFilingDocuments.basename), asc(institutionalFilingDocuments.id)) : []
  const documentIds = documents.map(document => document.id)
  const artifacts = documentIds.length ? await tx.select().from(institutionalFilingArtifacts)
    .where(inArray(institutionalFilingArtifacts.documentId, documentIds))
    .orderBy(desc(institutionalFilingArtifacts.fetchedAt), desc(institutionalFilingArtifacts.id)) : []
  const fetches = documentIds.length ? await tx.select().from(institutionalFilingArtifactFetches)
    .where(inArray(institutionalFilingArtifactFetches.documentId, documentIds))
    .orderBy(desc(institutionalFilingArtifactFetches.fetchedAt), desc(institutionalFilingArtifactFetches.id)) : []
  const rows = ids.length ? await tx.select({ holding: institutional13fHoldings, mapping: institutionalHoldingSecurityMappings })
    .from(institutional13fHoldings).leftJoin(institutionalHoldingSecurityMappings, eq(institutionalHoldingSecurityMappings.holdingId, institutional13fHoldings.id))
    .where(inArray(institutional13fHoldings.filingId, ids)).orderBy(asc(institutional13fHoldings.documentId), asc(institutional13fHoldings.rowNumber)) : []
  const byArtifact = new Map(artifacts.map(artifact => [artifact.id, artifact]))
  const byDocument = new Map(documents.map(document => [document.id, document]))
  const sources: FilingSource[] = filings.map(filing => {
    const filingRows = rows.filter(row => row.holding.filingId === filing.id)
      .sort((left, right) => byDocument.get(left.holding.documentId)!.basename.localeCompare(byDocument.get(right.holding.documentId)!.basename)
        || left.holding.rowNumber - right.holding.rowNumber)
    const holdings: EffectiveHoldingInput[] = filingRows.map(({ holding, mapping }) => {
      const artifact = byArtifact.get(holding.artifactId)!
      const basename = byDocument.get(holding.documentId)!.basename
      const sourceRowKey = digest({ accession: filing.accession, basename, rowNumber: holding.rowNumber, artifactDigest: artifact.contentSha256, parserVersion: holding.parserVersion })
      return {
        sourceFilingId: filing.id, sourceDocumentId: holding.documentId, sourceArtifactId: holding.artifactId,
        sourceRowKey, sourceRowNumber: holding.rowNumber,
        securityId: mapping?.securityId ?? null, mappingStatus: mapping?.status ?? 'UNRESOLVED', mappingVersion: mapping?.algorithmVersion ?? 'mapping-missing',
        issuer: holding.issuer, titleOfClass: holding.titleOfClass, cusip: holding.cusip, figi: holding.figi,
        reportedValue: holding.reportedValue, reportedValueUnit: holding.reportedValueUnit,
        quantity: holding.quantity, quantityType: holding.quantityType, putCall: holding.putCall,
        sourceData: {
          accession: filing.accession, basename, artifactDigest: artifact.contentSha256, artifactRef: artifact.artifactRef,
          parserVersion: holding.parserVersion, valueUnitSource: holding.valueUnitSource,
          investmentDiscretion: holding.investmentDiscretion, otherManagers: holding.otherManagers,
          votingAuthority: holding.votingAuthority, rawRow: holding.rawRow, warnings: holding.warnings, sourceUrl: holding.sourceUrl,
          mappingReason: mapping?.reason ?? 'MAPPING_NOT_RUN', candidateSecurityIds: mapping?.candidateSecurityIds ?? [],
        },
      }
    })
    const manifest: Record<string, unknown> = {
      accession: filing.accession, form: filing.form, isAmendment: filing.isAmendment,
      amendmentNumber: filing.amendmentNumber, amendmentType: filing.amendmentType,
      status: filing.status, parserVersion: filing.parserVersion, parsedRowCount: filing.parsedRowCount,
      rejectedRowCount: filing.rejectedRowCount, errorCode: filing.errorCode,
      filedAt: filing.filedAt?.toISOString() ?? null, filingDate: filing.filingDate, sourceUrl: filing.sourceUrl,
      documents: documents.filter(document => document.filingId === filing.id).map(document => {
        const latestFetch = fetches.find(fetch => fetch.documentId === document.id)
        const artifact = latestFetch ? byArtifact.get(latestFetch.artifactId) : artifacts.find(candidate => candidate.documentId === document.id)
        return { basename: document.basename, isPrimary: document.isPrimary, sourceUrl: document.sourceUrl, artifactDigest: artifact?.contentSha256 ?? null, artifactRef: artifact?.artifactRef ?? null }
      }),
      // Transient parsed row IDs, mapping timestamps, and download retention do not change a replay key.
      holdings: holdings.map(({ sourceFilingId: _filingId, sourceDocumentId: _documentId, sourceArtifactId: _artifactId, ...semantic }) => semantic),
    }
    return {
      accession: filing.accession, form: filing.form, isAmendment: filing.isAmendment, amendmentNumber: filing.amendmentNumber,
      amendmentType: filing.amendmentType, status: filing.status, filedAt: filing.filedAt?.toISOString() ?? null,
      filingId: filing.id, parserVersion: filing.parserVersion, parsedRowCount: filing.parsedRowCount, rejectedRowCount: filing.rejectedRowCount,
      holdings, manifest,
    }
  })
  return { sources, hash: digest({ managerId: managerId.toString(), periodEnd, sources: sources.map(source => source.manifest) }) }
}

export type EffectiveSnapshotBuildResult =
  | { status: 'READY'; snapshotId: bigint; replayed: boolean; snapshotHash: string }
  | { status: 'PARTIAL' | 'ERROR'; reason: string; snapshotId: bigint | null }

export async function buildEffectivePortfolioSnapshot(input: {
  db: Database
  managerId: bigint
  periodEnd: string
  now?: Date
}): Promise<EffectiveSnapshotBuildResult> {
  calendarDateSchema.parse(input.periodEnd)
  const now = input.now ?? new Date()
  return input.db.transaction(async tx => {
    const lockKey = `institutional-effective:${input.managerId}:${input.periodEnd}`
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
    const manifest = await sourceManifest(tx, input.managerId, input.periodEnd)
    const resolved = resolveEffectivePortfolio(manifest.sources)
    const invalidSource = resolved.status === 'READY' && manifest.sources.some(source =>
      !source.parserVersion || source.parsedRowCount !== source.holdings.length || source.rejectedRowCount !== 0
      || source.holdings.some(holding => holding.mappingVersion === 'mapping-missing' || holding.sourceData.parserVersion !== source.parserVersion))
    const resolution = invalidSource ? { status: 'PARTIAL' as const, reason: 'PARSED_SOURCE_INCOMPLETE' } : resolved
    const snapshotHash = resolved.status === 'READY' ? digest({ managerId: input.managerId.toString(), periodEnd: input.periodEnd,
      holdings: resolved.holdings.map(({ sourceFilingId: _filingId, sourceDocumentId: _documentId, sourceArtifactId: _artifactId, ...semantic }) => semantic),
    }) : null
    const replayKey = digest({ resolverVersion: EFFECTIVE_SNAPSHOT_RESOLVER_VERSION, manifestHash: manifest.hash, snapshotHash })

    let snapshot: typeof institutionalEffectiveSnapshots.$inferSelect | undefined
    let replayed = false
    if (resolution.status === 'READY' && resolved.status === 'READY' && snapshotHash) {
      const [priorSnapshot] = await tx.select().from(institutionalEffectiveSnapshots).where(and(
        eq(institutionalEffectiveSnapshots.managerId, input.managerId), eq(institutionalEffectiveSnapshots.periodEnd, input.periodEnd), eq(institutionalEffectiveSnapshots.replayKey, replayKey),
      )).limit(1)
      snapshot = priorSnapshot
      replayed = Boolean(snapshot)
      if (!snapshot) {
        const [created] = await tx.insert(institutionalEffectiveSnapshots).values({
          managerId: input.managerId, periodEnd: input.periodEnd, replayKey, snapshotHash, sourceManifestHash: manifest.hash,
          resolverVersion: EFFECTIVE_SNAPSHOT_RESOLVER_VERSION, holdingCount: resolved.holdings.length, createdAt: now,
        }).returning()
        snapshot = created!
        await tx.insert(institutionalEffectiveSnapshotSources).values(resolved.lineage.map(({ source, operation }, ordinal) => ({
          snapshotId: snapshot!.id, ordinal, filingId: (source as FilingSource).filingId,
          accession: source.accession, operation, amendmentNumber: source.amendmentNumber,
          parserVersion: (source as FilingSource).parserVersion!, sourceManifest: JSON.parse(stableJson((source as FilingSource).manifest)) as Record<string, unknown>,
        })))
        for (let offset = 0; offset < resolved.holdings.length; offset += 250) {
          await tx.insert(institutionalEffectiveHoldings).values(resolved.holdings.slice(offset, offset + 250)
            .map((holding, index) => ({ ...holding, snapshotId: snapshot!.id, ordinal: offset + index })))
        }
      }
    }

    // ponytail: table-wide SHARE locks close writer races only during final recheck/publication.
    // All parsing, hashing, and copied-row inserts precede this window. Adopt the same period
    // advisory lock in every source writer when publication throughput needs finer concurrency.
    await tx.execute(sql`lock table institutional_filings, institutional_filing_documents, institutional_filing_artifacts, institutional_filing_artifact_fetches, institutional_13f_holdings, institutional_holding_security_mappings in share mode`)
    const rechecked = await sourceManifest(tx, input.managerId, input.periodEnd)
    if (rechecked.hash !== manifest.hash) throw new Error('EFFECTIVE_SNAPSHOT_SOURCE_CHANGED')
    const [active] = await tx.select().from(institutionalEffectiveSnapshotPublications)
      .where(and(eq(institutionalEffectiveSnapshotPublications.managerId, input.managerId), eq(institutionalEffectiveSnapshotPublications.periodEnd, input.periodEnd), eq(institutionalEffectiveSnapshotPublications.active, true))).limit(1)
    const [previousState] = await tx.select({ status: institutionalEffectivePeriodStates.status, reason: institutionalEffectivePeriodStates.reason })
      .from(institutionalEffectivePeriodStates).where(and(
        eq(institutionalEffectivePeriodStates.managerId, input.managerId),
        eq(institutionalEffectivePeriodStates.periodEnd, input.periodEnd),
      )).limit(1)
    await tx.insert(institutionalEffectivePeriodStates).values({
      managerId: input.managerId, periodEnd: input.periodEnd, status: resolution.status, reason: resolution.reason, sourceManifestHash: manifest.hash, checkedAt: now,
    }).onConflictDoUpdate({ target: [institutionalEffectivePeriodStates.managerId, institutionalEffectivePeriodStates.periodEnd], set: {
      status: resolution.status, reason: resolution.reason, sourceManifestHash: manifest.hash, checkedAt: now,
    } })
    const periodStateChanged = previousState?.status !== resolution.status || previousState.reason !== resolution.reason
    if (resolution.status !== 'READY') {
      if (active && periodStateChanged) await tx.insert(institutionalSnapshotChangeEvents).values({
        managerId: input.managerId, periodEnd: input.periodEnd, snapshotId: active.snapshotId,
        eventType: 'EFFECTIVE_PERIOD_STATE_CHANGED', createdAt: now,
      })
      return { status: resolution.status, reason: resolution.reason, snapshotId: active?.snapshotId ?? null }
    }
    if (!snapshot || !snapshotHash) throw new Error('EFFECTIVE_SNAPSHOT_RESOLUTION_FAILED')
    if (active?.snapshotId !== snapshot.id) {
      if (active) await tx.update(institutionalEffectiveSnapshotPublications).set({ active: false, status: 'SUPERSEDED', updatedAt: now })
        .where(eq(institutionalEffectiveSnapshotPublications.snapshotId, active.snapshotId))
      await tx.insert(institutionalEffectiveSnapshotPublications).values({
        snapshotId: snapshot.id, managerId: input.managerId, periodEnd: input.periodEnd, active: true, status: 'READY', updatedAt: now,
      }).onConflictDoUpdate({ target: institutionalEffectiveSnapshotPublications.snapshotId, set: { active: true, status: 'READY', updatedAt: now } })
      await tx.insert(institutionalSnapshotChangeEvents).values({ managerId: input.managerId, periodEnd: input.periodEnd, snapshotId: snapshot.id, previousSnapshotId: active?.snapshotId ?? null, createdAt: now })
    } else if (active && periodStateChanged) {
      await tx.insert(institutionalSnapshotChangeEvents).values({
        managerId: input.managerId, periodEnd: input.periodEnd, snapshotId: active.snapshotId,
        eventType: 'EFFECTIVE_PERIOD_STATE_CHANGED', createdAt: now,
      })
    }
    return { status: 'READY', snapshotId: snapshot.id, replayed, snapshotHash }
  })
}

export async function rebuildEffectivePortfolioForFiling(db: Database, filingId: bigint, now = new Date()) {
  const [filing] = await db.select({ managerId: institutionalFilings.managerId, periodEnd: institutionalFilings.periodEnd })
    .from(institutionalFilings).where(eq(institutionalFilings.id, filingId)).limit(1)
  if (!filing?.periodEnd) return undefined
  return buildEffectivePortfolioSnapshot({ db, managerId: filing.managerId, periodEnd: filing.periodEnd, now })
}

/** Enqueue in the source-writer transaction so a committed mapping correction always has durable work. */
export async function enqueueEffectivePortfolioForFiling(tx: DatabaseTx, filingId: bigint, now = new Date()) {
  const [filing] = await tx.select({ managerId: institutionalFilings.managerId, periodEnd: institutionalFilings.periodEnd })
    .from(institutionalFilings).where(eq(institutionalFilings.id, filingId)).limit(1)
  if (!filing?.periodEnd) return
  await tx.insert(institutionalEffectiveSnapshotRebuildRequests).values({
    managerId: filing.managerId, periodEnd: filing.periodEnd, requestedAt: now, nextAttemptAt: now,
  }).onConflictDoUpdate({ target: [institutionalEffectiveSnapshotRebuildRequests.managerId, institutionalEffectiveSnapshotRebuildRequests.periodEnd], set: {
    requestedRevision: sql`${institutionalEffectiveSnapshotRebuildRequests.requestedRevision} + 1`, requestedAt: now, nextAttemptAt: now, lastError: null,
  } })
  const [previousState] = await tx.select({ status: institutionalEffectivePeriodStates.status, reason: institutionalEffectivePeriodStates.reason })
    .from(institutionalEffectivePeriodStates).where(and(
      eq(institutionalEffectivePeriodStates.managerId, filing.managerId),
      eq(institutionalEffectivePeriodStates.periodEnd, filing.periodEnd),
    )).limit(1)
  const [active] = await tx.select({ snapshotId: institutionalEffectiveSnapshotPublications.snapshotId })
    .from(institutionalEffectiveSnapshotPublications).where(and(
      eq(institutionalEffectiveSnapshotPublications.managerId, filing.managerId),
      eq(institutionalEffectiveSnapshotPublications.periodEnd, filing.periodEnd),
      eq(institutionalEffectiveSnapshotPublications.active, true),
    )).limit(1)
  await tx.insert(institutionalEffectivePeriodStates).values({
    managerId: filing.managerId, periodEnd: filing.periodEnd, status: 'PARTIAL', reason: 'REBUILD_PENDING',
    sourceManifestHash: '0'.repeat(64), checkedAt: now,
  }).onConflictDoUpdate({ target: [institutionalEffectivePeriodStates.managerId, institutionalEffectivePeriodStates.periodEnd], set: {
    status: 'PARTIAL', reason: 'REBUILD_PENDING', checkedAt: now,
  } })
  if (active && (previousState?.status !== 'PARTIAL' || previousState.reason !== 'REBUILD_PENDING')) {
    await tx.insert(institutionalSnapshotChangeEvents).values({
      managerId: filing.managerId, periodEnd: filing.periodEnd, snapshotId: active.snapshotId,
      eventType: 'EFFECTIVE_PERIOD_STATE_CHANGED', createdAt: now,
    })
  }
}

/** At-least-once requests share the builder's period lock and replay key; a crash before acknowledgment simply replays. */
export async function runPendingEffectiveSnapshotRebuildOnce(db: Database, now = new Date()) {
  const [request] = await db.select().from(institutionalEffectiveSnapshotRebuildRequests).where(and(
    sql`${institutionalEffectiveSnapshotRebuildRequests.requestedRevision} > ${institutionalEffectiveSnapshotRebuildRequests.processedRevision}`,
    lte(institutionalEffectiveSnapshotRebuildRequests.nextAttemptAt, now),
  )).orderBy(asc(institutionalEffectiveSnapshotRebuildRequests.nextAttemptAt), asc(institutionalEffectiveSnapshotRebuildRequests.managerId), asc(institutionalEffectiveSnapshotRebuildRequests.periodEnd)).limit(1)
  if (!request) return undefined
  const where = and(eq(institutionalEffectiveSnapshotRebuildRequests.managerId, request.managerId), eq(institutionalEffectiveSnapshotRebuildRequests.periodEnd, request.periodEnd))
  try {
    const result = await buildEffectivePortfolioSnapshot({ db, managerId: request.managerId, periodEnd: request.periodEnd, now })
    await db.update(institutionalEffectiveSnapshotRebuildRequests).set({
      processedRevision: request.requestedRevision, lastError: null,
    }).where(and(where, sql`${institutionalEffectiveSnapshotRebuildRequests.processedRevision} < ${request.requestedRevision}`))
    return { managerId: request.managerId, periodEnd: request.periodEnd, status: result.status }
  } catch {
    await db.update(institutionalEffectiveSnapshotRebuildRequests).set({ lastError: 'EFFECTIVE_SNAPSHOT_REBUILD_FAILED', nextAttemptAt: new Date(now.getTime() + 60_000) })
      .where(and(where, eq(institutionalEffectiveSnapshotRebuildRequests.requestedRevision, request.requestedRevision)))
    // The enqueue transaction already marks this period incomplete and preserves its last READY publication.
    return { managerId: request.managerId, periodEnd: request.periodEnd, status: 'ERROR' as const }
  }
}
