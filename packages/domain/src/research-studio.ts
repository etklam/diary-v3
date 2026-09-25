/**
 * Deterministic Research Studio calculations.
 *
 * The module is deliberately pure: it does not read files, call providers, or
 * access the database. The API/worker layer owns evidence acquisition and
 * persistence; this module owns the v1 mathematical contract.
 */

export const RESEARCH_METHOD_ID = 'us-equity-swing-report' as const
export const RESEARCH_METHOD_VERSION = '1.0.0' as const
export const RESEARCH_CALCULATOR_VERSION = 'ts-research-calculator-1.0.0' as const
export const RESEARCH_METHOD_SOURCE_FIXTURE = 'tests/fixtures/research-method/notion-pages.json' as const
export const RESEARCH_METHOD_SOURCE_SHA256 =
  'b45697fb82435cfc4c45961620be209ab8ebe59f558e36c02bcda380eff6206d' as const

export type ResearchMethodAppendix = {
  name: string
  title: string
  sourceSha256: string
  sourceEditedAt: string
  sourceHashScope: 'page-content-text'
}

const methodAppendices: readonly ResearchMethodAppendix[] = [
  {
    name: 'main',
    title: 'us-equity-swing-report',
    sourceSha256: '6204a58b4b1004e1b42e40bd0436d0cb6288340c0672a9461b6bbb515d73a9a4',
    sourceEditedAt: '2026-09-24T09:52:35.936Z',
    sourceHashScope: 'page-content-text',
  },
  {
    name: '01-data-sources',
    title: '01 Data Sources',
    sourceSha256: '7e583ecf6f9359b2d7373071eec12002631ad41041a57e9edcbb1f44c4df0c92',
    sourceEditedAt: '2026-09-24T09:45:08.878Z',
    sourceHashScope: 'page-content-text',
  },
  {
    name: '02-data-contract',
    title: '02 Data Contract',
    sourceSha256: 'a81f35b1c4a409cb147017496ef9f8a12d519a3bf5ff90ad2684aa8717404d6d',
    sourceEditedAt: '2026-09-24T09:45:08.878Z',
    sourceHashScope: 'page-content-text',
  },
  {
    name: '03-indicator-spec',
    title: '03 Indicator Spec',
    sourceSha256: '6277e7a3ed90f654883cbf1ca37716c368373054ea2689a3fb4394513f9a3f28',
    sourceEditedAt: '2026-09-24T09:45:08.878Z',
    sourceHashScope: 'page-content-text',
  },
  {
    name: '04-analysis-and-trades',
    title: '04 Analysis & Trades',
    sourceSha256: '94fd97e09ad01717bbd28c8d27fdc2588dabd7d1f5b0f5d2823fdc57f063dd',
    sourceEditedAt: '2026-09-24T09:46:52.029Z',
    sourceHashScope: 'page-content-text',
  },
  {
    name: '05-news-and-events',
    title: '05 News & Events',
    sourceSha256: 'efb8812b2e1866b5862c82fa0b7d87b11ed369b40911d28bbd0a2bf1b82dc345',
    sourceEditedAt: '2026-09-24T09:46:52.029Z',
    sourceHashScope: 'page-content-text',
  },
  {
    name: '06-report-and-qa',
    title: '06 Report & QA',
    sourceSha256: '0bff47edc96189e32d6138ce54da6b74cb7d6a4c98b348a15aa4c78db7dbc520',
    sourceEditedAt: '2026-09-24T09:48:31.082Z',
    sourceHashScope: 'page-content-text',
  },
  {
    name: '07-runbook',
    title: '07 Runbook',
    sourceSha256: '1da2561001ef174f5b298194998caf9386a7ab8d7e1bb1a7f30b437b9995b818',
    sourceEditedAt: '2026-09-24T09:48:31.082Z',
    sourceHashScope: 'page-content-text',
  },
]

export type ResearchCoverageEntry = {
  id: string
  rule: string
  implementation: string
  evidence: readonly string[]
  manualQa: boolean
}

export const RESEARCH_METHOD_BUNDLE = {
  id: RESEARCH_METHOD_ID,
  version: RESEARCH_METHOD_VERSION,
  sourceFixture: RESEARCH_METHOD_SOURCE_FIXTURE,
  sourceSha256: RESEARCH_METHOD_SOURCE_SHA256,
  sourceRetrievedAt: '2026-09-24T17:41:21.300Z',
  calculatorVersion: RESEARCH_CALCULATOR_VERSION,
  appendices: methodAppendices,
  requirements: {
    targetSessions: 400,
    minimumCloses: 260,
    minimumCompleteOhlc: 150,
    minimumRecentVolume: 21,
    minimumCompletedWeeks: 34,
  },
  coverage: [
    { id: 'M01', rule: 'Canonical bars and data quality gates', implementation: 'validateResearchInput/normalizeResearchBars', evidence: ['02-data-contract', '06-report-and-qa'], manualQa: true },
    { id: 'M02', rule: 'SMA/EMA/RMA seeds and slopes', implementation: 'calculateResearchMetrics', evidence: ['03-indicator-spec'], manualQa: true },
    { id: 'M03', rule: 'RSI14, MACD12/26/9, ATR14', implementation: 'calculateResearchMetrics', evidence: ['03-indicator-spec'], manualQa: true },
    { id: 'M04', rule: 'DMI/ADX14 and Bollinger20/2', implementation: 'calculateResearchMetrics', evidence: ['03-indicator-spec'], manualQa: true },
    { id: 'M05', rule: 'Prior-20-day volume and completed weekly bars', implementation: 'calculateResearchMetrics', evidence: ['03-indicator-spec'], manualQa: true },
    { id: 'M06', rule: 'Common-window price and relative returns', implementation: 'calculateRelativeStrength', evidence: ['03-indicator-spec', '06-report-and-qa'], manualQa: true },
    { id: 'M07', rule: 'Confirmed pivots and recent gaps', implementation: 'findConfirmedPivots/findGaps', evidence: ['03-indicator-spec'], manualQa: true },
    { id: 'M08', rule: 'Structural levels and two reward/risk views', implementation: 'deriveStructuralLevels/calculateRewardRisk', evidence: ['04-analysis-and-trades'], manualQa: true },
    { id: 'M09', rule: 'Transparent direction score and caps', implementation: 'calculateDirectionScore', evidence: ['04-analysis-and-trades'], manualQa: true },
    { id: 'M10', rule: 'Human review remains required for subjective claims', implementation: 'RESEARCH_METHOD_BUNDLE coverage and QA handoff', evidence: ['04-analysis-and-trades', '06-report-and-qa'], manualQa: true },
  ] satisfies readonly ResearchCoverageEntry[],
} as const

export type AdjustmentMode = 'total_return_rebased' | 'split_only'
export type ResearchQuality = 'FULL' | 'LIMITED' | 'STALE' | 'FAILED'
export type ValidationStatus = 'PASS' | 'WARN' | 'FAIL' | 'N/A'
export type ResearchGateId = 'G01' | 'G02' | 'G03' | 'G04' | 'G05' | 'G06' | 'G07' | 'G08' | 'G09' | 'G10'

export type ResearchInstrument = {
  symbol: string
  name: string
  exchange: string
  currency: string
  assetType: 'equity' | 'etf' | string
  benchmarkSymbols?: readonly string[]
  peerSymbols?: readonly string[]
}

export type ResearchSession = {
  date: string
  closeAt: string
  isCompleted: boolean
  isWeekFinal: boolean
  timezone?: string
  sourceId?: string
}

export type ResearchBar = {
  symbol: string
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  adjClose: number | null
  volume: number | null
  priceSourceId: string
  volumeSourceId: string | null
  adjustmentBasis: AdjustmentMode | string
  volumeBasis: string
  session: 'regular_close' | 'regular_intraday' | 'pre' | 'post' | 'overnight' | string
  dataAsOf: string | null
  retrievedAt: string | null
  isComplete?: boolean
  isWeekFinal?: boolean
}

/** A provider row before calculation filtering; null OHLC fields stay visible to validation. */
export type ResearchObservedBar = Omit<ResearchBar, 'open' | 'high' | 'low' | 'close' | 'priceSourceId'> & {
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  priceSourceId: string | null
}

export type ResearchSource = {
  sourceId: string
  requestedUrl: string | null
  resolvedUrl: string | null
  publisher: string | null
  title: string | null
  retrievedAt: string | null
  dataAsOf: string | null
  retrievalStatus: 'success' | 'not_attempted' | 'failed' | string
}

export type ResearchCalculationInput = {
  instrument: ResearchInstrument
  bars: readonly ResearchBar[]
  /** All rows in the requested evidence window, including rows with missing OHLC. */
  observedBars?: readonly ResearchObservedBar[]
  sessions: readonly ResearchSession[]
  referenceSession: string
  asOf: string
  adjustmentMode: AdjustmentMode
  benchmarkSeries?: Readonly<Record<string, readonly ResearchBar[]>>
  sourceRegistry?: readonly ResearchSource[]
  sourceIds?: readonly string[]
  humanQaComplete?: boolean
}

