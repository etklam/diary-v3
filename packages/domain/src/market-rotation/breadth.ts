import type { MarketState } from './state.js'

export type BreadthCondition =
  | 'broad_participation'
  | 'constructive'
  | 'narrowing'
  | 'weak_breadth'
  | 'unknown'

export type BreadthConfirmation = 'confirming' | 'mixed' | 'warning' | 'unknown'

export function getBreadthCondition(sectorsAbove50dRatio: number | null | undefined): BreadthCondition {
  if (sectorsAbove50dRatio == null || Number.isNaN(sectorsAbove50dRatio)) return 'unknown'
  if (sectorsAbove50dRatio >= 0.7) return 'broad_participation'
  if (sectorsAbove50dRatio >= 0.5) return 'constructive'
  if (sectorsAbove50dRatio >= 0.35) return 'narrowing'
  return 'weak_breadth'
}

export function getBreadthConfirmation(
  marketState: MarketState,
  sectorsAbove50dRatio: number | null | undefined,
): BreadthConfirmation {
  if (marketState === 'unknown' || sectorsAbove50dRatio == null || Number.isNaN(sectorsAbove50dRatio)) {
    return 'unknown'
  }

  if (marketState === 'risk_on') {
    if (sectorsAbove50dRatio >= 0.5) return 'confirming'
    if (sectorsAbove50dRatio >= 0.35) return 'mixed'
    return 'warning'
  }

  if (marketState === 'neutral') {
    if (sectorsAbove50dRatio >= 0.35 && sectorsAbove50dRatio < 0.7) return 'confirming'
    return 'mixed'
  }

  if (marketState === 'defensive') {
    if (sectorsAbove50dRatio < 0.5) return 'confirming'
    if (sectorsAbove50dRatio < 0.7) return 'mixed'
    return 'warning'
  }

  if (sectorsAbove50dRatio < 0.35) return 'confirming'
  if (sectorsAbove50dRatio < 0.5) return 'mixed'
  return 'warning'
}
