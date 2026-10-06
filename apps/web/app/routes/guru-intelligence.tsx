import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import {
  guruConsensusQuerySchema,
  guruConsensusResponseSchema,
  guruSectorsQuerySchema,
  guruSectorsResponseSchema,
  guruStocksQuerySchema,
  guruStocksResponseSchema,
  type GuruConsensusQuery,
  type GuruSectorsQuery,
  type GuruStocksQuery,
} from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { formatSignedDecimal, formatSignedPercent, number, percent } from '../guru-format'
import { api, useUi } from '../ui'
import { guruCopy } from './gurus-copy'
import { guruIntelligenceCopy } from '../guru-intelligence-copy'
import './guru-intelligence.css'

type ConsensusData = ReturnType<typeof guruConsensusResponseSchema.parse>['data']
type StocksData = ReturnType<typeof guruStocksResponseSchema.parse>['data']
type SectorsData = ReturnType<typeof guruSectorsResponseSchema.parse>['data']
type Mode = 'consensus' | 'stocks' | 'sectors'

function getMode(pathname: string): Mode {
  if (pathname.endsWith('/sectors')) return 'sectors'
  if (pathname.endsWith('/stocks')) return 'stocks'
  return 'consensus'
}

export default function GuruIntelligencePage() {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { locale } = useUi()
  const text = guruIntelligenceCopy(locale)
  const copy = guruCopy[locale]
  const mode = getMode(pathname)
  const period = searchParams.get('period') ?? ''
  const [consensusData, setConsensusData] = useState<ConsensusData | null>(null)
  const [stocksData, setStocksData] = useState<StocksData | null>(null)
  const [sectorsData, setSectorsData] = useState<SectorsData | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [sectorFilter, setSectorFilter] = useState('')
  const [classification, setClassification] = useState<GuruConsensusQuery['classification'] | ''>('')
  const [consensusSort, setConsensusSort] = useState<GuruConsensusQuery['sort']>('net-buyers')
  const [ranking, setRanking] = useState<GuruStocksQuery['ranking']>('most-held')
  const [dimension, setDimension] = useState<GuruSectorsQuery['dimension']>('SECTOR')
  const [direction, setDirection] = useState<GuruSectorsQuery['direction'] | ''>('')
  const [sectorSort, setSectorSort] = useState<GuruSectorsQuery['sort']>('direction')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const controller = new AbortController()
    setFailure(null)
    setPending(true)
    if (mode === 'consensus') {
      setConsensusData(null)
      const query = guruConsensusQuerySchema.parse({
        ...(period ? { period } : {}), ...(search ? { search } : {}), ...(sectorFilter ? { sector: sectorFilter } : {}),
        ...(classification ? { classification } : {}), sort: consensusSort, page, limit: 25,
      })
      void api.GET('/api/gurus/consensus', { params: { query }, signal: controller.signal }).then(response => {
        const parsed = guruConsensusResponseSchema.safeParse(response.data)
        if (controller.signal.aborted) return
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, text.failed))
        else setConsensusData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, text.failed)) }).finally(() => { if (!controller.signal.aborted) setPending(false) })
    } else if (mode === 'stocks') {
      setStocksData(null)
      const query = guruStocksQuerySchema.parse({
        ...(period ? { period } : {}), ...(search ? { search } : {}), ...(sectorFilter ? { sector: sectorFilter } : {}),
        ranking, page, limit: 25,
      })
      void api.GET('/api/gurus/stocks', { params: { query }, signal: controller.signal }).then(response => {
        const parsed = guruStocksResponseSchema.safeParse(response.data)
        if (controller.signal.aborted) return
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, text.failed))
        else setStocksData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, text.failed)) }).finally(() => { if (!controller.signal.aborted) setPending(false) })
    } else {
      setSectorsData(null)
      const query = guruSectorsQuerySchema.parse({
        ...(period ? { period } : {}), ...(search ? { search } : {}), ...(direction ? { direction } : {}),
        dimension, sort: sectorSort, page, limit: 50,
      })
      void api.GET('/api/gurus/sectors', { params: { query }, signal: controller.signal }).then(response => {
        const parsed = guruSectorsResponseSchema.safeParse(response.data)
        if (controller.signal.aborted) return
        if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, text.failed))
        else setSectorsData(parsed.data.data)
      }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, text.failed)) }).finally(() => { if (!controller.signal.aborted) setPending(false) })
    }
    return () => controller.abort()
  }, [attempt, classification, consensusSort, dimension, direction, mode, page, period, ranking, search, sectorFilter, sectorSort, text.failed])

  const selected = consensusData?.period ?? stocksData?.period ?? sectorsData?.period
  const periods = consensusData?.periods ?? stocksData?.periods ?? sectorsData?.periods ?? []
  const pagination = consensusData?.pagination ?? stocksData?.pagination ?? sectorsData?.pagination
  const title = mode === 'consensus' ? text.consensusTitle : mode === 'stocks' ? text.stocksTitle : text.sectorsTitle
  const intro = mode === 'consensus' ? text.consensusIntro : mode === 'stocks' ? text.stocksIntro : text.sectorsIntro

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(draftSearch.trim())
    setPage(1)
  }

  function updatePeriod(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('period', value)
    else next.delete('period')
    setSearchParams(next)
    setPage(1)
  }

  const exportQuery = new URLSearchParams()
  if (selected?.periodEnd) exportQuery.set('period', selected.periodEnd)
  if (search) exportQuery.set('search', search)
  if (sectorFilter) exportQuery.set('sector', sectorFilter)
  exportQuery.set('ranking', ranking)
  const csvHref = `/api/gurus/stocks.csv?${exportQuery.toString()}`
  const items = consensusData?.items ?? stocksData?.items ?? sectorsData?.items ?? []
  const noResults = selected && !pending && !failure && items.length === 0

  return <main className="guru-intelligence-page">
    <header className="guru-intelligence-hero">
      <div>
        <p className="guru-eyebrow">{copy.source}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <span className="guru-hero-mark" aria-hidden="true">G</span>
    </header>

    <nav className="guru-intelligence-tabs" aria-label={text.consensus}>
      <Link to="/gurus">{text.directory}</Link>
      <Link to="/gurus/consensus" aria-current={mode === 'consensus' ? 'page' : undefined}>{text.consensus}</Link>
      <Link to="/gurus/stocks" aria-current={mode === 'stocks' ? 'page' : undefined}>{text.stocks}</Link>
      <Link to="/gurus/sectors" aria-current={mode === 'sectors' ? 'page' : undefined}>{text.sectors}</Link>
      <Link to="/gurus/compare">{text.compare}</Link>
    </nav>

    <p className="guru-disclosure" role="note">{text.warning}</p>

    <section className="guru-intelligence-controls" aria-label={title}>
      <div className="guru-intelligence-toolbar">
        <label>{text.quarter}<select aria-label={text.quarter} value={period || selected?.periodEnd || ''} onChange={event => updatePeriod(event.target.value)}>
          {periods.map(option => <option key={option.periodEnd} value={option.periodEnd}>{option.periodEnd} · {number(option.readyManagerCount, locale)} / {number(option.activeManagerCount, locale)}</option>)}
        </select></label>
        <span className="guru-intelligence-source">{text.source}: {selected?.source ?? 'SEC Form 13F'} · {text.reportedPeriod}: {selected?.periodEnd ?? '—'}</span>
        {mode === 'stocks' && <a className="secondary guru-intelligence-export" href={csvHref}>{text.export}</a>}
      </div>

      {selected && <div className="guru-intelligence-coverage" aria-label={text.quarterCoverage}>
        <div><span>{text.active}</span><strong>{number(selected.activeManagerCount, locale)}</strong></div>
        <div><span>{text.ready}</span><strong>{number(selected.readyManagerCount, locale)} / {number(selected.activeManagerCount, locale)}</strong></div>
        <div><span>{text.quarterCoverage}</span><strong>{percent(selected.quarterCoveragePercent, locale)}</strong></div>
        <div><span>{text.mappingCoverage}</span><strong>{percent(selected.mappingCoveragePercent, locale)}</strong></div>
        <div><span>{text.comparable}</span><strong>{number(selected.comparableManagerCount, locale)}</strong></div>
        <div className="guru-intelligence-quality"><span>{text.partial} · {text.errors} · {text.pending} · {text.noFiling}</span><strong>{number(selected.partialManagerCount, locale)} · {number(selected.errorManagerCount + selected.supersededManagerCount, locale)} · {number(selected.pendingManagerCount, locale)} · {number(selected.noFilingManagerCount, locale)}</strong></div>
      </div>}

      <form className="guru-intelligence-filters" onSubmit={submitSearch}>
        <label>{text.search}<span><input value={draftSearch} onChange={event => setDraftSearch(event.target.value)} /><button className="secondary" type="submit">{copy.searchAction}</button></span></label>
        {mode !== 'sectors' && <label>{text.sector}<input value={sectorFilter} onChange={event => { setSectorFilter(event.target.value); setPage(1) }} placeholder={text.all} /></label>}
        {mode === 'consensus' && <>
          <label>{text.classification}<select value={classification} onChange={event => { setClassification(event.target.value as GuruConsensusQuery['classification'] | ''); setPage(1) }}>
            <option value="">{text.all}</option><option value="ACCUMULATION">{text.accumulation}</option><option value="NEUTRAL">{text.neutral}</option><option value="DISTRIBUTION">{text.distribution}</option>
          </select></label>
          <label>{text.sort}<select value={consensusSort} onChange={event => { setConsensusSort(event.target.value as GuruConsensusQuery['sort']); setPage(1) }}>
            <option value="net-buyers">{text.netBuyers}</option><option value="most-held">{text.mostHeld}</option><option value="most-added">{text.mostAdded}</option><option value="most-reduced">{text.mostReduced}</option><option value="largest-weight">{text.largestWeight}</option><option value="rising">{text.fastestRising}</option><option value="falling">{text.fastestFalling}</option>
          </select></label>
        </>}
        {mode === 'stocks' && <label>{text.ranking}<select value={ranking} onChange={event => { setRanking(event.target.value as GuruStocksQuery['ranking']); setPage(1) }}>
          <option value="most-held">{text.mostHeld}</option><option value="most-added">{text.mostAdded}</option><option value="most-reduced">{text.mostReduced}</option><option value="most-new">{text.mostNew}</option><option value="most-exited">{text.mostExited}</option><option value="largest-weight">{text.largestWeight}</option><option value="fastest-rising">{text.fastestRising}</option><option value="fastest-falling">{text.fastestFalling}</option>
        </select></label>}
        {mode === 'sectors' && <>
          <label>{text.dimension}<select value={dimension} onChange={event => { setDimension(event.target.value as GuruSectorsQuery['dimension']); setPage(1) }}>
            <option value="SECTOR">{text.sector}</option><option value="INDUSTRY">{text.industry}</option><option value="THEME">{text.theme}</option>
          </select></label>
          <label>{text.direction}<select value={direction} onChange={event => { setDirection(event.target.value as GuruSectorsQuery['direction'] | ''); setPage(1) }}>
            <option value="">{text.all}</option><option value="INCREASING">{text.rising}</option><option value="STABLE">{text.stable}</option><option value="REDUCING">{text.falling}</option>
          </select></label>
          <label>{text.sortDirection}<select value={sectorSort} onChange={event => { setSectorSort(event.target.value as GuruSectorsQuery['sort']); setPage(1) }}>
            <option value="direction">{text.direction}</option><option value="buyers">{text.buyers}</option><option value="weight-change">{text.weightChange}</option><option value="aggregate-weight">{text.aggregateWeight}</option><option value="holders">{text.holders}</option>
          </select></label>
        </>}
      </form>
    </section>

    {failure && <div className="guru-intelligence-failure"><FailureNotice failure={failure} id="guru-intelligence-error" messageOverride={text.failed} /><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{text.retry}</button></div>}
    {pending && !selected && <p role="status" className="guru-loading">{text.loading}</p>}
    {noResults && <p className="guru-intelligence-empty">{search || sectorFilter || classification || direction ? text.noMatches : text.empty}</p>}
    {selected && items.length > 0 && <>
      <div className="guru-intelligence-results-heading"><p>{mode === 'stocks' ? text[ranking === 'most-held' ? 'mostHeld' : ranking === 'most-added' ? 'mostAdded' : ranking === 'most-reduced' ? 'mostReduced' : ranking === 'most-new' ? 'mostNew' : ranking === 'most-exited' ? 'mostExited' : ranking === 'largest-weight' ? 'largestWeight' : ranking === 'fastest-rising' ? 'fastestRising' : 'fastestFalling'] : title}</p><span>{text.resultCount(pagination?.total ?? 0)}</span></div>
      {mode === 'sectors' ? <SectorTable rows={sectorsData?.items ?? []} locale={locale} text={text} />
        : <StockTable rows={consensusData?.items ?? stocksData?.items ?? []} readyManagerCount={selected.readyManagerCount} locale={locale} text={text} />}
      {pagination && pagination.totalPages > 1 && <nav className="guru-intelligence-pagination" aria-label={title}>
        <button type="button" className="secondary" disabled={page <= 1 || pending} onClick={() => setPage(value => value - 1)}>{text.previous}</button>
        <span>{text.page(page, pagination.totalPages)}</span>
        <button type="button" className="secondary" disabled={page >= pagination.totalPages || pending} onClick={() => setPage(value => value + 1)}>{text.next}</button>
      </nav>}
    </>}
  </main>
}

