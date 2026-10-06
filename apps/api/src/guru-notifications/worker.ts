import { and, asc, desc, eq, inArray, isNull, lte, lt, or, sql } from 'drizzle-orm'
import {
  guruConsensusSnapshots,
  guruFollowers,
  guruHoldingChanges,
  guruNotificationConsensusDeliveries,
  guruNotificationEventDeliveries,
  guruNotificationPreferences,
  guruNotifications,
  guruQuarterAnalytics,
  guruStockConsensus,
  guruStockWatches,
  gurus,
  institutionalFilings,
  institutionalSnapshotChangeEvents,
  type Database,
  type DatabaseTx,
} from '@diary/db'

const EVENT_LOCK = 'guru-notification-event-consumer'
const CONSENSUS_LOCK = 'guru-notification-consensus-consumer'
const FAILURE_BACKOFF_MS = 60_000
const MOVES_PER_EVENT = 50

type EventType = 'NEW_FILING' | 'NEW_POSITION' | 'EXITED_POSITION' | 'STRONG_ADD' | 'STRONG_REDUCE' | 'NEW_STOCK_HOLDER' | 'CONSENSUS_CHANGE'
type Preference = typeof guruNotificationPreferences.$inferSelect

const defaults = {
  newFiling: true, newPosition: true, exitedPosition: true, strongAdd: true, strongReduce: true,
  newStockHolder: true, consensusChange: false, minWeightPercent: null, minQuantityChangePercent: null,
}

function enabled(preference: Preference | undefined, eventType: EventType): boolean {
  const row = preference ?? defaults
  switch (eventType) {
    case 'NEW_FILING': return row.newFiling
    case 'NEW_POSITION': return row.newPosition
    case 'EXITED_POSITION': return row.exitedPosition
    case 'STRONG_ADD': return row.strongAdd
    case 'STRONG_REDUCE': return row.strongReduce
    case 'NEW_STOCK_HOLDER': return row.newStockHolder
    case 'CONSENSUS_CHANGE': return row.consensusChange
  }
}

/** A move is meaningful when it clears both configured thresholds. */
function meaningful(preference: Preference | undefined, input: { weightPercent: string | null; quantityChangePercent: string | null }) {
  const minWeight = preference?.minWeightPercent ?? null
  const minChange = preference?.minQuantityChangePercent ?? null
  if (minWeight !== null) {
    if (input.weightPercent === null || Math.abs(Number(input.weightPercent)) < Number(minWeight)) return false
  }
  if (minChange !== null) {
    if (input.quantityChangePercent === null || Math.abs(Number(input.quantityChangePercent)) < Number(minChange)) return false
  }
  return true
}

function actionEvent(action: string): EventType | null {
  if (action === 'NEW') return 'NEW_POSITION'
  if (action === 'EXIT') return 'EXITED_POSITION'
  if (action === 'STRONG_ADD') return 'STRONG_ADD'
  if (action === 'STRONG_REDUCE') return 'STRONG_REDUCE'
  return null
}

async function preferencesFor(tx: DatabaseTx, userIds: readonly bigint[]) {
  if (!userIds.length) return new Map<string, Preference>()
  const rows = await tx.select().from(guruNotificationPreferences).where(inArray(guruNotificationPreferences.userId, userIds))
  return new Map(rows.map(row => [row.userId.toString(), row]))
}

/** Insert is conditional on the per-user dedupe key, so retries cannot duplicate. */
async function deliver(tx: DatabaseTx, rows: readonly (typeof guruNotifications.$inferInsert)[]) {
  let delivered = 0
  for (let offset = 0; offset < rows.length; offset += 100) {
    const inserted = await tx.insert(guruNotifications).values(rows.slice(offset, offset + 100))
      .onConflictDoNothing({ target: [guruNotifications.userId, guruNotifications.dedupeKey] })
      .returning({ id: guruNotifications.id })
    delivered += inserted.length
  }
  return delivered
}

