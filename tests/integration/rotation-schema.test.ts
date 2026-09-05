import {beforeAll,afterAll,it,expect} from 'vitest';
import {marketDailyPrices,marketRotationSnapshots,marketRotationSnapshotRuns,stocks,etfs} from '../../packages/db/src/schema';
import {provisionTestDatabase} from '../support/database';
let database:Awaited<ReturnType<typeof provisionTestDatabase>>;
beforeAll(async()=>{database=await provisionTestDatabase('rotation_schema');});afterAll(async()=>{await database?.dispose();});
it('preserves exact daily decimals, bigint volume, unique dates and scope-specific snapshots',async()=>{
 const price={symbol:'SPY',date:'2026-09-04',open:'123456789012.123456',high:'123456789012.123456',low:'123456789012.123456',close:'123456789012.123456',adjustedClose:'123456789012.123456',volume:5000000000n};
 const writes=await Promise.allSettled([database.db.insert(marketDailyPrices).values(price),database.db.insert(marketDailyPrices).values(price)]);
 expect(writes.filter(row=>row.status==='fulfilled')).toHaveLength(1);
 const [stored]=await database.db.select().from(marketDailyPrices);expect(stored?.close).toBe(price.close);expect(stored?.volume).toBe(price.volume);expect(stored?.date).toBe(price.date);
 const snapshot={symbol:'SPY',date:price.date,rankScope:'indexes',groupType:'index',signalStatus:'insufficient_data'};
 await database.db.insert(marketRotationSnapshots).values([snapshot,{...snapshot,rankScope:'core',groupType:'core_etf'}]);
 await expect(database.db.insert(marketRotationSnapshots).values(snapshot)).rejects.toThrow();
 const rows=await database.db.select().from(marketRotationSnapshots);expect(rows).toHaveLength(2);for(const row of rows){expect(row.rotationRank).toBeNull();expect(row.rotationScore).toBeNull();expect(row.signal).toBeNull();expect(row.createdAt).toBeInstanceOf(Date);}
 const [run]=await database.db.insert(marketRotationSnapshotRuns).values({rankScope:'indexes',status:'running'}).returning();expect(run?.symbolCount).toBe(0);expect(run?.snapshotDate).toBeNull();expect(run?.finishedAt).toBeNull();
 expect(await database.db.select().from(stocks)).toHaveLength(0);expect(await database.db.select().from(etfs)).toHaveLength(0);
});