export type ValidationIssue = {
  code: string
  message: string
  date?: string
  severity: 'warning' | 'error'
}

export type GateResult = {
  gateId: ResearchGateId
  status: ValidationStatus
  evidence: readonly string[]
  fixOrLimitation: string | null
}

export type ResearchValidation = {
  valid: boolean
  quality: ResearchQuality
  issues: readonly ValidationIssue[]
  gates: readonly GateResult[]
  counts: {
    rows: number
    closes: number
    completeOhlc: number
    recentVolume: number
    completedWeeks: number
  }
}

export type NormalizedResearchResult = {
  bars: readonly ResearchBar[]
  mode: AdjustmentMode
  warnings: readonly string[]
  factorAtReference: number | null
}

type NullableNumber = number | null

export type CompletedWeek = {
  week: string
  startDate: string
  endDate: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
  isWeekFinal: true
}

export type RelativeReturnWindow = {
  window: '5_session' | '20_session' | '3_calendar_month'
  benchmark?: string
  startDate: string | null
  endDate: string | null
  targetReturnPct: number | null
  benchmarkReturnPct: number | null
  outperformancePp: number | null
  relativeRatioReturnPct: number | null
}

export type ConfirmedPivot = {
  type: 'high' | 'low'
  date: string
  confirmedOn: string
  price: number
  index: number
  rsi14: number | null
  macd: number | null
}

export type PriceGap = {
  type: 'up' | 'down'
  date: string
  index: number
  lower: number
  upper: number
  status: 'open' | 'partial' | 'filled'
  basis: 'indicator_ohlc'
}

export type IndicatorSnapshot = {
  close: number
  ema10: number | null
  ema20: number | null
  sma50: number | null
  sma200: number | null
  sma30Week: number | null
  sma10Slope5Pct: number | null
  ema10Slope5Pct: number | null
  ema20Slope5Pct: number | null
  sma50Slope5Pct: number | null
  sma200Slope20Pct: number | null
  rsi14: number | null
  macd: number | null
  macdSignal: number | null
  macdHistogram: number | null
  atr14: number | null
  atrPct: number | null
  plusDi14: number | null
  minusDi14: number | null
  adx14: number | null
  bollingerMid: number | null
  bollingerUpper: number | null
  bollingerLower: number | null
  bollingerWidthPct: number | null
  rvol20: number | null
}

export type ResearchMetrics = {
  calculatorVersion: typeof RESEARCH_CALCULATOR_VERSION
  symbol: string
  referenceSession: string
  adjustmentMode: AdjustmentMode
  bars: readonly ResearchBar[]
  closes: readonly number[]
  indicatorOhlc: readonly ResearchBar[]
  ema10: readonly NullableNumber[]
  ema20: readonly NullableNumber[]
  sma50: readonly NullableNumber[]
  sma200: readonly NullableNumber[]
  ema12: readonly NullableNumber[]
  ema26: readonly NullableNumber[]
  rsi14: readonly NullableNumber[]
  macd: readonly NullableNumber[]
  macdSignal: readonly NullableNumber[]
  macdHistogram: readonly NullableNumber[]
  tr: readonly NullableNumber[]
  atr14: readonly NullableNumber[]
  plusDm14: readonly NullableNumber[]
  minusDm14: readonly NullableNumber[]
  plusDi14: readonly NullableNumber[]
  minusDi14: readonly NullableNumber[]
  dx14: readonly NullableNumber[]
  adx14: readonly NullableNumber[]
  bollingerMid: readonly NullableNumber[]
  bollingerUpper: readonly NullableNumber[]
  bollingerLower: readonly NullableNumber[]
  bollingerWidthPct: readonly NullableNumber[]
  priorVolumeMean20: readonly NullableNumber[]
  rvol20: readonly NullableNumber[]
  highLowMean5: readonly NullableNumber[]
  highLowMean20: readonly NullableNumber[]
  completedWeeks: readonly CompletedWeek[]
  weekSma30: readonly NullableNumber[]
  pivots: readonly ConfirmedPivot[]
  gaps: readonly PriceGap[]
  latest: IndicatorSnapshot
  warnings: readonly string[]
}

export type StructuralAnchor = {
  anchorId: string
  type: 'pivot_high' | 'pivot_low' | 'gap' | 'moving_average'
  date: string
  lower: number
  upper: number
  center: number
  basis: string
  metricPath: string
  confirmed: boolean
}

export type StructuralLevel = {
  zoneId: string
  side: 'support' | 'resistance'
  lower: number
  upper: number
  center: number
  anchors: readonly string[]
  basis: string
  confirmedAsOf: string
  impact: string
}

export type RewardRiskResult = {
  valid: boolean
  reason: string | null
  entryMid: number | null
  stopMid: number | null
  targetMid: number | null
  riskMid: number | null
  rewardMid: number | null
  mid: number | null
  conservative: number | null
}

export type DirectionScore = {
  rawScore: number | null
  caps: readonly string[]
  finalScore: number | null
  label: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish' | 'N/A'
  evidence: Readonly<Record<string, boolean | null>>
  missing: readonly string[]
}

export type DirectionScoreOptions = {
  relativeBenchmarks?: readonly string[]
  threeMonthBenchmark?: string
}

export type ResearchPlanZone = {
  zoneId: string
  lower: number
  upper: number
  anchors: readonly string[]
  basis: string
}

export type ResearchPlanStop = ResearchPlanZone & {
  rule: 'next_lower_support_zone'
  stopPrice: null
}

export type ResearchTradePlanCandidate = {
  planId: 'breakout' | 'pullback'
  setupType: 'breakout' | 'pullback'
  status: 'WATCH' | 'N_A'
  trigger: string | null
  triggerPrice: number | null
  confirmation: string | null
  entry: ResearchPlanZone | null
  structuralStop: ResearchPlanStop | null
  target1: ResearchPlanZone | null
  target2: ResearchPlanZone | null
  midRewardRisk: { target1: number | null; target2: number | null }
  conservativeRewardRisk: { target1: number | null; target2: number | null }
  eventStatus: 'UNVERIFIED'
  invalidation: string | null
  validUntilSession: string | null
  positionSize: null
  selectedZoneIds: readonly string[]
  availableZoneIds: readonly string[]
  requiresHumanReview: true
  reason: string
}

export type ResearchTradePlanContext = {
  referenceSession: string
  currentClose: number | null
  atr14: number | null
  /** Supplied only when the source adapter has verified a future calendar session. */
  validUntilSession?: string | null
}

function finitePositive(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0
}

function finiteNonNegative(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function sortBars<T extends { date: string }>(bars: readonly T[]): T[] {
  return [...bars].sort((a, b) => a.date.localeCompare(b.date))
}

function isIsoInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/u.test(value) && !Number.isNaN(Date.parse(value))
}

function latestCompletedSession(sessions: readonly ResearchSession[], asOf: string): string | null {
  const asOfTime = Date.parse(asOf)
  return sessions
    .filter(session => session.isCompleted && isIsoDate(session.date) && isIsoInstant(session.closeAt) && Date.parse(session.closeAt) <= asOfTime && session.date <= asOf.slice(0, 10))
    .map(session => session.date)
    .sort()
    .at(-1) ?? null
}

function countCompletedWeeks(bars: readonly Pick<ResearchBar, 'date' | 'isComplete'>[], sessionsByDate: ReadonlyMap<string, ResearchSession>): number {
  const rowsByWeek = new Map<string, Set<string>>()
  for (const bar of bars) {
    if (bar.isComplete === false || !sessionsByDate.has(bar.date)) continue
    const week = isoWeekKey(bar.date)
    const dates = rowsByWeek.get(week) ?? new Set<string>()
    dates.add(bar.date)
    rowsByWeek.set(week, dates)
  }
  let count = 0
  for (const [week, dates] of rowsByWeek) {
    const expected = [...sessionsByDate.values()].filter(session => session.isCompleted && isoWeekKey(session.date) === week)
    const last = expected.map(session => session.date).sort().at(-1)
    if (expected.length > 0 && expected.every(session => dates.has(session.date)) && last && sessionsByDate.get(last)?.isWeekFinal === true) count += 1
  }
  return count
}

