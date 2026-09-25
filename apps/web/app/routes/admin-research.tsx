import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { researchRunListResponseSchema } from '@diary/contracts'
import { type Failure } from '../api-error'
import { PageHeader, ResearchFailure, RunLabels, RunMeta, researchRequest } from '../research-studio'
import { researchCopy, statusLabel, type Locale } from '../research-studio-copy'
import { useUi } from '../ui'
import './admin-research.css'

const executionOptions = ['CREATED', 'COLLECTING', 'DATA_READY', 'GENERATING', 'DRAFT_READY', 'BLOCKED', 'FAILED', 'CANCELLED'] as const
const qualityOptions = ['FULL', 'LIMITED', 'STALE', 'FAILED'] as const
const reviewOptions = ['DRAFT', 'CHANGES_REQUIRED', 'APPROVED'] as const

export default function AdminResearch() {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const [runs, setRuns] = useState<ReturnType<typeof researchRunListResponseSchema.parse> | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [symbol, setSymbol] = useState('')
  const [executionStatus, setExecutionStatus] = useState('')
  const [quality, setQuality] = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [page, setPage] = useState(1)
  const [submitted, setSubmitted] = useState({ symbol: '', executionStatus: '', quality: '', reviewStatus: '' })

  useEffect(() => {
    const controller = new AbortController()
    setRuns(null); setFailure(null)
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (submitted.symbol) params.set('symbol', submitted.symbol.toUpperCase())
    if (submitted.executionStatus) params.set('executionStatus', submitted.executionStatus)
    if (submitted.quality) params.set('quality', submitted.quality)
    if (submitted.reviewStatus) params.set('reviewStatus', submitted.reviewStatus)
    void researchRequest(`/api/admin/research/runs?${params}`, researchRunListResponseSchema, c.failed, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setRuns(result.data); setFailure(result.failure) } })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: c.connection, fields: [] }) })
    return () => controller.abort()
  }, [attempt, c.connection, c.failed, page, submitted])

  function submitFilters(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setSubmitted({ symbol: symbol.trim(), executionStatus, quality, reviewStatus })
    setAttempt(value => value + 1)
  }

  function clearFilters() {
    setSymbol(''); setExecutionStatus(''); setQuality(''); setReviewStatus(''); setSubmitted({ symbol: '', executionStatus: '', quality: '', reviewStatus: '' }); setPage(1); setAttempt(value => value + 1)
  }

  return <section className="research-page research-list-page" data-testid="research-list">
    <PageHeader title={c.title} intro={c.intro} actions={<><Link className="button" to="/admin/research/new">{c.newRun}</Link><Link className="secondary" to="/admin/research/settings">{c.settings}</Link></>} />
    {failure ? <ResearchFailure failure={failure} onRetry={() => setAttempt(value => value + 1)} /> : <>
      <form className="research-filter-bar" onSubmit={submitFilters} aria-labelledby="research-filter-title">
        <h2 id="research-filter-title">{c.filters}</h2>
        <label>{c.instrument}<input value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase())} maxLength={20} autoCapitalize="characters" /></label>
        <label>{c.status}<select value={executionStatus} onChange={event => setExecutionStatus(event.target.value)}><option value="">{c.all}</option>{executionOptions.map(value => <option key={value} value={value}>{statusLabel(value, c)}</option>)}</select></label>
        <label>{c.quality}<select value={quality} onChange={event => setQuality(event.target.value)}><option value="">{c.all}</option>{qualityOptions.map(value => <option key={value} value={value}>{statusLabel(value, c)}</option>)}</select></label>
        <label>{c.review}<select value={reviewStatus} onChange={event => setReviewStatus(event.target.value)}><option value="">{c.all}</option>{reviewOptions.map(value => <option key={value} value={value}>{statusLabel(value, c)}</option>)}</select></label>
        <div className="research-filter-actions"><button type="submit">{c.filters}</button><button type="button" className="secondary" onClick={clearFilters}>{c.clear}</button></div>
      </form>
      {runs === null ? <p className="research-loading" role="status">{c.loading}</p> : runs.data.length === 0 ? <section className="research-empty-state" aria-labelledby="research-empty-title"><div><h2 id="research-empty-title">{c.empty}</h2><p>{c.emptyHint}</p><Link className="button" to="/admin/research/new">{c.prepareFirst}</Link></div></section> : <>
        <div className="research-list-summary"><p>{runs.pagination.total} · {c.title}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.refresh}</button></div>
        <div className="research-run-list" data-testid="research-run-list">{runs.data.map(run => <article className="research-run-row" key={run.id} data-testid="research-run-row"><div className="research-run-row-main"><div><Link className="research-run-title" to={`/admin/research/${encodeURIComponent(run.id)}`}>{run.instrument.symbol} · {run.instrument.name}</Link><p className="research-run-method">{run.method.title} · v{run.method.version}</p></div><RunLabels run={run} /></div><RunMeta run={run} /><Link className="research-run-open" to={`/admin/research/${encodeURIComponent(run.id)}`}>{c.open}</Link></article>)}</div>
        {runs.pagination.totalPages > 1 && <nav className="research-pagination" aria-label={c.title}><button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>←</button><span>{page} / {runs.pagination.totalPages}</span><button type="button" className="secondary" disabled={page >= runs.pagination.totalPages} onClick={() => setPage(value => value + 1)}>→</button></nav>}
      </>}
    </>}
  </section>
}
