/**
 * lib/trade-analytics.ts
 * Centralized trade performance analytics engine
 *
 * Design principles:
 * - Pure functions, no side effects, no DB dependencies
 * - Average cost method (consistent with calculateHoldings())
 * - Zero-value guards before every division
 * - Decimals converted to number at the input layer to avoid a Prisma runtime dependency
 */

// ─── Input types ─────────────────────────────────────────────────────────────

export interface RawTransaction {
  id: string | bigint | number
  symbol: string
  type: 'BUY' | 'SELL'
  /** Accepts a Prisma Decimal (already has toString/valueOf) or a number */
  quantity: { valueOf(): number } | number | string
  price: { valueOf(): number } | number | string
  tradeDate: Date | string
  strategy?: string | null
  emotion?: string | null
}

// ─── Output types ────────────────────────────────────────────────────────────

/** A matched (closed) trade: one SELL paired against the average cost */
export interface ClosedTrade {
  id: string
  symbol: string
  sellDate: Date
  sellQuantity: number
  sellPrice: number
  avgCostBasis: number      // average cost at the time of sale
  realizedPnL: number       // realized P&L (pre-tax)
  realizedPnLPct: number    // realized P&L percentage
  strategy: string | null
  emotion: string | null
}

export interface WinRateResult {
  wins: number
  losses: number
  breakEven: number
  total: number
  winRate: number           // 0–100, null when N/A
}

export interface RealizedDrawdownResult {
  maxDrawdownPct: number    // 0–100 (positive value = loss magnitude, relative to cumulative invested cost)
  maxDrawdownDollars: number // peak-to-trough max drawdown of cumulative realized P&L (USD)
  peakPnL: number
  troughPnL: number
}

export interface SharpeResult {
  sharpe: number | null     // null = zero volatility (cannot compute)
  avgReturn: number
  stdDev: number
}

export type GroupPeriod = 'month' | 'quarter' | 'year'

