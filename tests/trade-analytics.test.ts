import { describe, it, expect } from 'vitest'
import {
  matchTrades,
  calcWinRate,
  calcRealizedDrawdown,
  calcSharpe,
  groupByPeriod,
  calcPeriodStats,
  buildMonthlyReturnPcts,
  type RawTransaction,
  type ClosedTrade,
} from '../packages/domain/src/trade-analytics'

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeTx(
  overrides: Partial<RawTransaction> & Pick<RawTransaction, 'type' | 'quantity' | 'price'>
): RawTransaction {
  return {
    id: overrides.id ?? '1',
    symbol: overrides.symbol ?? 'AAPL',
    tradeDate: overrides.tradeDate ?? new Date('2024-01-10'),
    ...overrides,
  }
}

// ─── matchTrades ─────────────────────────────────────────────────────────────

describe('matchTrades', () => {
  it('empty array → returns empty array', () => {
    expect(matchTrades([])).toEqual([])
  })

  it('BUY only, no SELL → no closed trades', () => {
    const txs = [makeTx({ id: '1', type: 'BUY', quantity: 10, price: 100 })]
    expect(matchTrades(txs)).toEqual([])
  })

  it('single BUY then full SELL → computes PnL correctly', () => {
    const txs = [
      makeTx({ id: '1', type: 'BUY', quantity: 10, price: 100, tradeDate: new Date('2024-01-01') }),
      makeTx({ id: '2', type: 'SELL', quantity: 10, price: 120, tradeDate: new Date('2024-02-01') }),
    ]
    const result = matchTrades(txs)
    expect(result).toHaveLength(1)
    expect(result[0]!.realizedPnL).toBeCloseTo(200)        // (120-100)*10
    expect(result[0]!.realizedPnLPct).toBeCloseTo(20)      // 20%
    expect(result[0]!.avgCostBasis).toBeCloseTo(100)
    expect(result[0]!.symbol).toBe('AAPL')
  })

  it('multiple BUYs then partial SELL → average cost correct', () => {
    // Buy 10 @ 100, then 10 @ 200 → average cost 150
    // Sell 10 @ 180 → P&L (180-150)*10 = 300
    const txs = [
      makeTx({ id: '1', type: 'BUY', quantity: 10, price: 100, tradeDate: new Date('2024-01-01') }),
      makeTx({ id: '2', type: 'BUY', quantity: 10, price: 200, tradeDate: new Date('2024-01-15') }),
      makeTx({ id: '3', type: 'SELL', quantity: 10, price: 180, tradeDate: new Date('2024-02-01') }),
    ]
    const result = matchTrades(txs)
    expect(result).toHaveLength(1)
    expect(result[0]!.avgCostBasis).toBeCloseTo(150)
    expect(result[0]!.realizedPnL).toBeCloseTo(300)
  })

  it('losing trade → negative PnL', () => {
    const txs = [
      makeTx({ id: '1', type: 'BUY', quantity: 10, price: 150, tradeDate: new Date('2024-01-01') }),
      makeTx({ id: '2', type: 'SELL', quantity: 10, price: 100, tradeDate: new Date('2024-02-01') }),
    ]
    const result = matchTrades(txs)
    expect(result[0]!.realizedPnL).toBeCloseTo(-500)       // (100-150)*10
    expect(result[0]!.realizedPnLPct).toBeCloseTo(-33.333)
  })

  it('two different symbols computed independently', () => {
    const txs = [
      makeTx({ id: '1', symbol: 'AAPL', type: 'BUY', quantity: 5, price: 100 }),
      makeTx({ id: '2', symbol: 'TSLA', type: 'BUY', quantity: 3, price: 200 }),
      makeTx({ id: '3', symbol: 'AAPL', type: 'SELL', quantity: 5, price: 120, tradeDate: new Date('2024-02-01') }),
      makeTx({ id: '4', symbol: 'TSLA', type: 'SELL', quantity: 3, price: 180, tradeDate: new Date('2024-02-01') }),
    ]
    const result = matchTrades(txs)
    expect(result).toHaveLength(2)
    const aapl = result.find((r) => r.symbol === 'AAPL')!
    const tsla = result.find((r) => r.symbol === 'TSLA')!
    expect(aapl.realizedPnL).toBeCloseTo(100)             // (120-100)*5
    expect(tsla.realizedPnL).toBeCloseTo(-60)             // (180-200)*3
  })

  it('SELL without BUY → rejected, consistent with exact ledger', () => {
    const txs = [
      makeTx({ id: '1', type: 'SELL', quantity: 10, price: 100 }),
    ]
    expect(() => matchTrades(txs)).toThrow()
  })

  it('multiple SELLs closing in batches → each computed separately', () => {
    const txs = [
      makeTx({ id: '1', type: 'BUY', quantity: 20, price: 100, tradeDate: new Date('2024-01-01') }),
      makeTx({ id: '2', type: 'SELL', quantity: 10, price: 120, tradeDate: new Date('2024-02-01') }),
      makeTx({ id: '3', type: 'SELL', quantity: 10, price: 90,  tradeDate: new Date('2024-03-01') }),
    ]
    const result = matchTrades(txs)
    expect(result).toHaveLength(2)
    expect(result[0]!.realizedPnL).toBeCloseTo(200)   // (120-100)*10
    expect(result[1]!.realizedPnL).toBeCloseTo(-100)  // (90-100)*10
  })

  it('Decimal-like objects (Prisma Decimal) convert correctly', () => {
    // Prisma Decimal exposes a valueOf() method
    const decimalLike = (v: number) => ({ valueOf: () => v, toString: () => String(v) })
    const txs: RawTransaction[] = [
      {
        id: '1', symbol: 'AAPL', type: 'BUY',
        quantity: decimalLike(10), price: decimalLike(100),
        tradeDate: new Date('2024-01-01'),
      },
      {
        id: '2', symbol: 'AAPL', type: 'SELL',
        quantity: decimalLike(10), price: decimalLike(110),
        tradeDate: new Date('2024-02-01'),
      },
    ]
    const result = matchTrades(txs)
    expect(result[0]!.realizedPnL).toBeCloseTo(100)
  })

  it('sorted by tradeDate — date order affects average cost', () => {
    // Deliberately out of order to ensure the function sorts
    const txs = [
      makeTx({ id: '3', type: 'SELL', quantity: 10, price: 130, tradeDate: new Date('2024-03-01') }),
      makeTx({ id: '1', type: 'BUY', quantity: 10, price: 100, tradeDate: new Date('2024-01-01') }),
    ]
    const result = matchTrades(txs)
    expect(result).toHaveLength(1)
    expect(result[0]!.realizedPnL).toBeCloseTo(300)   // (130-100)*10
  })
})

