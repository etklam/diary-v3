import { useEffect, useState, type ReactNode } from 'react'
import {
  researchAttemptSchema,
  researchEvidenceSchema,
  researchInstrumentProfileSchema,
  researchMethodProfileSchema,
  researchRunDetailSchema,
  researchRunListResponseSchema,
  researchSettingsResponseSchema,
  type ResearchAttempt,
  type ResearchEvidence,
  type ResearchQaGate,
  type ResearchRunDetail,
  type ResearchRunSummary,
} from '@diary/contracts'
import { Link } from 'react-router'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { csrfToken, sessionFetch } from './session'
import { useUi } from './ui'
import { formatDate, permissionStatusLabel, researchConfigurationCopy, researchCopy, researchSourcePurposeKeys, statusLabel, type Locale } from './research-studio-copy'

export type ResearchRequestResult<T> = {
  response: Response
  data: T | null
  body: unknown
  failure: Failure | null
}

export async function researchRequest<T>(
  path: string,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  fallback: string,
  init?: RequestInit,
): Promise<ResearchRequestResult<T>> {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !csrfToken()) await sessionFetch('/api/auth/me')
  const response = await sessionFetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(['GET', 'HEAD', 'OPTIONS'].includes(method) ? {} : { 'x-csrf-token': csrfToken() ?? '' }),
      ...init?.headers,
    },
  })
  const body = await response.json().catch(() => null)
  const parsed = schema.safeParse(body)
  return {
    response,
    data: response.ok && parsed.success ? (parsed.data ?? null) : null,
    body,
    failure: response.ok && parsed.success ? null : apiFailure(body, fallback),
  }
}

export function useResearchRun(id: string | undefined, attempt: number) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const [run, setRun] = useState<ResearchRunDetail | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setLoading(true); setFailure(null)
    void researchRequest(`/api/admin/research/runs/${encodeURIComponent(id)}`, researchRunDetailSchema, c.failed, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setRun(result.data); setFailure(result.failure) } })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: c.connection, fields: [] }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt, c.connection, c.failed, id])
  return { run, failure, loading }
}

export function ResearchStatus({ value, tone = 'neutral', label }: { value: string; tone?: 'neutral' | 'info' | 'warn' | 'negative' | 'positive'; label?: string }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  return <span className={`research-status research-status-${tone}`} data-status={value}>{label ?? statusLabel(value, c)}</span>
}

export function statusTone(value: string): 'neutral' | 'info' | 'warn' | 'negative' | 'positive' {
  if (['FULL', 'APPROVED', 'PASS', 'SUCCEEDED'].includes(value)) return 'info'
  if (['LIMITED', 'STALE', 'WARN', 'CHANGES_REQUIRED', 'BLOCKED', 'OUTCOME_UNKNOWN'].includes(value)) return 'warn'
  if (['FAILED', 'FAIL', 'CANCELLED'].includes(value)) return 'negative'
  if (['GENERATING', 'COLLECTING', 'DATA_READY', 'DRAFT_READY'].includes(value)) return 'info'
  return 'neutral'
}

export function RunLabels({ run }: { run: ResearchRunSummary }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  return <div className="research-labels" aria-label={`${c.quality}: ${statusLabel(run.quality, c)}; ${c.review}: ${statusLabel(run.reviewStatus, c)}`}>
    <ResearchStatus value={run.quality} tone={statusTone(run.quality)} />
    <ResearchStatus value={run.reviewStatus} tone={statusTone(run.reviewStatus)} />
  </div>
}

export function RunMeta({ run }: { run: ResearchRunSummary }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  return <dl className="research-run-meta">
    <div><dt>{c.referenceSession}</dt><dd><time dateTime={run.referenceSession ?? undefined}>{formatDate(run.referenceSession, locale as Locale)}</time></dd></div>
    <div><dt>{c.execution}</dt><dd><ResearchStatus value={run.executionStatus} tone={statusTone(run.executionStatus)} /></dd></div>
    <div><dt>{c.dispatch}</dt><dd><ResearchStatus value={run.dispatchStatus} tone={statusTone(run.dispatchStatus)} /></dd></div>
    <div><dt>{c.lastChanged}</dt><dd><time dateTime={run.updatedAt}>{formatDate(run.updatedAt, locale as Locale, true)}</time></dd></div>
  </dl>
}

export function ResearchFailure({ failure, onRetry, id = 'research-error' }: { failure: Failure | null; onRetry?: () => void; id?: string }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  if (!failure) return null
  return <div className="research-failure">
    <FailureNotice failure={failure} id={id} />
    {onRetry && <button type="button" className="secondary" onClick={onRetry}>{c.retry}</button>}
  </div>
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: string; actions?: ReactNode }) {
  return <header className="research-page-header"><div><h1>{title}</h1>{intro && <p className="lede">{intro}</p>}</div>{actions && <div className="research-page-actions">{actions}</div>}</header>
}

