import type { MarketState } from './state.js'
import type { BreadthCondition, BreadthConfirmation } from './breadth.js'

export interface SummaryInput {
  marketState: MarketState
  breadthCondition: BreadthCondition
  breadthConfirmation: BreadthConfirmation
  topImproving: Array<{ symbol: string; sectorName: string | null }>
  bottomWeakening: Array<{ symbol: string; sectorName: string | null }>
  above50dRatio: number | null
  averageRsi: number | null
}

const MARKET_STATE_DESCRIPTIONS: Record<MarketState, string> = {
  risk_on: 'Risk-on environment with constructive price action.',
  neutral: 'Market is in a neutral state with mixed signals.',
  defensive: 'Defensive posture — risk appetite has cooled.',
  risk_off: 'Risk-off conditions — capital is rotating to safety.',
  unknown: 'Market state is unclear due to insufficient data.',
}

const BREADTH_CONFIRMATION_DESCRIPTIONS: Record<BreadthConfirmation, string> = {
  confirming: 'Sector breadth confirms the current market state.',
  mixed: 'Sector breadth sends mixed signals relative to market state.',
  warning: 'Sector breadth warns against the current market state.',
  unknown: '',
}

function formatBreadth(condition: BreadthCondition, above50dRatio: number | null): string {
  const pct = above50dRatio != null ? `${Math.round(above50dRatio * 100)}%` : 'N/A'

  switch (condition) {
    case 'broad_participation':
      return `Broad participation with ${pct} of sectors above their 50-day SMA.`
    case 'constructive':
      return `Breadth is constructive at ${pct} above 50-day SMA.`
    case 'narrowing':
      return `Breadth is narrowing (${pct} above 50-day SMA).`
    case 'weak_breadth':
      return `Breadth is weak (${pct} above 50-day SMA).`
    case 'unknown':
      return 'Breadth data is insufficient.'
  }
}

function formatLeadership(
  entries: Array<{ symbol: string; sectorName: string | null }>,
): string | null {
  if (entries.length === 0) return null
  const names = entries.map((e) => e.sectorName ?? e.symbol)
  return `Leaders: ${names.join(', ')}.`
}

function formatWeakening(
  entries: Array<{ symbol: string; sectorName: string | null }>,
): string | null {
  if (entries.length === 0) return null
  const names = entries.map((e) => e.sectorName ?? e.symbol)
  return `Weakening groups: ${names.join(', ')}.`
}

function formatRsi(averageRsi: number | null): string | null {
  if (averageRsi == null) return null
  return `Average RSI at ${Math.round(averageRsi)}.`
}


export function generateMarketSummary(input: SummaryInput): string {
  const parts: string[] = []

  // 1. Market state
  parts.push(MARKET_STATE_DESCRIPTIONS[input.marketState])

  // 2. Breadth
  parts.push(formatBreadth(input.breadthCondition, input.above50dRatio))

  // 3. Confirmation (non-empty only)
  const confirmation = BREADTH_CONFIRMATION_DESCRIPTIONS[input.breadthConfirmation]
  if (confirmation) {
    parts.push(confirmation)
  }

  // 4. Leadership
  const leadership = formatLeadership(input.topImproving)
  if (leadership) {
    parts.push(leadership)
  }

  // 5. Weakening
  const weakening = formatWeakening(input.bottomWeakening)
  if (weakening) {
    parts.push(weakening)
  }

  // 6. RSI
  const rsi = formatRsi(input.averageRsi)
  if (rsi) {
    parts.push(rsi)
  }


  return parts.join(' ')
}
