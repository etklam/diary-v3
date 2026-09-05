import type { Context, Hono } from 'hono'
import type { z } from 'zod'
import { serializedIdSchema, type ErrorCode } from '@diary/contracts'
import { etfWatchlistCreateSchema, etfWatchlistItemSchema, etfWatchlistListSchema } from '@diary/contracts/etf'
import { etfs, etfWatchlists, users, type Database } from '@diary/db'
import { and, eq, max, sql } from 'drizzle-orm'
import type { AppEnv } from './app.js'
export function registerEtfWatchlistRoutes(app: Hono<AppEnv>, dependencies: {
 db: Database; now: () => Date; fail: (status: number, code: ErrorCode, message: string) => never
 validationError: (error: z.ZodError) => never; parseJson: <T>(context: Context<AppEnv>, schema: z.ZodType<T>) => Promise<T>
}) {
 const { db, now, fail, validationError, parseJson } = dependencies
 const owner = (c: Context<AppEnv>) => { c.header('Cache-Control', 'no-store'); const user = c.get('user'); return user ? BigInt(user.id) : fail(401, 'AUTH_UNAUTHORIZED', 'Authentication required') }
 app.get('/api/etf/watchlist', async c => {
  const userId = owner(c)
  const result = await db.execute(sql`select w.id::text as id,e.symbol,e.name,w.sort_order as "sortOrder",p.close::float8 as "latestPrice",p.date::text as "latestDate" from etf_watchlists w join etfs e on e.id=w.etf_id left join lateral (select close,date from etf_prices where etf_id=e.id order by date desc limit 1) p on true where w.user_id=${userId} order by w.sort_order,w.id`)
  return c.json(etfWatchlistListSchema.parse(result.rows))
 })
 app.post('/api/etf/watchlist', async c => {
  const userId = owner(c), input = await parseJson(c, etfWatchlistCreateSchema)
  const result = await db.transaction(async tx => {
   await tx.select({ id: users.id }).from(users).where(eq(users.id,userId)).for('update')
   const [etf] = await tx.select().from(etfs).where(eq(etfs.symbol,input.symbol)).for('key share')
   if(!etf)return fail(404,'ETF_NOT_FOUND','ETF not found')
   const [last] = await tx.select({ order:max(etfWatchlists.sortOrder) }).from(etfWatchlists).where(eq(etfWatchlists.userId,userId))
   const sortOrder=(last?.order??-1)+1
   if(sortOrder>2147483647)return fail(400,'SYS_VALIDATION_ERROR','Watchlist order limit reached')
   const [created] = await tx.insert(etfWatchlists).values({userId,etfId:etf.id,sortOrder,createdAt:now()}).onConflictDoNothing({target:[etfWatchlists.userId,etfWatchlists.etfId]}).returning()
   if(!created)return fail(409,'ETF_ALREADY_IN_WATCHLIST','ETF already in watchlist')
   return {id:String(created.id),symbol:etf.symbol,name:etf.name,sortOrder:created.sortOrder}
  })
  return c.json(etfWatchlistItemSchema.parse(result))
 })
 app.delete('/api/etf/watchlist/:id',async c=>{
  const userId=owner(c),parsed=serializedIdSchema.safeParse(c.req.param('id'));if(!parsed.success)return validationError(parsed.error)
  const result=await db.delete(etfWatchlists).where(and(eq(etfWatchlists.id,BigInt(parsed.data)),eq(etfWatchlists.userId,userId))).returning({id:etfWatchlists.id})
  if(!result.length)return fail(404,'SYS_NOT_FOUND','Watchlist entry not found')
  return c.json({success:true})
 })
}
