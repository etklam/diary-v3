import type { MarketRotationMonitorRow } from './monitor.js'
import { isNearHigh } from './signal.js'

export const rotationFilterKeys = [
  'all',
  'turning_strong',
  'losing_momentum',
  'rank_up',
  'rank_down',
  'above_50d',
  'below_50d',
  'near_high',
  'extended',
] as const

export type RotationFilterKey = typeof rotationFilterKeys[number]

export const rotationSortFields = [
  'symbol',
  'sectorName',
  'lastPrice',
  'rsi14',
  'rsiDelta2W',
  'rotationRank',
  'rankDelta2W',
  'twoWeekPerformancePct',
  'percentFromHigh',
] as const

export type RotationSortField = typeof rotationSortFields[number]
export type RotationSortOrder = 'asc' | 'desc'

export function matchesRotationFilter(row: MarketRotationMonitorRow, filter: RotationFilterKey): boolean {
  switch (filter) {
    case 'turning_strong': return row.signal === 'turning_strong'
    case 'losing_momentum': return row.signal === 'losing_momentum'
    case 'rank_up': return row.rankDelta2W != null && row.rankDelta2W > 0
    case 'rank_down': return row.rankDelta2W != null && row.rankDelta2W < 0
    case 'above_50d': return row.above50d === true
    case 'below_50d': return row.above50d === false
    case 'near_high': return isNearHigh(row.percentFromHigh)
    case 'extended': return row.signal === 'strong_but_extended'
    case 'all': return true
  }
}

function compareNullable(a: number | string | null, b: number | string | null): number {
  if (a === null && b === null) return 0
  if (a === null) return -1
  if (b === null) return 1
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b)
  return Number(a) - Number(b)
}

export function compareRotationRows(
  a: MarketRotationMonitorRow,
  b: MarketRotationMonitorRow,
  field: RotationSortField,
  order: RotationSortOrder,
): number {
  const aValue = field === 'symbol' || field === 'sectorName' ? a[field] : a[field]
  const bValue = field === 'symbol' || field === 'sectorName' ? b[field] : b[field]
  const primary = compareNullable(aValue, bValue)
  if (primary !== 0) return order === 'asc' ? primary : -primary
  return a.symbol.localeCompare(b.symbol)
}

export function filterAndSortRotationRows(
  rows: readonly MarketRotationMonitorRow[],
  filter: RotationFilterKey,
  field: RotationSortField,
  order: RotationSortOrder,
): MarketRotationMonitorRow[] {
  return rows.filter(row => matchesRotationFilter(row, filter)).slice().sort((a, b) => compareRotationRows(a, b, field, order))
}