export function DetailHeader({ run, children }: { run: ResearchRunDetail; children?: ReactNode }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  return <header className="research-detail-header">
    <div><Link className="research-back" to="/admin/research">{c.back}</Link><h1>{run.instrument.symbol} · {run.instrument.name}</h1><p className="lede">{c.detail} · {run.method.title} · {c.reportDate}: {formatDate(run.referenceSession, locale as Locale)}</p></div>
    <div className="research-detail-header-meta"><div><span>{c.quality}</span><ResearchStatus value={run.quality} tone={statusTone(run.quality)} /></div><div><span>{c.review}</span><ResearchStatus value={run.reviewStatus} tone={statusTone(run.reviewStatus)} /></div>{children}</div>
  </header>
}

export function DetailTabs({ active, onChange }: { active: 'preview' | 'evidence' | 'qa' | 'activity'; onChange: (value: 'preview' | 'evidence' | 'qa' | 'activity') => void }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const tabs = [['preview', c.preview], ['evidence', c.evidence], ['qa', c.qa], ['activity', c.activity]] as const
  return <div className="research-tabs" role="tablist" aria-label={c.detail}>{tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={active === value} className={active === value ? 'research-tab-selected' : ''} onClick={() => onChange(value)}>{label}</button>)}</div>
}

export function EvidencePanel({ evidence }: { evidence: ResearchEvidence | null }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const sourceCopy = researchConfigurationCopy(locale as Locale)
  if (!evidence) return <div className="research-empty-panel"><p>{c.noEvidence}</p></div>
  const manifest = evidence.manifest
  const search = evidence.candidates.search
  const searchStatus = search?.status ?? 'UNKNOWN'
  const searchLabel = searchStatus === 'READY' ? sourceCopy.searchReadyLabel
    : searchStatus === 'SEARCH_NOT_CONFIGURED' ? sourceCopy.searchNotConfiguredLabel
      : searchStatus === 'SEARCH_BUDGET_NOT_CONFIGURED' ? sourceCopy.searchBudgetNotConfiguredLabel
        : searchStatus === 'SEARCH_QUOTA_EXCEEDED' ? sourceCopy.searchQuotaExceededLabel
          : sourceCopy.searchUnknownLabel
  const searchMessage = searchStatus === 'READY'
    ? search?.results ? search.results.length ? sourceCopy.searchReady : sourceCopy.searchNoLeads : sourceCopy.searchNoResultsRecorded
    : searchStatus === 'SEARCH_NOT_CONFIGURED' ? sourceCopy.searchNotConfigured
      : searchStatus === 'SEARCH_BUDGET_NOT_CONFIGURED' ? sourceCopy.searchBudgetNotConfigured
        : searchStatus === 'SEARCH_QUOTA_EXCEEDED' ? sourceCopy.searchQuotaExceeded
          : sourceCopy.searchStatusUnknown
  return <div className="research-panel-stack">
    <section className="research-panel" aria-labelledby="research-coverage"><h2 id="research-coverage">{c.coverage}</h2><dl className="research-metric-grid"><div><dt>{c.rows}</dt><dd>{manifest.rowCount}</dd></div><div><dt>{c.completeOhlc}</dt><dd>{manifest.completeOhlcRows}</dd></div><div><dt>{c.closeRows}</dt><dd>{manifest.closeRows}</dd></div><div><dt>{c.volumeRows}</dt><dd>{manifest.volumeRows}</dd></div><div><dt>{c.missing}</dt><dd>{manifest.missingSessions.length}</dd></div></dl>{manifest.warnings.length ? <ul className="research-warning-list">{manifest.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}</ul> : <p className="muted">{c.noWarnings}</p>}</section>
    <section className="research-panel research-search-panel" aria-labelledby="research-search">
      <div className="research-panel-heading">
        <h2 id="research-search">{sourceCopy.searchStatus}</h2>
        <ResearchStatus value={searchStatus} tone={searchStatus === 'READY' ? 'info' : searchStatus === 'SEARCH_QUOTA_EXCEEDED' ? 'warn' : 'neutral'} label={searchLabel} />
      </div>
      <p className="muted">{searchMessage}</p>
      {search?.query && <p><strong>{sourceCopy.searchQuery}:</strong> {search.query}</p>}
      {search?.retrievedAt && <p className="muted"><strong>{sourceCopy.searchRetrievedAt}:</strong> <time dateTime={search.retrievedAt}>{formatDate(search.retrievedAt, locale as Locale, true)}</time></p>}
      {search?.results && <>
        <p><strong>{sourceCopy.searchLeadCount}:</strong> {search.results.length}</p>
        {search.results.length > 0 && <ol className="research-search-results">{search.results.map((result, index) => <li key={`${result.url}-${index}`}><article><h3><a href={result.url} target="_blank" rel="noopener noreferrer">{result.title || sourceCopy.searchOpenResult}</a></h3>{result.snippet && <p>{result.snippet}</p>}{result.publishedDate && <p className="muted">{sourceCopy.searchPublished}: {formatDate(result.publishedDate, locale as Locale)}</p>}</article></li>)}</ol>}
      </>}
      {search?.usage && <p className="muted">{sourceCopy.searchUsage}: {search.usage.calls} {sourceCopy.searchCalls} · {search.usage.billedCredits ?? '—'} {sourceCopy.searchCredits}</p>}
    </section>
    <section className="research-panel" aria-labelledby="research-sources"><h2 id="research-sources">{c.source}</h2>{evidence.sources.length ? <div className="research-source-list">{evidence.sources.map((source, sourceIndex) => {
      const permissions = researchSourcePurposeKeys.map(key => [key, source.use[key]] as const)
      return <article key={`${source.sourceId}-${sourceIndex}`} className="research-source-row"><div className="research-source-summary"><div><h3>{source.title ?? source.sourceId}</h3><p className="muted">{source.publisher ?? source.sourceId} · {c.retrieved}: {formatDate(source.retrievedAt, locale as Locale, true)} · {c.dataAsOf}: {formatDate(source.dataAsOf, locale as Locale, true)}</p></div><div className="research-source-purpose-badges" role="list" aria-label={c.sourceRights}>{permissions.map(([purpose, permission]) => <span key={purpose} role="listitem" aria-label={`${sourceCopy[purpose]}: ${permissionStatusLabel(permission.status, sourceCopy)}`} className={`research-purpose-badge research-purpose-${permission.status}`}><span>{sourceCopy[purpose]}</span><strong>{permissionStatusLabel(permission.status, sourceCopy)}</strong></span>)}</div></div><details className="research-source-details"><summary>{sourceCopy.sourceDetails}</summary><dl className="research-source-identifiers"><div><dt>{sourceCopy.sourceId}</dt><dd><code>{source.sourceId}</code></dd></div>{source.requestedUrl && <div><dt>{sourceCopy.requestedUrl}</dt><dd>{source.requestedUrl.startsWith('https://') ? <a href={source.requestedUrl} target="_blank" rel="noopener noreferrer">{source.requestedUrl}</a> : source.requestedUrl}</dd></div>}{source.resolvedUrl && <div><dt>{sourceCopy.resolvedUrl}</dt><dd><a href={source.resolvedUrl} target="_blank" rel="noopener noreferrer">{source.resolvedUrl}</a></dd></div>}{source.readRange && <div><dt>{sourceCopy.readRange}</dt><dd>{source.readRange}</dd></div>}{source.evidenceLocator && <div><dt>{sourceCopy.evidenceLocator}</dt><dd><code>{source.evidenceLocator}</code></dd></div>}{source.contentHash && <div><dt>{sourceCopy.contentHash}</dt><dd><code>{source.contentHash}</code></dd></div>}</dl>{source.limitations.length > 0 && <div className="research-source-limitations"><h4>{sourceCopy.sourceLimitations}</h4><ul>{source.limitations.map((limitation, index) => <li key={`${index}:${limitation}`}>{limitation}</li>)}</ul></div>}<dl className="research-source-permissions" aria-label={`${source.sourceId}: ${c.sourceRights}`}>{permissions.map(([purpose, permission]) => <div key={purpose}><dt>{sourceCopy[purpose]} <ResearchStatus value={permission.status} tone={permission.status === 'allowed' ? 'info' : permission.status === 'restricted' ? 'warn' : 'neutral'} label={permissionStatusLabel(permission.status, sourceCopy)} /></dt><dd><span><strong>{sourceCopy.conditions}:</strong> {permission.conditions.length ? permission.conditions.join(' · ') : sourceCopy.noConditions}</span><span><strong>{sourceCopy.basis}:</strong> {permission.basis ?? sourceCopy.noBasis}</span><span><strong>{sourceCopy.checkedAt}:</strong> {permission.checkedAt ? <time dateTime={permission.checkedAt}>{formatDate(permission.checkedAt, locale as Locale, true)}</time> : sourceCopy.notRecorded}</span></dd></div>)}</dl></details></article>
    })}</div> : <p className="muted">{c.noEvidence}</p>}</section>
  </div>
}

