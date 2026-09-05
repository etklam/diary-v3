import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app';
import { createMarketData, MarketDataError } from '../../apps/api/src/market-data';
import { provisionTestDatabase } from '../support/database';
import { BrowserSession } from '../support/browser-session';

let database:Awaited<ReturnType<typeof provisionTestDatabase>>;
let server:ReturnType<typeof serve>;
let baseUrl:string;
let clock:Date;
let failQuote:boolean;
let emptyIntraday:boolean;
const quote=vi.fn(async(symbol:string)=>{
  if(failQuote||symbol==='UNKNOWN')throw new MarketDataError('Synthetic unknown symbol','not-found');
  return {symbol,regularMarketPrice:110,regularMarketPreviousClose:100,currency:'USD',marketState:'REGULAR',regularMarketTime:clock};
});
const chart=vi.fn(async(_symbol:string,options:{interval:string})=>({quotes:options.interval==='5m'?(emptyIntraday?[]:[{date:new Date('2026-09-04T13:30:00Z'),open:99.4,high:110,low:99,close:110}]):[{date:new Date('2026-09-03T15:00:00Z'),close:109},{date:new Date('2026-09-04T15:00:00Z'),close:null}]}));
beforeAll(async()=>{database=await provisionTestDatabase('diary_v3_market');});
beforeEach(async()=>{
  clock=new Date('2026-09-04T15:00:00Z');failQuote=false;emptyIntraday=false;quote.mockClear();chart.mockClear();
  const marketData=createMarketData({upstream:{quote,chart},now:()=>clock});
  const app=createApp({db:database.db,marketData,now:()=>clock,config:{
    jwtSecret:'market-test-secret-with-at-least-32-characters',nodeEnv:'test',trustProxy:false,webOrigin:'http://127.0.0.1',
  }});
  server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0});
  await once(server,'listening');baseUrl=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async()=>{server.close();await once(server,'close');});
afterAll(async()=>{await database?.dispose();});

