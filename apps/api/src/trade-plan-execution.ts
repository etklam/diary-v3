import {
  tradePlanExecutionBaselineCreateSchema,
  tradePlanExecutionBaselineHistoryQuerySchema,
  tradePlanExecutionBaselineHistoryResponseSchema,
  tradePlanExecutionBaselineSchema,
  tradePlanExecutionCandidatesQuerySchema,
  tradePlanExecutionCandidatesResponseSchema,
  tradePlanExecutionComparisonSchema,
  tradePlanExecutionUpdateSchema,
} from '@diary/contracts/trade-plan-execution'
import {
  tradePlanExecutionBaselines,
  tradePlanExecutionTransactions,
  tradePlanExecutions,
  tradePlans,
  transactions,
  type Database,
} from '@diary/db'
import { calculateTradePlanExecution } from '@diary/domain/trade-plan-execution'
import { and, asc, count, desc, eq, inArray, ne } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import type { AppEnv } from './app-context.js'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type TradePlanRow = typeof tradePlans.$inferSelect
type BaselineRow = typeof tradePlanExecutionBaselines.$inferSelect
type TransactionRow = typeof transactions.$inferSelect

function instant(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

function decimal(value: string | null): string | null {
  if (value === null) return null
  const [whole, fraction = ''] = value.split('.')
  const normalizedWhole = whole!.replace(/^0+(?=\d)/, '')
  const normalizedFraction = fraction.replace(/0+$/, '')
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole
}

function sameDecimal(left: string, right: string) {
  return decimal(left) === decimal(right)
}

function serializeBaseline(row: BaselineRow) {
  return tradePlanExecutionBaselineSchema.parse({
    id: row.id.toString(),
    version: row.version,
    confirmedAt: instant(row.confirmedAt),
    planUpdatedAt: instant(row.planUpdatedAt),
    snapshot: {
      symbol: row.symbol,
      setupType: row.setupType,
      entryPrice: decimal(row.entryPrice),
      entryZoneLow: decimal(row.entryZoneLow),
      entryZoneHigh: decimal(row.entryZoneHigh),
      stopLoss: decimal(row.stopLoss),
      targetPrice: decimal(row.targetPrice),
      maxPositionSize: decimal(row.maxPositionSize),
      maxPositionSizeUnit: 'unknown',
      invalidationCondition: row.invalidationCondition,
    },
  })
}

function transactionView(row: TransactionRow) {
  return {
    id: row.id.toString(),
    diaryId: row.diaryId.toString(),
    symbol: row.symbol,
    type: row.type,
    quantity: decimal(row.quantity)!,
    price: decimal(row.price)!,
    tradeDate: instant(row.tradeDate),
  }
}

function transactionChanged(row: TransactionRow, relation: typeof tradePlanExecutionTransactions.$inferSelect) {
  return row.symbol !== relation.snapshotSymbol
    || row.type !== relation.snapshotType
    || !sameDecimal(row.quantity, relation.snapshotQuantity)
    || !sameDecimal(row.price, relation.snapshotPrice)
    || row.tradeDate.getTime() !== relation.snapshotTradeDate.getTime()
}

function snapshotView(relation: typeof tradePlanExecutionTransactions.$inferSelect) {
  return {
    id: relation.snapshotTransactionId.toString(),
    diaryId: relation.snapshotDiaryId.toString(),
    symbol: relation.snapshotSymbol,
    type: relation.snapshotType,
    quantity: decimal(relation.snapshotQuantity)!,
    price: decimal(relation.snapshotPrice)!,
    tradeDate: instant(relation.snapshotTradeDate),
  }
}

function relationView(
  relation: typeof tradePlanExecutionTransactions.$inferSelect,
  row: TransactionRow | null,
) {
  const snapshot = snapshotView(relation)
  const current = row ? transactionView(row) : null
  const selectionStatus = row === null ? 'missing' : transactionChanged(row, relation) ? 'changed' : 'current'
  return {
    relationId: relation.id.toString(),
    // Keep `id` stable for the UI even after the source transaction is deleted.
    id: row?.id.toString() ?? snapshot.id,
    transactionId: row?.id.toString() ?? null,
    diaryId: row?.diaryId.toString() ?? snapshot.diaryId,
    symbol: row?.symbol ?? snapshot.symbol,
    type: row?.type ?? snapshot.type,
    quantity: row ? decimal(row.quantity)! : snapshot.quantity,
    price: row ? decimal(row.price)! : snapshot.price,
    tradeDate: row ? instant(row.tradeDate) : snapshot.tradeDate,
    selectionStatus,
    snapshot,
    current,
  }
}

function planSnapshot(plan: TradePlanRow) {
  return {
    symbol: plan.symbol,
    setupType: plan.setupType,
    entryPrice: decimal(plan.entryPrice),
    entryZoneLow: decimal(plan.entryZoneLow),
    entryZoneHigh: decimal(plan.entryZoneHigh),
    stopLoss: decimal(plan.stopLoss),
    targetPrice: decimal(plan.targetPrice),
    maxPositionSize: decimal(plan.maxPositionSize),
    maxPositionSizeUnit: 'unknown' as const,
    invalidationCondition: plan.invalidationCondition,
  }
}

async function findPlan(db: Database | DbTransaction, userId: bigint, planId: bigint) {
  const [plan] = await db.select().from(tradePlans)
    .where(and(eq(tradePlans.id, planId), eq(tradePlans.userId, userId))).limit(1)
  return plan
}

export async function readTradePlanExecution(
  db: Database | DbTransaction,
  userId: bigint,
  plan: TradePlanRow,
) {
  const [execution] = await db.select().from(tradePlanExecutions)
    .where(and(eq(tradePlanExecutions.tradePlanId, plan.id), eq(tradePlanExecutions.userId, userId))).limit(1)
  const baselineRows = await db.select().from(tradePlanExecutionBaselines)
    .where(and(eq(tradePlanExecutionBaselines.tradePlanId, plan.id), eq(tradePlanExecutionBaselines.userId, userId)))
    .orderBy(desc(tradePlanExecutionBaselines.version)).limit(20)
  const baselineRow = execution ? baselineRows.find(row => row.id === execution.baselineId) : undefined
  const relations = execution ? await db.select({
    relation: tradePlanExecutionTransactions,
    transaction: transactions,
  }).from(tradePlanExecutionTransactions)
    .leftJoin(transactions, eq(transactions.id, tradePlanExecutionTransactions.transactionId))
    .where(eq(tradePlanExecutionTransactions.executionId, execution.id))
    .orderBy(asc(tradePlanExecutionTransactions.id)) : []

  const baseline = baselineRow ? serializeBaseline(baselineRow) : null
  const baselineHistory = baselineRows.map(serializeBaseline)
  const currentRows = relations.flatMap(row => row.transaction ? [{
    row: row.transaction,
    changed: transactionChanged(row.transaction, row.relation),
  }] : [])
  const invalidatedSelectionCount = relations.filter(({ relation, transaction }) => !transaction || transactionChanged(transaction, relation)).length
  const baselineIsOutdated = baselineRow !== undefined && plan.updatedAt.getTime() > baselineRow.planUpdatedAt.getTime()
  const calculation = calculateTradePlanExecution({
    baseline: baseline?.snapshot ?? null,
    baselineIsOutdated,
    transactions: currentRows.map(({ row }) => ({ type: row.type, quantity: row.quantity, price: row.price })),
  })
  const hasSymbolConflict = relations.some(({ relation, transaction }) =>
    relation.snapshotSymbol !== plan.symbol
    || (transaction !== null && (transaction.symbol !== baseline?.snapshot.symbol || transaction.symbol !== plan.symbol)),
  )
  const hasConflict = invalidatedSelectionCount > 0 || hasSymbolConflict
  const comparisonStatus = hasConflict
    ? 'conflict'
    : calculation.comparisonStatus
  const comparisonTiming = baselineRow === undefined || relations.length === 0
    ? 'unknown'
    : relations.some(({ relation }) => relation.snapshotTradeDate.getTime() < baselineRow.confirmedAt.getTime())
      ? 'retrospective'
      : 'pre_execution'
  return tradePlanExecutionComparisonSchema.parse({
    baseline,
    baselineHistory,
    planSnapshot: planSnapshot(plan),
    executionRevision: execution?.revision ?? null,
    baselineStatus: baseline === null ? 'unconfirmed' : baselineIsOutdated ? 'outdated' : 'current',
    comparisonTiming,
    selectedTransactions: relations.map(({ relation, transaction }) => relationView(relation, transaction)),
    invalidatedSelectionCount,
    deviationReason: execution?.deviationReason ?? null,
    comparisonStatus,
    buyQuantity: hasConflict ? null : calculation.buyQuantity,
    averageExecutionPrice: hasConflict ? null : calculation.averageExecutionPrice,
    entryPriceDelta: hasConflict ? null : calculation.entryPriceDelta,
    entryPriceDeltaPercent: hasConflict ? null : calculation.entryPriceDeltaPercent,
    entryZoneRelation: hasConflict ? 'unavailable' : calculation.entryZoneRelation,
    maxPositionSizeUnit: 'unknown',
  })
}

async function createBaseline(
  db: Database,
  userId: bigint,
  planId: bigint,
  input: z.infer<typeof tradePlanExecutionBaselineCreateSchema>,
  now: Date,
  fail: (status: number, code: ErrorCode, message: string) => never,
) {
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(tradePlans)
      .where(and(eq(tradePlans.id, planId), eq(tradePlans.userId, userId))).limit(1).for('update')
    if (!plan) return fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${planId} not found`)
    if (input.expectedPlanUpdatedAt && instant(plan.updatedAt) !== input.expectedPlanUpdatedAt) {
      fail(409, 'DIARY_REVISION_CONFLICT', 'Trade plan changed; reload before confirming the baseline')
    }
    const [latest] = await tx.select({ version: tradePlanExecutionBaselines.version })
      .from(tradePlanExecutionBaselines)
      .where(and(eq(tradePlanExecutionBaselines.tradePlanId, planId), eq(tradePlanExecutionBaselines.userId, userId)))
      .orderBy(desc(tradePlanExecutionBaselines.version)).limit(1)
    const [execution] = await tx.select().from(tradePlanExecutions)
      .where(and(eq(tradePlanExecutions.tradePlanId, planId), eq(tradePlanExecutions.userId, userId))).limit(1).for('update')
    const expectedBaselineVersion = input.expectedBaselineVersion ?? null
    const expectedExecutionRevision = input.expectedExecutionRevision ?? null
    if (expectedBaselineVersion !== (latest?.version ?? null) || expectedExecutionRevision !== (execution?.revision ?? null)) {
      fail(409, 'DIARY_REVISION_CONFLICT', 'Execution baseline changed; reload before confirming a new version')
    }
    const [baseline] = await tx.insert(tradePlanExecutionBaselines).values({
      tradePlanId: planId,
      userId,
      version: (latest?.version ?? 0) + 1,
      planUpdatedAt: plan.updatedAt,
      confirmedAt: now,
      symbol: plan.symbol,
      setupType: plan.setupType,
      entryPrice: plan.entryPrice,
      entryZoneLow: plan.entryZoneLow,
      entryZoneHigh: plan.entryZoneHigh,
      stopLoss: plan.stopLoss,
      targetPrice: plan.targetPrice,
      maxPositionSize: plan.maxPositionSize,
      maxPositionSizeUnit: 'unknown',
      invalidationCondition: plan.invalidationCondition,
    }).returning()
    if (!baseline) throw new Error('Trade plan execution baseline insert returned no row')
    if (execution) await tx.update(tradePlanExecutions).set({ baselineId: baseline.id, revision: execution.revision + 1, updatedAt: now }).where(eq(tradePlanExecutions.id, execution.id))
    else await tx.insert(tradePlanExecutions).values({ tradePlanId: planId, userId, baselineId: baseline.id, revision: 1, updatedAt: now })
    return readTradePlanExecution(tx, userId, plan)
  })
}

async function updateExecution(
  db: Database,
  userId: bigint,
  planId: bigint,
  input: z.infer<typeof tradePlanExecutionUpdateSchema>,
  now: Date,
  fail: (status: number, code: ErrorCode, message: string) => never,
) {
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(tradePlans)
      .where(and(eq(tradePlans.id, planId), eq(tradePlans.userId, userId))).limit(1).for('update')
    if (!plan) return fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${planId} not found`)
    const [execution] = await tx.select().from(tradePlanExecutions)
      .where(and(eq(tradePlanExecutions.tradePlanId, planId), eq(tradePlanExecutions.userId, userId))).limit(1).for('update')
    if (!execution || input.baselineVersion === undefined || input.expectedExecutionRevision === undefined) {
      fail(409, 'DIARY_REVISION_CONFLICT', 'Baseline version and execution revision are required; reload before saving')
    }
    if (execution.revision !== input.expectedExecutionRevision) {
      fail(409, 'DIARY_REVISION_CONFLICT', 'Execution selection changed; reload before saving')
    }
    const [baseline] = await tx.select().from(tradePlanExecutionBaselines)
      .where(and(
        eq(tradePlanExecutionBaselines.tradePlanId, planId),
        eq(tradePlanExecutionBaselines.userId, userId),
        eq(tradePlanExecutionBaselines.version, input.baselineVersion),
      )).limit(1)
    if (!baseline || baseline.id !== execution.baselineId) fail(409, 'DIARY_REVISION_CONFLICT', 'The selected baseline is no longer current; reload before saving')
    if (baseline.symbol !== plan.symbol) fail(409, 'DIARY_REVISION_CONFLICT', 'The plan symbol changed; confirm a new baseline first')

    const ids = input.transactionIds.map(value => BigInt(value))
    const selected = ids.length === 0 ? [] : await tx.select().from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids))).for('update')
    if (selected.length !== ids.length) fail(404, 'TRADE_PLAN_NOT_FOUND', 'One or more selected transactions were not found')
    if (selected.some(row => row.symbol !== plan.symbol)) fail(409, 'DIARY_REVISION_CONFLICT', 'Selected transactions must use the plan symbol')

    const executionId = execution.id
    await tx.update(tradePlanExecutions).set({ revision: execution.revision + 1, deviationReason: input.deviationReason ?? null, updatedAt: now }).where(eq(tradePlanExecutions.id, executionId))

    const conflicting = ids.length === 0 ? [] : await tx.select({ executionId: tradePlanExecutionTransactions.executionId })
      .from(tradePlanExecutionTransactions)
      .where(and(inArray(tradePlanExecutionTransactions.transactionId, ids), ne(tradePlanExecutionTransactions.executionId, executionId)))
    if (conflicting.length > 0) fail(409, 'DIARY_REVISION_CONFLICT', 'A selected transaction is already linked to another plan')
    const existingRelations = await tx.select().from(tradePlanExecutionTransactions)
      .where(eq(tradePlanExecutionTransactions.executionId, executionId))
    const selectedIdSet = new Set(ids.map(id => id.toString()))
    const requestedRelationRemoval = new Set((input.removeRelationIds ?? []).map(id => id.toString()))
    const contradictoryRemovals = existingRelations.filter(relation =>
      requestedRelationRemoval.has(relation.id.toString())
      && relation.transactionId !== null
      && selectedIdSet.has(relation.transactionId.toString()),
    )
    if (contradictoryRemovals.length > 0) fail(409, 'DIARY_REVISION_CONFLICT', 'A relation cannot be removed while retaining its transaction')
    const removedRelationIds = existingRelations
      .filter(relation => requestedRelationRemoval.has(relation.id.toString()) || (relation.transactionId !== null && !selectedIdSet.has(relation.transactionId.toString())))
      .map(relation => relation.id)
    const removedRelationIdSet = new Set(removedRelationIds.map(id => id.toString()))
    const retainedIds = new Set(existingRelations.flatMap(relation => removedRelationIdSet.has(relation.id.toString()) || relation.transactionId === null ? [] : [relation.transactionId.toString()]))
    const retainedCount = existingRelations.length - removedRelationIds.length
    const added = selected.filter(row => !retainedIds.has(row.id.toString()))
    if (retainedCount + added.length > 100) fail(409, 'DIARY_REVISION_CONFLICT', 'Execution selection cannot contain more than 100 retained transactions')
    if (removedRelationIds.length > 0) await tx.delete(tradePlanExecutionTransactions).where(inArray(tradePlanExecutionTransactions.id, removedRelationIds))
    if (added.length > 0) await tx.insert(tradePlanExecutionTransactions).values(added.map(row => ({
      executionId,
      transactionId: row.id,
      snapshotTransactionId: row.id,
      snapshotDiaryId: row.diaryId,
      snapshotSymbol: row.symbol,
      snapshotType: row.type,
      snapshotQuantity: row.quantity,
      snapshotPrice: row.price,
      snapshotTradeDate: row.tradeDate,
    })))
    return readTradePlanExecution(tx, userId, plan)
  })
}

