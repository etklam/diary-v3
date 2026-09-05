import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest'
import { createApp } from '../../apps/api/src/app'
import { createMarketData } from '../../apps/api/src/market-data'
import { BrowserSession } from '../support/browser-session'
import { provisionTestDatabase } from '../support/database'

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>, baseUrl: string, clock: Date
beforeAll(async () => { database = await provisionTestDatabase('portfolio_valuation') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, marketData: createMarketData({ now: () => clock, timeoutMs: 50, upstream: {
    quote: async symbol => ({ symbol, regularMarketPrice: symbol === 'MISSING' ? null : symbol === 'ZERO' ? 0 : symbol === 'FRACTIONAL' ? 12.3456 : 120, regularMarketPreviousClose: 100, regularMarketTime: new Date(symbol === 'STALE' ? '2026-09-01T10:00:00Z' : '2026-09-05T10:00:00Z'), marketState: 'REGULAR' }),
    chart: async () => ({ quotes: [] }),
  } }), config: {
    jwtSecret: 'synthetic-review-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening'); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => { server.close(); await once(server, 'close') })
afterAll(async () => { await database?.dispose() })
async function login() {
  const browser = new BrowserSession(baseUrl)
  const credentials = { email: `${randomUUID()}@example.test`, password: 'synthetic-review-password' }
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200)
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200)
  await browser.request('/api/auth/me')
  return browser
}
async function create(browser: BrowserSession, extra = {}) {
  const response = await browser.post('/api/diaries', { title: 'Original decision', content: 'Original Markdown', date: '2026-09-05', thesis: 'Original thesis', risk: 'Original risk', execution: 'Original execution', ...extra })
  expect(response.status).toBe(201)
  return response.json()
}

async function positions(browser: BrowserSession, symbols: string[]) {
  return create(browser, { transactions: symbols.map(symbol => ({ symbol, type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-01T00:00:00Z' })) })
}
it('values complete holdings and retains source aggregation formulas and quote time', async () => {
 const browser = await login(); await positions(browser, ['AAPL']);
 const response = await browser.request('/api/stocks/portfolio'); expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ holdings: [{symbol:'AAPL',quantity:2,avgCost:100,totalCost:200,price:120}], valuation:{valuationStatus:'complete',currentMarketValue:240,unrealizedAmount:40,unrealizedPct:20,totalDayChange:40,totalDayChangePercent:20,quoteCoveragePct:100,valuationAsOf:'2026-09-05T10:00:00.000Z'},quoteErrors:[],marketState:'REGULAR' });
})
it('matches the source decimal fixture for fractional quantity, cost, quote and P&L percent', async () => {
 const browser = await login();
 await create(browser, { transactions: [
   { symbol: 'FRACTIONAL', type: 'BUY', quantity: '0.1250', price: '12.3400', tradeDate: '2026-09-01T00:00:00Z' },
   { symbol: 'FRACTIONAL', type: 'BUY', quantity: '1.3750', price: '10.0100', tradeDate: '2026-09-02T00:00:00Z' },
 ] });
 const response = await browser.request('/api/stocks/portfolio'); expect(response.status).toBe(200);
 const data = await response.json();
 expect(data.holdings).toMatchObject([{ symbol: 'FRACTIONAL', quantity: 1.5, avgCost: 10.20416667, totalCost: 15.30625, price: 12.3456 }]);
 expect(data.valuation).toMatchObject({
   valuationStatus: 'complete', totalHoldings: 1, totalCost: 15.30625,
   pricedCostBasis: 15.30625, currentMarketValue: 18.5184,
   unrealizedPct: 20.98587178440179,
   quoteCoveragePct: 100,
 });
 expect(data.valuation.unrealizedAmount).toBeCloseTo(3.21215, 10);
 expect(data.valuation.unrealizedPct).toBeCloseTo(20.9858717844, 10);
});
it('preserves missing holdings and calculates partial gains only against priced basis', async () => {
 const browser=await login(); await positions(browser,['AAPL','MISSING','STALE']);
 const data=await(await browser.request('/api/stocks/portfolio')).json();
 expect(data.holdings).toHaveLength(3);expect(data.holdings.find((h:{symbol:string})=>h.symbol==='MISSING')).not.toHaveProperty('price');
 expect(data.valuation).toMatchObject({valuationStatus:'partial',totalCost:600,pricedCostBasis:400,unpricedCostBasis:200,currentMarketValue:480,unrealizedAmount:80,pricedPositionCount:2,unpricedPositionCount:1,staleQuoteCount:1,valuationAsOf:'2026-09-01T10:00:00.000Z'});expect(data.quoteErrors).toEqual(['MISSING']);
})
it('distinguishes empty, unavailable and a valid zero price without leaking other owners', async () => {
 const empty=await login(),missing=await login(),zero=await login();await positions(missing,['MISSING']);await positions(zero,['ZERO']);
 expect((await(await empty.request('/api/stocks/portfolio')).json()).valuation).toMatchObject({valuationStatus:'empty',totalCost:0,currentMarketValue:null});
 expect((await(await missing.request('/api/stocks/portfolio')).json()).valuation).toMatchObject({valuationStatus:'unavailable',totalCost:200,currentMarketValue:null,unrealizedAmount:null,unpricedCostBasis:200});
 expect((await(await zero.request('/api/stocks/portfolio')).json()).valuation).toMatchObject({valuationStatus:'complete',currentMarketValue:0,unrealizedAmount:-200});
 expect((await fetch(baseUrl+'/api/stocks/portfolio')).status).toBe(401);
 expect((await zero.request('/api/stocks/portfolio',{headers:{authorization:'Bearer invalid'}})).status).toBe(401);
})

it('returns partial batch quotes with bounded input and original first symbol keys', async () => {
 const browser=await login();
 const result=await browser.post('/api/stocks/prices',{symbols:[' aapl ','AAPL','MISSING','INVALID/SYMBOL']});expect(result.status).toBe(200);
 const data=await result.json();expect(Object.keys(data)).toEqual(['aapl']);expect(data.aapl.regularMarketPrice).toBe(120);
 expect((await browser.post('/api/stocks/prices',{symbols:['MISSING']})).status).toBe(502);
 expect((await browser.post('/api/stocks/prices',{symbols:Array(26).fill('AAPL')})).status).toBe(400);
 expect((await browser.post('/api/stocks/prices',{symbols:[]})).status).toBe(400);
 expect((await browser.request('/api/stocks/prices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({symbols:['AAPL']})})).status).toBe(403);
});
