import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {isBatchScope,rankScopes,type BatchScope,type RankScope} from '@diary/domain/market-rotation/types';
import type {runRotationBatch} from './rotation-batch.js';
export function parseRotationArgs(args:string[]):BatchScope{
 const {values}=parseArgs({args,options:{scope:{type:'string'}},allowPositionals:false});
 const scope=values.scope?.trim()||'all';if(!isBatchScope(scope))throw new Error('Invalid scope: expected sectors, indexes, core or all');return scope;
}
export async function executeRotationCommand(scope:BatchScope,run:(scope:RankScope)=>ReturnType<typeof runRotationBatch>){
 const jobId=randomUUID(),start=Date.now(),startedAt=new Date(start).toISOString();
 const results:Awaited<ReturnType<typeof runRotationBatch>>[]=[];
 try{
  for(const selected of scope==='all'?rankScopes:[scope])results.push(await run(selected));
  return {success:true,jobId,scope,startedAt,durationMs:Date.now()-start,totalUpserted:results.reduce((sum,row)=>sum+row.upsertedCount,0),totalErrors:results.reduce((sum,row)=>sum+row.symbolCount-row.upsertedCount,0),results};
 }catch{
  return {success:false,jobId,scope,startedAt,durationMs:Date.now()-start,totalUpserted:results.reduce((sum,row)=>sum+row.upsertedCount,0),totalErrors:1+results.reduce((sum,row)=>sum+row.symbolCount-row.upsertedCount,0),results,errorMessage:'Rotation batch failed; check database run records and provider availability.'};
 }
}
