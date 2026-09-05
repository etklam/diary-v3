import { z } from 'zod'
import { serializedIdSchema, utcInstantSchema } from './common.js'
import { stockSymbolSchema } from './watchlist.js'
import { stockTimelineSourceTypeSchema, agentAllowedSourceTypeSchema } from './stock-timeline-source.js'
export { STOCK_TIMELINE_SOURCE_TYPES } from './stock-timeline-source.js'

export const stockTimelineRecordSchema = z.object({
  id: serializedIdSchema,
  symbol: stockSymbolSchema,
  summary: z.string(),
  sourceType: stockTimelineSourceTypeSchema,
  sourceTitle: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
  sourceDiaryId: serializedIdSchema.nullable(),
  sourceExternalId: z.string().nullable(),
  sourceExcerpt: z.string().nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),
  idempotencyKey: z.string().max(128),
  occurredAt: utcInstantSchema,
  createdVia: z.enum(['API_KEY', 'WEB', 'SYSTEM']),
  createdByLabel: z.string().nullable(),
  metadataJson: z.string().nullable(),
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}).strict()

export const stockTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict()

export const stockTimelineListResponseSchema = z.object({
  records: z.array(stockTimelineRecordSchema).max(200),
}).strict()

export const stockSymbolTimelineResponseSchema = z.object({
  stock: z.object({ symbol: stockSymbolSchema, name: z.string().nullable() }).strict(),
  records: z.array(stockTimelineRecordSchema).max(200),
}).strict()

export const webEvidenceRequestSchema = z.object({
  summary: z.string().trim().min(1).max(10_000),
  sourceType: stockTimelineSourceTypeSchema,
  sourceTitle: z.string().trim().max(255).nullable().optional(),
  sourceUrl: z.string().url().max(1_000).refine(value => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'sourceUrl must be an http(s) URL',
  }).nullable().optional(),
  occurredAt: utcInstantSchema,
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  metadataJson: z.string().optional(),
}).strict()

export type StockTimelineRecord = z.infer<typeof stockTimelineRecordSchema>
export function toStockTimelineRecordResponse(item: {
  id: bigint
  stock: { symbol: string }
  summary: string
  sourceType: string
  sourceTitle: string | null
  sourceUrl: string | null
  sourceDiaryId: bigint | null
  sourceExternalId: string | null
  sourceExcerpt: string | null
  confidence: number | null
  idempotencyKey: string
  occurredAt: Date | string
  createdVia: string
  createdByLabel: string | null
  metadataJson: string | null
  createdAt: Date | string
  updatedAt: Date | string
}): StockTimelineRecord {
  const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString()
  return stockTimelineRecordSchema.parse({
    id: String(item.id),
    symbol: item.stock.symbol,
    summary: item.summary,
    sourceType: item.sourceType,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl,
    sourceDiaryId: item.sourceDiaryId === null ? null : String(item.sourceDiaryId),
    sourceExternalId: item.sourceExternalId,
    sourceExcerpt: item.sourceExcerpt,
    confidence: item.confidence,
    idempotencyKey: item.idempotencyKey,
    occurredAt: iso(item.occurredAt),
    createdVia: item.createdVia,
    createdByLabel: item.createdByLabel,
    metadataJson: item.metadataJson,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  })
}


export const agentTimelineRecordSchema = z.object({
 symbol: stockSymbolSchema, summary: z.string().trim().min(1),
 sourceType: agentAllowedSourceTypeSchema,
 sourceTitle: z.string().trim().max(255).optional(), sourceUrl: z.string().url().max(1000).optional(),
 sourceDiaryId: serializedIdSchema.optional(), sourceExternalId: z.string().max(255).optional(), sourceExcerpt: z.string().optional(),
 confidence: z.number().int().min(0).max(100).optional(), idempotencyKey: z.string().trim().min(1).max(128), occurredAt: utcInstantSchema, metadataJson: z.string().optional(),
}).strict()
export const agentTimelineBatchRequestSchema = z.object({ records: z.array(agentTimelineRecordSchema).min(1).max(100) }).strict()
export const agentTimelineBatchResponseSchema = z.object({ created: z.array(serializedIdSchema).max(100), updated: z.array(serializedIdSchema).max(0), skipped: z.array(z.object({ symbol: stockSymbolSchema, reason: z.enum(['NOT_IN_WATCHLIST', 'SOURCE_DIARY_NOT_OWNED', 'ALREADY_EXISTS']) }).strict()).max(100) }).strict()
