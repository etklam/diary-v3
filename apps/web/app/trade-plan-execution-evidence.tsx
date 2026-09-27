import { useEffect, useState } from 'react'
import { tradePlanExecutionBaselineHistoryResponseSchema, type TradePlanExecutionComparison, type TradePlanExecutionBaseline } from '@diary/contracts/trade-plan-execution'
import { api } from './ui'
import { planCopy } from './trade-plan-copy'

type Copy = typeof planCopy[keyof typeof planCopy]

function statusText(c: Copy, status: TradePlanExecutionComparison['comparisonStatus']) {
  if (status === 'ready') return c.executionReady
  if (status === 'outdated') return c.executionOutdated
  if (status === 'conflict') return c.executionConflict
  if (status === 'unavailable') return c.executionUnavailable
  return c.executionUnconfirmed
}

function dateTime(value: string, locale: string) {
  try {
    return `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC`
  } catch {
    return value
  }
}

/**
 * Read-only execution evidence shared by Trade Plan detail and Diary Review.
 * The parent owns mutations and stale-write handling; history pages load on demand.
 */
export function ExecutionEvidence({ data, c, locale, planId, retryText = 'Retry' }: { data: TradePlanExecutionComparison; c: Copy; locale: string; planId?: string; retryText?: string }) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [history, setHistory] = useState<TradePlanExecutionBaseline[]>(data.baselineHistory)
  const [historyPagination, setHistoryPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [historyAttempt, setHistoryAttempt] = useState(0)

  useEffect(() => {
    setHistory(data.baselineHistory)
    setHistoryPage(1)
    setHistoryPagination(null)
  }, [data])

  useEffect(() => {
    if (!historyOpen || !planId) return
    const controller = new AbortController()
    setHistoryLoading(true); setHistoryError(false)
    void api.GET('/api/trade-plans/{id}/execution-baselines', { params: { path: { id: planId }, query: { page: historyPage, limit: 20 } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = tradePlanExecutionBaselineHistoryResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) { setHistory(parsed.data.data); setHistoryPagination(parsed.data.pagination) }
      else setHistoryError(true)
      setHistoryLoading(false)
    }).catch(() => { if (!controller.signal.aborted) { setHistoryError(true); setHistoryLoading(false) } })
    return () => controller.abort()
  }, [historyOpen, historyPage, historyAttempt, planId])

  return <div className="execution-evidence">
    <p className="execution-status" role="status">{statusText(c, data.comparisonStatus)}</p>
    {data.baseline && <p className="muted">{c.executionVersion} {data.baseline.version} · {c.executionAt} <time dateTime={data.baseline.confirmedAt}>{dateTime(data.baseline.confirmedAt, locale)}</time>{data.baselineStatus === 'outdated' && ` · ${c.executionOutdated}`}{data.comparisonTiming === 'retrospective' && ` · ${c.executionTimingRetrospective}`}{data.comparisonTiming === 'unknown' && ` · ${c.executionTimingUnknown}`}</p>}
    {history.length > 0 && <details className="execution-history" onToggle={event => { setHistoryOpen(event.currentTarget.open); if (event.currentTarget.open) setHistoryPage(1) }}><summary>{c.executionHistory}</summary>{historyLoading && <p role="status" aria-busy="true">{c.executionHistory}…</p>}{historyError && <><p role="status">{c.executionLoadFailed}</p><button type="button" className="secondary" onClick={() => setHistoryAttempt(value => value + 1)}>{retryText}</button></>}<ul>{history.map(item => <li key={item.id}><strong>{c.executionVersion} {item.version}</strong> · {dateTime(item.confirmedAt, locale)} · {c.symbol} {item.snapshot.symbol} · {c.setupType} {item.snapshot.setupType ?? c.executionUnavailableValue} · {c.executionBaselineEntry} {item.snapshot.entryPrice ?? c.executionUnavailableValue} · {c.executionBaselineZone} {[item.snapshot.entryZoneLow, item.snapshot.entryZoneHigh].filter(Boolean).join(' – ') || c.executionUnavailableValue} · {c.stopLoss} {item.snapshot.stopLoss ?? c.executionUnavailableValue} · {c.targetPrice} {item.snapshot.targetPrice ?? c.executionUnavailableValue} · {c.maxPositionSize} {item.snapshot.maxPositionSize ?? c.executionUnavailableValue} · {c.invalidationCondition} {item.snapshot.invalidationCondition ?? c.executionUnavailableValue}{item.id === data.baseline?.id && ` · ${c.executionCurrent}`}</li>)}</ul>{historyPagination && historyPagination.totalPages > 1 && <nav className="plan-pagination" aria-label={c.executionHistory}><button type="button" className="secondary" disabled={historyPage <= 1} onClick={() => setHistoryPage(value => value - 1)}>{c.previous}</button><span>{c.pickerPage} {historyPage} / {historyPagination.totalPages}</span><button type="button" className="secondary" disabled={historyPage >= historyPagination.totalPages} onClick={() => setHistoryPage(value => value + 1)}>{c.next}</button></nav>}</details>}
    {data.baseline && <dl className="execution-snapshot"><div><dt>{c.symbol}</dt><dd>{data.baseline.snapshot.symbol}</dd><dd className="muted">{c.executionCurrentPlan}: {data.planSnapshot?.symbol ?? c.executionUnavailableValue}</dd></div><div><dt>{c.setupType}</dt><dd>{data.baseline.snapshot.setupType ?? c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {data.planSnapshot?.setupType ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionBaselineEntry}</dt><dd>{data.baseline.snapshot.entryPrice ?? c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {data.planSnapshot?.entryPrice ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionBaselineZone}</dt><dd>{[data.baseline.snapshot.entryZoneLow, data.baseline.snapshot.entryZoneHigh].filter(Boolean).join(' – ') || c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {[data.planSnapshot?.entryZoneLow, data.planSnapshot?.entryZoneHigh].filter(Boolean).join(' – ') || c.executionUnavailableValue}</dd></div><div><dt>{c.invalidationCondition}</dt><dd>{data.baseline.snapshot.invalidationCondition ?? c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {data.planSnapshot?.invalidationCondition ?? c.executionUnavailableValue}</dd></div></dl>}
    <p className="muted execution-scope">{c.executionScopeUnknown} · {c.executionUnitUnknown}</p>
    {data.selectedTransactions.length === 0 ? <p>{c.executionNoTransactions}</p> : <ul className="execution-selected-list">{data.selectedTransactions.map(transaction => <li key={transaction.relationId} data-status={transaction.selectionStatus}><strong>{transaction.type} · {transaction.quantity} @ {transaction.price}</strong><time dateTime={transaction.tradeDate}>{dateTime(transaction.tradeDate, locale)}</time>{transaction.selectionStatus === 'missing' && <p className="muted">{c.executionMissing}: {transaction.snapshot.symbol} · {transaction.snapshot.type} · {transaction.snapshot.quantity} @ {transaction.snapshot.price} · {dateTime(transaction.snapshot.tradeDate, locale)}</p>}{transaction.selectionStatus === 'changed' && transaction.current && <p className="muted">{c.executionChanged}: {transaction.snapshot.symbol !== transaction.current.symbol && `${c.symbol} ${transaction.snapshot.symbol} → ${transaction.current.symbol} · `}{transaction.snapshot.type !== transaction.current.type && `${c.executionType} ${transaction.snapshot.type} → ${transaction.current.type} · `}{transaction.snapshot.price !== transaction.current.price && `${c.entryPrice} ${transaction.snapshot.price} → ${transaction.current.price} · `}{transaction.snapshot.quantity !== transaction.current.quantity && `${c.executionQuantity} ${transaction.snapshot.quantity} → ${transaction.current.quantity} · `}{transaction.snapshot.tradeDate !== transaction.current.tradeDate && `${c.executionAt} ${dateTime(transaction.snapshot.tradeDate, locale)} → ${dateTime(transaction.current.tradeDate, locale)}`}</p>}</li>)}</ul>}
    <dl className="execution-values"><div><dt>{c.executionQuantity}</dt><dd>{data.buyQuantity ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionAverage}</dt><dd>{data.averageExecutionPrice ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionDelta}</dt><dd>{data.entryPriceDelta ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionDeltaPercent}</dt><dd>{data.entryPriceDeltaPercent ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionZone}</dt><dd>{data.entryZoneRelation === 'inside' ? c.executionInside : data.entryZoneRelation === 'below' ? c.executionBelow : data.entryZoneRelation === 'above' ? c.executionAbove : c.executionUnavailableValue}</dd></div></dl>
    {data.deviationReason && <p>{c.executionReason}: {data.deviationReason}</p>}
  </div>
}