export interface PeriodStats {
  period: string            // e.g. "2024-03", "2024-Q1", "2024"
  realizedPnL: number
  tradeCount: number
  winCount: number
  winRate: number           // 0–100
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { replayLedger } from './ledger.js'

function periodKey(date: Date, period: GroupPeriod): string {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1 // 1-12
  if (period === 'year') return `${y}`
  if (period === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`
  return `${y}-${String(m).padStart(2, '0')}`
}

// ─── Core functions ──────────────────────────────────────────────────────────

/**
 * matchTrades
 * Uses the average cost method to match SELL transactions against their BUY
 * lots and compute the realized P&L of each SELL.
 *
 * Algorithm:
 * 1. Sort ascending by tradeDate (ties broken by original order)
 * 2. On BUY → update that symbol's average cost and position size
 * 3. On SELL → realized P&L = (sell price - average cost) × quantity
 * 4. Shares exact matching with the ledger writer; invalid oversells are rejected by the ledger.
 */
export function matchTrades(transactions: RawTransaction[]): ClosedTrade[] {
  const rows = transactions.map((tx, index) => ({ ...tx, index,
    quantity: String(typeof tx.quantity === 'object' ? tx.quantity.valueOf() : tx.quantity),
    price: String(typeof tx.price === 'object' ? tx.price.valueOf() : tx.price),
  })).sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime() || a.index - b.index)
  const closed = replayLedger(rows.map(tx => ({ ...tx, id: String(tx.index), order: BigInt(tx.index) }))).closedTrades
  const quantities = new Map<string, bigint>()
  const metadata = new Map<string, { strategy: string | null; emotion: string | null }>()
  const atSale = new Map<string, { strategy: string | null; emotion: string | null }>()
  for (const tx of rows) {
    const symbol = tx.symbol.trim().toUpperCase(), previous = metadata.get(symbol) ?? { strategy: null, emotion: null }
    const attributes = { strategy: tx.strategy?.trim() || previous.strategy, emotion: tx.emotion?.trim() || previous.emotion }
    const [whole, part = ''] = tx.quantity.split('.')
    const quantity = BigInt(whole!) * 10000n + BigInt(part.padEnd(4, '0'))
    const remaining = (quantities.get(symbol) ?? 0n) + (tx.type === 'BUY' ? quantity : -quantity)
    if (tx.type === 'BUY') metadata.set(symbol, attributes)
    else atSale.set(String(tx.index), attributes)
    if (remaining === 0n) { quantities.delete(symbol); metadata.delete(symbol) }
    else quantities.set(symbol, remaining)
  }
  return closed.map(trade => ({ ...trade, id: String(transactions[Number(trade.id)]!.id),
    sellQuantity: Number(trade.sellQuantity), sellPrice: Number(trade.sellPrice), avgCostBasis: Number(trade.avgCostBasis),
    realizedPnL: Number(trade.realizedPnL), realizedPnLPct: Number(trade.realizedPnLPct), ...atSale.get(trade.id)!,
  }))
}

/**
 * calcWinRate
 * Win rate: realizedPnL > 0 is a win, < 0 a loss, = 0 a break-even.
 *
 * Edge case: empty array → winRate = 0 (no division by zero).
 */
export function calcWinRate(trades: ClosedTrade[]): WinRateResult {
  const wins = trades.filter((t) => t.realizedPnL > 0).length
  const losses = trades.filter((t) => t.realizedPnL < 0).length
  const breakEven = trades.filter((t) => t.realizedPnL === 0).length
  const total = trades.length
  const winRate = total > 0 ? (wins / total) * 100 : 0

  return { wins, losses, breakEven, total, winRate }
}

/**
 * calcRealizedDrawdown
 * Max drawdown computed from closed trades.
 *
 * Without deposit/withdrawal data the true equity curve can't be rebuilt, so:
 * - Dollar drawdown = peak-to-trough of cumulative realized P&L (starting from 0, exact)
 * - Percentage = dollar drawdown at that point ÷ cumulative invested cost at that point (closed cost basis)
 *
 * ponytail: assumes each closed trade's basis is independently invested capital;
 * if the same capital keeps rolling over, the percentage understates (the dollar value stays exact).
 * More accuracy would require importing deposit/withdrawal records.
 *
 * Edge case: empty array or no drawdown → all zeros.
 */
export function calcRealizedDrawdown(trades: ClosedTrade[]): RealizedDrawdownResult {
  const result: RealizedDrawdownResult = {
    maxDrawdownPct: 0,
    maxDrawdownDollars: 0,
    peakPnL: 0,
    troughPnL: 0,
  }
  if (!trades.length) return result

  const sorted = [...trades].sort((a, b) => a.sellDate.getTime() - b.sellDate.getTime())

  let cumPnL = 0
  let cumBasis = 0
  let peak = 0 // starting at 0 counts as the initial equity

  for (const trade of sorted) {
    cumPnL += trade.realizedPnL
    cumBasis += trade.sellQuantity * trade.avgCostBasis
    if (cumPnL > peak) peak = cumPnL

    const drawdown = peak - cumPnL
    if (drawdown > result.maxDrawdownDollars && cumBasis > 0) {
      result.maxDrawdownDollars = drawdown
      result.maxDrawdownPct = (drawdown / cumBasis) * 100
      result.peakPnL = peak
      result.troughPnL = cumPnL
    }
  }

  return result
}

/**
 * calcSharpe
 * Annualized Sharpe ratio.
 *
 * @param returns - per-period return rates (percent, e.g. [2.1, -1.3, 0.8])
 * @param riskFreeRate - risk-free rate (annualized percent, default 0)
 * @param periodsPerYear - periods per year (daily=252, monthly=12, default 12)
 *
 * Edge case: return std dev = 0 → sharpe = null.
 */
export function calcSharpe(
  returns: number[],
  riskFreeRate = 0,
  periodsPerYear = 12
): SharpeResult {
  if (returns.length === 0) {
    return { sharpe: null, avgReturn: 0, stdDev: 0 }
  }

  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const periodRiskFree = riskFreeRate / periodsPerYear

  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  const stdDev = Math.sqrt(variance)

  // Treat differences within floating-point resolution as zero volatility,
  // including large but mathematically identical monthly returns.
  const resolution = Math.max(1e-10, Math.abs(avgReturn) * Number.EPSILON * 8)
  if (stdDev < resolution) {
    return { sharpe: null, avgReturn, stdDev: 0 }
  }

  const sharpe = ((avgReturn - periodRiskFree) / stdDev) * Math.sqrt(periodsPerYear)

  return { sharpe, avgReturn, stdDev }
}

/**
 * groupByPeriod
 * Group closed trades by time period.
 */
export function groupByPeriod(
  trades: ClosedTrade[],
  period: GroupPeriod
): Map<string, ClosedTrade[]> {
  const result = new Map<string, ClosedTrade[]>()

  for (const trade of trades) {
    const key = periodKey(trade.sellDate, period)
    const existing = result.get(key) ?? []
    existing.push(trade)
    result.set(key, existing)
  }

  return result
}

/**
 * calcPeriodStats
 * Compute per-period stats for the grouped trades, returned in ascending time order.
 */
export function calcPeriodStats(
  grouped: Map<string, ClosedTrade[]>
): PeriodStats[] {
  const result: PeriodStats[] = []

  for (const [period, trades] of grouped) {
    const realizedPnL = trades.reduce((sum, t) => sum + t.realizedPnL, 0)
    const winCount = trades.filter((t) => t.realizedPnL > 0).length
    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0

    result.push({
      period,
      realizedPnL,
      tradeCount: trades.length,
      winCount,
      winRate,
    })
  }

  // Sort ascending by time (lexicographic works for "2024-01", "2024-Q1", "2024" formats alike)
  return result.sort((a, b) => a.period.localeCompare(b.period))
}

/**
 * buildMonthlyReturnPcts
 * Builds the monthly realized-return series (percent) for calcSharpe.
 *
 * Monthly return = the month's ΣrealizedPnL / Σcost basis of that month's
 * closed round-trips × 100. Months with no closes between the first and last
 * active months get 0 (no realized P&L that month).
 *
 * Edge case: empty array → [].
 */
export function buildMonthlyReturnPcts(trades: ClosedTrade[]): number[] {
  if (!trades.length) return []

  const byMonth = new Map<string, { pnl: number; basis: number }>()
  for (const trade of trades) {
    const key = periodKey(trade.sellDate, 'month')
    const agg = byMonth.get(key) ?? { pnl: 0, basis: 0 }
    agg.pnl += trade.realizedPnL
    agg.basis += trade.sellQuantity * trade.avgCostBasis
    byMonth.set(key, agg)
  }

  const keys = [...byMonth.keys()].sort()
  const start = keys[0]!.split('-').map(Number) as [number, number]
  const [endY, endM] = keys[keys.length - 1]!.split('-').map(Number) as [number, number]

  const returns: number[] = []
  let [y, m] = start
  while (y < endY || (y === endY && m <= endM)) {
    const agg = byMonth.get(`${y}-${String(m).padStart(2, '0')}`)
    returns.push(agg && agg.basis > 0 ? (agg.pnl / agg.basis) * 100 : 0)
    if (m === 12) { m = 1; y++ } else { m++ }
  }

  return returns
}

/**
 * buildEquityCurveWithDates
 * Cumulative realized P&L curve with a date on each point, ready for a frontend chart X axis.
 * cumPnL = cumulative realized P&L (starts at 0, no fictional initial capital)
 */
export interface EquityCurvePoint {
  date: string    // ISO date string (YYYY-MM-DD)
  cumPnL: number  // cumulative P&L (from the first trade onward, starting at 0)
}

export function buildEquityCurveWithDates(
  trades: ClosedTrade[]
): EquityCurvePoint[] {
  if (!trades.length) return []

  const sorted = [...trades].sort((a, b) => a.sellDate.getTime() - b.sellDate.getTime())

  let cumPnL = 0
  return sorted.map((trade) => {
    cumPnL += trade.realizedPnL
    return {
      date: trade.sellDate.toISOString().slice(0, 10),
      cumPnL: Math.round(cumPnL * 100) / 100,
    }
  })
}