function isoWeekKey(date: string): string {
  const day = new Date(`${date}T00:00:00Z`)
  const dayNumber = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - dayNumber + 3)
  const year = day.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(year, 0, 4))
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3)
  const week = 1 + Math.round((day.getTime() - firstThursday.getTime()) / 604800000)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function validateResearchInput(input: ResearchCalculationInput): ResearchValidation {
  const issues: ValidationIssue[] = []
  const sorted = sortBars(input.observedBars ?? input.bars)
  const sessionsByDate = new Map(input.sessions.map(session => [session.date, session]))
  const latestSession = latestCompletedSession(input.sessions, input.asOf)
  const sourceIds = new Set([
    ...(input.sourceIds ?? []),
    ...(input.sourceRegistry ?? []).map(source => source.sourceId),
  ])

  if (!input.instrument.symbol || !input.instrument.name || !input.instrument.exchange || input.instrument.currency !== 'USD') {
    issues.push({ code: 'IDENTITY_INVALID', message: 'Instrument identity, exchange, or USD currency is incomplete.', severity: 'error' })
  }
  if (!['equity', 'etf'].includes(input.instrument.assetType)) {
    issues.push({ code: 'ASSET_TYPE_UNSUPPORTED', message: 'Only equity and ETF instruments are supported.', severity: 'error' })
  }
  if (!isIsoDate(input.referenceSession) || !isIsoInstant(input.asOf)) {
    issues.push({ code: 'DATE_INVALID', message: 'Reference session and as-of must use ISO dates/timestamps.', severity: 'error' })
  }
  if (input.sessions.length !== sessionsByDate.size) {
    issues.push({ code: 'DUPLICATE_SESSIONS', message: 'The session calendar contains duplicate dates.', severity: 'error' })
  }
  for (const session of input.sessions) {
    if (!isIsoDate(session.date) || !isIsoInstant(session.closeAt)) {
      issues.push({ code: 'SESSION_TIMESTAMP_INVALID', message: 'Session date or close timestamp is invalid.', date: session.date, severity: 'error' })
    } else if (isIsoInstant(input.asOf) && session.isCompleted && Date.parse(session.closeAt) > Date.parse(input.asOf)) {
      issues.push({ code: 'SESSION_AFTER_AS_OF', message: 'A session marked in the calendar occurs after as-of.', date: session.date, severity: 'error' })
    }
    if (!session.isCompleted && isIsoInstant(session.closeAt) && isIsoInstant(input.asOf) && Date.parse(session.closeAt) <= Date.parse(input.asOf)) {
      issues.push({ code: 'SESSION_COMPLETION_MISMATCH', message: 'A past session close is marked incomplete in the verified calendar.', date: session.date, severity: 'error' })
    }
  }
  if (latestSession !== null && input.referenceSession !== latestSession) {
    issues.push({ code: 'REFERENCE_NOT_LATEST', message: 'Reference session is not the latest completed session.', severity: 'error' })
  }
  if (sorted.length === 0) {
    issues.push({ code: 'NO_BARS', message: 'No canonical bars were supplied.', severity: 'error' })
  }

  const duplicateDates = new Set<string>()
  const seenDates = new Set<string>()
  let completeOhlc = 0
  let closeCount = 0
  const recentRows = sorted.slice(-150)
  const recentVolumeRows = sorted.slice(-21)
  const recentVolumePairs = new Set<string>()
  let recentVolume = 0
  for (const bar of sorted) {
    if (seenDates.has(bar.date)) duplicateDates.add(bar.date)
    seenDates.add(bar.date)
    const session = sessionsByDate.get(bar.date)
    if (!isIsoDate(bar.date) || !session) {
      issues.push({ code: 'SESSION_UNKNOWN', message: 'Bar date is not present in the verified session calendar.', date: bar.date, severity: 'error' })
    }
    if (bar.symbol !== input.instrument.symbol) {
      issues.push({ code: 'IDENTITY_MISMATCH', message: 'Bar symbol does not match instrument profile.', date: bar.date, severity: 'error' })
    }
    if (bar.session !== 'regular_close' || bar.isComplete === false || session?.isCompleted !== true) {
      issues.push({ code: 'INCOMPLETE_SESSION', message: 'Only completed regular daily bars are eligible for calculation.', date: bar.date, severity: 'error' })
    }
    if (bar.date > input.referenceSession) {
      issues.push({ code: 'BAR_AFTER_REFERENCE', message: 'A bar after the reference session cannot enter the calculation window.', date: bar.date, severity: 'error' })
    }
    if (bar.dataAsOf !== null && !isIsoInstant(bar.dataAsOf)) {
      issues.push({ code: 'BAR_TIMESTAMP_INVALID', message: 'Data-as-of timestamp is invalid.', date: bar.date, severity: 'error' })
    }
    if (bar.retrievedAt !== null && !isIsoInstant(bar.retrievedAt)) {
      issues.push({ code: 'BAR_TIMESTAMP_INVALID', message: 'Retrieval timestamp is invalid.', date: bar.date, severity: 'error' })
    }
    if (bar.isWeekFinal === true && session?.isWeekFinal !== true) {
      issues.push({ code: 'WEEK_FINAL_MISMATCH', message: 'A bar cannot mark a week final when the verified calendar does not.', date: bar.date, severity: 'error' })
    }
    if (!finitePositive(bar.close)) {
      issues.push({ code: 'CLOSE_INVALID', message: 'Close must be positive and finite.', date: bar.date, severity: 'error' })
    } else {
      closeCount += 1
    }
    const ohlcValid = finitePositive(bar.open) && finitePositive(bar.high) && finitePositive(bar.low) && finitePositive(bar.close) &&
      bar.low <= bar.open && bar.low <= bar.close && bar.high >= bar.open && bar.high >= bar.close && bar.high >= bar.low
    if (ohlcValid && recentRows.includes(bar)) completeOhlc += 1
    else if (bar.open !== null && bar.high !== null && bar.low !== null && !ohlcValid) {
      issues.push({ code: 'OHLC_INVALID', message: 'OHLC ordering or positivity is invalid.', date: bar.date, severity: 'error' })
    } else if (recentRows.includes(bar)) {
      issues.push({ code: 'RECENT_OHLC_MISSING', message: 'A recent row is missing one or more OHLC fields.', date: bar.date, severity: 'warning' })
    }
    if (bar.volume !== null && !finiteNonNegative(bar.volume)) {
      issues.push({ code: 'VOLUME_INVALID', message: 'Volume must be null or non-negative.', date: bar.date, severity: 'error' })
    } else if (bar.volume !== null && bar.volumeSourceId && bar.volumeBasis && recentVolumeRows.includes(bar)) {
      recentVolume += 1
      recentVolumePairs.add(`${bar.volumeSourceId}\u0000${bar.volumeBasis}`)
    }
    if (!bar.priceSourceId || !sourceIds.has(bar.priceSourceId)) {
      issues.push({ code: 'PRICE_SOURCE_MISSING', message: 'Price source is not in the source registry.', date: bar.date, severity: 'error' })
    }
    if (bar.volume !== null && bar.volumeSourceId && !sourceIds.has(bar.volumeSourceId)) {
      issues.push({ code: 'VOLUME_SOURCE_MISSING', message: 'Volume source is not in the source registry.', date: bar.date, severity: 'error' })
    }
  }
  if (duplicateDates.size > 0) {
    issues.push({ code: 'DUPLICATE_DATES', message: `Duplicate canonical dates: ${[...duplicateDates].join(', ')}`, severity: 'error' })
  }
  const expectedSessions = input.sessions.filter(session => session.isCompleted && session.date >= (sorted[0]?.date ?? input.referenceSession) && session.date <= input.referenceSession)
  const missingExpected = expectedSessions.filter(session => !seenDates.has(session.date)).map(session => session.date)
  if (missingExpected.length > 0) {
    issues.push({ code: 'MISSING_EXPECTED_SESSION', message: `Missing ${missingExpected.length} completed session row(s): ${missingExpected.join(', ')}.`, severity: 'error' })
  }
  const latestObserved = sorted.at(-1)
  if (!latestObserved || latestObserved.date !== input.referenceSession) {
    issues.push({ code: 'REFERENCE_BAR_MISSING', message: 'The latest observed daily row must match the reference session.', date: input.referenceSession, severity: 'error' })
  }
  if (recentVolumePairs.size > 1) {
    issues.push({ code: 'VOLUME_BASIS_MISMATCH', message: 'The recent volume window mixes source or basis.', severity: 'error' })
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (previous && current && finitePositive(previous.close) && finitePositive(current.close) && Math.abs(current.close / previous.close - 1) > 0.25) {
      issues.push({ code: 'OUTLIER_REVIEW', message: 'A daily close move exceeds 25% and requires corporate-action review.', date: current.date, severity: 'warning' })
    }
  }
  if (input.adjustmentMode === 'total_return_rebased' && sorted.some(bar => !finitePositive(bar.adjClose))) {
    issues.push({ code: 'ADJUSTED_CLOSE_MISSING', message: 'Total-return rebasing requires an adjusted close for every bar.', severity: 'error' })
  }
  if (input.adjustmentMode === 'split_only') {
    issues.push({ code: 'SPLIT_ONLY_LIMITATION', message: 'Cash-dividend adjustment is unavailable; results are LIMITED.', severity: 'warning' })
  }

  const counts = {
    rows: sorted.length,
    closes: closeCount,
    completeOhlc,
    recentVolume: recentVolumePairs.size > 1 ? 0 : recentVolume,
    completedWeeks: countCompletedWeeks(sorted, sessionsByDate),
  }
  if (counts.closes < 260) issues.push({ code: 'CLOSE_SAMPLE_SHORT', message: 'Fewer than 260 closes are available.', severity: 'warning' })
  if (counts.completeOhlc < 150) issues.push({ code: 'OHLC_SAMPLE_SHORT', message: 'Fewer than 150 complete recent OHLC bars are available.', severity: 'warning' })
  if (counts.recentVolume < 21) issues.push({ code: 'VOLUME_SAMPLE_SHORT', message: 'Fewer than 21 recent same-basis volume observations are available.', severity: 'warning' })
  if (counts.completedWeeks < 34) issues.push({ code: 'WEEK_SAMPLE_SHORT', message: 'Fewer than 34 completed weeks are available.', severity: 'warning' })

  const errorCodes = new Set(issues.filter(issue => issue.severity === 'error').map(issue => issue.code))
  const stale = errorCodes.has('REFERENCE_NOT_LATEST')
  const quality: ResearchQuality = errorCodes.size > 0 && !stale ? 'FAILED' : stale ? 'STALE' :
    input.adjustmentMode === 'split_only' || issues.some(issue => issue.severity === 'warning') ? 'LIMITED' : 'FULL'
  const gate = (gateId: ResearchGateId, status: ValidationStatus, evidence: readonly string[], fixOrLimitation: string | null): GateResult => ({ gateId, status, evidence, fixOrLimitation })
  const has = (codes: readonly string[]) => issues.some(issue => codes.includes(issue.code) && issue.severity === 'error')
  const gates: GateResult[] = [
    gate('G01', has(['IDENTITY_INVALID', 'IDENTITY_MISMATCH', 'ASSET_TYPE_UNSUPPORTED']) ? 'FAIL' : 'PASS', ['instrument', 'canonical bars'], 'Verify name, ticker, exchange, USD, and asset type.'),
    gate('G02', has(['DATE_INVALID', 'REFERENCE_NOT_LATEST', 'REFERENCE_BAR_MISSING']) ? 'FAIL' : 'PASS', ['referenceSession', 'session calendar'], has(['REFERENCE_NOT_LATEST', 'REFERENCE_BAR_MISSING']) ? 'Use the latest completed regular session and its observed row.' : null),
    gate('G03', has(['NO_BARS', 'CLOSE_INVALID', 'DUPLICATE_DATES', 'OHLC_INVALID', 'DUPLICATE_SESSIONS', 'MISSING_EXPECTED_SESSION', 'BAR_AFTER_REFERENCE', 'VOLUME_INVALID', 'VOLUME_BASIS_MISMATCH', 'PRICE_SOURCE_MISSING', 'VOLUME_SOURCE_MISSING']) ? 'FAIL' : 'PASS', ['canonical bars', 'session calendar'], 'Resolve missing, duplicate, invalid, or conflicting daily rows.'),
    gate('G04', has(['ADJUSTED_CLOSE_MISSING']) ? 'FAIL' : input.adjustmentMode === 'split_only' ? 'WARN' : 'PASS', ['adjustmentMode', 'adjClose'], input.adjustmentMode === 'split_only' ? 'Cash-dividend adjustment is unavailable.' : null),
    gate('G05', counts.closes < 260 || counts.completeOhlc < 150 || counts.recentVolume < 21 || counts.completedWeeks < 34 ? 'WARN' : 'PASS', ['sample counts', 'calculatorVersion'], counts.closes < 200 ? 'SMA200 remains N/A.' : 'Full-sample thresholds are not met.'),
    gate('G06', has(['INCOMPLETE_SESSION', 'SESSION_UNKNOWN', 'SESSION_AFTER_AS_OF', 'SESSION_COMPLETION_MISMATCH', 'WEEK_FINAL_MISMATCH', 'SESSION_TIMESTAMP_INVALID', 'BAR_TIMESTAMP_INVALID']) ? 'FAIL' : 'PASS', ['session calendar', 'bar.session'], 'Use only completed regular sessions from the verified calendar.'),
    gate('G07', 'N/A', ['structural levels', 'trade plans'], 'Checked when trade plans are derived.'),
    gate('G08', 'N/A', ['events'], 'Event timing is owned by the evidence module.'),
    gate('G09', 'N/A', ['source registry', 'claim records'], 'Citation support is owned by the QA module.'),
    gate('G10', 'N/A', ['report revision'], 'Cross-section contradiction checks are owned by the QA module.'),
  ]
  return { valid: errorCodes.size === 0, quality, issues, gates, counts }
}

