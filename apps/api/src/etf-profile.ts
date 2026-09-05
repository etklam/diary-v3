import type { Hono } from 'hono'
import type { z } from 'zod'
import { marketSymbolSchema } from '@diary/contracts/market'
import { etfProfileQuerySchema,etfProfileSchema } from '@diary/contracts/etf-profile'
import { computeEtfRisk,computeEtfRelativeStrength } from '@diary/domain/etf-risk'
import { rangeStart,type createMarketData,type MarketRead } from './market-data/index.js'
import type { AppEnv } from './app.js'
export function registerEtfProfileRoutes(app:Hono<AppEnv>,dependencies:{market:ReturnType<typeof createMarketData>;now:()=>Date;validationError:(error:z.ZodError)=>never}) {
 const {market,now,validationError}=dependencies
 for(const part of ['profile','risk','valuation','rs'] as const)app.get(`/api/etf/:symbol/${part}`,async c=>{
  const symbol=marketSymbolSchema.safeParse(c.req.param('symbol')),query=etfProfileQuerySchema.safeParse(c.req.query())
  if(!symbol.success)return validationError(symbol.error);if(!query.success)return validationError(query.error)
  const {benchmark,period}=query.data
  const [quoted,daily,fund,bench]=await Promise.allSettled([market.quote(symbol.data),market.dailyResearch(symbol.data),market.fundValuation(symbol.data),market.dailyResearch(benchmark)])
  const get=<T>(result:PromiseSettledResult<MarketRead<T>>)=>result.status==='fulfilled'?result.value:null
  const quote=get(quoted),bars=get(daily),valuation=get(fund),benchmarkBars=get(bench)
  const today=now().toISOString().slice(0,10),targetBars=(bars?.data??[]).filter(row=>row.date<=today),comparisonBars=(benchmarkBars?.data??[]).filter(row=>row.date<=today)
  const risk=computeEtfRisk(targetBars),rs=computeEtfRelativeStrength(targetBars,comparisonBars,rangeStart(period==='1m'?'1mo':period==='3m'?'3mo':period==='6m'?'6mo':'1y',now()).toISOString().slice(0,10))
  const values=valuation?.data??{aum:null,expenseRatioPct:null,pe:null,pb:null,dividendYieldPct:null,currency:null}
  const sources:Record<string,{source:'yahoo';fetchedAt:string;isStale:boolean}>={}
  const mark=(prefix:string,fields:Record<string,unknown>,reads:({fetchedAt:string;source:string}|null)[])=>{
   const available=reads.filter(row=>row!==null);if(available.length!==reads.length)return
   for(const [field,value] of Object.entries(fields))if(value!==null&&field!=='observations'&&field!=='asOf')sources[`${prefix}.${field}`]={source:'yahoo',fetchedAt:available.map(row=>row.fetchedAt).sort()[0]!,isStale:available.some(row=>row.source==='stale')}
  }
  mark('quote',quote?.data??{},[quote]);mark('risk',risk,[bars]);mark('valuation',values,[valuation]);mark('rs',rs,[bars,benchmarkBars])
  // `currency` is descriptive metadata, not a metric. It must not make an
  // otherwise unavailable valuation domain look complete (or keep a complete
  // profile partial when all numeric metrics are present but currency is null).
  const metrics=[...Object.entries(risk).filter(([key])=>key!=='observations'&&key!=='asOf').map(([,value])=>value),...Object.entries(values).filter(([key])=>key!=='currency').map(([,value])=>value),rs.relativeReturnPct,quote?.data.regularMarketPrice??null]
  const asOf=[quote?.data.lastUpdateTime,risk.asOf?`${risk.asOf}T00:00:00.000Z`:null].filter((value):value is string=>!!value).sort()[0]??null
  const result=etfProfileSchema.parse({symbol:symbol.data,benchmark,period,quote:quote?.data??null,risk,valuation:values,rs,meta:{fetchedAt:now().toISOString(),asOf,isStale:[quote,bars,valuation,benchmarkBars].some(row=>row?.source==='stale'),status:metrics.every(value=>value===null)?'unavailable':metrics.some(value=>value===null)?'partial':'complete',sources}})
  c.header('Cache-Control','no-store')
  if(part==='profile')return c.json(result)
  const partMetrics=Object.entries(result[part]).filter(([key])=>!['observations','asOf','currency','trend','from','to'].includes(key)).map(([,value])=>value)
  const partSources=Object.fromEntries(Object.entries(sources).filter(([key])=>key.startsWith(`${part}.`)))
  const reads=part==='risk'?[bars]:part==='valuation'?[valuation]:[bars,benchmarkBars]
  const partAsOf=part==='risk'?risk.asOf:part==='rs'?rs.to:null
  return c.json({symbol:result.symbol,benchmark,period,[part]:result[part],meta:{...result.meta,asOf:partAsOf?`${partAsOf}T00:00:00.000Z`:null,isStale:reads.some(row=>row?.source==='stale'),status:partMetrics.every(value=>value===null)?'unavailable':partMetrics.some(value=>value===null)?'partial':'complete',sources:partSources}})
 })
}
