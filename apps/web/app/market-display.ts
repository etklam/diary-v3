export type MarketDisplayValue = number | string | null | undefined
export type MarketDirection = 'up' | 'down' | 'flat' | 'unknown'

function stringDirection(value: string): MarketDirection {
  const normalized = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(normalized)) return 'unknown'
  const magnitude = normalized.replace(/^[+-]/u, '').replace('.', '')
  if (/^0+$/u.test(magnitude)) return 'flat'
  return normalized.startsWith('-') ? 'down' : 'up'
}

export function marketDirection(value: MarketDisplayValue): MarketDirection {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'unknown'
    return value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  }
  if (typeof value === 'string') return stringDirection(value)
  return 'unknown'
}

export function marketClass(value: MarketDisplayValue): '' | `market-${Exclude<MarketDirection, 'unknown'>}` {
  const direction = marketDirection(value)
  return direction === 'unknown' ? '' : `market-${direction}`
}

/** Format a signed return/change/P&L while retaining exact string decimals from API projections. */
export function formatMarketValue(locale: string, value: MarketDisplayValue, digits = 2): string {
  const direction = marketDirection(value)
  if (direction === 'unknown') return '—'
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (direction === 'flat') return normalized.replace(/^[+-]/u, '')
    return direction === 'up' ? `+${normalized.replace(/^\+/u, '')}` : normalized
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'exceptZero',
  }).format(direction === 'flat' ? Math.abs(value as number) : value as number)
}

export function formatMarketValueWithSuffix(locale: string, value: MarketDisplayValue, suffix: string, digits = 2): string {
  const formatted = formatMarketValue(locale, value, digits)
  return formatted === '—' ? formatted : `${formatted}${suffix}`
}

export function formatNeutralValue(locale: string, value: MarketDisplayValue, digits = 2): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return stringDirection(value) === 'unknown' ? '—' : value.trim()
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)
}

// --- Unsigned figure display -------------------------------------------------
// Prices, costs, quantities and percentages have no shared formatter before
// this, so each call site improvised and the same value read differently on
// every page. These four are the only sanctioned way to render a judged
// unsigned figure; signed values keep going through formatMarketValue.
//
// Formatting walks the decimal digits rather than parsing to a float, so an
// exact API projection string is rounded for display without ever passing
// through a double. DESIGN.md's Data and finance section records the
// conventions these implement.

type Decimal = { negative: boolean; int: string; frac: string }

const decimalPattern = /^([+-]?)(\d*)(?:\.(\d*))?$/u

function decimalOf(value: MarketDisplayValue): Decimal | null {
  if (value === null || value === undefined) return null
  let raw: string
  if (typeof value === 'number') {
    // toFixed goes exponential past 1e21, which no figure here reaches; ten
    // places is past every decimal the API stores, so this does not round.
    if (!Number.isFinite(value) || Math.abs(value) >= 1e21) return null
    raw = value.toFixed(10)
  } else raw = value.trim()
  const match = decimalPattern.exec(raw)
  if (!match) return null
  const [, sign, int = '', frac = ''] = match
  if (!int && !frac) return null
  return { negative: sign === '-', int: int.replace(/^0+(?=\d)/u, '') || '0', frac }
}

/** Round a decimal's fraction to `digits` places, half away from zero, carrying into the integer. */
function roundDecimal({ negative, int, frac }: Decimal, digits: number): Decimal {
  if (frac.length <= digits) return { negative, int, frac: frac.padEnd(digits, '0') }
  const kept = frac.slice(0, digits)
  if (Number(frac[digits]) < 5) return { negative, int, frac: kept }
  const carried = (BigInt(int + kept) + 1n).toString().padStart(digits + 1, '0')
  return {
    negative,
    int: digits === 0 ? carried : carried.slice(0, carried.length - digits),
    frac: digits === 0 ? '' : carried.slice(carried.length - digits),
  }
}

const separatorCache = new Map<string, string>()

/** The locale's decimal separator, discovered from Intl so we never hard-code one. */
function decimalSeparator(locale: string): string {
  let separator = separatorCache.get(locale)
  if (separator === undefined) {
    separator = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.'
    separatorCache.set(locale, separator)
  }
  return separator
}

/** Group the integer digits through Intl on a BigInt, so grouping is locale-correct and exact. */
function groupInteger(locale: string, digits: string): string {
  return new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(BigInt(digits))
}

type Rendered = { text: string; zero: boolean }

/**
 * Round to `max` decimals, then drop trailing zeros but never below `min`.
 * The two bounds are what let one amount convention serve both a quoted price
 * and a derived unit cost: `182.4` pads to `182.40`, while an average cost of
 * `10.925` keeps its third decimal so `quantity × cost` still equals the cost
 * basis printed beside it.
 */
function renderDecimal(locale: string, value: MarketDisplayValue, max: number, min: number): Rendered | null {
  const parsed = decimalOf(value)
  if (!parsed) return null
  const rounded = roundDecimal(parsed, max)
  const frac = rounded.frac.replace(/0+$/u, '').padEnd(min, '0')
  const zero = /^0*$/u.test(rounded.int) && /^0*$/u.test(rounded.frac)
  // Intl emits U+002D for negatives, so formatMarketValue ships a hyphen-minus;
  // match it here rather than introducing a second minus glyph. DESIGN.md asks
  // for U+2212 and neither path delivers it — recorded in ticket 101, not fixed
  // here, because changing it belongs in one pass over both formatters.
  const sign = rounded.negative && !zero ? '-' : ''
  return { text: sign + groupInteger(locale, rounded.int) + (frac ? decimalSeparator(locale) + frac : ''), zero }
}