export function registerTradePlanExecutionRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const ownerAndId = (context: Context<AppEnv>) => {
    const user = context.get('user')
    if (!user) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const id = serializedIdSchema.safeParse(context.req.param('id'))
    if (!id.success) return validationError(id.error)
    return { userId: BigInt(user.id), planId: BigInt(id.data) }
  }

  app.get('/api/trade-plans/:id/execution', async context => {
    const { userId, planId } = ownerAndId(context)
    return context.json(await db.transaction(async tx => {
      const plan = await findPlan(tx, userId, planId)
      if (!plan) return fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${planId} not found`)
      return readTradePlanExecution(tx, userId, plan)
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' }))
  })

  app.post('/api/trade-plans/:id/execution-baseline', async context => {
    const { userId, planId } = ownerAndId(context)
    const input = await parseJson(context, tradePlanExecutionBaselineCreateSchema)
    return context.json(await createBaseline(db, userId, planId, input, now(), fail))
  })

  app.put('/api/trade-plans/:id/execution', async context => {
    const { userId, planId } = ownerAndId(context)
    const input = await parseJson(context, tradePlanExecutionUpdateSchema)
    return context.json(await updateExecution(db, userId, planId, input, now(), fail))
  })

  app.get('/api/trade-plans/:id/execution-candidates', async context => {
    const { userId, planId } = ownerAndId(context)
    const query = tradePlanExecutionCandidatesQuerySchema.safeParse(context.req.query())
    if (!query.success) return validationError(query.error)
    const plan = await findPlan(db, userId, planId)
    if (!plan) return fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${planId} not found`)
    const where = and(eq(transactions.userId, userId), eq(transactions.symbol, plan.symbol))
    return context.json(await db.transaction(async tx => {
      const [totalRow] = await tx.select({ total: count() }).from(transactions).where(where)
      const total = totalRow!.total
      const totalPages = Math.ceil(total / query.data.limit)
      const rows = query.data.page > totalPages ? [] : await tx.select({
        transaction: transactions,
        linkedPlanId: tradePlanExecutions.tradePlanId,
      }).from(transactions)
        .leftJoin(tradePlanExecutionTransactions, eq(tradePlanExecutionTransactions.transactionId, transactions.id))
        .leftJoin(tradePlanExecutions, eq(tradePlanExecutions.id, tradePlanExecutionTransactions.executionId))
        .where(where).orderBy(desc(transactions.tradeDate), desc(transactions.id))
        .limit(query.data.limit).offset((query.data.page - 1) * query.data.limit)
      return tradePlanExecutionCandidatesResponseSchema.parse({
        data: rows.map(row => ({ ...transactionView(row.transaction), linkedPlanId: row.linkedPlanId?.toString() ?? null })),
        pagination: { page: query.data.page, limit: query.data.limit, total, totalPages },
      })
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' }))
  })

  app.get('/api/trade-plans/:id/execution-baselines', async context => {
    const { userId, planId } = ownerAndId(context)
    const query = tradePlanExecutionBaselineHistoryQuerySchema.safeParse(context.req.query())
    if (!query.success) return validationError(query.error)
    const plan = await findPlan(db, userId, planId)
    if (!plan) return fail(404, 'TRADE_PLAN_NOT_FOUND', `Trade plan ${planId} not found`)
    return context.json(await db.transaction(async tx => {
      const where = and(eq(tradePlanExecutionBaselines.tradePlanId, planId), eq(tradePlanExecutionBaselines.userId, userId))
      const [totalRow] = await tx.select({ total: count() }).from(tradePlanExecutionBaselines).where(where)
      const total = totalRow!.total
      const totalPages = Math.ceil(total / query.data.limit)
      const rows = query.data.page > totalPages ? [] : await tx.select().from(tradePlanExecutionBaselines)
        .where(where).orderBy(desc(tradePlanExecutionBaselines.version))
        .limit(query.data.limit).offset((query.data.page - 1) * query.data.limit)
      return tradePlanExecutionBaselineHistoryResponseSchema.parse({
        data: rows.map(serializeBaseline),
        pagination: { page: query.data.page, limit: query.data.limit, total, totalPages },
      })
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' }))
  })
}
