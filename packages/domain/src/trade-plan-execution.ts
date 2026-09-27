export type TradePlanExecutionSnapshot = {
  symbol: string
  entryPrice: string | null
  entryZoneLow: string | null
  entryZoneHigh: string | null
  maxPositionSize: string | null
}

export type TradePlanExecutionTransaction = {
  type: 'BUY' | 'SELL'
  quantity: string
  price: string
}

export type TradePlanExecutionCalculation = {
  comparisonStatus: 'unconfirmed' | 'ready' | 'unavailable' | 'outdated'
  buyQuantity: string | null
  averageExecutionPrice: string | null
  entryPriceDelta: string | null
  entryPriceDeltaPercent: string | null
  entryZoneRelation: 'inside' | 'below' | 'above' | 'unavailable'
}

const QUANTITY_SCALE = 4
const PRICE_SCALE = 6
const PERCENT_SCALE = 2

function parseScaled(value: string, scale: number): bigint {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/)
  if (!match || (match[2]?.length ?? 0) > scale) throw new Error('Invalid decimal')
  return BigInt(match[1]!) * 10n ** BigInt(scale) + BigInt((match[2] ?? '').padEnd(scale, '0') || 0)
}

function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const factor = 10n ** BigInt(scale)
  const whole = absolute / factor
  const fraction = scale === 0 ? '' : `.${(absolute % factor).toString().padStart(scale, '0').replace(/0+$/, '')}`
  return `${negative ? '-' : ''}${whole}${fraction === '.' ? '' : fraction}`
}

function roundPositive(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator
}

function roundSigned(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) return -roundPositive(-numerator, denominator)
  return roundPositive(numerator, denominator)
}

function compareScaled(left: string | null, right: string | null): number {
  if (left === null || right === null) return 0
  const a = parseScaled(left, PRICE_SCALE)
  const b = parseScaled(right, PRICE_SCALE)
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Calculates a comparison from a confirmed snapshot and manually selected
 * transactions. All arithmetic uses integer decimal units so a JS Number
 * never changes a persisted price or quantity.
 */
export function calculateTradePlanExecution(input: {
  baseline: TradePlanExecutionSnapshot | null
  baselineIsOutdated: boolean
  transactions: readonly TradePlanExecutionTransaction[]
}): TradePlanExecutionCalculation {
  let quantity = 0n
  let weightedPrice = 0n
  for (const transaction of input.transactions) {
    if (transaction.type !== 'BUY') continue
    const transactionQuantity = parseScaled(transaction.quantity, QUANTITY_SCALE)
    const transactionPrice = parseScaled(transaction.price, PRICE_SCALE)
    quantity += transactionQuantity
    weightedPrice += transactionQuantity * transactionPrice
  }

  const average = quantity === 0n ? null : roundPositive(weightedPrice, quantity)
  const averageText = average === null ? null : formatScaled(average, PRICE_SCALE)
  const buyQuantity = quantity === 0n ? null : formatScaled(quantity, QUANTITY_SCALE)
  const entryPrice = input.baseline?.entryPrice ?? null
  const entryPriceDelta = average === null || entryPrice === null
    ? null
    : formatScaled(average - parseScaled(entryPrice, PRICE_SCALE), PRICE_SCALE)
  const entryPriceDeltaPercent = average === null || entryPrice === null || parseScaled(entryPrice, PRICE_SCALE) === 0n
    ? null
    : formatScaled(roundSigned(
      (average - parseScaled(entryPrice, PRICE_SCALE)) * 100n * 10n ** BigInt(PERCENT_SCALE),
      parseScaled(entryPrice, PRICE_SCALE),
    ), PERCENT_SCALE)

  let entryZoneRelation: TradePlanExecutionCalculation['entryZoneRelation'] = 'unavailable'
  if (average !== null && input.baseline) {
    if (input.baseline.entryZoneLow !== null && compareScaled(averageText, input.baseline.entryZoneLow) < 0) entryZoneRelation = 'below'
    else if (input.baseline.entryZoneHigh !== null && compareScaled(averageText, input.baseline.entryZoneHigh) > 0) entryZoneRelation = 'above'
    else if (input.baseline.entryZoneLow !== null || input.baseline.entryZoneHigh !== null) entryZoneRelation = 'inside'
  }

  return {
    comparisonStatus: input.baseline === null
      ? 'unconfirmed'
      : input.baselineIsOutdated
        ? 'outdated'
        : average === null ? 'unavailable' : 'ready',
    buyQuantity,
    averageExecutionPrice: averageText,
    entryPriceDelta,
    entryPriceDeltaPercent,
    entryZoneRelation,
  }
}
