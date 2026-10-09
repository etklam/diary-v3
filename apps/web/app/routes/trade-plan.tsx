import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { authUserResponseSchema } from '@diary/contracts'
import { diarySummaryListResponseSchema, type DiarySummary } from '@diary/contracts/diary-summary'
import { TRADE_PLAN_STATUSES, tradePlanInputSchema, tradePlanResponseSchema, type TradePlanResponse } from '@diary/contracts/trade-plan'
import {
  tradePlanExecutionBaselineHistoryResponseSchema,
  tradePlanExecutionCandidatesResponseSchema,
  tradePlanExecutionComparisonSchema,
  type TradePlanExecutionBaseline,
  type TradePlanExecutionCandidate,
  type TradePlanExecutionComparison,
} from '@diary/contracts/trade-plan-execution'
import type { z } from 'zod'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error'
import { csrfToken, getSessionRevision, sessionFetch, signInPath, useSessionState } from '../session'
import { clearDraftEnvelope, readDraftEnvelope, useDraftLifecycle } from '../draft-lifecycle'
import { formFromTradePlan, normalizeTradePlanForm, sameTradePlanForm, tradePlanDraftKey, tradePlanFields, type TradePlanField, type TradePlanForm } from '../trade-plan-draft'
import { planCopy } from '../trade-plan-copy'
import { formatAmount, formatDay, formatInstantUtc, formatQuantity, formatSignedAmount, formatSignedPercent } from '../market-display'
import '../trade-plan.css'

type PickerDiary = Pick<DiarySummary, 'id' | 'title' | 'date' | 'stockSymbols'>
type RequestResult<T> = { response: Response; data: T | null; failure: Failure | null }
type PlanCopy = typeof planCopy[keyof typeof planCopy]
type Translate = (key: never) => string

const emptyForm = formFromTradePlan()

function isTradePlanForm(value: unknown): value is TradePlanForm {
  return Boolean(value && typeof value === 'object' && tradePlanFields.every(key => typeof (value as Record<string, unknown>)[key] === 'string'))
}

function readPositionSizingPrefill(raw: string | null): Partial<TradePlanForm> | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    const patch: Partial<TradePlanForm> = {}
    for (const key of ['symbol', 'status', 'entryPrice', 'maxPositionSize', 'notes'] as const) {
      if (typeof record[key] === 'string') patch[key] = record[key]
    }
    return Object.keys(patch).length ? patch : null
  } catch {
    return null
  }
}

function pickerDiaryFromPlan(plan: TradePlanResponse | null): PickerDiary | null {
  return plan?.diary ? {
    id: plan.diary.id,
    title: plan.diary.title,
    date: plan.diary.date,
    stockSymbols: [],
  } : null
}

async function requestJson<T>(path: string, schema: z.ZodType<T>, init: RequestInit | undefined, fallback: string): Promise<RequestResult<T>> {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && !csrfToken()) await sessionFetch('/api/auth/me')
  try {
    const response = await sessionFetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-csrf-token': csrfToken() ?? '' } : {}),
        ...init?.headers,
      },
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) return { response, data: null, failure: apiFailure(body, fallback) }
    const parsed = schema.safeParse(body)
    if (!parsed.success) return { response, data: null, failure: { message: fallback, code: 'SYS_VALIDATION_ERROR', fields: [] } }
    return { response, data: parsed.data, failure: null }
  } catch {
    return { response: Response.error(), data: null, failure: apiFailure(null, fallback) }
  }
}

function statusText(c: PlanCopy, status: TradePlanExecutionComparison['comparisonStatus']) {
  if (status === 'ready') return c.executionReady
  if (status === 'outdated') return c.executionOutdated
  if (status === 'conflict') return c.executionConflict
  if (status === 'unavailable') return c.executionUnavailable
  return c.executionUnconfirmed
}

function zoneText(c: PlanCopy, relation: TradePlanExecutionComparison['entryZoneRelation']) {
  if (relation === 'inside') return c.executionInside
  if (relation === 'below') return c.executionBelow
  if (relation === 'above') return c.executionAbove
  return c.executionUnavailableValue
}

function dateTime(value: string, locale: string) {
  const formatted = formatInstantUtc(locale, value)
  return formatted === '—' ? value : formatted
}

