import type { Locale } from './destinations'
import {
  formatAmount,
  formatCompactUsd,
  formatCount,
  formatDay,
  formatPercent,
  formatQuantity,
  formatSignedAmount,
  formatSignedPercent as sharedSignedPercent,
} from './market-display'

// Guru surfaces used to carry their own copy of grouping, percentage and date
// logic, which is how the same figure came to read one way here and another way
// on the portfolio pages. These are now thin aliases over the one display
// boundary; the argument order stays (value, locale) so no call site changes.

export function compactUsd(value: string | null, locale: Locale): string {
  return formatCompactUsd(locale, value)
}

export function percent(value: string | null, locale: Locale): string {
  return formatPercent(locale, value)
}

export function number(value: number | null, locale: Locale): string {
  return formatCount(locale, value)
}

/** A share count or weight: exact to four decimals with padded zeros trimmed. */
export function formatExactDecimal(value: string | null | undefined, locale: Locale): string {
  return formatQuantity(locale, value)
}

export function formatSignedDecimal(value: string | null | undefined, locale: Locale): string {
  return formatSignedAmount(locale, value)
}

export function formatSignedPercent(value: string | null, locale: Locale): string {
  return sharedSignedPercent(locale, value)
}

/** The day role is locale-independent — it is the ISO day — so `_locale` goes unused. */
export function shortDate(value: string | null, _locale: Locale): string {
  return formatDay(value)
}

/** Kept for call sites that mean "a price", so they do not reach for `percent`. */
export function amount(value: string | null, locale: Locale): string {
  return formatAmount(locale, value)
}
