import type { Locale } from './destinations'

export function compactUsd(value: string | null, locale: Locale): string {
  if (value === null || !Number.isFinite(Number(value))) return '—'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))
}

export function percent(value: string | null, locale: Locale): string {
  if (value === null || !Number.isFinite(Number(value))) return '—'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value))}%`
}

export function number(value: number | null, locale: Locale): string {
  if (value === null) return '—'
  return new Intl.NumberFormat(locale).format(value)
}

export function formatExactDecimal(value: string | null | undefined, locale: Locale): string {
  if (value == null) return '—'
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return value
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const digits = whole
  let grouped = digits
  try { grouped = new Intl.NumberFormat(locale).format(BigInt(digits || '0')) } catch { /* Preserve exact source text. */ }
  const trimmedFraction = fraction.replace(/0+$/, '')
  return `${negative ? '-' : ''}${grouped}${trimmedFraction ? `.${trimmedFraction}` : ''}`
}

export function formatSignedDecimal(value: string | null | undefined, locale: Locale): string {
  const formatted = formatExactDecimal(value, locale)
  return value != null && Number(value) > 0 ? `+${formatted}` : formatted
}

export function formatSignedPercent(value: string | null, locale: Locale): string {
  const formatted = percent(value, locale)
  return value != null && Number(value) > 0 ? `+${formatted}` : formatted
}

export function shortDate(value: string | null, locale: Locale): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}
