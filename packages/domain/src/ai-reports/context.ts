import {
  calendarDaysInReportPeriod,
  canonicalizeReportPeriod,
  type AiReportLocale,
  type AiReportPeriodType,
  type CanonicalReportPeriod,
  type BuildReportPeriodInput,
} from './period.js'
import { replayLedger } from '../ledger.js'

export type ReportSourceType = 'diary' | 'transaction' | 'discipline' | 'holding'
export type ReportMetricAvailability = 'available' | 'zero' | 'unavailable'
export type ReportSourceRole = 'direct' | 'ledger_dependency' | 'derived'

export interface ReportDiaryRow {
  id: string
  date: string
  title: string
  content: string
  tags: readonly string[]
  thesis: string | null
  risk: string | null
  execution: string | null
  reviewStatus: string | null
  reviewedAt: Date | string | null
  reviewOutcome: string | null
  reviewSummary: string | null
  reviewLearning: string | null
  reviewAdjustment: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ReportTransactionRow {
  id: string
  diaryId: string
  symbol: string
  type: 'BUY' | 'SELL'
  quantity: string
  price: string
  tradeDate: Date | string
  notes: string | null
  strategy: string | null
  emotion: string | null
}

export interface ReportDisciplineRow {
  id: string
  content: string
  order: number
  createdAt: Date | string
}

export interface ReportContextRows {
  diaries: readonly ReportDiaryRow[]
  transactions: readonly ReportTransactionRow[]
  disciplines: readonly ReportDisciplineRow[]
}

export interface ReportContextInput extends BuildReportPeriodInput {
  userId: bigint
  locale: AiReportLocale
}

export interface ReportContextLimits {
  /** Maximum serialized context bytes sent to a provider. */
  maxRequestBytes?: number
  /** Maximum Unicode code points in all user text fields. */
  maxTextLength?: number
  /** Maximum source/dependency rows in one snapshot. */
  maxRows?: number
  /** Conservative estimated input-token ceiling. */
  maxInputTokens?: number
  /** Bytes-per-token assumption used only for a conservative estimate. */
  bytesPerToken?: number
}

export const DEFAULT_REPORT_CONTEXT_LIMITS: Required<ReportContextLimits> = {
  maxRequestBytes: 2_000_000,
  maxTextLength: 500_000,
  maxRows: 10_000,
  maxInputTokens: 32_000,
  // One UTF-8 byte per token is a conservative upper estimate of token count
  // for mixed CJK/Latin text. Callers may raise this only with a provider tokenizer.
  bytesPerToken: 1,
}

export interface ReportPeriodWire {
  periodType: AiReportPeriodType
  periodStart: string
  periodEndExclusive: string
  isPartialPeriod: boolean
}

export interface ReportContextWindow {
  startInstant: string
  periodEndInstant: string
  effectiveEndInstant: string
  effectiveEndDateExclusive: string
}

export interface ReportSource {
  alias: string
  sourceType: ReportSourceType
  dependency: boolean
}

export interface ReportSourceManifestEntry extends ReportSource {
  sourceId: string
  contentHash: string
  ownerId: string
  role: ReportSourceRole
}

export interface ReportDiaryEntry {
  sourceId: string
  date: string
  title: string
  content: string
  tags: string[]
  thesis: string | null
  risk: string | null
  execution: string | null
  review: {
    status: string | null
    reviewedAt: string | null
    outcome: string | null
    summary: string | null
    learning: string | null
    adjustment: string | null
    hindsight: boolean
  }
  createdAt: string
  updatedAt: string
}

export interface ReportTransactionEntry {
  sourceId: string
  /** A report-local diary alias; null when the linked diary is outside the projection. */
  diaryId: string | null
  symbol: string
  type: 'BUY' | 'SELL'
  quantity: string
  price: string
  tradeDate: string
  notes: string | null
  strategy: string | null
  emotion: string | null
}

export interface ReportDisciplineEntry {
  sourceId: string
  content: string
  order: number
  createdAt: string
  createdAfterPeriod: boolean
  history: 'snapshot_at_generation_only'
}

export interface ReportHoldingEntry {
  sourceId: string
  symbol: string
  quantity: string
  avgCost: string
  totalCost: string
  asOf: string
  basis: 'recorded_transactions_only'
  sourceIds: string[]
}

export interface ReportOpeningHoldingEntry extends ReportHoldingEntry {
  asOf: string
}

export interface ReportClosedTradeEntry {
  sourceId: string
  symbol: string
  sellDate: string
  sellQuantity: string
  sellPrice: string
  avgCostBasis: string
  realizedPnL: string
  realizedPnLPct: string
}

export interface ReportMetric {
  id: string
  label: string
  value: number | string | null
  unit: string | null
  availability: ReportMetricAvailability
  definition: string
  sourceIds: string[]
}

export interface ReportCoverage {
  diaries: { count: number; available: boolean }
  transactions: { count: number; available: boolean }
  holdings: { count: number; available: boolean }
  disciplines: { count: number; available: boolean }
  notes: string[]
}

export interface ReportContext {
  schemaVersion: 'ai-report-context.v1'
  ownerScope: 'owner'
  period: ReportPeriodWire
  timezone: string
  locale: AiReportLocale
  snapshotCapturedAt: string
  window: ReportContextWindow
  coverage: ReportCoverage
  metrics: ReportMetric[]
  sources: ReportSource[]
  diaries: ReportDiaryEntry[]
  transactions: ReportTransactionEntry[]
  disciplines: ReportDisciplineEntry[]
  holdings: ReportHoldingEntry[]
  openingHoldings: ReportOpeningHoldingEntry[]
  closedTrades: ReportClosedTradeEntry[]
  limitations: string[]
}

export interface ReportContextBuildResult {
  context: ReportContext
  sourceManifest: ReportSourceManifestEntry[]
  /** Hash input intentionally excludes snapshotCapturedAt and other event metadata. */
  hashInput: unknown
  inputHash: string
}

export type ReportContextErrorCode = 'AI_REPORT_NO_DATA' | 'AI_REPORT_CONTEXT_TOO_LARGE'

export class ReportContextError extends Error {
  constructor(readonly code: ReportContextErrorCode, message: string) {
    super(message)
    this.name = 'ReportContextError'
  }
}

export class ReportContextNoDataError extends ReportContextError {
  constructor() {
    super('AI_REPORT_NO_DATA', 'No diary, transaction or recorded holding data is available for this period')
  }
}

export class ReportContextTooLargeError extends ReportContextError {
  constructor(readonly limit: keyof Required<ReportContextLimits>, readonly observed: number, readonly maximum: number) {
    super('AI_REPORT_CONTEXT_TOO_LARGE', `Report context exceeds the ${limit} limit`)
  }
}

function instant(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new ReportContextError('AI_REPORT_CONTEXT_TOO_LARGE', 'Invalid source timestamp')
  return date.toISOString()
}

function nonEmpty(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value
}

function sourceAlias(prefix: string, index: number): string {
  return `${prefix}${index + 1}`
}

function stableValue(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite value cannot be serialized')
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stableValue)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().flatMap(key => {
      const next = stableValue((value as Record<string, unknown>)[key])
      return next === undefined ? [] : [[key, next]]
    }))
  }
  throw new Error('Unsupported context value')
}

