import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import {
  guruActivityQuerySchema,
  guruActivityResponseSchema,
  guruChangesResponseSchema,
  guruFilingsResponseSchema,
  guruHistoryResponseSchema,
  guruPortfolioResponseSchema,
  guruPositionHistoryResponseSchema,
  guruResearchQuerySchema,
} from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import type { Locale } from '../destinations'
import { compactUsd, formatExactDecimal, formatSignedDecimal, formatSignedPercent, percent } from '../guru-format'
import { api, useUi } from '../ui'
import { guruCopy, type GuruCopy } from './gurus-copy'
import { guruResearchCopy } from '../guru-research-copy'
import './guru-research.css'

type PortfolioData = ReturnType<typeof guruPortfolioResponseSchema.parse>['data']
type ChangesData = ReturnType<typeof guruChangesResponseSchema.parse>['data']
type HistoryData = ReturnType<typeof guruHistoryResponseSchema.parse>['data']
type FilingsData = ReturnType<typeof guruFilingsResponseSchema.parse>['data']
type ActivityData = ReturnType<typeof guruActivityResponseSchema.parse>['data']
type Holding = PortfolioData['holdings'][number]

function modeFor(pathname: string) {
  if (pathname === '/gurus/activity') return 'activity'
  if (pathname.endsWith('/portfolio')) return 'portfolio'
  if (pathname.endsWith('/changes')) return 'changes'
  if (pathname.endsWith('/history')) return 'history'
  if (pathname.endsWith('/filings')) return 'filings'
  return 'portfolio'
}

function PositionHistory({ slug, holding, locale, copy }: { slug: string; holding: Holding; locale: Locale; copy: ReturnType<typeof guruResearchCopy> }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<ReturnType<typeof guruPositionHistoryResponseSchema.parse>['data'] | null>(null)
  const [failure, setFailure] = useState(false)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void api.GET('/api/gurus/{slug}/position-history', { params: { path: { slug }, query: { positionKey: holding.positionKey } }, signal: controller.signal }).then(response => {
      const parsed = guruPositionHistoryResponseSchema.safeParse(response.data)
      if (controller.signal.aborted) return
      if (response.response.ok && parsed.success) setHistory(parsed.data.data)
      else setFailure(true)
    }).catch(() => { if (!controller.signal.aborted) setFailure(true) })
    return () => controller.abort()
  }, [holding.positionKey, open, slug])
  return <details className="guru-position-history" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{copy.details}</summary>
    {failure && <p role="alert">{copy.failed}</p>}
    {!history && !failure && open && <p role="status">{copy.loading}</p>}
    {history && <>
      <a className="secondary guru-export-link" href={`/api/gurus/${encodeURIComponent(slug)}/position-history.csv?${new URLSearchParams({ positionKey: holding.positionKey })}`}>{copy.export}</a>
      <ol>{history.history.map(row => <li key={row.periodEnd}><time>{row.periodEnd}</time><span>{copy.action}: {row.action}</span><span>{copy.shares}: {formatExactDecimal(row.quantity, locale)}</span><span>{copy.weight}: {percent(row.weightPercent, locale)}</span><span>{copy.reported}: {compactUsd(row.reportedValueUsd, locale)}</span><span>{copy.rankLabel}: {row.rank ?? '—'}</span><span>{row.source.map(source => <a key={source.accession} href={source.sourceUrl} target="_blank" rel="noreferrer">{source.accession}</a>)}</span></li>)}</ol>
    </>}
  </details>
}