// ─── calcWinRate ─────────────────────────────────────────────────────────────

describe('calcWinRate', () => {
  it('empty array → winRate = 0, no division by zero', () => {
    const r = calcWinRate([])
    expect(r.winRate).toBe(0)
    expect(r.total).toBe(0)
    expect(r.wins).toBe(0)
  })

  it('all wins → winRate = 100', () => {
    const trades: ClosedTrade[] = [
      { id: '1', symbol: 'A', strategy: null, emotion: null, sellDate: new Date(), sellQuantity: 1, sellPrice: 110, avgCostBasis: 100, realizedPnL: 10, realizedPnLPct: 10 },
      { id: '2', symbol: 'B', strategy: null, emotion: null, sellDate: new Date(), sellQuantity: 1, sellPrice: 220, avgCostBasis: 200, realizedPnL: 20, realizedPnLPct: 10 },
    ]
    const r = calcWinRate(trades)
    expect(r.wins).toBe(2)
    expect(r.losses).toBe(0)
    expect(r.winRate).toBeCloseTo(100)
  })

  it('all losses → winRate = 0', () => {
    const trades: ClosedTrade[] = [
      { id: '1', symbol: 'A', strategy: null, emotion: null, sellDate: new Date(), sellQuantity: 1, sellPrice: 90, avgCostBasis: 100, realizedPnL: -10, realizedPnLPct: -10 },
    ]
    const r = calcWinRate(trades)
    expect(r.wins).toBe(0)
    expect(r.losses).toBe(1)
    expect(r.winRate).toBe(0)
  })

  it('mixed 2 wins 1 loss → winRate = 66.67', () => {
    const make = (pnl: number) => ({
      id: String(pnl), symbol: 'X', strategy: null, emotion: null, sellDate: new Date(), sellQuantity: 1, sellPrice: 0,
      avgCostBasis: 0, realizedPnL: pnl, realizedPnLPct: 0,
    })
    const r = calcWinRate([make(10), make(20), make(-5)])
    expect(r.wins).toBe(2)
    expect(r.losses).toBe(1)
    expect(r.winRate).toBeCloseTo(66.667)
  })

  it('break-even trades (pnl=0) count as breakEven', () => {
    const make = (pnl: number) => ({
      id: String(pnl), symbol: 'X', strategy: null, emotion: null, sellDate: new Date(), sellQuantity: 1, sellPrice: 0,
      avgCostBasis: 0, realizedPnL: pnl, realizedPnLPct: 0,
    })
    const r = calcWinRate([make(10), make(0), make(-5)])
    expect(r.breakEven).toBe(1)
    expect(r.wins).toBe(1)
    expect(r.losses).toBe(1)
  })
})