/** Stable JSON used for hashes and deterministic fixture comparisons. */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function textFields(row: ReportDiaryRow): string[] {
  return [row.title, row.content, row.thesis, row.risk, row.execution, row.reviewSummary, row.reviewLearning, row.reviewAdjustment, ...row.tags].filter((value): value is string => value !== null)
}

function transactionTextFields(row: ReportTransactionRow): string[] {
  return [row.notes, row.strategy, row.emotion].filter((value): value is string => value !== null)
}

function rowTextLength(rows: ReportContextRows): number {
  return [
    ...rows.diaries.flatMap(textFields),
    ...rows.transactions.flatMap(transactionTextFields),
    ...rows.disciplines.map(row => row.content),
  ].reduce((total, value) => total + Array.from(value).length, 0)
}

function available(count: number): ReportMetricAvailability {
  return count === 0 ? 'zero' : 'available'
}

function metric(input: Omit<ReportMetric, 'sourceIds'> & { sourceIds?: readonly string[] }): ReportMetric {
  return { ...input, sourceIds: [...(input.sourceIds ?? [])] }
}

function mapLedgerEntry(row: ReportTransactionRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    type: row.type,
    quantity: row.quantity,
    price: row.price,
    tradeDate: row.tradeDate,
    order: BigInt(row.id),
  } as const
}