export class ResearchNormalizationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ResearchNormalizationError'
    this.code = code
  }
}

export function normalizeResearchBars(input: ResearchCalculationInput, mode: AdjustmentMode = input.adjustmentMode): NormalizedResearchResult {
  const bars = sortBars(input.bars)
  const reference = bars.find(bar => bar.date === input.referenceSession)
  if (!reference) throw new ResearchNormalizationError('REFERENCE_BAR_MISSING', 'The reference session has no canonical bar.')
  if (!finitePositive(reference.close)) throw new ResearchNormalizationError('REFERENCE_CLOSE_INVALID', 'The reference close must be positive.')
  const referenceFactor = mode === 'total_return_rebased' ?
    (finitePositive(reference.adjClose) ? reference.adjClose / reference.close : null) : null
  if (mode === 'total_return_rebased' && referenceFactor === null) {
    throw new ResearchNormalizationError('ADJUSTED_CLOSE_MISSING', 'Total-return rebasing requires a valid adjusted close at the reference session.')
  }
  const warnings: string[] = []
  if (mode === 'split_only') warnings.push('split_only: cash-dividend adjustment is unavailable; report quality is LIMITED.')
  const normalized = bars.map(bar => {
    if (mode === 'split_only') return { ...bar, adjustmentBasis: mode }
    if (!finitePositive(bar.adjClose)) {
      throw new ResearchNormalizationError('ADJUSTED_CLOSE_MISSING', `Adjusted close is missing for ${bar.date}.`)
    }
    const factor = bar.adjClose / bar.close
    const rebasingFactor = factor / (referenceFactor as number)
    return {
      ...bar,
      open: bar.open === null ? null : bar.open * rebasingFactor,
      high: bar.high === null ? null : bar.high * rebasingFactor,
      low: bar.low === null ? null : bar.low * rebasingFactor,
      close: bar.close * rebasingFactor,
      adjClose: bar.adjClose * rebasingFactor,
      adjustmentBasis: mode,
    }
  })
  return { bars: normalized, mode, warnings, factorAtReference: referenceFactor }
}

function valid(value: NullableNumber): value is number {
  return value !== null && Number.isFinite(value)
}

function smaSeries(values: readonly NullableNumber[], period: number): NullableNumber[] {
  const result: NullableNumber[] = Array.from({ length: values.length }, () => null)
  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1)
    if (window.length === period && window.every(valid)) result[index] = (window as number[]).reduce((sum, item) => sum + item, 0) / period
  }
  return result
}

function emaSeries(values: readonly NullableNumber[], period: number): NullableNumber[] {
  const result: NullableNumber[] = Array.from({ length: values.length }, () => null)
  const alpha = 2 / (period + 1)
  let seed: number[] = []
  let ema: number | null = null
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? null
    if (!valid(value)) {
      seed = []
      ema = null
      continue
    }
    if (ema === null) {
      seed.push(value)
      if (seed.length === period) {
        ema = seed.reduce((sum, item) => sum + item, 0) / period
        result[index] = ema
      }
      continue
    }
    ema = alpha * value + (1 - alpha) * ema
    result[index] = ema
  }
  return result
}

function rmaSeries(values: readonly NullableNumber[], period: number): NullableNumber[] {
  const result: NullableNumber[] = Array.from({ length: values.length }, () => null)
  let seed: number[] = []
  let rma: number | null = null
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? null
    if (!valid(value)) {
      seed = []
      rma = null
      continue
    }
    if (rma === null) {
      seed.push(value)
      if (seed.length === period) {
        rma = seed.reduce((sum, item) => sum + item, 0) / period
        result[index] = rma
      }
      continue
    }
    rma = ((period - 1) * rma + value) / period
    result[index] = rma
  }
  return result
}

function percentChange(current: NullableNumber, previous: NullableNumber): number | null {
  return valid(current) && valid(previous) && previous !== 0 ? 100 * (current / previous - 1) : null
}

function slope(values: readonly NullableNumber[], lookback: number, index: number): number | null {
  if (index < lookback) return null
  return percentChange(values[index] ?? null, values[index - lookback] ?? null)
}

function maxValid(values: readonly number[]): number | null {
  return values.length ? Math.max(...values) : null
}

function minValid(values: readonly number[]): number | null {
  return values.length ? Math.min(...values) : null
}

function latestValue(values: readonly NullableNumber[]): number | null {
  return values.at(-1) ?? null
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function subtractCalendarMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  const year = value.getUTCFullYear()
  const month = value.getUTCMonth() - months
  const day = Math.min(value.getUTCDate(), daysInMonth(year, month))
  const target = new Date(Date.UTC(year, month, day))
  return target.toISOString().slice(0, 10)
}

