import {beforeAll,afterAll,it,expect} from 'vitest';
import {marketDailyPrices,marketRotationSnapshots,marketRotationSnapshotRuns} from '../../packages/db/src/schema';
import {runRotationBatch,RotationBatchBusy,completedRotationDate} from '../../apps/api/src/rotation-batch';
import type {DailyMarketPrice} from '../../apps/api/src/market-data/daily-prices';
import {provisionTestDatabase} from '../support/database';
let database:Awaited<ReturnType<typeof provisionTestDatabase>>;
beforeAll(async()=>{database=await provisionTestDatabase('rotation_batch');});afterAll(async()=>{await database?.dispose();});
it('persists canonical prices before snapshots, records failure, and excludes overlapping scope runs',async()=>{
 const now=()=>new Date('2026-09-05T00:00:00Z');let stale=false;
 let release:()=>void=()=>{},entered:()=>void=()=>{};let gate:Promise<void>|null=null;
 const market={dailyPrices:async(symbol:string)=>{if(gate){entered();await gate;}const data:DailyMarketPrice[]=Array.from({length:80},(_,i)=>({symbol,date:new Date(Date.UTC(2026,5,i+1)).toISOString().slice(0,10),open:'100.000000',high:'101.000000',low:'99.000000',close:'100.000000',adjustedClose:'100.000000',volume:100n}));return {data,source:stale?'stale' as const:'upstream' as const,fetchedAt:now().toISOString()};}};
 const deps={db:database.db,pool:database.pool,market,now};
 await database.db.insert(marketRotationSnapshotRuns).values({rankScope:'indexes',status:'running'});
 const result=await runRotationBatch(deps,'indexes');expect(result).toMatchObject({status:'success',symbolCount:8,upsertedCount:8,comparisonDate:null});expect(await database.db.select().from(marketDailyPrices)).toHaveLength(464);expect(await database.db.select().from(marketRotationSnapshots)).toHaveLength(8);
 await runRotationBatch(deps,'indexes');expect(await database.db.select().from(marketRotationSnapshots)).toHaveLength(8);
 stale=true;await expect(runRotationBatch(deps,'indexes')).rejects.toThrow('Unable to refresh');expect(await database.db.select().from(marketRotationSnapshots)).toHaveLength(8);stale=false;
 gate=new Promise<void>(resolve=>{release=resolve;});const started=new Promise<void>(resolve=>{entered=resolve;});const running=runRotationBatch(deps,'indexes');await started;
 try{await expect(runRotationBatch(deps,'indexes')).rejects.toBeInstanceOf(RotationBatchBusy);}finally{release();gate=null;}
 await running;const runs=await database.db.select().from(marketRotationSnapshotRuns);expect(runs).toHaveLength(5);expect(runs.filter(row=>row.status==='failed')).toHaveLength(2);expect(runs.every(row=>row.finishedAt!==null)).toBe(true);
 await database.pool.query("CREATE FUNCTION reject_rotation_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'success' AND NEW.rank_scope = 'sectors' THEN RAISE EXCEPTION 'synthetic completion failure'; END IF; RETURN NEW; END $$");
 await database.pool.query('CREATE TRIGGER reject_rotation_completion BEFORE UPDATE ON market_rotation_snapshot_run FOR EACH ROW EXECUTE FUNCTION reject_rotation_completion()');
 await expect(runRotationBatch(deps,'sectors')).rejects.toThrow();
 expect(await database.db.select().from(marketRotationSnapshots)).toHaveLength(8);
 const failedRuns=await database.db.select().from(marketRotationSnapshotRuns);expect(failedRuns.filter(row=>row.rankScope==='sectors').map(row=>row.status)).toEqual(['failed']);

});
it('uses New York close boundary across daylight saving and excludes weekends',()=>{
 expect(completedRotationDate(new Date('2026-07-06T19:59:00Z'))('2026-07-06')).toBe(false);expect(completedRotationDate(new Date('2026-07-06T20:00:00Z'))('2026-07-06')).toBe(true);
 expect(completedRotationDate(new Date('2026-01-05T20:59:00Z'))('2026-01-05')).toBe(false);expect(completedRotationDate(new Date('2026-01-05T21:00:00Z'))('2026-01-05')).toBe(true);expect(completedRotationDate(new Date('2026-09-06T23:00:00Z'))('2026-09-05')).toBe(false);
});
it('limits recursive indicators to the source last-300-trading-observation window',async()=>{
 const now=()=>new Date('2029-01-01T00:00:00Z');
 const market={dailyPrices:async(symbol:string)=>({source:'upstream' as const,fetchedAt:now().toISOString(),data:Array.from({length:600},(_,i)=>{const price=i<100?'10000000000.000000':'100.000000';return {symbol,date:new Date(Date.UTC(2027,0,i+1)).toISOString().slice(0,10),open:price,high:price,low:price,close:price,adjustedClose:price,volume:100n};})})};
 await runRotationBatch({db:database.db,pool:database.pool,market,now},'indexes');
 const rows=await database.db.select().from(marketRotationSnapshots);
 const latest=rows.filter(row=>row.symbol==='SPY'&&row.rankScope==='indexes').sort((a,b)=>b.date.localeCompare(a.date))[0];
 // The last 300 observations are flat; including older decline history incorrectly yields RSI 0.
 expect(latest?.rsi14).toBe('100.0000');expect(latest?.ema20).toBe('100.000000');
});
