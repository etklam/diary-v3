export type RelativeDirection = 'up' | 'down' | 'both'

export type RelativePricePoint = {
  targetPrice: number
  correspondingPrice: number
}

export type RelativeValueInput = {
  primarySymbol: string
  primaryPrice: number
  relativeSymbol: string
  relativePrice: number
  targetPrices: number[]
}

export type RelativeValueResult = {
  ratio: number
  inverseRatio: number
  priceTable: RelativePricePoint[]
  primarySymbol: string
  relativeSymbol: string
}

export type HistoricalClose = {
  timestamp: number
  close: number
}

export type RelativeRatioPoint = {
  timestamp: number
  ratio: number | null
  primaryClose: number | null
  relativeClose: number | null
}

export const relativeHistoryRanges = ['1mo', '3mo', '6mo', '1y', '5y', 'max'] as const
export type RelativeHistoryRange = typeof relativeHistoryRanges[number]
export const maxGeneratedPricePoints = 50

const aliases: Record<string, string> = {
  SPX: '^GSPC',
  DJI: '^DJI',
  IXIC: '^IXIC',
  NDX: '^NDX',
  RUT: '^RUT',
}

export function normalizeRelativeSymbol(value: string) {
  const symbol = value.trim().toUpperCase()
  return aliases[symbol] ?? symbol
}

export function getRelativeAliasSuggestion(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'SPX') return '^GSPC'
  if (normalized === 'DJI') return '^DJI'
  if (normalized === 'IXIC') return '^IXIC'
  if (normalized === 'NDX') return '^NDX'
  if (normalized === 'RUT') return '^RUT'
  return null
}

function assertPositiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`)
}

export function calculateRelativeRatio(primaryPrice: number, relativePrice: number) {
  assertPositiveFinite(primaryPrice, 'Primary price')
  assertPositiveFinite(relativePrice, 'Relative price')
  return primaryPrice / relativePrice
}

export function calculateCorrespondingPrice(targetPrice: number, ratio: number) {
  assertPositiveFinite(targetPrice, 'Target price')
  assertPositiveFinite(ratio, 'Ratio')
  return targetPrice / ratio
}

export function calculateRelativeValue(input: RelativeValueInput): RelativeValueResult {
  const ratio = calculateRelativeRatio(input.primaryPrice, input.relativePrice)
  return {
    ratio,
    inverseRatio: 1 / ratio,
    priceTable: input.targetPrices.map(targetPrice => ({
      targetPrice,
      correspondingPrice: calculateCorrespondingPrice(targetPrice, ratio),
    })),
    primarySymbol: input.primarySymbol,
    relativeSymbol: input.relativeSymbol,
  }
}

export function generateRelativePricePoints(
  basePrice: number,
  count: number,
  step: number,
  direction: RelativeDirection = 'both',
) {
  assertPositiveFinite(basePrice, 'Base price')
  assertPositiveFinite(step, 'Step')
  if (!Number.isInteger(count) || count < 1 || count > maxGeneratedPricePoints) return []
  const points: number[] = []
  if (direction === 'down' || direction === 'both') {
    for (let index = 1; index <= count; index += 1) {
      const value = basePrice - step * index
      if (value > 0 && Number.isFinite(value)) points.push(value)
    }
  }
  if (direction === 'up' || direction === 'both') {
    for (let index = 1; index <= count; index += 1) {
      const value = basePrice + step * index
      if (Number.isFinite(value)) points.push(value)
    }
  }
  return points.sort((a, b) => a - b)
}

export function parseRelativeTargetPrices(input: string) {
  if (!input.trim()) return []
  const values = input.split(/[,\n\s]+/u).filter(Boolean).map(value => {
    if (!/^\+?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value)) throw new Error('Invalid target price')
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Invalid target price')
    return parsed
  })
  return [...new Set(values)].sort((a, b) => a - b)
}

export function alignRelativeRatioHistory(primary: readonly HistoricalClose[], relative: readonly HistoricalClose[]) {
  const primaryByTimestamp = new Map(primary.map(row => [row.timestamp, row.close]))
  const relativeByTimestamp = new Map(relative.map(row => [row.timestamp, row.close]))
  const timestamps = [...new Set([...primaryByTimestamp.keys(), ...relativeByTimestamp.keys()])].sort((a, b) => a - b)
  return timestamps.map(timestamp => {
    const primaryClose = primaryByTimestamp.get(timestamp)
    const relativeClose = relativeByTimestamp.get(timestamp)
    const validPrimary = primaryClose !== undefined && Number.isFinite(primaryClose) && primaryClose > 0 ? primaryClose : null
    const validRelative = relativeClose !== undefined && Number.isFinite(relativeClose) && relativeClose > 0 ? relativeClose : null
    return { timestamp, ratio: validPrimary !== null && validRelative !== null ? validPrimary / validRelative : null, primaryClose: validPrimary, relativeClose: validRelative }
  })
}

export function splitRelativeRatioSegments(points: readonly RelativeRatioPoint[]) {
  // Aligned points are already the exact-date intersection. Keep the helper
  // explicit so callers can break the chart if a future provider adds gaps.
  const segments: RelativeRatioPoint[][] = []
  let segment: RelativeRatioPoint[] = []
  for (const point of points) {
    if (point.ratio === null || !Number.isFinite(point.ratio)) {
      if (segment.length) segments.push(segment)
      segment = []
    } else segment.push(point)
  }
  if (segment.length) segments.push(segment)
  return segments
}
