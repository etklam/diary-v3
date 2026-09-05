import {beforeAll,afterAll,it,expect} from 'vitest';
import {marketDailyPrices} from '../../packages/db/src/schema';
import {persistRotationPrices} from '../../apps/api/src/rotation-prices';
import {provisionTestDatabase} from '../support/database';
let database:Awaited<ReturnType<typeof provisionTestDatabase>>;
beforeAll(async()=>{database=await provisionTestDatabase('rotation_prices');});afterAll(async()=>{await database?.dispose();});
it('upserts repeated dates and rolls back all chunks when any row fails',async()=>{
 const row={symbol:'SPY',date:'2026-09-04',open:'100.000001',high:'110.000001',low:'90.000001',close:'101.000001',adjustedClose:'99.000001',volume:5_000_000_000n};
 await Promise.all([persistRotationPrices(database.db,[row]),persistRotationPrices(database.db,[row])]);
 await persistRotationPrices(database.db,[row,{...row,close:'102.000001'}]);
 let rows=await database.db.select().from(marketDailyPrices);expect(rows).toHaveLength(1);expect(rows[0]?.close).toBe('102.000001');expect(rows[0]?.volume).toBe(row.volume);
 const batch=Array.from({length:501},(_,i)=>({...row,symbol:`X${String(i).padStart(3,'0')}`}));batch[500]!.close='1000000000000.000000';
 await expect(persistRotationPrices(database.db,batch)).rejects.toThrow();rows=await database.db.select().from(marketDailyPrices);expect(rows).toHaveLength(1);expect(rows[0]?.symbol).toBe('SPY');
});
