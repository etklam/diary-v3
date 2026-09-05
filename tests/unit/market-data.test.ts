import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketData, createYahooUpstream, getMarketDataCacheTtlSeconds, MarketDataError, rangeStart, type YahooUpstream } from '../../apps/api/src/market-data';
import { createYahooQueue } from '../../apps/api/src/market-data/queue';
import { marketSymbolSchema } from '../../packages/contracts/src/market';

const now = new Date('2026-09-04T15:00:00Z');
const quote = (symbol='AAPL') => ({symbol,regularMarketPrice:110,regularMarketPreviousClose:100,currency:'USD',marketState:'REGULAR',regularMarketTime:now});
const upstream = (overrides:Partial<YahooUpstream>={}):YahooUpstream => ({quote:async symbol=>quote(symbol),chart:async()=>({quotes:[]}),...overrides});
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{resolve,promise};}
afterEach(()=>vi.useRealTimers());

describe('shared Yahoo provider boundary',()=>{
  it('normalizes aliases and shares in-flight requests and cached canonical output',async()=>{
    const pending=deferred<unknown>();const fetch=vi.fn<YahooUpstream['quote']>(()=>pending.promise);
    const market=createMarketData({upstream:upstream({quote:fetch}),now:()=>now});
    const reads=[market.quote(' spx '),market.quote('^gspc')];
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('^GSPC');
    pending.resolve(quote('^GSPC'));
    const [a,b]=await Promise.all(reads);
    expect(a?.data).toEqual({symbol:'^GSPC',regularMarketPrice:110,previousClose:100,change:10,changePercent:10,currency:'USD',marketState:'REGULAR',lastUpdateTime:now.toISOString()});
    expect(b?.data).toEqual(a?.data);
    expect((await market.quote('SPX')).source).toBe('cache');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves missing metadata as null instead of inventing a price change, USD, market state or timestamp',async()=>{
    const market=createMarketData({upstream:upstream({quote:async()=>({symbol:'AAPL',regularMarketPrice:0})}),now:()=>now});
    expect((await market.quote('AAPL')).data).toEqual({symbol:'AAPL',regularMarketPrice:0,previousClose:null,change:null,changePercent:null,currency:null,marketState:null,lastUpdateTime:null});
  });

  it('retains stale quote data when another cache write occurs and upstream later fails',async()=>{
    vi.useFakeTimers();let clock=now;let fail=false;
    const market=createMarketData({upstream:upstream({quote:async symbol=>{if(fail&&symbol==='AAPL')throw new MarketDataError('symbol not found','not-found');return quote(symbol);}}),now:()=>clock});
    await market.quote('AAPL');clock=new Date(now.getTime()+301000);
    await market.quote('MSFT');fail=true;
    const result=await market.quote('AAPL');
    expect(result.source).toBe('stale');expect(result.fetchedAt).toBe(now.toISOString());expect(result.data.regularMarketPrice).toBe(110);
  });

  it('bypasses fresh cache on request without erasing the fallback',async()=>{
    const fetch=vi.fn<YahooUpstream['quote']>(async symbol=>quote(symbol));const market=createMarketData({upstream:upstream({quote:fetch}),now:()=>now});
    await market.quote('AAPL');await market.quote('AAPL',true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('filters absent and nonfinite historical points while preserving timestamp seconds and valid zero',async()=>{
    const fetch=vi.fn<YahooUpstream['chart']>(async()=>({quotes:[{date:now,close:0},{date:new Date('invalid'),close:5},{date:now,close:NaN},{date:now,close:null},{date:new Date('2026-09-03T15:00:00Z'),close:12.25}]}));
    const market=createMarketData({upstream:upstream({chart:fetch}),now:()=>now});
    expect((await market.historical('aapl','1mo')).data).toEqual([{timestamp:1788534000,close:0},{timestamp:1788447600,close:12.25}]);
    expect(fetch.mock.calls[0]?.[1]).toEqual({period1:new Date('2026-08-04T15:00:00Z'),period2:now,interval:'1d',return:'array'});
  });

  it('returns a partial batch without throwing successful symbols away and bounds unique inputs',async()=>{
    const market=createMarketData({upstream:upstream({quote:async symbol=>{if(symbol==='BAD')throw new MarketDataError('not found','not-found');return quote(symbol);}})});
    const result=await market.quotes(['aapl','AAPL','BAD','SPX','^GSPC']);
    expect([...result.quotes.keys()]).toEqual(['AAPL','^GSPC']);expect(result.errors).toEqual(['BAD']);
    await expect(market.quotes(Array.from({length:26},(_,index)=>`A${index}`))).rejects.toThrow('25');
  });

  it('bounds the retained cache at 500 entries',async()=>{
    const fetch=vi.fn<YahooUpstream['quote']>(async symbol=>quote(symbol));const market=createMarketData({upstream:upstream({quote:fetch}),now:()=>now});
    for(let index=0;index<=500;index++)await market.quote(`A${index}`);
    await market.quote('A0');expect(fetch).toHaveBeenCalledTimes(502);
  });

  it('validates symbols before upstream and clamps range starts in UTC at month ends',()=>{
    expect(marketSymbolSchema.parse(' dji ')).toBe('^DJI');
    expect(()=>marketSymbolSchema.parse('../private')).toThrow();
    expect(rangeStart('1mo',new Date('2028-03-31T10:00:00Z')).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(rangeStart('max',now).toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('Yahoo queue limits and recovery',()=>{
  it('allows only two upstream calls even across different consumer keys',async()=>{
    const queue=createYahooQueue();const held=Array.from({length:4},()=>deferred<number>());let active=0;let peak=0;
    const requests=held.map((item,index)=>queue.run(String(index),async()=>{active++;peak=Math.max(peak,active);const value=await item.promise;active--;return value;}));
    expect(active).toBe(2);held[0]!.resolve(0);held[1]!.resolve(1);await Promise.all(requests.slice(0,2));
    held[2]!.resolve(2);held[3]!.resolve(3);expect(await Promise.all(requests)).toEqual([0,1,2,3]);expect(peak).toBe(2);
  });

  it('bounds pending work instead of accepting an unbounded queue',async()=>{
    const queue=createYahooQueue();const gate=deferred<number>();
    const pending=Array.from({length:258},(_,index)=>queue.run(String(index),()=>gate.promise));
    await expect(queue.run('overflow',async()=>0)).rejects.toThrow('queue is full');
    gate.resolve(1);expect(await Promise.all(pending)).toHaveLength(258);
  });

  it('retries 429 twice with the existing 500/1500ms backoff then permits a new request',async()=>{
    vi.useFakeTimers();const queue=createYahooQueue();const fetch=vi.fn().mockRejectedValue(new MarketDataError('429','rate-limited'));
    const pending=queue.run('quote:AAPL',fetch);const rejected=expect(pending).rejects.toThrow('429');
    await vi.advanceTimersByTimeAsync(499);expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500);await rejected;expect(fetch).toHaveBeenCalledTimes(3);
    await expect(queue.run('quote:AAPL',async()=>1)).resolves.toBe(1);
  });

  it('does not retry unknown symbols',async()=>{
    const fetch=vi.fn().mockRejectedValue(new MarketDataError('not found','not-found'));
    await expect(createYahooQueue().run('missing',fetch)).rejects.toThrow('not found');expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts timed-out calls, bounds retries, and releases queue capacity',async()=>{
    vi.useFakeTimers();const signals:AbortSignal[]=[];const queue=createYahooQueue(100);
    const pending=queue.run('timeout',signal=>{signals.push(signal);return new Promise(()=>{});});
    const rejected=expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(2300);await rejected;
    expect(signals).toHaveLength(3);expect(signals.every(signal=>signal.aborted)).toBe(true);
    await expect(queue.run('healthy',async()=>1)).resolves.toBe(1);
  });
});

describe('installed Yahoo SDK transport with controlled HTTP fixtures',()=>{
  it('propagates each deadline abort through the installed SDK into a stalled crumb fetch',async()=>{
    vi.useFakeTimers();let aborted=0;let requests=0;
    const transport:typeof fetch=async(input,init)=>{
      const request=new Request(input,init);requests++;
      return new Promise<Response>((_,reject)=>{
        const abort=()=>{aborted++;reject(request.signal.reason);};
        if(request.signal.aborted)abort();else request.signal.addEventListener('abort',abort,{once:true});
      });
    };
    const market=createMarketData({upstream:createYahooUpstream(transport),timeoutMs:100});
    const result=market.quote('AAPL');const rejected=expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(2300);await rejected;
    expect(requests).toBe(3);expect(aborted).toBe(3);
  });

  it('uses only the injected fetch for cookies, crumb and an unknown-symbol quote, forwarding cancellation',async()=>{
    const urls:string[]=[];const signals:Array<AbortSignal|null|undefined>=[];
    const transport:typeof fetch=async(input,init)=>{
      const request=new Request(input,init);const url=new URL(request.url);urls.push(url.pathname);signals.push(request.signal);
      if(url.hostname==='finance.yahoo.com')return new Response('',{headers:{'set-cookie':'A3=synthetic; Domain=.yahoo.com; Path=/; Max-Age=3600'}});
      if(url.pathname==='/v1/test/getcrumb')return new Response('synthetic-crumb');
      if(url.pathname==='/v7/finance/quote')return Response.json({quoteResponse:{result:[],error:null}});
      throw new Error(`Unexpected fixture request ${url.pathname}`);
    };
    const market=createMarketData({upstream:createYahooUpstream(transport)});
    await expect(market.quote('UNKNOWN')).rejects.toThrow();
    expect(urls).toEqual(['/quote/AAPL','/v1/test/getcrumb','/v7/finance/quote']);
    expect(signals.every(signal=>signal instanceof AbortSignal)).toBe(true);
  });
});

describe('frozen NYSE cache TTL policy',()=>{
  it('uses five minutes in regular hours in both standard and daylight time',()=>{
    expect(getMarketDataCacheTtlSeconds('quote',new Date('2026-01-05T15:00:00Z'))).toBe(300);
    expect(getMarketDataCacheTtlSeconds('quote',new Date('2026-07-06T14:00:00Z'))).toBe(300);
  });
  it('refreshes historical prices at 16:30 New York and caps weekends at 24 hours',()=>{
    expect(getMarketDataCacheTtlSeconds('historical',new Date('2026-07-06T20:00:00Z'))).toBe(1800);
    expect(getMarketDataCacheTtlSeconds('quote',new Date('2026-07-04T14:00:00Z'))).toBe(86400);
  });
});
