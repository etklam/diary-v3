import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildReportContext, readReportContext } from '../../apps/api/src/ai-reports/context'
import { provisionTestDatabase } from '../support/database'
import { sql } from 'drizzle-orm'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let ownerId: bigint
let otherOwnerId: bigint
let ownerPeriodDiaryId: bigint

beforeAll(async () => {
  database = await provisionTestDatabase('ai_reports_context')
  const users = await database.pool.query<{ id: bigint }>(
    `INSERT INTO users(email, password, timezone, locale)
     VALUES ('ai-context-owner@example.test', 'synthetic', 'UTC', 'en'),
            ('ai-context-other@example.test', 'synthetic', 'UTC', 'en')
     RETURNING id`,
  )
  ownerId = users.rows[0]!.id
  otherOwnerId = users.rows[1]!.id

  const diaries = await database.pool.query<{ id: bigint }>(
    `INSERT INTO diaries(user_id, title, content, date, tags, thesis, execution)
     VALUES ($1, 'Owner opening', 'Owner opening record', '2026-03-01', ARRAY['synthetic']::text[], 'Opening thesis', 'Opening execution'),
            ($1, 'Owner period', 'Owner period record', '2026-03-05', ARRAY['synthetic']::text[], 'Period thesis', 'Period execution'),
            ($2, 'Other period', 'Other owner record', '2026-03-05', ARRAY['synthetic']::text[], 'Other thesis', 'Other execution')
     RETURNING id`,
    [ownerId, otherOwnerId],
  )
  const openingDiaryId = diaries.rows[0]!.id
  ownerPeriodDiaryId = diaries.rows[1]!.id
  const otherPeriodDiaryId = diaries.rows[2]!.id
  await database.pool.query(
    `INSERT INTO transactions(diary_id, user_id, symbol, type, quantity, price, trade_date, notes)
     VALUES ($1, $3, 'AAPL', 'BUY', 10, 100, '2026-03-01T10:00:00.000Z', 'Owner opening'),
            ($2, $3, 'AAPL', 'SELL', 4, 120, '2026-03-05T10:00:00.000Z', 'Owner period'),
            ($4, $5, 'MSFT', 'BUY', 2, 200, '2026-03-05T10:00:00.000Z', 'Other owner')`,
    [openingDiaryId, ownerPeriodDiaryId, ownerId, otherPeriodDiaryId, otherOwnerId],
  )
  await database.pool.query(
    `INSERT INTO disciplines(user_id, content, display_order, created_at)
     VALUES ($1, 'Owner discipline', 0, '2026-01-01T00:00:00.000Z'),
            ($2, 'Other discipline', 0, '2026-01-01T00:00:00.000Z')`,
    [ownerId, otherOwnerId],
  )
  await database.pool.query(
    `INSERT INTO ai_user_access(user_id, data_revision)
     VALUES ($1, 9), ($2, 12)
     ON CONFLICT (user_id) DO UPDATE SET data_revision = excluded.data_revision`,
    [ownerId, otherOwnerId],
  )
})

afterAll(async () => { await database?.dispose() })

const contextInput = (userId: bigint) => ({
  userId,
  periodType: 'weekly' as const,
  periodStart: '2026-03-02',
  timezone: 'UTC',
  locale: 'en' as const,
  capturedAt: new Date('2026-03-16T00:00:00.000Z'),
})

describe('AI report context with disposable PostgreSQL', () => {
  it('keeps source rows and revision owner-scoped, including pre-period dependencies', async () => {
    const result = await buildReportContext(database.db, contextInput(ownerId))

    expect(result.dataRevision).toBe(9)
    expect(result.context.diaries.map(row => row.title)).toEqual(['Owner period'])
    expect(result.context.transactions).toEqual([expect.objectContaining({ sourceId: 'T1', symbol: 'AAPL', diaryId: 'D1' })])
    expect(result.context.holdings).toEqual([expect.objectContaining({ symbol: 'AAPL', quantity: '6', totalCost: '600' })])
    expect(result.context.closedTrades).toEqual([expect.objectContaining({ sourceId: 'T1', realizedPnL: '80' })])
    expect(result.sourceManifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: ownerId.toString(), alias: 'TD1', sourceId: '1', dependency: true }),
      expect.objectContaining({ ownerId: ownerId.toString(), alias: 'T1', sourceId: '2', dependency: false }),
    ]))
    expect(result.sourceManifest.every(source => source.ownerId === ownerId.toString())).toBe(true)
    expect(JSON.stringify(result.context)).not.toContain('Other owner record')
    expect(result.context).not.toHaveProperty('userId')
    expect(result.context.sources.every(source => !('sourceId' in source))).toBe(true)
  })

  it('can read from a caller-owned transaction without opening a nested transaction', async () => {
    const result = await database.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(7441, hashtext(${ownerId.toString()}))`)
      return readReportContext(tx, contextInput(ownerId))
    })
    expect(result.inputSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.dataRevision).toBe(9)
  })

  it('bounds SQL reads with a sentinel row and returns the same typed limit error', async () => {
    await expect(buildReportContext(database.db, { ...contextInput(ownerId), limits: { maxRows: 1 } }))
      .rejects.toMatchObject({ code: 'AI_REPORT_CONTEXT_TOO_LARGE', limit: 'maxRows' })
  })
})