/**
 * How many decimals an amount may keep. Two decimals always, and up to four more
 * *only* for a decimal string.
 *
 * The type is the signal, and it is not incidental: the API returns stored decimals
 * as strings (`"10.925"`) and the Web app computes derived values as JS numbers
 * (`price * quantity`). So a string carries precision somebody committed to — an
 * average cost of `10.925` must stay exact or `quantity × cost` stops equalling the
 * cost basis printed next to it — while a number's tail is an artifact of float
 * arithmetic, and `123,456,850,743.8265` tells the reader nothing that
 * `123,456,850,743.83` does not.
 */
function amountDigits(value: MarketDisplayValue): number {
  return typeof value === 'string' ? 4 : 2
}

/**
 * Prices, costs and money totals: at least two decimals, grouped, locale-aware.
 * One convention for every amount, so a price and the cost basis built from it agree.
 */
export function formatAmount(locale: string, value: MarketDisplayValue): string {
  return renderDecimal(locale, value, amountDigits(value), 2)?.text ?? '—'
}

/**
 * A signed amount — a delta, a difference against a plan. Padded and grouped like
 * any other amount, which is what separates it from `formatMarketValue`: that one
 * preserves an API string verbatim, so a string-sourced delta comes out unpadded.
 */
export function formatSignedAmount(locale: string, value: MarketDisplayValue): string {
  const rendered = renderDecimal(locale, value, amountDigits(value), 2)
  if (rendered === null) return '—'
  return `${rendered.zero || rendered.text.startsWith('-') ? '' : '+'}${rendered.text}`
}

/** Quantities: up to four decimals — what the editor accepts — with padded zeros trimmed. */
export function formatQuantity(locale: string, value: MarketDisplayValue): string {
  return renderDecimal(locale, value, 4, 0)?.text ?? '—'
}

/** A whole count — holdings, filings, jobs. Grouped, never given decimals it does not have. */
export function formatCount(locale: string, value: MarketDisplayValue): string {
  return renderDecimal(locale, value, 0, 0)?.text ?? '—'
}

/**
 * A magnitude too large to read digit by digit — assets under management, market cap.
 * The one sanctioned place a figure is abbreviated instead of grouped, because
 * `$1,284,003,117.00` costs the reader more than `$1.3B` tells them.
 */
export function formatCompactUsd(locale: string, value: MarketDisplayValue): string {
  if (value === null || value === undefined) return '—'
  const magnitude = Number(value)
  if (!Number.isFinite(magnitude)) return '—'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(magnitude)
}

/** Percentages: never more than two decimals, and the `%` sign is part of the figure. */
export function formatPercent(locale: string, value: MarketDisplayValue): string {
  const rendered = renderDecimal(locale, value, 2, 2)
  return rendered === null ? '—' : `${rendered.text}%`
}

/** A signed percentage — return, change, drift — carrying an explicit `+` per the market palette. */
export function formatSignedPercent(locale: string, value: MarketDisplayValue): string {
  const rendered = renderDecimal(locale, value, 2, 2)
  if (rendered === null) return '—'
  const sign = rendered.zero || rendered.text.startsWith('-') ? '' : '+'
  return `${sign}${rendered.text}%`
}

// --- Instant display ---------------------------------------------------------
// One format per role. A date-only value, a date-and-time value in a named
// zone, and a date-and-time value in UTC for market data that has no user
// timezone. The same role renders identically on every page.

const UNKNOWN_INSTANT = '—'

/**
 * A calendar day with no time component — diary dates, trade dates, filing dates.
 * Rendered as the ISO day in every locale: this is a dated record, ISO days align
 * in a column under tabular figures, and they carry no language. Most of the app
 * already prints `diary.date` raw, so this is the convention made explicit.
 */
export function formatDay(value: string | null | undefined): string {
  if (!value) return UNKNOWN_INSTANT
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return UNKNOWN_INSTANT
  return date.toISOString().slice(0, 10)
}

/** An instant the reader should see in a specific zone — review due times, trade times. */
export function formatInstantIn(locale: string, value: string | null | undefined, timeZone: string): string {
  if (!value) return UNKNOWN_INSTANT
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return UNKNOWN_INSTANT
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date)
}

/** The device's IANA zone, which is what trade times and locally-set reminders are stated in. */
export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

/** An instant in the reader's own device zone. */
export function formatInstantLocal(locale: string, value: string | null | undefined): string {
  return formatInstantIn(locale, value, deviceTimeZone())
}

/** A market instant, which belongs to the exchange rather than the reader, so it names UTC. */
export function formatInstantUtc(locale: string, value: string | null | undefined): string {
  const formatted = formatInstantIn(locale, value, 'UTC')
  return formatted === UNKNOWN_INSTANT ? formatted : `${formatted} UTC`
}
