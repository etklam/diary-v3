import {and,eq,inArray} from 'drizzle-orm';
import {marketRotationSnapshots,type Database} from '@diary/db';
import type {RankScope,MarketState} from '@diary/domain/market-rotation/types';
import {buildMarketRotationMonitorPayload} from '@diary/domain/market-rotation/monitor';
import {buildNormalizedTrendSeries} from '@diary/domain/market-rotation/trend-series';
import {generateMarketSummary} from '@diary/domain/market-rotation/summary';
import {readPersistedMarketContext} from './market-context.js';
/** Snapshot-only reader. Market-state freshness is supplied by the persisted breadth reader. */
export async function readRotationMonitor(db:Database,scope:RankScope,asOf:string,marketStateOverride?:MarketState){
 return db.transaction(async tx=>{
  const context=await readPersistedMarketContext(tx,scope,asOf,marketStateOverride);
  if(!context)return null;
  const {selectedSnapshot}=context;
  const {rows,window}=selectedSnapshot;
  if(context.comparisonDate){
   const dates=window.qualifiedDatesDesc.filter(date=>date>=window.comparisonDate!).map(date=>date.toISOString().slice(0,10)).reverse();
   const history=await tx.select({symbol:marketRotationSnapshots.symbol,date:marketRotationSnapshots.date,adjustedClose:marketRotationSnapshots.adjustedClose,lastPrice:marketRotationSnapshots.lastPrice}).from(marketRotationSnapshots).where(and(eq(marketRotationSnapshots.rankScope,scope),inArray(marketRotationSnapshots.date,dates),inArray(marketRotationSnapshots.symbol,rows.map(row=>row.symbol))));
   const prices=new Map(history.map(row=>{const value=row.adjustedClose??row.lastPrice;return [`${row.symbol}:${row.date}`,value===null?null:Number(value)] as const;}));
   for(const row of rows)row.twoWeekTrend=buildNormalizedTrendSeries({symbol:row.symbol,qualifiedDates:dates,priceBySymbolDate:prices,comparisonDate:context.comparisonDate});
  }
  const payload=buildMarketRotationMonitorPayload({asOfDate:context.asOfDate,comparisonDate:context.comparisonDate,marketStateAsOfDate:context.marketStateAsOfDate,summaryAsOfDate:context.summaryAsOfDate,rankScope:scope,marketState:context.marketState,rows,summaryRows:context.sectorSnapshot.rows});
  return {payload:{...payload,betaAllocation:context.betaAllocation,currentMarketSummary:generateMarketSummary({marketState:context.marketState,breadthCondition:payload.breadthCondition,breadthConfirmation:payload.breadthConfirmation,topImproving:payload.topImproving,bottomWeakening:payload.bottomWeakening,above50dRatio:payload.summary.above50d.ratio,averageRsi:payload.summary.averageRsi,beta:context.betaAllocation})},marketState:context.marketState,betaAllocation:context.betaAllocation,lastUpdated:window.latestDate};
 },{isolationLevel:'repeatable read',accessMode:'read only'});
}
