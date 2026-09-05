const QUANTITY_SCALE = 4
const QUANTITY_FACTOR = 10n ** BigInt(QUANTITY_SCALE)
const COST_SCALE = 8

export interface LedgerEntry {
  id?: string
  symbol: string
  type: 'BUY' | 'SELL'
  quantity: string
  price: string
  tradeDate?: Date | string
  /** Persistence tie-breaker; omitted callers retain stable input order. */
  order?: bigint
}

export interface DecimalHolding {
  symbol: string
  quantity: string
  avgCost: string
  totalCost: string
}

export interface DecimalClosedTrade {
  id: string
  symbol: string
  sellDate: Date
  sellQuantity: string
  sellPrice: string
  avgCostBasis: string
  realizedPnL: string
  realizedPnLPct: string
}

interface Fraction { numerator: bigint; denominator: bigint }

export class LedgerValidationError extends Error {
  constructor(readonly symbol: string, message: string) { super(message) }
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) [a, b] = [b, a % b]
  return a || 1n
}

function fraction(numerator: bigint, denominator = 1n): Fraction {
  if (denominator === 0n) throw new Error('Division by zero')
  const sign = denominator < 0n ? -1n : 1n
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor * sign, denominator: denominator / divisor * sign }
}

function add(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  )
}

function subtract(left: Fraction, right: Fraction): Fraction {
  return add(left, fraction(-right.numerator, right.denominator))
}

function multiply(left: Fraction, numerator: bigint, denominator = 1n): Fraction {
  return fraction(left.numerator * numerator, left.denominator * denominator)
}

function divide(left: Fraction, right: Fraction): Fraction {
  return fraction(left.numerator * right.denominator, left.denominator * right.numerator)
}

function scaled(value: string, scale: number): bigint {
  const [whole, decimalPart = ''] = value.split('.')
  return BigInt(whole!) * (10n ** BigInt(scale)) + BigInt(decimalPart.padEnd(scale, '0'))
}

function roundedInteger(value: Fraction): bigint {
  const negative = value.numerator < 0n
  const absolute = negative ? -value.numerator : value.numerator
  const quotient = absolute / value.denominator
  const remainder = absolute % value.denominator
  const rounded = quotient + (remainder * 2n >= value.denominator ? 1n : 0n)
  return negative ? -rounded : rounded
}

function decimal(value: bigint, scale: number): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const factor = 10n ** BigInt(scale)
  const whole = absolute / factor
  const decimalPart = (absolute % factor).toString().padStart(scale, '0').replace(/0+$/, '')
  const result = decimalPart ? `${whole}.${decimalPart}` : whole.toString()
  return negative && absolute !== 0n ? `-${result}` : result
}

function fractionDecimal(value: Fraction, scale: number): string {
  return decimal(roundedInteger(multiply(value, 10n ** BigInt(scale))), scale)
}

function costDecimal(value: Fraction): string {
  return decimal(roundedInteger(value), COST_SCALE)
}

export function roundDecimalString(value: string, scale: number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) throw new Error('Invalid decimal string')
  const decimalPart = match[3] ?? ''
  const numerator = BigInt(`${match[2]}${decimalPart}`) * (match[1] ? -1n : 1n)
  return fractionDecimal(fraction(numerator, 10n ** BigInt(decimalPart.length)), scale)
}

/** Exact chronological average-cost replay. Invalid SELL rows fail the write path. */
export function replayLedger(entries: readonly LedgerEntry[]) {
  const ordered = entries.map((entry, index) => ({ entry, index })).sort((left, right) => {
    const leftTime = left.entry.tradeDate ? new Date(left.entry.tradeDate).getTime() : 0
    const rightTime = right.entry.tradeDate ? new Date(right.entry.tradeDate).getTime() : 0
    const dateDifference = leftTime - rightTime
    if (dateDifference !== 0) return dateDifference
    if (left.entry.order !== undefined && right.entry.order !== undefined) {
      return left.entry.order < right.entry.order ? -1 : left.entry.order > right.entry.order ? 1 : 0
    }
    return left.index - right.index
  })
  const positions = new Map<string, { quantity: bigint; totalCost: Fraction }>()
  const closedTrades: DecimalClosedTrade[] = []

  for (const { entry, index } of ordered) {
    const symbol = entry.symbol.trim().toUpperCase()
    const quantity = scaled(entry.quantity, QUANTITY_SCALE)
    const price = scaled(entry.price, QUANTITY_SCALE)
    const position = positions.get(symbol) ?? { quantity: 0n, totalCost: fraction(0n) }
    if (entry.type === 'BUY') {
      position.quantity += quantity
      position.totalCost = add(position.totalCost, fraction(quantity * price))
      positions.set(symbol, position)
      continue
    }
    if (position.quantity === 0n) {
      throw new LedgerValidationError(symbol, `No ${symbol} holding is available to sell`)
    }
    if (quantity > position.quantity) {
      throw new LedgerValidationError(symbol, `${symbol} sell quantity exceeds the available holding`)
    }
    const costBasis = multiply(position.totalCost, quantity, position.quantity)
    const proceeds = fraction(quantity * price)
    const realizedPnL = subtract(proceeds, costBasis)
    const realizedPnLPct = multiply(divide(realizedPnL, costBasis), 100n)
    closedTrades.push({
      id: entry.id ?? String(index + 1),
      symbol,
      sellDate: new Date(entry.tradeDate ?? 0),
      sellQuantity: decimal(quantity, QUANTITY_SCALE),
      sellPrice: decimal(price, QUANTITY_SCALE),
      avgCostBasis: costDecimal(multiply(position.totalCost, QUANTITY_FACTOR, position.quantity)),
      realizedPnL: costDecimal(realizedPnL),
      realizedPnLPct: fractionDecimal(realizedPnLPct, COST_SCALE),
    })
    position.quantity -= quantity
    position.totalCost = subtract(position.totalCost, costBasis)
    if (position.quantity === 0n) positions.delete(symbol)
    else positions.set(symbol, position)
  }

  const holdings: DecimalHolding[] = [...positions.entries()].map(([symbol, position]) => ({
    symbol,
    quantity: decimal(position.quantity, QUANTITY_SCALE),
    totalCost: costDecimal(position.totalCost),
    avgCost: costDecimal(multiply(position.totalCost, QUANTITY_FACTOR, position.quantity)),
  }))
  return { holdings, closedTrades }
}

export function calculateBuyHoldings(entries: readonly (LedgerEntry & { type: 'BUY' })[]): DecimalHolding[] {
  return replayLedger(entries).holdings
}
