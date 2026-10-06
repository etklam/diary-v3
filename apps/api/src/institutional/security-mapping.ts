import { randomUUID } from 'node:crypto'
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import {
  institutional13fHoldings,
  institutionalFilings,
  institutionalHoldingSecurityMappings,
  institutionalSecurityIdentifiers,
  institutionalSecurityMappingRefreshJobs,
  type Database,
} from '@diary/db'
import { enqueueEffectivePortfolioForFiling } from './effective-snapshots.js'

export const SECURITY_MAPPING_ALGORITHM_VERSION = 'exact-identifiers-v1'

type IdentifierType = 'CUSIP' | 'FIGI'
function normalizedIdentifier(value: string | null): string | undefined {
  const normalized = value?.trim().toUpperCase()
  return normalized || undefined
}

function resolveExactIdentifiers(
  cusip: string | null,
  figi: string | null,
  periodEnd: string | null,
  byIdentifier: Map<string, Set<bigint>>,
) {
  const cusipValue = normalizedIdentifier(cusip)
  const figiValue = normalizedIdentifier(figi)
  const cusipMatches = periodEnd && cusipValue ? byIdentifier.get(`CUSIP:${cusipValue}`) ?? new Set<bigint>() : new Set<bigint>()
  const figiMatches = periodEnd && figiValue ? byIdentifier.get(`FIGI:${figiValue}`) ?? new Set<bigint>() : new Set<bigint>()
  const candidates = new Set([...cusipMatches, ...figiMatches])

  if (!periodEnd) return { status: 'UNRESOLVED' as const, securityId: null, reason: 'MISSING_REPORT_PERIOD', candidates }
  if (!cusipValue && !figiValue) return { status: 'UNRESOLVED' as const, securityId: null, reason: 'NO_STABLE_IDENTIFIER', candidates }
  if (candidates.size === 0) return { status: 'UNRESOLVED' as const, securityId: null, reason: 'NO_IDENTIFIER_MATCH', candidates }
  if (candidates.size > 1) {
    const identifiersConflict = cusipMatches.size > 0 && figiMatches.size > 0
      && [...cusipMatches].every(id => !figiMatches.has(id))
      && [...figiMatches].every(id => !cusipMatches.has(id))
    return {
      status: 'AMBIGUOUS' as const,
      securityId: null,
      reason: identifiersConflict ? 'IDENTIFIERS_CONFLICT' : 'IDENTIFIER_REUSED',
      candidates,
    }
  }
  const reason = cusipMatches.size > 0 && figiMatches.size > 0 ? 'EXACT_CUSIP_FIGI'
    : cusipMatches.size > 0 ? 'EXACT_CUSIP' : 'EXACT_FIGI'
  return { status: 'MATCHED' as const, securityId: [...candidates][0]!, reason, candidates }
}

