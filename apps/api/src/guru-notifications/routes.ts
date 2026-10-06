import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import {
  diaryGuruSnapshotCreateRequestSchema,
  diaryGuruSnapshotListResponseSchema,
  diaryGuruSnapshotResponseSchema,
  guruNotificationListQuerySchema,
  guruNotificationListResponseSchema,
  guruNotificationPreferencesResponseSchema,
  guruNotificationPreferencesUpdateSchema,
  guruNotificationReadRequestSchema,
  guruNotificationReadResponseSchema,
  guruStockWatchResponseSchema,
  serializedIdSchema,
  type ErrorCode,
  type GuruDecisionContext,
} from '@diary/contracts'
import {
  diaries,
  diaryGuruSnapshots,
  guruFollowers,
  guruNotificationPreferences,
  guruNotifications,
  guruStockWatches,
  gurus,
  institutionalSecurities,
  institutionalSecurityIdentifiers,
  users,
  type Database,
} from '@diary/db'
import type { AppEnv } from '../app-context.js'
import { buildGuruDecisionContext, resolveGuruSymbol } from './context.js'

type Dependencies = {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}

type NotificationRow = typeof guruNotifications.$inferSelect

const defaults = {
  newFiling: true, newPosition: true, exitedPosition: true, strongAdd: true, strongReduce: true,
  newStockHolder: true, consensusChange: false, minWeightPercent: null, minQuantityChangePercent: null,
}

function text(value: unknown): string | null { return typeof value === 'string' ? value : null }
function decimal(value: unknown): string | null { return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null }
function counted(value: unknown): number | null { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null }
function classification(value: unknown) {
  return value === 'ACCUMULATION' || value === 'NEUTRAL' || value === 'DISTRIBUTION' ? value : null
}