function StockTable({ rows, readyManagerCount, locale, text }: { rows: NonNullable<ConsensusData | StocksData>['items']; readyManagerCount: number; locale: 'en' | 'zh-TW' | 'zh-CN'; text: ReturnType<typeof guruIntelligenceCopy> }) {
  return <>
    <div className="guru-intelligence-table-wrap"><table className="guru-intelligence-table">
      <thead><tr><th>{text.stock}</th><th>{text.company}</th><th>{text.heldBy}</th><th>{text.new}</th><th>{text.add}</th><th>{text.reduce}</th><th>{text.exit}</th><th>{text.net}</th><th>{text.averageChange}</th><th>{text.averageWeight}</th><th>{text.trend}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.securityId}>
        <th scope="row">{row.ticker ?? '—'}</th><td>{row.company}</td>
        <td>{number(row.currentHolderCount, locale)} / {number(readyManagerCount, locale)} <span className="guru-intelligence-muted">({percent(row.weightBreadthPercent, locale)})</span></td>
        <td>{number(row.newBuyerCount, locale)}</td><td>{number(row.addCount, locale)}</td><td>{number(row.reduceCount, locale)}</td><td>{number(row.exitCount, locale)}</td>
        <td><span className={`guru-net-buyer ${row.netBuyerCount > 0 ? 'is-buying' : row.netBuyerCount < 0 ? 'is-selling' : ''}`}>{formatSignedDecimal(String(row.netBuyerCount), locale)}</span></td>
        <td>{formatSignedPercent(row.averageQuantityChangePercent, locale)}</td><td>{percent(row.averagePortfolioWeightPercent, locale)}</td>
        <td><span className={`guru-trend-pill is-${row.quarterTrend.toLowerCase()}`}>{trendLabel(row.quarterTrend, text)}</span></td>
      </tr>)}</tbody>
    </table></div>
    <div className="guru-intelligence-cards">{rows.map(row => <article className="guru-intelligence-card" key={row.securityId}>
      <header><div><strong>{row.ticker ?? row.company}</strong><span>{row.ticker ? row.company : row.sector ?? '—'}</span></div><span className={`guru-net-buyer ${row.netBuyerCount > 0 ? 'is-buying' : row.netBuyerCount < 0 ? 'is-selling' : ''}`}>{formatSignedDecimal(String(row.netBuyerCount), locale)}</span></header>
      <dl><div><dt>{text.heldBy}</dt><dd>{number(row.currentHolderCount, locale)} <small>({percent(row.weightBreadthPercent, locale)})</small></dd></div><div><dt>{text.new} · {text.add}</dt><dd>{number(row.newBuyerCount, locale)} · {number(row.addCount, locale)}</dd></div><div><dt>{text.reduce} · {text.exit}</dt><dd>{number(row.reduceCount, locale)} · {number(row.exitCount, locale)}</dd></div><div><dt>{text.averageChange}</dt><dd>{formatSignedPercent(row.averageQuantityChangePercent, locale)}</dd></div><div><dt>{text.averageWeight}</dt><dd>{percent(row.averagePortfolioWeightPercent, locale)}</dd></div><div><dt>{text.trend}</dt><dd>{trendLabel(row.quarterTrend, text)}</dd></div></dl>
      <p className="guru-intelligence-card-classification">{row.classification ? classificationLabel(row.classification, text) : text.noClassification}</p>
    </article>)}</div>
  </>
}