function compareIds(left: string, right: string): number {
  const a = BigInt(left)
  const b = BigInt(right)
  return a < b ? -1 : a > b ? 1 : 0
}

function sourceHashValue(sourceType: ReportSourceType, row: unknown): string {
  return stableSerialize({ sourceType, row })
}

function makeCoverage(
  diaries: readonly ReportDiaryRow[],
  periodTransactions: readonly ReportTransactionRow[],
  holdings: readonly ReportHoldingEntry[],
  disciplines: readonly ReportDisciplineRow[],
  period: CanonicalReportPeriod,
): ReportCoverage {
  const notes: string[] = []
  if (period.isPartialPeriod) notes.push('The selected period is partial and is capped at snapshotCapturedAt.')
  if (periodTransactions.length === 0) notes.push('No transactions are recorded inside the selected period.')
  if (diaries.length === 0) notes.push('No date-only diary is recorded inside the selected period.')
  if (holdings.length === 0) notes.push('No open holding is supported by the recorded ledger at the cutoff.')
  if (disciplines.length > 0) notes.push('Discipline content is a generation-time snapshot; historical effective dates are unavailable.')
  if (periodTransactions.length > 0) notes.push('Transaction currency and account scope are not recorded; cross-currency totals are unavailable.')
  return {
    diaries: { count: diaries.length, available: diaries.length > 0 },
    transactions: { count: periodTransactions.length, available: periodTransactions.length > 0 },
    holdings: { count: holdings.length, available: holdings.length > 0 },
    disciplines: { count: disciplines.length, available: disciplines.length > 0 },
    notes,
  }
}

function hasAnalyzableData(
  diaries: readonly ReportDiaryRow[],
  periodTransactions: readonly ReportTransactionRow[],
  holdings: readonly unknown[],
): boolean {
  return diaries.length > 0 || periodTransactions.length > 0 || holdings.length > 0
}

function hashProjection(result: Omit<ReportContextBuildResult, 'hashInput' | 'inputHash'>, ownerId: string): unknown {
  return stableValue({
    schemaVersion: result.context.schemaVersion,
    ownerScope: ownerId,
    period: result.context.period,
    timezone: result.context.timezone,
    locale: result.context.locale,
    // Capture time caps an in-progress window, but the exact instant is event
    // metadata. The effective local date and included rows below keep the hash
    // stable while no source has changed, yet change it when the cutoff admits
    // another date or transaction.
    window: {
      startInstant: result.context.window.startInstant,
      periodEndInstant: result.context.window.periodEndInstant,
      effectiveEndDateExclusive: result.context.window.effectiveEndDateExclusive,
    },
    coverage: result.context.coverage,
    metrics: result.context.metrics,
    sources: result.context.sources,
    sourceManifest: result.sourceManifest.map(({ ownerId: _ownerId, ...source }) => source),
    diaries: result.context.diaries,
    transactions: result.context.transactions,
    disciplines: result.context.disciplines,
    holdings: result.context.holdings.map(({ asOf: _asOf, ...holding }) => holding),
    openingHoldings: result.context.openingHoldings.map(({ asOf: _asOf, ...holding }) => holding),
    closedTrades: result.context.closedTrades,
    limitations: result.context.limitations,
  })
}

/**
 * Build the provider-safe projection from rows already read in one DB snapshot.
 * The API adapter owns SQL and supplies only rows for one owner.
 */