// ─── calcRealizedDrawdown ────────────────────────────────────────────────────

describe('calcRealizedDrawdown', () => {
  const makeTrade = (id: string, date: string, qty: number, basis: number, pnl: number): ClosedTrade => ({
    id,
    symbol: 'X',
    strategy: null, emotion: null, sellDate: new Date(date),
    sellQuantity: qty,
    sellPrice: basis / qty + pnl / qty,
    avgCostBasis: basis / qty,
    realizedPnL: pnl,
    realizedPnLPct: (pnl / basis) * 100,
  })

  it('empty array → all zeros', () => {
    expect(calcRealizedDrawdown([])).toEqual({
      maxDrawdownPct: 0,
      maxDrawdownDollars: 0,
      peakPnL: 0,
      troughPnL: 0,
    })
  })

  it('monotonic gains (no drawdown) → 0', () => {
    const r = calcRealizedDrawdown([
      makeTrade('1', '2024-01-01', 10, 1000, 100),
      makeTrade('2', '2024-02-01', 10, 1000, 50),
    ])
    expect(r.maxDrawdownPct).toBe(0)
    expect(r.maxDrawdownDollars).toBe(0)
  })

  it('50k account with 2% drawdown → 2%, not 47% of an invented basis', () => {
    // Old implementation: peak = 100 + cumulative dollar P&L → garbage percentage
    const r = calcRealizedDrawdown([
      makeTrade('1', '2024-01-01', 500, 50000, 1000),
      makeTrade('2', '2024-02-01', 500, 50000, -2000),
    ])
    // cumPnL: +1000 → -1000；peak 1000，dd 2000；basis 50000+50000
    expect(r.maxDrawdownDollars).toBeCloseTo(2000)
    expect(r.maxDrawdownPct).toBeCloseTo(2, 1)
  })

  it('first trade is a loss → drawdown measured from 0', () => {
    const r = calcRealizedDrawdown([
      makeTrade('1', '2024-01-01', 10, 1000, -500),
    ])
    expect(r.maxDrawdownDollars).toBeCloseTo(500)
    expect(r.maxDrawdownPct).toBeCloseTo(50)
    expect(r.peakPnL).toBe(0)
    expect(r.troughPnL).toBeCloseTo(-500)
  })

  it('scale invariant: everything 10x → same percentages', () => {
    const small = calcRealizedDrawdown([
      makeTrade('1', '2024-01-01', 10, 1000, 100),
      makeTrade('2', '2024-02-01', 10, 1000, -300),
    ])
    const big = calcRealizedDrawdown([
      makeTrade('1', '2024-01-01', 100, 10000, 1000),
      makeTrade('2', '2024-02-01', 100, 10000, -3000),
    ])
    expect(big.maxDrawdownPct).toBeCloseTo(small.maxDrawdownPct, 10)
  })
})

// ─── calcSharpe ──────────────────────────────────────────────────────────────

describe('calcSharpe', () => {
  it('empty array → sharpe = null', () => {
    expect(calcSharpe([]).sharpe).toBeNull()
  })

  it('zero variance (all returns identical) → sharpe = null', () => {
    expect(calcSharpe([5, 5, 5, 5]).sharpe).toBeNull()
  })

  it('positive Sharpe: mean return > risk-free rate', () => {
    // High average return, low volatility → sharpe > 0
    const returns = [3, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5]
    const r = calcSharpe(returns, 0)
    expect(r.sharpe).not.toBeNull()
    expect(r.sharpe!).toBeGreaterThan(0)
  })

  it('negative Sharpe: mean return < risk-free rate', () => {
    // Low returns, high volatility
    const returns = [-3, -4, -5, -3, -4, -5]
    const r = calcSharpe(returns, 0)
    expect(r.sharpe).not.toBeNull()
    expect(r.sharpe!).toBeLessThan(0)
  })

  it('single return → stdDev = 0 → sharpe = null', () => {
    expect(calcSharpe([5]).sharpe).toBeNull()
  })
})