function completedWeekBars(bars: readonly ResearchBar[], sessions: readonly ResearchSession[]): CompletedWeek[] {
  const sessionsByDate = new Map(sessions.map(session => [session.date, session]))
  const grouped = new Map<string, ResearchBar[]>()
  for (const bar of bars) {
    const group = grouped.get(isoWeekKey(bar.date)) ?? []
    group.push(bar)
    grouped.set(isoWeekKey(bar.date), group)
  }
  const output: CompletedWeek[] = []
  for (const [week, group] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rows = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const last = rows.at(-1)
    const expectedDates = sessions.filter(session => session.isCompleted && isoWeekKey(session.date) === week).map(session => session.date)
    const rowDates = new Set(rows.map(row => row.date))
    if (!last || sessions.length === 0 || expectedDates.length === 0 || expectedDates.some(date => !rowDates.has(date)) || sessionsByDate.get(last.date)?.isWeekFinal !== true) continue
    const volumes = rows.map(row => row.volume)
    const allOpen = rows.every(row => finitePositive(row.open))
    const allHigh = rows.every(row => finitePositive(row.high))
    const allLow = rows.every(row => finitePositive(row.low))
    output.push({
      week,
      startDate: rows[0]?.date ?? last.date,
      endDate: last.date,
      open: allOpen ? rows[0]?.open ?? null : null,
      high: allHigh ? maxValid(rows.map(row => row.high).filter((value): value is number => value !== null)) : null,
      low: allLow ? minValid(rows.map(row => row.low).filter((value): value is number => value !== null)) : null,
      close: last.close,
      volume: volumes.every((volume): volume is number => finiteNonNegative(volume)) ? volumes.reduce((sum, volume) => sum + volume, 0) : null,
      isWeekFinal: true,
    })
  }
  return output
}

function makeIndicatorBars(bars: readonly ResearchBar[], mode: AdjustmentMode): ResearchBar[] {
  return bars.map(bar => ({ ...bar, adjustmentBasis: mode }))
}

function buildTr(bars: readonly ResearchBar[]): NullableNumber[] {
  return bars.map((bar, index) => {
    const previous = bars[index - 1]
    if (!previous || !finitePositive(bar.high) || !finitePositive(bar.low) || !finitePositive(previous.close)) return null
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previous.close), Math.abs(bar.low - previous.close))
  })
}

function buildDmi(bars: readonly ResearchBar[], tr: readonly NullableNumber[]) {
  const plusDm: NullableNumber[] = Array.from({ length: bars.length }, () => null)
  const minusDm: NullableNumber[] = Array.from({ length: bars.length }, () => null)
  for (let index = 1; index < bars.length; index += 1) {
    const current = bars[index]
    const previous = bars[index - 1]
    if (!current || !previous || !finitePositive(current.high) || !finitePositive(current.low) || !finitePositive(previous.high) || !finitePositive(previous.low)) continue
    const up = current.high - previous.high
    const down = previous.low - current.low
    plusDm[index] = up > down && up > 0 ? up : 0
    minusDm[index] = down > up && down > 0 ? down : 0
  }
  const plusSmoothed = rmaSeries(plusDm, 14)
  const minusSmoothed = rmaSeries(minusDm, 14)
  const smoothedTr = rmaSeries(tr, 14)
  const plusDi = plusSmoothed.map((value, index) => {
    const denominator = smoothedTr[index] ?? null
    return valid(value) && valid(denominator) ? denominator === 0 ? 0 : 100 * value / denominator : null
  })
  const minusDi = minusSmoothed.map((value, index) => {
    const denominator = smoothedTr[index] ?? null
    return valid(value) && valid(denominator) ? denominator === 0 ? 0 : 100 * value / denominator : null
  })
  const dx = plusDi.map((plus, index) => {
    const minus = minusDi[index] ?? null
    if (!valid(plus) || !valid(minus)) return null
    const sum = plus + minus
    return sum === 0 ? 0 : 100 * Math.abs(plus - minus) / sum
  })
  return { plusDm, minusDm, plusDi, minusDi, dx, adx: rmaSeries(dx, 14) }
}

export function findConfirmedPivots(
  bars: readonly ResearchBar[],
  rsi14: readonly NullableNumber[] = [],
  macd: readonly NullableNumber[] = [],
): ConfirmedPivot[] {
  const pivots: ConfirmedPivot[] = []
  for (let index = 2; index < bars.length - 2; index += 1) {
    const center = bars[index]
    const left = bars.slice(index - 2, index)
    const right = bars.slice(index + 1, index + 3)
    if (!center || left.length !== 2 || right.length !== 2 || ![center, ...left, ...right].every(bar => finitePositive(bar.high) && finitePositive(bar.low))) continue
    const centerHigh = center.high!
    const centerLow = center.low!
    const leftHigh = left.map(bar => bar.high!).filter(Number.isFinite)
    const rightHigh = right.map(bar => bar.high!).filter(Number.isFinite)
    const leftLow = left.map(bar => bar.low!).filter(Number.isFinite)
    const rightLow = right.map(bar => bar.low!).filter(Number.isFinite)
    const pivotHigh = centerHigh >= Math.max(...leftHigh) && centerHigh > Math.max(...rightHigh)
    const pivotLow = centerLow <= Math.min(...leftLow) && centerLow < Math.min(...rightLow)
    if (pivotHigh) pivots.push({ type: 'high', date: center.date, confirmedOn: bars[index + 2]?.date ?? center.date, price: centerHigh, index, rsi14: rsi14[index] ?? null, macd: macd[index] ?? null })
    if (pivotLow) pivots.push({ type: 'low', date: center.date, confirmedOn: bars[index + 2]?.date ?? center.date, price: centerLow, index, rsi14: rsi14[index] ?? null, macd: macd[index] ?? null })
  }
  return pivots
}

export function findGaps(bars: readonly ResearchBar[], limit = 120): PriceGap[] {
  const start = Math.max(1, bars.length - limit)
  const gaps: PriceGap[] = []
  for (let index = start; index < bars.length; index += 1) {
    const previous = bars[index - 1]
    const current = bars[index]
    if (!previous || !current || !finitePositive(previous.high) || !finitePositive(previous.low) || !finitePositive(current.high) || !finitePositive(current.low)) continue
    let type: 'up' | 'down' | null = null
    let lower = 0
    let upper = 0
    if (current.low > previous.high) {
      type = 'up'
      lower = previous.high
      upper = current.low
    } else if (current.high < previous.low) {
      type = 'down'
      lower = current.high
      upper = previous.low
    }
    if (!type) continue
    let status: PriceGap['status'] = 'open'
    for (const later of bars.slice(index + 1)) {
      const penetration = type === 'up' ? later.low : later.high
      if (!finitePositive(penetration)) continue
      if (type === 'up') {
        if (penetration <= lower) status = 'filled'
        else if (penetration < upper && status === 'open') status = 'partial'
      } else if (penetration >= upper) status = 'filled'
      else if (penetration > lower && status === 'open') status = 'partial'
    }
    gaps.push({ type, date: current.date, index, lower, upper, status, basis: 'indicator_ohlc' })
  }
  return gaps
}

