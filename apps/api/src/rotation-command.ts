import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {isBatchScope,type BatchScope,type RankScope} from '@diary/domain/market-rotation/types';
import type {runRotationBatch} from './rotation-batch.js';
import {executeRotationScopes} from './rotation-execution.js';
export function parseRotationArgs(args:string[]):BatchScope{
 const {values}=parseArgs({args,options:{scope:{type:'string'}},allowPositionals:false});
 const scope=values.scope?.trim()||'all';if(!isBatchScope(scope))throw new Error('Invalid scope: expected sectors, indexes, core or all');return scope;
}
export async function executeRotationCommand(scope:BatchScope,run:(scope:RankScope)=>ReturnType<typeof runRotationBatch>){
 const jobId=randomUUID(),start=Date.now(),startedAt=new Date(start).toISOString();
 const execution=await executeRotationScopes(scope,run),results=execution.results;
 if(execution.ok){
  return {success:true,jobId,scope,startedAt,durationMs:Date.now()-start,totalUpserted:results.reduce((sum,row)=>sum+row.upsertedCount,0),totalErrors:results.reduce((sum,row)=>sum+row.symbolCount-row.upsertedCount,0),results};
 }
 return {success:false,jobId,scope,startedAt,durationMs:Date.now()-start,totalUpserted:results.reduce((sum,row)=>sum+row.upsertedCount,0),totalErrors:1+results.reduce((sum,row)=>sum+row.symbolCount-row.upsertedCount,0),results,errorMessage:'Rotation batch failed; check database run records and provider availability.'};
}
