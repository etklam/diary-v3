/**
 * lib/trade-analytics.ts
 * 集中式交易績效分析引擎
 *
 * 設計原則：
 * - 純函數，無副作用，無 DB 依賴
 * - 使用平均成本法（與 calculateHoldings() 一致）
 * - 所有除法運算前先做零值保護
 * - Decimal 在輸入層轉 number，避免 Prisma runtime 依賴
 */

// ─── 輸入類型 ────────────────────────────────────────────────────────────────

export interface RawTransaction {
  id: string | bigint | number
  symbol: string
  type: 'BUY' | 'SELL'
  /** 可接受 Prisma Decimal（已有 toString/valueOf）或 number */
  quantity: { valueOf(): number } | number | string
  price: { valueOf(): number } | number | string
  tradeDate: Date | string
  strategy?: string | null
  emotion?: string | null
}

// ─── 輸出類型 ────────────────────────────────────────────────────────────────

/** 一筆已配對（已關閉）的交易：一次 SELL 對應到的平均成本 */
export interface ClosedTrade {
  id: string
  symbol: string
  sellDate: Date
  sellQuantity: number
  sellPrice: number
  avgCostBasis: number      // 賣出時的平均成本
  realizedPnL: number       // 已實現損益（稅前）
  realizedPnLPct: number    // 已實現損益百分比
  strategy: string | null
  emotion: string | null
}

export interface WinRateResult {
  wins: number
  losses: number
  breakEven: number
  total: number
  winRate: number           // 0–100，N/A 時為 null
}

export interface RealizedDrawdownResult {
  maxDrawdownPct: number    // 0–100（正值表示虧損幅度，相對累積已投入成本）
  maxDrawdownDollars: number // 累積已實現損益的 peak-to-trough 最大回撤（美元）
  peakPnL: number
  troughPnL: number
}

export interface SharpeResult {
  sharpe: number | null     // null = 零波動（無法計算）
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

// ─── 輔助函數 ────────────────────────────────────────────────────────────────

import { replayLedger } from './ledger.js'

function periodKey(date: Date, period: GroupPeriod): string {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1 // 1-12
  if (period === 'year') return `${y}`
  if (period === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`
  return `${y}-${String(m).padStart(2, '0')}`
}

// ─── 核心函數 ────────────────────────────────────────────────────────────────

/**
 * matchTrades
 * 使用平均成本法，將 SELL 交易配對到對應的 BUY 批次，
 * 計算每筆 SELL 的已實現損益。
 *
 * 演算法：
 * 1. 按 tradeDate 升序排序（同日同記錄，以原始順序為次排序）
 * 2. 遇到 BUY → 更新該 symbol 的平均成本和持倉數量
 * 3. 遇到 SELL → 計算 (賣價 - 平均成本) × 數量 為已實現損益
 * 4. 與寫入帳本共用精確配對；無效超賣由帳本拒絕。
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
 * 計算勝率。以 realizedPnL > 0 為「贏」，< 0 為「輸」，= 0 為「平手」。
 *
 * 邊界：空陣列時 winRate = 0（不除以零）。
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
 * 從已關閉交易計算最大回撤。
 *
 * 沒有帳戶出入金資料，無法重建真實權益曲線，因此：
 * - 美元回撤 = 累積已實現損益的 peak-to-trough（從 0 起算，精確）
 * - 百分比 = 該時點美元回撤 ÷ 當時累積已投入成本（已平倉的成本基礎）
 *
 * ponytail: 基底假設「每筆平倉的 basis 都是獨立投入的資金」；
 * 若同一筆資金反覆滾動，百分比會低估（美元值仍精確）。
 * 要更準確需要匯入帳戶出入金紀錄。
 *
 * 邊界：空陣列或無回撤 → 全部為 0。
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
  let peak = 0 // 起點 0 視為初始權益

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
 * 計算夏普比率（年化）。
 *
 * @param returns - 每期收益率陣列（百分比，例如 [2.1, -1.3, 0.8]）
 * @param riskFreeRate - 無風險利率（年化百分比，預設 0）
 * @param periodsPerYear - 每年幾期（日頻=252，月頻=12，預設 12）
 *
 * 邊界：收益率標準差 = 0 → sharpe = null。
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
 * 將已關閉的交易按時間段分群。
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
 * 將分群後的交易計算每期統計摘要，按時間升序返回。
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

  // 按時間升序排序（lexicographic 對 "2024-01", "2024-Q1", "2024" 格式都有效）
  return result.sort((a, b) => a.period.localeCompare(b.period))
}

/**
 * buildMonthlyReturnPcts
 * 建立每月已實現報酬序列（百分比），供 calcSharpe 使用。
 *
 * 每月報酬 = 該月 ΣrealizedPnL / 該月已平倉 round-trips 的 Σ成本基礎 × 100。
 * 首個至最後一個活躍月份之間沒有平倉的月份補 0（該月無已實現損益）。
 *
 * 邊界：空陣列 → []。
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
 * 累積已實現損益曲線，每個點帶上日期，方便前端圖表 X 軸使用。
 * cumPnL = 累積已實現損益（從 0 開始，不含任何虛構初始資本）
 */
export interface EquityCurvePoint {
  date: string    // ISO date string (YYYY-MM-DD)
  cumPnL: number  // 累積損益（從第一筆交易起算，初始為 0）
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
