// Shared ticket61 performance fixture. Executed inside the frozen legacy
// snapshot (copied next to performance-legacy.fixture.ts by
// scripts/parity/performance-run-legacy.sh) and by
// scripts/parity/performance-run-rebuilt.ts, so it must stay dependency-free:
// only node built-ins, and only globals available in both runtimes.
import os from 'node:os'

export const WARMUPS = 5
export const SAMPLES = 30

export const WORKLOAD_NAMES = ['diary-read', 'diary-search', 'ledger-holdings', 'rotation-history'] as const
export type WorkloadName = (typeof WORKLOAD_NAMES)[number]

export const FIXTURE = {
  userEmail: 'performance-fixture@example.invalid',
  userPassword: 'Synthetic-performance-123!',
  diaryCount: 1000,
  searchTerm: 'zephyr',
  searchTotal: 100,
  pageSize: 20,
  longDiaryTitle: 'Performance long-form diary',
  longDiaryChars: 50_000,
  // Fixed anchor date so both runtimes seed identical civil dates; never "today".
  latestCivilDate: '2026-09-05',
  rotationScope: 'core',
  rotationDates: 250,
  comparisonOffset: 10,
  quantityPerTrade: 10,
} as const

const SYMBOL_LIST = [
  'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'TLT', 'GLD', 'EEM', 'XLF', 'XLE',
  'XLK', 'SMH', 'ARKK', 'SOXL', 'TQQQ', 'SQQQ', 'VXX', 'UUP', 'DIA', 'MDY',
]
export const SYMBOLS: readonly string[] = SYMBOL_LIST

// Prices stay multiples of 0.25 so quantity/avgCost/totalCost are exact in
// binary floating point and both runtimes can be compared with equality.
export function symbolPrice(index: number): number {
  return 10 + (index % SYMBOL_LIST.length) * 1.25
}

export function symbolForIndex(index: number): string {
  return SYMBOL_LIST[index % SYMBOL_LIST.length]!
}

/** Civil date `days` before the fixture anchor date, as YYYY-MM-DD. */
export function civilDaysBefore(days: number): string {
  return new Date(Date.UTC(2026, 8, 5) - days * 86_400_000).toISOString().slice(0, 10)
}

export function diaryDate(index: number): string {
  return civilDaysBefore(index)
}

export function diaryTitle(index: number): string {
  return `Performance diary ${index}`
}

const DIARY_FILLER = 'Filler review narrative for bulk volume. '

/**
 * Every 10th diary carries the case-varied marker ZEPHYR so the searched term
 * matches exactly 100 rows via case-insensitive title OR content contains.
 */
export function diaryContent(index: number): string {
  const checkpoint = index % 10 === 0 ? 'ZEPHYR rotation checkpoint alpha.' : 'Regular rotation checkpoint alpha.'
  return `Performance fixture diary entry ${index}. ${checkpoint} ${DIARY_FILLER.repeat(5)}`
}

const LONG_SENTENCE = 'Performance long-form diary fixture sentence.'.padEnd(50, '.')
export const LONG_DIARY_CONTENT = LONG_SENTENCE.repeat(1000)
if (LONG_DIARY_CONTENT.length !== FIXTURE.longDiaryChars) {
  throw new Error(`Long diary fixture built with ${LONG_DIARY_CONTENT.length} chars, expected ${FIXTURE.longDiaryChars}`)
}

export interface CoreUniverseEntry {
  symbol: string
  name: string
  groupType: 'core_etf' | 'mega_cap' | 'single_stock'
  sectorName: string | null
}

/**
 * Frozen source core universe (source lib/market-rotation/universe.ts →
 * getCoreUniverse(), 13 core_etf + 10 mega_cap/single_stock = 23 symbols).
 * Embedded here because this module must stay dependency-free in both
 * runtimes; keep in sync with the source universe.
 */
