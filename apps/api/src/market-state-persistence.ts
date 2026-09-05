import { sql } from 'drizzle-orm'
import { marketBreadthDaily, marketUniverse, type Database } from '@diary/db'
import type { BreadthDayResult } from '@diary/domain/market-state/update-breadth-utils'

export async function upsertMarketUniverseItem(
  db: Database,
  item: { symbol: string; name: string; exchange: string; assetType?: string; sector?: string | null },
) {
  const [row] = await db.insert(marketUniverse).values({
    symbol: item.symbol,
    name: item.name,
    exchange: item.exchange,
    assetType: item.assetType ?? 'stock',
    isActive: true,
    sector: item.sector ?? null,
  }).onConflictDoUpdate({
    target: marketUniverse.symbol,
    set: {
      name: item.name,
      exchange: item.exchange,
      assetType: item.assetType ?? 'stock',
      isActive: true,
      sector: item.sector ?? null,
      updatedAt: sql`now()`,
    },
  }).returning()
  return row
}

export async function upsertMarketBreadthRows(
  db: Database,
  universeKey: string,
  rows: readonly BreadthDayResult[],
) {
  if (rows.length === 0) return 0
  const decimal = (value: number | null, digits = 4) => value === null ? null : value.toFixed(digits)
  let upserted = 0
  await db.transaction(async tx => {
    for (let start = 0; start < rows.length; start += 250) {
      const chunk = rows.slice(start, start + 250).map(row => ({
        universeKey,
        date: row.date.toISOString().slice(0, 10),
        universeCount: row.universeCount,
        up4Count: row.up4Count,
        down4Count: row.down4Count,
        up4Pct: decimal(row.up4Pct),
        down4Pct: decimal(row.down4Pct),
        above40dCount: row.above40dCount,
        above40dPct: decimal(row.above40dPct),
        ratio5d: decimal(row.ratio5d),
        ratio10d: decimal(row.ratio10d),
        regime: row.regime,
        score: row.score,
        coveragePct: decimal(row.coveragePct, 2),
        isStale: row.isStale,
        updatedAt: new Date(),
      }))
      await tx.insert(marketBreadthDaily).values(chunk).onConflictDoUpdate({
        target: [marketBreadthDaily.universeKey, marketBreadthDaily.date],
        set: {
          universeCount: sql`excluded.universe_count`,
          up4Count: sql`excluded.up4_count`,
          down4Count: sql`excluded.down4_count`,
          up4Pct: sql`excluded.up4_pct`,
          down4Pct: sql`excluded.down4_pct`,
          above40dCount: sql`excluded.above40d_count`,
          above40dPct: sql`excluded.above40d_pct`,
          ratio5d: sql`excluded.ratio_5d`,
          ratio10d: sql`excluded.ratio_10d`,
          regime: sql`excluded.regime`,
          score: sql`excluded.score`,
          coveragePct: sql`excluded.coverage_pct`,
          isStale: sql`excluded.is_stale`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      upserted += chunk.length
    }
  })
  return upserted
}
