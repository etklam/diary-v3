import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import {
  adminGuruCreateRequestSchema,
  adminGuruListQuerySchema,
  adminGuruListResponseSchema,
  adminGuruResponseSchema,
  adminGuruUpdateRequestSchema,
  serializedIdSchema,
  type ErrorCode,
} from '@diary/contracts'
import { gurus, institutionalManagers, users, type Database } from '@diary/db'
import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import { instant, isUniqueViolation, type AppEnv } from './app-context.js'
import { canonicalizeCik } from './sec-edgar/validation.js'

type AdminGuruDependencies = {
  db: Database
  now: () => Date
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: z.ZodError) => never
  parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}

type GuruRow = typeof gurus.$inferSelect
type ManagerRow = typeof institutionalManagers.$inferSelect

function serialize(guru: GuruRow, manager: ManagerRow) {
  const { id, createdAt, updatedAt } = guru
  return {
    id: id.toString(),
    profile: {
      name: guru.name, managerName: guru.managerName, slug: guru.slug,
      description: guru.description, investmentPhilosophy: guru.investmentPhilosophy,
      styleTags: guru.styleTags, managerType: guru.managerType, website: guru.website,
      country: guru.country, imageUrl: guru.imageUrl, securityNotes: guru.securityNotes,
      featured: guru.featured, active: guru.active, directoryOrder: guru.directoryOrder,
    },
    manager: { id: manager.id.toString(), cik: manager.cik, createdAt: instant(manager.createdAt), updatedAt: instant(manager.updatedAt) },
    createdAt: instant(createdAt), updatedAt: instant(updatedAt),
  }
}

export function registerAdminGuruRoutes(app: Hono<AppEnv>, dependencies: AdminGuruDependencies) {
  const { db, now, fail, validationError, parseJson } = dependencies
  const requireAdmin = async (context: Context<AppEnv>) => {
    context.header('Cache-Control', 'no-store')
    const session = context.get('user')
    if (!session) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    const [current] = await db.select({ role: users.role }).from(users)
      .where(eq(users.id, BigInt(session.id))).limit(1)
    if (!current) return fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required')
    if (current.role !== 'ADMIN') return fail(403, 'AUTH_FORBIDDEN', 'Admin access required')
  }
  const parseId = (context: Context<AppEnv>) => {
    const parsed = serializedIdSchema.safeParse(context.req.param('id'))
    if (!parsed.success) return validationError(parsed.error)
    return BigInt(parsed.data)
  }
  const conflict = (error: unknown): never => {
    if (isUniqueViolation(error, 'gurus_slug_unique')) return fail(409, 'GURU_SLUG_CONFLICT', 'A Guru with this slug already exists')
    if (isUniqueViolation(error, 'institutional_managers_cik_unique')) return fail(409, 'GURU_CIK_CONFLICT', 'A manager with this CIK already exists')
    throw error
  }

  app.get('/api/admin/gurus', async context => {
    await requireAdmin(context)
    const parsed = adminGuruListQuerySchema.safeParse(context.req.query())
    if (!parsed.success) return validationError(parsed.error)
    const { page, limit, search, active, featured } = parsed.data
    // Escape LIKE metacharacters so search is a literal substring.
    const pattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : undefined
    const where = and(
      pattern ? or(ilike(gurus.name, pattern), ilike(gurus.managerName, pattern), ilike(gurus.slug, pattern), ilike(institutionalManagers.cik, pattern)) : undefined,
      active === undefined ? undefined : eq(gurus.active, active === 'true'),
      featured === undefined ? undefined : eq(gurus.featured, featured === 'true'),
    )
    const [totals, rows] = await Promise.all([
      db.select({ count: count() }).from(gurus).innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id)).where(where),
      db.select({ guru: gurus, manager: institutionalManagers }).from(gurus)
        .innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id)).where(where)
        .orderBy(desc(gurus.createdAt), desc(gurus.id)).limit(limit).offset((page - 1) * limit),
    ])
    const total = Number(totals[0]?.count ?? 0)
    return context.json(adminGuruListResponseSchema.parse({
      data: rows.map(row => serialize(row.guru, row.manager)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }))
  })

  app.get('/api/admin/gurus/:id', async context => {
    await requireAdmin(context)
    const id = parseId(context)
    const [row] = await db.select({ guru: gurus, manager: institutionalManagers }).from(gurus)
      .innerJoin(institutionalManagers, eq(gurus.managerId, institutionalManagers.id)).where(eq(gurus.id, id)).limit(1)
    if (!row) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
    return context.json(adminGuruResponseSchema.parse({ data: serialize(row.guru, row.manager) }))
  })

  app.post('/api/admin/gurus', async context => {
    await requireAdmin(context)
    const input = await parseJson(context, adminGuruCreateRequestSchema)
    const cik = canonicalizeCik(input.manager.cik)
    const timestamp = now()
    try {
      const result = await db.transaction(async tx => {
        const [manager] = await tx.insert(institutionalManagers).values({ cik, createdAt: timestamp, updatedAt: timestamp }).returning()
        const [guru] = await tx.insert(gurus).values({ ...input.profile, managerId: manager!.id, createdAt: timestamp, updatedAt: timestamp }).returning()
        return serialize(guru!, manager!)
      })
      return context.json(adminGuruResponseSchema.parse({ data: result }), 201)
    } catch (error) { return conflict(error) }
  })

  app.put('/api/admin/gurus/:id', async context => {
    await requireAdmin(context)
    const id = parseId(context)
    const input = await parseJson(context, adminGuruUpdateRequestSchema)
    const cik = canonicalizeCik(input.manager.cik)
    const timestamp = now()
    try {
      const result = await db.transaction(async tx => {
        const [existing] = await tx.select({ managerId: gurus.managerId }).from(gurus).where(eq(gurus.id, id)).limit(1).for('update')
        if (!existing) return undefined
        const [manager] = await tx.update(institutionalManagers).set({ cik, updatedAt: timestamp })
          .where(eq(institutionalManagers.id, existing.managerId)).returning()
        const [guru] = await tx.update(gurus).set({ ...input.profile, updatedAt: timestamp }).where(eq(gurus.id, id)).returning()
        return serialize(guru!, manager!)
      })
      if (!result) return fail(404, 'GURU_NOT_FOUND', 'Guru not found')
      return context.json(adminGuruResponseSchema.parse({ data: result }))
    } catch (error) { return conflict(error) }
  })
}
