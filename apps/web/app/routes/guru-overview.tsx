import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { guruOverviewResponseSchema } from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { GuruFollowButton } from '../guru-follow'
import { compactUsd, number, percent, shortDate } from '../guru-format'
import { api, useUi } from '../ui'
import { guruCopy, type GuruCopy } from './gurus-copy'
import './gurus.css'

type GuruOverview = ReturnType<typeof guruOverviewResponseSchema.parse>['data']

export default function GuruOverviewPage() {
  const { slug = '' } = useParams()
  const { locale } = useUi()
  const c: GuruCopy = guruCopy[locale]
  const [data, setData] = useState<GuruOverview | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setFailure(null)
    void api.GET('/api/gurus/{slug}', { params: { path: { slug } }, signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return
      const parsed = guruOverviewResponseSchema.safeParse(response.data)
      if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, c.failed))
      else setData(parsed.data.data)
    }).catch(error => {
      if (!controller.signal.aborted) setFailure(apiFailure(error, c.failed))
    })
    return () => controller.abort()
  }, [slug, attempt, c.failed])

  function updateFollow(following: boolean, followerCount: number) {
    setData(current => current ? { ...current, followedByMe: following, followerCount } : current)
  }

  if (failure) return <section className="guru-overview-page" data-testid="guru-overview">
    <Link className="guru-back-link" to="/gurus">← {c.back}</Link>
    <FailureNotice failure={failure} id="guru-overview-error" messageOverride={c.failed} />
    <button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button>
  </section>
  if (!data) return <section className="guru-overview-page" data-testid="guru-overview"><p role="status" className="guru-loading">{c.loading}</p></section>

  const { profile: person, latest, source } = data
  const chartItems = [...data.history].reverse()
  const chartMaximum = Math.max(1, ...chartItems.map(item => Number(item.reportedValueUsd ?? 0)))
  const latestStatusReady = latest.status === 'READY'
  return <section className="guru-overview-page" data-testid="guru-overview">
    <Link className="guru-back-link" to="/gurus">← {c.back}</Link>
    <p className="guru-disclosure" role="note">{c.warning}</p>
    {latest.status !== 'READY' && <p className="guru-stale-note" role="status">{c.stale}</p>}

    <header className="guru-profile-hero">
      <div className="guru-avatar guru-profile-avatar" aria-hidden="true">{person.name.trim().slice(0, 1).toLocaleUpperCase()}</div>
      <div className="guru-profile-heading">
        <div className="guru-card-kickers">{person.featured && <span className="guru-featured-pill">{c.featuredLabel}</span>}<span>{person.styleTags.join(' · ') || person.managerType || c.source}</span></div>
        <h1>{person.name}</h1><p className="guru-manager-name">{person.managerName}</p>
        <div className="guru-profile-meta"><span>{c.cik}: <code>{data.cik}</code></span><span>{c.latestReported}: <strong>{latest.periodEnd ?? '—'}</strong></span><span className={`guru-quality is-${latest.status.toLowerCase()}`}>{c.statusLabel(latest.status)}</span></div>
      </div>
      <GuruFollowButton slug={person.slug} followerCount={data.followerCount} followed={data.followedByMe} onChange={updateFollow} />
    </header>

    <nav className="guru-tabs" aria-label={c.overview}>
      <Link aria-current="page" to={`/gurus/${person.slug}`}>{c.overview}</Link>
      <Link to={`/gurus/${person.slug}/portfolio`}>{c.portfolio}</Link>
      <Link to={`/gurus/${person.slug}/changes`}>{c.changes}</Link>
      <Link to={`/gurus/${person.slug}/history`}>{c.history}</Link>
      <Link to={`/gurus/${person.slug}/analysis`}>{c.analysis}</Link>
      <Link to={`/gurus/${person.slug}/filings`}>{c.filings}</Link>
    </nav>

    <section className="guru-overview-grid">
      <div className="guru-main-column">
        <section className="guru-panel" aria-labelledby="guru-metrics-title">
          <div className="guru-section-heading"><div><p className="guru-eyebrow">{c.latestReported}</p><h2 id="guru-metrics-title">{c.metrics}</h2></div><span className={`guru-quality is-${latest.status.toLowerCase()}`}>{c.statusLabel(latest.status)}</span></div>
          {latestStatusReady ? <div className="guru-metric-grid">
            <Metric label={c.reportedValue} value={compactUsd(latest.reportedValueUsd, locale)} />
            <Metric label={c.holdings} value={number(latest.holdingCount, locale)} />
            <Metric label={c.topFive} value={percent(latest.topFiveConcentrationPercent, locale)} />
            <Metric label={c.topTen} value={percent(latest.topTenConcentrationPercent, locale)} />
            <Metric label={c.turnoverLabel} value={percent(latest.turnoverPercent, locale)} />
            <Metric label={c.hhi} value={latest.hhi ? number(Number(latest.hhi), locale) : '—'} />
          </div> : <p className="guru-muted">{c.noData}</p>}
          <div className="guru-action-summary" aria-label={c.actions}>
            <ActionCount label={c.new} count={latest.actionCounts.new} kind="new" />
            <ActionCount label={c.add} count={latest.actionCounts.add} kind="add" />
            <ActionCount label={c.reduce} count={latest.actionCounts.reduce} kind="reduce" />
            <ActionCount label={c.exit} count={latest.actionCounts.exit} kind="exit" />
          </div>
        </section>

        <section className="guru-panel" aria-labelledby="guru-top-holdings-title">
          <div className="guru-section-heading"><div><p className="guru-eyebrow">{latest.periodEnd ?? '—'}</p><h2 id="guru-top-holdings-title">{c.topHoldings}</h2></div><Link className="guru-inline-link" to={`/gurus/${person.slug}/portfolio`}>{c.portfolio} ↗</Link></div>
          {latest.topHoldings.length === 0 ? <p className="guru-muted">{c.noHoldings}</p> : <div className="guru-holding-cards">{latest.topHoldings.map(position => <article key={position.positionKey} className="guru-holding-card">
            <div className="guru-holding-rank">{String(position.rank).padStart(2, '0')}</div>
            <div className="guru-holding-name"><strong>{position.ticker ? <Link to={`/stocks/${encodeURIComponent(position.ticker)}`}>{position.ticker}</Link> : position.company}</strong><span>{position.ticker ? position.company : position.quantityType}{position.putCall ? ` · ${position.putCall}` : ''}</span></div>
            <div className="guru-holding-weight"><strong>{percent(position.weightPercent, locale)}</strong><span>{compactUsd(position.reportedValueUsd, locale)}</span></div>
          </article>)}</div>}
        </section>

        <section className="guru-panel" aria-labelledby="guru-moves-title">
          <div className="guru-section-heading"><div><p className="guru-eyebrow">{latest.periodEnd ?? '—'}</p><h2 id="guru-moves-title">{c.latestMoves}</h2></div><Link className="guru-inline-link" to={`/gurus/${person.slug}/changes`}>{c.changes} ↗</Link></div>
          {data.latestMoves.length === 0 ? <p className="guru-muted">{c.noMoves}</p> : <div className="guru-move-list">{data.latestMoves.map(move => <article className="guru-move-row" key={move.positionKey}>
            <div><strong>{move.ticker ?? move.company}</strong><span>{move.company}</span></div>
            <span className={`guru-action-pill is-${move.action.toLowerCase()}`}>{move.action.replace('_', ' ')}</span>
            <div className="guru-move-detail"><span>{c.shares} {move.previousQuantity ?? '—'} → {move.currentQuantity ?? '—'}</span><strong>{percent(move.quantityChangePercent, locale)}</strong></div>
            <div className="guru-move-detail"><span>{c.weight}</span><strong>{percent(move.currentWeightPercent, locale)}</strong></div>
          </article>)}</div>}
        </section>
      </div>

      <aside className="guru-side-column">
        <section className="guru-panel" aria-labelledby="guru-editorial-title">
          <p className="guru-eyebrow">{c.focus}</p><h2 id="guru-editorial-title">{c.about}</h2>
          {person.description && <p className="guru-editorial-copy">{person.description}</p>}
          {person.investmentPhilosophy && <div className="guru-philosophy"><h3>{c.philosophy}</h3><p>{person.investmentPhilosophy}</p></div>}
          {!person.description && !person.investmentPhilosophy && <p className="guru-muted">{person.styleTags.join(' · ') || person.managerType || '—'}</p>}
          {person.website && <a className="guru-inline-link" href={person.website} target="_blank" rel="noreferrer">{person.website.replace(/^https?:\/\//, '')} ↗</a>}
        </section>

        <section className="guru-panel" aria-labelledby="guru-sector-title">
          <div className="guru-section-heading"><div><p className="guru-eyebrow">{latest.periodEnd ?? '—'}</p><h2 id="guru-sector-title">{c.sectorAllocation}</h2></div></div>
          {latest.sectorAllocation.length === 0 ? <p className="guru-muted">{c.noSector}</p> : <div className="guru-sector-list">{latest.sectorAllocation.slice(0, 7).map(sector => <div className="guru-sector-row" key={sector.name}>
            <div><span>{sector.name}</span><strong>{percent(sector.weightPercent, locale)}</strong></div><div className="guru-sector-track"><span style={{ width: `${Math.max(0, Math.min(100, Number(sector.weightPercent)))}%` }} /></div>
          </div>)}</div>}
        </section>

        <section className="guru-panel guru-history-panel" aria-labelledby="guru-history-title">
          <div className="guru-section-heading"><div><p className="guru-eyebrow">{c.valueHistory}</p><h2 id="guru-history-title">{c.historicalDirection}</h2></div><Link className="guru-inline-link" to={`/gurus/${person.slug}/history`}>{c.history} ↗</Link></div>
          {chartItems.length < 2 ? <p className="guru-muted">{c.noHistory}</p> : <div className="guru-history-chart" role="img" aria-label={c.valueHistory}>{chartItems.map(item => {
            const height = Math.max(5, Number(item.reportedValueUsd ?? 0) / chartMaximum * 100)
            return <div className="guru-history-column" key={item.periodEnd} title={`${item.periodEnd}: ${compactUsd(item.reportedValueUsd, locale)}`}><div className="guru-history-bar" style={{ height: `${height}%` }} /><span>{item.periodEnd?.slice(0, 7)}</span></div>
          })}</div>}
          <dl className="guru-history-latest"><div><dt>{c.positionHistory}</dt><dd>{number(latest.holdingCount, locale)}</dd></div><div><dt>{c.topFive}</dt><dd>{percent(latest.topFiveConcentrationPercent, locale)}</dd></div></dl>
        </section>

        <section className="guru-panel guru-ai-panel" aria-labelledby="guru-ai-title">
          <p className="guru-eyebrow">Diary-v3 research</p><h2 id="guru-ai-title">{c.aiSummary}</h2>
          <p>{data.aiSummaryState === 'NOT_GENERATED' ? c.aiNotGenerated : data.aiSummaryState === 'PENDING' ? c.aiPending : data.aiSummaryState === 'ERROR' ? c.aiFailed : c.noData}</p>
          <Link className="guru-inline-link" to={`/gurus/${person.slug}/analysis`}>{c.analysis} ↗</Link>
        </section>
      </aside>
    </section>

    <section className="guru-source-line" aria-label={c.filingSource}>
      <div><strong>{c.filingSource}</strong><span>{c.latestReported}: {source.periodEnd ?? '—'}{source.filedAt ? ` · ${c.filed} ${shortDate(source.filedAt, locale)}` : ''}</span></div>
      <Link to={`/gurus/${person.slug}/filings`}>{c.readFiling} ↗</Link>
      {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">SEC EDGAR ↗</a>}
    </section>
  </section>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="guru-metric"><dt>{label}</dt><dd>{value}</dd></div>
}

function ActionCount({ label, count, kind }: { label: string; count: number; kind: string }) {
  return <div className={`guru-action-count is-${kind}`}><span>{label}</span><strong>{count}</strong></div>
}
