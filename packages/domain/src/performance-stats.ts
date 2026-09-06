/**
 * server/utils/performance-stats.ts
 *
 * Pure calculation layer: takes raw Prisma transaction records plus config
 * and returns the full performance stats result. No DB or HTTP dependencies,
 * which makes it easy to unit test.
 */

import {
  matchTrades,
  calcWinRate,
  calcRealizedDrawdown,
  calcSharpe,
  groupByPeriod,
  calcPeriodStats,
  buildMonthlyReturnPcts,
  buildEquityCurveWithDates,
  type GroupPeriod,
  type ClosedTrade,
} from './trade-analytics.js'
import type { PerformanceStatsResult } from './performance-types.js'
import type {
  AttributeBreakdownEntry as SharedAttributeBreakdownEntry,
  PerformanceSummary as SharedPerformanceSummary,
  PerformanceTrade as SharedPerformanceTrade,
  SymbolBreakdownEntry as SharedSymbolBreakdownEntry,
} from './performance-types.js'

// ─── Input types ──────────────────────────────────────────────────────────────

export interface RawTransactionRecord {
  id: bigint | string | number
  symbol: string
  type: string
  quantity: { valueOf(): number } | number | string
  price: { valueOf(): number } | number | string
  tradeDate: Date
  strategy?: string | null
  emotion?: string | null
}

export interface PerformanceConfig {
  period: GroupPeriod
}

// ─── Output types ─────────────────────────────────────────────────────────────

export type FormattedTrade = Omit<SharedPerformanceTrade, 'sellDate'> & { sellDate: Date }
export type SymbolBreakdownEntry = SharedSymbolBreakdownEntry
export type AttributeBreakdownEntry = SharedAttributeBreakdownEntry
export type PerformanceSummary = SharedPerformanceSummary

export type PerformanceResult = PerformanceStatsResult<Date>

// ─── Helper ────────────────────────────────────────────────────────────────────

function formatTrade(t: ClosedTrade): FormattedTrade {
  return {
    id: t.id,
    symbol: t.symbol,
    sellDate: t.sellDate,
    sellQuantity: t.sellQuantity,
    sellPrice: t.sellPrice,
    avgCostBasis: t.avgCostBasis,
    realizedPnL: t.realizedPnL,
    realizedPnLPct: t.realizedPnLPct,
    strategy: t.strategy,
    emotion: t.emotion,
  }
}

function buildAttributeBreakdown(
  closedTrades: ClosedTrade[],
  attribute: 'strategy' | 'emotion',
): AttributeBreakdownEntry[] {
  const groups = new Map<string, { realizedPnL: number; trades: ClosedTrade[] }>()

  for (const trade of closedTrades) {
    const name = trade[attribute]?.trim()
    if (!name) continue

    const existing = groups.get(name) ?? { realizedPnL: 0, trades: [] }
    existing.realizedPnL += trade.realizedPnL
    existing.trades.push(trade)
    groups.set(name, existing)
  }

  return Array.from(groups.entries())
    .map(([name, data]) => {
      const winRate = calcWinRate(data.trades)
      return {
        name,
        tradeCount: data.trades.length,
        realizedPnL: data.realizedPnL,
        winRate: winRate.winRate,
      }
    })
    .sort((a, b) => b.realizedPnL - a.realizedPnL || b.tradeCount - a.tradeCount || a.name.localeCompare(b.name))
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function computePerformanceStats(
  rawTxs: RawTransactionRecord[],
  config: PerformanceConfig,
): PerformanceResult {
  const closedTrades = matchTrades(
    rawTxs.map((tx) => ({
      ...tx,
      id: tx.id.toString(),
      type: tx.type as 'BUY' | 'SELL',
    })),
  )

  const winRateResult = calcWinRate(closedTrades)
  const drawdownResult = calcRealizedDrawdown(closedTrades)
  const equityCurveWithDates = buildEquityCurveWithDates(closedTrades)

  const grouped = groupByPeriod(closedTrades, 'month')
  const periodStatsResult = calcPeriodStats(grouped)
  // Sharpe must consume percentage returns (monthly return = the month's
  // ΣrealizedPnL / Σclosed cost basis), not raw dollar P&L — otherwise large
  // position months get amplified, detached from the actual return rate.
  const monthlyReturnPcts = buildMonthlyReturnPcts(closedTrades)
  const sharpeResult = calcSharpe(monthlyReturnPcts)

  const requestedGrouped =
    config.period === 'month' ? grouped : groupByPeriod(closedTrades, config.period)
  const requestedPeriodStats =
    config.period === 'month'
      ? periodStatsResult
      : calcPeriodStats(requestedGrouped)

  // Filter before slicing: slice(0,5).filter would drop the 6th-ranked winner
  // when a loss lands inside the top 5
  const sortedByPnL = [...closedTrades].sort((a, b) => b.realizedPnL - a.realizedPnL)
  const topWins = sortedByPnL.filter((t) => t.realizedPnL > 0).slice(0, 5)
  const topLosses = [...closedTrades]
    .sort((a, b) => a.realizedPnL - b.realizedPnL)
    .filter((t) => t.realizedPnL < 0)
    .slice(0, 5)

  const symbolMap = new Map<string, { realizedPnL: number; trades: ClosedTrade[] }>()
  for (const trade of closedTrades) {
    const existing = symbolMap.get(trade.symbol) ?? { realizedPnL: 0, trades: [] }
    existing.realizedPnL += trade.realizedPnL
    existing.trades.push(trade)
    symbolMap.set(trade.symbol, existing)
  }
  const symbolBreakdown: SymbolBreakdownEntry[] = Array.from(symbolMap.entries())
    .map(([symbol, data]) => {
      const wr = calcWinRate(data.trades)
      return {
        symbol,
        tradeCount: data.trades.length,
        realizedPnL: data.realizedPnL,
        winRate: wr.winRate,
      }
    })
    .sort((a, b) => b.realizedPnL - a.realizedPnL)
  const strategyBreakdown = buildAttributeBreakdown(closedTrades, 'strategy')
  const emotionBreakdown = buildAttributeBreakdown(closedTrades, 'emotion')

  return {
    summary: {
      totalClosedTrades: closedTrades.length,
      totalRealizedPnL: closedTrades.reduce((s, t) => s + t.realizedPnL, 0),
      winRate: winRateResult.winRate,
      wins: winRateResult.wins,
      losses: winRateResult.losses,
      maxDrawdownPct: drawdownResult.maxDrawdownPct,
      sharpe: sharpeResult.sharpe,
    },
    periodStats: requestedPeriodStats,
    equityCurve: equityCurveWithDates,
    topWins: topWins.map(formatTrade),
    topLosses: topLosses.map(formatTrade),
    symbolBreakdown,
    strategyBreakdown,
    emotionBreakdown,
    bestStrategy: strategyBreakdown[0] ?? null,
    worstStrategy: strategyBreakdown.length
      ? [...strategyBreakdown].sort((a, b) => a.realizedPnL - b.realizedPnL || b.tradeCount - a.tradeCount || a.name.localeCompare(b.name))[0]!
      : null,
  }
}
