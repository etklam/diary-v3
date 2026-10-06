import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import type { ZodError, ZodType } from 'zod'
import {
  guruConsensusQuerySchema,
  guruConsensusResponseSchema,
  guruSectorsQuerySchema,
  guruSectorsResponseSchema,
  guruStocksExportQuerySchema,
  guruStocksQuerySchema,
  guruStocksResponseSchema,
  type GuruConsensusQuery,
  type GuruSectorsQuery,
  type GuruStocksExportQuery,
  type GuruStocksQuery,
} from '@diary/contracts'
import type { ErrorCode } from '@diary/contracts'
import { guruConsensusSnapshots, guruSectorConsensus, guruStockConsensus, type Database } from '@diary/db'
import type { AppEnv } from './app-context.js'

type Dependencies = {
  db: Database
  fail: (status: number, code: ErrorCode, message: string) => never
  validationError: (error: ZodError) => never
}

function decimalPercent(numerator: number, denominator: number): string | null {
  if (denominator <= 0) return null
  const scaled = (BigInt(numerator) * 100_000_000n * 100n + BigInt(denominator) / 2n) / BigInt(denominator)
  const whole = scaled / 100_000_000n
  const fraction = (scaled % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function periodSummary(row: typeof guruConsensusSnapshots.$inferSelect) {
  return {
    periodEnd: row.periodEnd,
    activeManagerCount: row.activeManagerCount,
    readyManagerCount: row.readyManagerCount,
    partialManagerCount: row.partialManagerCount,
    errorManagerCount: row.errorManagerCount,
    supersededManagerCount: row.supersededManagerCount,
    pendingManagerCount: row.pendingManagerCount,
    noFilingManagerCount: row.noFilingManagerCount,
    comparableManagerCount: row.comparableManagerCount,
    previousReadyManagerCount: row.previousReadyManagerCount,
    sourceRowCount: row.sourceRowCount,
    mappedRowCount: row.mappedRowCount,
    mappingCoveragePercent: row.mappingCoveragePercent,
    quarterCoveragePercent: decimalPercent(row.readyManagerCount, row.activeManagerCount),
    source: 'SEC Form 13F' as const,
  }
}

function stockSort(ranking: GuruStocksQuery['ranking'] | GuruConsensusQuery['sort']) {
  switch (ranking) {
    case 'most-held': return [desc(guruStockConsensus.currentHolderCount), desc(guruStockConsensus.netBuyerCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'most-added': return [desc(sql`${guruStockConsensus.newBuyerCount} + ${guruStockConsensus.addCount}`), desc(guruStockConsensus.newBuyerCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'most-new': return [desc(guruStockConsensus.newBuyerCount), desc(guruStockConsensus.currentHolderCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'most-reduced': return [desc(sql`${guruStockConsensus.reduceCount} + ${guruStockConsensus.exitCount}`), desc(guruStockConsensus.reduceCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'most-exited': return [desc(guruStockConsensus.exitCount), desc(guruStockConsensus.currentHolderCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'largest-weight': return [desc(guruStockConsensus.aggregateWeightPercent), desc(guruStockConsensus.currentHolderCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'fastest-rising':
    case 'rising': return [desc(guruStockConsensus.holderCountChange), desc(guruStockConsensus.currentHolderCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'fastest-falling':
    case 'falling': return [asc(guruStockConsensus.holderCountChange), desc(guruStockConsensus.currentHolderCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    case 'net-buyers': return [desc(guruStockConsensus.netBuyerCount), desc(guruStockConsensus.currentHolderCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
    default: return [desc(guruStockConsensus.currentHolderCount), asc(guruStockConsensus.ticker), asc(guruStockConsensus.securityId)] as const
  }
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (!/^-?\d+(?:\.\d+)?$/.test(text) && /^\s*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function toCsv(rows: readonly (readonly unknown[])[]) {
  return `${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

function parsePeriodQuery<T extends { period?: string }>(
  context: Context<AppEnv>,
  schema: ZodType<T>,
  validationError: Dependencies['validationError'],
) {
  const parsed = schema.safeParse(context.req.query())
  if (!parsed.success) validationError(parsed.error)
  return parsed.data
}

export function registerGuruConsensusRoutes(app: Hono<AppEnv>, { db, fail, validationError }: Dependencies) {
  const cached = (context: Context<AppEnv>) => context.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')

  async function selectPeriod(periodEnd?: string) {
    const periods = await db.select().from(guruConsensusSnapshots).orderBy(desc(guruConsensusSnapshots.periodEnd), desc(guruConsensusSnapshots.id))
    const selected = periodEnd ? periods.find(row => row.periodEnd === periodEnd) : periods[0]
    if (!selected) return fail(404, 'GURU_NOT_FOUND', 'Consensus quarter not found')
    return { selected, periods: periods.map(periodSummary) }
  }

  async function listStocks(input: {
    snapshotId: bigint
    query: Pick<GuruStocksQuery, 'search' | 'sector'> & { classification?: GuruConsensusQuery['classification'] }
    ranking: GuruStocksQuery['ranking'] | GuruConsensusQuery['sort']
    page?: number
    limit?: number
  }) {
    const conditions = [eq(guruStockConsensus.snapshotId, input.snapshotId)]
    if (input.query.search) {
      const search = input.query.search.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')
      const pattern = `%${search}%`
      conditions.push(sql`(${guruStockConsensus.ticker} ilike ${pattern} escape '!' or ${guruStockConsensus.company} ilike ${pattern} escape '!')`)
    }
    if (input.query.sector) conditions.push(ilike(guruStockConsensus.sector, `%${input.query.sector}%`))
    if (input.query.classification) conditions.push(eq(guruStockConsensus.classification, input.query.classification))
    const where = and(...conditions)
    const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(guruStockConsensus).where(where)
    const total = countRow?.total ?? 0
    const rowsQuery = db.select().from(guruStockConsensus).where(where).orderBy(...stockSort(input.ranking))
    const rows = input.page && input.limit
      ? await rowsQuery.limit(input.limit).offset((input.page - 1) * input.limit)
      : await rowsQuery
    return { rows, total }
  }

  async function listSectors(snapshotId: bigint, query: GuruSectorsQuery) {
    const conditions = [eq(guruSectorConsensus.snapshotId, snapshotId), eq(guruSectorConsensus.dimension, query.dimension)]
    if (query.search) conditions.push(ilike(guruSectorConsensus.name, `%${query.search}%`))
    if (query.direction) conditions.push(eq(guruSectorConsensus.direction, query.direction))
    const where = and(...conditions)
    const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(guruSectorConsensus).where(where)
    const total = countRow?.total ?? 0
    const order = query.sort === 'buyers' ? [desc(guruSectorConsensus.buyerCount), desc(guruSectorConsensus.sellerCount), asc(guruSectorConsensus.name)]
      : query.sort === 'weight-change' ? [desc(guruSectorConsensus.aggregateWeightChangePoints), desc(guruSectorConsensus.name)]
        : query.sort === 'aggregate-weight' ? [desc(guruSectorConsensus.aggregateWeightPercent), asc(guruSectorConsensus.name)]
          : query.sort === 'holders' ? [desc(guruSectorConsensus.currentHolderCount), asc(guruSectorConsensus.name)]
            : [desc(sql`case ${guruSectorConsensus.direction} when 'INCREASING' then 3 when 'REDUCING' then 2 when 'STABLE' then 1 else 0 end`), desc(guruSectorConsensus.buyerCount), asc(guruSectorConsensus.name)]
    const rows = await db.select().from(guruSectorConsensus).where(where).orderBy(...order).limit(query.limit).offset((query.page - 1) * query.limit)
    return { rows, total }
  }

  function publicStock(row: typeof guruStockConsensus.$inferSelect) {
    const values: Record<string, unknown> = { ...row }
    delete values.id
    delete values.snapshotId
    return { ...values, securityId: row.securityId.toString() }
  }

  function publicSector(row: typeof guruSectorConsensus.$inferSelect) {
    const values: Record<string, unknown> = { ...row }
    delete values.id
    delete values.snapshotId
    return values
  }

  app.get('/api/gurus/consensus', async context => {
    const query = parsePeriodQuery<GuruConsensusQuery>(context, guruConsensusQuerySchema, validationError)
    const { selected, periods } = await selectPeriod(query.period)
    const { rows, total } = await listStocks({
      snapshotId: selected.id,
      query: { search: query.search, sector: query.sector, classification: query.classification },
      ranking: query.sort, page: query.page, limit: query.limit,
    })
    cached(context)
    return context.json(guruConsensusResponseSchema.parse({ data: {
      period: periodSummary(selected), periods, items: rows.map(publicStock), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    } }))
  })

  app.get('/api/gurus/stocks', async context => {
    const query = parsePeriodQuery<GuruStocksQuery>(context, guruStocksQuerySchema, validationError)
    const { selected, periods } = await selectPeriod(query.period)
    const { rows, total } = await listStocks({ snapshotId: selected.id, query, ranking: query.ranking, page: query.page, limit: query.limit })
    cached(context)
    return context.json(guruStocksResponseSchema.parse({ data: {
      period: periodSummary(selected), periods, ranking: query.ranking, items: rows.map(publicStock),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    } }))
  })

  app.get('/api/gurus/stocks.csv', async context => {
    const query = parsePeriodQuery<GuruStocksExportQuery>(context, guruStocksExportQuerySchema, validationError)
    const { selected } = await selectPeriod(query.period)
    const { rows } = await listStocks({ snapshotId: selected.id, query, ranking: query.ranking })
    const header = ['ticker', 'company', 'sector', 'industry', 'held_by_gurus', 'ready_gurus', 'comparable_current_holders', 'previous_holders', 'holder_count_change', 'new', 'add', 'unchanged', 'reduce', 'exit', 'net_buyers', 'average_share_change_percent', 'median_share_change_percent', 'aggregate_portfolio_weight_percent', 'average_portfolio_weight_percent', 'weight_breadth_percent', 'classification', 'quarter_trend', 'reported_period', 'source', 'quarter_coverage_percent', 'mapping_coverage_percent']
    const body = toCsv([header, ...rows.map(row => [
      row.ticker, row.company, row.sector, row.industry, row.currentHolderCount, selected.readyManagerCount,
      row.comparableCurrentHolderCount, row.previousHolderCount, row.holderCountChange, row.newBuyerCount, row.addCount,
      row.unchangedCount, row.reduceCount, row.exitCount, row.netBuyerCount, row.averageQuantityChangePercent,
      row.medianQuantityChangePercent, row.aggregateWeightPercent, row.averagePortfolioWeightPercent,
      row.weightBreadthPercent, row.classification, row.quarterTrend, selected.periodEnd, 'SEC Form 13F',
      decimalPercent(selected.readyManagerCount, selected.activeManagerCount), selected.mappingCoveragePercent,
    ])])
    context.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
    return context.body(body, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="guru-consensus-${selected.periodEnd}.csv"`,
    })
  })

  app.get('/api/gurus/sectors', async context => {
    const query = parsePeriodQuery<GuruSectorsQuery>(context, guruSectorsQuerySchema, validationError)
    const { selected, periods } = await selectPeriod(query.period)
    const { rows, total } = await listSectors(selected.id, query)
    cached(context)
    return context.json(guruSectorsResponseSchema.parse({ data: {
      period: periodSummary(selected), periods, dimension: query.dimension, items: rows.map(publicSector),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    } }))
  })
}