/** Resolve by exact CUSIP/FIGI validity at report period end; issuer text and ticker are never identity inputs. */
export async function resolveFilingHoldings(db: Database, filingId: bigint, now = new Date()) {
  return db.transaction(async tx => {
    const [filing] = await tx.select({ id: institutionalFilings.id, periodEnd: institutionalFilings.periodEnd })
      .from(institutionalFilings).where(eq(institutionalFilings.id, filingId)).limit(1).for('update')
    if (!filing) return undefined

    const holdings = await tx.select({
      id: institutional13fHoldings.id,
      cusip: institutional13fHoldings.cusip,
      figi: institutional13fHoldings.figi,
    }).from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, filingId)).orderBy(asc(institutional13fHoldings.id))
    const identifierKeys = new Map<string, { type: IdentifierType; value: string }>()
    for (const holding of holdings) {
      for (const [type, value] of [['CUSIP', holding.cusip], ['FIGI', holding.figi]] as const) {
        const normalized = normalizedIdentifier(value)
        if (normalized) identifierKeys.set(`${type}:${normalized}`, { type, value: normalized })
      }
    }

    const byIdentifier = new Map<string, Set<bigint>>()
    const keys = [...identifierKeys.values()]
    for (let offset = 0; filing.periodEnd && offset < keys.length; offset += 250) {
      const batch = keys.slice(offset, offset + 250)
      const exactMatches = await tx.select({
        type: institutionalSecurityIdentifiers.type,
        value: institutionalSecurityIdentifiers.value,
        securityId: institutionalSecurityIdentifiers.securityId,
      }).from(institutionalSecurityIdentifiers).where(and(
        or(...batch.map(key => and(
          eq(institutionalSecurityIdentifiers.type, key.type),
          eq(institutionalSecurityIdentifiers.value, key.value),
        ))),
        lte(institutionalSecurityIdentifiers.validFrom, filing.periodEnd),
        or(gte(institutionalSecurityIdentifiers.validTo, filing.periodEnd), isNull(institutionalSecurityIdentifiers.validTo)),
      ))
      for (const row of exactMatches) {
        const key = `${row.type}:${row.value}`
        const set = byIdentifier.get(key) ?? new Set<bigint>()
        set.add(row.securityId)
        byIdentifier.set(key, set)
      }
    }

    let mapped = 0
    for (const holding of holdings) {
      const [current] = await tx.select({ status: institutionalHoldingSecurityMappings.status })
        .from(institutionalHoldingSecurityMappings)
        .where(eq(institutionalHoldingSecurityMappings.holdingId, holding.id)).limit(1)
      if (current?.status === 'MANUAL_OVERRIDE') {
        mapped++
        continue
      }
      const result = resolveExactIdentifiers(holding.cusip, holding.figi, filing.periodEnd, byIdentifier)
      const candidateSecurityIds = [...result.candidates].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map(String)
      if (result.securityId !== null) mapped++
      await tx.insert(institutionalHoldingSecurityMappings).values({
        holdingId: holding.id,
        status: result.status,
        securityId: result.securityId,
        reason: result.reason,
        candidateSecurityIds,
        algorithmVersion: SECURITY_MAPPING_ALGORITHM_VERSION,
        resolvedAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: institutionalHoldingSecurityMappings.holdingId,
        set: {
          status: result.status,
          securityId: result.securityId,
          reason: result.reason,
          candidateSecurityIds,
          algorithmVersion: SECURITY_MAPPING_ALGORITHM_VERSION,
          resolvedAt: now,
          updatedAt: now,
        },
      })
    }
    const mappingCoverage = holdings.length === 0 ? null : (mapped * 100 / holdings.length).toFixed(2)
    await tx.update(institutionalFilings).set({ mappingCoverage, updatedAt: now }).where(eq(institutionalFilings.id, filingId))
    await enqueueEffectivePortfolioForFiling(tx, filingId, now)
    return { filingId: filingId.toString(), totalPositions: holdings.length, mappedPositions: mapped, mappingCoverage }
  })
}

