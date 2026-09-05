import type { Context, Hono } from 'hono';
import type { z } from 'zod';
import type { ErrorCode } from '@diary/contracts';
import { marketHistoricalQuerySchema, marketQuoteQuerySchema, marketSymbolSchema, spxSessionSummarySchema } from '../../../packages/contracts/src/market';
import type { AppEnv } from './app';
import type { createMarketData, MarketRead } from './market-data';
import { buildSpxSessionSummary } from './market-data/session';

type MarketRouteDependencies = {
  market: ReturnType<typeof createMarketData>;
  now:()=>Date;
  consume:(key:string,points:number,timestamp:number)=>void;
  clientIp:(context:Context<AppEnv>)=>string;
  fail:(status:number,code:ErrorCode,message:string)=>never;
  validationError:(error:z.ZodError)=>never;
};

/** Register after the shared credential resolver: public reads still reject invalid explicit credentials. */
export function registerMarketRoutes(app:Hono<AppEnv>,dependencies:MarketRouteDependencies) {
  const {market,now,consume,clientIp,fail,validationError}=dependencies;
  function parse<T>(schema:z.ZodType<T>,input:unknown):T {
    const result=schema.safeParse(input);
    if(!result.success)return validationError(result.error);
    return result.data;
  }
  function limit(context:Context<AppEnv>) {
    context.header('cache-control','no-store');
    consume(`market:ip:${clientIp(context)}`,60,now().getTime());
  }
  function metadata(context:Context<AppEnv>,result:MarketRead<unknown>) {
    context.header('x-market-data-source',result.source);
    context.header('x-market-data-fetched-at',result.fetchedAt);
  }
  app.get('/api/market/quote/:symbol',async context=>{
    const symbol=parse(marketSymbolSchema,context.req.param('symbol'));
    const query=parse(marketQuoteQuerySchema,context.req.query());
    limit(context);
    try {
      const result=await market.quote(symbol,query.nocache==='1'||query.nocache==='true');
      metadata(context,result);
      return context.json(result.data);
    } catch {
      return fail(502,'SYS_EXTERNAL_SERVICE_ERROR','Quote unavailable. Please try again later.');
    }
  });
  app.get('/api/market/historical',async context=>{
    const query=parse(marketHistoricalQuerySchema,context.req.query());
    limit(context);
    try {
      const result=await market.historical(query.symbol,query.range,query.nocache==='1'||query.nocache==='true');
      metadata(context,result);
      return context.json(result.data);
    } catch {
      return fail(502,'SYS_EXTERNAL_SERVICE_ERROR','Historical data unavailable. Please try again later.');
    }
  });
  app.get('/api/market/spx-session',async context=>{
    if(!context.get('user'))return fail(401,'AUTH_UNAUTHORIZED','Authentication required');
    limit(context);
    try {
      const [quote,intraday]=await Promise.all([market.quote('SPX'),market.intraday('SPX')]);
      const summary=spxSessionSummarySchema.parse(buildSpxSessionSummary(quote.data,intraday.data));
      const source=quote.source==='stale'||intraday.source==='stale'?'stale':quote.source==='upstream'||intraday.source==='upstream'?'upstream':'cache';
      metadata(context,{data:summary,source,fetchedAt:quote.fetchedAt<intraday.fetchedAt?quote.fetchedAt:intraday.fetchedAt});
      return context.json(summary);
    } catch {
      return fail(502,'SYS_EXTERNAL_SERVICE_ERROR','SPX session unavailable. Please try again later.');
    }
  });
}
