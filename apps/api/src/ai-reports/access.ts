import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { aiUserAccess, users, type Database } from '@diary/db'

export async function readAiAccess(db: Database, userId: bigint) {
  const [row] = await db.select().from(aiUserAccess).where(eq(aiUserAccess.userId, userId)).limit(1)
  return row ?? null
}

export async function ensureAiAccess(db: Database, userId: bigint) {
  const [row] = await db.insert(aiUserAccess).values({ userId }).onConflictDoNothing().returning()
  if (row) return row
  return readAiAccess(db, userId)
}

export async function updateAiAccess(db: Pick<Database, 'insert'>, input: { userId: bigint; enabled: boolean; monthlyQuota: number; actorUserId: bigint; now: Date }) {
  const [row] = await db.insert(aiUserAccess).values({
    userId: input.userId,
    enabled: input.enabled,
    monthlyQuota: input.monthlyQuota,
    grantedBy: input.actorUserId,
    grantedAt: input.enabled ? input.now : null,
    revokedAt: input.enabled ? null : input.now,
    updatedAt: input.now,
  }).onConflictDoUpdate({
    target: aiUserAccess.userId,
    set: {
      enabled: input.enabled,
      monthlyQuota: input.monthlyQuota,
      grantedBy: input.actorUserId,
      grantedAt: input.enabled ? input.now : sql`${aiUserAccess.grantedAt}`,
      revokedAt: input.enabled ? null : input.now,
      updatedAt: input.now,
    },
  }).returning()
  return row
}

export async function listAiAccess(db: Database, input: { limit: number; search?: string; cursor?: string }) {
  const where = input.search
    ? or(ilike(users.email, `%${input.search}%`), ilike(users.name, `%${input.search}%`))
    : undefined
  const rows = await db.select({ access: aiUserAccess, user: { id: users.id, email: users.email, name: users.name } })
    .from(users).leftJoin(aiUserAccess, eq(aiUserAccess.userId, users.id))
    .where(and(where, input.cursor ? sql`${users.id} < ${BigInt(input.cursor)}` : undefined))
    .orderBy(desc(users.id)).limit(input.limit + 1)
  const hasNext = rows.length > input.limit
  const page = hasNext ? rows.slice(0, input.limit) : rows
  return { rows: page, nextCursor: hasNext ? page.at(-1)?.user.id.toString() ?? null : null }
}