describe('public market HTTP routes with controlled upstream and PostgreSQL auth',()=>{
  it('serves canonical guest quote/historical bodies and shared cache freshness metadata',async()=>{
    const first=await fetch(`${baseUrl}/api/market/quote/spx`);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-market-data-source')).toBe('upstream');
    expect(first.headers.get('x-market-data-fetched-at')).toBe(clock.toISOString());
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(await first.json()).toEqual({symbol:'^GSPC',regularMarketPrice:110,previousClose:100,change:10,changePercent:10,currency:'USD',marketState:'REGULAR',lastUpdateTime:clock.toISOString()});
    const cached=await fetch(`${baseUrl}/api/market/quote/%5EGSPC`);
    expect(cached.headers.get('x-market-data-source')).toBe('cache');expect(quote).toHaveBeenCalledTimes(1);
    const historical=await fetch(`${baseUrl}/api/market/historical?symbol=AAPL&range=1mo`);
    expect(historical.status).toBe(200);expect(await historical.json()).toEqual([{timestamp:1788447600,close:109}]);
    expect(chart).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid explicit credentials on public routes even beside valid browser cookies',async()=>{
    const browser=new BrowserSession(baseUrl);
    const credentials={email:`${randomUUID()}@example.test`,password:'synthetic-market-password'};
    expect((await browser.post('/api/auth/register',credentials)).status).toBe(200);
    expect((await browser.post('/api/auth/login',credentials)).status).toBe(200);
    for(const headers of [new Headers({authorization:'Bearer invalid'}),new Headers({'x-api-key':'invalid'})]){
      const response=await browser.request('/api/market/quote/AAPL',{headers});
      expect(response.status).toBe(401);expect((await response.json()).data.code).toBe('AUTH_TOKEN_INVALID');
    }
    expect(quote).not.toHaveBeenCalled();
    expect((await browser.request('/api/market/quote/AAPL')).status).toBe(200);
  });

  it('shares the 60-per-minute IP limit across quote and historical reads and ignores untrusted forwarded IPs',async()=>{
    for(let index=0;index<60;index++){
      const path=index%2?'/api/market/quote/AAPL':'/api/market/historical?symbol=AAPL';
      expect((await fetch(baseUrl+path,{headers:{'x-forwarded-for':`203.0.113.${index}`}})).status).toBe(200);
    }
    const limited=await fetch(`${baseUrl}/api/market/quote/AAPL`);
    expect(limited.status).toBe(429);expect((await limited.json()).data.code).toBe('AUTH_RATE_LIMITED');
    expect(quote).toHaveBeenCalledTimes(1);expect(chart).toHaveBeenCalledTimes(1);
    clock=new Date(clock.getTime()+60_001);
    expect((await fetch(`${baseUrl}/api/market/quote/AAPL`)).status).toBe(200);
  });

  it('validates symbols/ranges and sanitizes provider errors into the existing envelope',async()=>{
    for(const path of ['/api/market/historical','/api/market/historical?symbol=AAPL&range=invalid','/api/market/quote/bad%20symbol']){
      const response=await fetch(baseUrl+path);expect(response.status).toBe(400);
      expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR');
    }
    expect(quote).not.toHaveBeenCalled();expect(chart).not.toHaveBeenCalled();
    const unavailable=await fetch(`${baseUrl}/api/market/quote/UNKNOWN`);
    expect(unavailable.status).toBe(502);
    const error=await unavailable.json();expect(error.data.code).toBe('SYS_EXTERNAL_SERVICE_ERROR');
    expect(error.data.requestId).toBe(unavailable.headers.get('x-request-id'));
    expect(JSON.stringify(error)).not.toContain('Synthetic');
  });

  it('honors bypass and reports stale fallback without inventing a new data timestamp',async()=>{
    const first=await fetch(`${baseUrl}/api/market/quote/AAPL`);const original=await first.json();
    expect((await fetch(`${baseUrl}/api/market/quote/AAPL?nocache=1`)).headers.get('x-market-data-source')).toBe('upstream');
    expect(quote).toHaveBeenCalledTimes(2);
    clock=new Date(clock.getTime()+301000);failQuote=true;
    const stale=await fetch(`${baseUrl}/api/market/quote/AAPL`);
    expect(stale.status).toBe(200);expect(stale.headers.get('x-market-data-source')).toBe('stale');
    expect(stale.headers.get('x-market-data-fetched-at')).toBe('2026-09-04T15:00:00.000Z');
    expect(await stale.json()).toEqual(original);
  });
});


it('requires login for SPX and returns the full provider-backed session with fixed intraday cache',async()=>{
  expect((await fetch(`${baseUrl}/api/market/spx-session`)).status).toBe(401);
  expect(quote).not.toHaveBeenCalled();expect(chart).not.toHaveBeenCalled();
  const browser=new BrowserSession(baseUrl);
  const credentials={email:`${randomUUID()}@example.test`,password:'synthetic-spx-password'};
  await browser.post('/api/auth/register',credentials);await browser.post('/api/auth/login',credentials);
  const response=await browser.request('/api/market/spx-session');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({symbol:'SPX',sourceSymbol:'^GSPC',condition:'gapDownRecovery',price:110,previousClose:100,open:99.4,high:110,low:99,change:10,changePercent:10,asOf:'2026-09-04T13:30:00.000Z'});
  expect(chart.mock.calls[0]?.[1]).toMatchObject({interval:'5m',period1:new Date('2026-09-01T15:00:00Z'),period2:clock});
  expect((await browser.request('/api/market/spx-session')).headers.get('x-market-data-source')).toBe('cache');
  expect(chart).toHaveBeenCalledTimes(1);
  clock=new Date(clock.getTime()+300_001);
  expect((await browser.request('/api/market/spx-session')).status).toBe(200);
  expect(chart).toHaveBeenCalledTimes(2);
});

it('reports SPX unavailable instead of inventing a condition when intraday bars are absent',async()=>{
  emptyIntraday=true;
  const browser=new BrowserSession(baseUrl);
  const credentials={email:`${randomUUID()}@example.test`,password:'synthetic-spx-password'};
  await browser.post('/api/auth/register',credentials);await browser.post('/api/auth/login',credentials);
  const response=await browser.request('/api/market/spx-session');
  expect(response.status).toBe(502);
  expect((await response.json()).data.code).toBe('SYS_EXTERNAL_SERVICE_ERROR');
});
