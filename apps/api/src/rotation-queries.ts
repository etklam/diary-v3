import { and, count, desc, eq, inArray, lte } from 'drizzle-orm';
import { marketRotationSnapshots, type Database } from '@diary/db';
import { getUniverseForScope } from '@diary/domain/market-rotation/universe';
import type { RankScope } from '@diary/domain/market-rotation/types';
import { filterQualifiedDates, resolveQualifiedDateWindow, type SnapshotDateCoverage, isQualifiedSnapshotCount } from '@diary/domain/market-rotation/qualified-date';

/** Only canonical members of this scope contribute to its comparison clock. */
export async function readRotationWindow(db: Database|Parameters<Parameters<Database['transaction']>[0]>[0], scope: RankScope, asOf: string, candidate?: SnapshotDateCoverage) {
 const symbols=getUniverseForScope(scope).map(entry=>entry.symbol);
 const groups=await db.select({date:marketRotationSnapshots.date,count:count()}).from(marketRotationSnapshots)
  .where(and(eq(marketRotationSnapshots.rankScope,scope),inArray(marketRotationSnapshots.symbol,symbols),lte(marketRotationSnapshots.date,asOf)))
  .groupBy(marketRotationSnapshots.date).orderBy(desc(marketRotationSnapshots.date));
 const qualified=filterQualifiedDates(groups.map(row=>({date:new Date(`${row.date}T00:00:00.000Z`),count:row.count})),symbols.length);
 return resolveQualifiedDateWindow(qualified,{candidateDate:candidate?.date,candidateIsQualified:!!candidate&&candidate.date.toISOString().slice(0,10)<=asOf&&isQualifiedSnapshotCount(candidate.snapshotCount,symbols.length)});
}
