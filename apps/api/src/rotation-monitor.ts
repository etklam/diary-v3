import {and,eq,inArray} from 'drizzle-orm';
import {marketRotationSnapshots,type Database} from '@diary/db';
import {getUniverseForScope} from '@diary/domain/market-rotation/universe';
import type {RankScope,MarketState} from '@diary/domain/market-rotation/types';
import {buildMarketRotationMonitorPayload,type MarketRotationMonitorRow} from '@diary/domain/market-rotation/monitor';
import {buildNormalizedTrendSeries} from '@diary/domain/market-rotation/trend-series';
import {generateMarketSummary} from '@diary/domain/market-rotation/summary';
import {decideBetaAllocation} from '@diary/domain/beta-allocation';
import {readRotationWindow} from './rotation-queries.js';
import {getLatestBreadthSnapshot} from './market-state-queries.js';
/** Snapshot-only reader. Market-state freshness is supplied by the persisted breadth reader. */
export async function readRotationMonitor(db:Database,scope:RankScope,asOf:string,marketStateOverride?:MarketState){
 return db.transaction(async tx=>{
  const marketStateSnapshot=marketStateOverride===undefined?await getLatestBreadthSnapshot(tx,'SP500_NDX',asOf):null;
  const marketState=marketStateOverride??marketStateSnapshot?.marketState??'unknown';
  async function readScope(selected:RankScope){
   const universe=getUniverseForScope(selected),window=await readRotationWindow(tx,selected,asOf),date=window.latestDate?.toISOString().slice(0,10);
   if(!date)return {rows:[] as MarketRotationMonitorRow[],window};
   const symbols=universe.map(row=>row.symbol),names=new Map(universe.map(row=>[row.symbol,row]));
   const stored=await tx.select().from(marketRotationSnapshots).where(and(eq(marketRotationSnapshots.rankScope,selected),eq(marketRotationSnapshots.date,date),inArray(marketRotationSnapshots.symbol,symbols)));
   const number=(value:string|null)=>value===null?null:Number(value);
   const rows:MarketRotationMonitorRow[]=stored.map(row=>({symbol:row.symbol,name:names.get(row.symbol)!.name,groupType:names.get(row.symbol)!.groupType,sectorName:row.sectorName,lastPrice:number(row.lastPrice),rsi14:number(row.rsi14),above20d:row.above20d,above50d:row.above50d,maStatus:(row.maStatus??'unknown') as MarketRotationMonitorRow['maStatus'],percentFromHigh:number(row.percentFromHigh),rotationScore:number(row.rotationScore),rotationScoreDelta2W:number(row.rotationScoreDelta2W),rotationRank:row.rotationRank,rankDelta2W:row.rankDelta2W,rsiDelta2W:number(row.rsiDelta2W),twoWeekPerformancePct:number(row.twoWeekPerformancePct),twoWeekTrend:[],signal:row.signal as MarketRotationMonitorRow['signal'],signalStatus:row.signalStatus as MarketRotationMonitorRow['signalStatus']}));
   return {rows,window};
  }
  const {rows,window}=await readScope(scope);if(!window.latestDate||!rows.length)return null;
  const sectorSummary=scope==='sectors'?{rows,window}:await readScope('sectors');
  const summaryRows=sectorSummary.rows;
  const summaryAsOfDate=sectorSummary.window.latestDate?.toISOString().slice(0,10)??null;
  const comparisonDate=window.comparisonDate?.toISOString().slice(0,10)??null;
  if(comparisonDate){
   const dates=window.qualifiedDatesDesc.filter(date=>date>=window.comparisonDate!).map(date=>date.toISOString().slice(0,10)).reverse();
   const history=await tx.select({symbol:marketRotationSnapshots.symbol,date:marketRotationSnapshots.date,adjustedClose:marketRotationSnapshots.adjustedClose,lastPrice:marketRotationSnapshots.lastPrice}).from(marketRotationSnapshots).where(and(eq(marketRotationSnapshots.rankScope,scope),inArray(marketRotationSnapshots.date,dates),inArray(marketRotationSnapshots.symbol,rows.map(row=>row.symbol))));
   const prices=new Map(history.map(row=>{const value=row.adjustedClose??row.lastPrice;return [`${row.symbol}:${row.date}`,value===null?null:Number(value)] as const;}));
   for(const row of rows)row.twoWeekTrend=buildNormalizedTrendSeries({symbol:row.symbol,qualifiedDates:dates,priceBySymbolDate:prices,comparisonDate});
  }
  const payload=buildMarketRotationMonitorPayload({asOfDate:window.latestDate.toISOString().slice(0,10),comparisonDate,marketStateAsOfDate:marketStateSnapshot?.date??null,summaryAsOfDate,rankScope:scope,marketState,rows,summaryRows});
  const betaAllocation=decideBetaAllocation({marketState,breadthConfirmation:payload.summary.breadthConfirmation,above50dRatio:payload.summary.above50d.ratio,averageRsi:payload.summary.averageRsi,leadership:{topImproving:payload.topImproving.map(row=>row.sectorName??row.symbol),bottomWeakening:payload.bottomWeakening.map(row=>row.sectorName??row.symbol)}});
  return {payload:{...payload,betaAllocation,currentMarketSummary:generateMarketSummary({marketState,breadthCondition:payload.breadthCondition,breadthConfirmation:payload.breadthConfirmation,topImproving:payload.topImproving,bottomWeakening:payload.bottomWeakening,above50dRatio:payload.summary.above50d.ratio,averageRsi:payload.summary.averageRsi,beta:betaAllocation})},marketState,betaAllocation,lastUpdated:window.latestDate};
 },{isolationLevel:'repeatable read',accessMode:'read only'});
}
