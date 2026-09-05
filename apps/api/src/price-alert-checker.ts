import { randomUUID } from 'node:crypto'
import { calendarDateInTimezone } from '@diary/domain'
import { PRICE_ALERT_MOVING_AVG_PERIODS } from '@diary/contracts/price-alerts'
import { priceAlerts, type Database } from '@diary/db'
import { isCompletedRegularMarketDay } from './market-data/ttl.js'
import { asc, eq } from 'drizzle-orm'

export const PRICE_CHECK_INTERVAL = 5 * 60_000
export type PriceAlertHistoricalClose = { timestamp: number; close: number }
export type PriceAlertMarketData = {
  currentPrice: number | null
  previousClose: number | null
  historicalCloses?: PriceAlertHistoricalClose[] | null
}
type PriceAlertMarketRead = PriceAlertMarketData | number | null
export type PriceAlertThresholdUnit = 'price' | 'percent' | 'period'
export type PriceAlertHint = {
  id: string
  symbol: string
  type: string
  threshold: number
  thresholdUnit: PriceAlertThresholdUnit
  movingAverageDirection: 'above' | 'below' | null
  message: string
  currentPrice: number
  triggeredAt: string
}

const MARKET_TIME_ZONE = 'America/New_York'

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeMarketRead(value: PriceAlertMarketRead): PriceAlertMarketData | null {
  if (value === null) return null
  if (typeof value === 'number') return { currentPrice: value, previousClose: null, historicalCloses: null }
  if (!value || typeof value !== 'object') return null
  return {
    currentPrice: finite(value.currentPrice) ? value.currentPrice : null,
    previousClose: value.previousClose === null || value.previousClose === undefined || finite(value.previousClose) ? value.previousClose ?? null : null,
    historicalCloses: value.historicalCloses,
  }
}

/** Keep one close per completed New York trading date and ignore today's partial bar. */
export function completedHistoricalCloses(history: PriceAlertHistoricalClose[] | null | undefined, now: Date): number[] {
  if (!history) return []
  const byDate = new Map<string, number>()
  for (const row of history) {
    if (!finite(row.timestamp) || !Number.isFinite(row.close) || row.close <= 0) continue
    const date = new Date(row.timestamp * 1000)
    if (!Number.isFinite(date.getTime())) continue
    if (!isCompletedRegularMarketDay(date, now)) continue
    const day = calendarDateInTimezone(date, MARKET_TIME_ZONE)
    byDate.set(day, row.close)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, close]) => close)
}

function priceThreshold(type: string, price: number, threshold: string): boolean {
  const target = Number(threshold)
  if (!finite(price) || price < 0 || !finite(target) || target < 0) return false
  return type === 'PRICE_ABOVE' ? price >= target : type === 'PRICE_BELOW' ? price <= target : false
}

function changePercentCondition(market: PriceAlertMarketData, threshold: string): boolean | undefined {
  const { currentPrice, previousClose } = market
  const target = Number(threshold)
  if (!finite(currentPrice) || currentPrice < 0 || !finite(previousClose) || previousClose <= 0 || !finite(target)) return undefined
  const change = ((currentPrice - previousClose) / previousClose) * 100
  return target >= 0 ? change >= target : change <= target
}

function movingAverageCondition(market: PriceAlertMarketData, threshold: string, direction: string | null | undefined, now: Date): boolean | undefined {
  if (!finite(market.currentPrice) || market.currentPrice < 0 || (direction !== 'above' && direction !== 'below')) return undefined
  const period = Number(threshold)
  if (!finite(period) || !(PRICE_ALERT_MOVING_AVG_PERIODS as readonly string[]).some(value => Number(value) === period)) return undefined
  const closes = completedHistoricalCloses(market.historicalCloses, now)
  if (closes.length < period) return undefined
  const average = closes.slice(-period).reduce((sum, close) => sum + close, 0) / period
  if (!finite(average)) return undefined
  return direction === 'above' ? market.currentPrice >= average : market.currentPrice <= average
}

