import { describe, expect, it } from 'vitest';
import { buildSpxSessionSummary, classifyMarketSession } from '../../apps/api/src/market-data/session';
import type { IntradayQuote } from '../../apps/api/src/market-data';
import type { MarketQuote } from '../../packages/contracts/src/market';

const quote:MarketQuote={symbol:'^GSPC',regularMarketPrice:5008,previousClose:5000,change:8,changePercent:0.16,currency:'USD',marketState:'CLOSED',lastUpdateTime:'2026-04-24T20:00:00.000Z'};
const bar=(date:string,open:number,close:number,high=close,low=open):IntradayQuote=>({timestamp:Date.parse(date)/1000,open,close,high,low,volume:null});

describe('frozen SPX session classification and trustworthy session selection',()=>{
  it.each([
    [99.4,100.2,'gapDownRecovery'],[99.4,98.9,'gapDownAndGo'],
    [100.6,101.1,'gapUpAndGo'],[100.6,99.9,'gapUpFade'],
    [100,101.2,'strongUp'],[100,100.25,'slightUp'],[100,99.75,'slightDown'],[100,98.8,'strongDown'],
    [100,100.249,'rangeBound'],[100,99.751,'rangeBound'],
  ] as const)('preserves open %s / close %s classification %s',(open,close,condition)=>{
    expect(classifyMarketSession({previousClose:100,open,close})).toBe(condition);
  });
  it('retains inclusive 0.35% gap and intraday thresholds',()=>{
    expect(classifyMarketSession({previousClose:10000,open:9965,close:10000})).toBe('gapDownRecovery');
    expect(classifyMarketSession({previousClose:10000,open:9965.01,close:10000})).toBe('rangeBound');
    expect(classifyMarketSession({previousClose:10100,open:10000,close:10035})).toBe('gapDownRecovery');
    expect(classifyMarketSession({previousClose:10100,open:10000,close:10034.99})).toBe('slightDown');
  });
  it('preserves intraday recovery, fade, and choppy priority',()=>{
    expect(classifyMarketSession({previousClose:100,open:100,close:100.3,low:99.6})).toBe('gapDownRecovery');
    expect(classifyMarketSession({previousClose:100,open:100,close:99.7,high:100.4})).toBe('gapUpFade');
    expect(classifyMarketSession({previousClose:100,open:100,close:100,high:100.7,low:99.4})).toBe('choppySession');
  });
  it('uses sorted latest session bars and preserves frozen calculation without rounding',()=>{
    const summary=buildSpxSessionSummary(quote,[bar('2026-04-24T20:00:00Z',5000,5008,5010,4990),bar('2026-04-23T13:30:00Z',4990,4992,4995,4985),bar('2026-04-24T13:30:00Z',4975,4980,4985,4970)]);
    expect(summary).toEqual({symbol:'SPX',sourceSymbol:'^GSPC',condition:'gapDownRecovery',price:5008,previousClose:5000,open:4975,high:5010,low:4970,change:8,changePercent:.16,intradayMovePercent:33/4975*100,openGapPercent:-.5,asOf:'2026-04-24T20:00:00.000Z'});
  });
  it('compares New York session days across UTC midnight without using today (weekends remain available)',()=>{
    const result=buildSpxSessionSummary({...quote,lastUpdateTime:'2026-04-25T00:30:00Z'},[bar('2026-04-24T23:55:00Z',5000,5008)]);
    expect(result.asOf).toBe('2026-04-24T23:55:00.000Z');
  });
  it('does not classify an absent intraday session or mix different market dates',()=>{
    expect(()=>buildSpxSessionSummary(quote,[])).toThrow('intraday session unavailable');
    expect(()=>buildSpxSessionSummary(quote,[bar('2026-04-23T20:00:00Z',5000,5008)])).toThrow('different sessions');
    expect(()=>buildSpxSessionSummary({...quote,previousClose:null},[bar('2026-04-24T20:00:00Z',5000,5008)])).toThrow('prior close');
    expect(()=>buildSpxSessionSummary({...quote,lastUpdateTime:null},[bar('2026-04-24T20:00:00Z',5000,5008)])).toThrow('timestamp');
  });
});