function HoldingTable({ slug, rows, locale, c }: { slug: string; rows: Holding[]; locale: Locale; c: ReturnType<typeof guruResearchCopy> }) {
  const labels = [c.ticker, c.company, c.sector, c.type, c.putCall, c.action, c.shares, c.reported, c.weight, c.qoqSharesChange, c.qoqWeightChange, c.rankLabel, c.previousRank, c.details]
  return <>
    <div className="guru-research-table-scroll"><table className="guru-research-table">
      <thead><tr>{labels.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.positionKey}>
        <td>{row.ticker ?? '—'}</td><td>{row.company}</td><td>{row.sector ?? '—'}</td><td>{row.securityType ?? row.quantityType}</td><td>{row.putCall ?? '—'}</td>
        <td><span className={`guru-action-pill is-${row.action.toLowerCase()}`}>{row.action.replace('_', ' ')}</span></td>
        <td>{formatExactDecimal(row.quantity, locale)}</td><td>{compactUsd(row.reportedValueUsd, locale)}</td><td>{percent(row.weightPercent, locale)}</td>
        <td>{formatSignedDecimal(row.quantityChange, locale)} ({formatSignedPercent(row.quantityChangePercent, locale)})</td>
        <td>{formatSignedPercent(row.weightChangePercentagePoints, locale)}</td><td>{row.rank ?? '—'}</td><td>{row.previousRank ?? '—'}</td>
        <td><PositionHistory slug={slug} holding={row} locale={locale} copy={c} /></td>
      </tr>)}</tbody>
    </table></div>
    <div className="guru-research-cards">{rows.map(row => <article className="guru-research-card" key={row.positionKey}>
      <header><div><strong>{row.ticker ?? row.company}</strong><span>{row.ticker ? row.company : row.quantityType}</span></div><span className={`guru-action-pill is-${row.action.toLowerCase()}`}>{row.action.replace('_', ' ')}</span></header>
      <dl><div><dt>{c.type}</dt><dd>{row.securityType ?? row.quantityType}</dd></div><div><dt>{c.putCall}</dt><dd>{row.putCall ?? '—'}</dd></div><div><dt>{c.shares}</dt><dd>{formatExactDecimal(row.quantity, locale)}</dd></div><div><dt>{c.qoqSharesChange}</dt><dd>{formatSignedDecimal(row.quantityChange, locale)} ({formatSignedPercent(row.quantityChangePercent, locale)})</dd></div><div><dt>{c.weight}</dt><dd>{percent(row.weightPercent, locale)}</dd></div><div><dt>{c.qoqWeightChange}</dt><dd>{formatSignedPercent(row.weightChangePercentagePoints, locale)}</dd></div><div><dt>{c.reported}</dt><dd>{compactUsd(row.reportedValueUsd, locale)}</dd></div><div><dt>{c.rankLabel}</dt><dd>{row.rank ?? '—'}</dd></div><div><dt>{c.previousRank}</dt><dd>{row.previousRank ?? '—'}</dd></div><div><dt>{c.sector}</dt><dd>{row.sector ?? '—'}</dd></div></dl>
      <PositionHistory slug={slug} holding={row} locale={locale} copy={c} />
    </article>)}</div>
  </>
}