export async function buildReportContext(
  input: ReportContextInput,
  rows: ReportContextRows,
  limits: ReportContextLimits = {},
): Promise<ReportContextBuildResult> {
  const period = canonicalizeReportPeriod(input)
  const effectiveStart = new Date(period.startInstant).getTime()
  const effectiveEnd = new Date(period.effectiveEndInstant).getTime()
  const periodTransactions = rows.transactions.filter(row => {
    const time = new Date(row.tradeDate).getTime()
    return Number.isFinite(time) && time >= effectiveStart && time < effectiveEnd
  })
  const ledgerRows = rows.transactions.filter(row => {
    const time = new Date(row.tradeDate).getTime()
    return Number.isFinite(time) && time < effectiveEnd
  })

  const openingRows = ledgerRows.filter(row => new Date(row.tradeDate).getTime() < effectiveStart)
  const openingReplay = replayLedger(openingRows.map(mapLedgerEntry))
  const endingReplay = replayLedger(ledgerRows.map(mapLedgerEntry))
  const closedTradeRows = endingReplay.closedTrades.filter(trade => {
    const time = trade.sellDate.getTime()
    return time >= effectiveStart && time < effectiveEnd
  })

  const periodDiaries = rows.diaries.filter(row => row.date >= period.periodStart && row.date < period.effectiveEndDateExclusive)
  const availableDisciplines = rows.disciplines.filter(row => new Date(row.createdAt).getTime() <= input.capturedAt.getTime())
  if (!hasAnalyzableData(periodDiaries, periodTransactions, endingReplay.holdings)) throw new ReportContextNoDataError()

  const sortedDiaries = [...periodDiaries].sort((left, right) => left.date.localeCompare(right.date) || compareIds(left.id, right.id))
  const sortedPeriodTransactions = [...periodTransactions].sort((left, right) => {
    const difference = new Date(left.tradeDate).getTime() - new Date(right.tradeDate).getTime()
    return difference || compareIds(left.id, right.id)
  })
  const sortedDependencies = [...openingRows].sort((left, right) => {
    const difference = new Date(left.tradeDate).getTime() - new Date(right.tradeDate).getTime()
    return difference || compareIds(left.id, right.id)
  })
  const sortedDisciplines = [...availableDisciplines].sort((left, right) => left.order - right.order || compareIds(left.id, right.id))
  const transactionAliases = new Map<string, string>()
  sortedPeriodTransactions.forEach((row, index) => transactionAliases.set(row.id, sourceAlias('T', index)))
  const diaryAliases = new Map<string, string>()
  sortedDiaries.forEach((row, index) => diaryAliases.set(row.id, sourceAlias('D', index)))
  const dependencyAliases = new Map<string, string>()
  sortedDependencies.forEach((row, index) => dependencyAliases.set(row.id, sourceAlias('TD', index)))
  const holdingAliasBySymbol = new Map<string, string>()
  endingReplay.holdings.forEach((holding, index) => holdingAliasBySymbol.set(holding.symbol, sourceAlias('P', index)))
  const openingAliasBySymbol = new Map<string, string>()
  openingReplay.holdings.forEach((holding, index) => openingAliasBySymbol.set(holding.symbol, sourceAlias('P', endingReplay.holdings.length + index)))

  const diaryEntries: ReportDiaryEntry[] = sortedDiaries.map((row, index) => ({
    sourceId: sourceAlias('D', index), date: row.date, title: row.title, content: row.content,
    tags: [...row.tags], thesis: nonEmpty(row.thesis), risk: nonEmpty(row.risk), execution: nonEmpty(row.execution),
    review: {
      status: row.reviewStatus, reviewedAt: row.reviewedAt === null ? null : instant(row.reviewedAt), outcome: row.reviewOutcome,
      summary: nonEmpty(row.reviewSummary), learning: nonEmpty(row.reviewLearning), adjustment: nonEmpty(row.reviewAdjustment),
      hindsight: row.reviewedAt !== null && new Date(row.reviewedAt).getTime() >= effectiveEnd,
    },
    createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt),
  }))
  const transactionEntries: ReportTransactionEntry[] = sortedPeriodTransactions.map(row => ({
    sourceId: transactionAliases.get(row.id)!, diaryId: diaryAliases.get(row.diaryId) ?? null, symbol: row.symbol.trim().toUpperCase(), type: row.type,
    quantity: row.quantity, price: row.price, tradeDate: instant(row.tradeDate), notes: nonEmpty(row.notes),
    strategy: nonEmpty(row.strategy), emotion: nonEmpty(row.emotion),
  }))
  const disciplineEntries: ReportDisciplineEntry[] = sortedDisciplines.map((row, index) => ({
    sourceId: sourceAlias('R', index), content: row.content, order: row.order, createdAt: instant(row.createdAt),
    createdAfterPeriod: new Date(row.createdAt).getTime() >= new Date(period.periodEndInstant).getTime(),
    history: 'snapshot_at_generation_only',
  }))

  const holdingSourceIdsBySymbol = new Map<string, string[]>()
  for (const row of ledgerRows) {
    const symbol = row.symbol.trim().toUpperCase()
    const alias = transactionAliases.get(row.id)
    if (alias) holdingSourceIdsBySymbol.set(symbol, [...(holdingSourceIdsBySymbol.get(symbol) ?? []), alias])
  }
  const holdingEntries: ReportHoldingEntry[] = endingReplay.holdings.map(holding => ({
    sourceId: holdingAliasBySymbol.get(holding.symbol)!, symbol: holding.symbol, quantity: holding.quantity,
    avgCost: holding.avgCost, totalCost: holding.totalCost, asOf: period.effectiveEndInstant,
    basis: 'recorded_transactions_only', sourceIds: holdingSourceIdsBySymbol.get(holding.symbol) ?? [holdingAliasBySymbol.get(holding.symbol)!],
  }))
  const openingHoldings: ReportOpeningHoldingEntry[] = openingReplay.holdings.map(holding => ({
    sourceId: openingAliasBySymbol.get(holding.symbol)!, symbol: holding.symbol, quantity: holding.quantity,
    avgCost: holding.avgCost, totalCost: holding.totalCost, asOf: period.startInstant,
    basis: 'recorded_transactions_only', sourceIds: [openingAliasBySymbol.get(holding.symbol)!],
  }))
  const closedTrades: ReportClosedTradeEntry[] = closedTradeRows.map(trade => ({
    sourceId: transactionAliases.get(trade.id) ?? `T${trade.id}`,
    symbol: trade.symbol,
    sellDate: trade.sellDate.toISOString(),
    sellQuantity: trade.sellQuantity,
    sellPrice: trade.sellPrice,
    avgCostBasis: trade.avgCostBasis,
    realizedPnL: trade.realizedPnL,
    realizedPnLPct: trade.realizedPnLPct,
  }))

  const sources: ReportSource[] = []
  const sourceManifest: ReportSourceManifestEntry[] = []
  const addSource = async (source: ReportSource & { sourceId: string }, hashRow: unknown, role: ReportSourceRole, exposeToProvider = true) => {
    const contentHash = await sha256Hex(sourceHashValue(source.sourceType, hashRow))
    const { sourceId, ...reference } = source
    if (exposeToProvider) sources.push(reference)
    sourceManifest.push({ ...reference, sourceId, contentHash, ownerId: input.userId.toString(), role })
  }
  await Promise.all(sortedDiaries.map(async (row, index) => addSource({ alias: sourceAlias('D', index), sourceType: 'diary', sourceId: row.id, dependency: false }, row, 'direct')))
  await Promise.all(sortedPeriodTransactions.map(async row => addSource({ alias: transactionAliases.get(row.id)!, sourceType: 'transaction', sourceId: row.id, dependency: false }, row, 'direct')))
  await Promise.all(sortedDependencies.map(async row => addSource({ alias: dependencyAliases.get(row.id)!, sourceType: 'transaction', sourceId: row.id, dependency: true }, row, 'ledger_dependency', false)))
  await Promise.all(sortedDisciplines.map(async (row, index) => addSource({ alias: sourceAlias('R', index), sourceType: 'discipline', sourceId: row.id, dependency: false }, row, 'direct')))
  await Promise.all(endingReplay.holdings.map(async (holding, index) => addSource({ alias: sourceAlias('P', index), sourceType: 'holding', sourceId: `holding:${holding.symbol}`, dependency: false }, holding, 'derived')))
  await Promise.all(openingReplay.holdings.map(async holding => addSource({ alias: openingAliasBySymbol.get(holding.symbol)!, sourceType: 'holding', sourceId: `holding:opening:${holding.symbol}`, dependency: true }, holding, 'derived')))
  sources.sort((left, right) => left.alias.localeCompare(right.alias))
  sourceManifest.sort((left, right) => left.alias.localeCompare(right.alias))

  const diarySourceIds = diaryEntries.map(row => row.sourceId)
  const transactionSourceIds = transactionEntries.map(row => row.sourceId)
  const disciplineSourceIds = disciplineEntries.map(row => row.sourceId)
  const holdingSourceIds = holdingEntries.map(row => row.sourceId)
  const metrics: ReportMetric[] = [
    metric({ id: 'diary.count', label: 'Recorded diaries', value: periodDiaries.length, unit: 'count', availability: available(periodDiaries.length), definition: 'Number of saved date-only diaries in the local period range.', sourceIds: diarySourceIds }),
    metric({ id: 'diary.recorded_days', label: 'Recorded diary days', value: new Set(periodDiaries.map(row => row.date)).size, unit: 'calendar_days', availability: available(new Set(periodDiaries.map(row => row.date)).size), definition: 'Number of distinct local calendar dates with a saved diary; this is not market-session coverage.', sourceIds: diarySourceIds }),
    metric({ id: 'period.calendar_days', label: 'Period calendar days', value: calendarDaysInReportPeriod(period), unit: 'calendar_days', availability: 'available', definition: 'Number of civil calendar days in the canonical period, before partial-period truncation.', sourceIds: [] }),
    metric({ id: 'transaction.count', label: 'Recorded transactions', value: periodTransactions.length, unit: 'count', availability: available(periodTransactions.length), definition: 'Number of saved BUY and SELL transactions whose timestamp is inside the effective period instant range.', sourceIds: transactionSourceIds }),
    metric({ id: 'transaction.buy_count', label: 'Recorded buys', value: periodTransactions.filter(row => row.type === 'BUY').length, unit: 'count', availability: available(periodTransactions.filter(row => row.type === 'BUY').length), definition: 'Number of saved BUY transactions in the effective period instant range.', sourceIds: transactionSourceIds }),
    metric({ id: 'transaction.sell_count', label: 'Recorded sells', value: periodTransactions.filter(row => row.type === 'SELL').length, unit: 'count', availability: available(periodTransactions.filter(row => row.type === 'SELL').length), definition: 'Number of saved SELL transactions in the effective period instant range; it is not a count of all closed trade cases.', sourceIds: transactionSourceIds }),
    metric({ id: 'transaction.symbol_count', label: 'Traded symbols', value: new Set(periodTransactions.map(row => row.symbol.trim().toUpperCase())).size, unit: 'count', availability: available(new Set(periodTransactions.map(row => row.symbol.trim().toUpperCase())).size), definition: 'Number of distinct symbols in saved period transactions.', sourceIds: transactionSourceIds }),
    metric({ id: 'ledger.closed_trade_count', label: 'Closed trade cases', value: closedTrades.length, unit: 'count', availability: available(closedTrades.length), definition: 'Number of ledger SELL events that close a recorded average-cost position during the effective period.', sourceIds: closedTrades.map(trade => trade.sourceId) }),
    metric({ id: 'holding.open_count', label: 'Open holdings', value: holdingEntries.length, unit: 'count', availability: available(holdingEntries.length), definition: 'Number of symbols with a positive recorded ledger quantity at the effective cutoff.', sourceIds: holdingSourceIds }),
    metric({ id: 'discipline.count', label: 'Current discipline rules', value: availableDisciplines.length, unit: 'count', availability: available(availableDisciplines.length), definition: 'Number of owner discipline rules available in the generation-time snapshot.', sourceIds: disciplineSourceIds }),
    metric({ id: 'ledger.realized_pnl', label: 'Realized P&L aggregate', value: null, unit: null, availability: 'unavailable', definition: 'Unavailable because transaction currency is not recorded and cross-currency aggregation is not verified.', sourceIds: transactionSourceIds }),
  ]
  for (const holding of holdingEntries) {
    metrics.push(metric({ id: `holding.${holding.symbol.toLowerCase()}.quantity`, label: `${holding.symbol} recorded quantity`, value: holding.quantity, unit: 'shares_or_units', availability: 'available', definition: 'Recorded positive ledger quantity at the effective cutoff; this is not a complete account position.', sourceIds: [holding.sourceId] }))
    metrics.push(metric({ id: `holding.${holding.symbol.toLowerCase()}.cost`, label: `${holding.symbol} recorded cost basis`, value: holding.totalCost, unit: 'currency_unknown', availability: 'available', definition: 'Average-cost ledger basis for this symbol; currency is not recorded by the source schema.', sourceIds: [holding.sourceId] }))
  }

  const coverage = makeCoverage(periodDiaries, periodTransactions, holdingEntries, availableDisciplines, period)
  const limitations = [...coverage.notes,
    'The projection contains owner-saved diary, transaction and discipline data only; partner and external market data are excluded.',
    'The recorded ledger is not a complete account statement and does not support total return, Sharpe ratio, drawdown or portfolio allocation conclusions.',
  ]
  const context: ReportContext = {
    schemaVersion: 'ai-report-context.v1', ownerScope: 'owner',
    period: { periodType: period.periodType, periodStart: period.periodStart, periodEndExclusive: period.periodEndExclusive, isPartialPeriod: period.isPartialPeriod },
    timezone: period.timezone, locale: input.locale, snapshotCapturedAt: input.capturedAt.toISOString(),
    window: { startInstant: period.startInstant, periodEndInstant: period.periodEndInstant, effectiveEndInstant: period.effectiveEndInstant, effectiveEndDateExclusive: period.effectiveEndDateExclusive },
    coverage, metrics, sources, diaries: diaryEntries, transactions: transactionEntries, disciplines: disciplineEntries,
    holdings: holdingEntries, openingHoldings, closedTrades, limitations,
  }
  const partial = { context, sourceManifest }
  const hashInput = hashProjection(partial, input.userId.toString())
  const inputHash = await sha256Hex(stableSerialize(hashInput))
  const resolvedLimits = { ...DEFAULT_REPORT_CONTEXT_LIMITS, ...limits }
  const serializedContext = stableSerialize(context)
  const requestBytes = new TextEncoder().encode(serializedContext).byteLength
  const textLength = rowTextLength({ diaries: periodDiaries, transactions: periodTransactions, disciplines: availableDisciplines })
  const totalRows = periodDiaries.length + ledgerRows.length + availableDisciplines.length + holdingEntries.length
  const inputTokens = Math.ceil(requestBytes / resolvedLimits.bytesPerToken)
  if (requestBytes > resolvedLimits.maxRequestBytes) throw new ReportContextTooLargeError('maxRequestBytes', requestBytes, resolvedLimits.maxRequestBytes)
  if (textLength > resolvedLimits.maxTextLength) throw new ReportContextTooLargeError('maxTextLength', textLength, resolvedLimits.maxTextLength)
  if (totalRows > resolvedLimits.maxRows) throw new ReportContextTooLargeError('maxRows', totalRows, resolvedLimits.maxRows)
  if (inputTokens > resolvedLimits.maxInputTokens) throw new ReportContextTooLargeError('maxInputTokens', inputTokens, resolvedLimits.maxInputTokens)
  return { context, sourceManifest, hashInput, inputHash }
}

export { canonicalizeReportPeriod }
export type { AiReportLocale, AiReportPeriodType, CanonicalReportPeriod }