// ─── groupByPeriod ───────────────────────────────────────────────────────────

describe('groupByPeriod', () => {
  const makeTrade = (id: string, date: string, pnl: number): ClosedTrade => ({
    id,
    symbol: 'X',
    strategy: null, emotion: null, sellDate: new Date(date),
    sellQuantity: 1,
    sellPrice: 0,
    avgCostBasis: 0,
    realizedPnL: pnl,
    realizedPnLPct: 0,
  })

  it('groups by month', () => {
    const trades = [
      makeTrade('1', '2024-01-15', 100),
      makeTrade('2', '2024-01-25', 50),
      makeTrade('3', '2024-02-10', -30),
    ]
    const grouped = groupByPeriod(trades, 'month')
    expect(grouped.get('2024-01')).toHaveLength(2)
    expect(grouped.get('2024-02')).toHaveLength(1)
  })

  it('groups by quarter', () => {
    const trades = [
      makeTrade('1', '2024-01-15', 100),  // Q1
      makeTrade('2', '2024-04-10', 50),   // Q2
      makeTrade('3', '2024-03-25', -30),  // Q1
    ]
    const grouped = groupByPeriod(trades, 'quarter')
    expect(grouped.get('2024-Q1')).toHaveLength(2)
    expect(grouped.get('2024-Q2')).toHaveLength(1)
  })

  it('groups by year', () => {
    const trades = [
      makeTrade('1', '2023-06-01', 100),
      makeTrade('2', '2024-03-01', 50),
      makeTrade('3', '2024-12-31', -30),
    ]
    const grouped = groupByPeriod(trades, 'year')
    expect(grouped.get('2023')).toHaveLength(1)
    expect(grouped.get('2024')).toHaveLength(2)
  })

  it('year boundary (Dec/Jan)', () => {
    const trades = [
      makeTrade('1', '2023-12-31', 100),
      makeTrade('2', '2024-01-01', 50),
    ]
    const grouped = groupByPeriod(trades, 'month')
    expect(grouped.get('2023-12')).toHaveLength(1)
    expect(grouped.get('2024-01')).toHaveLength(1)
  })
})

// ─── calcPeriodStats ─────────────────────────────────────────────────────────

describe('calcPeriodStats', () => {
  const makeTrade = (id: string, pnl: number): ClosedTrade => ({
    id,
    symbol: 'X',
    strategy: null, emotion: null, sellDate: new Date(),
    sellQuantity: 1,
    sellPrice: 0,
    avgCostBasis: 0,
    realizedPnL: pnl,
    realizedPnLPct: 0,
  })

  it('computes per-period PnL and win rate correctly', () => {
    const grouped = new Map([
      ['2024-01', [makeTrade('1', 100), makeTrade('2', -50)]],
      ['2024-02', [makeTrade('3', 200)]],
    ])
    const stats = calcPeriodStats(grouped)
    expect(stats).toHaveLength(2)

    const jan = stats.find((s) => s.period === '2024-01')!
    expect(jan.realizedPnL).toBe(50)
    expect(jan.tradeCount).toBe(2)
    expect(jan.winRate).toBeCloseTo(50)

    const feb = stats.find((s) => s.period === '2024-02')!
    expect(feb.realizedPnL).toBe(200)
    expect(feb.winRate).toBe(100)
  })

  it('returns periods in ascending time order', () => {
    const grouped = new Map([
      ['2024-03', [makeTrade('3', 10)]],
      ['2024-01', [makeTrade('1', 10)]],
      ['2024-02', [makeTrade('2', 10)]],
    ])
    const stats = calcPeriodStats(grouped)
    expect(stats.map((s) => s.period)).toEqual(['2024-01', '2024-02', '2024-03'])
  })
})

// ─── buildMonthlyReturnPcts ──────────────────────────────────────────────────

