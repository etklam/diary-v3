import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import {
  adminInstitutionalIdentityEventCreateRequestSchema,
  adminInstitutionalIdentityEventListQuerySchema,
  adminInstitutionalIdentityEventListResponseSchema,
  adminInstitutionalIdentityEventResponseSchema,
  adminInstitutionalMappingListQuerySchema,
  adminInstitutionalMappingListResponseSchema,
  adminInstitutionalMappingRefreshJobResponseSchema,
  adminInstitutionalMappingOverrideRequestSchema,
  adminInstitutionalMappingOverrideResponseSchema,
  adminInstitutionalSecurityCreateRequestSchema,
  adminInstitutionalSecurityCreateResponseSchema,
  adminInstitutionalSecurityListQuerySchema,
  adminInstitutionalSecurityListResponseSchema,
  adminInstitutionalSecurityResponseSchema,
  serializedIdSchema,
  type ErrorCode,
  type InstitutionalSecurity,
} from '@diary/contracts'
import {
  institutional13fHoldings,
  institutionalFilings,
  institutionalHoldingSecurityMappings,
  institutionalSecurityIdentityEvents,
  institutionalSecurityIdentifiers,
  institutionalSecurityMappingOverrides,
  institutionalSecurityMappingRefreshJobs,
  institutionalSecurities,
  users,
  type Database,
} from '@diary/db'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { instant, isUniqueViolation, type AppEnv } from '../app-context.js'
import { runSecurityMappingRefreshBatch } from './security-mapping.js'
import { enqueueEffectivePortfolioForFiling } from './effective-snapshots.js'

type AdminSecurityMappingDependencies = {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}

function previousDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function escapedPattern(value: string | undefined) {
  return value === undefined ? undefined : `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

export function registerAdminSecurityMappingRoutes(app: Hono<AppEnv>, dependencies: AdminSecurityMappingDependencies) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const requireAdmin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [current] = await db.select({ role: users.role }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!current) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (current.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return BigInt(session.id)
  }
  const parseParamId = (context: Context<AppEnv>, name: string) => {
    const parsed = serializedIdSchema.safeParse(context.req.param(name))
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }

  const readSecurity = async (securityId: bigint): Promise<InstitutionalSecurity | undefined> => {
    const [security] = await db.select().from(institutionalSecurities).where(eq(institutionalSecurities.id, securityId)).limit(1)
    if (!security) return undefined
    const identifiers = await db.select().from(institutionalSecurityIdentifiers)
      .where(eq(institutionalSecurityIdentifiers.securityId, securityId))
      .orderBy(asc(institutionalSecurityIdentifiers.type), asc(institutionalSecurityIdentifiers.validFrom), asc(institutionalSecurityIdentifiers.id))
    return adminInstitutionalSecurityResponseSchema.parse({ data: {
      id: security.id.toString(), issuer: security.issuer, titleOfClass: security.titleOfClass,
      exchange: security.exchange, securityType: security.securityType, sector: security.sector,
      industry: security.industry, status: security.status, sourceUrl: security.sourceUrl,
      sourceVerifiedBy: security.sourceVerifiedBy.toString(), sourceVerifiedAt: instant(security.sourceVerifiedAt),
      createdAt: instant(security.createdAt), updatedAt: instant(security.updatedAt),
      identifiers: identifiers.map(row => ({
        id: row.id.toString(), supersedesIdentifierId: row.supersedesIdentifierId?.toString() ?? null,
        type: row.type, value: row.value, validFrom: row.validFrom,
        validTo: row.validTo, sourceUrl: row.sourceUrl,
        sourceVerifiedBy: row.sourceVerifiedBy.toString(), sourceVerifiedAt: instant(row.sourceVerifiedAt),
      })),
    } }).data
  }

  app.get('/api/admin/institutional/securities', async context => {
    await requireAdmin(context)
    const parsed = adminInstitutionalSecurityListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const { q, limit, offset } = parsed.data
    const pattern = escapedPattern(q)
    const where = pattern ? or(
      ilike(institutionalSecurities.issuer, pattern),
      ilike(institutionalSecurities.titleOfClass, pattern),
      ilike(institutionalSecurities.sector, pattern),
      ilike(institutionalSecurities.industry, pattern),
      ilike(institutionalSecurityIdentifiers.value, pattern),
    ) : undefined
    const [totals, ids] = await Promise.all([
      db.select({ total: sql<number>`count(distinct ${institutionalSecurities.id})::int` })
        .from(institutionalSecurities).leftJoin(institutionalSecurityIdentifiers, eq(institutionalSecurityIdentifiers.securityId, institutionalSecurities.id)).where(where),
      db.selectDistinct({ id: institutionalSecurities.id }).from(institutionalSecurities)
        .leftJoin(institutionalSecurityIdentifiers, eq(institutionalSecurityIdentifiers.securityId, institutionalSecurities.id))
        .where(where).orderBy(desc(institutionalSecurities.id)).limit(limit).offset(offset),
    ])
    const data = await Promise.all(ids.map(row => readSecurity(row.id)))
    return context.json(adminInstitutionalSecurityListResponseSchema.parse({
      data: data.filter((row): row is InstitutionalSecurity => row !== undefined),
      pagination: { limit, offset, total: totals[0]?.total ?? 0 },
    }))
  })

  app.get('/api/admin/institutional/securities/:id', async context => {
    await requireAdmin(context)
    const securityId = parseParamId(context, 'id')
    const security = await readSecurity(securityId)
    if (!security) return fail(404, 'SYS_NOT_FOUND', 'Security not found')
    return context.json(adminInstitutionalSecurityResponseSchema.parse({ data: security }))
  })

  app.post('/api/admin/institutional/securities', async context => {
    const actorUserId = await requireAdmin(context)
    const input = await parseJson(context, adminInstitutionalSecurityCreateRequestSchema)
    const timestamp = now()
    try {
      const created = await db.transaction(async tx => {
        const [security] = await tx.insert(institutionalSecurities).values({
          issuer: input.issuer, titleOfClass: input.titleOfClass, exchange: input.exchange,
          securityType: input.securityType, sector: input.sector, industry: input.industry,
          status: input.status, sourceUrl: input.sourceUrl, sourceVerifiedBy: actorUserId,
          sourceVerifiedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
        }).returning({ id: institutionalSecurities.id })
        await tx.insert(institutionalSecurityIdentifiers).values(input.identifiers.map(identifier => ({
          securityId: security!.id,
          type: identifier.type,
          value: identifier.value,
          validFrom: identifier.validFrom,
          validTo: identifier.validTo,
          sourceUrl: input.sourceUrl,
          sourceVerifiedBy: actorUserId,
          sourceVerifiedAt: timestamp,
          createdAt: timestamp,
        })))
        const [job] = await tx.insert(institutionalSecurityMappingRefreshJobs).values({
          securityId: security!.id, createdBy: actorUserId, createdAt: timestamp, updatedAt: timestamp,
        }).returning({ id: institutionalSecurityMappingRefreshJobs.id })
        return { securityId: security!.id, jobId: job!.id }
      })
      const [job] = await db.select().from(institutionalSecurityMappingRefreshJobs).where(eq(institutionalSecurityMappingRefreshJobs.id, created.jobId)).limit(1)
      const security = await readSecurity(created.securityId)
      if (!security || !job) return fail(500, 'SYS_INTERNAL_ERROR', 'Created security could not be read back')
      return context.json(adminInstitutionalSecurityCreateResponseSchema.parse({
        data: security,
        mappingRefreshJob: serializeRefreshJob(job, 0),
      }), 201)
    } catch (error) {
      if (isUniqueViolation(error, 'institutional_security_identifiers_identity_unique')) return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'Duplicate identifier validity interval')
      throw error
    }
  })

  app.post('/api/admin/institutional/mappings/refresh-jobs/:id/run', async context => {
    await requireAdmin(context)
    const jobId = parseParamId(context, 'id')
    const result = await runSecurityMappingRefreshBatch(db, jobId, now())
    if (!result) return fail(404, 'SYS_NOT_FOUND', 'Mapping refresh job not found')
    return context.json(adminInstitutionalMappingRefreshJobResponseSchema.parse({
      data: serializeRefreshJob(result.job, result.processedThisRun),
    }))
  })

  app.get('/api/admin/institutional/mappings', async context => {
    await requireAdmin(context)
    const parsed = adminInstitutionalMappingListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const { status, filingId, search, limit, offset } = parsed.data
    const pattern = escapedPattern(search)
    const where = and(
      status ? eq(institutionalHoldingSecurityMappings.status, status)
        : inArray(institutionalHoldingSecurityMappings.status, ['UNRESOLVED', 'AMBIGUOUS']),
      filingId ? eq(institutional13fHoldings.filingId, BigInt(filingId)) : undefined,
      pattern ? or(ilike(institutional13fHoldings.issuer, pattern), ilike(institutional13fHoldings.titleOfClass, pattern), ilike(institutional13fHoldings.cusip, pattern), ilike(institutional13fHoldings.figi, pattern), ilike(institutionalFilings.accession, pattern)) : undefined,
    )
    const base = db.select({
      holding: institutional13fHoldings,
      filing: institutionalFilings,
      mapping: institutionalHoldingSecurityMappings,
    }).from(institutionalHoldingSecurityMappings)
      .innerJoin(institutional13fHoldings, eq(institutional13fHoldings.id, institutionalHoldingSecurityMappings.holdingId))
      .innerJoin(institutionalFilings, eq(institutionalFilings.id, institutional13fHoldings.filingId))
    const [totals, rows, selectedFiling] = await Promise.all([
      db.select({ total: count() }).from(institutionalHoldingSecurityMappings)
        .innerJoin(institutional13fHoldings, eq(institutional13fHoldings.id, institutionalHoldingSecurityMappings.holdingId))
        .innerJoin(institutionalFilings, eq(institutionalFilings.id, institutional13fHoldings.filingId)).where(where),
      base.where(where).orderBy(desc(institutionalFilings.periodEnd), desc(institutionalFilings.id), asc(institutional13fHoldings.rowNumber))
        .limit(limit).offset(offset),
      filingId ? db.select().from(institutionalFilings).where(eq(institutionalFilings.id, BigInt(filingId))).limit(1).then(result => result[0])
        : search ? db.select().from(institutionalFilings).where(eq(institutionalFilings.accession, search)).limit(2).then(result => result.length === 1 ? result[0] : undefined)
          : Promise.resolve(undefined),
    ])
    const allCandidates = new Set<bigint>()
    for (const row of rows) {
      if (row.mapping.securityId !== null) allCandidates.add(row.mapping.securityId)
      for (const id of row.mapping.candidateSecurityIds) allCandidates.add(BigInt(id))
    }
    const securityRows = allCandidates.size ? await db.select().from(institutionalSecurities).where(inArray(institutionalSecurities.id, [...allCandidates])) : []
    const securities = new Map<string, InstitutionalSecurity>()
    await Promise.all(securityRows.map(async row => {
      const security = await readSecurity(row.id)
      if (security) securities.set(row.id.toString(), security)
    }))
    const holdingIds = rows.map(row => row.holding.id)
    const auditRows = holdingIds.length ? await db.select().from(institutionalSecurityMappingOverrides)
      .where(inArray(institutionalSecurityMappingOverrides.holdingId, holdingIds))
      .orderBy(desc(institutionalSecurityMappingOverrides.version), desc(institutionalSecurityMappingOverrides.id)) : []
    const latestAudit = new Map<string, typeof auditRows[number]>()
    const overrideHistory = new Map<string, typeof auditRows>()
    for (const audit of auditRows) if (!latestAudit.has(audit.holdingId.toString())) latestAudit.set(audit.holdingId.toString(), audit)
    for (const audit of auditRows) {
      const key = audit.holdingId.toString()
      const history = overrideHistory.get(key) ?? []
      history.push(audit)
      overrideHistory.set(key, history)
    }
    const serializeOverride = (audit: typeof auditRows[number]) => ({
      id: audit.id.toString(), version: audit.version, actorUserId: audit.actorUserId.toString(),
      createdAt: instant(audit.createdAt), evidenceUrl: audit.evidenceUrl, reason: audit.reason,
      supersedesOverrideId: audit.supersedesOverrideId?.toString() ?? null,
    })
    const data = rows.map(({ holding, filing, mapping }) => {
      const candidateIds = mapping.candidateSecurityIds
      const audit = mapping.status === 'MANUAL_OVERRIDE' ? latestAudit.get(holding.id.toString()) : undefined
      return {
        holding: {
          id: holding.id.toString(), filingId: filing.id.toString(), accession: filing.accession,
          periodEnd: filing.periodEnd, issuer: holding.issuer, titleOfClass: holding.titleOfClass,
          cusip: holding.cusip, figi: holding.figi, quantity: holding.quantity,
          quantityType: holding.quantityType, reportedValue: holding.reportedValue, putCall: holding.putCall,
        },
        resolution: {
          status: mapping.status, securityId: mapping.securityId?.toString() ?? null,
          reason: mapping.reason, candidateSecurityIds: candidateIds,
          algorithmVersion: mapping.algorithmVersion, resolvedAt: instant(mapping.resolvedAt),
        },
        security: mapping.securityId === null ? null : securities.get(mapping.securityId.toString()) ?? null,
        candidates: candidateIds.flatMap(id => {
          const security = securities.get(id)
          return security ? [{ id: security.id, issuer: security.issuer, titleOfClass: security.titleOfClass, status: security.status, identifiers: security.identifiers }] : []
        }),
        override: audit ? serializeOverride(audit) : null,
        overrideHistory: (overrideHistory.get(holding.id.toString()) ?? []).map(serializeOverride),
      }
    })
    let filingResponse = null
    if (selectedFiling) {
      const [parsedRows] = await db.select({ total: count() }).from(institutional13fHoldings).where(eq(institutional13fHoldings.filingId, selectedFiling.id))
      filingResponse = {
        id: selectedFiling.id.toString(), accession: selectedFiling.accession, periodEnd: selectedFiling.periodEnd,
        status: selectedFiling.status, mappingCoverage: selectedFiling.mappingCoverage,
        parsedRowCount: selectedFiling.parsedRowCount ?? Number(parsedRows?.total ?? 0),
      }
    }
    return context.json(adminInstitutionalMappingListResponseSchema.parse({
      data,
      pagination: { limit, offset, total: Number(totals[0]?.total ?? 0) },
      filing: filingResponse,
    }))
  })

  app.post('/api/admin/institutional/mappings/:holdingId/override', async context => {
    const actorUserId = await requireAdmin(context)
    const holdingId = parseParamId(context, 'holdingId')
    const input = await parseJson(context, adminInstitutionalMappingOverrideRequestSchema)
    const timestamp = now()
    const result = await db.transaction(async tx => {
      const [holding] = await tx.select({
        id: institutional13fHoldings.id,
        filingId: institutional13fHoldings.filingId,
      }).from(institutional13fHoldings).where(eq(institutional13fHoldings.id, holdingId)).limit(1)
      if (!holding) return undefined
      await tx.select({ id: institutionalFilings.id }).from(institutionalFilings)
        .where(eq(institutionalFilings.id, holding.filingId)).limit(1).for('update')
      const [security] = await tx.select({ id: institutionalSecurities.id }).from(institutionalSecurities)
        .where(eq(institutionalSecurities.id, BigInt(input.securityId))).limit(1)
      if (!security) return { kind: 'security-not-found' as const }
      const [latest] = await tx.select().from(institutionalSecurityMappingOverrides)
        .where(eq(institutionalSecurityMappingOverrides.holdingId, holdingId))
        .orderBy(desc(institutionalSecurityMappingOverrides.version)).limit(1).for('update')
      const [override] = await tx.insert(institutionalSecurityMappingOverrides).values({
        holdingId, securityId: security.id, version: (latest?.version ?? 0) + 1, actorUserId,
        reason: input.reason, evidenceUrl: input.evidenceUrl, createdAt: timestamp,
        supersedesOverrideId: latest?.id ?? null,
      }).returning()
      await tx.insert(institutionalHoldingSecurityMappings).values({
        holdingId, status: 'MANUAL_OVERRIDE', securityId: security.id, reason: 'ADMIN_OVERRIDE',
        candidateSecurityIds: [security.id.toString()], algorithmVersion: 'admin-override-v1',
        resolvedAt: timestamp, updatedAt: timestamp,
      }).onConflictDoUpdate({
        target: institutionalHoldingSecurityMappings.holdingId,
        set: {
          status: 'MANUAL_OVERRIDE', securityId: security.id, reason: 'ADMIN_OVERRIDE',
          candidateSecurityIds: [security.id.toString()], algorithmVersion: 'admin-override-v1',
          resolvedAt: timestamp, updatedAt: timestamp,
        },
      })
      const [counts] = await tx.select({
        total: count(),
        mapped: sql<number>`count(*) filter (where ${institutionalHoldingSecurityMappings.securityId} is not null)::int`,
      }).from(institutional13fHoldings)
        .leftJoin(institutionalHoldingSecurityMappings, eq(institutionalHoldingSecurityMappings.holdingId, institutional13fHoldings.id))
        .where(eq(institutional13fHoldings.filingId, holding.filingId))
      const mappingCoverage = Number(counts?.total ?? 0) === 0 ? null : (Number(counts?.mapped ?? 0) * 100 / Number(counts!.total)).toFixed(2)
      await tx.update(institutionalFilings).set({ mappingCoverage, updatedAt: timestamp }).where(eq(institutionalFilings.id, holding.filingId))
      await enqueueEffectivePortfolioForFiling(tx, holding.filingId, timestamp)
      return { kind: 'created' as const, securityId: security.id, override: override! }
    })
    if (!result) return fail(404, 'SYS_NOT_FOUND', 'Holding not found')
    if (result.kind === 'security-not-found') return fail(404, 'SYS_NOT_FOUND', 'Security not found')
    const security = await readSecurity(result.securityId)
    if (!security) return fail(404, 'SYS_NOT_FOUND', 'Security not found')
    return context.json(adminInstitutionalMappingOverrideResponseSchema.parse({ data: {
      holdingId: holdingId.toString(), status: 'MANUAL_OVERRIDE', security,
      override: {
        id: result.override.id.toString(), version: result.override.version,
        actorUserId: result.override.actorUserId.toString(), createdAt: instant(result.override.createdAt),
        evidenceUrl: result.override.evidenceUrl, reason: result.override.reason,
        supersedesOverrideId: result.override.supersedesOverrideId?.toString() ?? null,
      },
    } }), 201)
  })

  app.get('/api/admin/institutional/securities/:id/identity-events', async context => {
    await requireAdmin(context)
    const securityId = parseParamId(context, 'id')
    const parsed = adminInstitutionalIdentityEventListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const [security] = await db.select({ id: institutionalSecurities.id }).from(institutionalSecurities).where(eq(institutionalSecurities.id, securityId)).limit(1)
    if (!security) return fail(404, 'SYS_NOT_FOUND', 'Security not found')
    const where = or(eq(institutionalSecurityIdentityEvents.fromSecurityId, securityId), eq(institutionalSecurityIdentityEvents.toSecurityId, securityId))
    const [totals, events] = await Promise.all([
      db.select({ total: count() }).from(institutionalSecurityIdentityEvents).where(where),
      db.select().from(institutionalSecurityIdentityEvents).where(where)
        .orderBy(desc(institutionalSecurityIdentityEvents.effectiveOn), desc(institutionalSecurityIdentityEvents.id))
        .limit(parsed.data.limit).offset(parsed.data.offset),
    ])
    return context.json(adminInstitutionalIdentityEventListResponseSchema.parse({
      data: events.map(serializeIdentityEvent),
      pagination: { ...parsed.data, total: Number(totals[0]?.total ?? 0) },
    }))
  })

  app.post('/api/admin/institutional/securities/:id/identity-events', async context => {
    const actorUserId = await requireAdmin(context)
    const fromSecurityId = parseParamId(context, 'id')
    const input = await parseJson(context, adminInstitutionalIdentityEventCreateRequestSchema)
    const timestamp = now()
    const created = await db.transaction(async tx => {
      const [from] = await tx.select().from(institutionalSecurities).where(eq(institutionalSecurities.id, fromSecurityId)).limit(1).for('update')
      if (!from) return { kind: 'from-not-found' as const }
      let toSecurityId: bigint | null = null
      if (input.kind === 'TICKER_CHANGE' || input.kind === 'STOCK_SPLIT') toSecurityId = fromSecurityId
      if (input.kind === 'MERGER' || input.kind === 'SPIN_OFF' || input.kind === 'SHARE_CLASS_CONTINUITY') {
        toSecurityId = BigInt(input.relatedSecurityId)
        if (toSecurityId === fromSecurityId) return { kind: 'invalid-related-security' as const }
        const [target] = await tx.select({ id: institutionalSecurities.id }).from(institutionalSecurities).where(eq(institutionalSecurities.id, toSecurityId)).limit(1)
        if (!target) return { kind: 'to-not-found' as const }
      }

      let superseded: typeof institutionalSecurityIdentityEvents.$inferSelect | undefined
      if (input.supersedesEventId) {
        const [prior] = await tx.select().from(institutionalSecurityIdentityEvents)
          .where(eq(institutionalSecurityIdentityEvents.id, BigInt(input.supersedesEventId))).limit(1).for('update')
        if (!prior || prior.fromSecurityId !== fromSecurityId || prior.kind !== input.kind) return { kind: 'invalid-supersession' as const }
      const [alreadySuperseded] = await tx.select({ id: institutionalSecurityIdentityEvents.id }).from(institutionalSecurityIdentityEvents)
          .where(eq(institutionalSecurityIdentityEvents.supersedesEventId, prior.id)).limit(1)
        if (alreadySuperseded) return { kind: 'already-superseded' as const }
        if (input.effectiveOn < prior.effectiveOn) return { kind: 'earlier-correction' as const }
        if (input.kind === 'TICKER_CHANGE') {
          const tickerEvents = await tx.select().from(institutionalSecurityIdentityEvents).where(and(
            eq(institutionalSecurityIdentityEvents.fromSecurityId, fromSecurityId),
            eq(institutionalSecurityIdentityEvents.kind, 'TICKER_CHANGE'),
          ))
          const supersededIds = new Set(tickerEvents.flatMap(event => event.supersedesEventId === null ? [] : [event.supersedesEventId]))
          const latest = tickerEvents.filter(event => !supersededIds.has(event.id))
            .sort((left, right) => left.effectiveOn.localeCompare(right.effectiveOn) || (left.id < right.id ? -1 : 1)).at(-1)
          if (latest?.id !== prior.id) return { kind: 'not-latest-ticker-event' as const }
        }
        superseded = prior
      }

      let ratio: string | null = null
      let newTicker: string | null = null
      let comparable = false
      if (input.kind === 'TICKER_CHANGE') {
        if (from.status === 'DELISTED') return { kind: 'security-inactive' as const }
        newTicker = input.newTicker
        comparable = true
        const tickerRows = await tx.select().from(institutionalSecurityIdentifiers).where(and(
          eq(institutionalSecurityIdentifiers.securityId, fromSecurityId),
          eq(institutionalSecurityIdentifiers.type, 'TICKER'),
        )).orderBy(desc(institutionalSecurityIdentifiers.validFrom)).for('update')
        const supersededIdentifierIds = new Set(tickerRows.flatMap(row => row.supersedesIdentifierId === null ? [] : [row.supersedesIdentifierId]))
        const currentTickers = tickerRows.filter(row => row.validTo === null && !supersededIdentifierIds.has(row.id))
        const sameDayCorrection = superseded?.kind === 'TICKER_CHANGE' && superseded.effectiveOn === input.effectiveOn
        const current = currentTickers[0]
        if (current && input.effectiveOn < current.validFrom) return { kind: 'earlier-correction' as const }
        if (current?.validFrom === input.effectiveOn && !sameDayCorrection) return { kind: 'ticker-date-conflict' as const }
        if (current && current.value === newTicker && !superseded) return { kind: 'same-ticker' as const }
        if (current && !(sameDayCorrection && current.value === newTicker)) {
          if (!sameDayCorrection || current.validFrom < input.effectiveOn) {
            await tx.update(institutionalSecurityIdentifiers).set({ validTo: previousDay(input.effectiveOn) })
              .where(eq(institutionalSecurityIdentifiers.id, current.id))
          }
          await tx.insert(institutionalSecurityIdentifiers).values({
            securityId: fromSecurityId, type: 'TICKER', value: newTicker,
            validFrom: input.effectiveOn, validTo: null, sourceUrl: input.evidenceUrl,
            sourceVerifiedBy: actorUserId, sourceVerifiedAt: timestamp, createdAt: timestamp,
            supersedesIdentifierId: current.id,
          })
        } else if (!current) {
          await tx.insert(institutionalSecurityIdentifiers).values({
            securityId: fromSecurityId, type: 'TICKER', value: newTicker,
            validFrom: input.effectiveOn, validTo: null, sourceUrl: input.evidenceUrl,
            sourceVerifiedBy: actorUserId, sourceVerifiedAt: timestamp, createdAt: timestamp,
          })
        }
      } else if (input.kind === 'STOCK_SPLIT') {
        ratio = input.newSharesPerOldShare
        comparable = true
      } else if (input.kind === 'SHARE_CLASS_CONTINUITY') {
        ratio = input.newSharesPerOldShare
        comparable = input.comparable
      }

      if (input.kind === 'DELISTING') {
        if (from.status === 'DELISTED' && !superseded) return { kind: 'already-delisted' as const }
        await tx.update(institutionalSecurities).set({ status: 'DELISTED', updatedAt: timestamp }).where(eq(institutionalSecurities.id, fromSecurityId))
      }
      if (superseded?.kind === 'DELISTING' && input.kind === 'DELISTING') {
        await tx.update(institutionalSecurities).set({ status: 'DELISTED', updatedAt: timestamp }).where(eq(institutionalSecurities.id, fromSecurityId))
      }

      const [event] = await tx.insert(institutionalSecurityIdentityEvents).values({
        kind: input.kind, fromSecurityId, toSecurityId, effectiveOn: input.effectiveOn,
        newTicker, newSharesPerOldShare: ratio, comparable, reason: input.reason,
        evidenceUrl: input.evidenceUrl, actorUserId, verifiedAt: timestamp, createdAt: timestamp,
        supersedesEventId: superseded?.id ?? null,
      }).returning()
      return { kind: 'created' as const, event: event! }
    })
    if (created.kind === 'from-not-found') return fail(404, 'SYS_NOT_FOUND', 'Security not found')
    if (created.kind === 'to-not-found') return fail(404, 'SYS_NOT_FOUND', 'Related security not found')
    if (created.kind === 'invalid-related-security') return fail(400, 'SYS_VALIDATION_ERROR', 'Related security must differ from the source security')
    if (created.kind === 'invalid-supersession') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'Superseded event must be an unsuperseded event of the same kind for this security')
    if (created.kind === 'already-superseded') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'Identity event already has a correction')
    if (created.kind === 'earlier-correction') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'A correction cannot move the effective date earlier than the recorded event')
    if (created.kind === 'not-latest-ticker-event') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'Only the latest active ticker event can be corrected')
    if (created.kind === 'ticker-date-conflict') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'A second ticker change cannot start on the same date without superseding the existing event')
    if (created.kind === 'security-inactive') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'A delisted security cannot change ticker')
    if (created.kind === 'same-ticker') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'New ticker must differ from the current ticker')
    if (created.kind === 'already-delisted') return fail(409, 'INSTITUTIONAL_IDENTITY_CONFLICT', 'Security is already delisted; supersede the prior delisting to correct it')
    return context.json(adminInstitutionalIdentityEventResponseSchema.parse({ data: serializeIdentityEvent(created.event) }), 201)
  })
}

function serializeIdentityEvent(event: typeof institutionalSecurityIdentityEvents.$inferSelect) {
  return {
    id: event.id.toString(), kind: event.kind, fromSecurityId: event.fromSecurityId.toString(),
    toSecurityId: event.toSecurityId?.toString() ?? null, effectiveOn: event.effectiveOn,
    newTicker: event.newTicker, newSharesPerOldShare: event.newSharesPerOldShare,
    comparable: event.comparable, reason: event.reason, evidenceUrl: event.evidenceUrl,
    actorUserId: event.actorUserId.toString(), verifiedAt: instant(event.verifiedAt),
    createdAt: instant(event.createdAt), supersedesEventId: event.supersedesEventId?.toString() ?? null,
  }
}

function serializeRefreshJob(
  job: typeof institutionalSecurityMappingRefreshJobs.$inferSelect,
  lastBatchProcessed: number,
) {
  return {
    id: job.id.toString(), securityId: job.securityId.toString(), status: job.status,
    lastFilingId: job.lastFilingId > 0n ? job.lastFilingId.toString() : null,
    processedFilingCount: job.processedFilingCount, lastBatchProcessed,
    lastError: job.lastError, updatedAt: instant(job.updatedAt),
    completedAt: job.completedAt ? instant(job.completedAt) : null,
  }
}
