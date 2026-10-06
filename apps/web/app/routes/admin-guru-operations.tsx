import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  adminInstitutionalFilingListResponseSchema,
  adminInstitutionalJobResponseSchema,
  adminInstitutionalOverviewResponseSchema,
  type AdminInstitutionalFilingRow,
  type AdminInstitutionalManagerRow,
} from '@diary/contracts'
import { api, useUi } from '../ui'
import { filingInspectorCopy, institutionalOperationsCopy } from './admin-institutional-copy'
import { guruAdminCopy } from './admin-gurus-copy'
import './admin-institutional.css'

function shortTime(value: string | null, locale: string) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

export function AdminGuruOperations({ id }: { id: string }) {
  const { locale } = useUi()
  const c = institutionalOperationsCopy(locale)
  const inspector = filingInspectorCopy(locale)
  const admin = guruAdminCopy[locale]
  const [manager, setManager] = useState<AdminInstitutionalManagerRow | null>(null)
  const [filings, setFilings] = useState<AdminInstitutionalFilingRow[] | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setManager(null)
    setFilings(null)
    void Promise.all([
      api.GET('/api/admin/institutional/overview', { signal: controller.signal }),
      api.GET('/api/admin/institutional/filings', { params: { query: { guruId: id, limit: 10, offset: 0 } }, signal: controller.signal }),
    ]).then(([overview, list]) => {
      if (controller.signal.aborted) return
      const parsedOverview = adminInstitutionalOverviewResponseSchema.safeParse(overview.data)
      const parsedList = adminInstitutionalFilingListResponseSchema.safeParse(list.data)
      if (!overview.response.ok || !parsedOverview.success || !list.response.ok || !parsedList.success) { setFailure(c.failed); return }
      setManager(parsedOverview.data.data.managers.find(row => row.guruId === id) ?? null)
      setFilings(parsedList.data.data)
    }).catch(() => { if (!controller.signal.aborted) setFailure(c.failed) })
    return () => controller.abort()
  }, [id, attempt, c.failed])

  async function run(operation: 'sync' | 'rebuild', periodEnd?: string) {
    if (pending) return
    setPending(true)
    setNotice('')
    setFailure('')
    try {
      const result = operation === 'sync'
        ? await api.POST('/api/admin/gurus/{id}/sync', { params: { path: { id } } })
        : await api.POST('/api/admin/gurus/{id}/rebuild', { params: { path: { id } }, body: { periodEnd: periodEnd! } })
      const parsed = adminInstitutionalJobResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(inspector.actionFailed); return }
      setNotice(`${parsed.data.data.jobId} · ${parsed.data.data.detail}`)
      setAttempt(value => value + 1)
    } catch { setFailure(inspector.actionFailed) }
    finally { setPending(false) }
  }

  const latestPeriod = manager?.latestFiling?.periodEnd ?? null
  return <section className="admin-guru-operations" aria-labelledby="admin-guru-operations-title">
    <h2 id="admin-guru-operations-title">{c.title}</h2>
    <p className="lede">{c.intro}</p>
    <div className="admin-institutional-actions">
      <button type="button" disabled={pending} onClick={() => void run('sync')}>{admin.syncFilings}</button>
      <button type="button" className="secondary" disabled={pending || !latestPeriod} onClick={() => void run('rebuild', latestPeriod ?? undefined)}>{admin.rebuildLatest}</button>
      <Link className="secondary" to="/admin/institutional">{inspector.back}</Link>
    </div>
    {notice && <p className="admin-gurus-notice" role="status">{notice}</p>}
    {failure && <p className="admin-gurus-error" role="alert">{failure}</p>}
    {manager === null && !failure ? <p role="status">{c.loading}</p> : manager && <dl className="admin-institutional-metrics is-dense">
      <div><dt>{c.discovery}</dt><dd>{manager.discovery.status ?? '—'}</dd></div>
      <div><dt>{c.lastSuccess}</dt><dd>{shortTime(manager.discovery.lastSuccessAt, locale)}</dd></div>
      <div><dt>{c.nextCheck}</dt><dd>{shortTime(manager.discovery.nextCheckAt, locale)}</dd></div>
      <div><dt>{c.latestFiling}</dt><dd>{manager.latestFiling ? `${manager.latestFiling.accession} · ${manager.latestFiling.status}` : '—'}</dd></div>
      <div><dt>{c.filings}</dt><dd>{manager.filings.total} · {manager.filings.partial}P · {manager.filings.error}E</dd></div>
      <div><dt>{c.quarters}</dt><dd>{manager.quarters.ready}R · {manager.quarters.partial}P · {manager.quarters.error}E</dd></div>
      <div><dt>{c.coverage}</dt><dd>{manager.mappingCoveragePercent ? `${Number(manager.mappingCoveragePercent).toFixed(2)}%` : '—'}</dd></div>
      <div><dt>{c.ai}</dt><dd>{manager.analysis.queued + manager.analysis.running}Q · {manager.analysis.failed}E · {manager.analysis.invalidated}I</dd></div>
      {manager.discovery.lastErrorCode && <div><dt>{c.error}</dt><dd><span className="admin-institutional-error-code">{manager.discovery.lastErrorCode}</span></dd></div>}
    </dl>}
    {filings && filings.length > 0 && <div className="admin-institutional-table-scroll"><table className="admin-institutional-table">
      <thead><tr><th scope="col">{c.accession}</th><th scope="col">{c.period}</th><th scope="col">{c.filingState}</th><th scope="col">{c.coverageShort}</th><th scope="col">{c.error}</th><th scope="col">{c.open}</th></tr></thead>
      <tbody>{filings.map(filing => <tr key={filing.id}>
        <th scope="row"><code>{filing.accession}</code></th>
        <td>{filing.periodEnd ?? '—'}</td>
        <td><span className={`admin-institutional-state is-${filing.status.toLowerCase()}`}>{filing.status}</span></td>
        <td>{filing.mappingCoverage ? `${Number(filing.mappingCoverage).toFixed(2)}%` : '—'}</td>
        <td>{filing.errorCode ? <span className="admin-institutional-error-code">{filing.errorCode}</span> : '—'}</td>
        <td><Link to={`/admin/institutional/filings/${filing.id}`}>{c.open}</Link></td>
      </tr>)}</tbody>
    </table></div>}
  </section>
}
