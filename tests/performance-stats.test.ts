import { describe, it, expect } from 'vitest'
import { computePerformanceStats } from '../packages/domain/src/performance-stats'
import type { RawTransactionRecord } from '../packages/domain/src/performance-stats'

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

function makeTx(
  overrides: Partial<RawTransactionRecord> &
    Pick<RawTransactionRecord, 'type' | 'quantity' | 'price'>,
): RawTransactionRecord {
  return {
    id: overrides.id ?? '1',
    symbol: overrides.symbol ?? 'AAPL',
    tradeDate: overrides.tradeDate ?? new Date('2024-01-10'),
    ...overrides,
  }
}

/** 產生一組完整的 round-trip（BUY 後 SELL 全平） */
function roundTrip(
  id: string,
  symbol: string,
  quantity: number,
  buyPrice: number,
  sellPrice: number,
  buyDate: string,
  sellDate: string,
): RawTransactionRecord[] {
  return [
    makeTx({ id: `${id}-b`, symbol, type: 'BUY', quantity, price: buyPrice, tradeDate: new Date(buyDate) }),
    makeTx({ id: `${id}-s`, symbol, type: 'SELL', quantity, price: sellPrice, tradeDate: new Date(sellDate) }),
  ]
}

// ─── Sharpe：百分比報酬，非美元損益 ──────────────────────────────────────────

describe('computePerformanceStats — sharpe', () => {
  it('尺度不變：10x 損益 + 10x 成本基礎 → 相同 sharpe', () => {
    // 月報酬序列：1月 +20%、2月（無平倉）0、3月 -10%
    const small = computePerformanceStats(
      [
        ...roundTrip('1', 'AAA', 10, 100, 120, '2024-01-01', '2024-01-15'),
        ...roundTrip('2', 'BBB', 10, 150, 135, '2024-03-01', '2024-03-15'),
      ],
      { period: 'month' },
    )
    const big = computePerformanceStats(
      [
        ...roundTrip('1', 'AAA', 100, 100, 120, '2024-01-01', '2024-01-15'),
        ...roundTrip('2', 'BBB', 100, 150, 135, '2024-03-01', '2024-03-15'),
      ],
      { period: 'month' },
    )

    expect(small.summary.sharpe).not.toBeNull()
    expect(big.summary.sharpe).not.toBeNull()
    expect(big.summary.sharpe!).toBeCloseTo(small.summary.sharpe!, 10)
  })

  it('各月報酬率相同但美元規模不同 → 零波動 → sharpe = null', () => {
    // 1月 小倉位 +10%（+$100）、2月 大倉位 +10%（+$1000）
    // 餵美元損益的舊實作會算出非 null 的 sharpe（[100, 1000] 有波動）
    const result = computePerformanceStats(
      [
        ...roundTrip('1', 'AAA', 10, 100, 110, '2024-01-01', '2024-01-15'),
        ...roundTrip('2', 'BBB', 100, 100, 110, '2024-02-01', '2024-02-15'),
      ],
      { period: 'month' },
    )
    expect(result.summary.sharpe).toBeNull()
  })
})

// ─── topWins / topLosses：先 filter 再 slice ─────────────────────────────────

