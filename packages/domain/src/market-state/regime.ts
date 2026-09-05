import type { MarketState } from '../market-rotation/state.js'

export interface BreadthInput {
  up4Count: number
  down4Count: number
  universeCount: number
  above40dPct: number
  ratio10d: number
}

export type Regime = Exclude<MarketState, 'unknown'>

export interface RegimeResult {
  regime: Regime
  isThrust: boolean
  score: number
  up4Pct: number
  down4Pct: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function calcPct(count: number, universeCount: number): number {
  if (universeCount <= 0) return 0
  return clamp((count / universeCount) * 100, 0, 100)
}

function calcScore(input: Pick<BreadthInput, 'ratio10d' | 'above40dPct'> & { up4Pct: number }): number {
  const ratioScore = clamp((input.ratio10d / 2) * 100, 0, 100)
  const aboveScore = clamp(input.above40dPct, 0, 100)
  const upMoveScore = clamp(input.up4Pct * 5, 0, 100)
  return Math.floor(clamp(ratioScore * 0.45 + aboveScore * 0.45 + upMoveScore * 0.15, 0, 100))
}

export function determineRegime(input: BreadthInput): RegimeResult {
  const up4Pct = calcPct(input.up4Count, input.universeCount)
  const down4Pct = calcPct(input.down4Count, input.universeCount)
  const score = calcScore({ ratio10d: input.ratio10d, above40dPct: input.above40dPct, up4Pct })

  let regime: Regime = 'neutral'
  let isThrust = false

  if (down4Pct >= 15 || input.above40dPct < 20) {
    regime = 'risk_off'
  } else if (input.ratio10d <= 0.7 || down4Pct >= up4Pct * 2 || input.above40dPct < 35) {
    regime = 'defensive'
  } else if (input.ratio10d >= 2 && up4Pct > down4Pct && input.above40dPct >= 50) {
    regime = 'risk_on'
    isThrust = true
  } else if (input.ratio10d >= 1.2 && input.above40dPct >= 55) {
    regime = 'risk_on'
  }

  return { regime, isThrust, score, up4Pct, down4Pct }
}
