import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { provisionTestDatabase } from '../support/database'
import { completedHistoricalCloses, createPriceAlertChecker, evaluatePriceAlert, priceCondition } from '../../apps/api/src/price-alert-checker'
let database: Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async () => { database = await provisionTestDatabase('price_check') })
afterAll(async () => { await database?.dispose() })
async function fixture(email: string, threshold = '100') {
  const user = await database.pool.query('insert into users(email,password) values ($1,$2) returning id', [email, 'synthetic'])
  return (await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,message) values ($1,'AAPL','PRICE_ABOVE',$2,'Synthetic') returning id,user_id", [user.rows[0].id, threshold])).rows[0]
}
it('uses inclusive conditions and never treats missing/nonfinite prices as zero', () => {
  expect(priceCondition('PRICE_ABOVE', 100, '100.0000')).toBe(true)
  expect(priceCondition('PRICE_BELOW', 0, '0.0000')).toBe(true)
  for (const price of [NaN, Infinity, -1]) expect(priceCondition('PRICE_BELOW', price, '100')).toBe(false)
  expect(priceCondition('PRICE_ABOVE', 99.9999, '100')).toBe(false)
})
it('uses signed previous-close percentages and completed moving-average levels', () => {
  const now = new Date('2026-09-05T12:00:00Z')
  const history = Array.from({ length: 200 }, (_, index) => ({
    timestamp: Math.floor((now.getTime() - (index + 1) * 86_400_000) / 1000),
    close: 100,
  }))
  expect(evaluatePriceAlert('CHANGE_PERCENT', { currentPrice: 105, previousClose: 100 }, '5', null, now)).toBe(true)
  expect(evaluatePriceAlert('CHANGE_PERCENT', { currentPrice: 105, previousClose: 100 }, '-5', null, now)).toBe(false)
  expect(evaluatePriceAlert('CHANGE_PERCENT', { currentPrice: 95, previousClose: 100 }, '-5', null, now)).toBe(true)
  expect(evaluatePriceAlert('CHANGE_PERCENT', { currentPrice: 100, previousClose: 100 }, '0', null, now)).toBe(true)
  expect(evaluatePriceAlert('CHANGE_PERCENT', { currentPrice: 100, previousClose: 0 }, '0', null, now)).toBeUndefined()
  for (const [period, direction] of [['20', 'above'], ['50', 'below'], ['200', 'above']] as const) {
    expect(evaluatePriceAlert('MOVING_AVG', { currentPrice: 100, previousClose: null, historicalCloses: history }, period, direction, now)).toBe(true)
  }
  // PostgreSQL numeric values are returned with scale (for example, 20.0000).
  expect(evaluatePriceAlert('MOVING_AVG', { currentPrice: 100, previousClose: null, historicalCloses: history }, '20.0000', 'above', now)).toBe(true)
  expect(evaluatePriceAlert('MOVING_AVG', { currentPrice: 100, previousClose: null, historicalCloses: history }, '21', 'above', now)).toBeUndefined()
  expect(evaluatePriceAlert('MOVING_AVG', { currentPrice: 101, previousClose: null, historicalCloses: history.slice(0, 19) }, '20', 'above', now)).toBeUndefined()
  expect(evaluatePriceAlert('MOVING_AVG', { currentPrice: 100, previousClose: null, historicalCloses: null }, '20', 'above', now)).toBeUndefined()
  expect(evaluatePriceAlert('MOVING_AVG', { currentPrice: 100, previousClose: null, historicalCloses: [...history, { timestamp: Math.floor(now.getTime() / 1000), close: 999 }] }, '20', 'above', now)).toBe(true)
  const completedAfterClose = Math.floor(Date.parse('2026-09-04T20:30:00Z') / 1000)
  const beforeClose = new Date('2026-09-04T19:00:00Z')
  const afterClose = new Date('2026-09-04T21:00:00Z')
  expect(completedHistoricalCloses([{ timestamp: completedAfterClose, close: 100 }], beforeClose)).toEqual([])
  expect(completedHistoricalCloses([{ timestamp: completedAfterClose, close: 100 }], afterClose)).toEqual([100])
  expect(completedHistoricalCloses([{ timestamp: Math.floor(Date.parse('2026-09-05T20:30:00Z') / 1000), close: 100 }], afterClose)).toEqual([])
  expect(completedHistoricalCloses([{ timestamp: Math.floor(Date.parse('2026-09-05T20:30:00Z') / 1000), close: 100 }], new Date('2026-09-05T21:00:00Z'))).toEqual([100])
  expect(completedHistoricalCloses([{ timestamp: Math.floor(Date.parse('2026-11-02T21:30:00Z') / 1000), close: 100 }], new Date('2026-11-02T20:59:00Z'))).toEqual([])
  expect(completedHistoricalCloses([{ timestamp: Math.floor(Date.parse('2026-11-02T21:30:00Z') / 1000), close: 100 }], new Date('2026-11-02T21:31:00Z'))).toEqual([100])
})
it('commits before emit, deduplicates symbol reads and cannot double trigger across concurrent checkers', async () => {
  const first = await fixture('first-price@example.test'), second = await fixture('second-price@example.test')
  const quote = vi.fn(async () => 100), emit = vi.fn((_userId: string) => { throw new Error('Synthetic delivery failure') }), log = vi.fn()
  const dependencies = { db: database.db, quote, emit, log, now: () => new Date('2026-01-01T00:00:00.123Z') }
  const a = createPriceAlertChecker(dependencies), b = createPriceAlertChecker(dependencies)
  await Promise.all([a.checkPriceAlerts(), b.checkPriceAlerts()])
  expect(quote).toHaveBeenCalledTimes(2); expect(emit).toHaveBeenCalledTimes(2)
  expect(new Set(emit.mock.calls.map(call => call[0]))).toEqual(new Set([String(first.user_id), String(second.user_id)]))
  const rows = await database.pool.query('select is_triggered,triggered_at from price_alerts where id=any($1::bigint[])', [[first.id, second.id]])
  expect(rows.rows.every(row => row.is_triggered && row.triggered_at.toISOString() === '2026-01-01T00:00:00.123Z')).toBe(true)
  await a.checkPriceAlerts(); expect(emit).toHaveBeenCalledTimes(2)
  await a.stop(); await b.stop()
})
it('re-reads edits and deletion after a slow quote, and explicitly rearmed rows can trigger again', async () => {
  const edited = await fixture('edited-price@example.test'), deleted = await fixture('deleted-price@example.test')
  let release!: (value: number) => void, entered!: () => void
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const quote = vi.fn(() => { entered(); return new Promise<number>(resolve => { release = resolve }) }), emit = vi.fn()
  const checker = createPriceAlertChecker({ db: database.db, quote, emit, log: vi.fn() })
  const checking = checker.checkPriceAlerts(); await waiting
  await database.pool.query('update price_alerts set threshold=200 where id=$1', [edited.id])
  await database.pool.query('delete from price_alerts where id=$1', [deleted.id])
  release(100); await checking; expect(emit).not.toHaveBeenCalled()
  quote.mockResolvedValue(200); await checker.checkPriceAlerts(); expect(emit).toHaveBeenCalledTimes(1)
  await database.pool.query('update price_alerts set is_triggered=false,triggered_at=null where id=$1', [edited.id])
  await checker.checkPriceAlerts(); expect(emit).toHaveBeenCalledTimes(2)
  await checker.stop()
})
it('keeps alerts pending on unavailable or invalid quotes and retries a later valid quote', async () => {
  const pending = await fixture('missing-price@example.test')
  const quote = vi.fn<() => Promise<number | null>>().mockRejectedValueOnce(new Error('Synthetic provider failure')).mockResolvedValueOnce(null).mockResolvedValueOnce(NaN).mockResolvedValueOnce(Infinity).mockResolvedValue(100)
  const emit = vi.fn(), log = vi.fn(), checker = createPriceAlertChecker({ db: database.db, quote, emit, log })
  for (let attempt = 0; attempt < 4; attempt++) {
    await checker.checkPriceAlerts()
    expect((await database.pool.query('select is_triggered from price_alerts where id=$1', [pending.id])).rows[0].is_triggered).toBe(false)
  }
  expect(emit).not.toHaveBeenCalled(); expect(log).toHaveBeenCalledTimes(1)
  await checker.checkPriceAlerts(); expect(emit).toHaveBeenCalledTimes(1)
  await checker.stop()
})
it('checks percentage and moving-average alerts independently when history is unavailable', async () => {
  const user = await database.pool.query('insert into users(email,password) values ($1,$2) returning id', ['mixed-price@example.test', 'synthetic'])
  const userId = user.rows[0].id
  const percent = (await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,message) values ($1,'AAPL','CHANGE_PERCENT','-5','Percent') returning id", [userId])).rows[0]
  const price = (await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,message) values ($1,'AAPL','PRICE_ABOVE','90','Price') returning id", [userId])).rows[0]
  const average = (await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,moving_average_direction,message) values ($1,'AAPL','MOVING_AVG','20','above','Average') returning id", [userId])).rows[0]
  const quote = vi.fn()
    .mockResolvedValueOnce({ currentPrice: 95, previousClose: 100, historicalCloses: null })
    .mockResolvedValueOnce({ currentPrice: 105, previousClose: 100, historicalCloses: Array.from({ length: 20 }, (_, index) => ({ timestamp: Math.floor((Date.parse('2026-09-05T12:00:00Z') - (index + 1) * 86_400_000) / 1000), close: 100 })) })
  const emit = vi.fn(), checker = createPriceAlertChecker({ db: database.db, quote, emit, log: vi.fn(), now: () => new Date('2026-09-05T12:00:00Z') })
  await checker.checkPriceAlerts()
  expect((await database.pool.query('select is_triggered from price_alerts where id=$1', [percent.id])).rows[0].is_triggered).toBe(true)
  expect((await database.pool.query('select is_triggered from price_alerts where id=$1', [price.id])).rows[0].is_triggered).toBe(true)
  expect((await database.pool.query('select is_triggered from price_alerts where id=$1', [average.id])).rows[0].is_triggered).toBe(false)
  await checker.checkPriceAlerts()
  expect((await database.pool.query('select is_triggered from price_alerts where id=$1', [average.id])).rows[0].is_triggered).toBe(true)
  expect(quote).toHaveBeenCalledTimes(2)
  expect(quote.mock.calls.map(call => call[1])).toEqual([true, true])
  await checker.stop()
})

