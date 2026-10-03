import type { EquityCurvePoint, PeriodStats } from './trade-analytics.js'

export interface PerformanceTrade {
  id: string
  symbol: string
  sellDate: string | Date
  sellQuantity: number
  sellPrice: number
  avgCostBasis: number
  realizedPnL: number
  realizedPnLPct: number
  strategy: string | null
  emotion: string | null
}

export interface SymbolBreakdownEntry {
  symbol: string
  tradeCount: number
  realizedPnL: number
  winRate: number
}

export interface AttributeBreakdownEntry {
  name: string
  tradeCount: number
  realizedPnL: number
  winRate: number
}

export interface PerformanceSummary {
  totalClosedTrades: number
  totalRealizedPnL: number
  winRate: number
  wins: number
  losses: number
  maxDrawdownPct: number
  sharpe: number | null
}

export const PERFORMANCE_PERIODS = ['month', 'quarter', 'year'] as const
export type PerfPeriod = (typeof PERFORMANCE_PERIODS)[number]

export interface PerformanceStatsResult<TDate = string> {
  summary: PerformanceSummary
  periodStats: PeriodStats[]
  equityCurve: EquityCurvePoint[]
  topWins: Array<Omit<PerformanceTrade, 'sellDate'> & { sellDate: TDate }>
  topLosses: Array<Omit<PerformanceTrade, 'sellDate'> & { sellDate: TDate }>
  symbolBreakdown: SymbolBreakdownEntry[]
  strategyBreakdown: AttributeBreakdownEntry[]
  emotionBreakdown: AttributeBreakdownEntry[]
  bestStrategy: AttributeBreakdownEntry | null
  worstStrategy: AttributeBreakdownEntry | null
}

export type PerformanceStatsPayload = PerformanceStatsResult<string>