/** Resume an outbox-backed, cursor-based mapping refresh. Resolver writes are idempotent if a worker dies before its cursor advances. */
export async function runSecurityMappingRefreshBatch(db: Database, jobId: bigint, now = new Date(), batchSize = 50) {
  const limit = Math.max(1, Math.min(batchSize, 100))
  const token = randomUUID()
  const claim = await db.transaction(async tx => {
    const [job] = await tx.select().from(institutionalSecurityMappingRefreshJobs)
      .where(eq(institutionalSecurityMappingRefreshJobs.id, jobId)).limit(1).for('update')
    if (!job) return { kind: 'missing' as const }
    if (job.status === 'COMPLETE') return { kind: 'complete' as const, job }
    if (job.status === 'RUNNING' && job.leaseExpiresAt && job.leaseExpiresAt > now) return { kind: 'busy' as const, job }
    const leaseExpiresAt = new Date(now.getTime() + 60_000)
    const [claimed] = await tx.update(institutionalSecurityMappingRefreshJobs).set({
      status: 'RUNNING', leaseToken: token, leaseExpiresAt, lastError: null, updatedAt: now,
    }).where(eq(institutionalSecurityMappingRefreshJobs.id, jobId)).returning()
    return { kind: 'claimed' as const, job: claimed! }
  })
  if (claim.kind !== 'claimed') {
    if (claim.kind === 'missing') return undefined
    return { job: claim.job, processedThisRun: 0 }
  }

  let processedThisRun = 0
  try {
    const identifiers = await db.select({ id: institutionalSecurityIdentifiers.id, type: institutionalSecurityIdentifiers.type, value: institutionalSecurityIdentifiers.value })
      .from(institutionalSecurityIdentifiers).where(and(
        eq(institutionalSecurityIdentifiers.securityId, claim.job.securityId),
        inArray(institutionalSecurityIdentifiers.type, ['CUSIP', 'FIGI']),
      ))
    const joinMatch = or(...identifiers.map(identifier => and(
      eq(institutionalSecurityIdentifiers.id, identifier.id),
      identifier.type === 'CUSIP' ? eq(institutional13fHoldings.cusip, identifier.value) : eq(institutional13fHoldings.figi, identifier.value),
      lte(institutionalSecurityIdentifiers.validFrom, institutionalFilings.periodEnd),
      or(gte(institutionalSecurityIdentifiers.validTo, institutionalFilings.periodEnd), isNull(institutionalSecurityIdentifiers.validTo)),
    )))
    const filingRows = identifiers.length ? await db.selectDistinct({ filingId: institutionalFilings.id }).from(institutionalFilings)
      .innerJoin(institutional13fHoldings, eq(institutional13fHoldings.filingId, institutionalFilings.id))
      .innerJoin(institutionalSecurityIdentifiers, joinMatch)
      .where(and(sql`${institutionalFilings.periodEnd} is not null`, sql`${institutionalFilings.id} > ${claim.job.lastFilingId}`))
      .orderBy(asc(institutionalFilings.id)).limit(limit) : []

    for (const row of filingRows) {
      await resolveFilingHoldings(db, row.filingId, now)
      await db.update(institutionalSecurityMappingRefreshJobs).set({
        lastFilingId: row.filingId,
        processedFilingCount: sql`${institutionalSecurityMappingRefreshJobs.processedFilingCount} + 1`,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        updatedAt: now,
      }).where(and(
        eq(institutionalSecurityMappingRefreshJobs.id, jobId),
        eq(institutionalSecurityMappingRefreshJobs.leaseToken, token),
      ))
      processedThisRun++
    }
    const complete = filingRows.length < limit
    const [job] = await db.update(institutionalSecurityMappingRefreshJobs).set({
      status: complete ? 'COMPLETE' : 'PENDING',
      leaseToken: null, leaseExpiresAt: null, completedAt: complete ? now : null, updatedAt: now,
    }).where(and(
      eq(institutionalSecurityMappingRefreshJobs.id, jobId),
      eq(institutionalSecurityMappingRefreshJobs.leaseToken, token),
    )).returning()
    return job ? { job, processedThisRun } : undefined
  } catch (error) {
    await db.update(institutionalSecurityMappingRefreshJobs).set({
      status: 'PENDING', leaseToken: null, leaseExpiresAt: null,
      lastError: error instanceof Error ? error.name.slice(0, 160) : 'RefreshFailed', updatedAt: now,
    }).where(and(
      eq(institutionalSecurityMappingRefreshJobs.id, jobId),
      eq(institutionalSecurityMappingRefreshJobs.leaseToken, token),
    ))
    throw error
  }
}

export type SecurityIdentityComparisonEvent = {
  id?: string
  supersedesEventId?: string | null
  kind: 'TICKER_CHANGE' | 'MERGER' | 'SPIN_OFF' | 'DELISTING' | 'STOCK_SPLIT' | 'SHARE_CLASS_CONTINUITY'
  fromSecurityId: string
  toSecurityId: string | null
  effectiveOn: string
  newSharesPerOldShare: string | null
  comparable: boolean
}

function decimalParts(value: string): { coefficient: bigint; scale: number } {
  const [whole, fraction = ''] = value.split('.')
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length }
}

function multiplyDecimals(left: string, right: string): string {
  const a = decimalParts(left)
  const b = decimalParts(right)
  const coefficient = a.coefficient * b.coefficient
  const scale = a.scale + b.scale
  const digits = coefficient.toString().padStart(scale + 1, '0')
  if (scale === 0) return digits
  const normalized = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
  return normalized
}

