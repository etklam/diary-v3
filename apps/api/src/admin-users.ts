import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import {
  adminDiaryListQuerySchema,
  adminDiaryListResponseSchema,
  adminDiarySchema,
  adminStatsResponseSchema,
  adminUserDeleteResponseSchema,
  adminUserListQuerySchema,
  adminUserListResponseSchema,
  adminUserRoleResponseSchema,
  adminUserRoleUpdateRequestSchema,
  serializedIdSchema,
  type ErrorCode,
} from '@diary/contracts'
import { alerts, diaries, transactions, users, type Database } from '@diary/db'
import { count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { AppEnv } from './app.js'
import { userSessionLock } from './auth-session.js'

type AdminDependencies = {
  db: Database
  now: () => Date
  onAccountRevoked?: (userId: string) => void
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}

const adminUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  createdAt: users.createdAt,
  diaryCount: sql<number>`(select count(*)::int from diaries where diaries.user_id = ${users.id})`,
}

// Explicitly list fields rather than selecting the Diary row. Review outcome
// and reflection text are private owner data and must never enter an admin
// response, including recent activity.
const adminDiaryColumns = {
  id: diaries.id,
  userId: diaries.userId,
  title: diaries.title,
  content: diaries.content,
  tags: diaries.tags,
  createdVia: diaries.createdVia,
  createdByLabel: diaries.createdByLabel,
  date: diaries.date,
  createdAt: diaries.createdAt,
  updatedAt: diaries.updatedAt,
  thesis: diaries.thesis,
  risk: diaries.risk,
  execution: diaries.execution,
  reviewDueAt: diaries.reviewDueAt,
  reviewStatus: diaries.reviewStatus,
  reviewedAt: diaries.reviewedAt,
  alertCount: sql<number>`(select count(*)::int from alerts where alerts.diary_id = ${diaries.id})`,
  transactionCount: sql<number>`(select count(*)::int from transactions where transactions.diary_id = ${diaries.id})`,
  authorId: users.id,
  authorEmail: users.email,
  authorName: users.name,
}

type AdminUserRow = typeof users.$inferSelect & { diaryCount: number }
type AdminDiaryRow = {
  id: bigint
  userId: bigint
  title: string
  content: string
  tags: string[]
  createdVia: 'WEB' | 'API_KEY' | 'TELEGRAM_BOT'
  createdByLabel: string | null
  date: string
  createdAt: Date
  updatedAt: Date
  thesis: string | null
  risk: string | null
  execution: string | null
  reviewDueAt: Date | null
  reviewStatus: 'none' | 'pending' | 'reviewed'
  reviewedAt: Date | null
  alertCount: number
  transactionCount: number
  authorId: bigint
  authorEmail: string
  authorName: string | null
}

function instant(value: Date): string { return value.toISOString() }

function serializeUser(row: Pick<AdminUserRow, 'id' | 'email' | 'name' | 'role' | 'createdAt' | 'diaryCount'>) {
  return {
    id: row.id.toString(),
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: instant(row.createdAt),
    diaryCount: Number(row.diaryCount),
  }
}

function serializeDiary(row: AdminDiaryRow) {
  return adminDiarySchema.parse({
    id: row.id.toString(),
    userId: row.userId.toString(),
    title: row.title,
    content: row.content,
    tags: row.tags,
    createdVia: row.createdVia,
    createdByLabel: row.createdByLabel,
    date: row.date,
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    thesis: row.thesis,
    risk: row.risk,
    execution: row.execution,
    reviewDueAt: row.reviewDueAt ? instant(row.reviewDueAt) : null,
    reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt ? instant(row.reviewedAt) : null,
    author: { id: row.authorId.toString(), email: row.authorEmail, name: row.authorName },
    alertCount: Number(row.alertCount),
    transactionCount: Number(row.transactionCount),
  })
}

async function selectAdminDiaries(db: Database, limit: number, offset: number, orderByCreatedAt: boolean): Promise<AdminDiaryRow[]> {
  const query = db.select(adminDiaryColumns).from(diaries)
    .innerJoin(users, eq(users.id, diaries.userId))
    .limit(limit)
    .offset(offset)
  return orderByCreatedAt
    ? query.orderBy(desc(diaries.createdAt), desc(diaries.id)) as unknown as Promise<AdminDiaryRow[]>
    : query.orderBy(desc(diaries.date), desc(diaries.id)) as unknown as Promise<AdminDiaryRow[]>
}

