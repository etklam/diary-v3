import { describe, expect, it } from 'vitest'
import {
  RESEARCH_CALCULATOR_VERSION,
  RESEARCH_METHOD_BUNDLE,
  calculateDirectionScore,
  calculateRelativeStrength,
  calculateResearchMetrics,
  calculateRewardRisk,
  calculateSmaSeries,
  calculateEmaSeries,
  calculateRmaSeries,
  deriveTradePlanCandidates,
  deriveStructuralLevels,
  findConfirmedPivots,
  findGaps,
  normalizeResearchBars,
  validateResearchInput,
  type ResearchBar,
  type ResearchCalculationInput,
  type ResearchSession,
  type StructuralLevel,
} from '../../packages/domain/src/research-studio'

function nextWeekday(value: Date): Date {
  const result = new Date(value)
  do result.setUTCDate(result.getUTCDate() + 1)
  while (result.getUTCDay() === 0 || result.getUTCDay() === 6)
  return result
}

function syntheticBars(count = 260, symbol = 'SOXX'): ResearchBar[] {
  const bars: ResearchBar[] = []
  let date = new Date(Date.UTC(2024, 0, 2))
  for (let index = 0; index < count; index += 1) {
    const close = 100 + index * 0.1 + Math.sin(index / 8)
    const previousClose = bars.at(-1)?.close ?? close
    bars.push({
      symbol,
      date: date.toISOString().slice(0, 10),
      open: Math.min(previousClose, close) + 0.1,
      high: Math.max(previousClose, close) + 1,
      low: Math.min(previousClose, close) - 1,
      close,
      adjClose: close * (1 + index / 100000),
      volume: 1_000_000 + index * 10,
      priceSourceId: 'synthetic-price',
      volumeSourceId: 'synthetic-volume',
      adjustmentBasis: 'split_only',
      volumeBasis: 'shares_regular',
      session: 'regular_close',
      dataAsOf: `${date.toISOString().slice(0, 10)}T21:00:00Z`,
      retrievedAt: `${date.toISOString().slice(0, 10)}T22:00:00Z`,
      isComplete: true,
      isWeekFinal: date.getUTCDay() === 5,
    })
    date = nextWeekday(date)
  }
  return bars
}

function inputFor(bars: ResearchBar[]): ResearchCalculationInput {
  const sessions: ResearchSession[] = bars.map(bar => ({
    date: bar.date,
    closeAt: `${bar.date}T21:00:00Z`,
    isCompleted: true,
    isWeekFinal: bar.isWeekFinal === true,
    timezone: 'America/New_York',
    sourceId: 'synthetic-calendar',
  }))
  return {
    instrument: { symbol: bars[0]?.symbol ?? 'SOXX', name: 'Synthetic ETF', exchange: 'NASDAQ', currency: 'USD', assetType: 'etf' },
    bars,
    sessions,
    referenceSession: bars.at(-1)?.date ?? '',
    asOf: `${bars.at(-1)?.date}T22:00:00Z`,
    adjustmentMode: 'total_return_rebased',
    sourceIds: ['synthetic-price', 'synthetic-volume', 'synthetic-calendar'],
  }
}

describe('research method bundle', () => {
  it('records the complete eight-page source bundle and calculator version', () => {
    expect(RESEARCH_METHOD_BUNDLE.appendices).toHaveLength(8)
    expect(RESEARCH_METHOD_BUNDLE.sourceSha256).toHaveLength(64)
    expect(RESEARCH_CALCULATOR_VERSION).toBe('ts-research-calculator-1.0.0')
    expect(RESEARCH_METHOD_BUNDLE.coverage.every(entry => entry.manualQa)).toBe(true)
  })
})