export async function runPendingGuruFollowNotificationsOnce(db: Database, now = new Date()) {
  let attemptedEventId: bigint | undefined
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${EVENT_LOCK}, 0))`)
      const [event] = await tx.select({
        id: institutionalSnapshotChangeEvents.id,
        managerId: institutionalSnapshotChangeEvents.managerId,
        periodEnd: institutionalSnapshotChangeEvents.periodEnd,
      }).from(institutionalSnapshotChangeEvents)
        .leftJoin(guruNotificationEventDeliveries, eq(guruNotificationEventDeliveries.eventId, institutionalSnapshotChangeEvents.id))
        .where(and(
          isNull(guruNotificationEventDeliveries.processedAt),
          or(isNull(guruNotificationEventDeliveries.eventId), lte(guruNotificationEventDeliveries.nextAttemptAt, now)),
        )).orderBy(asc(institutionalSnapshotChangeEvents.id)).limit(1)
      if (!event) return undefined
      attemptedEventId = event.id
      const [guru] = await tx.select().from(gurus).where(and(eq(gurus.managerId, event.managerId), eq(gurus.active, true))).limit(1)
      let delivered = 0
      if (guru) {
        const followers = await tx.select({ userId: guruFollowers.userId }).from(guruFollowers).where(eq(guruFollowers.guruId, guru.id))
        const userIds = followers.map(row => row.userId)
        const preferences = await preferencesFor(tx, userIds)
        const [filing] = await tx.select().from(institutionalFilings).where(and(
          eq(institutionalFilings.managerId, event.managerId), eq(institutionalFilings.periodEnd, event.periodEnd),
        )).orderBy(desc(institutionalFilings.filedAt), desc(institutionalFilings.id)).limit(1)
        const [analytics] = await tx.select().from(guruQuarterAnalytics).where(and(
          eq(guruQuarterAnalytics.managerId, event.managerId), eq(guruQuarterAnalytics.periodEnd, event.periodEnd),
          eq(guruQuarterAnalytics.status, 'READY'),
        )).orderBy(desc(guruQuarterAnalytics.calculatedAt), desc(guruQuarterAnalytics.id)).limit(1)
        const moves = analytics
          ? (await tx.select().from(guruHoldingChanges).where(eq(guruHoldingChanges.analyticsId, analytics.id)))
            .filter(change => actionEvent(change.action) !== null).slice(0, MOVES_PER_EVENT)
          : []
        const rows: (typeof guruNotifications.$inferInsert)[] = []
        for (const userId of userIds) {
          const preference = preferences.get(userId.toString())
          if (filing && enabled(preference, 'NEW_FILING')) {
            rows.push({
              userId, eventType: 'NEW_FILING', dedupeKey: `filing:${filing.id}`, guruId: guru.id,
              securityId: null, periodEnd: event.periodEnd, createdAt: now,
              payload: { accession: filing.accession, form: filing.form, sourceUrl: filing.sourceUrl },
            })
          }
          for (const change of moves) {
            const eventType = actionEvent(change.action)!
            if (!enabled(preference, eventType)) continue
            if (!meaningful(preference, { weightPercent: change.currentWeightPercent ?? change.previousWeightPercent, quantityChangePercent: change.quantityChangePercent })) continue
            rows.push({
              userId, eventType, dedupeKey: `change:${change.analyticsId}:${change.positionKey}:${change.action}`,
              guruId: guru.id, securityId: change.securityId, periodEnd: event.periodEnd, createdAt: now,
              payload: {
                action: change.action, ticker: change.ticker, company: change.company,
                quantityChangePercent: change.quantityChangePercent,
                weightPercent: change.currentWeightPercent ?? change.previousWeightPercent,
              },
            })
          }
        }
        delivered = await deliver(tx, rows)
      }
      await tx.insert(guruNotificationEventDeliveries).values({ eventId: event.id, attemptCount: 0, nextAttemptAt: now, processedAt: now, lastError: null })
        .onConflictDoUpdate({ target: guruNotificationEventDeliveries.eventId, set: { nextAttemptAt: now, processedAt: now, lastError: null } })
      return { eventId: event.id, managerId: event.managerId, periodEnd: event.periodEnd, delivered, status: 'PROCESSED' as const }
    })
  } catch (error) {
    if (attemptedEventId === undefined) throw error
    await recordFailure(db, { table: 'event', id: attemptedEventId, now })
    return { eventId: attemptedEventId, status: 'ERROR' as const }
  }
}

export async function runPendingGuruStockNotificationsOnce(db: Database, now = new Date()) {
  let attemptedSnapshotId: bigint | undefined
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${CONSENSUS_LOCK}, 0))`)
      const [snapshot] = await tx.select({ id: guruConsensusSnapshots.id, periodEnd: guruConsensusSnapshots.periodEnd })
        .from(guruConsensusSnapshots)
        .leftJoin(guruNotificationConsensusDeliveries, eq(guruNotificationConsensusDeliveries.snapshotId, guruConsensusSnapshots.id))
        .where(and(
          isNull(guruNotificationConsensusDeliveries.processedAt),
          or(isNull(guruNotificationConsensusDeliveries.snapshotId), lte(guruNotificationConsensusDeliveries.nextAttemptAt, now)),
        )).orderBy(asc(guruConsensusSnapshots.id)).limit(1)
      if (!snapshot) return undefined
      attemptedSnapshotId = snapshot.id
      const watches = await tx.select({ userId: guruStockWatches.userId, securityId: guruStockWatches.securityId }).from(guruStockWatches)
      let delivered = 0
      if (watches.length) {
        const securityIds = [...new Set(watches.map(row => row.securityId))]
        const stocks = await tx.select().from(guruStockConsensus).where(and(
          eq(guruStockConsensus.snapshotId, snapshot.id), inArray(guruStockConsensus.securityId, securityIds),
        ))
        const [previous] = await tx.select({ id: guruConsensusSnapshots.id }).from(guruConsensusSnapshots)
          .where(lt(guruConsensusSnapshots.periodEnd, snapshot.periodEnd))
          .orderBy(desc(guruConsensusSnapshots.periodEnd), desc(guruConsensusSnapshots.id)).limit(1)
        const priorStocks = previous ? await tx.select().from(guruStockConsensus).where(and(
          eq(guruStockConsensus.snapshotId, previous.id), inArray(guruStockConsensus.securityId, securityIds),
        )) : []
        const priorBySecurity = new Map(priorStocks.map(row => [row.securityId.toString(), row]))
        const stockBySecurity = new Map(stocks.map(row => [row.securityId.toString(), row]))
        const preferences = await preferencesFor(tx, [...new Set(watches.map(row => row.userId))])
        const rows: (typeof guruNotifications.$inferInsert)[] = []
        for (const watch of watches) {
          const stock = stockBySecurity.get(watch.securityId.toString())
          if (!stock) continue
          const preference = preferences.get(watch.userId.toString())
          const prior = priorBySecurity.get(watch.securityId.toString())
          if (stock.newBuyerCount > 0 && enabled(preference, 'NEW_STOCK_HOLDER')) {
            rows.push({
              userId: watch.userId, eventType: 'NEW_STOCK_HOLDER', dedupeKey: `stock-holders:${snapshot.id}:${watch.securityId}`,
              guruId: null, securityId: watch.securityId, periodEnd: snapshot.periodEnd, createdAt: now,
              payload: {
                ticker: stock.ticker, company: stock.company, holderCount: stock.currentHolderCount,
                previousHolderCount: stock.previousHolderCount, newBuyerCount: stock.newBuyerCount,
              },
            })
          }
          if (prior && stock.classification !== null && stock.classification !== prior.classification && enabled(preference, 'CONSENSUS_CHANGE')) {
            rows.push({
              userId: watch.userId, eventType: 'CONSENSUS_CHANGE', dedupeKey: `consensus:${snapshot.id}:${watch.securityId}`,
              guruId: null, securityId: watch.securityId, periodEnd: snapshot.periodEnd, createdAt: now,
              payload: {
                ticker: stock.ticker, company: stock.company, classification: stock.classification,
                previousClassification: prior.classification, holderCount: stock.currentHolderCount,
              },
            })
          }
        }
        delivered = await deliver(tx, rows)
      }
      await tx.insert(guruNotificationConsensusDeliveries).values({ snapshotId: snapshot.id, attemptCount: 0, nextAttemptAt: now, processedAt: now, lastError: null })
        .onConflictDoUpdate({ target: guruNotificationConsensusDeliveries.snapshotId, set: { nextAttemptAt: now, processedAt: now, lastError: null } })
      return { snapshotId: snapshot.id, periodEnd: snapshot.periodEnd, delivered, status: 'PROCESSED' as const }
    })
  } catch (error) {
    if (attemptedSnapshotId === undefined) throw error
    await recordFailure(db, { table: 'consensus', id: attemptedSnapshotId, now })
    return { snapshotId: attemptedSnapshotId, status: 'ERROR' as const }
  }
}

