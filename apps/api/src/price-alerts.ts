import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { createPriceAlertRequestSchema, PRICE_ALERT_MOVING_AVG_PERIODS, updatePriceAlertRequestSchema, priceAlertListResponseSchema, toPriceAlertResponse } from '@diary/contracts/price-alerts'
import { priceAlerts, type Database } from '@diary/db'
import { and, desc, eq } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
export function registerPriceAlertRoutes(app: Hono<AppEnv>, dependencies: {
  db: Database; now: () => Date; fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const owner = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required') }
  const id = (c: Context<AppEnv>) => { const parsed = serializedIdSchema.safeParse(c.req.param('id')); return parsed.success ? BigInt(parsed.data) : validationError(parsed.error) }
  app.get('/api/stocks/alerts', async c => {
    const userId = owner(c)
    const rows = await db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId)).orderBy(desc(priceAlerts.createdAt), desc(priceAlerts.id)).limit(100)
    return c.json(priceAlertListResponseSchema.parse(rows.map(toPriceAlertResponse)))
  })
  app.post('/api/stocks/alerts', async c => {
    const userId = owner(c)
    const input = await parseJson(c, createPriceAlertRequestSchema)
    const timestamp = now()
    const [row] = await db.insert(priceAlerts).values({
      symbol: input.symbol,
      type: input.type,
      threshold: input.threshold,
      movingAverageDirection: input.type === 'MOVING_AVG' ? input.movingAverageDirection ?? 'above' : null,
      userId,
      message: input.message || `${input.type} alert for ${input.symbol} at ${input.threshold}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    return c.json(toPriceAlertResponse(row!))
  })
  app.put('/api/stocks/alerts/:id', async c => {
    const userId = owner(c), alertId = id(c), input = await parseJson(c, updatePriceAlertRequestSchema)
    const result = await db.transaction(async tx => {
      const predicate = and(eq(priceAlerts.id, alertId), eq(priceAlerts.userId, userId))
      const [existing] = await tx.select().from(priceAlerts).where(predicate).for('update')
      if (!existing) return fail(404, 'PRICE_ALERT_NOT_FOUND', 'Price alert not found')
      if (input.threshold?.startsWith('-') && existing.type !== 'CHANGE_PERCENT') return fail(400, 'SYS_VALIDATION_ERROR', 'Threshold must be non-negative for this alert type')
      if (existing.type === 'MOVING_AVG' && input.threshold !== undefined && !(PRICE_ALERT_MOVING_AVG_PERIODS as readonly string[]).includes(input.threshold)) return fail(400, 'SYS_VALIDATION_ERROR', 'Moving average period must be 20, 50 or 200')
      if (existing.type !== 'MOVING_AVG' && input.movingAverageDirection !== undefined) return fail(400, 'SYS_VALIDATION_ERROR', 'Moving average direction is only valid for MOVING_AVG alerts')
      const { triggeredAt, movingAverageDirection, ...fields } = input
      const [row] = await tx.update(priceAlerts).set({ ...fields,
        ...(existing.type === 'MOVING_AVG' && movingAverageDirection !== undefined ? { movingAverageDirection } : {}),
        ...(triggeredAt !== undefined ? { triggeredAt: triggeredAt === null ? null : new Date(triggeredAt) } : {}), updatedAt: now(),
      }).where(predicate).returning()
      return toPriceAlertResponse(row!)
    })
    return c.json(result)
  })
  app.delete('/api/stocks/alerts/:id', async c => {
    const userId = owner(c), alertId = id(c)
    const [deleted] = await db.delete(priceAlerts).where(and(eq(priceAlerts.id, alertId), eq(priceAlerts.userId, userId))).returning({ id: priceAlerts.id })
    if (!deleted) return fail(404, 'PRICE_ALERT_NOT_FOUND', 'Price alert not found')
    return c.json({ success: true as const })
  })
}