describe('seeded moving averages', () => {
  it('uses arithmetic seeds and leaves warm-up values null', () => {
    expect(calculateSmaSeries([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3])
    expect(calculateEmaSeries([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3])
    expect(calculateRmaSeries([1, 2, 3, 4], 3)).toEqual([null, null, 2, 8 / 3])
  })

  it('re-seeds after a missing observation', () => {
    expect(calculateEmaSeries([1, 2, 3, null, 10, 11, 12], 3)).toEqual([null, null, 2, null, null, null, 11])
    expect(calculateRmaSeries([1, 2, 3, null, 10, 11, 12], 3)).toEqual([null, null, 2, null, null, null, 11])
  })
})

describe('research indicators', () => {
  it('honors RSI, MACD, ATR, ADX, Bollinger, and prior-volume warm-ups', () => {
    const bars = syntheticBars()
    const metrics = calculateResearchMetrics(inputFor(bars))
    expect(metrics.rsi14[13]).toBeNull()
    expect(metrics.rsi14[14]).not.toBeNull()
    expect(metrics.macd[24]).toBeNull()
    expect(metrics.macd[25]).not.toBeNull()
    expect(metrics.macdSignal[32]).toBeNull()
    expect(metrics.macdSignal[33]).not.toBeNull()
    expect(metrics.tr[0]).toBeNull()
    expect(metrics.atr14[13]).toBeNull()
    expect(metrics.atr14[14]).not.toBeNull()
    expect(metrics.adx14[26]).toBeNull()
    expect(metrics.adx14[27]).not.toBeNull()
    expect(metrics.bollingerMid[18]).toBeNull()
    expect(metrics.bollingerMid[19]).not.toBeNull()
    expect(metrics.priorVolumeMean20[19]).toBeNull()
    expect(metrics.priorVolumeMean20[20]).toBe(1_000_095)
  })

  it('keeps completed weekly aggregation separate from daily bars', () => {
    const bars = syntheticBars()
    const metrics = calculateResearchMetrics(inputFor(bars))
    expect(metrics.completedWeeks.length).toBeGreaterThan(30)
    expect(metrics.completedWeeks.every(week => week.isWeekFinal)).toBe(true)
    expect(metrics.weekSma30.filter(value => value !== null).length).toBeGreaterThan(0)
  })
})

describe('normalization and validation', () => {
  it('rebases all OHLC fields to the reference close for total-return mode', () => {
    const bars = syntheticBars(3)
    const input = inputFor(bars)
    const result = normalizeResearchBars(input)
    const reference = result.bars.at(-1)!
    expect(reference.close).toBeCloseTo(bars.at(-1)!.close)
    expect(result.bars[0]!.high! / bars[0]!.high!).not.toBe(1)
    expect(result.mode).toBe('total_return_rebased')
  })

  it('requires adjusted close for total-return mode and marks split-only limited', () => {
    const bars = syntheticBars(3)
    bars[1]!.adjClose = null
    const input = inputFor(bars)
    expect(() => normalizeResearchBars(input)).toThrowError(/Adjusted close is missing/)
    const splitOnly = normalizeResearchBars({ ...input, adjustmentMode: 'split_only' }, 'split_only')
    expect(splitOnly.warnings[0]).toContain('split_only')
    expect(validateResearchInput({ ...input, adjustmentMode: 'split_only' }).quality).toBe('LIMITED')
  })

  it('keeps close-only history for close indicators and counts OHLC only in the recent 150 rows', () => {
    const bars = syntheticBars(260).map((bar, index) => index < 110 ? { ...bar, open: null, high: null, low: null } : bar)
    const input = inputFor(bars)
    const validation = validateResearchInput({ ...input, observedBars: bars })
    const metrics = calculateResearchMetrics({ ...input, bars })
    expect(validation.valid).toBe(true)
    expect(validation.counts.closes).toBe(260)
    expect(validation.counts.completeOhlc).toBe(150)
    expect(metrics.latest.sma200).not.toBeNull()
    expect(metrics.latest.atr14).not.toBeNull()
    expect(metrics.tr[50]).toBeNull()
  })

  it('fails the data gate on a missing expected session and a missing latest reference row', () => {
    const bars = syntheticBars(30)
    const input = inputFor(bars)
    const missingDates = new Set([bars[4]!.date, bars[9]!.date, bars[14]!.date, bars[19]!.date, bars[24]!.date])
    const missingMiddle = validateResearchInput({ ...input, bars: bars.filter(bar => !missingDates.has(bar.date)) })
    const missingIssue = missingMiddle.issues.find(issue => issue.code === 'MISSING_EXPECTED_SESSION')
    expect(missingIssue?.message).toContain([...missingDates].join(', '))
    expect(missingMiddle.gates.find(gate => gate.gateId === 'G03')?.status).toBe('FAIL')

    const missingLatest = validateResearchInput({ ...input, bars: bars.slice(0, -1) })
    expect(missingLatest.issues.some(issue => issue.code === 'REFERENCE_BAR_MISSING')).toBe(true)
    expect(missingLatest.gates.find(gate => gate.gateId === 'G02')?.status).toBe('FAIL')
  })

  it('maps invalid reference dates, duplicate calendar dates, and invalid session timestamps to blocking gates', () => {
    const bars = syntheticBars(30)
    const input = inputFor(bars)
    const invalidDate = validateResearchInput({ ...input, referenceSession: 'not-a-date' })
    expect(invalidDate.gates.find(gate => gate.gateId === 'G02')?.status).toBe('FAIL')

    const duplicateCalendar = validateResearchInput({ ...input, sessions: [...input.sessions, input.sessions[0]!] })
    expect(duplicateCalendar.issues.some(issue => issue.code === 'DUPLICATE_SESSIONS')).toBe(true)
    expect(duplicateCalendar.gates.find(gate => gate.gateId === 'G03')?.status).toBe('FAIL')

    const invalidSession = validateResearchInput({ ...input, sessions: input.sessions.map((session, index) => index === 0 ? { ...session, closeAt: 'not-an-instant' } : session) })
    expect(invalidSession.issues.some(issue => issue.code === 'SESSION_TIMESTAMP_INVALID')).toBe(true)
    expect(invalidSession.gates.find(gate => gate.gateId === 'G06')?.status).toBe('FAIL')
  })

  it('requires one volume source and basis throughout the last 21 rows', () => {
    const bars = syntheticBars(260)
    const input = inputFor(bars)
    bars.at(-1)!.volumeSourceId = 'other-volume-source'
    const validation = validateResearchInput({ ...input, bars, sourceIds: [...input.sourceIds!, 'other-volume-source'] })
    expect(validation.counts.recentVolume).toBe(0)
    expect(validation.issues.some(issue => issue.code === 'VOLUME_BASIS_MISMATCH')).toBe(true)
    expect(validation.gates.find(gate => gate.gateId === 'G03')?.status).toBe('FAIL')
  })

  it('rejects duplicate and unfinished calendar rows', () => {
    const bars = syntheticBars(4)
    const input = inputFor(bars)
    const duplicate = { ...bars[1]!, date: bars[0]!.date, session: 'regular_close' as const }
    const validation = validateResearchInput({ ...input, bars: [...bars, duplicate] })
    expect(validation.valid).toBe(false)
    expect(validation.issues.some(issue => issue.code === 'DUPLICATE_DATES')).toBe(true)
  })

  it('does not let future or unverified calendar rows become the reference or a completed week', () => {
    const bars = syntheticBars(12)
    const input = inputFor(bars)
    const lastSession = input.sessions.at(-1)!
    const futureSessions = input.sessions.map(session => session.date === lastSession.date ? {
      ...session,
      closeAt: '2030-01-01T21:00:00Z',
      isWeekFinal: false,
    } : session)
    const futureValidation = validateResearchInput({ ...input, sessions: futureSessions, referenceSession: lastSession.date })
    expect(futureValidation.valid).toBe(false)
    expect(futureValidation.issues.some(issue => issue.code === 'SESSION_AFTER_AS_OF')).toBe(true)

    const futureDate = nextWeekday(new Date(`${lastSession.date}T00:00:00Z`)).toISOString().slice(0, 10)
    const futureHorizon = validateResearchInput({ ...input, sessions: [...input.sessions, { date: futureDate, closeAt: `${futureDate}T21:00:00Z`, isCompleted: false, isWeekFinal: true, timezone: 'America/New_York', sourceId: 'synthetic-calendar' }] })
    expect(futureHorizon.valid).toBe(true)

    const mismatchedBars = bars.map(bar => bar.date === bars.at(-1)!.date ? { ...bar, isWeekFinal: true } : bar)
    const mismatchedSessions = input.sessions.map(session => session.date === bars.at(-1)!.date ? { ...session, isWeekFinal: false } : session)
    const mismatch = validateResearchInput({ ...input, bars: mismatchedBars, sessions: mismatchedSessions })
    expect(mismatch.issues.some(issue => issue.code === 'WEEK_FINAL_MISMATCH')).toBe(true)

    const missingOneDate = bars.filter(bar => bar.date !== bars[5]!.date)
    const partialWeeks = calculateResearchMetrics({ ...input, bars: missingOneDate })
    expect(partialWeeks.completedWeeks.length).toBeLessThan(calculateResearchMetrics(input).completedWeeks.length)
  })
})

describe('relative strength, pivots, gaps, and reward/risk', () => {
  it('uses exact common session windows and calendar-month lookup', () => {
    const target = syntheticBars(30, 'SOXX')
    const benchmark = target.map(bar => ({ ...bar, symbol: 'SPY', close: 100 + target.indexOf(bar) * 0.05 }))
    const returns = calculateRelativeStrength(target, benchmark, 'SPY', target.at(-1)!.date)
    expect(returns[0]!.startDate).toBe(target[24]!.date)
    expect(returns[1]!.startDate).toBe(target[9]!.date)
    expect(returns[0]!.benchmark).toBe('SPY')
  })

  it('confirms pivots two bars later and tracks gap status', () => {
    const bars = syntheticBars(10)
    const pivotBars = bars.map((bar, index) => ({ ...bar, high: index === 4 ? 200 : 100 + index, low: index === 4 ? 199 : 90 + index }))
    const pivots = findConfirmedPivots(pivotBars)
    expect(pivots.some(pivot => pivot.type === 'high' && pivot.index === 4 && pivot.confirmedOn === bars[6]!.date)).toBe(true)
    const gapBars = bars.map((bar, index) => index >= 4 ? { ...bar, low: bars[3]!.high! + 2, high: bars[3]!.high! + 3 } : bar)
    expect(findGaps(gapBars).some(gap => gap.type === 'up' && gap.status === 'open')).toBe(true)
  })

  it('calculates both midpoint and conservative long R/R', () => {
    const result = calculateRewardRisk({ lower: 99, upper: 101 }, { lower: 94, upper: 96 }, { lower: 111, upper: 113 })
    expect(result.valid).toBe(true)
    expect(result.mid).toBeCloseTo(2.4)
    expect(result.conservative).toBeCloseTo(10 / 7)
    expect(calculateRewardRisk({ lower: 99, upper: 101 }, { lower: 100, upper: 102 }, { lower: 111, upper: 113 }).valid).toBe(false)
  })

  it('derives traceable levels without using an arbitrary target to improve R/R', () => {
    const metrics = calculateResearchMetrics(inputFor(syntheticBars()))
    const levels = deriveStructuralLevels(metrics)
    expect(levels.every(level => level.anchors.length > 0 && level.confirmedAsOf === metrics.referenceSession)).toBe(true)
    const score = calculateDirectionScore(metrics)
    expect(score.label).toBe('N/A')
    const plans = deriveTradePlanCandidates(levels)
    expect(plans).toHaveLength(2)
    expect(plans.every(plan => plan.status === 'N_A' && plan.requiresHumanReview && plan.structuralStop === null && plan.target1 === null && plan.target2 === null)).toBe(true)
  })

  it('derives ordered non-SOXX WATCH plans and midpoint/conservative R/R only from actual zones', () => {
    const metrics = calculateResearchMetrics(inputFor(syntheticBars(260, 'NVDA')))
    const close = metrics.latest.close
    const zone = (zoneId: string, side: StructuralLevel['side'], lower: number, upper: number, anchor: string): StructuralLevel => ({
      zoneId, side, lower, upper, center: (lower + upper) / 2, anchors: [anchor], basis: 'indicator_ohlc', confirmedAsOf: metrics.referenceSession, impact: 'fixture structural zone',
    })
    const levels: StructuralLevel[] = [
      zone('support-1', 'support', close - 11, close - 9, 'gap-up-2026-08-20'),
      zone('support-2', 'support', close - 21, close - 19, 'pivot-low-2026-08-01'),
      zone('resistance-1', 'resistance', close + 1, close + 3, 'pivot-high-2026-08-15'),
      zone('resistance-2', 'resistance', close + 20, close + 22, 'pivot-high-2026-07-15'),
      zone('resistance-3', 'resistance', close + 40, close + 42, 'pivot-high-2026-06-15'),
    ]
    const plans = deriveTradePlanCandidates(levels, {
      referenceSession: metrics.referenceSession,
      currentClose: close,
      atr14: metrics.latest.atr14,
      validUntilSession: '2026-09-30',
    })
    const [breakout, pullback] = plans
    expect(breakout).toMatchObject({ planId: 'breakout', setupType: 'breakout', status: 'WATCH', eventStatus: 'UNVERIFIED', selectedZoneIds: ['resistance-1', 'support-1', 'resistance-2', 'resistance-3'], validUntilSession: '2026-09-30', requiresHumanReview: true })
    expect(breakout?.triggerPrice).toBeCloseTo(close + 3 + metrics.latest.atr14! * 0.1)
    expect(breakout?.confirmation).toContain('RVOL20 >= 1.3')
    expect(breakout?.structuralStop).toMatchObject({ zoneId: 'support-1', rule: 'next_lower_support_zone', stopPrice: null })
    expect(breakout?.target1?.zoneId).toBe('resistance-2')
    expect(breakout?.target2?.zoneId).toBe('resistance-3')
    expect(breakout?.midRewardRisk.target1).toBeCloseTo(19 / 12)
    expect(breakout?.conservativeRewardRisk.target1).toBeCloseTo(17 / 14)
    expect(breakout?.conservativeRewardRisk.target2).toBeCloseTo(37 / 14)

    expect(pullback).toMatchObject({ planId: 'pullback', status: 'WATCH', eventStatus: 'UNVERIFIED', selectedZoneIds: ['support-1', 'support-2', 'resistance-1', 'resistance-2'], requiresHumanReview: true })
    expect(pullback?.trigger).toContain('completed regular-session close back above')
    expect(pullback?.structuralStop).toMatchObject({ zoneId: 'support-2', rule: 'next_lower_support_zone', stopPrice: null })
    expect(pullback?.midRewardRisk.target1).toBeCloseTo(1.2)
    expect(pullback?.conservativeRewardRisk.target1).toBeCloseTo(10 / 12)
    expect(pullback?.midRewardRisk.target2).toBeCloseTo(3.1)
    expect(pullback?.conservativeRewardRisk.target2).toBeCloseTo(29 / 12)
  })

  it('keeps missing target zones N/A instead of inventing or skipping to another level', () => {
    const levels: StructuralLevel[] = [
      { zoneId: 'support-1', side: 'support', lower: 90, upper: 92, center: 91, anchors: ['pivot-low-2026-09-01'], basis: 'indicator_ohlc', confirmedAsOf: '2026-09-01', impact: '' },
      { zoneId: 'resistance-1', side: 'resistance', lower: 102, upper: 104, center: 103, anchors: ['pivot-high-2026-09-01'], basis: 'indicator_ohlc', confirmedAsOf: '2026-09-01', impact: '' },
    ]
    const plans = deriveTradePlanCandidates(levels, { referenceSession: '2026-09-01', currentClose: 100, atr14: 2 })
    expect(plans.every(plan => plan.status === 'N_A' && plan.selectedZoneIds.length === 0 && plan.target1 === null && plan.midRewardRisk.target1 === null)).toBe(true)
  })

  it('does not skip an overlapping next resistance to select a farther T2', () => {
    const levels: StructuralLevel[] = [
      { zoneId: 'support-1', side: 'support', lower: 90, upper: 92, center: 91, anchors: ['pivot-low-2026-09-01'], basis: 'indicator_ohlc', confirmedAsOf: '2026-09-01', impact: '' },
      { zoneId: 'support-2', side: 'support', lower: 80, upper: 82, center: 81, anchors: ['pivot-low-2026-08-01'], basis: 'indicator_ohlc', confirmedAsOf: '2026-09-01', impact: '' },
      { zoneId: 'resistance-1', side: 'resistance', lower: 102, upper: 104, center: 103, anchors: ['pivot-high-2026-09-01'], basis: 'indicator_ohlc', confirmedAsOf: '2026-09-01', impact: '' },
      { zoneId: 'resistance-2-overlap', side: 'resistance', lower: 103, upper: 105, center: 104, anchors: ['pivot-high-2026-08-20'], basis: 'indicator_ohlc', confirmedAsOf: '2026-09-01', impact: '' },
      { zoneId: 'resistance-3-farther', side: 'resistance', lower: 120, upper: 122, center: 121, anchors: ['pivot-high-2026-08-01'], basis: 'indicator_ohlc', confirmedAsOf: '2026-09-01', impact: '' },
    ]
    const pullback = deriveTradePlanCandidates(levels, { referenceSession: '2026-09-01', currentClose: 100, atr14: 2 })[1]
    expect(pullback).toMatchObject({ status: 'WATCH', target1: { zoneId: 'resistance-1' }, target2: null, midRewardRisk: { target1: expect.any(Number), target2: null } })
    expect(pullback?.selectedZoneIds).not.toContain('resistance-3-farther')
    expect(pullback?.reason).toContain('farther targets are not substituted')
  })

  it('requires a positive 30-week SMA slope for the ten-point weekly score and keeps unavailable inputs N/A', () => {
    const metrics = calculateResearchMetrics(inputFor(syntheticBars(260)))
    const weekSma30 = [...Array.from({ length: 33 }, () => 100), 105, 104, 103, 102, 101]
    const adjusted = {
      ...metrics,
      weekSma30,
      completedWeeks: [...metrics.completedWeeks.slice(0, -1), { ...metrics.completedWeeks.at(-1)!, close: 101 }],
      latest: { ...metrics.latest, sma30Week: 100, adx14: null },
    }
    const unavailableThreeMonth = [{ window: '3_calendar_month' as const, benchmark: 'SPY', startDate: '2025-01-01', endDate: metrics.referenceSession, targetReturnPct: 5, benchmarkReturnPct: null, outperformancePp: null, relativeRatioReturnPct: null }]
    const score = calculateDirectionScore(adjusted, unavailableThreeMonth)
    expect(score.evidence.weekCloseAboveSma30).toBe(true)
    expect(score.evidence.weekSlopePositive).toBe(false)
    expect(score.evidence.weeklyTrendConfirmed).toBe(false)
    expect(score.missing).toContain('adxCapVerified')
    expect(score.missing).toContain('3mOutperformsSPY')
    expect(score.label).toBe('N/A')

    const otherInstrument = calculateDirectionScore({ ...adjusted, symbol: 'NVDA' }, [])
    expect(otherInstrument.evidence['20dOutperformsSMH']).toBeUndefined()
    expect(otherInstrument.missing).toContain('20dOutperformsconfiguredBenchmark1')
  })

  it('anchors relative-strength windows to target sessions and returns N/A for missing benchmark endpoints', () => {
    const target = syntheticBars(30, 'SOXX')
    const benchmark = target.map((bar, index) => ({ ...bar, symbol: 'SPY', close: 100 + index * 0.05 }))
    const latest = target.at(-1)!.date
    const missingEnd = calculateRelativeStrength(target, benchmark.slice(0, -1), 'SPY', latest)
    expect(missingEnd.every(window => window.endDate === latest && window.outperformancePp === null)).toBe(true)
    const absentReference = calculateRelativeStrength(target, benchmark, 'SPY', '2030-01-01')
    expect(absentReference.every(window => window.endDate === '2030-01-01' && window.outperformancePp === null)).toBe(true)
  })
})
