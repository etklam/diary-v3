import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  adminInstitutionalFilingListResponseSchema,
  adminInstitutionalOverviewResponseSchema,
  institutionalFilingStateSchema,
} from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { signInPath } from '../session'
import { api, LoadingBlock, useUi } from '../ui'
import { institutionalOperationsCopy, type InstitutionalOperationsCopy } from './admin-institutional-copy'
import './admin-institutional.css'
import { formatPercent } from '../market-display';

type Overview = ReturnType<typeof adminInstitutionalOverviewResponseSchema.parse>['data']
type Filings = ReturnType<typeof adminInstitutionalFilingListResponseSchema.parse>
type FilingState = typeof institutionalFilingStateSchema.options[number]
const PAGE_SIZE = 20

function failureCopy(failure: Failure | null, c: InstitutionalOperationsCopy) {
  if (failure?.code === 'AUTH_FORBIDDEN') return c.forbidden
  if (failure?.code === 'AUTH_UNAUTHORIZED') return c.unauthorized
  return c.failed
}

function shortTime(value: string | null, locale: string) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

export default function AdminInstitutional() {
  const { locale } = useUi()
  const c = institutionalOperationsCopy(locale)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [filings, setFilings] = useState<Filings | null>(null)
  const [filingsLoaded, setFilingsLoaded] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [guruId, setGuruId] = useState('')
  const [status, setStatus] = useState<'' | FilingState>('')
  const [period, setPeriod] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setOverview(null)
    setFailure(null)
    void api.GET('/api/admin/institutional/overview', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = adminInstitutionalOverviewResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) setFailure(apiFailure(result.error, c.failed))
      else setOverview(parsed.data.data)
    }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, c.failed)) })
    return () => controller.abort()
  }, [attempt, c.failed])

  useEffect(() => {
    const controller = new AbortController()
    setFilings(null)
    const query = {
      limit: PAGE_SIZE, offset,
      ...(guruId ? { guruId } : {}), ...(status ? { status } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(period) ? { periodEnd: period } : {}), ...(search ? { search } : {}),
    }
    void api.GET('/api/admin/institutional/filings', { params: { query }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = adminInstitutionalFilingListResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) { setFilings(parsed.data); setFilingsLoaded(true) }
      else setFailure(apiFailure(result.error, c.failed))
    }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, c.failed)) })
    return () => controller.abort()
  }, [attempt, guruId, status, period, search, offset, c.failed])

  const needsSignIn = failure?.code === 'AUTH_UNAUTHORIZED'
  return <section className="admin-institutional-page" data-testid="admin-institutional">
    <header className="admin-institutional-header">
      <div>
        <h1>{c.title}</h1>
        <p className="lede">{c.intro}</p>
      </div>
      <div className="admin-institutional-header-links">
        <Link className="secondary" to="/admin/gurus">{c.gurus}</Link>
        <Link className="secondary" to="/admin/institutional/mappings">{c.mappings}</Link>
        <a className="secondary" href="/api/admin/institutional/diagnostics">{c.diagnostics}</a>
      </div>
    </header>

    <FailureNotice failure={failure} id="admin-institutional-error" messageOverride={failureCopy(failure, c)} />
    {needsSignIn && <Link to={signInPath('/admin/institutional')}>{c.unauthorized}</Link>}
    {failure && <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button>}
    {!overview && !failure && <LoadingBlock label={c.loading} lines={6} />}

    {overview && <>
      <section aria-labelledby="admin-institutional-scheduler">
        <h2 id="admin-institutional-scheduler">{c.scheduler}</h2>
        <dl className="admin-institutional-metrics">
          <div><dt>{c.nextAllowed}</dt><dd>{shortTime(overview.scheduler.nextAllowedAt, locale)}</dd></div>
          <div><dt>{c.lastRequest}</dt><dd>{shortTime(overview.scheduler.lastRequestAt, locale)}</dd></div>
          <div><dt>{c.requests}</dt><dd>{overview.scheduler.requestCount}</dd></div>
          <div><dt>{c.failures}</dt><dd>{overview.scheduler.failureCount}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="admin-institutional-queues">
        <h2 id="admin-institutional-queues">{c.queues}</h2>
        <dl className="admin-institutional-metrics is-dense">
          {(Object.keys(c.queueLabels) as (keyof typeof c.queueLabels)[]).map(key => <div key={key} className={overview.queues[key] > 0 ? 'is-active' : undefined}>
            <dt>{c.queueLabels[key]}</dt><dd>{overview.queues[key]}</dd>
          </div>)}
        </dl>
      </section>

      <section aria-labelledby="admin-institutional-versions">
        <h2 id="admin-institutional-versions">{c.versions}</h2>
        <dl className="admin-institutional-metrics is-dense">
          {(Object.keys(c.versionLabels) as (keyof typeof c.versionLabels)[]).map(key => <div key={key}>
            <dt>{c.versionLabels[key]}</dt><dd><code>{overview.versions[key]}</code></dd>
          </div>)}
        </dl>
      </section>

      <section aria-labelledby="admin-institutional-managers">
        <h2 id="admin-institutional-managers">{c.managers}</h2>
        {overview.managers.length === 0 ? <p className="admin-gurus-empty">{c.noManagers}</p>
          : <div className="admin-institutional-table-scroll" role="region" aria-labelledby="admin-institutional-managers" tabIndex={0}><table className="admin-institutional-table is-managers">
            <thead><tr>
              <th scope="col">{c.manager}</th><th scope="col">{c.discovery}</th><th scope="col">{c.latestFiling}</th>
              <th scope="col">{c.filings}</th><th scope="col">{c.quarters}</th><th scope="col">{c.coverage}</th>
              <th scope="col">{c.ai}</th><th scope="col">{c.open}</th>
            </tr></thead>
            <tbody>{overview.managers.map(manager => <tr key={manager.managerId}>
              <th scope="row">
                <strong>{manager.name ?? manager.cik}</strong>
                <span>{c.cik} {manager.cik}{manager.active ? '' : ` · ${c.inactive}`}</span>
              </th>
              <td>
                <span className={`admin-institutional-state is-${(manager.discovery.status ?? 'pending').toLowerCase()}`}>{manager.discovery.status ?? '—'}</span>
                <span>{c.nextCheck}: {shortTime(manager.discovery.nextCheckAt, locale)}</span>
                <span>{c.lastSuccess}: {shortTime(manager.discovery.lastSuccessAt, locale)}</span>
                {manager.discovery.lastErrorCode && <span className="admin-institutional-error-code">{manager.discovery.lastErrorCode}</span>}
              </td>
              <td>{manager.latestFiling
                ? <Link to={`/admin/institutional/filings/${manager.latestFiling.id}`}>{manager.latestFiling.accession}<span>{manager.latestFiling.periodEnd ?? '—'} · {manager.latestFiling.status}</span></Link>
                : '—'}</td>
              <td>{manager.filings.total} · {manager.filings.partial}P · {manager.filings.error}E</td>
              <td>{manager.quarters.ready}R · {manager.quarters.partial}P · {manager.quarters.error}E</td>
              <td>{manager.mappingCoveragePercent ? formatPercent(locale, manager.mappingCoveragePercent) : '—'}</td>
              <td>{manager.analysis.queued + manager.analysis.running}Q · {manager.analysis.failed}E · {manager.analysis.invalidated}I</td>
              <td>
                {manager.guruId && <Link to={`/admin/gurus/${manager.guruId}`}>{c.profile}</Link>}
                <button type="button" className="secondary" onClick={() => { setGuruId(manager.guruId ?? ''); setOffset(0) }}>{c.inspect}</button>
              </td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </>}

    <section aria-labelledby="admin-institutional-filings">
      <h2 id="admin-institutional-filings">{c.filings}</h2>
      <form className="admin-institutional-filters" onSubmit={event => event.preventDefault()}>
        <label>{c.filingState}<select value={status} onChange={event => { setStatus(event.currentTarget.value as '' | FilingState); setOffset(0) }}>
          <option value="">{c.allStates}</option>
          {institutionalFilingStateSchema.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select></label>
        <label>{c.period}<input type="date" value={period} onChange={event => { setPeriod(event.currentTarget.value); setOffset(0) }} /></label>
        <label>{c.search}<input value={search} onChange={event => { setSearch(event.currentTarget.value); setOffset(0) }} /></label>
      </form>
      {!filings ? failure ? null : filingsLoaded ? <p role="status">{c.loading}</p> : <LoadingBlock label={c.loading} lines={6} />
        : filings.data.length === 0 ? <p className="admin-gurus-empty">{c.noFilings}</p>
          : <><div className="admin-institutional-table-scroll" role="region" aria-labelledby="admin-institutional-filings" tabIndex={0}><table className="admin-institutional-table is-filings">
            <thead><tr>
              <th scope="col">{c.accession}</th><th scope="col">{c.manager}</th><th scope="col">{c.period}</th>
              <th scope="col">{c.form}</th><th scope="col">{c.filingState}</th><th scope="col">{c.rows}</th>
              <th scope="col">{c.coverageShort}</th><th scope="col">{c.error}</th><th scope="col">{c.open}</th>
            </tr></thead>
            <tbody>{filings.data.map(filing => <tr key={filing.id}>
              <th scope="row"><code>{filing.accession}</code></th>
              <td>{filing.guruName ?? filing.cik}</td>
              <td>{filing.periodEnd ?? '—'}</td>
              <td>{filing.form}</td>
              <td><span className={`admin-institutional-state is-${filing.status.toLowerCase()}`}>{filing.status}</span></td>
              <td>{filing.parsedRowCount ?? '—'}{filing.rejectedRowCount ? ` / ${filing.rejectedRowCount}` : ''}</td>
              <td>{filing.mappingCoverage ? formatPercent(locale, filing.mappingCoverage) : '—'}</td>
              <td>{filing.errorCode ? <span className="admin-institutional-error-code">{filing.errorCode}</span> : '—'}</td>
              <td><Link to={`/admin/institutional/filings/${filing.id}`}>{c.open}</Link></td>
            </tr>)}</tbody>
          </table></div>
          <div className="admin-institutional-pagination">
            <button type="button" className="secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>{c.previous}</button>
            <span>{offset + 1}–{offset + filings.data.length} / {filings.pagination.total}</span>
            <button type="button" className="secondary" disabled={offset + PAGE_SIZE >= filings.pagination.total} onClick={() => setOffset(value => value + PAGE_SIZE)}>{c.next}</button>
          </div></>}
    </section>
  </section>
}
