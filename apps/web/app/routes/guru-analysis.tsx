import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { guruAnalysisResponseSchema } from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { guruAnalysisCopy, type GuruAnalysisCopy } from '../guru-analysis-copy'
import { formatExactDecimal, percent, shortDate } from '../guru-format'
import type { Locale } from '../destinations'
import { api, useUi } from '../ui'
import { guruCopy, type GuruCopy } from './gurus-copy'
import './gurus.css'
import './guru-research.css'
import './guru-analysis.css'

type AnalysisData = ReturnType<typeof guruAnalysisResponseSchema.parse>['data']
type Statement = NonNullable<AnalysisData['analysis']>['executiveSummary'][number]
type SectionKey = keyof GuruAnalysisCopy['sections']

const sectionOrder: SectionKey[] = [
  'executiveSummary', 'portfolioDirection', 'convictionPositions', 'newPositions', 'increasedPositions',
  'reducedPositions', 'exitedPositions', 'sectorAndThemeChange', 'concentrationChange', 'turnoverInterpretation',
  'historicalContext', 'consensusContext', 'risks', 'takeaways',
]

function Statements({ rows, copy }: { rows: readonly Statement[]; copy: GuruAnalysisCopy }) {
  return <ul className="guru-analysis-statements">{rows.map((row, index) => <li key={`${row.kind}:${index}`} className={`is-${row.kind}`}>
    <p>{row.text}</p>
    <div className="guru-analysis-statement-meta">
      <span className={`guru-analysis-kind is-${row.kind}`}>{row.kind === 'fact' ? copy.factLabel : copy.interpretationLabel}</span>
      {row.factRefs.length > 0 && <span>{copy.evidence}: {row.factRefs.join(', ')}</span>}
      {row.positionKeys.length > 0 && <span>{copy.positions}: {row.positionKeys.length}</span>}
    </div>
  </li>)}</ul>
}

function formatFactValue(value: string, label: string, locale: Locale) {
  const match = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(value)
  if (!match) return value
  const amount = match[1]!
  const suffix = match[2] ?? ''
  if (suffix.startsWith('%')) return `${percent(amount, locale)}${suffix.slice(1)}`
  if (label.includes('(%)')) return percent(amount!, locale)
  return `${formatExactDecimal(amount, locale)}${suffix}`
}

