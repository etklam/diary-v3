import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { diaryListQuerySchema } from '@diary/contracts/diary-list'
import { diarySummaryListResponseSchema } from '@diary/contracts/diary-summary'
import { diarySavedViewCreateRequestSchema, diarySavedViewListResponseSchema, diarySavedViewQuerySchema, diarySavedViewSchema, diarySavedViewUpdateRequestSchema } from '@diary/contracts/diary-saved-view'
import type { z } from 'zod'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error'
import { getSessionRevision, signInPath, useSessionState } from '../session'
import { diaryListCopy } from '../diary-list-copy'
import { diaryLibraryCopy, type DiaryLibraryCopy } from '../diary-library-copy'
import '../diary-list.css'

type Result = z.infer<typeof diarySummaryListResponseSchema>
type SearchSnippet = NonNullable<Result['data'][number]['searchSnippet']>
type SavedView = z.infer<typeof diarySavedViewSchema>
type SavedViewQuery = z.infer<typeof diarySavedViewQuerySchema>
const diarySearchSnippetHeaders = { 'x-diary-search-snippet': '1' } as const

const savedViewKeys = ['search', 'symbol', 'dateFrom', 'dateTo', 'reviewStatus', 'sortBy'] as const
function queryFromParams(params: URLSearchParams): SavedViewQuery {
  const parsed = diaryListQuerySchema.safeParse(Object.fromEntries(params))
  if (!parsed.success) return { sortBy: 'date-desc' }
  const query = Object.fromEntries(savedViewKeys.flatMap(key => {
    const value = parsed.data[key]
    return value === undefined || value === '' ? [] : [[key, value]]
  }))
  return diarySavedViewQuerySchema.parse(query)
}
function queryFingerprint(query: SavedViewQuery) {
  const normalized = diarySavedViewQuerySchema.parse(query)
  return JSON.stringify({
    search: normalized.search,
    symbol: normalized.symbol,
    dateFrom: normalized.dateFrom,
    dateTo: normalized.dateTo,
    reviewStatus: normalized.reviewStatus,
    sortBy: normalized.sortBy ?? 'date-desc',
  })
}
function displayQuery(params: URLSearchParams) {
  return queryFromParams(params)
}

function SearchSnippetView({ snippet, c }: { snippet: SearchSnippet; c: DiaryLibraryCopy }) {
  const sourceKey = {
    title: 'sourceTitle', content: 'sourceContent', thesis: 'sourceThesis', risk: 'sourceRisk', execution: 'sourceExecution', tag: 'sourceTag', symbol: 'sourceSymbol',
  } as const
  const before = snippet.text.slice(0, snippet.matchStart)
  const hit = snippet.text.slice(snippet.matchStart, snippet.matchEnd)
  const after = snippet.text.slice(snippet.matchEnd)
  return <p className="diary-row-excerpt diary-search-snippet"><span className="diary-snippet-source">{c[sourceKey[snippet.source]]}</span> {before}<mark>{hit}</mark>{after}</p>
}

