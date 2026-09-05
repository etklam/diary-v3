import { expect, it } from 'vitest'
import { computePortfolioAggregations } from '../packages/domain/src/portfolio'
import type { PortfolioHolding } from '@diary/contracts/portfolio'
const holdings = (values: number[]): PortfolioHolding[] => values.map((value, index) => ({ symbol: `STOCK${index}`, quantity: 1, avgCost: 100, totalCost: 100, price: value }))
it('warns at exactly 25 percent for the largest position', () => {
  expect(computePortfolioAggregations(holdings([25,15,15,15,15,15]))).toMatchObject({ largestPositionPct: 25, top3ConcentrationPct: 55, concentrationWarning: true })
  expect(computePortfolioAggregations(holdings([24,16,15,15,15,15]))).toMatchObject({ largestPositionPct: 24, top3ConcentrationPct: 55, concentrationWarning: false })
})
it('warns at exactly 60 percent for top three even when each position is below 25', () => {
  expect(computePortfolioAggregations(holdings([20,20,20,20,20]))).toMatchObject({ largestPositionPct: 20, top3ConcentrationPct: 60, concentrationWarning: true })
  expect(computePortfolioAggregations(holdings([19,19,19,19,19,5]))).toMatchObject({ largestPositionPct: 19, top3ConcentrationPct: 57, concentrationWarning: false })
})
it('keeps unknown quotes out of the market-value denominator without dropping their cost', () => {
  expect(computePortfolioAggregations([...holdings([120]), { symbol: 'MISSING', quantity: 1, avgCost: 300, totalCost: 300 }])).toMatchObject({ largestPositionSymbol: 'STOCK0', largestPositionPct: 100, top3ConcentrationPct: 100, pricedCostBasis: 100, unpricedCostBasis: 300, valuationStatus: 'partial' })
})
it('does not invent concentration when empty, unpriced or all prices are zero', () => {
  for (const rows of [[], [{ symbol: 'MISSING', quantity: 1, avgCost: 100, totalCost: 100 }], holdings([0,0])]) expect(computePortfolioAggregations(rows)).toMatchObject({ largestPositionPct: null, top3ConcentrationPct: null, largestPositionSymbol: null, concentrationWarning: false })
})
