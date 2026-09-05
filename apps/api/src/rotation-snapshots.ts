import {z} from 'zod';
import {getTableColumns,sql} from 'drizzle-orm';
import {marketRotationSnapshots,type Database} from '@diary/db';
import {calendarDateSchema} from '@diary/contracts';
const finite=z.number().finite();
const decimal=(precision:number,scale:number)=>finite.transform(value=>value.toFixed(scale)).refine(value=>Math.abs(Number(value))<10**(precision-scale),'Snapshot metric exceeds database precision').nullable();
export const rotationSnapshotWriteSchema=z.object({
 date:calendarDateSchema,
 symbol:z.string().max(20),
 rankScope:z.enum(['sectors','indexes','core']),
 groupType:z.string().max(20),
 sectorName:z.string().max(100).nullable(),
 lastPrice:decimal(18,6),
 adjustedClose:decimal(18,6),
 dailyChangePct:decimal(10,4),
 weeklyChangePct:decimal(10,4),
 twoWeekPerformancePct:decimal(10,4),
 rsi14:decimal(8,4),
 rsiPercentile:decimal(8,4),
 rsiDelta2W:decimal(8,4),
 ema10:decimal(18,6),
 ema20:decimal(18,6),
 sma50:decimal(18,6),
 sma200:decimal(18,6),
 above10d:z.boolean().nullable(),
 above20d:z.boolean().nullable(),
 above50d:z.boolean().nullable(),
 above200d:z.boolean().nullable(),
 maScore:finite.int().min(-2147483648).max(2147483647).nullable(),
 maScorePercentile:decimal(8,4),
 maStatus:z.string().max(32).nullable(),
 rolling252dHigh:decimal(18,6),
 percentFromHigh:decimal(10,4),
 distanceFromHighScore:decimal(8,4),
 distanceFromHighScorePercentile:decimal(8,4),
 rotationScore:decimal(8,4),
 rotationScoreDelta2W:decimal(8,4),
 rotationRank:finite.int().min(-2147483648).max(2147483647).nullable(),
 rankDelta2W:finite.int().min(-2147483648).max(2147483647).nullable(),
 signal:z.string().max(32).nullable(),
 signalStatus:z.string().max(32),
});
export async function persistRotationSnapshots(db:Database|Parameters<Parameters<Database['transaction']>[0]>[0],input:readonly unknown[],now=new Date()){
 const rows=input.map(row=>({...rotationSnapshotWriteSchema.parse(row),updatedAt:now}));
 if(!rows.length)return 0;
 const columns=getTableColumns(marketRotationSnapshots);
 const update=Object.fromEntries(Object.entries(columns).filter(([key])=>!['id','createdAt','symbol','date','rankScope'].includes(key)).map(([key,column])=>[key,sql`excluded.${sql.identifier(column.name)}`]));
 await db.transaction(async tx=>{
  for(let start=0;start<rows.length;start+=250)await tx.insert(marketRotationSnapshots).values(rows.slice(start,start+250)).onConflictDoUpdate({target:[marketRotationSnapshots.rankScope,marketRotationSnapshots.symbol,marketRotationSnapshots.date],set:update});
 });
 return rows.length;
}
