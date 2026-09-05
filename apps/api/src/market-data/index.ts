import {parseDailyMarketPrices} from './daily-prices.js';
import { normalizeMarketSymbol, marketSymbolSchema, marketRangeSchema, marketQuoteSchema, marketHistoricalSchema, type MarketQuote, type MarketHistorical, type MarketRange } from '../../../../packages/contracts/src/market';
import { createYahooQueue, MarketDataError } from './queue';
import { getMarketDataCacheTtlSeconds } from './ttl';
export { MarketDataError } from './queue';
export { getMarketDataCacheTtlSeconds } from './ttl';

export type YahooUpstream = {
  summary?(symbol:string,signal:AbortSignal):Promise<unknown>;
  quote(symbol:string,signal:AbortSignal):Promise<unknown>;
  chart(symbol:string,options:{period1:Date;period2:Date;interval:'1d'|'5m'|'1mo';return:'array'},signal:AbortSignal):Promise<unknown>;
};
export type MonthlyQuote={timestamp:number;open:number;high:number;low:number;close:number;adjClose:number;volume:number|null};
export type IntradayQuote={timestamp:number;open:number|null;high:number|null;low:number|null;close:number;volume:number|null};
export type MarketRead<T> = { data:T; source:'upstream'|'cache'|'stale'; fetchedAt:string };
function object(value:unknown):Record<string,unknown> {
  return value !== null && typeof value==='object' ? value as Record<string,unknown> : {};
}
const finite = (value:unknown) => typeof value==='number'&&Number.isFinite(value)?value:null;
function instant(value:unknown) { return value instanceof Date&&Number.isFinite(value.getTime())?value.toISOString():null; }
function quoteData(raw:unknown,symbol:string):MarketQuote {
  const quote=object(raw);const price=finite(quote.regularMarketPrice);
  if(price===null)throw new MarketDataError('Yahoo quote unavailable','not-found');
  if(typeof quote.symbol!=='string'||normalizeMarketSymbol(quote.symbol)!==symbol)throw new MarketDataError('Yahoo returned an unexpected symbol');
  const previousClose=finite(quote.regularMarketPreviousClose);
  const change=previousClose===null?null:finite(price-previousClose);
  return marketQuoteSchema.parse({symbol,regularMarketPrice:price,previousClose,change,
    changePercent:previousClose===null||previousClose===0||change===null?null:finite(change/previousClose*100),
    currency:typeof quote.currency==='string'?quote.currency:null,
    marketState:typeof quote.marketState==='string'?quote.marketState:null,
    lastUpdateTime:instant(quote.regularMarketTime)});
}
function historicalData(raw:unknown):MarketHistorical {
  const quotes=object(raw).quotes;
  if(!Array.isArray(quotes)) throw new MarketDataError('Yahoo historical response malformed');
  return marketHistoricalSchema.parse(quotes.flatMap(raw=>{
    const quote=object(raw);const date=instant(quote.date);const close=finite(quote.close);
    return date===null||close===null?[]:[{timestamp:Math.floor(Date.parse(date)/1000),close}];
  }));
}

export function rangeStart(range:MarketRange,now:Date) {
  if(range==='max')return new Date('1970-01-01T00:00:00.000Z');
  const months={ '1mo':1,'3mo':3,'6mo':6,'1y':12,'5y':60 }[range];
  const date=new Date(now);const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-months);
  const end=new Date(date);end.setUTCMonth(end.getUTCMonth()+1,0);date.setUTCDate(Math.min(day,end.getUTCDate()));
  return date;
}

