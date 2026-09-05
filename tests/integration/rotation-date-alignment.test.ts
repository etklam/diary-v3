import {beforeAll,afterAll,it,expect} from 'vitest';
import {marketRotationSnapshots} from '../../packages/db/src/schema';
import {getSectorsUniverse} from '../../packages/domain/src/market-rotation/universe';
import {runRotationBatch} from '../../apps/api/src/rotation-batch';
import {provisionTestDatabase} from '../support/database';
let database:Awaited<ReturnType<typeof provisionTestDatabase>>;
beforeAll(async()=>{database=await provisionTestDatabase('rotation_alignment');});afterAll(async()=>{await database?.dispose();});
it('ranks a qualified date without stale peers and preserves snapshots when no new date qualifies',async()=>{
 const symbols=getSectorsUniverse().map(row=>row.symbol);let second=false;
 const now=()=>new Date('2026-09-08T00:00:00Z');
 const market={dailyPrices:async(symbol:string)=>{
  const index=symbols.indexOf(symbol),date=index===10?'2026-09-03':second&&index<9?'2026-09-07':'2026-09-04';
  const row=(date:string,close='100.000000')=>({symbol,date,open:close,high:close,low:close,close,adjustedClose:close,volume:100n});
  return {source:'upstream' as const,fetchedAt:now().toISOString(),data:[...Array.from({length:80},(_,i)=>row(new Date(Date.UTC(2026,5,i+1)).toISOString().slice(0,10))),row(date,index===10?'50.000000':'100.000000')]};
 }};
 const dependencies={db:database.db,pool:database.pool,market,now};
 const result=await runRotationBatch(dependencies,'sectors');expect(result).toMatchObject({status:'partial',upsertedCount:10});
 const before=await database.db.select().from(marketRotationSnapshots);expect(before).toHaveLength(10);expect(before.every(row=>row.date==='2026-09-04'&&row.rsiPercentile==='0.0000')).toBe(true);expect(before.some(row=>row.symbol===symbols[10])).toBe(false);
 second=true;const insufficient=await runRotationBatch(dependencies,'sectors');expect(insufficient).toMatchObject({status:'partial',upsertedCount:0,comparisonDate:null});
 const after=await database.db.select().from(marketRotationSnapshots);expect(after).toEqual(before);
});
