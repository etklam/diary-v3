import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { stockWatchlistCreateRequestSchema, stockWatchlistDeleteResponseSchema, stockWatchlistMutationResponseSchema, stockWatchlistReorderResponseSchema, stockWatchlistResponseSchema, type StockWatchlistItem } from '@diary/contracts/watchlist'
import { api, useUi } from '../ui'
import { CaptureEntry } from '../capture-entry'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { getSessionRevision, signInPath, useSessionState } from '../session'
import { watchlistCopy, type WatchlistCopy } from '../watchlist-copy'
import { formatDay } from '../market-display'
import '../trade-plan.css'
import '../watchlist.css'

type SortMode = 'order' | 'research' | 'symbol'
type FilterMode = 'all' | 'researched' | 'unresearched'
type PendingAction = 'move-up' | 'move-down' | 'pin' | 'remove'
type ReorderApi = typeof api & { POST: (path: '/api/stocks/watchlist/reorder', options: { body: { id: string; direction: 'up' | 'down' }; signal?: AbortSignal }) => Promise<{ data?: unknown; error?: unknown; response: Response }> }
const watchlistManagementHeaders = { 'x-watchlist-features': 'management-v1' } as const

function compareCustom(a: StockWatchlistItem, b: StockWatchlistItem) {
  return Number(b.pinned) - Number(a.pinned) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
}

function WatchlistRow({ item, c, sort, index, visibleItems, filteredView, pending, rowError, onMove, onPin, onRemove }: {
  item: StockWatchlistItem
  c: WatchlistCopy
  sort: SortMode
  index: number
  visibleItems: StockWatchlistItem[]
  filteredView: boolean
  pending?: PendingAction
  rowError?: Failure
  onMove: (direction: 'up' | 'down') => void
  onPin: () => void
  onRemove: () => void
}) {
  const canMoveUp = !filteredView && sort === 'order' && index > 0 && visibleItems[index - 1]?.pinned === item.pinned
  const canMoveDown = !filteredView && sort === 'order' && index < visibleItems.length - 1 && visibleItems[index + 1]?.pinned === item.pinned
  const occurredAt = item.latestRecord?.occurredAt
  const disabled = pending !== undefined
  const company = `/stocks/${encodeURIComponent(item.stock.symbol)}`
  return <li className="watch-row" data-testid={`watch-${item.stock.symbol}`}>
    <div className="watch-identity">
      <h3><Link to={company}>{item.stock.symbol}</Link></h3>
      {item.stock.name && <p>{item.stock.name}</p>}
    </div>
    {/* One sentence per row when nothing is researched: the meta column stays out
        of the way rather than repeating the summary column's fallback. */}
    {item.recordCount > 0 && <p className="watch-meta">
      <span className="watch-count">{c.records}: {item.recordCount}</span>{occurredAt && <> · <time dateTime={occurredAt}>{formatDay(occurredAt)}</time></>}
    </p>}
    <p className="watch-summary">{item.latestRecord ? <><span className="muted">{c.latest}: </span>{item.latestRecord.summary}</> : item.recordCount > 0 ? null : c.none}</p>
    <div className="watch-actions" aria-label={`${c.more}: ${item.stock.symbol}`}>
      <Link className="button secondary button-compact" to={company}>{c.viewResearch}</Link>
      <CaptureEntry symbol={item.stock.symbol}/>
      <button type="button" className="secondary button-compact" disabled={disabled || !canMoveUp} onClick={() => onMove('up')} title={filteredView ? c.customHint : undefined}>{c.moveUp}</button>
      <button type="button" className="secondary button-compact" disabled={disabled || !canMoveDown} onClick={() => onMove('down')} title={filteredView ? c.customHint : undefined}>{c.moveDown}</button>
      <button type="button" className="secondary button-compact" disabled={disabled} onClick={onPin}>{item.pinned ? c.unpinned : c.pinned}</button>
      <button type="button" className="secondary button-compact" disabled={disabled} onClick={onRemove}>{c.remove}</button>
    </div>
    {rowError && <FailureNotice failure={rowError} id={`watch-error-${item.id}`} messageOverride={c.updateFailed} />}
  </li>
}