function DiaryPicker({ value, onChange, c, t }: { value: PickerDiary | null; onChange: (diary: PickerDiary | null) => void; c: PlanCopy; t: Translate }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [symbol, setSymbol] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<z.infer<typeof diarySummaryListResponseSchema> | null>(null)
  const [error, setError] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const composing = useRef(false)
  const translate = useRef(t)
  translate.current = t

  useEffect(() => {
    if (open) {
      if (!dialog.current?.open) dialog.current?.showModal()
    } else if (dialog.current?.open) {
      dialog.current.close()
      trigger.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open || composing.current) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true); setError(null)
      api.GET('/api/diaries/summary', {
        params: { query: {
          page, limit: 20, sortBy: 'date-desc',
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(symbol.trim() ? { symbol: symbol.trim() } : {}),
          ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}),
        } }, signal: controller.signal,
      }).then(response => {
        if (controller.signal.aborted) return
        if (response.response.ok && response.data) {
          const parsed = diarySummaryListResponseSchema.safeParse(response.data)
          if (parsed.success) setResult(parsed.data)
          else setError({ message: translate.current('failed' as never), code: 'SYS_VALIDATION_ERROR', fields: [] })
        } else setError(apiFailure(response.error, translate.current('failed' as never)))
      }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection' as never))) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [open, page, search, symbol, dateFrom, dateTo, refresh])

  function openPicker() { setResult(null); setError(null); setLoading(true); setPage(1); setOpen(true) }
  function closePicker() { setOpen(false) }
  function updateQuery(setter: (value: string) => void, value: string) { setter(value); setPage(1); setResult(null); setError(null); setLoading(true) }
  function clearFilters() { setSearch(''); setSearchInput(''); setSymbol(''); setDateFrom(''); setDateTo(''); setPage(1); setResult(null); setError(null); setLoading(true) }
  function retryPicker() { setResult(null); setError(null); setLoading(true); setRefresh(value => value + 1) }
  function select(diary: DiarySummary) {
    onChange({ id: diary.id, title: diary.title, date: diary.date, stockSymbols: diary.stockSymbols }); closePicker()
  }

  return <div className="diary-picker">
    {value ? <div className="linked-diary"><span className="muted">{c.pickerLinked}</span><Link to={`/diaries/${value.id}`}>{value.title} · {value.date}</Link><button type="button" className="secondary" onClick={() => onChange(null)}>{c.pickerRemove}</button></div> : <p className="muted">{c.none}</p>}
    <button ref={trigger} type="button" className="secondary" onClick={openPicker}>{c.pickerOpen}</button>
    <dialog ref={dialog} className="plan-dialog" aria-labelledby="diary-picker-title" onCancel={event => { event.preventDefault(); closePicker() }}>
      <header className="plan-dialog-header"><h2 id="diary-picker-title">{c.pickerTitle}</h2><button type="button" className="secondary" onClick={closePicker}>{c.pickerCancel}</button></header>
      <div className="picker-filters">
        <label>{c.pickerSearch}<input type="search" value={searchInput} maxLength={500} onCompositionStart={() => { composing.current = true }} onCompositionEnd={event => { composing.current = false; const value = event.currentTarget.value; setSearchInput(value); updateQuery(setSearch, value) }} onChange={event => { const value = event.target.value; setSearchInput(value); if (!composing.current) updateQuery(setSearch, value) }} /></label>
        <label>{c.pickerSymbol}<input value={symbol} maxLength={20} onChange={event => updateQuery(setSymbol, event.target.value)} /></label>
        <label>{c.pickerFrom}<input type="date" value={dateFrom} onChange={event => updateQuery(setDateFrom, event.target.value)} /></label>
        <label>{c.pickerTo}<input type="date" value={dateTo} onChange={event => updateQuery(setDateTo, event.target.value)} /></label>
        <button type="button" className="secondary" onClick={clearFilters}>{c.pickerClear}</button>
      </div>
      <div className="picker-results" aria-busy={loading}>
        {loading && <p role="status">{c.pickerLoading}</p>}
        {error && <><FailureNotice failure={error} id="diary-picker-error"/><button type="button" className="secondary" onClick={retryPicker}>{t('retry' as never)}</button></>}
        {!loading && !error && result?.data.length === 0 && <p role="status">{c.pickerEmpty}</p>}
        {!loading && result && result.data.length > 0 && <ul className="picker-list">{result.data.map(diary => <li key={diary.id}><div><strong>{diary.title}</strong><time dateTime={diary.date}>{diary.date}</time>{diary.stockSymbols.length > 0 && <span className="muted">{diary.stockSymbols.join(', ')}</span>}</div><button type="button" disabled={loading} onClick={() => select(diary)}>{c.pickerSelect}</button></li>)}</ul>}
      </div>
      {!loading && result && result.pagination.totalPages > 0 && <nav className="plan-pagination" aria-label={c.pickerTitle}><button type="button" className="secondary" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>{c.previous}</button><span>{c.pickerPage} {page} / {result.pagination.totalPages}</span><button type="button" className="secondary" disabled={loading || page >= result.pagination.totalPages} onClick={() => setPage(value => value + 1)}>{c.next}</button></nav>}
    </dialog>
  </div>
}

function executionDraftChanged(draft: { selectedIds: string[]; removedRelationIds: string[]; reason: string; comparison: TradePlanExecutionComparison | null }) {
  if (!draft.comparison) return false
  return [...draft.selectedIds].sort().join(',') !== draft.comparison.selectedTransactions.flatMap(row => row.transactionId ? [row.transactionId] : []).sort().join(',')
    || draft.removedRelationIds.length > 0 || draft.reason !== (draft.comparison.deviationReason ?? '')
}

