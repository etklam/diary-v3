import { describe, expect, it } from 'vitest'
import { LedgerValidationError, replayLedger, roundDecimalString } from '@diary/domain/ledger'

const tx = (overrides: Partial<Parameters<typeof replayLedger>[0][number]> = {}) => ({
  id: '1', symbol: 'AAPL', type: 'BUY' as const, quantity: '10', price: '100',
  tradeDate: '2026-01-01T10:00:00.000Z', ...overrides,
})

describe('exact chronological average-cost ledger', () => {
  it('keeps weighted average cost through partial SELL and emits exact realized P&L', () => {
    const result = replayLedger([
      tx({ id: '1', quantity: '10', price: '100' }),
      tx({ id: '2', quantity: '10', price: '200', tradeDate: '2026-01-02T10:00:00.000Z' }),
      tx({ id: '3', type: 'SELL', quantity: '5', price: '180', tradeDate: '2026-01-03T10:00:00.000Z' }),
    ])
    expect(result.holdings).toEqual([{ symbol: 'AAPL', quantity: '15', avgCost: '150', totalCost: '2250' }])
    expect(result.closedTrades[0]).toMatchObject({
      id: '3', sellQuantity: '5', sellPrice: '180', avgCostBasis: '150',
      realizedPnL: '150', realizedPnLPct: '20',
    })
  })

  it('removes a fully closed position and preserves loss percentage precision', () => {
    const result = replayLedger([
      tx({ id: '1', quantity: '10', price: '100' }),
      tx({ id: '2', type: 'SELL', quantity: '10', price: '93.3333', tradeDate: '2026-01-02T10:00:00.000Z' }),
    ])
    expect(result.holdings).toEqual([])
    expect(result.closedTrades[0]).toMatchObject({
      realizedPnL: '-66.667', realizedPnLPct: '-6.6667',
    })
    expect(roundDecimalString(result.closedTrades[0]!.realizedPnL, 2)).toBe('-66.67')
  })

  it('sorts reverse input chronologically and preserves same-instant input order', () => {
    expect(replayLedger([
      tx({ id: '2', type: 'SELL', quantity: '3', price: '120', tradeDate: '2026-01-02T10:00:00.000Z' }),
      tx({ id: '1', quantity: '10', price: '100' }),
    ]).holdings[0]?.quantity).toBe('7')
    expect(() => replayLedger([
      tx({ id: '1', type: 'SELL', quantity: '1' }),
      tx({ id: '2', quantity: '1' }),
    ])).toThrow(LedgerValidationError)
  })

  it('rejects a SELL without enough same-symbol holdings', () => {
    expect(() => replayLedger([tx({ symbol: 'MSFT' }), tx({
      id: '2', type: 'SELL', quantity: '1', symbol: 'AAPL', tradeDate: '2026-01-02T10:00:00.000Z',
    })])).toThrow('No AAPL holding')
    expect(() => replayLedger([tx(), tx({
      id: '2', type: 'SELL', quantity: '10.0001', tradeDate: '2026-01-02T10:00:00.000Z',
    })])).toThrow('exceeds the available holding')
  })
})