export default function GuruAnalysisPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { locale } = useUi()
  const c: GuruCopy = guruCopy[locale]
  const copy = guruAnalysisCopy(locale)
  const period = searchParams.get('period') ?? ''
  const [data, setData] = useState<AnalysisData | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setFailure(null)
    void api.GET('/api/gurus/{slug}/analysis', {
      params: { path: { slug }, query: period ? { period } : {} }, signal: controller.signal,
    }).then(response => {
      if (controller.signal.aborted) return
      const parsed = guruAnalysisResponseSchema.safeParse(response.data)
      if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, copy.failed))
      else setData(parsed.data.data)
    }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, copy.failed)) })
    return () => controller.abort()
  }, [slug, period, attempt, copy.failed])

  if (failure) return <section className="guru-analysis-page" data-testid="guru-analysis">
    <Link className="guru-back-link" to={`/gurus/${slug}`}>← {c.overview}</Link>
    <FailureNotice failure={failure} id="guru-analysis-error" messageOverride={copy.failed} />
    <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button>
  </section>
  if (!data) return <section className="guru-analysis-page" data-testid="guru-analysis"><p role="status">{copy.loading}</p></section>

  const { profile: person, provenance, analysis } = data
  const stateNote = copy.states[data.state]
  return <section className="guru-analysis-page" data-testid="guru-analysis">
    <Link className="guru-back-link" to={`/gurus/${person.slug}`}>← {c.overview}</Link>
    <p className="guru-disclosure" role="note">{copy.disclosed}</p>

    <header className="guru-research-heading">
      <p className="guru-eyebrow">{person.managerName}</p>
      <h1>{person.name}</h1>
      <nav aria-label="Guru research sections" className="guru-research-tabs">
        <Link to={`/gurus/${person.slug}`}>{c.overview}</Link>
        <Link to={`/gurus/${person.slug}/portfolio`}>{c.portfolio}</Link>
        <Link to={`/gurus/${person.slug}/changes`}>{c.changes}</Link>
        <Link to={`/gurus/${person.slug}/history`}>{c.history}</Link>
        <Link aria-current="page" to={`/gurus/${person.slug}/analysis`}>{c.analysis}</Link>
        <Link to={`/gurus/${person.slug}/filings`}>{c.filings}</Link>
      </nav>
      <h2 className="guru-research-subtitle">{copy.title}</h2>
      <p className="guru-analysis-quarter">{copy.quarter}: <strong>{data.periodEnd ?? '—'}</strong> <span className={`guru-analysis-state is-${data.state.toLowerCase()}`}>{data.state.replaceAll('_', ' ')}</span></p>
    </header>

    {stateNote && <p className="guru-stale-note" role="status" data-testid="guru-analysis-state">{stateNote}</p>}

    <dl className="guru-analysis-coverage" aria-label={copy.coverage}>
      <div><dt>{copy.quarter}</dt><dd>{data.coverage.quarterStatus}</dd></div>
      <div><dt>{copy.mappingCoverage}</dt><dd>{percent(data.coverage.mappingCoveragePercent, locale)}</dd></div>
      <div><dt>{copy.comparison}</dt><dd>{data.coverage.comparisonStatus?.replaceAll('_', ' ') ?? '—'}</dd></div>
      <div><dt>{copy.consensusAvailable}</dt><dd>{data.coverage.consensusAvailable ? copy.available : copy.unavailable}</dd></div>
    </dl>

    <section className="panel" aria-labelledby="guru-analysis-facts">
      <header><div><p className="guru-eyebrow">{data.periodEnd ?? '—'}</p><h2 id="guru-analysis-facts">{copy.facts}</h2></div></header>
      {data.facts.length === 0 ? <p className="guru-muted">{copy.noFacts}</p> : <dl className="guru-analysis-facts">{data.facts.map(fact => <div key={fact.id}>
        <dt>{fact.label}</dt><dd>{formatFactValue(fact.value, fact.label, locale)}</dd><code>{fact.id}</code>
      </div>)}</dl>}
    </section>

    {analysis && <div className="guru-analysis-sections">{sectionOrder.flatMap(key => {
      const rows = analysis[key]
      if (!rows.length) return []
      return [<section className="panel" key={key} aria-labelledby={`guru-analysis-${key}`}>
        <header><h2 id={`guru-analysis-${key}`}>{copy.sections[key]}</h2></header>
        <Statements rows={rows} copy={copy} />
      </section>]
    })}</div>}

    <section className="panel guru-analysis-caveats" aria-labelledby="guru-analysis-caveats">
      <header><h2 id="guru-analysis-caveats">{copy.caveats}</h2></header>
      <ul>{data.caveats.map(caveat => <li key={caveat.id}>{caveat.text}</li>)}</ul>
    </section>

    {provenance && <section className="panel" aria-labelledby="guru-analysis-provenance">
      <header><h2 id="guru-analysis-provenance">{copy.provenance}</h2></header>
      <dl className="guru-analysis-provenance">
        <div><dt>{copy.provenanceLabels.runId}</dt><dd>{provenance.runId}</dd></div>
        <div><dt>{copy.provenanceLabels.status}</dt><dd>{provenance.status}</dd></div>
        <div><dt>{copy.provenanceLabels.resultState}</dt><dd>{provenance.sourceState}</dd></div>
        <div><dt>{copy.provenanceLabels.prompt}</dt><dd>{provenance.promptKey}</dd></div>
        <div><dt>{copy.provenanceLabels.source}</dt><dd>{provenance.promptSource}</dd></div>
        <div><dt>{copy.provenanceLabels.promptVersion}</dt><dd>{provenance.promptOverrideVersionId ?? provenance.promptSystemVersion}</dd></div>
        <div><dt>{copy.provenanceLabels.provider}</dt><dd>{provenance.provider ?? '—'}</dd></div>
        <div><dt>{copy.provenanceLabels.model}</dt><dd>{provenance.model ?? '—'}</dd></div>
        <div><dt>{copy.provenanceLabels.schema}</dt><dd>{provenance.schemaVersion}</dd></div>
        <div><dt>{copy.provenanceLabels.analytics}</dt><dd>{provenance.analyticsVersion}</dd></div>
        <div><dt>{copy.provenanceLabels.consensus}</dt><dd>{provenance.consensusVersion ?? '—'}</dd></div>
        <div><dt>{copy.provenanceLabels.inputHash}</dt><dd><code>{provenance.inputHash.slice(0, 16)}…</code></dd></div>
        <div><dt>{copy.provenanceLabels.tokens}</dt><dd>{provenance.inputTokens ?? '—'} / {provenance.outputTokens ?? '—'}</dd></div>
        <div><dt>{copy.provenanceLabels.latency}</dt><dd>{provenance.latencyMs === null ? '—' : `${provenance.latencyMs} ms`}</dd></div>
        <div><dt>{copy.provenanceLabels.generatedAt}</dt><dd>{provenance.generatedAt ? shortDate(provenance.generatedAt, locale) : '—'}</dd></div>
      </dl>
    </section>}

    <section className="panel" aria-labelledby="guru-analysis-history">
      <header><h2 id="guru-analysis-history">{copy.history}</h2></header>
      {data.history.length === 0 ? <p className="guru-muted">{copy.noHistory}</p> : <ol className="guru-analysis-history">{data.history.map(run => <li key={run.runId}>
        <span>{run.periodEnd}</span><span>{run.status}</span><span>{run.sourceState}</span><span>{run.reason}</span>
        <span>{run.generatedAt ? shortDate(run.generatedAt, locale) : shortDate(run.queuedAt, locale)}</span>
        {run.errorCode && <span className="guru-analysis-error-code">{run.errorCode}</span>}
      </li>)}</ol>}
    </section>

    <section className="guru-source-line" aria-label={copy.sourceLabel}>
      <div><strong>{copy.sourceLabel}</strong><span>{data.source.periodEnd ?? '—'}{data.source.filedAt ? ` · ${shortDate(data.source.filedAt, locale)}` : ''}</span></div>
      {data.source.sourceUrl && <a href={data.source.sourceUrl} target="_blank" rel="noreferrer">{data.source.accession ?? 'SEC EDGAR'} ↗</a>}
    </section>
  </section>
}