export function createMarketData(options:{upstream:YahooUpstream;now?:()=>Date;timeoutMs?:number}) {
  const now=options.now??(()=>new Date());const queue=createYahooQueue(options.timeoutMs);
  const cache=new Map<string,{data:unknown;fetchedAt:string;expiresAt:number}>();
  async function read<T>(key:string,kind:'quote'|'historical',fetcher:(signal:AbortSignal)=>Promise<T>,bypass=false,ttlSeconds?:number):Promise<MarketRead<T>> {
    const cached=cache.get(key);
    if(!bypass&&cached&&now().getTime()<cached.expiresAt)return {data:cached.data as T,source:'cache',fetchedAt:cached.fetchedAt};
    try {
      const data=await queue.run(key,fetcher);const at=now();
      // Keep stale entries until capacity eviction; unrelated writes must not erase fallback data.
      if(!cache.has(key)&&cache.size>=500){const oldest=cache.keys().next().value;if(oldest)cache.delete(oldest);}
      cache.set(key,{data,fetchedAt:at.toISOString(),expiresAt:at.getTime()+(ttlSeconds??getMarketDataCacheTtlSeconds(kind,at))*1000});
      return {data,source:'upstream',fetchedAt:at.toISOString()};
    } catch(error) {
      if(cached)return {data:cached.data as T,source:'stale',fetchedAt:cached.fetchedAt};
      throw error;
    }
  }
  function quote(input:string,bypass=false) {
    const symbol=marketSymbolSchema.parse(input);
    return read(`quote:${symbol}`,'quote',async signal=>quoteData(await options.upstream.quote(symbol,signal),symbol),bypass);
  }
  function historical(input:string,rangeInput:MarketRange='1y',bypass=false) {
    const symbol=marketSymbolSchema.parse(input);const range=marketRangeSchema.parse(rangeInput);
    return read(`historical:${symbol}:${range}`,'historical',async signal=>{
      const at=now();return historicalData(await options.upstream.chart(symbol,{period1:rangeStart(range,at),period2:at,interval:'1d',return:'array'},signal));
    },bypass);
  }
  function intraday(input:string):Promise<MarketRead<IntradayQuote[]>> {
    const symbol=marketSymbolSchema.parse(input);
    return read(`intraday:${symbol}:3:5m`,'historical',async signal=>{
      const at=now();
      const raw=object(await options.upstream.chart(symbol,{period1:new Date(at.getTime()-3*86400000),period2:at,interval:'5m',return:'array'},signal));
      if(!Array.isArray(raw.quotes))throw new MarketDataError('Yahoo intraday response malformed');
      return raw.quotes.flatMap(value=>{
        const bar=object(value);const date=instant(bar.date);const close=finite(bar.close);
        return !date||close===null?[]:[{timestamp:Math.floor(Date.parse(date)/1000),open:finite(bar.open),high:finite(bar.high),low:finite(bar.low),close,volume:finite(bar.volume)}];
      });
    },false,300);
  }
  function dailyPrices(input:string,rangeInput:MarketRange='1y') {
    const symbol=marketSymbolSchema.parse(input),range=marketRangeSchema.parse(rangeInput);
    return read(`daily-prices:${symbol}:${range}`,'historical',async signal=>{
      const at=now(),raw=object(await options.upstream.chart(symbol,{period1:rangeStart(range,at),period2:at,interval:'1d',return:'array'},signal));
      if(!Array.isArray(raw.quotes))throw new MarketDataError('Yahoo daily response malformed');
      const rows=parseDailyMarketPrices(symbol,raw.quotes);
      if(!rows.length)throw new MarketDataError('Yahoo daily prices unavailable','not-found');
      return rows;
    },true);
  }
  function dailyResearch(input:string):Promise<MarketRead<import('@diary/domain/etf-risk').EtfDailyBar[]>> {
    const symbol=marketSymbolSchema.parse(input);
    return read(`research-daily:${symbol}:5y`,'historical',async signal=>{
      const at=now(),raw=object(await options.upstream.chart(symbol,{period1:rangeStart('5y',at),period2:at,interval:'1d',return:'array'},signal));
      if(!Array.isArray(raw.quotes))throw new MarketDataError('Yahoo daily research response malformed');
      return raw.quotes.flatMap(value=>{
        const bar=object(value),date=instant(bar.date),close=finite(bar.close),volume=finite(bar.volume);
        return !date||close===null||close<=0?[]:[{date:date.slice(0,10),close,high:finite(bar.high),low:finite(bar.low),volume:volume!==null&&volume>=0&&Number.isSafeInteger(volume)?volume:null}];
      });
    },false,900);
  }
  function fundValuation(input:string) {
    const symbol=marketSymbolSchema.parse(input);
    return read(`fund-valuation:${symbol}`,'quote',async signal=>{
      if(!options.upstream.summary)throw new MarketDataError('Fund summary provider unavailable','not-found');
      const raw=object(await options.upstream.summary(symbol,signal)),detail=object(raw.summaryDetail),stats=object(raw.defaultKeyStatistics),fees=object(object(raw.fundProfile).feesExpensesInvestment);
      const pick=(...values:unknown[])=>{for(const value of values){const n=finite(value);if(n!==null&&n>=0)return n;}return null;};
      const expense=pick(fees.annualReportExpenseRatio,stats.annualReportExpenseRatio),yieldRatio=pick(detail.yield,detail.dividendYield,stats.yield);
      return {aum:pick(detail.totalAssets,stats.totalAssets),expenseRatioPct:expense===null?null:expense*100,pe:pick(detail.trailingPE),pb:pick(stats.priceToBook),dividendYieldPct:yieldRatio===null?null:yieldRatio*100,currency:typeof detail.currency==='string'?detail.currency:null};
    },false,900);
  }
  function monthly(input:string):Promise<MarketRead<MonthlyQuote[]>> {
    const symbol=marketSymbolSchema.parse(input);
    return read(`monthly:${symbol}:5y`,'historical',async signal=>{
      const at=now();const raw=object(await options.upstream.chart(symbol,{period1:rangeStart('5y',at),period2:at,interval:'1mo',return:'array'},signal));
      if(!Array.isArray(raw.quotes))throw new MarketDataError('Yahoo monthly response malformed');
      const byDate=new Map<string,MonthlyQuote>();
      for(const value of raw.quotes){
        const bar=object(value),date=instant(bar.date),close=finite(bar.close);
        if(close===null)continue;
        if(!date)throw new MarketDataError('Yahoo monthly date malformed');
        const volume=finite(bar.volume);
        if(volume!==null&&(!Number.isSafeInteger(volume)||volume<0))throw new MarketDataError('Yahoo monthly volume malformed');
        const row={timestamp:Math.floor(Date.parse(date)/1000),open:finite(bar.open)??close,high:finite(bar.high)??close,low:finite(bar.low)??close,close,adjClose:finite(bar.adjclose)??close,volume};
        if([row.open,row.high,row.low,row.close,row.adjClose].some(price=>price<0||Number(price.toFixed(4))>=1000000))throw new MarketDataError('Yahoo monthly price out of range');
        byDate.set(date.slice(0,10),row);
      }
      const rows=[...byDate.values()].sort((a,b)=>a.timestamp-b.timestamp);
      if(!rows.length)throw new MarketDataError('Yahoo monthly data unavailable');
      return rows;
    },true);
  }
  async function quotes(inputs:string[]) {
    const symbols=[...new Set(inputs.map(input=>marketSymbolSchema.parse(input)))];
    if(symbols.length>25)throw new RangeError('Quote batch supports at most 25 unique symbols');
    const result=new Map<string,MarketRead<MarketQuote>>();const errors:string[]=[];
    const remaining=[...symbols];
    await Promise.all(Array.from({length:Math.min(3,remaining.length)},async()=>{
      for(let symbol=remaining.shift();symbol;symbol=remaining.shift()){
        try {result.set(symbol,await quote(symbol));}catch{errors.push(symbol);}
      }
    }));
    return {quotes:result,errors};
  }
  return {quote,historical,intraday,monthly,dailyPrices,dailyResearch,fundValuation,quotes};
}

export { createYahooUpstream } from './yahoo';