export const CORE_UNIVERSE: readonly CoreUniverseEntry[] = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', groupType: 'core_etf', sectorName: 'Broad Market' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', groupType: 'core_etf', sectorName: 'Broad Market' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', groupType: 'core_etf', sectorName: 'Broad Market' },
  { symbol: 'QQQM', name: 'Invesco NASDAQ 100 ETF', groupType: 'core_etf', sectorName: 'Broad Market' },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', groupType: 'core_etf', sectorName: 'Semiconductor' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', groupType: 'core_etf', sectorName: 'Semiconductor' },
  { symbol: 'XLK', name: 'Technology Select Sector ETF', groupType: 'core_etf', sectorName: 'Technology' },
  { symbol: 'IGV', name: 'iShares Expanded Tech-Software ETF', groupType: 'core_etf', sectorName: 'Software' },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector ETF', groupType: 'core_etf', sectorName: 'Consumer Staples' },
  { symbol: 'XLU', name: 'Utilities Select Sector ETF', groupType: 'core_etf', sectorName: 'Utilities' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', groupType: 'core_etf', sectorName: 'Bonds' },
  { symbol: 'BIL', name: 'SPDR Bloomberg 1-3 Month T-Bill ETF', groupType: 'core_etf', sectorName: 'Cash' },
  { symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', groupType: 'core_etf', sectorName: 'Cash' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', groupType: 'mega_cap', sectorName: 'Semiconductor' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', groupType: 'mega_cap', sectorName: 'Software' },
  { symbol: 'AAPL', name: 'Apple Inc.', groupType: 'mega_cap', sectorName: 'Hardware' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', groupType: 'mega_cap', sectorName: 'Internet' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', groupType: 'mega_cap', sectorName: 'Cloud / E-com' },
  { symbol: 'META', name: 'Meta Platforms Inc.', groupType: 'mega_cap', sectorName: 'Internet' },
  { symbol: 'TSLA', name: 'Tesla Inc.', groupType: 'mega_cap', sectorName: 'Auto' },
  { symbol: 'MU', name: 'Micron Technology', groupType: 'single_stock', sectorName: 'Semiconductor' },
  { symbol: 'PLTR', name: 'Palantir Technologies', groupType: 'single_stock', sectorName: 'Software' },
  { symbol: 'CRWV', name: 'CoreWeave Inc.', groupType: 'single_stock', sectorName: 'Cloud' },
]

/** Prices stay on 0.25 steps so stored decimals round-trip exactly. */
export function rotationPrice(index: number): number {
  return 50 + (index % CORE_UNIVERSE.length) * 1.25
}

export interface RotationSnapshotRow {
  date: string
  symbol: string
  groupType: CoreUniverseEntry['groupType']
  sectorName: string | null
  lastPrice: number
  adjustedClose: number
  rsi14: number
  percentFromHigh: number
  rotationScore: number
  rotationScoreDelta2W: number
  rotationRank: number
  rankDelta2W: number
  rsiDelta2W: number
  twoWeekPerformancePct: number
  above20d: boolean
  above50d: boolean
  maStatus: string
  signalStatus: string
}

// Identical metrics on every seeded date; adjustedClose === lastPrice so the
// 2W trend (price / comparison-date price * 100, 4 dp) is exactly 100.
function rotationMetrics(index: number): Omit<RotationSnapshotRow, 'date' | 'symbol' | 'groupType' | 'sectorName'> {
  return {
    lastPrice: rotationPrice(index),
    adjustedClose: rotationPrice(index),
    rsi14: 30 + (index % 40) + 0.5,
    percentFromHigh: -((index % 25) * 0.5 + 0.25),
    rotationScore: (index % 200) + 0.25,
    rotationScoreDelta2W: (index % 10) - 5,
    rotationRank: index + 1,
    rankDelta2W: (index % 3) - 1,
    rsiDelta2W: ((index % 12) - 6) * 0.25,
    twoWeekPerformancePct: ((index % 7) - 3) * 0.5,
    above20d: index % 2 === 0,
    above50d: index % 3 !== 0,
    maStatus: index % 2 === 0 ? 'bullish_stack' : 'healthy_pullback',
    signalStatus: 'complete',
  }
}

/**
 * `rotationDates` snapshot dates × the full source core universe. Every date
 * carries all 23 symbols, so all 250 dates qualify (threshold ceil(23×0.9)=21).
 */
export function rotationSnapshotRows(): RotationSnapshotRow[] {
  const rows: RotationSnapshotRow[] = []
  for (let dateIndex = 0; dateIndex < FIXTURE.rotationDates; dateIndex++) {
    const date = civilDaysBefore(dateIndex)
    for (let symbolIndex = 0; symbolIndex < CORE_UNIVERSE.length; symbolIndex++) {
      const entry = CORE_UNIVERSE[symbolIndex]!
      rows.push({ date, symbol: entry.symbol, groupType: entry.groupType, sectorName: entry.sectorName, ...rotationMetrics(symbolIndex) })
    }
  }
  return rows
}

export type VerifyResult = true | string

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

/** Exact numeric match that rejects nonfinite values (NaN must not pass). */
function numberFieldMatches(value: unknown, expected: number): boolean {
  const numeric = Number(value)
  return Number.isFinite(numeric) && Math.abs(numeric - expected) <= 1e-6
}

/** GET /api/diaries/:id must return the saved 50,000-character Diary. */
export function verifyDiaryRead(body: unknown): VerifyResult {
  const record = asRecord(body)
  if (record.title !== FIXTURE.longDiaryTitle) return `title mismatch: ${String(record.title)}`
  if (typeof record.content !== 'string') return 'content missing'
  if (record.content.length !== FIXTURE.longDiaryChars) return `content length ${record.content.length}, expected ${FIXTURE.longDiaryChars}`
  return true
}

/** GET /api/diaries?search=... must report 100 matches and a bounded page of 20. */
export function verifyDiarySearch(body: unknown): VerifyResult {
  const record = asRecord(body)
  const pagination = asRecord(record.pagination)
  const data = record.data as unknown[]
  if (pagination.total !== FIXTURE.searchTotal) return `matched total ${String(pagination.total)}, expected ${FIXTURE.searchTotal}`
  if (!Array.isArray(data) || data.length !== FIXTURE.pageSize) return `page size ${Array.isArray(data) ? data.length : 'non-array'}, expected ${FIXTURE.pageSize}`
  // Date-desc page 1 of the 100 marker rows: content markers sit at
  // index%10===0 and index order is date order, so the expected rows are
  // indices 0,10,...,190 exactly in that order.
  for (let position = 0; position < FIXTURE.pageSize; position++) {
    const expectedTitle = diaryTitle(position * 10)
    const actualTitle = asRecord(data[position]).title
    if (actualTitle !== expectedTitle) return `row ${position} title ${String(actualTitle)}, expected ${expectedTitle}`
  }
  return true
}

/** GET /api/stocks/holdings must replay 1,000 trades into 20 exact positions. */
export function verifyHoldings(body: unknown): VerifyResult {
  if (!Array.isArray(body)) return 'holdings response is not an array'
  if (body.length !== SYMBOL_LIST.length) return `holdings count ${body.length}, expected ${SYMBOL_LIST.length}`
  const bySymbol = new Map<string, Record<string, unknown>>()
  for (const row of body) {
    const record = asRecord(row)
    bySymbol.set(String(record.symbol), record)
  }
  for (let index = 0; index < SYMBOL_LIST.length; index++) {
    const record = bySymbol.get(SYMBOL_LIST[index]!)
    if (!record) return `missing holding ${SYMBOL_LIST[index]}`
    const price = symbolPrice(index)
    const trades = FIXTURE.diaryCount / SYMBOL_LIST.length
    const expectedQuantity = trades * FIXTURE.quantityPerTrade
    if (!numberFieldMatches(record.quantity, expectedQuantity)) return `${SYMBOL_LIST[index]} quantity ${String(record.quantity)}, expected ${expectedQuantity}`
    if (!numberFieldMatches(record.avgCost, price)) return `${SYMBOL_LIST[index]} avgCost ${String(record.avgCost)}, expected ${price}`
    if (!numberFieldMatches(record.totalCost, expectedQuantity * price)) return `${SYMBOL_LIST[index]} totalCost ${String(record.totalCost)}, expected ${expectedQuantity * price}`
  }
  return true
}

/**
 * GET /api/market/rotation-monitor?scope=core must return the seeded core
 * window: latest + comparison date per ADR-0004 (10 qualified dates back),
 * all 23 core rows with exact seeded values, and an 11-point 2W trend of
 * exactly 100 per row (constant prices normalize to the base).
 */
export function verifyRotationMonitor(body: unknown): VerifyResult {
  const record = asRecord(body)
  const latestDate = civilDaysBefore(0)
  const comparisonDate = civilDaysBefore(FIXTURE.comparisonOffset)
  if (record.asOfDate !== latestDate) return `asOfDate ${String(record.asOfDate)}, expected ${latestDate}`
  if (record.comparisonDate !== comparisonDate) return `comparisonDate ${String(record.comparisonDate)}, expected ${comparisonDate}`
  if (record.rankScope !== FIXTURE.rotationScope) return `rankScope ${String(record.rankScope)}, expected ${FIXTURE.rotationScope}`
  if (record.marketState !== 'unknown') return `marketState ${String(record.marketState)}, expected unknown (no breadth rows seeded)`
  const rows = record.rows
  if (!Array.isArray(rows)) return 'rows is not an array'
  if (rows.length !== CORE_UNIVERSE.length) return `rows count ${rows.length}, expected ${CORE_UNIVERSE.length}`
  const bySymbol = new Map<string, Record<string, unknown>>()
  for (const row of rows) bySymbol.set(String(asRecord(row).symbol), asRecord(row))
  const trendDates = Array.from({ length: FIXTURE.comparisonOffset + 1 }, (_, index) => civilDaysBefore(FIXTURE.comparisonOffset - index))
  for (let index = 0; index < CORE_UNIVERSE.length; index++) {
    const entry = CORE_UNIVERSE[index]!
    const row = bySymbol.get(entry.symbol)
    if (!row) return `missing core row ${entry.symbol}`
    const expected = rotationMetrics(index)
    if (row.name !== entry.name) return `${entry.symbol} name mismatch`
    if (row.groupType !== entry.groupType) return `${entry.symbol} groupType ${String(row.groupType)}, expected ${entry.groupType}`
    if (row.sectorName !== entry.sectorName) return `${entry.symbol} sectorName mismatch`
    for (const field of ['lastPrice', 'rsi14', 'percentFromHigh', 'rotationScore', 'rotationScoreDelta2W', 'rotationRank', 'rankDelta2W', 'rsiDelta2W', 'twoWeekPerformancePct'] as const) {
      if (!numberFieldMatches(row[field], expected[field])) return `${entry.symbol} ${field} ${String(row[field])}, expected ${expected[field]}`
    }
    if (row.above20d !== expected.above20d) return `${entry.symbol} above20d mismatch`
    if (row.above50d !== expected.above50d) return `${entry.symbol} above50d mismatch`
    if (row.maStatus !== expected.maStatus) return `${entry.symbol} maStatus ${String(row.maStatus)}, expected ${expected.maStatus}`
    if (row.signal !== null) return `${entry.symbol} signal ${String(row.signal)}, expected null`
    if (row.signalStatus !== expected.signalStatus) return `${entry.symbol} signalStatus ${String(row.signalStatus)}`
    const trend = row.twoWeekTrend
    if (!Array.isArray(trend)) return `${entry.symbol} twoWeekTrend is not an array`
    if (trend.length !== trendDates.length) return `${entry.symbol} trend points ${trend.length}, expected ${trendDates.length}`
    for (let point = 0; point < trendDates.length; point++) {
      const value = asRecord(trend[point])
      if (value.date !== trendDates[point]) return `${entry.symbol} trend[${point}] date ${String(value.date)}, expected ${trendDates[point]}`
      if (value.value !== 100) return `${entry.symbol} trend[${point}] value ${String(value.value)}, expected 100`
    }
  }
  return true
}

export interface WorkloadResult {
  name: WorkloadName
  url: string
  warmups: number
  samples: number
  sequential: true
  timingsMs: number[]
  medianMs: number
  p95Ms: number
  minMs: number
  maxMs: number
  verified: boolean
  failures: string[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function summarizeTimings(timingsMs: number[]): { medianMs: number; p95Ms: number; minMs: number; maxMs: number } {
  const sorted = [...timingsMs].sort((left, right) => left - right)
  const middle = sorted.length / 2
  const median = (sorted[middle - 1]! + sorted[middle]!) / 2
  const p95Index = Math.ceil(0.95 * sorted.length) - 1
  return {
    medianMs: round2(median),
    p95Ms: round2(sorted[p95Index]!),
    minMs: round2(sorted[0]!),
    maxMs: round2(sorted[sorted.length - 1]!),
  }
}

export interface WorkloadRequest {
  status: number
  body: unknown
}

/**
 * Runs 5 warmup requests then 30 measured sequential requests. Warmups and
 * samples are both verified; a wrong answer is a failure even when fast.
 */
export async function measureWorkload(
  name: WorkloadName,
  url: string,
  request: (url: string) => Promise<WorkloadRequest>,
  verify: (body: unknown) => VerifyResult,
): Promise<WorkloadResult> {
  const failures: string[] = []
  for (let index = 0; index < WARMUPS; index++) {
    try {
      const { status, body } = await request(url)
      const verdict = status === 200 ? verify(body) : `status ${status}`
      if (verdict !== true) failures.push(`warmup ${index + 1}: ${verdict}`)
    } catch (error) {
      failures.push(`warmup ${index + 1}: ${(error as Error).message}`)
    }
  }
  const timings: number[] = []
  for (let index = 0; index < SAMPLES; index++) {
    const start = performance.now()
    try {
      const { status, body } = await request(url)
      const elapsed = performance.now() - start
      timings.push(round2(elapsed))
      const verdict = status === 200 ? verify(body) : `status ${status}`
      if (verdict !== true) failures.push(`sample ${index + 1}: ${verdict}`)
    } catch (error) {
      timings.push(round2(performance.now() - start))
      failures.push(`sample ${index + 1}: ${(error as Error).message}`)
    }
  }
  return {
    name,
    url,
    warmups: WARMUPS,
    samples: SAMPLES,
    sequential: true,
    timingsMs: timings,
    verified: failures.length === 0,
    failures,
    ...summarizeTimings(timings),
  }
}

/** Machine/runtime description without secrets, shared by both runners. */
export function captureEnvironment(dbVersion: string, appMode: string): Record<string, unknown> {
  const cpu = os.cpus()[0]
  return {
    node: process.version,
    appMode,
    dbVersion,
    machine: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpu?.model ?? 'unknown',
      cpuCount: os.cpus().length,
      memoryTotalBytes: os.totalmem(),
      hostname: os.hostname(),
    },
  }
}

/** Fails loudly when a runner tries to publish evidence with wrong answers. */
export function collectFailures(workloads: readonly WorkloadResult[]): string[] {
  return workloads.flatMap(workload => workload.failures.map(failure => `${workload.name}: ${failure}`))
}