describe('buildMonthlyReturnPcts', () => {
  const makeTrade = (id: string, date: string, qty: number, basis: number, pnl: number): ClosedTrade => ({
    id,
    symbol: 'X',
    strategy: null, emotion: null, sellDate: new Date(date),
    sellQuantity: qty,
    sellPrice: 0,
    avgCostBasis: basis / qty,
    realizedPnL: pnl,
    realizedPnLPct: (pnl / basis) * 100,
  })

  it('empty array → []', () => {
    expect(buildMonthlyReturnPcts([])).toEqual([])
  })

  it('monthly return = Σpnl / Σbasis (percentage, not dollars)', () => {
    const trades = [
      makeTrade('1', '2024-01-10', 10, 1000, 200),   // +20%
      makeTrade('2', '2024-02-10', 10, 1500, -150),  // -10%
    ]
    expect(buildMonthlyReturnPcts(trades)).toEqual([20, -10])
  })

  it('multiple trades in a month → sums pnl and basis separately, then divides', () => {
    const trades = [
      makeTrade('1', '2024-01-10', 10, 1000, 100),  // +10%
      makeTrade('2', '2024-01-20', 10, 1000, -50),  // -5%
    ]
    // (100-50) / 2000 = +2.5%
    expect(buildMonthlyReturnPcts(trades)).toEqual([2.5])
  })

  it('months with no closings in between are filled with 0', () => {
    const trades = [
      makeTrade('1', '2024-01-10', 10, 1000, 200),  // +20%
      makeTrade('2', '2024-03-10', 10, 1000, -100), // -10%
    ]
    expect(buildMonthlyReturnPcts(trades)).toEqual([20, 0, -10])
  })

  it('year boundary (Dec→Feb) → January filled with 0', () => {
    const trades = [
      makeTrade('1', '2024-12-15', 10, 1000, 100),
      makeTrade('2', '2025-02-15', 10, 1000, -100),
    ]
    expect(buildMonthlyReturnPcts(trades)).toEqual([10, 0, -10])
  })
})

// ─── Integration: full pipeline ──────────────────────────────────────────────

describe('integration: matchTrades → calcWinRate → calcRealizedDrawdown → calcSharpe', () => {
  it('full trade lifecycle computed end to end', () => {
    const txs: RawTransaction[] = [
      // AAPL: buy 10 @ 100, sell 10 @ 120 → +200 (basis 1000)
      { id: '1', symbol: 'AAPL', type: 'BUY',  quantity: 10, price: 100, tradeDate: new Date('2024-01-01') },
      { id: '2', symbol: 'AAPL', type: 'SELL', quantity: 10, price: 120, tradeDate: new Date('2024-02-01') },
      // TSLA: buy 5 @ 200, sell 5 @ 160 → -200 (basis 1000)
      { id: '3', symbol: 'TSLA', type: 'BUY',  quantity: 5,  price: 200, tradeDate: new Date('2024-01-15') },
      { id: '4', symbol: 'TSLA', type: 'SELL', quantity: 5,  price: 160, tradeDate: new Date('2024-03-01') },
      // NVDA: buy 2 @ 500, sell 2 @ 600 → +200 (basis 1000)
      { id: '5', symbol: 'NVDA', type: 'BUY',  quantity: 2,  price: 500, tradeDate: new Date('2024-02-15') },
      { id: '6', symbol: 'NVDA', type: 'SELL', quantity: 2,  price: 600, tradeDate: new Date('2024-04-01') },
    ]

    const closed = matchTrades(txs)
    expect(closed).toHaveLength(3)

    const { winRate, wins, losses } = calcWinRate(closed)
    expect(wins).toBe(2)
    expect(losses).toBe(1)
    expect(winRate).toBeCloseTo(66.667)

    // By date: AAPL+200 → TSLA-200 → NVDA+200
    const dd = calcRealizedDrawdown(closed)
    // cumPnL falls from +200 back to 0, dd=200; cumulative basis at that point = 2000 → 10%
    expect(dd.maxDrawdownDollars).toBeCloseTo(200)
    expect(dd.maxDrawdownPct).toBeCloseTo(10)

    // Monthly return series: Feb +20%, Mar -20%, Apr +20%
    const monthly = buildMonthlyReturnPcts(closed)
    expect(monthly).toEqual([20, -20, 20])
    const { sharpe } = calcSharpe(monthly)
    expect(sharpe).not.toBeNull()
  })
})

it('does not report an enormous Sharpe for identical returns differing only by floating resolution', () => {
  expect(calcSharpe([99999999899.99995, 99999999899.99994]).sharpe).toBeNull()
  expect(calcSharpe([99999999899, 99999999900]).sharpe).not.toBeNull()
})
