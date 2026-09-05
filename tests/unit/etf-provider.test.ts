import { expect,it,vi } from 'vitest'
import { createMarketData,MarketDataError } from '../../apps/api/src/market-data'
it('keeps missing daily fields unknown and maps summary ratios without zero fallback',async()=>{
 const market=createMarketData({upstream:{quote:async()=>({}),chart:async()=>({quotes:[{date:new Date('2026-01-01Z'),close:100,high:102,low:98,volume:5000000000},{date:new Date('2026-01-02Z'),close:101},{date:new Date('2026-01-03Z'),close:null}]}),summary:async()=>({summaryDetail:{totalAssets:1000000000,yield:0.02,trailingPE:20,currency:'USD'},defaultKeyStatistics:{priceToBook:3},fundProfile:{feesExpensesInvestment:{annualReportExpenseRatio:0}}})}});
 const bars=(await market.dailyResearch('SPY')).data;expect(bars).toHaveLength(2);expect(bars[1]).toMatchObject({high:null,low:null,volume:null});expect(bars[0]!.volume).toBe(5000000000);
 expect((await market.fundValuation('SPY')).data).toEqual({aum:1000000000,expenseRatioPct:0,pe:20,pb:3,dividendYieldPct:2,currency:'USD'});
})
it('caches fund data for 15 minutes and exposes stale fallback after failure',async()=>{
 let clock=new Date('2026-01-01T00:00:00Z'),fail=false;
 const summary=vi.fn(async()=>{if(fail)throw new MarketDataError('synthetic missing','not-found');return {summaryDetail:{totalAssets:123}};});
 const market=createMarketData({now:()=>clock,upstream:{quote:async()=>({}),chart:async()=>({quotes:[]}),summary}});
 expect((await market.fundValuation('SPY')).source).toBe('upstream');clock=new Date('2026-01-01T00:14:59Z');expect((await market.fundValuation('SPY')).source).toBe('cache');expect(summary).toHaveBeenCalledTimes(1);
 clock=new Date('2026-01-01T00:15:00Z');fail=true;expect((await market.fundValuation('SPY')).source).toBe('stale');
 const missing=createMarketData({upstream:{quote:async()=>({}),chart:async()=>({quotes:[]}),summary:async()=>({})}});expect((await missing.fundValuation('QQQ')).data).toEqual({aum:null,expenseRatioPct:null,pe:null,pb:null,dividendYieldPct:null,currency:null});
})
