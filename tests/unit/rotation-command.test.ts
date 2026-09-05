import {it,expect,vi} from 'vitest';
import {parseRotationArgs,executeRotationCommand} from '../../apps/api/src/rotation-command';
import type {RankScope} from '../../packages/domain/src/market-rotation/types';
const result=(rankScope:RankScope)=>({runId:'1',rankScope,errors:[],status:'success',symbolCount:8,upsertedCount:8,comparisonDate:null});
it('accepts source scope forms and rejects malformed/unknown options',()=>{
 expect(parseRotationArgs([])).toBe('all');expect(parseRotationArgs(['--scope=core'])).toBe('core');expect(parseRotationArgs(['--scope','sectors'])).toBe('sectors');expect(()=>parseRotationArgs(['--scope=bad'])).toThrow();expect(()=>parseRotationArgs(['--scope'])).toThrow();expect(()=>parseRotationArgs(['--other'])).toThrow();
});
it('runs requested scopes only and retains completed scope counts on later failure',async()=>{
 const run=vi.fn(async(scope:RankScope)=>result(scope));const one=await executeRotationCommand('core',run);expect(run.mock.calls).toEqual([['core']]);expect(one).toMatchObject({success:true,totalUpserted:8});run.mockClear();
 const all=await executeRotationCommand('all',run);expect(run.mock.calls).toEqual([['sectors'],['indexes'],['core']]);expect(all.totalUpserted).toBe(24);
 const failed=await executeRotationCommand('all',async scope=>{if(scope==='indexes')throw new Error('synthetic secret must not be logged');return result(scope);});expect(failed).toMatchObject({success:false,totalUpserted:8,totalErrors:1});expect(failed.results).toHaveLength(1);expect(JSON.stringify(failed)).not.toContain('synthetic secret');
});

it('reports missing-symbol counts for partial scope output',async()=>{
 const output=await executeRotationCommand('indexes',async scope=>({...result(scope),status:'partial',upsertedCount:6}));expect(output).toMatchObject({success:true,totalUpserted:6,totalErrors:2});
});