it('uses exact numeric moving-average periods and commits one result across concurrent checkers', async () => {
  const user = await database.pool.query('insert into users(email,password) values ($1,$2) returning id', ['moving-average-race@example.test', 'synthetic'])
  const userId = user.rows[0].id
  const first = (await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,moving_average_direction,message) values ($1,'MSFT','MOVING_AVG','20.0000','above','Twenty') returning id", [userId])).rows[0]
  const second = (await database.pool.query("insert into price_alerts(user_id,symbol,type,threshold,moving_average_direction,message) values ($1,'MSFT','MOVING_AVG','50','below','Fifty') returning id", [userId])).rows[0]
  const now = new Date('2026-09-05T21:00:00Z')
  const history = Array.from({ length: 200 }, (_, index) => ({ timestamp: Math.floor((now.getTime() - (index + 1) * 86_400_000) / 1000), close: 100 }))
  const quote = vi.fn(async () => ({ currentPrice: 100, previousClose: 100, historicalCloses: history }))
  const emit = vi.fn(), log = vi.fn()
  const dependencies = { db: database.db, quote, emit, log, now: () => now }
  const a = createPriceAlertChecker(dependencies), b = createPriceAlertChecker(dependencies)
  await Promise.all([a.checkPriceAlerts(), b.checkPriceAlerts()])
  expect(emit).toHaveBeenCalledTimes(2)
  const rows = await database.pool.query('select id,is_triggered,triggered_at from price_alerts where id=any($1::bigint[]) order by id', [[first.id, second.id]])
  expect(rows.rows).toHaveLength(2)
  expect(rows.rows.every(row => row.is_triggered && row.triggered_at.toISOString() === now.toISOString())).toBe(true)
  await a.stop(); await b.stop()
})
