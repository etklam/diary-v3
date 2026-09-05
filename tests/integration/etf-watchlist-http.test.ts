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
beforeAll(async () => { database = await provisionTestDatabase('etf_watchlist_http') })
beforeEach(async () => {
  clock = new Date('2026-09-05T12:00:00Z')
  const app = createApp({ db: database.db, now: () => clock, marketData: createMarketData({ now: () => clock, upstream: {
    quote: async symbol => ({ symbol, regularMarketPrice: 120, regularMarketPreviousClose: 100, regularMarketTime: clock, marketState: 'REGULAR' }),
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
  return { browser, email: credentials.email }
}
function mutate(browser: BrowserSession, path: string, body: unknown = {}, method = 'PUT') {
  return browser.request(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': browser.cookies.get('csrf-token')! }, body: JSON.stringify(body) })
}
it('uses catalog entries with owner isolation, zero/latest prices and concurrent stable ordering',async()=>{
 const a=await login(),b=await login()
 await database.pool.query("insert into etfs(symbol) values ('SPY'),('QQQ'),('VTI')")
 expect((await a.browser.post('/api/etf/watchlist',{symbol:'UNKNOWN'})).status).toBe(404)
 expect((await database.pool.query("select count(*)::int as count from etfs where symbol='UNKNOWN'")).rows[0].count).toBe(0)
 const added=await Promise.all([' spy ','QQQ','VTI'].map(symbol=>a.browser.post('/api/etf/watchlist',{symbol})));expect(added.map(r=>r.status)).toEqual([200,200,200])
 const rows=await Promise.all(added.map(r=>r.json()));expect(rows.map(row=>row.sortOrder).sort()).toEqual([0,1,2])
 expect((await a.browser.post('/api/etf/watchlist',{symbol:'SPY'})).status).toBe(409)
 expect((await b.browser.post('/api/etf/watchlist',{symbol:'SPY'})).status).toBe(200)
 const list=await a.browser.request('/api/etf/watchlist');expect(list.headers.get('cache-control')).toBe('no-store');expect((await list.json()).map((row:{sortOrder:number})=>row.sortOrder)).toEqual([0,1,2])
 const spy=(await database.pool.query("select id from etfs where symbol='SPY'")).rows[0].id
 await database.pool.query("insert into etf_prices(etf_id,date,open,high,low,close,adj_close) values ($1,'2026-01-01',100,100,100,100,100),($1,'2026-02-01',0,0,0,0,0)",[spy])
 const latest=await (await a.browser.request('/api/etf/watchlist')).json();expect(latest.find((row:{symbol:string})=>row.symbol==='SPY')).toMatchObject({latestPrice:0,latestDate:'2026-02-01'});expect(latest.find((row:{symbol:string})=>row.symbol==='QQQ')).toMatchObject({latestPrice:null,latestDate:null})
 expect((await mutate(b.browser,`/api/etf/watchlist/${rows[0].id}`,{},'DELETE')).status).toBe(404)
 expect((await mutate(a.browser,`/api/etf/watchlist/${rows[0].id}`,{},'DELETE')).status).toBe(200)
 expect((await (await b.browser.request('/api/etf/watchlist')).json())).toHaveLength(1)
 expect((await a.browser.post('/api/etf/watchlist',{symbol:'SPY'},false)).status).toBe(403)
 expect((await fetch(baseUrl+'/api/etf/watchlist')).status).toBe(401)
 for(const table of ['stocks','stock_watchlists','transactions'])expect((await database.pool.query(`select count(*)::int as count from ${table}`)).rows[0].count).toBe(0)
})
it('allows only one concurrent add for the same owner and ETF',async()=>{
 const a=await login();await database.pool.query("insert into etfs(symbol) values ('DUP')")
 const result=await Promise.all([a.browser.post('/api/etf/watchlist',{symbol:'DUP'}),a.browser.post('/api/etf/watchlist',{symbol:'DUP'})]);expect(result.map(r=>r.status).sort()).toEqual([200,409])
})