export function QAPanel({ run, qa }: { run: ResearchRunDetail; qa?: ResearchQaGate[] }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const gates = qa ?? (run.latestQa.length ? run.latestQa : run.evidence?.qa ?? [])
  return <section className="research-panel" aria-labelledby="research-qa-panel"><h2 id="research-qa-panel">{c.qa}</h2>{gates.length ? <div className="research-qa-list">{gates.map(gate => <article key={gate.gateId} className="research-qa-row"><div className="research-qa-heading"><h3>{gate.gateId}</h3><span className="muted">{gate.severity === 'CORE' ? 'CORE' : c.severity}</span><ResearchStatus value={gate.status} tone={statusTone(gate.status)} /></div>{gate.evidence.length > 0 && <p><strong>{c.qaReviewEvidence}:</strong> {gate.evidence.join(' · ')}</p>}{gate.reason && <p><strong>{c.reason}:</strong> {gate.reason}</p>}{gate.remediation && <p><strong>{c.remediation}:</strong> {gate.remediation}</p>}{gate.reviewedAt && <p className="muted">{c.reviewer}: {gate.reviewerId ?? '—'} · {formatDate(gate.reviewedAt, locale as Locale, true)}</p>}</article>)}</div> : <p className="muted">{c.noQa}</p>}</section>
}

