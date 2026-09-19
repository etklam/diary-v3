import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { stockTimelineRecords, type Database } from '@diary/db'
import type { StockTimelineSourceType } from '@diary/contracts/stock-timeline-source'

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type StockTimelineCaptureInput = {
  userId: bigint
  stockId: bigint
  summary: string
  sourceType: StockTimelineSourceType
  sourceTitle?: string | null
  sourceUrl?: string | null
  sourceDiaryId?: bigint | null
  sourceExternalId?: string | null
  sourceExcerpt?: string | null
  confidence?: number | null
  idempotencyKey?: string
  occurredAt: Date
  createdVia: 'API_KEY' | 'WEB' | 'SYSTEM'
  createdByLabel?: string | null
  metadataJson?: string | null
  now: Date
}

export async function insertStockTimelineRecord(tx: DbTransaction, input: StockTimelineCaptureInput) {
  const idempotencyKey = input.idempotencyKey ?? randomUUID()
  const values = {
    userId: input.userId,
    stockId: input.stockId,
    summary: input.summary,
    sourceType: input.sourceType,
    sourceTitle: input.sourceTitle ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceDiaryId: input.sourceDiaryId ?? null,
    sourceExternalId: input.sourceExternalId ?? null,
    sourceExcerpt: input.sourceExcerpt ?? null,
    confidence: input.confidence ?? null,
    idempotencyKey,
    occurredAt: input.occurredAt,
    createdVia: input.createdVia,
    createdByLabel: input.createdByLabel ?? null,
    metadataJson: input.metadataJson ?? null,
    createdAt: input.now,
    updatedAt: input.now,
  }
  const [created] = await tx.insert(stockTimelineRecords).values(values)
    .onConflictDoNothing({ target: [stockTimelineRecords.userId, stockTimelineRecords.stockId, stockTimelineRecords.idempotencyKey] })
    .returning()
  if (created) return { record: created, created: true }

  const [existing] = await tx.select().from(stockTimelineRecords).where(and(
    eq(stockTimelineRecords.userId, input.userId),
    eq(stockTimelineRecords.stockId, input.stockId),
    eq(stockTimelineRecords.idempotencyKey, idempotencyKey),
  ))
  if (!existing) throw new Error('Stock timeline record unavailable after insert')
  return { record: existing, created: false }
}
