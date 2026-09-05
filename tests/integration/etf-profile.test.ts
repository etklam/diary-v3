import {beforeAll,afterAll,it,expect} from 'vitest'
import {createApp} from '../../apps/api/src/app'
import {createMarketData,MarketDataError} from '../../apps/api/src/market-data'
import {provisionTestDatabase} from '../support/database'
let database:Awaited<ReturnType<typeof provisionTestDatabase>>
beforeAll(async()=>{database=await provisionTestDatabase('etf_profile')});afterAll(async()=>{await database?.dispose()})
it('serves public partial research and stale field metadata while rejecting explicit invalid credentials',async()=>{
 let clock=new Date('2026-09-05T00:00:00Z'),fail=false
 const market=createMarketData({now:()=>clock,upstream:{quote:async symbol=>{if(symbol==='UNKNOWN')throw new MarketDataError('missing','not-found');return {symbol,regularMarketPrice:100}},chart:async symbol=>{if(fail||symbol==='UNKNOWN')throw new MarketDataError('missing','not-found');return {quotes:Array.from({length:260},(_,i)=>({date:new Date(Date.UTC(2025,11,i+1)),close:100+i*(symbol==='QQQ'?2:1),high:105+i,low:95+i,volume:100}))}},summary:async()=>{throw new MarketDataError('missing','not-found')}}})
 const app=createApp({db:database.db,now:()=>clock,marketData:market,config:{jwtSecret:'synthetic-review-key-with-at-least-32-characters',nodeEnv:'test',trustProxy:false,webOrigin:'http://localhost'}})
 let response=await app.request('/api/etf/SPY/profile?benchmark=QQQ&period=3m');expect(response.status).toBe(200);let data=await response.json();expect(data.meta.status).toBe('partial');expect(data.valuation.aum).toBeNull();expect(data.risk.volatility252d).not.toBeNull();expect(data.rs.relativeReturnPct).not.toBeNull();expect(data.meta.sources['risk.volatility252d'].source).toBe('yahoo')
 clock=new Date('2026-09-05T00:16:00Z');fail=true;response=await app.request('/api/etf/SPY/risk');data=await response.json();expect(data.meta.isStale).toBe(true);expect(data.meta.sources['risk.volatility252d'].isStale).toBe(true)
 expect((await app.request('/api/etf/SPY/profile?benchmark=BAD')).status).toBe(400)
 expect((await app.request('/api/etf/SPY/profile',{headers:{authorization:'Bearer invalid'}})).status).toBe(401)
 const unknown=await (await app.request('/api/etf/UNKNOWN/profile')).json();expect(unknown.meta.status).toBe('unavailable');expect(unknown.quote).toBeNull()
})
it('scopes domain status and provenance and excludes future observations',async()=>{
 const now=()=>new Date('2026-09-05T00:00:00Z')
 const market=createMarketData({now,upstream:{quote:async symbol=>({symbol,regularMarketPrice:100}),chart:async()=>({quotes:[...Array.from({length:260},(_,i)=>({date:new Date(Date.UTC(2025,11,i+1)),close:100,high:101,low:99,volume:100})),{date:new Date('2026-09-06'),close:999999,high:999999,low:999999,volume:999999}]}),summary:async()=>({})}})
 const app=createApp({db:database.db,now,marketData:market,config:{jwtSecret:'synthetic-review-key-with-at-least-32-characters',nodeEnv:'test',trustProxy:false,webOrigin:'http://localhost'}})
 const profile=await (await app.request('/api/etf/SPY/profile')).json()
 expect(profile.meta.status).toBe('partial');expect(profile.risk.observations).toBe(260);expect(profile.risk.high52w).toBe(101);expect(profile.risk.volatility20d).toBe(0)
 const risk=await (await app.request('/api/etf/SPY/risk')).json()
 expect(risk.meta.status).toBe('complete');expect(Object.keys(risk.meta.sources).every(key=>key.startsWith('risk.'))).toBe(true);expect(risk.quote).toBeUndefined()
 const valuation=await (await app.request('/api/etf/SPY/valuation')).json()
 expect(valuation.meta.status).toBe('unavailable');expect(valuation.meta.asOf).toBeNull();expect(valuation.meta.sources).toEqual({})
 const rs=await (await app.request('/api/etf/SPY/rs')).json()
 expect(rs.meta.status).toBe('complete');expect(rs.rs.relativeReturnPct).toBe(0);expect(rs.meta.asOf).toBe(`${rs.rs.to}T00:00:00.000Z`)
})

it('does not count valuation currency as a metric for profile status',async()=>{
 const clock=new Date('2026-09-05T00:00:00Z')
 const unavailableMarket=createMarketData({now:()=>clock,upstream:{
  quote:async()=>{throw new Error('quote unavailable')},
  chart:async()=>{throw new Error('history unavailable')},
  summary:async()=>({summaryDetail:{currency:'USD'}}),
 }})
 const unavailableApp=createApp({db:database.db,now:()=>clock,marketData:unavailableMarket,config:{jwtSecret:'synthetic-review-key-with-at-least-32-characters',nodeEnv:'test',trustProxy:false,webOrigin:'http://localhost'}})
 const currencyOnly=await (await unavailableApp.request('/api/etf/SPY/profile')).json()
 expect(currencyOnly.valuation).toMatchObject({currency:'USD'})
 expect(currencyOnly.meta.status).toBe('unavailable')

 const bars=Array.from({length:260},(_,i)=>({date:new Date(clock.getTime()-(259-i)*86400000),close:100+i/10,high:102+i/10,low:98+i/10,volume:100}))
 const completeMarket=createMarketData({now:()=>clock,upstream:{
  quote:async symbol=>({symbol,regularMarketPrice:125,regularMarketPreviousClose:124,currency:'USD'}),
  chart:async()=>({quotes:bars}),
  summary:async()=>({summaryDetail:{totalAssets:1000000,trailingPE:20,yield:0},defaultKeyStatistics:{priceToBook:2},fundProfile:{feesExpensesInvestment:{annualReportExpenseRatio:0.1}}}),
 }})
 const completeApp=createApp({db:database.db,now:()=>clock,marketData:completeMarket,config:{jwtSecret:'synthetic-review-key-with-at-least-32-characters',nodeEnv:'test',trustProxy:false,webOrigin:'http://localhost'}})
 const complete=await (await completeApp.request('/api/etf/SPY/profile?benchmark=QQQ&period=3m')).json()
 expect(complete.valuation.currency).toBeNull()
 expect(complete.meta.status).toBe('complete')
})
