import { log } from 'node:console'
import { performance } from 'node:perf_hooks'
import { argv, memoryUsage, version } from 'node:process'
import { groupPriceAlertHistoryNeeds } from '../apps/api/src/price-alert-checker.ts'

const ruleCount = Number(argv[2] ?? 5_000)
const warmups = Number(argv[3] ?? 3)
const repetitions = Number(argv[4] ?? 15)
const rows = Array.from({ length: ruleCount }, (_, index) => ({
  symbol: `S${index}`,
  type: index % 5 === 0 ? 'MOVING_AVG' : 'PRICE_ABOVE',
}))

function baselineGrouping(pending) {
  const result = new Map()
  for (const { symbol } of pending) {
    if (result.has(symbol)) continue
    result.set(symbol, pending.some(row => row.symbol === symbol && row.type === 'MOVING_AVG'))
  }
  return result
}

function measure(fn) {
  const started = performance.now()
  const result = fn()
  return { elapsedMs: performance.now() - started, result }
}

function memoryDelta(fn) {
  globalThis.gc?.()
  const before = memoryUsage().heapUsed
  const { entries, after } = (() => {
    const result = fn()
    const entries = result.size
    globalThis.gc?.()
    return { entries, after: memoryUsage().heapUsed }
  })()
  return { entries, retainedHeapBytes: after - before }
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  return { p50Ms: percentile(sorted, 0.50), p95Ms: percentile(sorted, 0.95), minMs: sorted[0], maxMs: sorted.at(-1) }
}

const coldBaseline = measure(() => baselineGrouping(rows))
const coldGrouped = measure(() => groupPriceAlertHistoryNeeds(rows))
for (let index = 0; index < warmups; index++) {
  baselineGrouping(rows)
  groupPriceAlertHistoryNeeds(rows)
}

const baselineSamples = []
const groupedSamples = []
for (let index = 0; index < repetitions; index++) {
  baselineSamples.push(measure(() => baselineGrouping(rows)).elapsedMs)
  groupedSamples.push(measure(() => groupPriceAlertHistoryNeeds(rows)).elapsedMs)
}

log(JSON.stringify({
  node: version,
  fixture: { rules: rows.length, uniqueSymbols: new Set(rows.map(row => row.symbol)).size, movingAverageRules: rows.filter(row => row.type === 'MOVING_AVG').length },
  environment: { concurrency: 1, warmupsPerAlgorithm: warmups, repetitionsPerAlgorithm: repetitions, coldRun: 'first invocation in this process', heap: 'retained result Map after forced GC; run with --expose-gc' },
  baselineSome: { coldMs: coldBaseline.elapsedMs, warm: summarize(baselineSamples), memory: memoryDelta(() => baselineGrouping(rows)) },
  groupedSinglePass: { coldMs: coldGrouped.elapsedMs, warm: summarize(groupedSamples), memory: memoryDelta(() => groupPriceAlertHistoryNeeds(rows)) },
}, null, 2))