export default function DiaryListPage() {
  const { locale, t } = useUi()
  const session = useSessionState()
  const c = diaryListCopy[locale]
  const libraryCopy = diaryLibraryCopy[locale]
  const [params, setParams] = useSearchParams()
  const queryString = params.toString()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayedQueryString, setDisplayedQueryString] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [savedViewsLoading, setSavedViewsLoading] = useState(true)
  const [savedViewsError, setSavedViewsError] = useState<Failure | null>(null)
  const [savedViewNotice, setSavedViewNotice] = useState<string | null>(null)
  const [savedViewName, setSavedViewName] = useState('')
  const [savedViewEditor, setSavedViewEditor] = useState<'save' | 'rename' | null>(null)
  const [savedViewPending, setSavedViewPending] = useState(false)
  const [savedViewsRetry, setSavedViewsRetry] = useState(0)
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null)
  const [resultSessionRevision, setResultSessionRevision] = useState<number | null>(null)
  const [savedViewsSessionRevision, setSavedViewsSessionRevision] = useState<number | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const focusResults = useRef(false)
  const privateEpoch = useRef(0)

  function clearPrivateResults() {
    privateEpoch.current += 1
    setResult(null)
    setDisplayedQueryString(null)
    setSavedViews([])
    setSavedViewsError(null)
    setSavedViewNotice(null)
    setSavedViewName('')
    setSavedViewEditor(null)
    setSavedViewPending(false)
    setActiveSavedViewId(null)
    setResultSessionRevision(null)
    setSavedViewsSessionRevision(null)
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    setError(null); setLoading(true)
    if (session.authenticated === false) {
      clearPrivateResults()
      setError({ message: t('failed'), code: 'AUTH_UNAUTHORIZED', fields: [] })
      setLoading(false)
      return () => { active = false; controller.abort() }
    }
    const parsed = diaryListQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(queryString)))
    if (!parsed.success) {
      setError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: parsed.error.issues.map(issue => issue.path.join('.')) })
      setLoading(false)
      return () => { active = false; controller.abort() }
    }
    api.GET('/api/diaries/summary', { params: { query: parsed.data }, headers: diarySearchSnippetHeaders, signal: controller.signal }).then(response => {
      if (!active || requestEpoch !== privateEpoch.current) return
      if (response.response.status === 401 || response.response.status === 403) {
        clearPrivateResults()
        setError(apiFailure(response.error, t('failed')))
        setLoading(false)
      } else if (requestSessionRevision !== getSessionRevision()) {
        return
      } else if (response.data && response.response.ok) {
        setResult(diarySummaryListResponseSchema.parse(response.data))
        setResultSessionRevision(requestSessionRevision)
        setDisplayedQueryString(queryString)
        setError(null)
      }
      else setError(apiFailure(response.error, t('failed')))
    }).catch(() => { if (active && requestSessionRevision === getSessionRevision()) setError(apiFailure(null, t('connection'))) })
      .finally(() => { if (active && requestSessionRevision === getSessionRevision()) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [queryString, retry, session.authenticated, session.revision])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    setSavedViewsLoading(true)
    if (session.authenticated === false) {
      clearPrivateResults()
      setSavedViewsLoading(false)
      return () => { active = false; controller.abort() }
    }
    api.GET('/api/diaries/saved-views', { signal: controller.signal }).then(response => {
      if (!active || requestEpoch !== privateEpoch.current) return
      if (response.response.status === 401 || response.response.status === 403) {
        clearPrivateResults()
        setSavedViewsError(apiFailure(response.error, t('failed')))
        setSavedViewsLoading(false)
      } else if (requestSessionRevision !== getSessionRevision()) {
        return
      } else if (response.response.ok && response.data) {
        const parsed = diarySavedViewListResponseSchema.safeParse(response.data)
        if (parsed.success) { setSavedViews(parsed.data.views); setSavedViewsSessionRevision(requestSessionRevision); setSavedViewsError(null) }
        else setSavedViewsError(apiFailure(null, t('failed')))
      } else setSavedViewsError(apiFailure(response.error, t('failed')))
    }).catch(() => { if (active && requestSessionRevision === getSessionRevision()) setSavedViewsError(apiFailure(null, t('connection'))) })
      .finally(() => { if (active && requestSessionRevision === getSessionRevision()) setSavedViewsLoading(false) })
    return () => { active = false; controller.abort() }
  }, [savedViewsRetry, session.authenticated, session.revision])

  useEffect(() => {
    if (!loading && result && focusResults.current) { heading.current?.focus(); focusResults.current = false }
  }, [loading, result])

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = new URLSearchParams()
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim()) next.set(key, value.trim())
    }
    focusResults.current = true
    if (next.toString() === queryString) setRetry(value => value + 1)
    else setParams(next)
  }
  function turn(page: number) {
    const next = new URLSearchParams(params)
    next.set('page', String(page)); focusResults.current = true; setParams(next)
  }
  const currentViewQuery = displayQuery(params)
  const currentViewFingerprint = queryFingerprint(currentViewQuery)
  const sessionScopedResult = session.authenticated === true && resultSessionRevision === session.revision ? result : null
  const sessionScopedSavedViews = session.authenticated === true && savedViewsSessionRevision === session.revision ? savedViews : []
  const selectedView = sessionScopedSavedViews.find(view => view.id === activeSavedViewId)
    ?? sessionScopedSavedViews.find(view => queryFingerprint(view.query) === currentViewFingerprint)
    ?? null
  const selectedViewIsDirty = selectedView !== null && queryFingerprint(selectedView.query) !== currentViewFingerprint
  const readableFilterValue = (key: string, value: string) => key === 'reviewStatus'
    ? ({ none: c.none, pending: c.pending, reviewed: c.reviewed }[value] ?? value)
    : key === 'sortBy'
      ? ({ 'date-asc': c.oldest, 'title-asc': c.titleAsc, 'title-desc': c.titleDesc }[value] ?? value)
      : value
  const chipEntries = [
    ['search', params.get('search'), c.search],
    ['symbol', params.get('symbol'), c.symbol],
    ['reviewStatus', params.get('reviewStatus'), c.status],
    ['dateFrom', params.get('dateFrom'), c.from],
    ['dateTo', params.get('dateTo'), c.to],
    ['sortBy', params.get('sortBy') && params.get('sortBy') !== 'date-desc' ? params.get('sortBy') : null, c.sort],
  ] as const
  function applySavedView(view: SavedView) {
    const next = new URLSearchParams()
    for (const key of savedViewKeys) {
      const value = view.query[key]
      if (value !== undefined && value !== '' && !(key === 'sortBy' && value === 'date-desc')) next.set(key, String(value))
    }
    focusResults.current = true
    setSavedViewNotice(null)
    setActiveSavedViewId(view.id)
    setParams(next)
  }
  function removeFilter(key: (typeof savedViewKeys)[number]) {
    const next = new URLSearchParams(params)
    next.delete(key); next.delete('page'); focusResults.current = true; setParams(next)
  }

  async function reconcileSavedViews() {
    const requestEpoch = privateEpoch.current
    const requestSessionRevision = session.revision
    try {
      const response = await api.GET('/api/diaries/saved-views')
      if (requestEpoch !== privateEpoch.current || requestSessionRevision !== getSessionRevision()) return null
      if (response.response.status === 401 || response.response.status === 403) {
        clearPrivateResults()
        setSavedViewsError(apiFailure(response.error, t('failed')))
        return null
      }
      const parsed = response.response.ok ? diarySavedViewListResponseSchema.safeParse(response.data) : null
      if (!parsed?.success) {
        setSavedViewsError(apiFailure(response.error, t('failed')))
        return null
      }
      setSavedViews(parsed.data.views)
      setSavedViewsSessionRevision(requestSessionRevision)
      setSavedViewsError(null)
      return parsed.data.views
    } catch {
      setSavedViewsError(apiFailure(null, t('connection')))
      return null
    }
  }

  async function reconcileSavedViewMutation(successMessage: string, matches: (view: SavedView) => boolean) {
    const views = await reconcileSavedViews()
    const observed = views?.find(matches)
    if (!observed) {
      setSavedViewNotice(t('failed'))
      return false
    }
    setActiveSavedViewId(observed.id)
    setSavedViewEditor(null)
    setSavedViewName('')
    setSavedViewNotice(successMessage)
    return true
  }

  async function saveSavedView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savedViewPending) return
    const name = savedViewName.trim()
    if (!name) { setSavedViewNotice(libraryCopy.viewNameRequired); return }
    const renameTarget = savedViewEditor === 'rename' ? selectedView : null
    const isRename = renameTarget !== null
    const failedMessage = () => apiFailure(null, t('failed')).message
    setSavedViewPending(true); setSavedViewNotice(null)
    try {
      const response = isRename
        ? await api.PATCH('/api/diaries/saved-views/{id}', { params: { path: { id: renameTarget.id } }, body: diarySavedViewUpdateRequestSchema.parse({ name }) })
        : await api.POST('/api/diaries/saved-views', { body: diarySavedViewCreateRequestSchema.parse({ name, query: currentViewQuery }) })
      if (!response.response.ok || !response.data) {
        if (response.response.status === 401 || response.response.status === 403) { clearPrivateResults(); setSavedViewNotice(apiFailure(response.error, t('failed')).message); return }
        if (response.response.status >= 500 || response.response.status === 404) {
          await reconcileSavedViewMutation(isRename ? libraryCopy.viewUpdated : libraryCopy.viewSaved, view => isRename
            ? view.id === renameTarget.id && view.name === name
            : view.name.toLocaleLowerCase() === name.toLocaleLowerCase() && queryFingerprint(view.query) === queryFingerprint(currentViewQuery))
          return
        }
        setSavedViewNotice(apiFailure(response.error, t('failed')).message)
        return
      }
      const parsed = diarySavedViewSchema.safeParse(response.data)
      if (!parsed.success) {
        await reconcileSavedViewMutation(isRename ? libraryCopy.viewUpdated : libraryCopy.viewSaved, view => isRename
          ? view.id === renameTarget.id && view.name === name
          : view.name.toLocaleLowerCase() === name.toLocaleLowerCase() && queryFingerprint(view.query) === queryFingerprint(currentViewQuery))
        return
      }
      setSavedViews(views => isRename ? views.map(view => view.id === parsed.data.id ? parsed.data : view) : [...views, parsed.data])
      setActiveSavedViewId(parsed.data.id)
      setSavedViewEditor(null); setSavedViewName(''); setSavedViewNotice(isRename ? libraryCopy.viewUpdated : libraryCopy.viewSaved)
    } catch {
      await reconcileSavedViewMutation(isRename ? libraryCopy.viewUpdated : libraryCopy.viewSaved, view => isRename
        ? view.id === renameTarget.id && view.name === name
        : view.name.toLocaleLowerCase() === name.toLocaleLowerCase() && queryFingerprint(view.query) === queryFingerprint(currentViewQuery)).catch(() => setSavedViewNotice(failedMessage()))
    } finally { setSavedViewPending(false) }
  }
  async function updateSelectedView() {
    if (!selectedView || savedViewPending) return
    const selectedId = selectedView.id
    const updatedQueryFingerprint = queryFingerprint(currentViewQuery)
    setSavedViewPending(true); setSavedViewNotice(null)
    try {
      const response = await api.PATCH('/api/diaries/saved-views/{id}', { params: { path: { id: selectedId } }, body: { query: currentViewQuery } })
      if (!response.response.ok || !response.data) {
        if (response.response.status === 401 || response.response.status === 403) { clearPrivateResults(); setSavedViewNotice(apiFailure(response.error, t('failed')).message); return }
        if (response.response.status >= 500 || response.response.status === 404) { await reconcileSavedViewMutation(libraryCopy.viewUpdated, view => view.id === selectedId && queryFingerprint(view.query) === updatedQueryFingerprint); return }
        setSavedViewNotice(apiFailure(response.error, t('failed')).message)
        return
      }
      const parsed = diarySavedViewSchema.safeParse(response.data)
      if (!parsed.success) { await reconcileSavedViewMutation(libraryCopy.viewUpdated, view => view.id === selectedId && queryFingerprint(view.query) === updatedQueryFingerprint); return }
      setSavedViews(views => views.map(view => view.id === parsed.data.id ? parsed.data : view)); setSavedViewNotice(libraryCopy.viewUpdated)
    } catch { await reconcileSavedViewMutation(libraryCopy.viewUpdated, view => view.id === selectedId && queryFingerprint(view.query) === updatedQueryFingerprint) }
    finally { setSavedViewPending(false) }
  }
  async function deleteSelectedView() {
    if (!selectedView || savedViewPending) return
    const selectedId = selectedView.id
    setSavedViewPending(true); setSavedViewNotice(null)
    try {
      const response = await api.DELETE('/api/diaries/saved-views/{id}', { params: { path: { id: selectedId } } })
      if (!response.response.ok) {
        if (response.response.status === 401 || response.response.status === 403) { clearPrivateResults(); setSavedViewNotice(apiFailure(response.error, t('failed')).message); return }
        if (response.response.status >= 500 || response.response.status === 404) {
          const views = await reconcileSavedViews()
          if (views && !views.some(view => view.id === selectedId)) { setActiveSavedViewId(null); setSavedViewNotice(libraryCopy.viewDeleted) }
          else setSavedViewNotice(t('failed'))
          return
        }
        setSavedViewNotice(apiFailure(response.error, t('failed')).message)
        return
      }
      setSavedViews(views => views.filter(view => view.id !== selectedId)); setActiveSavedViewId(null); setSavedViewNotice(libraryCopy.viewDeleted)
    } catch {
      const views = await reconcileSavedViews()
      if (views && !views.some(view => view.id === selectedId)) { setActiveSavedViewId(null); setSavedViewNotice(libraryCopy.viewDeleted) }
      else setSavedViewNotice(t('failed'))
    }
    finally { setSavedViewPending(false) }
  }
  const filtered = ['search', 'symbol', 'dateFrom', 'dateTo', 'reviewStatus'].some(key => params.has(key))
  const showingStaleQuery = displayedQueryString !== null && displayedQueryString !== queryString
  // Advanced controls open themselves whenever one of them holds an active
  // value, so an active filter is never hidden behind a collapsed section.
  const advancedActive = params.has('dateFrom') || params.has('dateTo')
    || (params.get('sortBy') ?? '') !== '' && params.get('sortBy') !== 'date-desc'
    || (params.get('limit') ?? '') !== '' && params.get('limit') !== '20'
  const advancedCount = ['dateFrom', 'dateTo'].filter(key => params.has(key)).length
    + ((params.get('sortBy') ?? '') !== '' && params.get('sortBy') !== 'date-desc' ? 1 : 0)
    + ((params.get('limit') ?? '') !== '' && params.get('limit') !== '20' ? 1 : 0)
  return <section className="diary-library">
    {/* Quick capture is the primary path everywhere it is offered; the full
        editor stays available next to it rather than taking its place. */}
    <header className="page-heading"><div><h1>{c.title}</h1><p className="muted">{c.intro}</p></div><div className="actions"><Link className="button secondary" to="/diaries/quick">{t('quick')}</Link><Link className="button secondary" to="/diaries/new">{t('write')}</Link></div></header>
    <section className="diary-library-view-toolbar" aria-label={libraryCopy.savedViews}>
      <div className="diary-library-view-select">
        <label>{libraryCopy.chooseView}
          <select value={selectedView?.id ?? ''} onChange={event => {
            const view = sessionScopedSavedViews.find(item => item.id === event.target.value)
            if (view) applySavedView(view)
            else setActiveSavedViewId(null)
          }} disabled={savedViewsLoading || savedViewPending}>
            <option value="">{sessionScopedSavedViews.length ? libraryCopy.chooseView : libraryCopy.noSavedViews}</option>
            {sessionScopedSavedViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
        </label>
      </div>
      <div className="actions diary-library-view-actions">
        <button type="button" className="secondary" onClick={() => { setSavedViewEditor('save'); setSavedViewName(''); setSavedViewNotice(null) }} disabled={savedViewsLoading || savedViewPending}>{libraryCopy.saveView}</button>
        {selectedView && <>
          {selectedViewIsDirty && <button type="button" className="secondary" onClick={updateSelectedView} disabled={savedViewPending}>{libraryCopy.update}</button>}
          <button type="button" className="secondary" onClick={() => { setSavedViewEditor('rename'); setSavedViewName(selectedView.name); setSavedViewNotice(null) }} disabled={savedViewPending}>{libraryCopy.rename}</button>
          <button type="button" className="secondary danger-button" onClick={deleteSelectedView} disabled={savedViewPending}>{libraryCopy.remove}</button>
        </>}
      </div>
      {selectedViewIsDirty && <p className="diary-library-view-dirty" role="status">{libraryCopy.viewDirty}</p>}
      {savedViewEditor && <form className="diary-library-view-editor" onSubmit={saveSavedView}>
        <label>{libraryCopy.viewName}<input value={savedViewName} maxLength={80} autoFocus onChange={event => setSavedViewName(event.target.value)} /></label>
        <div className="actions"><button type="submit" disabled={savedViewPending}>{savedViewEditor === 'rename' ? libraryCopy.rename : libraryCopy.save}</button><button type="button" className="secondary" onClick={() => setSavedViewEditor(null)} disabled={savedViewPending}>{c.reset}</button></div>
      </form>}
      {savedViewNotice && <p className="diary-library-view-notice" role="status" aria-live="polite">{savedViewNotice}</p>}
      {savedViewsError && <div className="diary-library-view-error"><FailureNotice failure={savedViewsError} /><button type="button" className="secondary" onClick={() => setSavedViewsRetry(value => value + 1)}>{t('retry')}</button></div>}
      <p className="muted diary-library-view-hint">{libraryCopy.viewLimit}</p>
    </section>
    <div className="diary-library-filter-chips" aria-label={c.activeFilters}>
      {chipEntries.map(([key, value, label]) => value ? <span className="diary-filter-chip" key={key}><span>{label}: {readableFilterValue(key, value)}</span><button type="button" aria-label={`${c.reset} ${label}`} onClick={() => removeFilter(key)}>&times;</button></span> : null)}
    </div>
    <form key={queryString} className="diary-filters" onSubmit={apply} aria-label={c.apply}>
      <label className="diary-search">{c.search}<input name="search" type="search" maxLength={500} defaultValue={params.get('search') ?? ''} aria-invalid={invalidField(error, 'search')} /></label>
      <label>{c.symbol}<input name="symbol" type="text" inputMode="text" autoComplete="off" maxLength={20} defaultValue={params.get('symbol') ?? ''} aria-invalid={invalidField(error, 'symbol')} /></label>
      <label>{c.status}<select name="reviewStatus" defaultValue={params.get('reviewStatus') ?? ''}>
        <option value="">{c.all}</option><option value="none">{c.none}</option><option value="pending">{c.pending}</option><option value="reviewed">{c.reviewed}</option>
      </select></label>
      <details className="diary-advanced" open={advancedActive || undefined} data-testid="diary-advanced">
        <summary>
          {c.moreFilters}
          {advancedCount > 0 && <span className="diary-advanced-count">{advancedCount} {c.activeFilters}</span>}
        </summary>
        <div className="diary-advanced-grid">
          <label>{c.from}<input name="dateFrom" type="date" defaultValue={params.get('dateFrom') ?? ''} aria-invalid={invalidField(error, 'dateFrom')} /></label>
          <label>{c.to}<input name="dateTo" type="date" defaultValue={params.get('dateTo') ?? ''} aria-invalid={invalidField(error, 'dateTo')} /></label>
          <label>{c.sort}<select name="sortBy" defaultValue={params.get('sortBy') ?? 'date-desc'}>
            <option value="date-desc">{c.newest}</option><option value="date-asc">{c.oldest}</option><option value="title-asc">{c.titleAsc}</option><option value="title-desc">{c.titleDesc}</option>
          </select></label>
          <label>{c.limit}<select name="limit" defaultValue={params.get('limit') ?? '20'}>{[10, 20, 50, 100].map(value => <option value={value} key={value}>{value}</option>)}</select></label>
        </div>
      </details>
      <div className="actions"><button type="submit">{c.apply}</button><button type="button" className="secondary" onClick={() => { focusResults.current = true; if (queryString) setParams({}); else setRetry(value => value + 1) }}>{c.reset}</button></div>
    </form>
    <div className="diary-results" aria-busy={loading}>
      <h2 ref={heading} tabIndex={-1}>{c.results}</h2>
      {loading && <p className="diary-refreshing" role="status" aria-live="polite">{sessionScopedResult ? (showingStaleQuery ? c.refreshingQuery : c.refreshing) : t('loading')}</p>}
      {!loading && !sessionScopedResult && error ? <><FailureNotice failure={error} /><div className="actions"><button onClick={() => setRetry(value => value + 1)}>{t('retry')}</button>{error.code?.startsWith('AUTH_') && <Link className="button secondary" to={signInPath('/diaries')}>{t('login')}</Link>}</div></> : sessionScopedResult && <>
        {!loading && showingStaleQuery && <p className="diary-refreshing" role="status" aria-live="polite">{c.refreshingQuery}</p>}
        {!loading && error && <><FailureNotice failure={error} /><div className="actions"><button onClick={() => setRetry(value => value + 1)}>{t('retry')}</button>{error.code?.startsWith('AUTH_') && <Link className="button secondary" to={signInPath('/diaries')}>{t('login')}</Link>}</div></>}
        <p className="muted" role="status">{sessionScopedResult.pagination.total} {c.total}</p>
        {sessionScopedResult.data.length ? <ol className="diary-records">{sessionScopedResult.data.map(diary => <li key={diary.id}>
          <time dateTime={diary.date}>{diary.date}</time><div>
            <h3><Link to={`/diaries/${diary.id}`}>{diary.title}</Link></h3>
            <ul className="diary-library-meta" aria-label={c.context}>
              {diary.stockSymbols.map(symbol => <li key={symbol} className="diary-library-symbol">{symbol}</li>)}
              {diary.tags.slice(0, 3).map(tag => <li key={tag}>{tag}</li>)}
              {diary.transactionCount > 0 && <li>{diary.transactionCount} {c.trades}</li>}
              {diary.reviewStatus === 'pending' && <li className="diary-library-review">{c.pending}{diary.reviewDueAt ? ` · ${diary.reviewDueAt.slice(0, 10)}` : ''}</li>}
              {diary.reviewStatus === 'reviewed' && <li className="diary-library-review">{c.reviewed}</li>}
            </ul>
            {diary.searchSnippet ? <SearchSnippetView snippet={diary.searchSnippet} c={libraryCopy} /> : diary.excerpt && <p className="diary-row-excerpt">{diary.excerpt}</p>}
          </div>
        </li>)}</ol> : <div className="diary-library-empty"><p>{filtered || sessionScopedResult.pagination.total > 0 ? c.empty : c.first}</p>{filtered && <div className="actions diary-library-loosen"><button type="button" className="secondary" onClick={() => removeFilter('search')} disabled={!params.has('search')}>{libraryCopy.loosenSearch}</button><button type="button" className="secondary" onClick={() => { const next = new URLSearchParams(params); next.delete('dateFrom'); next.delete('dateTo'); next.delete('page'); focusResults.current = true; setParams(next) }} disabled={!params.has('dateFrom') && !params.has('dateTo')}>{libraryCopy.loosenDates}</button></div>}{!filtered && sessionScopedResult.pagination.total === 0 && <Link className="button secondary" to="/diaries/new">{c.start}</Link>}</div>}
        {sessionScopedResult.pagination.totalPages > 1 && <nav className="diary-pagination" aria-label={c.results}>
          <button className="secondary" disabled={sessionScopedResult.pagination.page <= 1} onClick={() => turn(sessionScopedResult.pagination.page - 1)}>{c.previous}</button>
          <span>{c.page} {sessionScopedResult.pagination.page} {c.of} {sessionScopedResult.pagination.totalPages}</span>
          <button className="secondary" disabled={sessionScopedResult.pagination.page >= sessionScopedResult.pagination.totalPages} onClick={() => turn(sessionScopedResult.pagination.page + 1)}>{c.next}</button>
        </nav>}
      </>}
    </div>
  </section>
}