/** `undefined` means the provider did not supply enough trustworthy data yet. */
export function evaluatePriceAlert(type: string, market: PriceAlertMarketData, threshold: string, direction: string | null | undefined, now: Date): boolean | undefined {
  if (type === 'PRICE_ABOVE' || type === 'PRICE_BELOW') return priceThreshold(type, market.currentPrice ?? NaN, threshold)
  if (type === 'CHANGE_PERCENT') return changePercentCondition(market, threshold)
  if (type === 'MOVING_AVG') return movingAverageCondition(market, threshold, direction, now)
  return undefined
}

/** Backward-compatible pure helper for the original price-only conditions. */
export function priceCondition(type: string, price: number, threshold: string) {
  return evaluatePriceAlert(type, { currentPrice: price, previousClose: null, historicalCloses: null }, threshold, null, new Date()) === true
}

function thresholdUnit(type: string): PriceAlertThresholdUnit {
  return type === 'CHANGE_PERCENT' ? 'percent' : type === 'MOVING_AVG' ? 'period' : 'price'
}

/** Market I/O stays outside transactions; each decision uses the locked current row. */
export function createPriceAlertChecker(dependencies: {
  db: Database
  quote: (symbol: string, needsHistory: boolean) => Promise<PriceAlertMarketRead>
  emit: (userId: string, payload: PriceAlertHint) => void
  log: (context: { operation: string; jobId: string; alertId?: string; symbol?: string }, error: unknown) => void
  now?: () => Date
}) {
  let running: Promise<void> | undefined, timer: ReturnType<typeof setInterval> | undefined, stopped = false
  async function check() {
    const jobId = randomUUID()
    try {
      const pending = await dependencies.db.select({ id: priceAlerts.id, symbol: priceAlerts.symbol, type: priceAlerts.type }).from(priceAlerts).where(eq(priceAlerts.isTriggered, false)).orderBy(asc(priceAlerts.id))
      const market = new Map<string, PriceAlertMarketData | null>()
      for (const { symbol } of pending) {
        if (stopped) return
        if (market.has(symbol)) continue
        const needsHistory = pending.some(row => row.symbol === symbol && row.type === 'MOVING_AVG')
        try { market.set(symbol, normalizeMarketRead(await dependencies.quote(symbol, needsHistory))) }
        catch (error) { market.set(symbol, null); dependencies.log({ operation: 'price_alert_quote', jobId, symbol }, error) }
      }
      for (const candidate of pending) {
        if (stopped) return
        const snapshot = market.get(candidate.symbol)
        if (!snapshot) continue
        try {
          const triggered = await dependencies.db.transaction(async tx => {
            const [row] = await tx.select().from(priceAlerts).where(eq(priceAlerts.id, candidate.id)).for('update')
            const timestamp = dependencies.now?.() ?? new Date()
            const matches = row
              ? evaluatePriceAlert(row.type, snapshot, row.threshold, row.movingAverageDirection, timestamp) === true
              : false
            if (stopped || !row || row.isTriggered || !matches) return undefined
            await tx.update(priceAlerts).set({ isTriggered: true, triggeredAt: timestamp, updatedAt: timestamp }).where(eq(priceAlerts.id, row.id))
            return {
              userId: String(row.userId),
              payload: {
                id: String(row.id),
                symbol: row.symbol,
                type: row.type,
                threshold: Number(row.threshold),
                thresholdUnit: thresholdUnit(row.type),
                movingAverageDirection: row.movingAverageDirection ?? null,
                message: row.message,
                currentPrice: snapshot.currentPrice!,
                triggeredAt: timestamp.toISOString(),
              },
            }
          })
          // A notification error must never undo the committed trigger state.
          if (triggered && !stopped) dependencies.emit(triggered.userId, triggered.payload)
        } catch (error) { dependencies.log({ operation: 'price_alert_process', jobId, alertId: String(candidate.id), symbol: candidate.symbol }, error) }
      }
    } catch (error) { dependencies.log({ operation: 'price_alert_tick', jobId }, error) }
  }
  function checkPriceAlerts() {
    if (!running) running = check().finally(() => { running = undefined })
    return running
  }
  function start() {
    if (timer !== undefined) return
    stopped = false
    timer = setInterval(() => { void checkPriceAlerts() }, PRICE_CHECK_INTERVAL); timer.unref?.()
    void checkPriceAlerts()
  }
  async function stop() { stopped = true; if (timer !== undefined) clearInterval(timer); timer = undefined; await running }
  return { checkPriceAlerts, start, stop }
}