export function calculateResearchMetrics(input: ResearchCalculationInput | { bars: readonly ResearchBar[]; referenceSession?: string; adjustmentMode?: AdjustmentMode; sessions?: readonly ResearchSession[] }): ResearchMetrics {
  const bars = sortBars(input.bars)
  if (bars.length === 0) throw new ResearchNormalizationError('NO_BARS', 'At least one canonical bar is required.')
  const mode = input.adjustmentMode ?? 'split_only'
  const referenceSession = input.referenceSession ?? bars.at(-1)?.date ?? ''
  const indicatorBars = makeIndicatorBars(bars, mode)
  const closes = indicatorBars.map(bar => bar.close)
  const ema10 = emaSeries(closes, 10)
  const ema20 = emaSeries(closes, 20)
  const sma50 = smaSeries(closes, 50)
  const sma200 = smaSeries(closes, 200)
  const ema12 = emaSeries(closes, 12)
  const ema26 = emaSeries(closes, 26)
  const gains: NullableNumber[] = closes.map((close, index) => index === 0 ? null : Math.max(close - (closes[index - 1] ?? close), 0))
  const losses: NullableNumber[] = closes.map((close, index) => index === 0 ? null : Math.max((closes[index - 1] ?? close) - close, 0))
  const avgGain = rmaSeries(gains, 14)
  const avgLoss = rmaSeries(losses, 14)
  const rsi14 = avgGain.map((gain, index) => {
    const loss = avgLoss[index] ?? null
    if (!valid(gain) || !valid(loss)) return null
    if (loss === 0 && gain > 0) return 100
    if (gain === 0 && loss > 0) return 0
    if (gain === 0 && loss === 0) return 50
    return 100 - 100 / (1 + gain / loss)
  })
  const macd = ema12.map((value, index) => valid(value) && valid(ema26[index] ?? null) ? value - (ema26[index] as number) : null)
  const macdSignal = emaSeries(macd, 9)
  const macdHistogram = macd.map((value, index) => valid(value) && valid(macdSignal[index] ?? null) ? value - (macdSignal[index] as number) : null)
  const tr = buildTr(indicatorBars)
  const smoothedTr = rmaSeries(tr, 14)
  const atr14 = smoothedTr
  const dmi = buildDmi(indicatorBars, tr)
  const bollingerMid = smaSeries(closes, 20)
  const bollingerUpper: NullableNumber[] = Array.from({ length: closes.length }, () => null)
  const bollingerLower: NullableNumber[] = Array.from({ length: closes.length }, () => null)
  const bollingerWidthPct: NullableNumber[] = Array.from({ length: closes.length }, () => null)
  for (let index = 19; index < closes.length; index += 1) {
    const window = closes.slice(index - 19, index + 1)
    const mid = bollingerMid[index] ?? null
    if (!valid(mid) || window.some(value => !Number.isFinite(value))) continue
    const std = Math.sqrt(window.reduce((sum, value) => sum + (value - mid) ** 2, 0) / 20)
    bollingerUpper[index] = mid + 2 * std
    bollingerLower[index] = mid - 2 * std
    bollingerWidthPct[index] = mid === 0 ? null : 100 * (2 * 2 * std) / mid
  }
  const priorVolumeMean20: NullableNumber[] = Array.from({ length: indicatorBars.length }, () => null)
  const rvol20: NullableNumber[] = Array.from({ length: indicatorBars.length }, () => null)
  for (let index = 20; index < indicatorBars.length; index += 1) {
    const priorBars = indicatorBars.slice(index - 20, index)
    const prior = priorBars.map(bar => bar.volume)
    const firstSource = priorBars[0]?.volumeSourceId ?? null
    const firstBasis = priorBars[0]?.volumeBasis ?? null
    const sameVolumeBasis = firstSource !== null && firstBasis !== null && priorBars.every(bar => bar.volumeSourceId === firstSource && bar.volumeBasis === firstBasis)
    if (prior.length === 20 && sameVolumeBasis && prior.every((volume): volume is number => finiteNonNegative(volume))) {
      const mean = prior.reduce((sum, volume) => sum + volume, 0) / 20
      priorVolumeMean20[index] = mean
      const currentVolume = indicatorBars[index]?.volume
      rvol20[index] = mean === 0 || currentVolume === null || currentVolume === undefined || indicatorBars[index]?.volumeSourceId !== firstSource || indicatorBars[index]?.volumeBasis !== firstBasis ? null : currentVolume / mean
    }
  }
  const highLowMean5: NullableNumber[] = Array.from({ length: indicatorBars.length }, () => null)
  const highLowMean20: NullableNumber[] = Array.from({ length: indicatorBars.length }, () => null)
  for (let index = 0; index < indicatorBars.length; index += 1) {
    for (const [period, result] of [[5, highLowMean5], [20, highLowMean20]] as const) {
      if (index < period - 1) continue
      const window = indicatorBars.slice(index - period + 1, index + 1)
      if (window.every(bar => finitePositive(bar.high) && finitePositive(bar.low))) result[index] = window.reduce((sum, bar) => sum + bar.high! - bar.low!, 0) / period
    }
  }
  const weeks = completedWeekBars(indicatorBars, input.sessions ?? [])
  const weekCloses = weeks.map(week => week.close)
  const weekSma30 = smaSeries(weekCloses, 30)
  const pivots = findConfirmedPivots(indicatorBars, rsi14, macd)
  const gaps = findGaps(indicatorBars)
  const lastIndex = indicatorBars.length - 1
  const latest: IndicatorSnapshot = {
    close: indicatorBars[lastIndex]?.close ?? 0,
    ema10: latestValue(ema10),
    ema20: latestValue(ema20),
    sma50: latestValue(sma50),
    sma200: latestValue(sma200),
    sma30Week: latestValue(weekSma30),
    sma10Slope5Pct: slope(ema10, 5, lastIndex),
    ema10Slope5Pct: slope(ema10, 5, lastIndex),
    ema20Slope5Pct: slope(ema20, 5, lastIndex),
    sma50Slope5Pct: slope(sma50, 5, lastIndex),
    sma200Slope20Pct: slope(sma200, 20, lastIndex),
    rsi14: latestValue(rsi14),
    macd: latestValue(macd),
    macdSignal: latestValue(macdSignal),
    macdHistogram: latestValue(macdHistogram),
    atr14: latestValue(atr14),
    atrPct: valid(latestValue(atr14)) && (closes[lastIndex] ?? 0) !== 0 ? 100 * (latestValue(atr14) as number) / (closes[lastIndex] ?? 0) : null,
    plusDi14: latestValue(dmi.plusDi),
    minusDi14: latestValue(dmi.minusDi),
    adx14: latestValue(dmi.adx),
    bollingerMid: latestValue(bollingerMid),
    bollingerUpper: latestValue(bollingerUpper),
    bollingerLower: latestValue(bollingerLower),
    bollingerWidthPct: latestValue(bollingerWidthPct),
    rvol20: latestValue(rvol20),
  }
  return {
    calculatorVersion: RESEARCH_CALCULATOR_VERSION,
    symbol: indicatorBars[0]?.symbol ?? '',
    referenceSession,
    adjustmentMode: mode,
    bars,
    closes,
    indicatorOhlc: indicatorBars,
    ema10,
    ema20,
    sma50,
    sma200,
    ema12,
    ema26,
    rsi14,
    macd,
    macdSignal,
    macdHistogram,
    tr,
    atr14,
    plusDm14: dmi.plusDm,
    minusDm14: dmi.minusDm,
    plusDi14: dmi.plusDi,
    minusDi14: dmi.minusDi,
    dx14: dmi.dx,
    adx14: dmi.adx,
    bollingerMid,
    bollingerUpper,
    bollingerLower,
    bollingerWidthPct,
    priorVolumeMean20,
    rvol20,
    highLowMean5,
    highLowMean20,
    completedWeeks: weeks,
    weekSma30,
    pivots,
    gaps,
    latest,
    warnings: mode === 'split_only' ? ['split_only: cash-dividend adjustment is unavailable.'] : [],
  }
}

function zoneAround(price: number, atr: number | null, close: number): { lower: number; upper: number } | null {
  if (!valid(atr) || !finitePositive(close)) return null
  const buffer = Math.max(atr * 0.25, close * 0.005)
  return { lower: price - buffer, upper: price + buffer }
}

export function deriveStructuralLevels(metrics: ResearchMetrics, maxPerSide = 3): readonly StructuralLevel[] {
  const close = metrics.latest.close
  const anchors: StructuralAnchor[] = []
  for (const pivot of metrics.pivots) {
    const range = zoneAround(pivot.price, metrics.latest.atr14, close)
    if (!range) continue
    anchors.push({ anchorId: `pivot-${pivot.type}-${pivot.date}`, type: pivot.type === 'high' ? 'pivot_high' : 'pivot_low', date: pivot.date, ...range, center: pivot.price, basis: 'indicator_ohlc', metricPath: `pivots.${pivot.type}.${pivot.date}`, confirmed: pivot.confirmedOn <= metrics.referenceSession })
  }
  for (const gap of metrics.gaps.filter(gap => gap.status !== 'filled')) {
    anchors.push({ anchorId: `gap-${gap.type}-${gap.date}`, type: 'gap', date: gap.date, lower: gap.lower, upper: gap.upper, center: (gap.lower + gap.upper) / 2, basis: 'indicator_ohlc', metricPath: `gaps.${gap.date}`, confirmed: true })
  }
  const movingAverages: Array<[string, number | null]> = [['ema10', metrics.latest.ema10], ['ema20', metrics.latest.ema20], ['sma50', metrics.latest.sma50], ['sma200', metrics.latest.sma200]]
  for (const [name, value] of movingAverages) {
    if (!valid(value)) continue
    const range = zoneAround(value, metrics.latest.atr14, close)
    if (!range) continue
    anchors.push({ anchorId: `ma-${name}-${metrics.referenceSession}`, type: 'moving_average', date: metrics.referenceSession, ...range, center: value, basis: 'indicator_close', metricPath: `latest.${name}`, confirmed: true })
  }
  const sides: Array<['support' | 'resistance', StructuralAnchor[]]> = [
    ['support', anchors.filter(anchor => anchor.center <= close).sort((a, b) => b.center - a.center)],
    ['resistance', anchors.filter(anchor => anchor.center > close).sort((a, b) => a.center - b.center)],
  ]
  const output: StructuralLevel[] = []
  for (const [side, sideAnchors] of sides) {
    const selected: StructuralAnchor[] = []
    for (const anchor of sideAnchors) {
      if (selected.length >= maxPerSide * 2) break
      selected.push(anchor)
    }
    for (let index = 0; index < selected.length; index += 1) {
      const first = selected[index]
      if (!first) continue
      const second = selected[index + 1]
      let merged = first
      if (second && Math.abs(first.center - second.center) <= (metrics.latest.atr14 ?? 0) * 0.5) {
        const lower = Math.min(first.lower, second.lower)
        const upper = Math.max(first.upper, second.upper)
        if (valid(metrics.latest.atr14) && upper - lower <= metrics.latest.atr14 * 1.5) {
          merged = { ...first, lower, upper, center: (lower + upper) / 2, anchorId: `${first.anchorId}+${second.anchorId}`, metricPath: `${first.metricPath},${second.metricPath}` }
          index += 1
        }
      }
      output.push({
        zoneId: `${side}-${output.filter(level => level.side === side).length + 1}`,
        side,
        lower: merged.lower,
        upper: merged.upper,
        center: merged.center,
        anchors: merged.anchorId.split('+'),
        basis: merged.basis,
        confirmedAsOf: metrics.referenceSession,
        impact: side === 'support' ? 'A close below the lower edge weakens the support thesis.' : 'A close above the upper edge confirms only with the method volume and close rules.',
      })
      if (output.filter(level => level.side === side).length >= maxPerSide) break
    }
  }
  return output
}