export default function Watchlist() {
  const { locale, t } = useUi()
  const session = useSessionState()
  const c = watchlistCopy[locale]
  const [items, setItems] = useState<StockWatchlistItem[] | null>(null)
  const [attempt, retry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshError, setRefreshError] = useState<Failure | null>(null)
  const [writeError, setWriteError] = useState<Failure | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, Failure | undefined>>({})
  const [pending, setPending] = useState<Record<string, PendingAction | undefined>>({})
  const [symbol, setSymbol] = useState('')
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sort, setSort] = useState<SortMode>('order')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const [undo, setUndo] = useState<StockWatchlistItem | null>(null)
  const [undoPending, setUndoPending] = useState(false)
  const [undoError, setUndoError] = useState<Failure | null>(null)
  const [itemsSessionRevision, setItemsSessionRevision] = useState<number | null>(null)
  const translate = useRef(t)
  translate.current = t
  const mutationControllers = useRef(new Map<string, AbortController>())
  const orderMutationQueue = useRef(Promise.resolve())
  const privateEpoch = useRef(0)
  const confirmedWriteRevision = useRef(0)
  useEffect(() => () => { for (const controller of mutationControllers.current.values()) controller.abort() }, [])

  function clearPrivateResults() {
    privateEpoch.current += 1
    for (const controller of mutationControllers.current.values()) controller.abort()
    mutationControllers.current.clear()
    setItems(null)
    setItemsSessionRevision(null)
    setRowErrors({})
    setWriteError(null)
    setSaved(false)
    setPending({})
    setUndoPending(false)
    setUndo(null)
    setUndoError(null)
  }

  useEffect(() => {
    const controller = new AbortController()
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    const requestWriteRevision = confirmedWriteRevision.current
    setLoading(true)
    setRefreshError(null)
    if (session.authenticated === false) {
      clearPrivateResults()
      setRefreshError({ message: t('failed'), code: 'AUTH_UNAUTHORIZED', fields: [] })
      setLoading(false)
      return () => controller.abort()
    }
    api.GET('/api/stocks/watchlist', { headers: watchlistManagementHeaders, signal: controller.signal }).then(result => {
      if (controller.signal.aborted || requestEpoch !== privateEpoch.current) return
      if (requestWriteRevision !== confirmedWriteRevision.current) return
      const parsed = stockWatchlistResponseSchema.safeParse(result.data)
      if (result.response.status === 401 || result.response.status === 403) {
        clearPrivateResults()
        setRefreshError(apiFailure(result.error, translate.current('failed')))
        setLoading(false)
      } else if (requestSessionRevision !== getSessionRevision()) {
        return
      } else if (result.response.ok && parsed.success) {
        setItems(parsed.data.items)
        setItemsSessionRevision(requestSessionRevision)
      }
      else setRefreshError(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setRefreshError(apiFailure(null, translate.current('connection'))) })
      .finally(() => { if (!controller.signal.aborted && requestEpoch === privateEpoch.current && requestSessionRevision === getSessionRevision()) setLoading(false) })
    return () => controller.abort()
  }, [attempt, session.authenticated, session.revision])

  function markPending(id: string, action: PendingAction | undefined) {
    setPending(previous => ({ ...previous, [id]: action }))
    if (!action) mutationControllers.current.delete(id)
  }

  async function reconcile(item: StockWatchlistItem, action: PendingAction) {
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    const requestWriteRevision = confirmedWriteRevision.current
    try {
      const result = await api.GET('/api/stocks/watchlist', { headers: watchlistManagementHeaders })
      if (requestEpoch !== privateEpoch.current || requestSessionRevision !== getSessionRevision() || requestWriteRevision !== confirmedWriteRevision.current) return
      const parsed = stockWatchlistResponseSchema.safeParse(result.data)
      if (result.response.status === 401 || result.response.status === 403) {
        clearPrivateResults()
        setRefreshError(apiFailure(result.error, c.refreshFailed))
        return
      }
      if (!result.response.ok || !parsed.success) {
        setRefreshError(apiFailure(result.error, c.refreshFailed))
        return
      }
      setItems(parsed.data.items)
      setItemsSessionRevision(requestSessionRevision)
      if (action === 'remove') {
        const stillWatching = parsed.data.items.some(row => row.id === item.id || row.stock.symbol === item.stock.symbol)
        setUndo(current => current?.id === item.id && stillWatching ? null : current)
        if (!stillWatching) setUndo(item)
      }
    } catch {
      setRefreshError(apiFailure(null, c.refreshFailed))
    }
  }

  async function rowMutation(item: StockWatchlistItem, action: PendingAction, request: (signal: AbortSignal) => Promise<{ data?: unknown; error?: unknown; response: Response }>) {
    if (pending[item.id] || mutationControllers.current.has(item.id)) return
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    if (requestSessionRevision !== getSessionRevision()) return
    const controller = new AbortController()
    mutationControllers.current.set(item.id, controller)
    markPending(item.id, action)
    setRowErrors(previous => ({ ...previous, [item.id]: undefined }))
    let requiresReconcile = false
    const isCurrent = () => !controller.signal.aborted && requestEpoch === privateEpoch.current && requestSessionRevision === getSessionRevision()
    try {
      const result = await request(controller.signal)
      if (!isCurrent()) return
      if (!result.response.ok) {
        setRowErrors(previous => ({ ...previous, [item.id]: apiFailure(result.error, c.updateFailed) }))
        if (result.response.status === 401 || result.response.status === 403) clearPrivateResults()
        if (result.response.status >= 500 || result.response.status === 404 || result.response.status === 409) {
          requiresReconcile = true
          markPending(item.id, action)
          await reconcile(item, action).finally(() => markPending(item.id, undefined))
        }
        return
      }
      if (action === 'remove') {
        const deleted = stockWatchlistDeleteResponseSchema.safeParse(result.data)
        if (!deleted.success) {
          requiresReconcile = true
          setRowErrors(previous => ({ ...previous, [item.id]: { message: c.updateFailed, code: 'SYS_VALIDATION_ERROR', fields: [] } }))
          markPending(item.id, action)
          await reconcile(item, action).finally(() => markPending(item.id, undefined))
          return
        }
        confirmedWriteRevision.current += 1
        setItems(previous => previous ? previous.filter(row => row.id !== item.id) : previous)
        setUndo(item)
        setUndoError(null)
      } else if (action === 'move-up' || action === 'move-down') {
        const reordered = stockWatchlistReorderResponseSchema.safeParse(result.data)
        if (reordered.success) {
          confirmedWriteRevision.current += 1
          setItems(previous => previous ? previous.map(row => ({ ...row, sortOrder: reordered.data.items.find(change => change.id === row.id)?.sortOrder ?? row.sortOrder })).sort(compareCustom) : previous)
        }
        else {
          requiresReconcile = true
          setRowErrors(previous => ({ ...previous, [item.id]: { message: c.updateFailed, code: 'SYS_VALIDATION_ERROR', fields: [] } }))
          markPending(item.id, action)
          await reconcile(item, action).finally(() => markPending(item.id, undefined))
          return
        }
      } else {
        const mutation = stockWatchlistMutationResponseSchema.safeParse(result.data)
        if (mutation.success) {
          confirmedWriteRevision.current += 1
          setItems(previous => previous ? previous.map(row => row.id === item.id ? { ...row, sortOrder: mutation.data.sortOrder, pinned: mutation.data.pinned, status: mutation.data.status, updatedAt: mutation.data.updatedAt ?? row.updatedAt } : row).sort(compareCustom) : previous)
        }
        else {
          requiresReconcile = true
          setRowErrors(previous => ({ ...previous, [item.id]: { message: c.updateFailed, code: 'SYS_VALIDATION_ERROR', fields: [] } }))
          markPending(item.id, action)
          void reconcile(item, action).finally(() => markPending(item.id, undefined))
          return
        }
      }
      setSaved(true)
    } catch {
      if (!controller.signal.aborted) {
        requiresReconcile = true
        setRowErrors(previous => ({ ...previous, [item.id]: apiFailure(null, c.updateFailed) }))
        markPending(item.id, action)
        await reconcile(item, action).finally(() => markPending(item.id, undefined))
      }
    } finally {
      if (isCurrent()) {
        if (mutationControllers.current.get(item.id) === controller) mutationControllers.current.delete(item.id)
        if (!requiresReconcile) markPending(item.id, undefined)
      }
    }
  }

  function move(item: StockWatchlistItem, direction: 'up' | 'down') {
    const reorderApi = api as ReorderApi
    const action: PendingAction = direction === 'up' ? 'move-up' : 'move-down'
    const queuedEpoch = privateEpoch.current
    const queuedSessionRevision = session.revision
    const run = orderMutationQueue.current.then(() => {
      if (queuedEpoch !== privateEpoch.current || queuedSessionRevision !== getSessionRevision()) return
      return rowMutation(item, action, signal => reorderApi.POST('/api/stocks/watchlist/reorder', { body: { id: item.id, direction }, signal }))
    })
    orderMutationQueue.current = run.catch(() => undefined)
  }

  function pin(item: StockWatchlistItem) {
    void rowMutation(item, 'pin', signal => api.PATCH('/api/stocks/watchlist/{id}', { params: { path: { id: item.id } }, headers: watchlistManagementHeaders, body: { pinned: !item.pinned }, signal }))
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = stockWatchlistCreateRequestSchema.safeParse({ symbol })
    if (!parsed.success) { setWriteError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: [] }); return }
    setAdding(true); setWriteError(null); setSaved(false)
    const controller = new AbortController()
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    try {
      const result = await api.POST('/api/stocks/watchlist', { headers: watchlistManagementHeaders, body: parsed.data, signal: controller.signal })
      if (controller.signal.aborted || requestEpoch !== privateEpoch.current || requestSessionRevision !== getSessionRevision()) return
      if (!result.response.ok) { if (result.response.status === 401 || result.response.status === 403) clearPrivateResults(); setWriteError(apiFailure(result.error, t('failed'))); return }
      confirmedWriteRevision.current += 1
      setSymbol(''); setSaved(true); retry(value => value + 1)
    } catch { if (!controller.signal.aborted && requestEpoch === privateEpoch.current && requestSessionRevision === getSessionRevision()) setWriteError(apiFailure(null, t('connection'))) }
    finally { setAdding(false) }
  }

  async function restore() {
    if (!undo || undoPending) return
    const item = undo
    const controller = new AbortController()
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    setUndoPending(true); setUndoError(null)
    try {
      const result = await api.POST('/api/stocks/watchlist', { headers: watchlistManagementHeaders, body: { symbol: item.stock.symbol, sortOrder: item.sortOrder, pinned: item.pinned }, signal: controller.signal })
      if (controller.signal.aborted || requestEpoch !== privateEpoch.current || requestSessionRevision !== getSessionRevision()) return
      const mutation = stockWatchlistMutationResponseSchema.safeParse(result.data)
      if (!result.response.ok || !mutation.success) {
        if (result.response.status === 401 || result.response.status === 403) clearPrivateResults()
        setUndoError(apiFailure(result.error, c.updateFailed))
        if (result.response.ok || result.response.status >= 500 || result.response.status === 404 || result.response.status === 409) await reconcile(item, 'remove')
        return
      }
      const restored = { ...item, id: mutation.data.id, sortOrder: mutation.data.sortOrder, pinned: mutation.data.pinned, status: mutation.data.status, updatedAt: mutation.data.updatedAt ?? item.updatedAt }
      confirmedWriteRevision.current += 1
      setItems(previous => {
        const current = previous ?? []
        return current.some(row => row.id === restored.id)
          ? current.map(row => row.id === restored.id ? restored : row).sort(compareCustom)
          : [...current, restored].sort(compareCustom)
      })
      setUndo(null); setSaved(true)
    } catch {
      // A lost response is reconciled by the next read; do not blindly submit a second restore.
      if (!controller.signal.aborted && requestEpoch === privateEpoch.current && requestSessionRevision === getSessionRevision()) {
        setUndoError(apiFailure(null, c.updateFailed)); retry(value => value + 1)
      }
    } finally { setUndoPending(false) }
  }

  const sessionItems = session.authenticated === true && itemsSessionRevision === session.revision ? items : null
  const sessionUndo = sessionItems ? undo : null

  useEffect(() => {
    if (sessionUndo && sessionItems?.some(item => item.id === sessionUndo.id || item.stock.symbol === sessionUndo.stock.symbol)) setUndo(current => current?.stock.symbol === sessionUndo.stock.symbol ? null : current)
  }, [sessionItems, sessionUndo])

  const ordered = useMemo(() => {
    const list = [...(sessionItems ?? [])]
    if (sort === 'symbol') return list.sort((a, b) => a.stock.symbol.localeCompare(b.stock.symbol) || a.id.localeCompare(b.id))
    if (sort === 'research') return list.sort((a, b) => (b.latestRecord?.occurredAt ?? '').localeCompare(a.latestRecord?.occurredAt ?? '') || a.stock.symbol.localeCompare(b.stock.symbol) || a.id.localeCompare(b.id))
    return list.sort(compareCustom)
  }, [sessionItems, sort])
  const visible = ordered.filter(item => {
    const needle = search.trim().toLocaleLowerCase()
    const matchesSearch = !needle || item.stock.symbol.toLocaleLowerCase().includes(needle) || (item.stock.name ?? '').toLocaleLowerCase().includes(needle)
    const matchesFilter = filter === 'all' || (filter === 'researched' ? item.recordCount > 0 : item.recordCount === 0)
    return matchesSearch && matchesFilter
  })
  const researched = sessionItems?.filter(item => item.recordCount > 0).length ?? 0
  const filteredView = search.trim() !== '' || filter !== 'all'
  return <section className="plan-page watch-page">
    <header className="plan-header watch-header"><div><h1>{c.title}</h1><p className="lede">{c.hint}</p></div><Link className="button secondary" to="/stocks">{c.holdings}</Link></header>
    {sessionItems && <div className="card watch-stats">
      <div className="stat"><span className="stat-label">{c.tracked}</span><p className="stat-value">{sessionItems.length}</p></div>
      <div className="stat"><span className="stat-label">{c.researched}</span><p className="stat-value">{researched}</p></div>
      <div className="stat"><span className="stat-label">{c.unresearched}</span><p className="stat-value">{sessionItems.length - researched}</p></div>
    </div>}
    <form className="watch-add card" onSubmit={add}><h2>{c.addTitle}</h2><div className="watch-add-row"><label>{c.symbol}<input value={symbol} onChange={event => setSymbol(event.target.value)} maxLength={32} required autoCapitalize="characters" spellCheck={false} placeholder={c.placeholder}/></label><button disabled={adding}>{adding ? t('pending') : c.add}</button></div></form>
    {saved && <p role="status">{c.saved}</p>}
    {writeError && <><FailureNotice failure={writeError}/>{writeError.code?.startsWith('AUTH_') && <Link to={signInPath('/stocks/watchlist')}>{t('login')}</Link>}</>}
    {!sessionItems && loading && <p role="status">{t('loading')}</p>}
    {!sessionItems && !loading && refreshError && <><FailureNotice failure={refreshError}/>{refreshError.code?.startsWith('AUTH_') && <Link className="button secondary" to={signInPath('/stocks/watchlist')}>{t('login')}</Link>}<button type="button" onClick={() => retry(value => value + 1)}>{t('retry')}</button></>}
    {sessionItems && <>
      {!loading && refreshError && <div className="watch-refresh-error"><FailureNotice failure={refreshError}/>{refreshError.code?.startsWith('AUTH_') && <Link className="button secondary" to={signInPath('/stocks/watchlist')}>{t('login')}</Link>}<button type="button" className="secondary" onClick={() => retry(value => value + 1)}>{t('retry')}</button></div>}
      {sessionUndo && <div className="watch-undo" role="status" aria-live="polite"><span>{c.removed} {sessionUndo.stock.symbol}</span><button type="button" className="secondary" disabled={undoPending} onClick={() => void restore()}>{undoPending ? t('pending') : c.undo}</button>{undoError && <span className="error">{undoError.message}</span>}</div>}
      <div className="section-head watch-list-head"><h2>{c.listTitle} ({visible.length}{visible.length !== sessionItems.length ? ` / ${sessionItems.length}` : ''})</h2><div className="watch-list-head-actions">{loading && <span className="watch-refreshing" role="status" aria-live="polite">{c.refreshing}</span>}<button type="button" className="secondary" disabled={loading} onClick={() => retry(value => value + 1)}>{loading ? t('pending') : c.refresh}</button></div></div>
      <div className="watch-toolbar card">
        <label>{c.search}<input type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={100}/></label>
        <label>{c.filterLabel}<select value={filter} onChange={event => setFilter(event.target.value as FilterMode)}><option value="all">{c.all}</option><option value="researched">{c.hasResearch}</option><option value="unresearched">{c.noResearch}</option></select></label>
        <label>{c.sortLabel}<select value={sort} onChange={event => setSort(event.target.value as SortMode)}><option value="order">{c.sortOrder}</option><option value="research">{c.byResearch}</option><option value="symbol">{c.bySymbol}</option></select></label>
      </div>
      <p className="watch-limit muted">{sort === 'order' ? c.customHint : c.limit}</p>
      {!visible.length ? <div className="empty-state"><p>{c.empty}</p></div>
        : <div className="watch-list card"><ul className="plan-list">{visible.map((item, index) => <WatchlistRow key={item.id} item={item} c={c} sort={sort} index={index} visibleItems={visible} filteredView={filteredView} pending={pending[item.id]} rowError={rowErrors[item.id]} onMove={direction => move(item, direction)} onPin={() => pin(item)} onRemove={() => void rowMutation(item, 'remove', signal => api.DELETE('/api/stocks/watchlist/{id}', { params: { path: { id: item.id } }, signal }))}/>)}</ul></div>}
    </>}
  </section>
}
