import { describe, expect, it } from 'vitest'
import { groupPriceAlertHistoryNeeds } from '../../apps/api/src/price-alert-checker'

describe('price alert history grouping', () => {
  it('requests history once per symbol if any pending rule needs it', () => {
    expect(groupPriceAlertHistoryNeeds([
      { symbol: 'AAPL', type: 'PRICE_ABOVE' },
      { symbol: 'MSFT', type: 'MOVING_AVG' },
      { symbol: 'AAPL', type: 'MOVING_AVG' },
      { symbol: 'MSFT', type: 'CHANGE_PERCENT' },
    ])).toEqual(new Map([['AAPL', true], ['MSFT', true]]))
  })

  it('handles a large mixed rule set in one grouping pass', () => {
    const rows = Array.from({ length: 50_000 }, (_, index) => ({
      symbol: `S${index % 5_000}`,
      type: index % 5_000 < 500 ? 'MOVING_AVG' : 'PRICE_ABOVE',
    }))
    const result = groupPriceAlertHistoryNeeds(rows)
    expect(result.size).toBe(5_000)
    expect([...result.values()].filter(Boolean)).toHaveLength(500)
  })
})
