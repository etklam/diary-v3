export type MaStatus =
  | 'bullish_stack'
  | 'healthy_pullback'
  | 'short_term_weakness'
  | 'recovering'
  | 'breakdown'
  | 'unknown'

export type RotationSignal =
  | 'turning_strong'
  | 'strong_but_extended'
  | 'losing_momentum'
  | 'breaking_down'
  | 'early_recovery'
  | 'neutral'

export type SignalStatus = 'complete' | 'insufficient_data'

export interface RotationSignalInput {
  maStatus: MaStatus
  rsi: number | null
  percentFromHigh: number | null
  rankDelta2W: number | null
  rsiDelta2W: number | null
  twoWeekPerformancePct: number | null
}

export interface RotationSignalResult {
  signal: RotationSignal | null
  signalStatus: SignalStatus
}

export function isNearHigh(percentFromHigh: number | null): boolean {
  return percentFromHigh != null && percentFromHigh >= -3
}

function hasCompleteSignalData(input: RotationSignalInput): boolean {
  return input.maStatus !== 'unknown'
    && input.rsi != null
    && input.percentFromHigh != null
    && input.rankDelta2W != null
    && input.rsiDelta2W != null
    && input.twoWeekPerformancePct != null
}

export function getRotationSignal(input: RotationSignalInput): RotationSignalResult {
  if (!hasCompleteSignalData(input)) {
    return {
      signal: null,
      signalStatus: 'insufficient_data',
    }
  }

  const rankImproving = input.rankDelta2W! > 0
  const rankWeakening = input.rankDelta2W! < 0
  const rsiImproving = input.rsiDelta2W! > 0
  const rsiWeakening = input.rsiDelta2W! < 0
  const performanceImproving = input.twoWeekPerformancePct! > 0
  const performanceWeakening = input.twoWeekPerformancePct! < 0

  if (
    input.maStatus === 'breakdown'
    && (rankWeakening || rsiWeakening || performanceWeakening)
  ) {
    return { signal: 'breaking_down', signalStatus: 'complete' }
  }

  if (
    input.maStatus === 'bullish_stack'
    && input.rsi! >= 70
    && input.percentFromHigh! >= -3
  ) {
    return { signal: 'strong_but_extended', signalStatus: 'complete' }
  }

  if (
    (input.maStatus === 'bullish_stack' || input.maStatus === 'healthy_pullback')
    && input.rankDelta2W! >= 2
    && input.rsiDelta2W! >= 5
    && input.twoWeekPerformancePct! > 0
  ) {
    return { signal: 'turning_strong', signalStatus: 'complete' }
  }

  if (
    input.maStatus === 'recovering'
    && input.rsi! >= 40
    && (rankImproving || rsiImproving || performanceImproving)
  ) {
    return { signal: 'early_recovery', signalStatus: 'complete' }
  }

  if (
    (input.maStatus === 'short_term_weakness' || input.maStatus === 'healthy_pullback')
    && input.rankDelta2W! <= -2
    && (rsiWeakening || performanceWeakening)
  ) {
    return { signal: 'losing_momentum', signalStatus: 'complete' }
  }

  return {
    signal: 'neutral',
    signalStatus: 'complete',
  }
}
