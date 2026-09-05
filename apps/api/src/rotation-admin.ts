import type {Context,Hono} from 'hono';
import type {z} from 'zod';
import type {ErrorCode} from '@diary/contracts';
import {rotationBatchRequestSchema,rotationBatchResponseSchema} from '@diary/contracts/rotation';
import type {AppEnv} from './app.js';
import {RotationBatchBusy,type runRotationBatch} from './rotation-batch.js';
export function registerRotationAdmin(app:Hono<AppEnv>,dependencies:{run?: (scope:'sectors'|'indexes'|'core')=>ReturnType<typeof runRotationBatch>;parseJson:<T>(context:Context<AppEnv>,schema:z.ZodType<T>)=>Promise<T>;fail:(status:number,code:ErrorCode,message:string)=>never}){
 app.post('/api/admin/market/rotation-batch',async c=>{
  c.header('Cache-Control','no-store');const user=c.get('user');
  if(!user)return dependencies.fail(401,'AUTH_UNAUTHORIZED','Authentication required');if(user.role!=='ADMIN')return dependencies.fail(403,'AUTH_FORBIDDEN','Admin access required');
  const {scope}=await dependencies.parseJson(c,rotationBatchRequestSchema);
  if(!dependencies.run)return dependencies.fail(503,'SYS_INTERNAL_ERROR','Rotation runtime unavailable');
  try{
   if(scope!=='all')return c.json(rotationBatchResponseSchema.parse({success:true,result:await dependencies.run(scope)}));
   const results=[];for(const selected of ['sectors','indexes','core'] as const)results.push(await dependencies.run(selected));
   return c.json(rotationBatchResponseSchema.parse({success:true,results,totalUpserted:results.reduce((sum,row)=>sum+row.upsertedCount,0),totalErrors:results.reduce((sum,row)=>sum+row.errors.length,0)}));
  }catch(error){if(error instanceof RotationBatchBusy)return dependencies.fail(409,'ROTATION_BATCH_BUSY','This scope is already updating');throw error;}
 });
}