describe('computePerformanceStats — topWins/topLosses', () => {
  it('top 5 窗口內夾雜虧損時，不擠掉第 6 名的獲利', () => {
    // pnl 由大到小：+100, +90, -80, +70, +60, +50
    // 舊實作 slice(0,5).filter(>0) 只剩 4 筆，丟掉 +50 那筆
    const txs = [
      ...roundTrip('1', 'A', 10, 100, 110, '2024-01-01', '2024-01-02'), // +100
      ...roundTrip('2', 'B', 10, 100, 109, '2024-01-03', '2024-01-04'), // +90
      ...roundTrip('3', 'C', 10, 100, 92, '2024-01-05', '2024-01-06'),  // -80
      ...roundTrip('4', 'D', 10, 100, 107, '2024-01-07', '2024-01-08'), // +70
      ...roundTrip('5', 'E', 10, 100, 106, '2024-01-09', '2024-01-10'), // +60
      ...roundTrip('6', 'F', 10, 100, 105, '2024-01-11', '2024-01-12'), // +50
    ]
    const result = computePerformanceStats(txs, { period: 'month' })

    expect(result.topWins).toHaveLength(5)
    expect(result.topWins.map((t) => t.symbol)).toEqual(['A', 'B', 'D', 'E', 'F'])
    expect(result.topWins.every((t) => t.realizedPnL > 0)).toBe(true)
  })

  it('top 5 虧損窗口內夾雜獲利時，不擠掉第 6 名的虧損', () => {
    // pnl 由小到大：-100, -90, +80, -70, -60, -50
    const txs = [
      ...roundTrip('1', 'A', 10, 100, 90, '2024-01-01', '2024-01-02'),  // -100
      ...roundTrip('2', 'B', 10, 100, 91, '2024-01-03', '2024-01-04'),  // -90
      ...roundTrip('3', 'C', 10, 100, 108, '2024-01-05', '2024-01-06'), // +80
      ...roundTrip('4', 'D', 10, 100, 93, '2024-01-07', '2024-01-08'),  // -70
      ...roundTrip('5', 'E', 10, 100, 94, '2024-01-09', '2024-01-10'),  // -60
      ...roundTrip('6', 'F', 10, 100, 95, '2024-01-11', '2024-01-12'),  // -50
    ]
    const result = computePerformanceStats(txs, { period: 'month' })

    expect(result.topLosses).toHaveLength(5)
    expect(result.topLosses.map((t) => t.symbol)).toEqual(['A', 'B', 'D', 'E', 'F'])
    expect(result.topLosses.every((t) => t.realizedPnL < 0)).toBe(true)
  })
})

it('inherits BUY attributes through partial exits and clears them when a new position starts', () => {
  const txs: RawTransactionRecord[] = [
    makeTx({ type: 'BUY', quantity: 2, price: 10, strategy: ' First ', emotion: ' calm ', tradeDate: new Date('2026-01-01') }),
    makeTx({ type: 'SELL', quantity: 1, price: 11, strategy: 'Exit override', tradeDate: new Date('2026-01-02') }),
    makeTx({ type: 'SELL', quantity: 1, price: 9, tradeDate: new Date('2026-01-03') }),
    makeTx({ type: 'BUY', quantity: 1, price: 10, tradeDate: new Date('2026-02-01') }),
    makeTx({ type: 'SELL', quantity: 1, price: 12, tradeDate: new Date('2026-02-02') }),
  ]
  const result = computePerformanceStats(txs, { period: 'month' })
  expect(result.strategyBreakdown).toEqual([{ name: 'Exit override', tradeCount: 1, realizedPnL: 1, winRate: 100 }, { name: 'First', tradeCount: 1, realizedPnL: -1, winRate: 0 }])
  expect(result.emotionBreakdown).toEqual([{ name: 'calm', tradeCount: 2, realizedPnL: 0, winRate: 50 }])
  expect(result.summary.totalRealizedPnL).toBe(2)
})
it('keeps decimal break-even exact and UTC grouping independent of timezone offsets', () => {
  const result = computePerformanceStats([
    makeTx({ type: 'BUY', quantity: '0.3', price: '0.1', tradeDate: new Date('2026-01-01') }),
    makeTx({ type: 'SELL', quantity: '0.1', price: '0.1', tradeDate: new Date('2026-03-01T00:30:00+08:00') }),
    makeTx({ type: 'SELL', quantity: '0.2', price: '0.1', tradeDate: new Date('2026-03-01T01:30:00+08:00') }),
  ], { period: 'month' })
  expect(result.summary).toMatchObject({ totalClosedTrades: 2, totalRealizedPnL: 0, wins: 0, losses: 0 })
  expect(result.periodStats).toEqual([{ period: '2026-02', realizedPnL: 0, tradeCount: 2, winCount: 0, winRate: 0 }])
})
it('returns isolated empty results rather than shared mutable arrays', () => {
  const first = computePerformanceStats([], { period: 'month' }); first.summary.wins = 99; first.periodStats.push({ period: 'wrong', realizedPnL: 1, tradeCount: 1, winCount: 1, winRate: 100 })
  const second = computePerformanceStats([], { period: 'month' }); expect(second.summary.wins).toBe(0); expect(second.periodStats).toEqual([])
})