async function recordFailure(db: Database, input: { table: 'event' | 'consensus'; id: bigint; now: Date }) {
  const nextAttemptAt = new Date(input.now.getTime() + FAILURE_BACKOFF_MS)
  const lastError = 'GURU_NOTIFICATION_DELIVERY_FAILED'
  await db.transaction(async tx => {
    if (input.table === 'event') {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${EVENT_LOCK}, 0))`)
      const [previous] = await tx.select({ attemptCount: guruNotificationEventDeliveries.attemptCount }).from(guruNotificationEventDeliveries)
        .where(eq(guruNotificationEventDeliveries.eventId, input.id)).limit(1)
      await tx.insert(guruNotificationEventDeliveries).values({ eventId: input.id, attemptCount: 1, nextAttemptAt, lastError, processedAt: null })
        .onConflictDoUpdate({ target: guruNotificationEventDeliveries.eventId, set: { attemptCount: (previous?.attemptCount ?? 0) + 1, nextAttemptAt, lastError, processedAt: null } })
      return
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${CONSENSUS_LOCK}, 0))`)
    const [previous] = await tx.select({ attemptCount: guruNotificationConsensusDeliveries.attemptCount }).from(guruNotificationConsensusDeliveries)
      .where(eq(guruNotificationConsensusDeliveries.snapshotId, input.id)).limit(1)
    await tx.insert(guruNotificationConsensusDeliveries).values({ snapshotId: input.id, attemptCount: 1, nextAttemptAt, lastError, processedAt: null })
      .onConflictDoUpdate({ target: guruNotificationConsensusDeliveries.snapshotId, set: { attemptCount: (previous?.attemptCount ?? 0) + 1, nextAttemptAt, lastError, processedAt: null } })
  })
}

export async function runGuruNotificationWorker(options: { db: Database; now?: () => Date; intervalMs?: number; signal?: AbortSignal }) {
  const now = options.now ?? (() => new Date())
  const intervalMs = options.intervalMs ?? 5_000
  while (!options.signal?.aborted) {
    const follow = await runPendingGuruFollowNotificationsOnce(options.db, now())
    const stock = await runPendingGuruStockNotificationsOnce(options.db, now())
    if (options.signal?.aborted) break
    if (!follow && !stock) await new Promise<void>(resolve => setTimeout(resolve, intervalMs))
  }
}
