import { describe, expect, it } from 'vitest'
import { marketStateHistoryQuerySchema, marketStateSnapshotQuerySchema, marketStateSnapshotSchema } from '../../packages/contracts/src/market-state'

describe('market state contracts', () => {
  it('keeps snapshot query guest-strict and history bounded', () => {
    expect(marketStateSnapshotQuerySchema.parse({})).toEqual({})
    expect(marketStateSnapshotQuerySchema.safeParse({ universeKey: 'SP500_NDX' }).success).toBe(false)
    expect(marketStateHistoryQuerySchema.parse({})).toEqual({ days: 120 })
    expect(marketStateHistoryQuerySchema.parse({ days: '30' })).toEqual({ days: 30 })
    expect(marketStateHistoryQuerySchema.safeParse({ days: 0 }).success).toBe(false)
    expect(marketStateHistoryQuerySchema.safeParse({ days: 366 }).success).toBe(false)
  })

  it('requires canonical state labels and preserves nullable metrics', () => {
    const snapshot = marketStateSnapshotSchema.parse({
      universeKey: 'SP500_NDX', date: '2026-09-05', latestPriceDate: '2026-09-05',
      coveragePct: null, isStale: true, marketState: 'unknown', score: null,
      up4: null, down4: null, up4Pct: null, down4Pct: null, ratio10d: null, above40dPct: null,
      suggestedExposure: '40-60%', message: 'Market state unknown. Use caution.',
    })
    expect(snapshot.coveragePct).toBeNull()
    expect(marketStateSnapshotSchema.safeParse({ ...snapshot, regime: 'RISK_ON' }).success).toBe(false)
  })
})
