import {and,desc,eq,inArray,lte,sql} from 'drizzle-orm';
import type {Pool} from 'pg';
import {marketDailyPrices,marketRotationSnapshots,marketRotationSnapshotRuns,type Database} from '@diary/db';
import {getUniverseForScope} from '@diary/domain/market-rotation/universe';
import type {RankScope} from '@diary/domain/market-rotation/types';
import {runSnapshotPipeline,type SymbolPrices} from '@diary/domain/market-rotation/pipeline';
import {pickLatestQualifiedCandidate} from '@diary/domain/market-rotation/qualified-date';
import type {EnrichedSnapshotInput} from '../../../packages/domain/src/market-rotation/comparison-enrichment.js';
import type {createMarketData} from './market-data/index.js';
import {persistRotationPrices} from './rotation-prices.js';
import {persistRotationSnapshots} from './rotation-snapshots.js';
import {readRotationWindow} from './rotation-queries.js';
export class RotationBatchBusy extends Error {constructor(){super('This rotation scope is already updating');}}
export function completedRotationDate(now:Date){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const part=(key:string)=>parts.find(row=>row.type===key)!.value;
 const today=`${part('year')}-${part('month')}-${part('day')}`,closed=Number(part('hour'))>=16;
 return (date:string)=>{const weekday=new Date(`${date}T00:00:00Z`).getUTCDay();return weekday!==0&&weekday!==6&&(date<today||(date===today&&closed));};
}
export async function runRotationBatch(dependencies:{db:Database;pool:Pick<Pool,'connect'>;market:Pick<ReturnType<typeof createMarketData>,'dailyPrices'>;now?:()=>Date},scope:RankScope){
 const {db,pool,market}=dependencies,now=dependencies.now??(()=>new Date()),started=now();
 const lock=await pool.connect();const key=`diary:rotation:${scope}`;let acquired=false;
 try{
  acquired=(await lock.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[key])).rows[0].acquired;
  if(!acquired)throw new RotationBatchBusy();
  const universe=getUniverseForScope(scope),symbols=universe.map(row=>row.symbol),complete=completedRotationDate(started);
  await db.update(marketRotationSnapshotRuns).set({status:'failed',errorCount:1,errorMessage:'Previous execution ended before completion was recorded.',finishedAt:started,updatedAt:started}).where(and(eq(marketRotationSnapshotRuns.rankScope,scope),eq(marketRotationSnapshotRuns.status,'running')));
  const [run]=await db.insert(marketRotationSnapshotRuns).values({rankScope:scope,status:'running',symbolCount:symbols.length,startedAt:started,updatedAt:started}).returning({id:marketRotationSnapshotRuns.id});
  try{
   // Price refresh must finish before any snapshot is calculated. A failed fetch does not become fresh data.
   for(const symbol of symbols){const read=await market.dailyPrices(symbol);if(read.source==='stale')throw new Error(`Unable to refresh ${symbol}`);await persistRotationPrices(db,read.data.filter(row=>complete(row.date)));}
   const asOf=started.toISOString().slice(0,10);
   let cutoff=asOf;
   while(!complete(cutoff)){const date=new Date(`${cutoff}T00:00:00Z`);date.setUTCDate(date.getUTCDate()-1);cutoff=date.toISOString().slice(0,10);}
   const symbolPrices:SymbolPrices[]=await Promise.all(universe.map(async meta=>{
    const stored=await db.select({date:marketDailyPrices.date,close:marketDailyPrices.close,adjustedClose:marketDailyPrices.adjustedClose}).from(marketDailyPrices)
     .where(and(eq(marketDailyPrices.symbol,meta.symbol),lte(marketDailyPrices.date,cutoff),sql`extract(dow from ${marketDailyPrices.date}) not in (0,6)`)).orderBy(desc(marketDailyPrices.date)).limit(300);
    return {meta,prices:stored.reverse().map(row=>({date:row.date,close:Number(row.close),adjustedClose:Number(row.adjustedClose)}))};
   }));
   const counts=new Map<string,number>();for(const row of symbolPrices){const date=row.prices.at(-1)?.date;if(date)counts.set(date,(counts.get(date)??0)+1);}
   const candidate=pickLatestQualifiedCandidate([...counts].map(([date,snapshotCount])=>({date:new Date(`${date}T00:00:00Z`),snapshotCount})),symbols.length);
   const candidateDate=candidate?.date.toISOString().slice(0,10);
   const aligned=candidateDate?symbolPrices.filter(row=>row.prices.at(-1)?.date===candidateDate):[];
   const window=candidateDate?await readRotationWindow(db,scope,candidateDate,candidate??undefined):{comparisonDate:null};
   let comparison:EnrichedSnapshotInput[]=[];
   if(window.comparisonDate){const date=window.comparisonDate.toISOString().slice(0,10);const rows=await db.select().from(marketRotationSnapshots).where(and(eq(marketRotationSnapshots.rankScope,scope),eq(marketRotationSnapshots.date,date),inArray(marketRotationSnapshots.symbol,symbols)));
    const number=(value:string|null)=>value===null?null:Number(value);
    comparison=rows.map(row=>({symbol:row.symbol,rankScope:row.rankScope,adjustedClose:number(row.adjustedClose),rsi14:number(row.rsi14),rsiPercentile:number(row.rsiPercentile),maScore:row.maScore??0,maScorePercentile:number(row.maScorePercentile),distanceFromHighScore:number(row.distanceFromHighScore),distanceFromHighScorePercentile:number(row.distanceFromHighScorePercentile),rotationScore:number(row.rotationScore),rotationRank:row.rotationRank,maStatus:row.maStatus??'unknown',percentFromHigh:number(row.percentFromHigh)}));
   }
   const result=runSnapshotPipeline(aligned,comparison);
   const status=result.latest.length===symbols.length&&candidate?.snapshotCount===symbols.length?'success':'partial';
   const upsertedCount=await db.transaction(async tx=>{
    const count=await persistRotationSnapshots(tx,result.latest,now());
    await tx.update(marketRotationSnapshotRuns).set({status,snapshotDate:candidate?.date.toISOString().slice(0,10)??null,qualifiedSymbolCount:candidate?.snapshotCount??0,upsertedCount:count,finishedAt:now(),updatedAt:now()}).where(eq(marketRotationSnapshotRuns.id,run!.id));
    return count;
   });
   return {runId:String(run!.id),rankScope:scope,status,symbolCount:symbols.length,upsertedCount,errors:symbolPrices.filter(row=>!aligned.includes(row)).map(row=>({symbol:row.meta.symbol,error:'No completed price on a qualified snapshot date'})),comparisonDate:window.comparisonDate?.toISOString().slice(0,10)??null};
  }catch(error){try{await db.update(marketRotationSnapshotRuns).set({status:'failed',errorCount:1,errorMessage:'Rotation batch failed; inspect the associated job log.',finishedAt:now(),updatedAt:now()}).where(eq(marketRotationSnapshotRuns.id,run!.id));}catch{console.error(JSON.stringify({operation:'rotation_run_tracking_failed',scope,runId:String(run!.id)}));}throw error;}
 }finally{let discard=false;try{if(acquired)await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}catch{discard=true;}finally{lock.release(discard);}}
}
