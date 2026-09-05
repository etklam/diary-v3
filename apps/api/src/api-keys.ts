import { createHash, randomBytes } from 'node:crypto'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { createApiKeySchema, apiKeySummarySchema, apiKeyCreateResponseSchema } from '@diary/contracts/api-keys'
import { apiKeyCredentials, type Database } from '@diary/db'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
export function registerApiKeyRoutes(app: Hono<AppEnv>, dependencies: {
 db: Database; now: () => Date; consume: (key: string, points: number, timestamp: number) => void
 fail: (status: number, code: ErrorCode, message: string) => never
 validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
 const { db, now, consume, fail, validationError, parseJson } = dependencies
 const owner = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required') }
 const columns = { id: apiKeyCredentials.id, label: apiKeyCredentials.label, keyPrefix: apiKeyCredentials.keyPrefix, scope: apiKeyCredentials.scope, createdAt: apiKeyCredentials.createdAt, lastUsedAt: apiKeyCredentials.lastUsedAt, revokedAt: apiKeyCredentials.revokedAt }
 const serialize = (row: { id: bigint; label: string; keyPrefix: string; scope: 'DIARY_CREATE' | 'AGENT_WRITE'; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }) => apiKeySummarySchema.parse({ ...row, id: String(row.id), createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null, revokedAt: row.revokedAt?.toISOString() ?? null })
 app.get('/api/api-keys', async c => {
  const viewer = owner(c)
  const rows = await db.select(columns).from(apiKeyCredentials).where(eq(apiKeyCredentials.userId, viewer)).orderBy(desc(apiKeyCredentials.createdAt), desc(apiKeyCredentials.id))
  return c.json({ keys: rows.map(serialize) })
 })
 app.post('/api/api-keys', async c => {
  const viewer = owner(c); consume(`api-key-create:user:${viewer}`, 60, now().getTime())
  const input = await parseJson(c, createApiKeySchema), rawKey = `dva_${randomBytes(24).toString('hex')}`
  const [row] = await db.insert(apiKeyCredentials).values({ userId: viewer, ...input, keyHash: createHash('sha256').update(rawKey).digest('hex'), keyPrefix: rawKey.slice(0, 12), createdAt: now() }).returning(columns)
  return c.json(apiKeyCreateResponseSchema.parse({ key: serialize(row!), rawKey }))
 })
 app.delete('/api/api-keys/:id', async c => {
  const viewer = owner(c), parsed = serializedIdSchema.safeParse(c.req.param('id')); if (!parsed.success) return validationError(parsed.error)
  const removed = await db.update(apiKeyCredentials).set({ revokedAt: now() }).where(and(eq(apiKeyCredentials.id, BigInt(parsed.data)), eq(apiKeyCredentials.userId, viewer), isNull(apiKeyCredentials.revokedAt))).returning({ id: apiKeyCredentials.id })
  if (!removed.length) return fail(404, 'SYS_NOT_FOUND', 'API key not found')
  return c.json({ success: true })
 })
}