function SectorTable({ rows, locale, text }: { rows: SectorsData['items']; locale: 'en' | 'zh-TW' | 'zh-CN'; text: ReturnType<typeof guruIntelligenceCopy> }) {
  return <>
    <div className="guru-intelligence-table-wrap"><table className="guru-intelligence-table">
      <thead><tr><th>{text.group}</th><th>{text.direction}</th><th>{text.heldBy}</th><th>{text.buyers}</th><th>{text.sellers}</th><th>{text.actionCounts}</th><th>{text.allocatedWeight}</th><th>{text.comparableChange}</th><th>{text.allocationCoverage}</th></tr></thead>
      <tbody>{rows.map(row => <tr key={`${row.dimension}:${row.dimensionKey}`}>
        <th scope="row">{row.name}</th><td>{row.direction ? <span className={`guru-trend-pill is-${row.direction.toLowerCase()}`}>{directionLabel(row.direction, text)}</span> : text.noClassification}</td>
        <td>{number(row.currentHolderCount, locale)} <span className="guru-intelligence-muted">({percent(row.holderBreadthPercent, locale)})</span></td>
        <td>{number(row.buyerCount, locale)}</td><td>{number(row.sellerCount, locale)}</td>
        <td>{number(row.newPositionCount, locale)} · {number(row.addCount, locale)} · {number(row.reduceCount, locale)} · {number(row.exitCount, locale)}</td>
        <td>{percent(row.aggregateWeightPercent, locale)}</td><td>{formatSignedPercent(row.aggregateWeightChangePoints, locale)}</td><td>{percent(row.allocationCoveragePercent, locale)} · {number(row.allocationManagerCount, locale)}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="guru-intelligence-cards">{rows.map(row => <article className="guru-intelligence-card" key={`${row.dimension}:${row.dimensionKey}`}>
      <header><div><strong>{row.name}</strong><span>{row.dimension}</span></div>{row.direction ? <span className={`guru-trend-pill is-${row.direction.toLowerCase()}`}>{directionLabel(row.direction, text)}</span> : <span>{text.noClassification}</span>}</header>
      <dl><div><dt>{text.heldBy}</dt><dd>{number(row.currentHolderCount, locale)} <small>({percent(row.holderBreadthPercent, locale)})</small></dd></div><div><dt>{text.buyers} · {text.sellers}</dt><dd>{number(row.buyerCount, locale)} · {number(row.sellerCount, locale)}</dd></div><div><dt>{text.actionCounts}</dt><dd>{number(row.newPositionCount, locale)} · {number(row.addCount, locale)} · {number(row.reduceCount, locale)} · {number(row.exitCount, locale)}</dd></div><div><dt>{text.allocatedWeight}</dt><dd>{percent(row.aggregateWeightPercent, locale)}</dd></div><div><dt>{text.comparableChange}</dt><dd>{formatSignedPercent(row.aggregateWeightChangePoints, locale)}</dd></div><div><dt>{text.allocationCoverage}</dt><dd>{percent(row.allocationCoveragePercent, locale)} · {number(row.allocationManagerCount, locale)}</dd></div></dl>
    </article>)}</div>
  </>
}

function classificationLabel(value: 'ACCUMULATION' | 'NEUTRAL' | 'DISTRIBUTION', text: ReturnType<typeof guruIntelligenceCopy>) {
  if (value === 'ACCUMULATION') return text.accumulation
  if (value === 'DISTRIBUTION') return text.distribution
  return text.neutral
}

function trendLabel(value: string, text: ReturnType<typeof guruIntelligenceCopy>) {
  if (value === 'RISING') return text.rising
  if (value === 'FALLING') return text.falling
  if (value === 'STABLE') return text.stable
  return text.unavailable
}

function directionLabel(value: 'INCREASING' | 'STABLE' | 'REDUCING', text: ReturnType<typeof guruIntelligenceCopy>) {
  if (value === 'INCREASING') return text.rising
  if (value === 'REDUCING') return text.falling
  return text.stable
}