export function calculateRewardRisk(
  entry: { lower: number; upper: number },
  stop: { lower: number; upper: number },
  target: { lower: number; upper: number },
): RewardRiskResult {
  const validZones = [entry, stop, target].every(zone => finitePositive(zone.lower) && finitePositive(zone.upper) && zone.lower <= zone.upper)
  const ordered = validZones && stop.upper < entry.lower && entry.upper < target.lower
  if (!ordered) return { valid: false, reason: 'Long zones must satisfy stop < entry < target.', entryMid: null, stopMid: null, targetMid: null, riskMid: null, rewardMid: null, mid: null, conservative: null }
  const entryMid = (entry.lower + entry.upper) / 2
  const stopMid = (stop.lower + stop.upper) / 2
  const targetMid = (target.lower + target.upper) / 2
  const riskMid = entryMid - stopMid
  const rewardMid = targetMid - entryMid
  const mid = riskMid > 0 ? rewardMid / riskMid : null
  const conservativeRisk = entry.upper - stop.lower
  const conservativeReward = target.lower - entry.upper
  const conservative = conservativeRisk > 0 ? conservativeReward / conservativeRisk : null
  return { valid: mid !== null && conservative !== null, reason: mid !== null && conservative !== null ? null : 'Entry and stop zones do not produce positive risk.', entryMid, stopMid, targetMid, riskMid, rewardMid, mid, conservative }
}

export const calculateLongRewardRisk = calculateRewardRisk

function planZone(level: StructuralLevel): ResearchPlanZone {
  return { zoneId: level.zoneId, lower: level.lower, upper: level.upper, anchors: [...level.anchors], basis: level.basis }
}

function candidateUnavailable(setupType: ResearchTradePlanCandidate['setupType'], reason: string, availableZoneIds: readonly string[], validUntilSession: string | null): ResearchTradePlanCandidate {
  return {
    planId: setupType, setupType, status: 'N_A', trigger: null, triggerPrice: null, confirmation: null,
    entry: null, structuralStop: null, target1: null, target2: null,
    midRewardRisk: { target1: null, target2: null }, conservativeRewardRisk: { target1: null, target2: null },
    eventStatus: 'UNVERIFIED', invalidation: null, validUntilSession, positionSize: null, selectedZoneIds: [],
    requiresHumanReview: true, reason, availableZoneIds,
  }
}

function deriveOneTradePlan(
  setupType: ResearchTradePlanCandidate['setupType'],
  levels: readonly StructuralLevel[],
  context: ResearchTradePlanContext,
  validUntilSession: string | null,
): ResearchTradePlanCandidate {
  const supports = levels.filter(level => level.side === 'support').sort((a, b) => b.center - a.center)
  const resistances = levels.filter(level => level.side === 'resistance').sort((a, b) => a.lower - b.lower)
  const eligiblePullbackSupports = supports.filter(level => level.anchors.some(anchor => anchor.startsWith('gap-') || anchor.startsWith('pivot-low-')))
  const entry = setupType === 'breakout'
    ? resistances[0]
    : eligiblePullbackSupports.find(level => context.currentClose !== null && level.center < context.currentClose)
  const availableZoneIds = [...supports, ...resistances].map(level => level.zoneId)
  if (!entry) return candidateUnavailable(setupType, setupType === 'breakout' ? 'No resistance zone is available for a conditional breakout retest.' : 'No eligible gap or confirmed-pivot support zone is below the reference close.', availableZoneIds, validUntilSession)
  if (setupType === 'breakout' && !finitePositive(context.atr14)) return candidateUnavailable(setupType, 'ATR(14) is unavailable, so the required 0.10 ATR breakout buffer cannot be calculated.', availableZoneIds, validUntilSession)

  const stop = supports.find(level => level.upper < entry.lower)
  if (!stop) return candidateUnavailable(setupType, 'No real support zone lies strictly below the selected entry zone.', availableZoneIds, validUntilSession)
  const targets = resistances.filter(level => level.zoneId !== entry.zoneId && level.center > entry.center)
  const target1Level = targets[0]
  if (!target1Level) return candidateUnavailable(setupType, 'No real resistance zone lies above the selected entry zone for target 1.', availableZoneIds, validUntilSession)
  const target2Level = targets[1] ?? null
  const entryZone = planZone(entry)
  const stopZone = planZone(stop)
  const target1 = planZone(target1Level)
  const target1Rr = calculateRewardRisk(entryZone, stopZone, target1)
  if (!target1Rr.valid) return candidateUnavailable(setupType, target1Rr.reason ?? 'Selected entry, stop and first target do not form ordered long zones.', availableZoneIds, validUntilSession)
  const target2Ordered = target2Level !== null && target2Level.lower > target1Level.upper
  const target2Candidate = target2Ordered && target2Level ? planZone(target2Level) : null
  const target2Rr = target2Candidate ? calculateRewardRisk(entryZone, stopZone, target2Candidate) : null
  const target2 = target2Rr?.valid ? target2Candidate : null
  const triggerPrice = setupType === 'breakout' ? entry.upper + context.atr14! * 0.1 : entry.upper
  const trigger = setupType === 'breakout'
    ? `Wait for a completed regular-session close above ${entry.zoneId} plus 0.10 ATR(14). The calculated threshold is ${triggerPrice}. This candidate assumes a later retest of the resistance zone; it is not an entry order.`
    : `Wait for price to test ${entry.zoneId}, then require a completed regular-session close back above the support zone's upper edge (${entry.upper}). This candidate is not a confirmed entry.`
  const confirmation = setupType === 'breakout'
    ? 'At the breakout close require RVOL20 >= 1.3 and the close in the upper half of that session range; then review a retest, event risk, benchmark confirmation and execution policy.'
    : 'Require the completed close to reclaim the support-zone upper edge; review contraction, event risk, benchmark confirmation and execution policy.'
  const reason = target2
    ? 'Deterministic zones produce both target reward/risk pairs. This remains WATCH because retest/confirmation, event status, benchmark context and execution policy require human review.'
    : target2Level
      ? 'The next resistance zone cannot be ordered beyond target 1; target 2 remains N/A and farther targets are not substituted.'
      : 'The first real target is available, but no second real resistance zone is available; target 2 remains N/A. This remains WATCH pending human review.'
  return {
    planId: setupType,
    setupType,
    status: 'WATCH',
    trigger,
    triggerPrice,
    confirmation,
    entry: entryZone,
    structuralStop: { ...stopZone, rule: 'next_lower_support_zone', stopPrice: null },
    target1,
    target2,
    midRewardRisk: { target1: target1Rr.mid, target2: target2Rr?.valid ? target2Rr.mid : null },
    conservativeRewardRisk: { target1: target1Rr.conservative, target2: target2Rr?.valid ? target2Rr.conservative : null },
    eventStatus: 'UNVERIFIED',
    invalidation: `A completed close below ${stop.zoneId} weakens the structural thesis. An execution stop price is not set until execution policy is reviewed.`,
    validUntilSession,
    positionSize: null,
    selectedZoneIds: [entry.zoneId, stop.zoneId, target1.zoneId, ...(target2 ? [target2.zoneId] : [])],
    availableZoneIds,
    requiresHumanReview: true,
    reason,
  }
}

/** Derive conditional WATCH candidates only from existing, confirmed structural zones. */
export function deriveTradePlanCandidates(levels: readonly StructuralLevel[], context?: ResearchTradePlanContext): readonly ResearchTradePlanCandidate[] {
  if (!context || !isIsoDate(context.referenceSession) || !finitePositive(context.currentClose)) {
    return [
      candidateUnavailable('breakout', 'Reference close, ATR(14), or session context is unavailable.', levels.filter(level => level.side === 'resistance').map(level => level.zoneId), null),
      candidateUnavailable('pullback', 'Reference close or session context is unavailable.', levels.filter(level => level.side === 'support').map(level => level.zoneId), null),
    ]
  }
  const validUntilSession = context.validUntilSession && isIsoDate(context.validUntilSession) && context.validUntilSession > context.referenceSession ? context.validUntilSession : null
  return [deriveOneTradePlan('breakout', levels, context, validUntilSession), deriveOneTradePlan('pullback', levels, context, validUntilSession)]
}

function scoreLabel(score: number | null): DirectionScore['label'] {
  if (score === null) return 'N/A'
  if (score >= 80) return 'strong_bullish'
  if (score >= 65) return 'bullish'
  if (score >= 50) return 'neutral'
  if (score >= 35) return 'bearish'
  return 'strong_bearish'
}