/** Only same-ID history, explicit class conversion, and verified split ratios prove comparable quantities. */
export function compareSecurityIdentity(
  fromSecurityId: string,
  toSecurityId: string,
  fromDate: string,
  toDate: string,
  events: readonly SecurityIdentityComparisonEvent[],
) {
  if (fromDate > toDate) return { comparable: false, quantityFactor: null, reason: 'INVALID_DATE_ORDER' } as const
  const supersededIds = new Set(events.flatMap(event => event.supersedesEventId ? [event.supersedesEventId] : []))
  const activeEvents = events.filter(event => event.id === undefined || !supersededIds.has(event.id))
  if (fromSecurityId === toSecurityId) {
    const splits = activeEvents.filter(event => event.kind === 'STOCK_SPLIT'
      && event.fromSecurityId === fromSecurityId && event.comparable
      && event.newSharesPerOldShare !== null && fromDate < event.effectiveOn && event.effectiveOn <= toDate)
      .sort((left, right) => left.effectiveOn.localeCompare(right.effectiveOn))
    return {
      comparable: true,
      quantityFactor: splits.reduce((factor, event) => multiplyDecimals(factor, event.newSharesPerOldShare!), '1'),
      reason: splits.length ? 'VERIFIED_SPLIT_CONVERSION' : 'SAME_SECURITY_ID',
    } as const
  }

  const queue: Array<{ securityId: string; factor: string; visited: Set<string> }> = [{ securityId: fromSecurityId, factor: '1', visited: new Set([fromSecurityId]) }]
  while (queue.length) {
    const current = queue.shift()!
    for (const event of activeEvents) {
      if (event.kind !== 'SHARE_CLASS_CONTINUITY' || !event.comparable || !event.newSharesPerOldShare
        || event.fromSecurityId !== current.securityId || event.toSecurityId === null
        || event.effectiveOn <= fromDate || event.effectiveOn > toDate || current.visited.has(event.toSecurityId)) continue
      const factor = multiplyDecimals(current.factor, event.newSharesPerOldShare)
      if (event.toSecurityId === toSecurityId) return { comparable: true, quantityFactor: factor, reason: 'VERIFIED_CLASS_CONVERSION' } as const
      queue.push({ securityId: event.toSecurityId, factor, visited: new Set([...current.visited, event.toSecurityId]) })
    }
  }
  const transformation = activeEvents.some(event => ['MERGER', 'SPIN_OFF'].includes(event.kind)
    && !event.comparable && event.fromSecurityId === fromSecurityId && event.toSecurityId === toSecurityId
    && event.effectiveOn >= fromDate && event.effectiveOn <= toDate)
  return { comparable: false, quantityFactor: null, reason: transformation ? 'TRANSFORMATION_NON_COMPARABLE' : 'NO_PROVEN_CONVERSION' } as const
}

/** Resolve an exact dated identifier while ignoring rows superseded by a verified correction effective by that date. */
export async function resolveSecurityIdentifier(
  db: Database,
  type: 'CUSIP' | 'FIGI' | 'TICKER',
  value: string,
  asOf: string,
) {
  const identifiers = await db.select().from(institutionalSecurityIdentifiers).where(and(
    eq(institutionalSecurityIdentifiers.type, type),
    eq(institutionalSecurityIdentifiers.value, value.trim().toUpperCase()),
    lte(institutionalSecurityIdentifiers.validFrom, asOf),
    or(gte(institutionalSecurityIdentifiers.validTo, asOf), isNull(institutionalSecurityIdentifiers.validTo)),
  ))
  const securityIds = new Set<bigint>()
  for (const candidate of identifiers) {
    const rows = await db.select({ id: institutionalSecurityIdentifiers.id, supersedesIdentifierId: institutionalSecurityIdentifiers.supersedesIdentifierId })
      .from(institutionalSecurityIdentifiers).where(and(
        eq(institutionalSecurityIdentifiers.securityId, candidate.securityId),
        eq(institutionalSecurityIdentifiers.type, type),
        lte(institutionalSecurityIdentifiers.validFrom, asOf),
      ))
    const superseded = new Set(rows.flatMap(row => row.supersedesIdentifierId === null ? [] : [row.supersedesIdentifierId]))
    if (!superseded.has(candidate.id)) securityIds.add(candidate.securityId)
  }
  const candidates = [...securityIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map(String)
  if (candidates.length === 0) return { status: 'UNRESOLVED' as const, securityId: null, candidates }
  if (candidates.length > 1) return { status: 'AMBIGUOUS' as const, securityId: null, candidates }
  return { status: 'MATCHED' as const, securityId: candidates[0]!, candidates }
}