export function ActivityPanel({ attempts }: { attempts: ResearchAttempt[] }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  return <section className="research-panel" aria-labelledby="research-activity-panel"><h2 id="research-activity-panel">{c.activity}</h2>{attempts.length ? <div className="research-attempt-list">{attempts.map(attempt => <article key={attempt.id} className="research-attempt-row"><div><h3>{c.attempt} {attempt.id}</h3><p className="muted">{formatDate(attempt.createdAt, locale as Locale, true)} · {c.model}: {attempt.model ?? '—'}</p></div><div className="research-attempt-meta"><ResearchStatus value={attempt.dispatchStatus} tone={statusTone(attempt.dispatchStatus)} /><span>{c.usage}: {attempt.inputTokens ?? '—'} / {attempt.outputTokens ?? '—'}</span><span>{c.reserved}: {attempt.reservedCostCents}¢</span></div>{attempt.diagnostics && <p className="research-diagnostic">{c.diagnostics}: {attempt.diagnostics}</p>}</article>)}</div> : <p className="muted">{c.noAttempts}</p>}</section>
}

export function NextAction({ run, linkedPost = false }: { run: ResearchRunDetail; linkedPost?: boolean }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const configCopy = researchConfigurationCopy(locale as Locale)
  const synthetic = run.evidence?.manifest.synthetic === true
  const blocked = run.method.status !== 'COMPLETE' || (!synthetic && (run.executionStatus === 'BLOCKED' || run.quality !== 'FULL'))
  const text = run.reviewStatus === 'APPROVED' ? linkedPost ? configCopy.updateArticleDraft : c.handoff : run.currentRevision > 0 ? c.approve : run.executionStatus === 'DATA_READY' || synthetic ? c.generate : c.prepare
  const reason = run.method.status !== 'COMPLETE' ? c.incompleteMethod : synthetic ? configCopy.syntheticRun : c.sourceUnavailable
  return <aside className="research-next-action" aria-labelledby="research-next-action-title"><h2 id="research-next-action-title">{c.nextAction}</h2><p>{blocked ? c.blockedHint : text}</p>{(blocked || synthetic) && <p className="research-blocking-reason">{reason}</p>}<div className="research-action-state"><ResearchStatus value={run.executionStatus} tone={statusTone(run.executionStatus)} /><ResearchStatus value={run.quality} tone={statusTone(run.quality)} /></div></aside>
}

export function Limitations({ run }: { run: ResearchRunDetail }) {
  const { locale } = useUi()
  const c = researchCopy(locale as Locale)
  const policyLine = /^(automated_fetch|evidence_storage|llm_inference|publication_of_analysis_and_excerpts|raw_data_redistribution):/u
  const limitations = [...new Set((run.evidence?.sources.flatMap(source => source.limitations) ?? []).filter(value => !policyLine.test(value)))]
  const visible = limitations.slice(0, 3)
  const rest = limitations.slice(3)
  return <section className="research-limitations" aria-labelledby="research-limitations-title"><h2 id="research-limitations-title">{c.limitations}</h2>{limitations.length ? <><ul>{visible.map((limitation, index) => <li key={`${index}:${limitation}`}>{limitation}</li>)}</ul>{rest.length > 0 && <details className="research-more-limitations"><summary>{researchConfigurationCopy(locale as Locale).showAllLimitations} ({rest.length})</summary><ul>{rest.map((limitation, index) => <li key={`${index}:${limitation}`}>{limitation}</li>)}</ul></details>}</> : <p className="muted">{c.noLimitations}</p>}</section>
}

export function schemaForSettings() {
  return researchSettingsResponseSchema
}

export function schemaForMethods() {
  return researchMethodProfileSchema.array()
}

export function schemaForInstruments() {
  return researchInstrumentProfileSchema.array()
}

export function schemaForList() {
  return researchRunListResponseSchema
}

export function schemaForAttempt() {
  return researchAttemptSchema
}

export function schemaForEvidence() {
  return researchEvidenceSchema
}