export default function GuruResearchPage() {
  const { slug = '' } = useParams()
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { locale } = useUi()
  const c: GuruCopy = guruCopy[locale]
  const copy = guruResearchCopy(locale)
  const mode = modeFor(pathname)
  const period = searchParams.get('period') ?? ''
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null)
  const [changesData, setChangesData] = useState<ChangesData | null>(null)
  const [historyData, setHistoryData] = useState<HistoryData | null>(null)
  const [filingsData, setFilingsData] = useState<FilingsData | null>(null)
  const [activityData, setActivityData] = useState<ActivityData | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [search, setSearch] = useState('')
  const [guruFilter, setGuruFilter] = useState('')
  const [sector, setSector] = useState('')
  const [securityType, setSecurityType] = useState('')
  const [quantityType, setQuantityType] = useState('')
  const [action, setAction] = useState('')
  const [minWeight, setMinWeight] = useState('')
  const [minChangePercent, setMinChangePercent] = useState('')
  const [sort, setSort] = useState<'rank' | 'weight' | 'value' | 'change'>('rank')

  const researchQuery = useMemo(() => guruResearchQuerySchema.parse({
    ...(period ? { period } : {}), ...(search ? { search } : {}), ...(sector ? { sector } : {}),
    ...(securityType ? { securityType } : {}), ...(quantityType ? { quantityType } : {}),
    ...(['NEW', 'STRONG_ADD', 'ADD', 'UNCHANGED', 'REDUCE', 'STRONG_REDUCE', 'EXIT'].includes(action) ? { action } : {}),
    ...(action === '__new__' ? { newOnly: 'true' } : {}),
    ...(action === '__increased__' ? { increasedOnly: 'true' } : {}),
    ...(action === '__reduced__' ? { reducedOnly: 'true' } : {}), sort,
  }), [action, period, quantityType, search, sector, securityType, sort])

  useEffect(() => {
    const controller = new AbortController()
    setFailure(null)
    if (mode === 'activity') {
      setActivityData(null)
      const query = guruActivityQuerySchema.parse({
        ...(search ? { symbol: search } : {}), ...(sector ? { sector } : {}), ...(period ? { period } : {}),
        ...(guruFilter ? { guru: guruFilter } : {}), ...(action ? { action } : {}), ...(minWeight ? { minWeight } : {}), ...(minChangePercent ? { minChangePercent } : {}),
      })
      void api.GET('/api/gurus/activity', { params: { query }, signal: controller.signal }).then(response => {
        const parsed = guruActivityResponseSchema.safeParse(response.data)
        if (controller.signal.aborted) return
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, copy.failed))
        else setActivityData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, copy.failed)) })
    } else if (mode === 'portfolio' || mode === 'changes') {
      if (mode === 'portfolio') setPortfolioData(null)
      else setChangesData(null)
      if (mode === 'portfolio') void api.GET('/api/gurus/{slug}/portfolio', { params: { path: { slug }, query: researchQuery }, signal: controller.signal }).then(response => {
        if (controller.signal.aborted) return
        const parsed = guruPortfolioResponseSchema.safeParse(response.data)
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, copy.failed))
        else setPortfolioData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, copy.failed)) })
      else void api.GET('/api/gurus/{slug}/changes', { params: { path: { slug }, query: researchQuery }, signal: controller.signal }).then(response => {
        if (controller.signal.aborted) return
        const parsed = guruChangesResponseSchema.safeParse(response.data)
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, copy.failed))
        else setChangesData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, copy.failed)) })
    } else if (mode === 'history') {
      setHistoryData(null)
      void api.GET('/api/gurus/{slug}/history', { params: { path: { slug } }, signal: controller.signal }).then(response => {
        const parsed = guruHistoryResponseSchema.safeParse(response.data)
        if (controller.signal.aborted) return
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, copy.failed))
        else setHistoryData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, copy.failed)) })
    } else {
      setFilingsData(null)
      void api.GET('/api/gurus/{slug}/filings', { params: { path: { slug } }, signal: controller.signal }).then(response => {
        const parsed = guruFilingsResponseSchema.safeParse(response.data)
        if (controller.signal.aborted) return
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, copy.failed))
        else setFilingsData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, copy.failed)) })
    }
    return () => controller.abort()
  }, [action, attempt, copy.failed, guruFilter, minChangePercent, minWeight, mode, period, researchQuery, search, sector, securityType, quantityType, slug])

  const activeData = mode === 'portfolio' ? portfolioData : mode === 'changes' ? changesData : null
  const person = activeData?.profile ?? historyData?.profile ?? filingsData?.profile
  const quarter = mode === 'portfolio' ? portfolioData?.quarter : mode === 'changes' ? changesData?.quarter : undefined
  const periods = mode === 'portfolio' ? portfolioData?.periods ?? [] : mode === 'changes' ? changesData?.periods ?? [] : []
  const csvQuery = new URLSearchParams()
  if (period) csvQuery.set('period', period)
  if (search) csvQuery.set('search', search)
  if (sector) csvQuery.set('sector', sector)
  if (securityType) csvQuery.set('securityType', securityType)
  if (quantityType) csvQuery.set('quantityType', quantityType)
  for (const [key, value] of Object.entries(researchQuery)) if (typeof value === 'string') csvQuery.set(key, value)
  const download = `/api/gurus/${encodeURIComponent(slug)}/${mode === 'changes' ? 'changes.csv' : 'portfolio.csv'}?${csvQuery.toString()}`

  function choosePeriod(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('period', value)
    else next.delete('period')
    setSearchParams(next)
  }

  if (failure) return <section className="guru-research-page"><Link to="/gurus">← {c.back}</Link><FailureNotice failure={failure} id="guru-research-error" messageOverride={copy.failed} /><button className="secondary" type="button" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button></section>
  const loading = mode === 'portfolio' ? !portfolioData : mode === 'changes' ? !changesData : mode === 'history' ? !historyData : mode === 'filings' ? !filingsData : !activityData
  if (loading) return <section className="guru-research-page" data-testid={`guru-${mode}`}><p role="status">{copy.loading}</p></section>

  if (mode === 'activity') return <section className="guru-research-page" data-testid="guru-activity">
    <header className="guru-research-heading"><p className="guru-eyebrow">{c.source}</p><h1>{copy.activity}</h1><p>{copy.disclosed}</p></header>
    <form className="guru-research-filters" onSubmit={event => event.preventDefault()}>
      <label>{copy.symbol}<input value={search} onChange={event => setSearch(event.currentTarget.value)} placeholder="MSFT" /></label>
      <label>{copy.guru}<input value={guruFilter} onChange={event => setGuruFilter(event.currentTarget.value)} placeholder="warren-buffett" /></label>
      <label>{copy.sector}<input value={sector} onChange={event => setSector(event.currentTarget.value)} /></label>
      <label>{copy.periodEnd}<input type="date" value={period} onChange={event => choosePeriod(event.currentTarget.value)} /></label>
      <label>{copy.actionFilter}<select value={action} onChange={event => setAction(event.currentTarget.value)}><option value="">{copy.all}</option>{['NEW', 'STRONG_ADD', 'ADD', 'REDUCE', 'STRONG_REDUCE', 'EXIT'].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>{copy.minimumWeight}<input inputMode="decimal" value={minWeight} onChange={event => setMinWeight(event.currentTarget.value)} /></label>
      <label>{copy.minimumChange}<input inputMode="decimal" value={minChangePercent} onChange={event => setMinChangePercent(event.currentTarget.value)} /></label>
    </form>
    {activityData!.items.length === 0 ? <p className="guru-muted">{copy.empty}</p> : <div className="guru-activity-list">{activityData!.items.map((row, index) => <article key={`${row.guru.slug}:${row.periodEnd}:${row.ticker}:${row.action}:${index}`}>
      <div><strong>{row.guru.name}</strong><span>{row.periodEnd}</span></div><strong>{row.ticker ?? row.company}</strong><span>{row.company}</span>
      <span className={`guru-action-pill is-${row.action.toLowerCase()}`}>{row.action.replace('_', ' ')}</span>
      <span>{copy.weight}: {percent(row.currentWeightPercent ?? row.previousWeightPercent, locale)}</span>
      <span>{copy.sharesChange}: {formatSignedPercent(row.quantityChangePercent, locale)}</span>
      {row.source.map(source => <a key={source.accession} href={source.sourceUrl} target="_blank" rel="noreferrer">{source.accession}</a>)}
    </article>)}</div>}
  </section>

  const modeTitle = mode === 'portfolio' ? copy.portfolio : mode === 'changes' ? copy.changes : mode === 'history' ? copy.history : copy.filings
  const portfolioRows = portfolioData?.holdings ?? []
  const changeGroups = changesData ? [
    [copy.newPositions, changesData.newPositions], [copy.increased, changesData.increasedPositions],
    [copy.reduced, changesData.reducedPositions], [copy.exited, changesData.exitedPositions],
    [copy.largestWeight, changesData.largestWeightChanges], [copy.largestRank, changesData.largestRankChanges],
  ] as const : []

  return <section className="guru-research-page" data-testid={`guru-${mode}`}>
    <Link className="guru-back-link" to={person ? `/gurus/${person.slug}` : '/gurus'}>← {c.overview}</Link>
    <p className="guru-disclosure" role="note">{copy.disclosed}</p>
    {person && <header className="guru-research-heading"><p className="guru-eyebrow">{person.managerName}</p><h1>{person.name}</h1><nav aria-label="Guru research sections" className="guru-research-tabs">
      <Link to={`/gurus/${person.slug}`}>{c.overview}</Link><Link to={`/gurus/${person.slug}/portfolio`} aria-current={mode === 'portfolio' ? 'page' : undefined}>{copy.portfolio}</Link>
      <Link to={`/gurus/${person.slug}/changes`} aria-current={mode === 'changes' ? 'page' : undefined}>{copy.changes}</Link><Link to={`/gurus/${person.slug}/history`} aria-current={mode === 'history' ? 'page' : undefined}>{copy.history}</Link><Link to={`/gurus/${person.slug}/analysis`}>{c.analysis}</Link><Link to={`/gurus/${person.slug}/filings`} aria-current={mode === 'filings' ? 'page' : undefined}>{copy.filings}</Link>
    </nav><h2 className="guru-research-subtitle">{modeTitle}</h2></header>}

    {(mode === 'portfolio' || mode === 'changes') && <div className="guru-research-period-row">
      <label>{copy.quarter}<select value={period || quarter?.periodEnd || ''} onChange={event => choosePeriod(event.currentTarget.value)}><option value="">{periods.find(row => row.status === 'READY')?.periodEnd ?? copy.all}</option>{periods.map(row => <option key={row.periodEnd ?? 'none'} value={row.periodEnd ?? ''}>{row.periodEnd ?? '—'} · {copy.statusLabel(row.status)}</option>)}</select></label>
      <span className={`guru-quality is-${(quarter?.status ?? 'PENDING').toLowerCase()}`}>{copy.statusLabel(quarter?.status ?? 'PENDING')}</span>
      <a className="secondary guru-export-link" href={download}>{copy.export}</a>
    </div>}

    {quarter && quarter.status !== 'READY' && <p className="guru-stale-note" role="status">{copy.dataPartial}</p>}

    {mode === 'portfolio' && <>
      <div className="guru-research-filters">
        <label>{copy.search}<input value={search} onChange={event => setSearch(event.currentTarget.value)} /></label>
        <label>{copy.sector}<select value={sector} onChange={event => setSector(event.currentTarget.value)}><option value="">{copy.all}</option>{[...new Set(portfolioRows.flatMap(row => row.sector ? [row.sector] : []))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{copy.securityType}<select value={securityType} onChange={event => setSecurityType(event.currentTarget.value)}><option value="">{copy.all}</option>{[...new Set(portfolioRows.flatMap(row => row.securityType ? [row.securityType] : []))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{copy.quantityType}<select value={quantityType} onChange={event => setQuantityType(event.currentTarget.value)}><option value="">{copy.all}</option><option value="SH">{copy.shares}</option><option value="PRN">{copy.principal}</option></select></label>
        <label>{copy.actionFilter}<select value={action} onChange={event => setAction(event.currentTarget.value)}><option value="">{copy.all}</option><option value="__new__">{copy.newOnly}</option><option value="__increased__">{copy.increasedOnly}</option><option value="__reduced__">{copy.reducedOnly}</option></select></label>
        <label>{copy.sort}<select value={sort} onChange={event => setSort(event.currentTarget.value as typeof sort)}><option value="rank">{copy.rank}</option><option value="weight">{copy.weight}</option><option value="value">{copy.value}</option><option value="change">{copy.change}</option></select></label>
      </div>
      {quarter?.status === 'READY' && portfolioRows.length === 0 ? <p className="guru-muted">{copy.empty}</p> : <HoldingTable slug={slug} rows={portfolioRows} locale={locale} c={copy} />}
    </>}

    {mode === 'changes' && <div className="guru-change-groups">{changeGroups.map(([title, rows]) => <section className="guru-panel" key={title}><h2>{title}</h2>{rows.length === 0 ? <p className="guru-muted">{copy.noMoves}</p> : <div className="guru-change-list">{rows.map(row => <article key={`${title}:${row.positionKey}`}>
      <div><strong>{row.ticker ?? row.company}</strong><span>{row.company}</span></div><span className={`guru-action-pill is-${row.action.toLowerCase()}`}>{row.action.replace('_', ' ')}</span>
      <div><small>{copy.previous}</small><strong>{formatExactDecimal(row.previousQuantity, locale)}</strong><small>{copy.current}</small><strong>{formatExactDecimal(row.quantity, locale)}</strong></div>
      <div><small>{copy.sharesChange}</small><strong>{formatSignedDecimal(row.quantityChange, locale)} ({formatSignedPercent(row.quantityChangePercent, locale)})</strong></div>
      <div><small>{copy.previousWeight}</small><strong>{percent(row.previousWeightPercent, locale)}</strong><small>{copy.currentWeight}</small><strong>{percent(row.weightPercent, locale)}</strong></div>
      <div><small>{copy.previousRank}</small><strong>{row.previousRank ?? '—'}</strong><small>{copy.currentRank}</small><strong>{row.rank ?? '—'}</strong></div>
      {row.sources.map(source => <a key={source.accession} href={source.sourceUrl} target="_blank" rel="noreferrer">{source.accession}</a>)}
    </article>)}</div>}</section>)}</div>}

    {mode === 'history' && <>
      {!historyData!.periods.length ? <p className="guru-muted">{copy.noPeriods}</p> : <div className="guru-research-table-scroll"><table className="guru-research-table guru-history-table"><thead><tr><th>{copy.period}</th><th>{copy.status}</th><th>{copy.reportedValue}</th><th>{copy.positions}</th><th>{copy.topFive}</th><th>{copy.topTen}</th><th>{copy.hhi}</th><th>{copy.turnover}</th><th>{copy.coverage}</th><th>{copy.sectorAllocation}</th><th>{copy.source}</th></tr></thead><tbody>{historyData!.periods.map(row => <tr key={row.periodEnd}><th scope="row"><Link to={`/gurus/${slug}/portfolio?period=${row.periodEnd}`}>{row.periodEnd}</Link></th><td>{copy.statusLabel(row.status)}</td><td>{compactUsd(row.reportedValueUsd, locale)}</td><td>{row.holdingCount ?? '—'}</td><td>{percent(row.topFiveConcentrationPercent, locale)}</td><td>{percent(row.topTenConcentrationPercent, locale)}</td><td>{formatExactDecimal(row.hhi, locale)}</td><td>{percent(row.turnoverPercent, locale)}</td><td>{percent(row.mappingCoveragePercent, locale)}</td><td>{row.sectorAllocation.map(item => `${item.name} ${percent(item.weightPercent, locale)}`).join(' · ') || '—'}</td><td>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.accession}</a> : '—'}</td></tr>)}</tbody></table></div>}
      <div className="guru-history-cards">{historyData!.periods.map(row => <article key={row.periodEnd}><header><Link to={`/gurus/${slug}/portfolio?period=${row.periodEnd}`}>{row.periodEnd}</Link><span>{copy.statusLabel(row.status)}</span></header><dl><div><dt>{copy.reportedValue}</dt><dd>{compactUsd(row.reportedValueUsd, locale)}</dd></div><div><dt>{copy.positions}</dt><dd>{row.holdingCount ?? '—'}</dd></div><div><dt>{copy.topFive}</dt><dd>{percent(row.topFiveConcentrationPercent, locale)}</dd></div><div><dt>{copy.topTen}</dt><dd>{percent(row.topTenConcentrationPercent, locale)}</dd></div><div><dt>{copy.turnover}</dt><dd>{percent(row.turnoverPercent, locale)}</dd></div><div><dt>{copy.coverage}</dt><dd>{percent(row.mappingCoveragePercent, locale)}</dd></div></dl>{row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.accession}</a>}</article>)}</div>
    </>}

    {mode === 'filings' && <div className="guru-filing-list">{filingsData!.filings.length === 0 ? <p className="guru-muted">{copy.noFilings}</p> : filingsData!.filings.map(filing => <article key={filing.accession}>
      <header><div><p className="guru-eyebrow">{filing.periodEnd ?? '—'} · {filing.form}</p><h2>{filing.accession}</h2></div><span className={`guru-quality is-${filing.status.toLowerCase()}`}>{copy.statusLabel(filing.status)}</span></header>
      <dl><div><dt>{copy.filed}</dt><dd>{filing.filedAt ? new Date(filing.filedAt).toLocaleDateString(locale) : filing.filingDate}</dd></div><div><dt>{copy.coverage}</dt><dd>{percent(filing.mappingCoveragePercent, locale)}</dd></div><div><dt>{copy.parser}</dt><dd>{filing.parserVersion ?? '—'}</dd></div><div><dt>{copy.amendment}</dt><dd>{filing.amendmentType ?? filing.amendmentNumber ?? '—'}</dd></div></dl>
      <a href={filing.sourceUrl} target="_blank" rel="noreferrer">{copy.source} ↗</a>
      {filing.effectiveOperations.length > 0 && <p>{filing.effectiveOperations.map(item => `${item.operation} · ${item.parserVersion}`).join(' | ')}</p>}
      {filing.documents.length > 0 && <details><summary>{copy.documents}</summary><ul>{filing.documents.map(document => <li key={document.basename}><a href={document.sourceUrl} target="_blank" rel="noreferrer">{document.basename}</a>{document.description ? ` · ${document.description}` : ''}</li>)}</ul></details>}
    </article>)}</div>}
  </section>
}
