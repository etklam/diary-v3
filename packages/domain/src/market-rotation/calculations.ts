import { roundMetric } from './round.js'

export interface MaStatusInput {
  above10d: boolean | null
  above20d: boolean | null
  above50d: boolean | null
}

export type MaStatus =
  | 'bullish_stack'
  | 'healthy_pullback'
  | 'short_term_weakness'
  | 'recovering'
  | 'breakdown'
  | 'unknown'

export function calculateMaStatus(input: MaStatusInput): MaStatus {
  const { above10d, above20d, above50d } = input

  if (above10d == null || above20d == null || above50d == null) return 'unknown'

  if (above10d && above20d && above50d) return 'bullish_stack'
  if (!above10d && !above20d && !above50d) return 'breakdown'
  if (!above50d && (above10d || above20d)) return 'recovering'
  if (above20d && above50d) return 'healthy_pullback'
  return 'short_term_weakness'
}

export function calculatePercentile(values: number[], target: number): number | null {
  if (values.length === 0) return null

  const below = values.filter(v => v < target).length
  return (below / values.length) * 100
}

export interface MaScoreInput {
  above10d: boolean
  above20d: boolean
  above50d: boolean
  above200d?: boolean
}

export interface DistanceFromHighInput {
  close: number
  rollingHigh: number
  tradingDayCount: number
}

export interface DistanceFromHighResult {
  percentFromHigh: number | null
  distanceFromHighScore: number | null
}

export interface RotationScoreInput {
  rsiPercentile: number | null
  twoWeekPerformancePercentile: number | null
  maScorePercentile: number | null
  distanceFromHighScorePercentile: number | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function calculateMaScore(input: MaScoreInput): number {
  return (input.above10d ? 20 : 0)
    + (input.above20d ? 30 : 0)
    + (input.above50d ? 50 : 0)
}

export function calculateDistanceFromHigh(input: DistanceFromHighInput): DistanceFromHighResult {
  if (input.tradingDayCount < 60 || input.rollingHigh <= 0) {
    return {
      percentFromHigh: null,
      distanceFromHighScore: null,
    }
  }

  const percentFromHigh = roundMetric((input.close / input.rollingHigh - 1) * 100)

  return {
    percentFromHigh,
    distanceFromHighScore: roundMetric(clamp(100 + percentFromHigh * 5, 0, 100)),
  }
}

export function calculateRotationScore(input: RotationScoreInput): number | null {
  if (
    input.rsiPercentile == null
    || input.twoWeekPerformancePercentile == null
    || input.maScorePercentile == null
    || input.distanceFromHighScorePercentile == null
  ) {
    return null
  }

  return input.rsiPercentile * 0.3
    + input.twoWeekPerformancePercentile * 0.3
    + input.maScorePercentile * 0.2
    + input.distanceFromHighScorePercentile * 0.2
}

export interface RankableRow {
  symbol: string
  rotationScore: number | null
}

export interface RankedRow extends RankableRow {
  rotationRank: number | null
}

export function assignRotationRanks(rows: RankableRow[]): RankedRow[] {
  if (rows.length === 0) return []

  const scored: { index: number; symbol: string; rotationScore: number }[] = []
  const result: RankedRow[] = rows.map(row => ({
    symbol: row.symbol,
    rotationScore: row.rotationScore,
    rotationRank: null,
  }))

  rows.forEach((row, index) => {
    if (row.rotationScore !== null) {
      scored.push({ index, symbol: row.symbol, rotationScore: row.rotationScore })
    }
  })

  scored.sort((a, b) => {
    if (b.rotationScore !== a.rotationScore) {
      return b.rotationScore - a.rotationScore
    }
    return a.symbol.localeCompare(b.symbol)
  })

  scored.forEach((entry, rank) => {
    const row = result[entry.index]
    if (row) {
      row.rotationRank = rank + 1
    }
  })

  return result
}
