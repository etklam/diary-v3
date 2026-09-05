import { describe, expect, it } from 'vitest'
import { getRotationSignal, isNearHigh } from '../../packages/domain/src/market-rotation/signal'

describe('isNearHigh', () => {
  it('keeps the near-high threshold canonical at -3%', () => {
    expect(isNearHigh(-3)).toBe(true)
    expect(isNearHigh(-2.99)).toBe(true)
    expect(isNearHigh(-3.01)).toBe(false)
    expect(isNearHigh(null)).toBe(false)
  })
})

describe('getRotationSignal', () => {
  it('returns insufficient data instead of neutral when required comparison fields are missing', () => {
    expect(getRotationSignal({
      maStatus: 'bullish_stack',
      rsi: 72,
      percentFromHigh: -2,
      rankDelta2W: null,
      rsiDelta2W: 4,
      twoWeekPerformancePct: 3,
    })).toEqual({
      signal: null,
      signalStatus: 'insufficient_data',
    })
  })

  it('applies canonical signal priority before neutral fallback', () => {
    expect(getRotationSignal({
      maStatus: 'breakdown',
      rsi: 41,
      percentFromHigh: -12,
      rankDelta2W: -3,
      rsiDelta2W: 2,
      twoWeekPerformancePct: 1,
    }).signal).toBe('breaking_down')

    expect(getRotationSignal({
      maStatus: 'bullish_stack',
      rsi: 70,
      percentFromHigh: -3,
      rankDelta2W: 3,
      rsiDelta2W: 6,
      twoWeekPerformancePct: 5,
    }).signal).toBe('strong_but_extended')

    expect(getRotationSignal({
      maStatus: 'healthy_pullback',
      rsi: 61,
      percentFromHigh: -8,
      rankDelta2W: 2,
      rsiDelta2W: 5,
      twoWeekPerformancePct: 2,
    }).signal).toBe('turning_strong')

    expect(getRotationSignal({
      maStatus: 'recovering',
      rsi: 40,
      percentFromHigh: -14,
      rankDelta2W: 1,
      rsiDelta2W: 0,
      twoWeekPerformancePct: -1,
    }).signal).toBe('early_recovery')

    expect(getRotationSignal({
      maStatus: 'short_term_weakness',
      rsi: 51,
      percentFromHigh: -9,
      rankDelta2W: -2,
      rsiDelta2W: -1,
      twoWeekPerformancePct: 1,
    }).signal).toBe('losing_momentum')

    expect(getRotationSignal({
      maStatus: 'healthy_pullback',
      rsi: 53,
      percentFromHigh: -5,
      rankDelta2W: 0,
      rsiDelta2W: 0,
      twoWeekPerformancePct: 0,
    }).signal).toBe('neutral')
  })

  // --- Boundary: strong_but_extended edge cases ---

  it('does not trigger strong_but_extended when RSI is 69 (below 70)', () => {
    const result = getRotationSignal({
      maStatus: 'bullish_stack',
      rsi: 69,
      percentFromHigh: -3,
      rankDelta2W: 3,
      rsiDelta2W: 6,
      twoWeekPerformancePct: 5,
    })
    // RSI < 70, so strong_but_extended does not fire
    // rankDelta2W >= 2 + rsiDelta2W >= 5 + performance > 0 => turning_strong instead
    expect(result.signal).toBe('turning_strong')
    expect(result.signal).not.toBe('strong_but_extended')
  })

  it('does not trigger strong_but_extended when percentFromHigh is -3.01 (below -3)', () => {
    const result = getRotationSignal({
      maStatus: 'bullish_stack',
      rsi: 70,
      percentFromHigh: -3.01,
      rankDelta2W: 3,
      rsiDelta2W: 6,
      twoWeekPerformancePct: 5,
    })
    // percentFromHigh < -3, so strong_but_extended does not fire
    // rankDelta2W >= 2 + rsiDelta2W >= 5 + performance > 0 => turning_strong instead
    expect(result.signal).toBe('turning_strong')
    expect(result.signal).not.toBe('strong_but_extended')
  })

  // --- Boundary: turning_strong edge cases ---

  it('does not trigger turning_strong when rankDelta2W is 1 (below 2)', () => {
    const result = getRotationSignal({
      maStatus: 'bullish_stack',
      rsi: 65,
      percentFromHigh: -4,
      rankDelta2W: 1,
      rsiDelta2W: 5,
      twoWeekPerformancePct: 1,
    })
    expect(result.signal).not.toBe('turning_strong')
  })

  it('does not trigger turning_strong when rsiDelta2W is 4 (below 5)', () => {
    const result = getRotationSignal({
      maStatus: 'bullish_stack',
      rsi: 65,
      percentFromHigh: -4,
      rankDelta2W: 2,
      rsiDelta2W: 4,
      twoWeekPerformancePct: 1,
    })
    expect(result.signal).not.toBe('turning_strong')
  })

  // --- Boundary: all zero/neutral data ---

  it('returns neutral when all data is zero or does not match any signal pattern', () => {
    expect(getRotationSignal({
      maStatus: 'healthy_pullback',
      rsi: 50,
      percentFromHigh: -5,
      rankDelta2W: 0,
      rsiDelta2W: 0,
      twoWeekPerformancePct: 0,
    })).toEqual({
      signal: 'neutral',
      signalStatus: 'complete',
    })
  })
})
