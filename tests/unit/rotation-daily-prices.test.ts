import {it,expect} from 'vitest';
import {parseDailyMarketPrices} from '../../apps/api/src/market-data/daily-prices';
import {createMarketData,MarketDataError} from '../../apps/api/src/market-data';
it('normalizes valid OHLC dates, keeps last duplicates and rejects invalid provider values',()=>{
 const row={date:new Date('2026-09-04T23:00:00Z'),open:100,high:110,low:90,close:101,volume:5e9};
 const result=parseDailyMarketPrices('SPY',[row,{...row,date:new Date('2026-08-30'),close:0.00000001},{...row,close:102},{...row,date:new Date('invalid')},{...row,date:new Date('2026-09-03'),close:null},{...row,date:new Date('2026-09-02'),volume:1e30},{...row,date:new Date('2026-09-01'),open:1e12},{...row,date:new Date('2026-08-31'),volume:null,adjclose:99}]);
 expect(result).toHaveLength(2);expect(result[0]).toMatchObject({date:'2026-08-31',volume:0n,adjustedClose:'99.000000'});expect(result[1]).toMatchObject({symbol:'SPY',date:'2026-09-04',close:'102.000000',adjustedClose:'102.000000',volume:5000000000n});
});
it('refreshes daily data through the shared provider and reports stale fallback',async()=>{
 let fail=false,calls=0;const market=createMarketData({now:()=>new Date('2026-09-05'),upstream:{quote:async()=>({}),chart:async(_symbol,options)=>{calls++;expect(options.interval).toBe('1d');if(fail)throw new MarketDataError('missing','not-found');return {quotes:[{date:new Date('2026-09-04'),open:100,high:110,low:90,close:101}]};}}});
 expect((await market.dailyPrices('spy')).source).toBe('upstream');expect((await market.dailyPrices('SPY')).source).toBe('upstream');expect(calls).toBe(2);fail=true;expect((await market.dailyPrices('SPY')).source).toBe('stale');
});