export function registerAdminUserRoutes(app: Hono<AppEnv>, dependencies: AdminDependencies) {
  const { db, now, onAccountRevoked, fail, validationError, parseJson } = dependencies

  const requireAdmin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    // Authentication already reads the user row, but repeat the role lookup at
    // the admin boundary so a role downgrade cannot race with a stale request.
    const [current] = await db.select({ id: users.id, role: users.role })
      .from(users).where(eq(users.id, BigInt(session.id))).limit(1)
    if (!current) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (current.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
    return current.id
  }

  const parseId = (context: Context<AppEnv>) => {
    const value = context.req.param('id')
    const parsed = serializedIdSchema.safeParse(value)
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }

  app.get('/api/admin/users', async context => {
    await requireAdmin(context)
    const query = adminUserListQuerySchema.safeParse(context.req.query())
    if (!query.success) return validationError(query.error)
    const { page, limit, search } = query.data
    const where = search
      ? or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))
      : undefined
    const [totalRow, rows] = await Promise.all([
      db.select({ count: count() }).from(users).where(where),
      db.select(adminUserColumns).from(users).where(where)
        .orderBy(desc(users.createdAt), desc(users.id)).limit(limit).offset((page - 1) * limit),
    ])
    const total = Number(totalRow[0]?.count ?? 0)
    return context.json(adminUserListResponseSchema.parse({
      data: rows.map(row => serializeUser(row as AdminUserRow)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }))
  })

  app.put('/api/admin/users/:id/role', async context => {
    const adminId = await requireAdmin(context)
    const targetId = parseId(context)
    if (targetId === adminId) return fail(403, 'AUTH_FORBIDDEN', 'Administrators cannot modify their own role')
    const input = await parseJson(context, adminUserRoleUpdateRequestSchema)
    const updated = await db.transaction(async tx => {
      await tx.execute(userSessionLock(targetId))
      const [target] = await tx.select({ id: users.id, email: users.email, name: users.name })
        .from(users).where(eq(users.id, targetId)).limit(1).for('update')
      if (!target) return undefined
      const [row] = await tx.update(users).set({ role: input.role, updatedAt: now() })
        .where(eq(users.id, targetId)).returning({ id: users.id, email: users.email, name: users.name, role: users.role })
      return row
    })
    if (!updated) return fail(404, 'USER_NOT_FOUND', 'User not found')
    return context.json(adminUserRoleResponseSchema.parse({ data: { ...updated, id: updated.id.toString() } }))
  })

  app.delete('/api/admin/users/:id', async context => {
    const adminId = await requireAdmin(context)
    const targetId = parseId(context)
    if (targetId === adminId) return fail(403, 'AUTH_FORBIDDEN', 'Administrators cannot delete their own account')
    const deleted = await db.transaction(async tx => {
      await tx.execute(userSessionLock(targetId))
      const [target] = await tx.select({ id: users.id, email: users.email })
        .from(users).where(eq(users.id, targetId)).limit(1).for('update')
      if (!target) return undefined
      const [row] = await tx.delete(users).where(eq(users.id, targetId)).returning({ id: users.id, email: users.email })
      return row
    })
    if (!deleted) return fail(404, 'USER_NOT_FOUND', 'User not found')
    // DB cascade and token invalidation are committed before disconnecting live
    // clients. A failed transaction therefore cannot evict an existing user.
    onAccountRevoked?.(deleted.id.toString())
    return context.json(adminUserDeleteResponseSchema.parse({ success: true, message: 'User deleted successfully' }))
  })

  app.get('/api/admin/diaries', async context => {
    await requireAdmin(context)
    const query = adminDiaryListQuerySchema.safeParse(context.req.query())
    if (!query.success) return validationError(query.error)
    const { page, limit } = query.data
    const [totalRow, rows] = await Promise.all([
      db.select({ count: count() }).from(diaries),
      selectAdminDiaries(db, limit, (page - 1) * limit, false),
    ])
    const total = Number(totalRow[0]?.count ?? 0)
    return context.json(adminDiaryListResponseSchema.parse({
      data: rows.map(serializeDiary),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }))
  })

  app.get('/api/admin/stats', async context => {
    await requireAdmin(context)
    const [totalUsers, adminUsers, regularUsers, totalDiaries, totalAlerts, activeAlerts, dismissedAlerts, totalTransactions, buyTransactions, sellTransactions, recentUsers, recentDiaries] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(users).where(eq(users.role, 'ADMIN')),
      db.select({ count: count() }).from(users).where(eq(users.role, 'USER')),
      db.select({ count: count() }).from(diaries),
      db.select({ count: count() }).from(alerts),
      db.select({ count: count() }).from(alerts).where(eq(alerts.isDismissed, false)),
      db.select({ count: count() }).from(alerts).where(eq(alerts.isDismissed, true)),
      db.select({ count: count() }).from(transactions),
      db.select({ count: count() }).from(transactions).where(eq(transactions.type, 'BUY')),
      db.select({ count: count() }).from(transactions).where(eq(transactions.type, 'SELL')),
      db.select(adminUserColumns).from(users).orderBy(desc(users.createdAt), desc(users.id)).limit(5),
      selectAdminDiaries(db, 5, 0, true),
    ])
    return context.json(adminStatsResponseSchema.parse({
      data: {
        users: { total: Number(totalUsers[0]?.count ?? 0), admin: Number(adminUsers[0]?.count ?? 0), regular: Number(regularUsers[0]?.count ?? 0) },
        diaries: { total: Number(totalDiaries[0]?.count ?? 0) },
        alerts: { total: Number(totalAlerts[0]?.count ?? 0), active: Number(activeAlerts[0]?.count ?? 0), dismissed: Number(dismissedAlerts[0]?.count ?? 0) },
        transactions: { total: Number(totalTransactions[0]?.count ?? 0), buy: Number(buyTransactions[0]?.count ?? 0), sell: Number(sellTransactions[0]?.count ?? 0) },
        recentActivity: { users: recentUsers.map(row => serializeUser(row as AdminUserRow)), diaries: recentDiaries.map(serializeDiary) },
      },
    }))
  })
}
