import { expect, it, vi } from 'vitest'
import { createMarketData } from '../../apps/api/src/market-data'
it('requests five-year monthly bars with sorted dates and close fallbacks', async () => {
 const chart = vi.fn(async () => ({ quotes: [
  { date: new Date('2026-02-01Z'), close: 102.1234, adjclose: 101, volume: 5000000000 },
  { date: new Date('2026-01-01Z'), close: 100, open: 99, high: 101, low: 98 },
  { date: new Date('2026-03-01Z'), close: null },
 ] }))
 const market = createMarketData({ now: () => new Date('2026-09-05T12:00:00Z'), upstream: { quote: async () => ({}), chart } })
 const result = await market.monthly('spy')
 expect(chart).toHaveBeenCalledWith('SPY', { period1: new Date('2021-09-05T12:00:00Z'), period2: new Date('2026-09-05T12:00:00Z'), interval: '1mo', return: 'array' }, expect.any(AbortSignal))
 expect(result.data).toHaveLength(2); expect(result.data[0]).toMatchObject({ close: 100, open: 99, adjClose: 100, volume: null }); expect(result.data[1]).toMatchObject({ open: 102.1234, high: 102.1234, low: 102.1234, adjClose: 101, volume: 5000000000 })
})
it('rejects unusable monthly responses and marks cached fallback stale', async () => {
 for (const quotes of [[], [{ date: new Date('2026-01-01Z'), close: 1, volume: -1 }], [{ date: 'bad', close: 1 }], [{ date: new Date('2026-01-01Z'), close: 1000000 }], [{ date: new Date('2026-01-01Z'), close: 999999.99999 }]]) {
  const market = createMarketData({ upstream: { quote: async () => ({}), chart: async () => ({ quotes }) } }); await expect(market.monthly('SPY')).rejects.toThrow()
 }
 let fail = false
 const market = createMarketData({ upstream: { quote: async () => ({}), chart: async () => fail ? ({ quotes: [] }) : ({ quotes: [{ date: new Date('2026-01-01Z'), close: 1 }] }) } })
 expect((await market.monthly('SPY')).source).toBe('upstream'); fail=true; expect((await market.monthly('SPY')).source).toBe('stale')
})