function ExecutionComparison({ plan, c, locale, t }: { plan: TradePlanResponse; c: PlanCopy; locale: string; t: Translate }) {
  const amount = (value: string | number | null | undefined) => formatAmount(locale, value)
  const quantity = (value: string | number | null | undefined) => formatQuantity(locale, value)
  // A baseline snapshot can predate a field, and "Unavailable" says something the
  // em dash does not: the comparison itself cannot be made.
  const price = (value: string | number | null | undefined) => value == null ? c.executionUnavailableValue : amount(value)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(true)
  const [comparison, setComparison] = useState<TradePlanExecutionComparison | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [history, setHistory] = useState<TradePlanExecutionBaseline[]>([])
  const [historyPagination, setHistoryPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [historyAttempt, setHistoryAttempt] = useState(0)
  const [candidates, setCandidates] = useState<TradePlanExecutionCandidate[]>([])
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidatePagination, setCandidatePagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [removedRelationIds, setRemovedRelationIds] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<Failure | null>(null)
  const [notice, setNotice] = useState('')
  const acceptedRevision = useRef(-1)
  const acceptComparison = useCallback((next: TradePlanExecutionComparison) => {
    const revision = next.executionRevision ?? -1
    if (revision < acceptedRevision.current) return false
    acceptedRevision.current = revision
    setComparison(next)
    return true
  }, [])
  const draft = useRef({ selectedIds, removedRelationIds, reason, comparison })
  useEffect(() => { draft.current = { selectedIds, removedRelationIds, reason, comparison } }, [selectedIds, removedRelationIds, reason, comparison])

  const loadComparison = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null)
    const result = await requestJson<TradePlanExecutionComparison>(`/api/trade-plans/${encodeURIComponent(plan.id)}/execution`, tradePlanExecutionComparisonSchema, { signal }, c.executionLoadFailed)
    if (signal?.aborted) return
    if (result.data) {
      const preserveDraft = executionDraftChanged(draft.current)
      if (!acceptComparison(result.data)) { setLoading(false); return }
      setHistory(result.data.baselineHistory)
      setHistoryPage(1)
      setHistoryPagination(null)
      if (!preserveDraft) {
        setSelectedIds(result.data.selectedTransactions.flatMap(transaction => transaction.transactionId ? [transaction.transactionId] : []))
        setRemovedRelationIds([])
        setReason(result.data.deviationReason ?? '')
      }
    }
    else if (result.failure) setError(result.failure)
    setLoading(false)
  }, [plan.id, plan.updatedAt, c.executionLoadFailed, acceptComparison])

  useEffect(() => {
    if (!expanded) return
    const controller = new AbortController()
    void loadComparison(controller.signal)
    return () => controller.abort()
  }, [expanded, loadComparison])

  useEffect(() => {
    if (!historyOpen) return
    const controller = new AbortController()
    setHistoryLoading(true); setHistoryError(false)
    void requestJson<z.infer<typeof tradePlanExecutionBaselineHistoryResponseSchema>>(`/api/trade-plans/${encodeURIComponent(plan.id)}/execution-baselines?page=${historyPage}&limit=20`, tradePlanExecutionBaselineHistoryResponseSchema, { signal: controller.signal }, c.executionLoadFailed).then(result => {
      if (controller.signal.aborted) return
      if (result.data) { setHistory(result.data.data); setHistoryPagination(result.data.pagination) }
      else if (result.failure) setHistoryError(true)
      if (!controller.signal.aborted) setHistoryLoading(false)
    })
    return () => controller.abort()
  }, [historyOpen, historyPage, historyAttempt, plan.id, comparison?.baseline?.version, c.executionLoadFailed])

  useEffect(() => {
    if (pickerOpen) {
      if (!dialog.current?.open) dialog.current?.showModal()
      const controller = new AbortController()
      void requestJson<z.infer<typeof tradePlanExecutionCandidatesResponseSchema>>(`/api/trade-plans/${encodeURIComponent(plan.id)}/execution-candidates?page=${candidatePage}&limit=20`, tradePlanExecutionCandidatesResponseSchema, { signal: controller.signal }, c.executionLoadFailed).then(result => {
        if (controller.signal.aborted) return
        if (result.data) { setCandidates(result.data.data); setCandidatePagination(result.data.pagination) }
        else if (result.failure) setError(result.failure)
      })
      return () => controller.abort()
    }
    if (dialog.current?.open) dialog.current.close()
    trigger.current?.focus()
  }, [pickerOpen, candidatePage, plan.id, c.executionLoadFailed])

  async function confirmBaseline() {
    setPending(true); setError(null); setNotice('')
    const result = await requestJson<TradePlanExecutionComparison>(`/api/trade-plans/${encodeURIComponent(plan.id)}/execution-baseline`, tradePlanExecutionComparisonSchema, { method: 'POST', body: JSON.stringify({ expectedPlanUpdatedAt: plan.updatedAt, expectedBaselineVersion: comparison?.baseline?.version ?? null, expectedExecutionRevision: comparison?.executionRevision ?? null }) }, c.executionBaselineFailed)
    if (result.data && acceptComparison(result.data)) { setHistory(result.data.baselineHistory); setHistoryPage(1); setHistoryPagination(null); if (!executionDraftChanged(draft.current)) { setSelectedIds(result.data.selectedTransactions.flatMap(transaction => transaction.transactionId ? [transaction.transactionId] : [])); setRemovedRelationIds([]) }; setNotice(result.data.comparisonStatus === 'unavailable' ? c.executionBaselineConfirmed : c.executionReady) }
    else if (result.failure) setError(result.failure)
    setPending(false)
  }

  async function saveSelection() {
    const uniqueIds = [...new Set(selectedIds)]
    if (!comparison?.baseline || comparison.executionRevision === null) return
    setPending(true); setError(null); setNotice('')
    const result = await requestJson<TradePlanExecutionComparison>(`/api/trade-plans/${encodeURIComponent(plan.id)}/execution`, tradePlanExecutionComparisonSchema, { method: 'PUT', body: JSON.stringify({ transactionIds: uniqueIds, removeRelationIds: removedRelationIds, deviationReason: reason.trim() || null, baselineVersion: comparison.baseline.version, expectedExecutionRevision: comparison.executionRevision }) }, c.executionLoadFailed)
    if (result.data && acceptComparison(result.data)) { setSelectedIds(result.data.selectedTransactions.flatMap(transaction => transaction.transactionId ? [transaction.transactionId] : [])); setRemovedRelationIds([]); setReason(result.data.deviationReason ?? ''); setNotice(c.executionSaved); setPickerOpen(false) }
    else if (result.failure) setError(result.failure)
    setPending(false)
  }

  function toggleCandidate(candidate: TradePlanExecutionCandidate) {
    if (candidate.linkedPlanId && candidate.linkedPlanId !== plan.id) return
    if (!selectedIds.includes(candidate.id)) {
      const relation = selectedRows.find(row => row.transactionId === candidate.id)
      if (relation) setRemovedRelationIds(ids => ids.filter(id => id !== relation.relationId))
    }
    setSelectedIds(current => current.includes(candidate.id) ? current.filter(id => id !== candidate.id) : [...current, candidate.id])
  }

  function removeSelected(transactionId: string) {
    setSelectedIds(current => current.filter(id => id !== transactionId))
  }

  function removeRelation(relationId: string, transactionId: string | null) {
    if (transactionId) removeSelected(transactionId)
    setRemovedRelationIds(current => current.includes(relationId) ? current : [...current, relationId])
  }

  const selectedRows = comparison?.selectedTransactions ?? []
  const selectionChanged = executionDraftChanged({ selectedIds, removedRelationIds, reason, comparison })
  // Before a transaction is chosen there is nothing to compare, so the region
  // says what to do instead of rendering five boxes that all read "Unavailable".
  const nothingSelected = selectedRows.length === 0 && selectedIds.length === 0

  return <section className="plan-execution" aria-labelledby="plan-execution-title">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary id="plan-execution-title">{c.executionTitle}</summary>
      <p className="muted">{c.executionHint}</p>
      {loading && <p role="status">{t('loading' as never)}</p>}
      {error && <FailureNotice failure={error} id="execution-error"/>}
      {comparison && <>
        <p className="execution-status" role="status"><span className="execution-status-label">{c.executionStatusLabel}</span><span className={`badge ${comparison.comparisonStatus === 'ready' ? 'badge-info' : 'badge-warn'}`}>{statusText(c, comparison.comparisonStatus)}</span></p>
        {comparison.baseline && <p className="muted">{c.executionVersion} {comparison.baseline.version} · {c.executionAt} {dateTime(comparison.baseline.confirmedAt, locale)}{comparison.baselineStatus === 'outdated' ? ` · ${c.executionOutdated}` : ''}{comparison.comparisonTiming === 'retrospective' ? ` · ${c.executionTimingRetrospective}` : comparison.comparisonTiming === 'unknown' ? ` · ${c.executionTimingUnknown}` : ''}</p>}
        {(!comparison.baseline || comparison.baselineStatus === 'outdated') && <button type="button" className="secondary" disabled={pending} onClick={() => void confirmBaseline()}>{pending ? t('pending' as never) : comparison.baseline ? c.executionConfirmNewVersion : c.executionConfirm}</button>}
        {history.length > 0 && <details className="execution-history" onToggle={event => { setHistoryOpen(event.currentTarget.open); if (event.currentTarget.open) setHistoryPage(1) }}><summary>{c.executionHistory}</summary>{historyLoading && <p role="status">{t('loading' as never)}</p>}{historyError && <><p role="status">{c.executionLoadFailed}</p><button type="button" className="secondary" onClick={() => setHistoryAttempt(value => value + 1)}>{t('retry' as never)}</button></>}<ul>{history.map(item => <li key={item.id}><strong>{c.executionVersion} {item.version}</strong> · {dateTime(item.confirmedAt, locale)} · {c.symbol} {item.snapshot.symbol} · {c.setupType} {item.snapshot.setupType ?? c.executionUnavailableValue} · {c.executionBaselineEntry} {price(item.snapshot.entryPrice)} · {c.executionBaselineZone} {[item.snapshot.entryZoneLow, item.snapshot.entryZoneHigh].filter(Boolean).map(bound => amount(bound)).join(' – ') || c.executionUnavailableValue} · {c.stopLoss} {price(item.snapshot.stopLoss)} · {c.targetPrice} {price(item.snapshot.targetPrice)} · {c.maxPositionSize} {price(item.snapshot.maxPositionSize)} · {c.invalidationCondition} {item.snapshot.invalidationCondition ?? c.executionUnavailableValue}{item.id === comparison.baseline?.id && ` · ${c.executionCurrent}`}</li>)}</ul>{historyPagination && historyPagination.totalPages > 1 && <nav className="plan-pagination" aria-label={c.executionHistory}><button type="button" className="secondary" disabled={historyPage <= 1} onClick={() => setHistoryPage(value => value - 1)}>{c.previous}</button><span>{c.pickerPage} {historyPage} / {historyPagination.totalPages}</span><button type="button" className="secondary" disabled={historyPage >= historyPagination.totalPages} onClick={() => setHistoryPage(value => value + 1)}>{c.next}</button></nav>}</details>}
        {comparison.baseline && <dl className="execution-snapshot"><div><dt>{c.symbol}</dt><dd>{comparison.baseline.snapshot.symbol}</dd><dd className="muted">{c.executionCurrentPlan}: {comparison.planSnapshot?.symbol ?? c.executionUnavailableValue}</dd></div><div><dt>{c.setupType}</dt><dd>{comparison.baseline.snapshot.setupType ?? c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {comparison.planSnapshot?.setupType ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionBaselineEntry}</dt><dd>{comparison.baseline.snapshot.entryPrice ?? c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {comparison.planSnapshot?.entryPrice ?? c.executionUnavailableValue}</dd></div><div><dt>{c.executionBaselineZone}</dt><dd>{[comparison.baseline.snapshot.entryZoneLow, comparison.baseline.snapshot.entryZoneHigh].filter(Boolean).join(' – ') || c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {[comparison.planSnapshot?.entryZoneLow, comparison.planSnapshot?.entryZoneHigh].filter(Boolean).join(' – ') || c.executionUnavailableValue}</dd></div><div><dt>{c.invalidationCondition}</dt><dd>{comparison.baseline.snapshot.invalidationCondition ?? c.executionUnavailableValue}</dd><dd className="muted">{c.executionCurrentPlan}: {comparison.planSnapshot?.invalidationCondition ?? c.executionUnavailableValue}</dd></div></dl>}
        <p className="muted execution-scope">{c.executionScopeUnknown} · {c.executionUnitUnknown}</p>
        {nothingSelected
          ? <div className="empty-state"><p>{c.executionNoTransactions}</p><button ref={trigger} type="button" className="secondary" disabled={pending || !comparison.baseline} onClick={() => { setCandidatePage(1); setPickerOpen(true) }}>{c.executionSelect}</button>{!comparison.baseline && <p className="muted">{c.executionNeedBaseline}</p>}</div>
          : <div className="execution-actions"><button ref={trigger} type="button" className="secondary" disabled={pending || !comparison.baseline} onClick={() => { setCandidatePage(1); setPickerOpen(true) }}>{c.executionSelect}</button></div>}
        {selectionChanged && <p role="status">{c.executionPending} · {c.executionSelected}: {selectedIds.length}</p>}
        {selectedRows.length > 0 && <ul className="execution-selected-list">{selectedRows.map(transaction => <li key={transaction.relationId} data-status={transaction.selectionStatus}><div className="execution-selected-heading"><strong>{transaction.type} · {quantity(transaction.quantity)} @ {amount(transaction.price)}</strong><button type="button" className="secondary" onClick={() => removeRelation(transaction.relationId, transaction.transactionId)}>{c.executionRemove}</button></div><time dateTime={transaction.tradeDate}>{dateTime(transaction.tradeDate, locale)}</time>{transaction.selectionStatus === 'missing' && <p className="muted">{c.executionMissing}: {transaction.snapshot.symbol} · {transaction.snapshot.type} · {quantity(transaction.snapshot.quantity)} @ {amount(transaction.snapshot.price)} · {dateTime(transaction.snapshot.tradeDate, locale)}</p>}{transaction.selectionStatus === 'changed' && transaction.current && <p className="muted">{c.executionChanged}: {transaction.snapshot.symbol !== transaction.current.symbol && `${c.symbol} ${transaction.snapshot.symbol} → ${transaction.current.symbol} · `}{transaction.snapshot.type !== transaction.current.type && `${c.executionType} ${transaction.snapshot.type} → ${transaction.current.type} · `}{transaction.snapshot.price !== transaction.current.price && `${c.entryPrice} ${amount(transaction.snapshot.price)} → ${amount(transaction.current.price)} · `}{transaction.snapshot.quantity !== transaction.current.quantity && `${c.executionQuantity} ${quantity(transaction.snapshot.quantity)} → ${quantity(transaction.current.quantity)} · `}{transaction.snapshot.tradeDate !== transaction.current.tradeDate && `${c.executionAt} ${dateTime(transaction.snapshot.tradeDate, locale)} → ${dateTime(transaction.current.tradeDate, locale)}`}</p>}</li>)}</ul>}
        {!nothingSelected && <dl className="ledger execution-values"><div className="ledger-row"><dt>{c.executionQuantity}</dt><dd>{comparison.buyQuantity == null ? c.executionUnavailableValue : quantity(comparison.buyQuantity)}</dd></div><div className="ledger-row"><dt>{c.executionAverage}</dt><dd>{price(comparison.averageExecutionPrice)}</dd></div><div className="ledger-row execution-row-text"><dt>{c.executionZone}</dt><dd>{zoneText(c, comparison.entryZoneRelation)}</dd></div><div className="ledger-row ledger-row-total"><dt>{c.executionDelta}</dt><dd>{comparison.entryPriceDelta == null ? c.executionUnavailableValue : formatSignedAmount(locale, comparison.entryPriceDelta)}</dd></div><div className="ledger-row"><dt>{c.executionDeltaPercent}</dt><dd>{comparison.entryPriceDeltaPercent == null ? c.executionUnavailableValue : formatSignedPercent(locale, comparison.entryPriceDeltaPercent)}</dd></div></dl>}
        <label className="plan-wide execution-reason">{c.executionReason}<textarea rows={3} maxLength={2000} value={reason} placeholder={c.executionReasonHint} onChange={event => setReason(event.target.value)}/></label>
        <div className="execution-commit"><p className="muted">{c.executionSaveScope}</p><div className="actions"><button type="button" className="secondary" disabled={pending || !comparison.baseline || comparison.executionRevision === null} onClick={() => void saveSelection()}>{pending ? t('pending' as never) : c.executionSave}</button>{!pending && (!comparison.baseline || comparison.executionRevision === null) && <span className="muted">{c.executionNeedBaseline}</span>}</div></div>
        {notice && <p role="status">{notice}</p>}
      </>}
    </details>
    <dialog ref={dialog} className="plan-dialog" aria-labelledby="execution-picker-title" onCancel={event => { event.preventDefault(); setPickerOpen(false) }}>
      <header className="plan-dialog-header"><h2 id="execution-picker-title">{c.executionCandidates}</h2><button type="button" className="secondary" onClick={() => setPickerOpen(false)}>{c.executionClose}</button></header>
      {candidates.length === 0 ? <p role="status">{c.executionNoCandidates}</p> : <ul className="picker-list execution-picker-list">{candidates.map(candidate => { const disabled = Boolean(candidate.linkedPlanId && candidate.linkedPlanId !== plan.id); return <li key={candidate.id}><label><input type="checkbox" checked={selectedIds.includes(candidate.id)} disabled={disabled} onChange={() => toggleCandidate(candidate)}/><span><strong>{candidate.type} · {amount(candidate.price)}</strong><time dateTime={candidate.tradeDate}>{formatDay(candidate.tradeDate)}</time><span className="muted">{quantity(candidate.quantity)}</span>{disabled && <span className="muted">{c.executionConflict}</span>}</span></label></li> })}</ul>}
      {candidatePagination && candidatePagination.totalPages > 1 && <nav className="plan-pagination" aria-label={c.executionCandidates}><button type="button" className="secondary" disabled={candidatePage <= 1} onClick={() => setCandidatePage(value => value - 1)}>{c.previous}</button><span>{c.pickerPage} {candidatePage} / {candidatePagination.totalPages}</span><button type="button" className="secondary" disabled={candidatePage >= candidatePagination.totalPages} onClick={() => setCandidatePage(value => value + 1)}>{c.next}</button></nav>}
      <footer className="plan-dialog-footer"><button type="button" className="secondary" onClick={() => setPickerOpen(false)}>{c.pickerCancel}</button><button type="button" onClick={() => setPickerOpen(false)}>{c.pickerSelect}</button></footer>
    </dialog>
  </section>
}

export default function TradePlan() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefill = params.get('prefill')
  const { locale, t } = useUi()
  const c = planCopy[locale]
  const session = useSessionState()
  const [form, setForm] = useState<TradePlanForm>(emptyForm)
  const [plan, setPlan] = useState<TradePlanResponse | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const routeKey = id ?? 'new'
  const [loadedRouteKey, setLoadedRouteKey] = useState<string | null>(null)
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null)
  const [loadedSessionRevision, setLoadedSessionRevision] = useState<number | null>(null)
  const [ownerStatus, setOwnerStatus] = useState<'pending' | 'ready' | 'unauthorized' | 'error'>('pending')
  const [serverBaseline, setServerBaseline] = useState<TradePlanForm | null>(null)
  const [selectedDiary, setSelectedDiary] = useState<PickerDiary | null>(null)
  const [restorable, setRestorable] = useState<TradePlanForm | null>(null)
  const [prefillConflict, setPrefillConflict] = useState<{ draft: TradePlanForm; prefill: Partial<TradePlanForm> } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Failure | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [draftStatus, setDraftStatus] = useState<'none' | 'saved' | 'unavailable'>('none')
  const [attempt, retry] = useState(0)
  const initializedDraft = useRef<string | null>(null)
  const active = useRef(true)
  const sessionIdentity = `${session.revision}:${session.authenticated}`
  const observedSessionIdentity = useRef(sessionIdentity)
  const viewGeneration = useRef(0)
  const mutationController = useRef<AbortController | null>(null)
  const allowNavigation = useRef(false)
  const currentAccountId = useRef<string | null>(null)
  currentAccountId.current = accountId
  const translate = useRef(t)
  translate.current = t

  const accountConfirmed = session.authenticated === true && ownerStatus === 'ready' && accountId !== null
  const routeReady = accountConfirmed && loadedRouteKey === routeKey && loadedAccountId === accountId && loadedSessionRevision === session.revision && loaded
  const draftKey = routeReady ? tradePlanDraftKey(accountId, id) : null
  const dirty = useMemo(() => serverBaseline !== null && !sameTradePlanForm(form, serverBaseline), [form, serverBaseline])
  const draftPaused = !routeReady || serverBaseline === null || Boolean(restorable || prefillConflict)
  const onDraftPersist = useCallback((persisted: boolean) => {
    if (persisted) setDraftStatus('saved')
    else if (dirty) setDraftStatus('unavailable')
  }, [dirty])
  const { suppressDraft } = useDraftLifecycle({ key: draftKey, value: form, dirty, paused: draftPaused, onPersist: onDraftPersist })
  const blocker = useBlocker(() => !allowNavigation.current && Boolean(dirty) && session.authenticated === true && routeReady)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(c.discard)) { suppressDraft(); blocker.proceed() } else blocker.reset()
  }, [blocker, c.discard, suppressDraft])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])

  useEffect(() => {
    if (observedSessionIdentity.current === sessionIdentity) return
    observedSessionIdentity.current = sessionIdentity
    viewGeneration.current += 1
    active.current = false
    mutationController.current?.abort()
    mutationController.current = null
    initializedDraft.current = null
    setAccountId(null)
    setLoadedAccountId(null)
    setLoadedSessionRevision(null)
    setLoadedRouteKey(null)
    setOwnerStatus(session.authenticated === false ? 'unauthorized' : 'pending')
    setPlan(null)
    setForm(emptyForm)
    setServerBaseline(null)
    setSelectedDiary(null)
    setRestorable(null)
    setPrefillConflict(null)
    setError(null)
    setPending(false)
    setSaved(false)
    setDraftStatus('none')
    setLoaded(false)
    setLoading(session.authenticated !== false)
  }, [sessionIdentity, session.authenticated])

  useEffect(() => {
    const controller = new AbortController()
    const requestRevision = session.revision
    if (session.authenticated === false) {
      setAccountId(null); setLoadedAccountId(null); setLoadedSessionRevision(null); setOwnerStatus('unauthorized')
      return () => controller.abort()
    }
    setAccountId(null); setLoadedAccountId(null); setLoadedSessionRevision(null); setOwnerStatus('pending')
    api.GET('/api/auth/me', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || getSessionRevision() !== requestRevision) return
      const parsed = authUserResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setAccountId(parsed.data.data.id); setOwnerStatus('ready')
      } else if (result.response.status === 401) {
        setAccountId(null); setOwnerStatus('unauthorized')
      } else {
        setOwnerStatus('error'); setError(apiFailure(result.error, translate.current('failed' as never)))
      }
    }).catch(() => {
      if (!controller.signal.aborted && getSessionRevision() === requestRevision) {
        setOwnerStatus('error'); setError(apiFailure(null, translate.current('connection' as never)))
      }
    })
    return () => controller.abort()
  }, [session.authenticated, session.revision, attempt])

  useEffect(() => {
    const generation = ++viewGeneration.current
    allowNavigation.current = false
    setLoadedRouteKey(null)
    setPlan(null)
    if (!accountConfirmed || !accountId) {
      active.current = false
      setLoadedAccountId(null)
      setLoadedSessionRevision(null)
      setLoaded(false)
      setLoading(session.authenticated !== false)
      return () => { active.current = false }
    }
    active.current = true
    initializedDraft.current = null
    setError(null); setSaved(false); setRestorable(null); setPrefillConflict(null)
    if (!id) {
      setPlan(null); setForm(emptyForm); setServerBaseline(emptyForm); setSelectedDiary(null); setLoadedAccountId(accountId); setLoadedSessionRevision(session.revision); setLoadedRouteKey(routeKey); setLoaded(true); setLoading(false)
      return () => { active.current = false }
    }
    const controller = new AbortController()
    setLoading(true); setLoaded(false); setServerBaseline(null)
    const requestAccountId = accountId
    const requestRevision = session.revision
    api.GET('/api/trade-plans/{id}', { params: { path: { id } }, signal: controller.signal }).then(result => {
      if (!active.current || controller.signal.aborted || generation !== viewGeneration.current || getSessionRevision() !== requestRevision) return
      const parsed = tradePlanResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setPlan(parsed.data); setForm(formFromTradePlan(parsed.data)); setServerBaseline(formFromTradePlan(parsed.data)); setSelectedDiary(pickerDiaryFromPlan(parsed.data)); setLoadedAccountId(requestAccountId); setLoadedSessionRevision(requestRevision); setLoadedRouteKey(routeKey); setLoaded(true)
      } else {
        setLoadedAccountId(requestAccountId); setLoadedSessionRevision(requestRevision); setLoadedRouteKey(routeKey); setLoaded(true); setError(apiFailure(result.error, translate.current('failed' as never)))
      }
      setLoading(false)
    }).catch(() => {
      if (active.current && !controller.signal.aborted && generation === viewGeneration.current && getSessionRevision() === requestRevision) {
        setLoadedAccountId(requestAccountId); setLoadedSessionRevision(requestRevision); setLoadedRouteKey(routeKey); setLoaded(true); setError(apiFailure(null, translate.current('connection' as never))); setLoading(false)
      }
    })
    return () => { active.current = false; controller.abort(); mutationController.current?.abort() }
  }, [id, routeKey, attempt, accountConfirmed, accountId, session.authenticated, session.revision])

  useEffect(() => {
    if (!accountConfirmed || !accountId || !draftKey || !serverBaseline || !routeReady || initializedDraft.current === draftKey) return
    initializedDraft.current = draftKey
    const draft = readDraftEnvelope(draftKey, isTradePlanForm)
    const sizing = !id && prefill === 'position-sizing' && typeof window !== 'undefined' ? readPositionSizingPrefill(sessionStorage.getItem('tradePlanPrefill')) : null
    if (draft && !sameTradePlanForm(draft, serverBaseline)) {
      if (sizing) setPrefillConflict({ draft, prefill: sizing })
      else setRestorable(draft)
    } else if (sizing) {
      setForm(current => ({ ...current, ...sizing })); sessionStorage.removeItem('tradePlanPrefill')
    }
  }, [accountConfirmed, accountId, draftKey, serverBaseline, routeReady, id, prefill])

  function applyDraft(value: TradePlanForm) { setForm(value); setRestorable(null); setPrefillConflict(null); setDraftStatus('saved') }
  function applyPrefill(value: Partial<TradePlanForm>) { setForm(current => ({ ...current, ...value })); setRestorable(null); setPrefillConflict(null); if (typeof window !== 'undefined') sessionStorage.removeItem('tradePlanPrefill') }
  function discardDraft() { if (draftKey) clearDraftEnvelope(draftKey); setRestorable(null); setPrefillConflict(null); setDraftStatus('none') }
  function change(key: TradePlanField, value: string) { setSaved(false); setDraftStatus('none'); setForm(current => ({ ...current, [key]: value })) }

  async function save() {
    if (!routeReady || !accountId || session.authenticated !== true) return
    setError(null); setSaved(false)
    const normalized = normalizeTradePlanForm(form)
    const parsed = tradePlanInputSchema.safeParse(normalized.value)
    if (!parsed.success) { setError({ message: t('failed' as never), code: 'SYS_VALIDATION_ERROR', fields: parsed.error.issues.map(issue => issue.path.join('.')) }); return }
    setPending(true)
    const controller = new AbortController()
    const generation = viewGeneration.current
    const requestRevision = session.revision
    const requestAccountId = accountId
    mutationController.current?.abort()
    mutationController.current = controller
    try {
      const response = id
        ? await api.PUT('/api/trade-plans/{id}', { params: { path: { id } }, body: parsed.data, signal: controller.signal })
        : await api.POST('/api/trade-plans', { body: parsed.data, signal: controller.signal })
      const current = active.current && generation === viewGeneration.current && getSessionRevision() === requestRevision && currentAccountId.current === requestAccountId
      if (!current) return
      const result = tradePlanResponseSchema.safeParse(response.data)
      if (!response.response.ok || !result.success) { setError(apiFailure(response.error, t('failed' as never))); return }
      const next = formFromTradePlan(result.data)
      if (id) { if (draftKey) clearDraftEnvelope(draftKey) } else {
        allowNavigation.current = true
        suppressDraft()
      }
      setPlan(result.data); setForm(next); setServerBaseline(next); setSelectedDiary(pickerDiaryFromPlan(result.data)); setSaved(true); setDraftStatus('none')
      if (!id) navigate(`/trade-plans/${result.data.id}`, { replace: true })
    } catch { if (active.current && generation === viewGeneration.current && getSessionRevision() === requestRevision && currentAccountId.current === requestAccountId) setError(apiFailure(null, t('connection' as never))) }
    finally {
      if (mutationController.current === controller) mutationController.current = null
      if (active.current && generation === viewGeneration.current && getSessionRevision() === requestRevision && currentAccountId.current === requestAccountId) setPending(false)
    }
  }

  async function remove() {
    if (!id || !routeReady || !accountId || session.authenticated !== true || !window.confirm(c.confirm)) return
    setPending(true); setError(null)
    const controller = new AbortController()
    const generation = viewGeneration.current
    const requestRevision = session.revision
    const requestAccountId = accountId
    mutationController.current?.abort()
    mutationController.current = controller
    try {
      const response = await api.DELETE('/api/trade-plans/{id}', { params: { path: { id } }, signal: controller.signal })
      if (!active.current || generation !== viewGeneration.current || getSessionRevision() !== requestRevision || currentAccountId.current !== requestAccountId) return
      if (response.response.ok && response.data?.success) { allowNavigation.current = true; suppressDraft(); navigate('/trade-plans') }
      else setError(apiFailure(response.error, t('failed' as never)))
    } catch { if (active.current && generation === viewGeneration.current && getSessionRevision() === requestRevision && currentAccountId.current === requestAccountId) setError(apiFailure(null, t('connection' as never))) }
    finally {
      if (mutationController.current === controller) mutationController.current = null
      if (active.current && generation === viewGeneration.current && getSessionRevision() === requestRevision && currentAccountId.current === requestAccountId) setPending(false)
    }
  }

  function input(key: TradePlanField, large = false) {
    return <label key={key} className={large ? 'plan-wide' : undefined}>{c[key]}{large ? <textarea aria-label={c[key]} value={form[key]} rows={key === 'notes' ? 5 : 3} maxLength={key === 'notes' ? 10000 : 5000} onChange={event => change(key, event.target.value)} aria-invalid={invalidField(error, key)} aria-describedby={invalidField(error, key) ? 'plan-error' : undefined}/> : <input aria-label={c[key]} required={key === 'symbol'} inputMode={key === 'symbol' || key === 'setupType' ? 'text' : 'decimal'} maxLength={key === 'symbol' ? 32 : key === 'setupType' ? 100 : 32} value={form[key]} onChange={event => change(key, event.target.value)} aria-invalid={invalidField(error, key)} aria-describedby={invalidField(error, key) ? 'plan-error' : undefined}/>}</label>
  }

  if (session.authenticated === false || ownerStatus === 'unauthorized') return <section className="plan-page"><FailureNotice failure={error}/><Link to={signInPath(id ? `/trade-plans/${id}` : '/trade-plans/new')}>{t('login' as never)}</Link></section>
  if (ownerStatus === 'error') return <section className="plan-page"><FailureNotice failure={error}/><button type="button" onClick={() => retry(value => value + 1)}>{t('retry' as never)}</button></section>
  if (loading || !routeReady) return <p role="status">{t('loading' as never)}</p>
  if (id && !plan) return <><FailureNotice failure={error}/>{error?.code?.startsWith('AUTH_') && <Link to={signInPath(`/trade-plans/${id}`)}>{t('login' as never)}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry' as never)}</button><Link to="/trade-plans">{c.back}</Link></>
  return <section className="plan-page">
    <Link to="/trade-plans">{c.back}</Link>
    <header className="plan-header"><div><h1>{id ? `${c.edit} · ${plan?.symbol}` : c.new}</h1><p className="lede">{c.hint}</p></div></header>
    {restorable && <div className="plan-draft-restore" role="status"><span>{c.restore}</span><div className="actions"><button type="button" onClick={() => applyDraft(restorable)}>{c.useDraft}</button><button type="button" className="secondary" onClick={discardDraft}>{c.discardDraft}</button></div></div>}
    {prefillConflict && <div className="plan-draft-restore" role="status"><p>{c.draftConflict}</p><div className="actions"><button type="button" onClick={() => applyDraft(prefillConflict.draft)}>{c.useDraft}</button><button type="button" className="secondary" onClick={() => applyPrefill(prefillConflict.prefill)}>{c.usePrefill}</button></div></div>}
    {selectedDiary?.id && <p className="muted"><Link to={`/diaries/${selectedDiary.id}`}>{c.read}: {selectedDiary.title} · {selectedDiary.date}</Link></p>}
    <form className="plan-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <fieldset disabled={pending || !routeReady}><legend>{c.basic}</legend><div className="plan-grid">{input('symbol')}<label>{c.status}<select aria-label={c.status} value={form.status} onChange={event => change('status', event.target.value)}>{TRADE_PLAN_STATUSES.map(status => <option key={status} value={status}>{c[status]}</option>)}</select></label>{input('setupType')}</div></fieldset>
      <fieldset disabled={pending || !routeReady}><legend>{c.prices}</legend><p className="muted">{c.precision}</p><div className="plan-grid">{(['entryPrice', 'entryZoneLow', 'entryZoneHigh', 'stopLoss', 'targetPrice', 'maxPositionSize'] as const).map(key => input(key))}</div></fieldset>
      <fieldset disabled={pending || !routeReady}><legend>{c.context}</legend><div className="plan-grid"><div className="plan-wide"><label>{c.diaryId}</label><DiaryPicker value={selectedDiary} onChange={diary => { setSelectedDiary(diary); change('diaryId', diary?.id ?? '') }} c={c} t={t as (key: never) => string}/></div>{input('invalidationCondition', true)}{input('notes', true)}</div></fieldset>
      <FailureNotice focusField failure={error} id="plan-error"/>
      {error?.code?.startsWith('AUTH_') && <Link to={signInPath(id ? `/trade-plans/${id}` : '/trade-plans/new')}>{t('login' as never)}</Link>}
      <p className="plan-save-status" role="status">{pending ? c.saving : saved ? c.saved : dirty ? c.notSaved : ''}{!pending && !saved && draftStatus === 'saved' ? ` · ${c.localSaved}` : ''}{!pending && !saved && draftStatus === 'unavailable' ? ` · ${c.draftUnavailable}` : ''}</p>
      <footer className="plan-actions"><button disabled={pending || !routeReady}>{pending ? t('pending' as never) : c.save}</button>{id && <button className="secondary" type="button" disabled={pending || !routeReady} onClick={() => void remove()}>{c.delete}</button>}</footer>
    </form>
    {plan && <ExecutionComparison plan={plan} c={c} locale={locale} t={t as (key: never) => string}/>}
  </section>
}
