import {sql} from 'drizzle-orm';
import {marketDailyPrices,type Database} from '@diary/db';
import type {DailyMarketPrice} from './market-data/daily-prices.js';
/** One symbol's refresh commits atomically, including overlapping provider dates. */
export async function persistRotationPrices(db:Database,prices:readonly DailyMarketPrice[]){
 if(!prices.length)return;
 const canonical=new Map(prices.map(row=>[`${row.symbol}/${row.date}`,row]));
 const rows=[...canonical.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.date.localeCompare(b.date));
 await db.transaction(async tx=>{
  for(let start=0;start<rows.length;start+=500)await tx.insert(marketDailyPrices).values(rows.slice(start,start+500)).onConflictDoUpdate({target:[marketDailyPrices.symbol,marketDailyPrices.date],set:{open:sql`excluded.open`,high:sql`excluded.high`,low:sql`excluded.low`,close:sql`excluded.close`,adjustedClose:sql`excluded.adjusted_close`,volume:sql`excluded.volume`}});
 });
}
