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
