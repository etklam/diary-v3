import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'
import { stockTimelineSourceTypeSchema } from './stock-timeline-source.js'

/** Shared symbol wire rule. Server-only route parsing delegates to this rule. */
export const stockSymbolSchema = z.string().trim().min(1).max(32)
  .regex(/^[A-Za-z0-9.]+$/, 'Symbol contains unsupported characters')
  .transform(value => value.toUpperCase())

export const stockWatchStatusSchema = z.enum(['WATCHING', 'ARCHIVED'])

export const stockWatchlistMutationResponseSchema = z.object({
  id: serializedIdSchema,
  symbol: stockSymbolSchema,
  sortOrder: z.number().int().nonnegative(),
  // Optional on input so clients can parse legacy servers that predate pinning;
  // default keeps the new runtime type boolean for ordering and controls.
  pinned: z.boolean().optional().default(false),
  status: stockWatchStatusSchema,
  updatedAt: utcInstantSchema.optional(),
}).strict()

export const stockWatchlistCreateRequestSchema = z.object({
  symbol: stockSymbolSchema,
  /** Used only by an explicit undo; ordinary additions use the next position. */
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  pinned: z.boolean().optional(),
}).strict()
export const stockWatchlistUpdateRequestSchema = z.object({
  status: stockWatchStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  pinned: z.boolean().optional(),
}).strict().refine(value => value.status !== undefined || value.sortOrder !== undefined || value.pinned !== undefined, {
  message: 'status, sortOrder or pinned is required',
})

export const stockWatchlistReorderRequestSchema = z.object({
  id: serializedIdSchema,
  direction: z.enum(['up', 'down']),
}).strict()

export const stockWatchlistLatestRecordSchema = z.object({
  id: serializedIdSchema,
  summary: z.string(),
  occurredAt: utcInstantSchema,
  sourceType: stockTimelineSourceTypeSchema,
  sourceTitle: z.string().nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),
}).strict()

export const stockWatchlistItemSchema = z.object({
  id: serializedIdSchema,
  status: stockWatchStatusSchema,
  sortOrder: z.number().int().nonnegative(),
  // Optional on input so clients can parse legacy watchlist payloads.
  pinned: z.boolean().optional().default(false),
  updatedAt: utcInstantSchema,
  stock: z.object({ symbol: stockSymbolSchema, name: z.string().nullable() }).strict(),
  recordCount: z.number().int().nonnegative(),
  latestRecord: stockWatchlistLatestRecordSchema.nullable(),
}).strict()

export const STOCK_WATCHLIST_MAX_ITEMS = 100
export const stockWatchlistReorderResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(z.object({ id: serializedIdSchema, sortOrder: z.number().int().nonnegative() }).strict()).max(STOCK_WATCHLIST_MAX_ITEMS),
}).strict()
export const stockWatchlistDeleteResponseSchema = z.object({ success: z.literal(true) }).strict()

export const stockWatchlistResponseSchema = z.object({
  items: z.array(stockWatchlistItemSchema).max(STOCK_WATCHLIST_MAX_ITEMS),
}).strict()

export type StockWatchlistItem = z.infer<typeof stockWatchlistItemSchema>
export type StockWatchlistResponse = z.infer<typeof stockWatchlistResponseSchema>

export const agentWatchlistResponseSchema = z.object({ watchlist: z.array(z.object({ id: serializedIdSchema, symbol: stockSymbolSchema, name: z.string().nullable(), sortOrder: z.number().int().nonnegative(), status: stockWatchStatusSchema }).strict()).max(STOCK_WATCHLIST_MAX_ITEMS) }).strict()
