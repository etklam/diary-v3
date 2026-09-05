export type PositionSizingRounding = 'down' | 'nearest' | 'up'

export interface PositionSizingStrategy {
  id: 'pyramid' | 'pyramid-variant' | 'rectangular' | 'inverted-pyramid'
  ratios: readonly number[]
}

export const positionSizingStrategies = [
  { id: 'pyramid', ratios: [40, 30, 20, 10] },
  { id: 'pyramid-variant', ratios: [20, 20, 30, 20, 10] },
  { id: 'rectangular', ratios: [30, 30, 30, 10] },
  { id: 'inverted-pyramid', ratios: [10, 20, 30, 40] },
] as const satisfies readonly PositionSizingStrategy[]

export type PositionSizingStrategyId = (typeof positionSizingStrategies)[number]['id']

export interface PositionSizingInput {
  capital: number
  stockPrice: number
  ratios: readonly number[]
  reserveCashPercent: number
  roundingMode: PositionSizingRounding
}

export interface PositionSizingBatch {
  ratio: number
  amount: number
  shares: number
  actualAmount: number
  cumulativeShares: number
  cumulativeAmount: number
}

export interface PositionSizingSummary {
  totalShares: number
  totalInvested: number
  avgPrice: number
  reservedCash: number
  unallocatedCash: number
  totalRemainingCash: number
  utilizationRate: number
  isOverBudget: boolean
  overBudgetAmount: number
}

export interface PositionSizingOutput {
  results: PositionSizingBatch[]
  summary: PositionSizingSummary | null
  warnings: string[]
}

export function validatePositionSizingRatios(ratios: readonly number[]): { sum: number; isValid: boolean } {
  const sum = ratios.reduce((total, ratio) => total + ratio, 0)
  return { sum, isValid: Math.abs(sum - 100) < 0.01 }
}

function validateInput(input: PositionSizingInput) {
  const finite = [input.capital, input.stockPrice, input.reserveCashPercent, ...input.ratios]
  if (finite.some(value => !Number.isFinite(value))) throw new RangeError('Position sizing values must be finite')
  if (input.ratios.length === 0 || input.ratios.some(ratio => ratio < 0)) throw new RangeError('Position sizing ratios must be non-negative')
  if (input.reserveCashPercent < 0 || input.reserveCashPercent > 100) throw new RangeError('Reserve cash must be between 0 and 100 percent')
  if (!['down', 'nearest', 'up'].includes(input.roundingMode)) throw new RangeError('Unknown position sizing rounding mode')
}

function calculateShares(amount: number, price: number, mode: PositionSizingRounding): number {
  if (price <= 0) return 0
  const raw = amount / price
  const shares = mode === 'down' ? Math.floor(raw) : mode === 'up' ? Math.ceil(raw) : Math.round(raw)
  return Math.max(0, shares)
}

/** Frozen source formula: reserve first, split by ratio, round whole shares. */
export function calculatePositionSizing(input: PositionSizingInput): PositionSizingOutput {
  validateInput(input)
  const { capital, stockPrice, ratios, reserveCashPercent, roundingMode } = input
  const warnings: string[] = []

  if (capital <= 0 || stockPrice <= 0) return { results: [], summary: null, warnings: ['Invalid capital or stock price'] }

  const ratioValidation = validatePositionSizingRatios(ratios)
  if (!ratioValidation.isValid) warnings.push(`Strategy ratios total ${ratioValidation.sum.toFixed(1)}%, not 100%`)

  const reservedCash = capital * (reserveCashPercent / 100)
  const availableCapital = capital - reservedCash
  const results: PositionSizingBatch[] = []
  let cumulativeShares = 0
  let cumulativeAmount = 0

  for (const [index, ratio] of ratios.entries()) {
    const amount = (availableCapital * ratio) / 100
    let shares = calculateShares(amount, stockPrice, roundingMode)
    if (index === ratios.length - 1 && roundingMode === 'up') {
      const maxShares = Math.floor((availableCapital - cumulativeAmount) / stockPrice)
      if (shares > maxShares && maxShares >= 0) {
        shares = maxShares
        warnings.push('Final batch shares were adjusted to avoid exceeding the budget')
      }
    }
    const actualAmount = shares * stockPrice
    cumulativeShares += shares
    cumulativeAmount += actualAmount
    results.push({ ratio, amount, shares, actualAmount, cumulativeShares, cumulativeAmount })
  }

  const totalShares = cumulativeShares
  const totalInvested = cumulativeAmount
  const avgPrice = totalShares > 0 ? totalInvested / totalShares : 0
  const isOverBudget = totalInvested > availableCapital
  const overBudgetAmount = isOverBudget ? totalInvested - availableCapital : 0
  const unallocatedCash = Math.max(0, availableCapital - totalInvested)
  const totalRemainingCash = reservedCash + unallocatedCash

  if (stockPrice > availableCapital) warnings.push('Stock price is too high to buy one whole share with available capital')
  else if (totalShares === 0) warnings.push('Available capital cannot buy one whole share in any batch')

  return {
    results,
    summary: {
      totalShares,
      totalInvested,
      avgPrice,
      reservedCash,
      unallocatedCash,
      totalRemainingCash,
      utilizationRate: (totalInvested / capital) * 100,
      isOverBudget,
      overBudgetAmount,
    },
    warnings,
  }
}
