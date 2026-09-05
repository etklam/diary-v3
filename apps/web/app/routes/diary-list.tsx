import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { diaryListQuerySchema, diaryListResponseSchema } from '@diary/contracts/diary-list'
import type { z } from 'zod'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error'
import { signInPath } from '../session'
import { diaryListCopy } from '../diary-list-copy'
import '../diary-list.css'

type Result = z.infer<typeof diaryListResponseSchema>

export default function DiaryListPage() {
  const { locale, t } = useUi()
  const c = diaryListCopy[locale]
  const [params, setParams] = useSearchParams()
  const queryString = params.toString()
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const focusResults = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setResult(null); setError(null); setLoading(true)
    const parsed = diaryListQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(queryString)))
    if (!parsed.success) {
      setError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: parsed.error.issues.map(issue => issue.path.join('.')) })
      setLoading(false)
      return () => { active = false; controller.abort() }
    }
    api.GET('/api/diaries', { params: { query: parsed.data }, signal: controller.signal }).then(response => {
      if (!active) return
      if (response.data && response.response.ok) setResult(diaryListResponseSchema.parse(response.data))
      else setError(apiFailure(response.error, t('failed')))
    }).catch(() => { if (active) setError(apiFailure(null, t('connection'))) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [queryString, retry])

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
  const filtered = ['search', 'dateFrom', 'dateTo', 'reviewStatus'].some(key => params.has(key))
  return <section className="diary-library">
    <header className="page-heading"><div><h1>{c.title}</h1><p className="muted">{c.intro}</p></div><Link className="button" to="/diaries/new">{t('write')}</Link></header>
    <form key={queryString} className="diary-filters" onSubmit={apply} aria-label={c.apply}>
      <label className="diary-search">{c.search}<input name="search" type="search" maxLength={500} defaultValue={params.get('search') ?? ''} aria-invalid={invalidField(error, 'search')} /></label>
      <label>{c.from}<input name="dateFrom" type="date" defaultValue={params.get('dateFrom') ?? ''} aria-invalid={invalidField(error, 'dateFrom')} /></label>
      <label>{c.to}<input name="dateTo" type="date" defaultValue={params.get('dateTo') ?? ''} aria-invalid={invalidField(error, 'dateTo')} /></label>
      <label>{c.sort}<select name="sortBy" defaultValue={params.get('sortBy') ?? 'date-desc'}>
        <option value="date-desc">{c.newest}</option><option value="date-asc">{c.oldest}</option><option value="title-asc">{c.titleAsc}</option><option value="title-desc">{c.titleDesc}</option>
      </select></label>
      <label>{c.status}<select name="reviewStatus" defaultValue={params.get('reviewStatus') ?? ''}>
        <option value="">{c.all}</option><option value="none">{c.none}</option><option value="pending">{c.pending}</option><option value="reviewed">{c.reviewed}</option>
      </select></label>
      <label>{c.limit}<select name="limit" defaultValue={params.get('limit') ?? '20'}>{[10, 20, 50, 100].map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <div className="actions"><button type="submit">{c.apply}</button><button type="button" className="secondary" onClick={() => { focusResults.current = true; setParams({}); setRetry(value => value + 1) }}>{c.reset}</button></div>
    </form>
    <div className="diary-results" aria-busy={loading}>
      <h2 ref={heading} tabIndex={-1}>{c.results}</h2>
      {loading ? <p role="status">{t('loading')}</p> : error ? <><FailureNotice failure={error} /><div className="actions"><button onClick={() => setRetry(value => value + 1)}>{t('retry')}</button>{error.code?.startsWith('AUTH_') && <Link className="button secondary" to={signInPath('/diaries')}>{t('login')}</Link>}</div></> : result && <>
        <p className="muted" role="status">{result.pagination.total} {c.total}</p>
        {result.data.length ? <ol className="diary-records">{result.data.map(diary => <li key={diary.id}>
          <time dateTime={diary.date}>{diary.date}</time><div><h3><Link to={`/diaries/${diary.id}`}>{diary.title}</Link></h3><p>{(diary.content ?? '').replace(/\s+/g, ' ').slice(0, 240)}</p>{diary.tags.length > 0 && <ul className="diary-library-tags" aria-label={c.tags}>{diary.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>}</div>
        </li>)}</ol> : <div className="diary-library-empty"><p>{filtered || result.pagination.total > 0 ? c.empty : c.first}</p>{!filtered && result.pagination.total === 0 && <Link className="button secondary" to="/diaries/new">{c.start}</Link>}</div>}
        {result.pagination.totalPages > 0 && <nav className="diary-pagination" aria-label={c.results}>
          <button className="secondary" disabled={result.pagination.page <= 1} onClick={() => turn(result.pagination.page - 1)}>{c.previous}</button>
          <span>{c.page} {result.pagination.page} {c.of} {result.pagination.totalPages}</span>
          <button className="secondary" disabled={result.pagination.page >= result.pagination.totalPages} onClick={() => turn(result.pagination.page + 1)}>{c.next}</button>
        </nav>}
      </>}
    </div>
  </section>
}
