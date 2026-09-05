import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'
import { stockSymbolSchema } from './watchlist.js'
export const stockNoteCreateRequestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().min(1).max(50_000),
  date: utcInstantSchema.optional(),
}).strict()

export const stockNoteUpdateRequestSchema = stockNoteCreateRequestSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: 'At least one field is required' },
)

export const stockNoteResponseSchema = z.object({
  id: serializedIdSchema,
  symbol: stockSymbolSchema,
  name: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  date: utcInstantSchema,
  createdVia: z.enum(['USER', 'AGENT']),
  createdByLabel: z.string().nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()

export const stockNoteListItemSchema = stockNoteResponseSchema.extend({
  isOwnedByViewer: z.boolean(),
}).strict()

export const stockNoteListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  createdVia: z.enum(['USER', 'AGENT']).optional(),
  partnerId: serializedIdSchema.optional(),
}).strict()

export const stockNoteListResponseSchema = z.object({
  data: z.array(stockNoteListItemSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).strict(),
}).strict()

export type StockNoteResponse = z.infer<typeof stockNoteResponseSchema>
export function toStockNoteContractResponse(item: {
  id: bigint
  title: string
  content: string
  date: Date | string
  createdVia: string
  createdByLabel: string | null
  createdAt: Date | string
  updatedAt: Date | string
  stock: { symbol: string; name: string | null }
}): StockNoteResponse {
  const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString()
  return stockNoteResponseSchema.parse({
    id: String(item.id),
    symbol: item.stock.symbol,
    name: item.stock.name,
    title: item.title,
    content: item.content,
    date: iso(item.date),
    createdVia: item.createdVia,
    createdByLabel: item.createdByLabel,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  })
}