export function registerGuruNotificationRoutes(app: Hono<AppEnv>, dependencies: Dependencies) {
  const { db, now, fail, validationError, parseJson } = dependencies

  const requireMember = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    return user.id
  }

  const requireSymbol = (context: Context<AppEnv>) => {
    const symbol = (context.req.param('symbol') ?? '').toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) return fail(400, 'SYS_VALIDATION_ERROR', 'Invalid stock symbol')
    return symbol
  }

  async function securityFor(symbol: string) {
    const resolved = await resolveGuruSymbol(db, symbol, now().toISOString().slice(0, 10))
    if (resolved.securityId === null) {
      return fail(404, 'GURU_ANALYSIS_UNAVAILABLE', resolved.status === 'AMBIGUOUS'
        ? 'This ticker maps to more than one tracked security'
        : 'This ticker is not mapped to a tracked security')
    }
    return resolved.securityId
  }

  async function unreadCount(userId: bigint) {
    const [row] = await db.select({ count: count() }).from(guruNotifications)
      .where(and(eq(guruNotifications.userId, userId), isNull(guruNotifications.readAt)))
    return Number(row?.count ?? 0)
  }

  async function readPreferences(userId: bigint) {
    const [preference] = await db.select().from(guruNotificationPreferences).where(eq(guruNotificationPreferences.userId, userId)).limit(1)
    const followed = await db.select({ slug: gurus.slug, name: gurus.name }).from(guruFollowers)
      .innerJoin(gurus, eq(gurus.id, guruFollowers.guruId))
      .where(and(eq(guruFollowers.userId, userId), eq(gurus.active, true)))
      .orderBy(asc(gurus.name))
    const watched = await db.select({
      securityId: guruStockWatches.securityId,
      company: institutionalSecurities.issuer,
      symbol: institutionalSecurityIdentifiers.value,
    }).from(guruStockWatches)
      .innerJoin(institutionalSecurities, eq(institutionalSecurities.id, guruStockWatches.securityId))
      .leftJoin(institutionalSecurityIdentifiers, and(
        eq(institutionalSecurityIdentifiers.securityId, guruStockWatches.securityId),
        eq(institutionalSecurityIdentifiers.type, 'TICKER'),
        isNull(institutionalSecurityIdentifiers.validTo),
      ))
      .where(eq(guruStockWatches.userId, userId))
      .orderBy(asc(institutionalSecurities.issuer))
    const seen = new Set<string>()
    return guruNotificationPreferencesResponseSchema.parse({
      data: {
        preferences: {
          newFiling: preference?.newFiling ?? defaults.newFiling,
          newPosition: preference?.newPosition ?? defaults.newPosition,
          exitedPosition: preference?.exitedPosition ?? defaults.exitedPosition,
          strongAdd: preference?.strongAdd ?? defaults.strongAdd,
          strongReduce: preference?.strongReduce ?? defaults.strongReduce,
          newStockHolder: preference?.newStockHolder ?? defaults.newStockHolder,
          consensusChange: preference?.consensusChange ?? defaults.consensusChange,
          minWeightPercent: preference?.minWeightPercent ?? null,
          minQuantityChangePercent: preference?.minQuantityChangePercent ?? null,
        },
        followedGurus: followed,
        watchedStocks: watched.flatMap(row => {
          const key = row.securityId.toString()
          if (seen.has(key)) return []
          seen.add(key)
          return [{ securityId: key, symbol: row.symbol, company: row.company }]
        }),
      },
    })
  }

  app.get('/api/gurus/notifications/preferences', async context => {
    return context.json(await readPreferences(await requireMember(context)))
  })

  app.put('/api/gurus/notifications/preferences', async context => {
    const userId = await requireMember(context)
    const input = await parseJson(context, guruNotificationPreferencesUpdateSchema)
    const timestamp = now()
    await db.insert(guruNotificationPreferences).values({ userId, ...input, updatedAt: timestamp })
      .onConflictDoUpdate({ target: guruNotificationPreferences.userId, set: { ...input, updatedAt: timestamp } })
    return context.json(await readPreferences(userId))
  })

  app.get('/api/gurus/notifications', async context => {
    const userId = await requireMember(context)
    const parsed = guruNotificationListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const rows = await db.select({ notification: guruNotifications, guru: gurus }).from(guruNotifications)
      .leftJoin(gurus, eq(gurus.id, guruNotifications.guruId))
      .where(and(
        eq(guruNotifications.userId, userId),
        parsed.data.unreadOnly === 'true' ? isNull(guruNotifications.readAt) : undefined,
      ))
      .orderBy(desc(guruNotifications.createdAt), desc(guruNotifications.id)).limit(parsed.data.limit)
    return context.json(guruNotificationListResponseSchema.parse({
      data: rows.map(({ notification, guru }) => serialize(notification, guru)),
      unreadCount: await unreadCount(userId),
    }))
  })

  function serialize(row: NotificationRow, guru: typeof gurus.$inferSelect | null) {
    const payload = row.payload
    return {
      id: row.id.toString(),
      eventType: row.eventType,
      guru: guru ? { slug: guru.slug, name: guru.name } : null,
      symbol: text(payload.ticker),
      company: text(payload.company),
      periodEnd: row.periodEnd,
      detail: {
        action: text(payload.action),
        quantityChangePercent: decimal(payload.quantityChangePercent),
        weightPercent: decimal(payload.weightPercent),
        holderCount: counted(payload.holderCount),
        previousHolderCount: counted(payload.previousHolderCount),
        classification: classification(payload.classification),
        previousClassification: classification(payload.previousClassification),
        accession: text(payload.accession),
        sourceUrl: text(payload.sourceUrl),
      },
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    }
  }

  app.post('/api/gurus/notifications/read', async context => {
    const userId = await requireMember(context)
    const input = await parseJson(context, guruNotificationReadRequestSchema)
    const timestamp = now()
    const updated = await db.update(guruNotifications).set({ readAt: timestamp }).where(and(
      eq(guruNotifications.userId, userId), isNull(guruNotifications.readAt),
      input.ids?.length ? inArray(guruNotifications.id, input.ids.map(value => BigInt(value))) : undefined,
    )).returning({ id: guruNotifications.id })
    return context.json(guruNotificationReadResponseSchema.parse({
      data: { updated: updated.length, unreadCount: await unreadCount(userId) },
    }))
  })

  async function mutateWatch(context: Context<AppEnv>, watching: boolean) {
    const userId = await requireMember(context)
    const symbol = requireSymbol(context)
    const securityId = await securityFor(symbol)
    if (watching) await db.insert(guruStockWatches).values({ userId, securityId, createdAt: now() }).onConflictDoNothing()
    else await db.delete(guruStockWatches).where(and(eq(guruStockWatches.userId, userId), eq(guruStockWatches.securityId, securityId)))
    return context.json(guruStockWatchResponseSchema.parse({ data: { watching, symbol, securityId: securityId.toString() } }))
  }

  app.put('/api/stocks/:symbol/guru-watch', context => mutateWatch(context, true))
  app.delete('/api/stocks/:symbol/guru-watch', context => mutateWatch(context, false))

  app.get('/api/stocks/:symbol/guru-watch', async context => {
    const userId = await requireMember(context)
    const symbol = requireSymbol(context)
    const securityId = await securityFor(symbol)
    const [row] = await db.select({ securityId: guruStockWatches.securityId }).from(guruStockWatches)
      .where(and(eq(guruStockWatches.userId, userId), eq(guruStockWatches.securityId, securityId))).limit(1)
    return context.json(guruStockWatchResponseSchema.parse({ data: { watching: Boolean(row), symbol, securityId: securityId.toString() } }))
  })

  const parseDiaryId = (context: Context<AppEnv>) => {
    const parsed = serializedIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }

  async function ownedDiary(context: Context<AppEnv>, userId: bigint) {
    const [diary] = await db.select({ id: diaries.id }).from(diaries).where(and(
      eq(diaries.id, parseDiaryId(context)), eq(diaries.userId, userId),
    )).limit(1)
    if (!diary) return fail(404, 'DIARY_NOT_FOUND', 'Diary not found')
    return diary.id
  }

  function serializeSnapshot(row: typeof diaryGuruSnapshots.$inferSelect) {
    return {
      id: row.id.toString(), diaryId: row.diaryId.toString(), symbol: row.symbol, periodEnd: row.periodEnd,
      holderCount: row.holderCount, contextVersion: row.contextVersion, consensusVersion: row.consensusVersion,
      capturedAt: row.capturedAt.toISOString(), context: row.snapshot as unknown as GuruDecisionContext,
    }
  }

  app.get('/api/diaries/:id/guru-snapshots', async context => {
    const userId = await requireMember(context)
    const diaryId = await ownedDiary(context, userId)
    const rows = await db.select().from(diaryGuruSnapshots).where(and(
      eq(diaryGuruSnapshots.diaryId, diaryId), eq(diaryGuruSnapshots.userId, userId),
    )).orderBy(desc(diaryGuruSnapshots.id))
    return context.json(diaryGuruSnapshotListResponseSchema.parse({ data: rows.map(serializeSnapshot) }))
  })

  /** Capture what the author saw. The row is never updated by a later rebuild. */
  app.post('/api/diaries/:id/guru-snapshots', async context => {
    const userId = await requireMember(context)
    const diaryId = await ownedDiary(context, userId)
    const input = await parseJson(context, diaryGuruSnapshotCreateRequestSchema)
    const symbol = input.symbol.toUpperCase()
    const resolved = await resolveGuruSymbol(db, symbol, now().toISOString().slice(0, 10))
    if (resolved.securityId === null) return fail(404, 'GURU_ANALYSIS_UNAVAILABLE', 'This ticker is not mapped to one tracked security')
    const built = await buildGuruDecisionContext(db, { securityId: resolved.securityId, symbol, ...(input.periodEnd ? { periodEnd: input.periodEnd } : {}) })
    if (!built) return fail(409, 'GURU_ANALYSIS_UNAVAILABLE', 'No prepared Guru quarter is available for this stock yet')
    const [existing] = await db.select().from(diaryGuruSnapshots).where(and(
      eq(diaryGuruSnapshots.diaryId, diaryId), eq(diaryGuruSnapshots.securityId, resolved.securityId),
      eq(diaryGuruSnapshots.periodEnd, built.context.periodEnd),
    )).limit(1)
    if (existing) return context.json(diaryGuruSnapshotResponseSchema.parse({ data: serializeSnapshot(existing), reused: true }))
    const [row] = await db.insert(diaryGuruSnapshots).values({
      diaryId, userId, securityId: resolved.securityId, symbol, periodEnd: built.context.periodEnd,
      contextVersion: built.context.contextVersion, consensusVersion: built.consensusVersion,
      consensusSnapshotId: built.consensusSnapshotId, holderCount: built.context.consensus?.holderCount ?? built.context.holders.length,
      snapshot: built.context as unknown as Record<string, unknown>, capturedAt: now(),
    }).returning()
    return context.json(diaryGuruSnapshotResponseSchema.parse({ data: serializeSnapshot(row!), reused: false }), 201)
  })
}