export function calculateDirectionScore(metrics: ResearchMetrics, relativeStrength: readonly RelativeReturnWindow[] = [], options: DirectionScoreOptions = {}): DirectionScore {
  const latest = metrics.latest
  const evidence: Record<string, boolean | null> = {}
  const missing: string[] = []
  const add = (key: string, value: boolean | null) => {
    evidence[key] = value
    if (value === null) missing.push(key)
  }
  add('closeAboveSma200', valid(latest.sma200) ? latest.close > latest.sma200 : null)
  add('sma200SlopePositive', valid(latest.sma200Slope20Pct) ? latest.sma200Slope20Pct > 0 : null)
  const weekCloseAboveSma30 = valid(latest.sma30Week) && metrics.completedWeeks.length > 0 ? metrics.completedWeeks.at(-1)!.close > latest.sma30Week : null
  const weekSlopePct = metrics.weekSma30.length >= 5 ? percentChange(metrics.weekSma30.at(-1) ?? null, metrics.weekSma30.at(-5) ?? null) : null
  const weekSlopePositive = weekSlopePct === null ? null : weekSlopePct > 0
  add('weekCloseAboveSma30', weekCloseAboveSma30)
  add('weekSlopePositive', weekSlopePositive)
  add('weeklyTrendConfirmed', weekCloseAboveSma30 === null || weekSlopePositive === null ? null : weekCloseAboveSma30 && weekSlopePositive)
  add('closeAboveSma50', valid(latest.sma50) ? latest.close > latest.sma50 : null)
  add('sma50SlopePositive', valid(latest.sma50Slope5Pct) ? latest.sma50Slope5Pct > 0.1 : null)
  add('emaStack', valid(latest.ema10) && valid(latest.ema20) && valid(latest.sma50) ? latest.ema10 > latest.ema20 && latest.ema20 > latest.sma50 : null)
  add('rsiAtLeast50', valid(latest.rsi14) ? latest.rsi14 >= 50 : null)
  add('macdAboveSignal', valid(latest.macd) && valid(latest.macdSignal) ? latest.macd > latest.macdSignal : null)
  add('plusDiAboveMinusDi', valid(latest.plusDi14) && valid(latest.minusDi14) ? latest.plusDi14 > latest.minusDi14 : null)
  const windows = relativeStrength ?? []
  const relativeBenchmarks = options.relativeBenchmarks === undefined && metrics.symbol === 'SOXX'
    ? ['SPY', 'QQQ', 'SMH']
    : options.relativeBenchmarks?.length === 3
      ? [...options.relativeBenchmarks]
      : ['configuredBenchmark1', 'configuredBenchmark2', 'configuredBenchmark3']
  for (const benchmark of relativeBenchmarks) {
    if (metrics.symbol === benchmark) {
      add(`20dOutperforms${benchmark}`, null)
      continue
    }
    const window = windows.find(item => item.window === '20_session' && item.benchmark === benchmark && item.benchmarkReturnPct !== null && item.outperformancePp !== null && item.endDate !== null && item.startDate !== null)
    add(`20dOutperforms${benchmark}`, window?.outperformancePp === null || window === undefined ? null : window.outperformancePp > 0)
  }
  const threeMonthBenchmark = options.threeMonthBenchmark ?? (metrics.symbol === 'SOXX' ? 'SPY' : null)
  const threeMonth = threeMonthBenchmark ? windows.find(item => item.window === '3_calendar_month' && item.benchmark === threeMonthBenchmark) : undefined
  add(`3mOutperforms${threeMonthBenchmark ?? 'configuredBenchmark'}`, threeMonth?.outperformancePp === null || threeMonth === undefined ? null : threeMonth.outperformancePp > 0)
  const highs = metrics.pivots.filter(pivot => pivot.type === 'high').slice(-2)
  const lows = metrics.pivots.filter(pivot => pivot.type === 'low').slice(-2)
  add('higherHighs', highs.length === 2 && valid(latest.atr14) ? highs[1]!.price - highs[0]!.price >= 0.25 * latest.atr14 : null)
  add('higherLows', lows.length === 2 && valid(latest.atr14) ? lows[1]!.price - lows[0]!.price >= 0.25 * latest.atr14 : null)
  add('adxCapVerified', latest.adx14 === null ? null : true)
  if (missing.length > 0) return { rawScore: null, caps: [], finalScore: null, label: 'N/A', evidence, missing }
  const weights: Array<[string, number]> = [
    ['closeAboveSma200', 10], ['sma200SlopePositive', 10], ['weeklyTrendConfirmed', 10],
    ['closeAboveSma50', 10], ['sma50SlopePositive', 10], ['emaStack', 5],
    ['rsiAtLeast50', 5], ['macdAboveSignal', 5], ['plusDiAboveMinusDi', 5],
    ...relativeBenchmarks.map(benchmark => [`20dOutperforms${benchmark}`, 5] as [string, number]),
    [`3mOutperforms${threeMonthBenchmark ?? 'configuredBenchmark'}`, 5], ['higherHighs', 5], ['higherLows', 5],
  ]
  const rawScore = weights.reduce((sum, [key, weight]) => sum + (evidence[key] === true ? weight : 0), 0)
  const caps: string[] = []
  let finalScore = rawScore
  if (latest.adx14 !== null && latest.adx14 < 20) {
    finalScore = Math.min(finalScore, 79)
    caps.push('adx_below_20')
  }
  if (latest.sma200 !== null && latest.sma200Slope20Pct !== null && latest.close < latest.sma200 && latest.sma200Slope20Pct < 0) {
    finalScore = Math.min(finalScore, 49)
    caps.push('below_declining_sma200')
  }
  return { rawScore, caps, finalScore, label: scoreLabel(finalScore), evidence, missing }
}

export const calculateRsi14 = (closes: readonly number[]) => {
  const values = rmaSeries(closes.map((close, index) => index === 0 ? null : Math.max(close - (closes[index - 1] ?? close), 0)), 14)
  const losses = rmaSeries(closes.map((close, index) => index === 0 ? null : Math.max((closes[index - 1] ?? close) - close, 0)), 14)
  return values.map((gain, index) => {
    const loss = losses[index] ?? null
    if (!valid(gain) || !valid(loss)) return null
    if (loss === 0 && gain > 0) return 100
    if (gain === 0 && loss > 0) return 0
    if (gain === 0 && loss === 0) return 50
    return 100 - 100 / (1 + gain / loss)
  })
}

export const calculateSmaSeries = smaSeries
export const calculateEmaSeries = emaSeries
export const calculateRmaSeries = rmaSeries

export function calculateRelativeStrength(
  targetBars: readonly ResearchBar[],
  benchmarkBars: readonly ResearchBar[],
  benchmark = 'benchmark',
  referenceSession?: string,
): RelativeReturnWindow[] {
  const target = new Map(targetBars.map(bar => [bar.date, bar.close]))
  const benchmarkByDate = new Map(benchmarkBars.map(bar => [bar.date, bar.close]))
  const dates = [...target.keys()].sort()
  const endDate = referenceSession ?? dates.at(-1) ?? null
  if (!endDate || !target.has(endDate)) return (['5_session', '20_session', '3_calendar_month'] as const).map(window => ({ window, benchmark, startDate: null, endDate, targetReturnPct: null, benchmarkReturnPct: null, outperformancePp: null, relativeRatioReturnPct: null }))
  const endIndex = dates.indexOf(endDate)
  const build = (window: RelativeReturnWindow['window'], startDate: string | null): RelativeReturnWindow => {
    if (!startDate || !target.has(startDate) || !benchmarkByDate.has(startDate) || !benchmarkByDate.has(endDate)) return { window, startDate, endDate, targetReturnPct: null, benchmarkReturnPct: null, outperformancePp: null, relativeRatioReturnPct: null }
    const targetReturnPct = percentChange(target.get(endDate) ?? null, target.get(startDate) ?? null)
    const benchmarkReturnPct = percentChange(benchmarkByDate.get(endDate) ?? null, benchmarkByDate.get(startDate) ?? null)
    return { window, startDate, endDate, targetReturnPct, benchmarkReturnPct, outperformancePp: targetReturnPct !== null && benchmarkReturnPct !== null ? targetReturnPct - benchmarkReturnPct : null, relativeRatioReturnPct: targetReturnPct !== null && benchmarkReturnPct !== null && benchmarkByDate.get(startDate) && target.get(startDate) ? 100 * (((target.get(endDate)! / target.get(startDate)!) / (benchmarkByDate.get(endDate)! / benchmarkByDate.get(startDate)!)) - 1) : null }
  }
  const threeMonthDate = subtractCalendarMonths(endDate, 3)
  const threeMonthStart = dates.filter(date => date <= threeMonthDate).at(-1) ?? null
  return [
    build('5_session', dates[endIndex - 5] ?? null),
    build('20_session', dates[endIndex - 20] ?? null),
    build('3_calendar_month', threeMonthStart),
  ].map(window => ({ ...window, benchmark }))
}
