import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { adminInstitutionalFilingDetailResponseSchema, adminInstitutionalJobResponseSchema } from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { formatExactDecimal, percent } from '../guru-format'
import { api, LoadingBlock, useUi } from '../ui'
import { filingInspectorCopy, type FilingInspectorCopy } from './admin-institutional-copy'
import './admin-institutional.css'

type Detail = ReturnType<typeof adminInstitutionalFilingDetailResponseSchema.parse>['data']
type Operation = 'reprocess' | 'rebuild'

function shortTime(value: string | null, locale: string) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

function statusNotice(status: 'QUEUED' | 'ALREADY_QUEUED' | 'RUNNING', c: FilingInspectorCopy) {
  return status === 'QUEUED' ? c.queued : status === 'ALREADY_QUEUED' ? c.alreadyQueued : c.running
}

export default function AdminInstitutionalFiling() {
  const { id = '' } = useParams()
  const { locale } = useUi()
  const c = filingInspectorCopy(locale)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionFailure, setActionFailure] = useState('')
  const [confirmation, setConfirmation] = useState<Operation | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!/^[1-9]\d*$/.test(id)) { setFailure({ message: c.notFound, code: 'SEC_FILING_NOT_FOUND', fields: [] }); return }
    const controller = new AbortController()
    setDetail(null)
    setFailure(null)
    void api.GET('/api/admin/institutional/filings/{id}', { params: { path: { id } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = adminInstitutionalFilingDetailResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) setFailure(apiFailure(result.error, c.failed))
      else setDetail(parsed.data.data)
    }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, c.failed)) })
    return () => controller.abort()
  }, [id, attempt, c.failed, c.notFound])

  useEffect(() => {
    const element = dialog.current
    if (confirmation && element && !element.open) element.showModal()
    else if (!confirmation && element?.open) element.close()
  }, [confirmation])

  async function run(operation: Operation) {
    if (pending || !detail) return
    setConfirmation(null)
    setPending(true)
    setNotice('')
    setActionFailure('')
    try {
      const result = operation === 'reprocess'
        ? await api.POST('/api/admin/institutional/filings/{id}/reprocess', { params: { path: { id } } })
        : await api.POST('/api/admin/gurus/{id}/rebuild', { params: { path: { id: detail.filing.guruId! } }, body: { periodEnd: detail.filing.periodEnd! } })
      const parsed = adminInstitutionalJobResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setActionFailure(c.actionFailed); return }
      setNotice(`${parsed.data.data.jobId} · ${statusNotice(parsed.data.data.status, c)} ${parsed.data.data.detail}`)
      setAttempt(value => value + 1)
    } catch { setActionFailure(c.actionFailed) }
    finally { setPending(false) }
  }

  if (failure) return <section className="admin-institutional-page" data-testid="admin-institutional-filing">
    <Link className="secondary" to="/admin/institutional">← {c.back}</Link>
    <FailureNotice failure={failure} id="admin-institutional-filing-error" messageOverride={failure.code === 'SEC_FILING_NOT_FOUND' ? c.notFound : c.failed} />
    <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button>
  </section>
  if (!detail) return <section className="admin-institutional-page" data-testid="admin-institutional-filing"><LoadingBlock label={c.loading} lines={8} /></section>

  const { filing, effective } = detail
  const rebuildable = Boolean(filing.guruId && filing.periodEnd)
  return <section className="admin-institutional-page" data-testid="admin-institutional-filing">
    <header className="admin-institutional-header">
      <div>
        <Link className="secondary" to="/admin/institutional">← {c.back}</Link>
        <h1>{c.title}</h1>
        <p className="lede"><code>{filing.accession}</code> · {filing.guruName ?? filing.cik} · {filing.periodEnd ?? '—'}</p>
      </div>
      <a className="secondary" href={filing.sourceUrl} target="_blank" rel="noreferrer">{c.source} ↗</a>
    </header>

    <section aria-labelledby="admin-filing-summary">
      <h2 id="admin-filing-summary">{c.summary}</h2>
      <dl className="admin-institutional-metrics is-dense">
        <div><dt>{c.manager}</dt><dd>{filing.guruName ?? '—'} ({filing.cik})</dd></div>
        <div><dt>{c.form}</dt><dd>{filing.form}</dd></div>
        <div><dt>{c.period}</dt><dd>{filing.periodEnd ?? '—'}</dd></div>
        <div><dt>{c.filed}</dt><dd>{shortTime(filing.filedAt, locale)}</dd></div>
        <div><dt>{c.state}</dt><dd><span className={`admin-institutional-state is-${filing.status.toLowerCase()}`}>{filing.status}</span></dd></div>
        <div><dt>{c.amendment}</dt><dd>{filing.isAmendment ? `${filing.amendmentType ?? '—'} #${filing.amendmentNumber ?? '—'}` : '—'}</dd></div>
        <div><dt>{c.parser}</dt><dd><code>{filing.parserVersion ?? '—'}</code></dd></div>
        <div><dt>{c.rows}</dt><dd>{filing.parsedRowCount ?? '—'}</dd></div>
        <div><dt>{c.rejected}</dt><dd>{filing.rejectedRowCount}</dd></div>
        <div><dt>{c.coverage}</dt><dd>{percent(filing.mappingCoverage, locale)}</dd></div>
        <div><dt>{c.discovered}</dt><dd>{shortTime(filing.discoveredAt, locale)}</dd></div>
        <div><dt>{c.ingested}</dt><dd>{shortTime(filing.ingestedAt, locale)}</dd></div>
        {filing.errorCode && <div><dt>{c.error}</dt><dd><span className="admin-institutional-error-code">{filing.errorCode}</span></dd></div>}
      </dl>
    </section>

    <section aria-labelledby="admin-filing-actions">
      <h2 id="admin-filing-actions">{c.actions}</h2>
      <div className="admin-institutional-actions">
        <button type="button" disabled={pending} onClick={() => setConfirmation('reprocess')}>{c.reprocess}</button>
        <button type="button" className="secondary" disabled={pending || !rebuildable} onClick={() => setConfirmation('rebuild')}>{c.rebuild}</button>
      </div>
      {!rebuildable && <p className="admin-gurus-empty">{c.noPeriod}</p>}
      {notice && <p className="admin-gurus-notice" role="status">{notice}</p>}
      {actionFailure && <p className="admin-gurus-error" role="alert">{actionFailure}</p>}
      <dialog ref={dialog} className="admin-guru-dialog" onCancel={event => { event.preventDefault(); setConfirmation(null) }}>
        <p>{confirmation === 'rebuild' ? c.rebuildConfirm : c.reprocessConfirm}</p>
        <div className="admin-institutional-actions">
          <button type="button" disabled={pending} onClick={() => void run(confirmation ?? 'reprocess')}>{c.confirm}</button>
          <button type="button" className="secondary" onClick={() => setConfirmation(null)}>{c.cancel}</button>
        </div>
      </dialog>
    </section>

    <section aria-labelledby="admin-filing-documents">
      <h2 id="admin-filing-documents">{c.documents}</h2>
      {detail.documents.length === 0 ? <p className="admin-gurus-empty">{c.noDocuments}</p> : <div className="admin-institutional-documents">{detail.documents.map(document => <article key={document.id}>
        <header>
          <a href={document.sourceUrl} target="_blank" rel="noreferrer">{document.basename}</a>
          <span>{document.isPrimary ? 'primary' : document.documentType ?? '—'} · {document.contentLength ?? '—'} {c.length}</span>
        </header>
        {document.artifacts.length > 0 && <div className="admin-institutional-table-scroll" role="region" aria-labelledby="admin-filing-documents" tabIndex={0}><table className="admin-institutional-table is-artifacts">
          <thead><tr>
            <th scope="col">{c.digest}</th><th scope="col">{c.length}</th><th scope="col">{c.fetched}</th>
            <th scope="col">{c.reason}</th><th scope="col">{c.retained}</th><th scope="col">{c.retainUntil}</th><th scope="col">{c.supersedes}</th>
          </tr></thead>
          <tbody>{document.artifacts.map(artifact => <tr key={artifact.id}>
            <th scope="row"><code>{artifact.contentSha256.slice(0, 16)}…</code></th>
            <td>{artifact.contentLength}</td>
            <td>{shortTime(artifact.fetchedAt, locale)}</td>
            <td>{artifact.fetchedReason}</td>
            <td>{artifact.rawContentRetained ? c.yes : c.no}</td>
            <td>{shortTime(artifact.retainUntil, locale)}</td>
            <td>{artifact.supersedesArtifactId ?? '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      </article>)}</div>}
    </section>

    <section aria-labelledby="admin-filing-parsed">
      <h2 id="admin-filing-parsed">{c.parsed}</h2>
      {detail.parsedRows.total === 0 ? <p className="admin-gurus-empty">{c.noRows}</p> : <>
        <p className="lede">{c.sample(detail.parsedRows.sample.length, detail.parsedRows.total)}</p>
        <div className="admin-institutional-table-scroll" role="region" aria-labelledby="admin-filing-parsed" tabIndex={0}><table className="admin-institutional-table is-parsed-rows">
          <thead><tr>
            <th scope="col">{c.rowNumber}</th><th scope="col">{c.issuer}</th><th scope="col">{c.titleOfClass}</th>
            <th scope="col">{c.cusip}</th><th scope="col">{c.quantity}</th><th scope="col">{c.value}</th>
            <th scope="col">{c.unit}</th><th scope="col">{c.unitSource}</th><th scope="col">{c.mapping}</th><th scope="col">{c.warnings}</th>
          </tr></thead>
          <tbody>{detail.parsedRows.sample.map(row => <tr key={row.id}>
            <th scope="row">{row.rowNumber}</th>
            <td>{row.issuer}</td><td>{row.titleOfClass}</td><td>{row.cusip ?? '—'}</td>
            <td>{formatExactDecimal(row.quantity, locale)} {row.quantityType}{row.putCall ? ` ${row.putCall}` : ''}</td>
            <td>{formatExactDecimal(row.reportedValue, locale)}</td><td>{row.reportedValueUnit}</td><td>{row.valueUnitSource}</td>
            <td>{row.mappingStatus ?? '—'}{row.securityId ? ` · ${row.securityId}` : ''}</td>
            <td>{row.warnings.length ? row.warnings.join(', ') : '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </section>

    <section aria-labelledby="admin-filing-effective">
      <h2 id="admin-filing-effective">{c.effective}</h2>
      {!effective.snapshot ? <p className="admin-gurus-empty">{c.noSnapshot}</p> : <>
        <dl className="admin-institutional-metrics is-dense">
          <div><dt>{c.snapshotId}</dt><dd>{effective.snapshot.id}</dd></div>
          <div><dt>{c.snapshotHash}</dt><dd><code>{effective.snapshot.snapshotHash.slice(0, 16)}…</code></dd></div>
          <div><dt>{c.replayKey}</dt><dd><code>{effective.snapshot.replayKey.slice(0, 16)}…</code></dd></div>
          <div><dt>{c.manifest}</dt><dd><code>{effective.snapshot.sourceManifestHash.slice(0, 16)}…</code></dd></div>
          <div><dt>{c.resolver}</dt><dd><code>{effective.snapshot.resolverVersion}</code></dd></div>
          <div><dt>{c.holdings}</dt><dd>{effective.snapshot.holdingCount}</dd></div>
          <div><dt>{c.created}</dt><dd>{shortTime(effective.snapshot.createdAt, locale)}</dd></div>
          <div><dt>{c.publication}</dt><dd>{effective.publication ? `${effective.publication.status}${effective.publication.active ? ' · active' : ''}` : '—'}</dd></div>
          <div><dt>{c.periodState}</dt><dd>{effective.periodState ? `${effective.periodState.status}${effective.periodState.reason ? ` · ${effective.periodState.reason}` : ''}` : '—'}</dd></div>
        </dl>
        <div className="admin-institutional-table-scroll" role="region" aria-labelledby="admin-filing-effective" tabIndex={0}><table className="admin-institutional-table is-sources">
          <thead><tr><th scope="col">{c.ordinal}</th><th scope="col">{c.accession}</th><th scope="col">{c.operation}</th><th scope="col">{c.amendment}</th><th scope="col">{c.parser}</th></tr></thead>
          <tbody>{effective.sources.map(source => <tr key={`${source.ordinal}:${source.filingId}`}>
            <th scope="row">{source.ordinal}</th>
            <td><Link to={`/admin/institutional/filings/${source.filingId}`}><code>{source.accession}</code></Link></td>
            <td>{source.operation}</td><td>{source.amendmentNumber ?? '—'}</td><td><code>{source.parserVersion}</code></td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </section>

    {detail.analytics && <section aria-labelledby="admin-filing-analytics">
      <h2 id="admin-filing-analytics">{c.analytics}</h2>
      <dl className="admin-institutional-metrics is-dense">
        <div><dt>{c.analyticsStatus}</dt><dd>{detail.analytics.status}</dd></div>
        <div><dt>{c.analyticsVersion}</dt><dd><code>{detail.analytics.analyticsVersion}</code></dd></div>
        <div><dt>{c.comparison}</dt><dd>{detail.analytics.comparisonStatus}</dd></div>
        <div><dt>{c.holdingCount}</dt><dd>{detail.analytics.holdingCount}</dd></div>
          <div><dt>{c.coverage}</dt><dd>{percent(detail.analytics.mappingCoveragePercent, locale)}</dd></div>
        <div><dt>{c.calculated}</dt><dd>{shortTime(detail.analytics.calculatedAt, locale)}</dd></div>
      </dl>
    </section>}

    <section aria-labelledby="admin-filing-amendments">
      <h2 id="admin-filing-amendments">{c.amendments}</h2>
      <div className="admin-institutional-table-scroll" role="region" aria-labelledby="admin-filing-amendments" tabIndex={0}><table className="admin-institutional-table is-amendments">
        <thead><tr><th scope="col">{c.accession}</th><th scope="col">{c.form}</th><th scope="col">{c.amendment}</th><th scope="col">{c.filed}</th><th scope="col">{c.state}</th><th scope="col">{c.operation}</th><th scope="col">{c.source}</th></tr></thead>
        <tbody>{detail.amendments.map(amendment => <tr key={amendment.id}>
          <th scope="row">{amendment.id === filing.id ? <code>{amendment.accession}</code> : <Link to={`/admin/institutional/filings/${amendment.id}`}><code>{amendment.accession}</code></Link>}</th>
          <td>{amendment.form}</td>
          <td>{amendment.isAmendment ? `${amendment.amendmentType ?? '—'} #${amendment.amendmentNumber ?? '—'}` : '—'}</td>
          <td>{shortTime(amendment.filedAt, locale)}</td>
          <td><span className={`admin-institutional-state is-${amendment.status.toLowerCase()}`}>{amendment.status}</span></td>
          <td>{amendment.operation ?? '—'}</td>
          <td><a href={amendment.sourceUrl} target="_blank" rel="noreferrer">SEC ↗</a></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </section>
}
