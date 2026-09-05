import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { invitePartnerSchema, updatePartnerSharingSchema, partnerLinkResponseSchema, partnerCompareQuerySchema, partnerCompareResponseSchema } from '@diary/contracts/partners'
import { partnerLinks, users, diaries, type Database } from '@diary/db'
import { eq, or, sql, desc } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import type { AppEnv } from './app.js'
export function registerPartnerRoutes(app: Hono<AppEnv>, dependencies: {
 db: Database; now: () => Date; fail: (status: number, code: ErrorCode, message: string) => never
 validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
 const { db, now, fail, validationError, parseJson } = dependencies
 type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
 const owner = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required') }
 const id = (c: Context<AppEnv>) => { const parsed = serializedIdSchema.safeParse(c.req.param('id')); return parsed.success ? BigInt(parsed.data) : validationError(parsed.error) }
 async function serialize(connection: Database | Transaction, link: typeof partnerLinks.$inferSelect, viewer: bigint, participant?: { id: bigint; email: string; name: string | null }) {
  const isA = link.userAId === viewer
  const [partner] = participant ? [participant] : await connection.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, isA ? link.userBId : link.userAId))
  if (!partner) return fail(404, 'PARTNER_LINK_NOT_FOUND', 'Partner link not found')
  const initiatedByCurrentUser = link.initiatedByUserId === viewer
  const status = link.acceptedAt ? 'connected' : initiatedByCurrentUser ? 'pending_outgoing' : 'pending_incoming'
  return partnerLinkResponseSchema.parse({ id: String(link.id), acceptedAt: link.acceptedAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString(), partner: { ...partner, id: String(partner.id) }, status,
   selfSharesDiaries: isA ? link.userASharesDiaries : link.userBSharesDiaries, partnerSharesDiaries: isA ? link.userBSharesDiaries : link.userASharesDiaries,
   selfSharesStockNotes: isA ? link.userASharesStockNotes : link.userBSharesStockNotes, partnerSharesStockNotes: isA ? link.userBSharesStockNotes : link.userASharesStockNotes,
   pendingIncoming: status === 'pending_incoming', pendingOutgoing: status === 'pending_outgoing', initiatedByCurrentUser,
  })
 }
 async function locked(tx: Transaction, linkId: bigint, viewer: bigint) {
  const [link] = await tx.select().from(partnerLinks).where(eq(partnerLinks.id, linkId)).for('update')
  if (!link) return fail(404, 'PARTNER_LINK_NOT_FOUND', 'Partner link not found')
  if (link.userAId !== viewer && link.userBId !== viewer) return fail(403, 'PARTNER_LINK_ACCESS_DENIED', 'Partner access denied')
  return link
 }
 app.get('/api/partners', async c => {
  const viewer = owner(c)
  const links = await db.transaction(async tx => {
   const rows = await tx.select({ link: partnerLinks, participant: { id: users.id, email: users.email, name: users.name } }).from(partnerLinks).innerJoin(users, sql`${users.id} = CASE WHEN ${partnerLinks.userAId} = ${viewer} THEN ${partnerLinks.userBId} ELSE ${partnerLinks.userAId} END`).where(or(eq(partnerLinks.userAId, viewer), eq(partnerLinks.userBId, viewer))).orderBy(sql`${partnerLinks.acceptedAt} DESC NULLS LAST`, desc(partnerLinks.updatedAt), desc(partnerLinks.id))
   return Promise.all(rows.map(({ link, participant }) => serialize(tx, link, viewer, participant)))
  }, { isolationLevel: 'repeatable read' })
  return c.json({ links })
 })
 app.get('/api/partners/compare', async c => {
  const viewer = owner(c), parsed = partnerCompareQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return validationError(parsed.error)
  const { partnerId, limit } = parsed.data
  const result = await db.transaction(async tx => {
   const [account] = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, viewer))
   if (!account) return fail(404, 'USER_NOT_FOUND', 'User not found')
   const rows = await tx.select({ link: partnerLinks, participant: { id: users.id, email: users.email, name: users.name } }).from(partnerLinks).innerJoin(users, sql`${users.id} = CASE WHEN ${partnerLinks.userAId} = ${viewer} THEN ${partnerLinks.userBId} ELSE ${partnerLinks.userAId} END`).where(or(eq(partnerLinks.userAId, viewer), eq(partnerLinks.userBId, viewer))).orderBy(sql`${partnerLinks.acceptedAt} DESC NULLS LAST`, desc(partnerLinks.updatedAt), desc(partnerLinks.id))
   const links = await Promise.all(rows.map(async ({ link: row, participant }) => { const link = await serialize(tx, row, viewer, participant); return { ...link, partner: { id: link.partner.id, name: link.partner.name } } }))
   const selected = partnerId ? links.find(link => link.partner.id === partnerId) : links.find(link => link.status === 'connected')
   if (partnerId && !selected) return fail(404, 'PARTNER_LINK_NOT_FOUND', 'Partner link not found')
   if (selected && selected.status !== 'connected') return fail(409, 'PARTNER_LINK_PENDING', 'Partner invitation is pending')
   const base = { owner: { id: String(account.id), name: account.name }, partner: selected?.partner ?? null, selectedPartnerId: selected?.partner.id ?? null, links }
   if (!selected) return { ...base, compareDays: [] }
   // Explicit column allowlist: future private fields cannot silently become shared.
   const load = async (userId: bigint) => (await tx.select({ id: diaries.id, title: diaries.title, content: diaries.content, tags: diaries.tags, createdVia: diaries.createdVia, createdByLabel: diaries.createdByLabel, date: diaries.date, createdAt: diaries.createdAt, updatedAt: diaries.updatedAt }).from(diaries).where(eq(diaries.userId, userId)).orderBy(desc(diaries.date), desc(diaries.id)).limit(limit)).map(row => ({ ...row, id: String(row.id), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }))
   const own = await load(viewer), shared = selected.partnerSharesDiaries ? await load(BigInt(selected.partner.id)) : []
   const ownByDate = new Map(own.map(row => [row.date, row])), sharedByDate = new Map(shared.map(row => [row.date, row]))
   return { ...base, compareDays: [...new Set([...ownByDate.keys(), ...sharedByDate.keys()])].sort().reverse().slice(0, limit).map(dateKey => ({ dateKey, ownerDiary: ownByDate.get(dateKey) ?? null, partnerDiary: sharedByDate.get(dateKey) ?? null })) }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
  return c.json(partnerCompareResponseSchema.parse(result))
 })
 app.post('/api/partners', async c => {
  const viewer = owner(c), input = await parseJson(c, invitePartnerSchema)
  const link = await db.transaction(async tx => {
   const [partner] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.partnerEmail))
   if (!partner) return fail(404, 'USER_NOT_FOUND', 'User not found')
   if (partner.id === viewer) return fail(400, 'SYS_VALIDATION_ERROR', 'Cannot invite your own account')
   const [created] = await tx.insert(partnerLinks).values({ userAId: viewer < partner.id ? viewer : partner.id, userBId: viewer < partner.id ? partner.id : viewer, initiatedByUserId: viewer, createdAt: now(), updatedAt: now() }).onConflictDoNothing({ target: [partnerLinks.userAId, partnerLinks.userBId] }).returning()
   if (!created) return fail(409, 'PARTNER_LINK_ALREADY_EXISTS', 'Partner link already exists')
   return serialize(tx, created, viewer)
  })
  return c.json({ link })
 })
 app.post('/api/partners/:id/accept', async c => {
  const viewer = owner(c), linkId = id(c)
  const link = await db.transaction(async tx => {
   const current = await locked(tx, linkId, viewer)
   if (current.acceptedAt || current.initiatedByUserId === viewer) return fail(403, 'PARTNER_LINK_ACCESS_DENIED', 'Only the pending recipient can accept')
   const [updated] = await tx.update(partnerLinks).set({ acceptedAt: now(), updatedAt: now() }).where(eq(partnerLinks.id, linkId)).returning()
   return serialize(tx, updated!, viewer)
  })
  return c.json({ link })
 })
 app.put('/api/partners/:id/sharing', async c => {
  const viewer = owner(c), linkId = id(c), input = await parseJson(c, updatePartnerSharingSchema)
  const link = await db.transaction(async tx => {
   const current = await locked(tx, linkId, viewer)
   if (!current.acceptedAt) return fail(409, 'PARTNER_LINK_PENDING', 'Accept the invitation before sharing')
   const isA = current.userAId === viewer
   const [updated] = await tx.update(partnerLinks).set({ updatedAt: now(),
    ...(input.shareDiaries === undefined ? {} : isA ? { userASharesDiaries: input.shareDiaries } : { userBSharesDiaries: input.shareDiaries }),
    ...(input.shareStockNotes === undefined ? {} : isA ? { userASharesStockNotes: input.shareStockNotes } : { userBSharesStockNotes: input.shareStockNotes }),
   }).where(eq(partnerLinks.id, linkId)).returning()
   return serialize(tx, updated!, viewer)
  })
  return c.json({ link })
 })
 app.delete('/api/partners/:id', async c => {
  const viewer = owner(c), linkId = id(c)
  await db.transaction(async tx => { await locked(tx, linkId, viewer); await tx.delete(partnerLinks).where(eq(partnerLinks.id, linkId)) })
  return c.json({ success: true as const })
 })
}
