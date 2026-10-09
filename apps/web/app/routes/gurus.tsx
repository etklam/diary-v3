import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { guruDirectoryResponseSchema, type GuruDirectoryItem, type GuruDirectoryQuery } from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { GuruFollowButton } from '../guru-follow'
import { compactUsd, number, percent, shortDate } from '../guru-format'
import { api, useUi } from '../ui'
import { publicPageMeta } from '../route-meta'
import { guruCopy, type GuruCopy } from './gurus-copy'
import './gurus.css'

export const meta = publicPageMeta('/gurus')

const pagerCopy = {
  en: { page: 'Page', previous: 'Previous', next: 'Next' },
  'zh-TW': { page: '頁', previous: '上一頁', next: '下一頁' },
  'zh-CN': { page: '页', previous: '上一页', next: '下一页' },
} as const

const initialFilters = { search: '', style: '', managerType: '', sector: '', featured: false, sort: 'custom' as GuruDirectoryQuery['sort'], page: 1 }

export default function GurusDirectory() {
  const { locale } = useUi()
  const c: GuruCopy = guruCopy[locale]
  const pagination = pagerCopy[locale]
  const [draftSearch, setDraftSearch] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [result, setResult] = useState<ReturnType<typeof guruDirectoryResponseSchema.parse> | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setPending(true)
    setFailure(null)
    void api.GET('/api/gurus', { params: { query: {
      page: filters.page, limit: 12, search: filters.search || undefined,
      style: filters.style || undefined, managerType: filters.managerType || undefined,
      sector: filters.sector || undefined, featured: filters.featured ? 'true' : undefined, sort: filters.sort,
    } }, signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return
      const parsed = guruDirectoryResponseSchema.safeParse(response.data)
      if (!response.response.ok || !parsed.success) setFailure(apiFailure(response.error, c.failed))
      else setResult(parsed.data)
    }).catch(error => {
      if (!controller.signal.aborted) setFailure(apiFailure(error, c.failed))
    }).finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [filters, attempt, c.failed])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters(current => ({ ...current, search: draftSearch.trim(), page: 1 }))
  }

  function updateFilter(key: 'style' | 'managerType' | 'sector' | 'sort', value: string) {
    setFilters(current => ({ ...current, [key]: value, page: 1 }))
  }

  function updateFollow(slug: string, following: boolean, followerCount: number) {
    setResult(current => current ? ({ ...current, data: current.data.map(row => row.profile.slug === slug ? { ...row, followedByMe: following, followerCount } : row) }) : current)
  }

  const empty = Boolean(result && result.data.length === 0 && !pending)
  return <section className="gurus-page" data-testid="guru-directory">
    <header className="gurus-hero">
      <div><p className="guru-eyebrow">{c.directoryKicker}</p><h1>{c.directoryTitle}</h1><p className="guru-lede">{c.directoryIntro}</p></div>
      <span className="guru-hero-mark" aria-hidden="true">G</span>
    </header>

    <p className="guru-disclosure" role="note">{c.warning}</p>

    <nav className="guru-discovery-shortcuts" aria-label={c.directoryTitle}>
      <Link to="/gurus/consensus">{c.consensus}<span aria-hidden="true">↗</span></Link>
      <Link to="/gurus/stocks">{c.mostOwned}<span aria-hidden="true">↗</span></Link>
      <Link to="/gurus/sectors">{c.sectorDirection}<span aria-hidden="true">↗</span></Link>
      <Link to="/gurus/compare">{c.compare}<span aria-hidden="true">↗</span></Link>
    </nav>

    <section className="guru-discovery" aria-label={c.directoryTitle}>
      <form className="guru-search" onSubmit={search}>
        <label htmlFor="guru-search-input">{c.search}</label>
        <div><input id="guru-search-input" value={draftSearch} maxLength={200} onChange={event => setDraftSearch(event.target.value)} /><button type="submit" className="secondary" disabled={pending}>{c.searchAction}</button></div>
      </form>
      <div className="guru-filters">
        <label>{c.style}<select value={filters.style} onChange={event => updateFilter('style', event.target.value)}><option value="">{c.all}</option>{(result?.facets.styles ?? []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>{c.managerType}<select value={filters.managerType} onChange={event => updateFilter('managerType', event.target.value)}><option value="">{c.all}</option>{(result?.facets.managerTypes ?? []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>{c.sector}<select value={filters.sector} onChange={event => updateFilter('sector', event.target.value)}><option value="">{c.all}</option>{(result?.facets.sectors ?? []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>{c.sort}<select value={filters.sort} onChange={event => updateFilter('sort', event.target.value)}>
          <option value="custom">{c.custom}</option><option value="concentration">{c.concentration}</option><option value="turnover">{c.turnover}</option><option value="activity">{c.activity}</option><option value="latest_filing">{c.latestFiling}</option><option value="followers">{c.followers}</option><option value="az">{c.az}</option>
        </select></label>
        <button type="button" className={filters.featured ? 'guru-filter-chip is-selected' : 'guru-filter-chip'} aria-pressed={filters.featured} onClick={() => setFilters(current => ({ ...current, featured: !current.featured, page: 1 }))}>{filters.featured ? c.featuredOnly : c.featured}</button>
      </div>
    </section>

    {failure && <div className="guru-load-failure"><FailureNotice failure={failure} id="guru-directory-error" messageOverride={c.failed} /><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></div>}
    {pending && !result && <p role="status" className="guru-loading">{c.loading}</p>}
    {empty && <p className="guru-empty">{filters.search || filters.style || filters.managerType || filters.sector || filters.featured ? c.noMatches : c.empty}</p>}
    {result && result.data.length > 0 && <>
      <div className="guru-results-heading"><p>{c.featured}</p><span>{c.resultCount(result.pagination.total)}</span></div>
      <div className="guru-card-grid">
        {result.data.map(entry => <GuruCard key={entry.profile.slug} entry={entry} locale={locale} copy={c} onFollowChange={(following, count) => updateFollow(entry.profile.slug, following, count)} />)}
      </div>
      {result.pagination.totalPages > 1 && <nav className="guru-pagination" aria-label={c.directoryTitle}>
        <button type="button" className="secondary" disabled={filters.page <= 1 || pending} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>{pagination.previous}</button>
        <span>{pagination.page} {filters.page} / {result.pagination.totalPages}</span>
        <button type="button" className="secondary" disabled={filters.page >= result.pagination.totalPages || pending} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>{pagination.next}</button>
      </nav>}
    </>}
  </section>
}

function GuruCard({ entry, locale, copy, onFollowChange }: {
  entry: GuruDirectoryItem
  locale: 'en' | 'zh-TW' | 'zh-CN'
  copy: GuruCopy
  onFollowChange: (following: boolean, followerCount: number) => void
}) {
  const { profile: person, latest } = entry
  const actionTotal = Object.values(latest.actionCounts).reduce((sum, value) => sum + value, 0)
  return <article className="guru-card" data-testid="guru-card">
    <div className="guru-card-head">
      <div className="guru-avatar" aria-hidden="true">{person.name.trim().slice(0, 1).toLocaleUpperCase()}</div>
      <div className="guru-card-title"><div className="guru-card-kickers">{person.featured && <span className="guru-featured-pill">{copy.featuredLabel}</span>}<span>{person.styleTags.slice(0, 2).join(' · ') || person.managerType || copy.source}</span></div>
        <h2><Link to={`/gurus/${person.slug}`}>{person.name}</Link></h2><p>{person.managerName}</p>
      </div>
    </div>
    <dl className="guru-card-metrics">
      <div><dt>{copy.reportedValue}</dt><dd>{compactUsd(latest.reportedValueUsd, locale)}</dd></div>
      <div><dt>{copy.holdings}</dt><dd>{number(latest.holdingCount, locale)}</dd></div>
      <div><dt>{copy.topPosition}</dt><dd>{latest.largestPosition ? <><strong>{latest.largestPosition.ticker ?? latest.largestPosition.company}</strong><span>{percent(latest.largestPosition.weightPercent, locale)}</span></> : '—'}</dd></div>
    </dl>
    <div className="guru-card-quarter">
      <span>{copy.latestQuarter}: <strong>{latest.periodEnd ?? '—'}</strong></span>
      <span className={`guru-quality is-${latest.status.toLowerCase()}`}>{copy.statusLabel(latest.status)}</span>
    </div>
    {latest.filedAt && <p className="guru-filed">{copy.filed}: {shortDate(latest.filedAt, locale)} · {copy.source}</p>}
    <div className="guru-card-actions" aria-label={copy.actions}>
      {actionTotal === 0 ? <span className="guru-no-actions">{copy.noActions}</span> : <>
        {latest.actionCounts.new > 0 && <span className="is-new">{copy.new} {latest.actionCounts.new}</span>}
        {latest.actionCounts.add > 0 && <span className="is-add">{copy.add} {latest.actionCounts.add}</span>}
        {latest.actionCounts.reduce > 0 && <span className="is-reduce">{copy.reduce} {latest.actionCounts.reduce}</span>}
        {latest.actionCounts.exit > 0 && <span className="is-exit">{copy.exit} {latest.actionCounts.exit}</span>}
      </>}
    </div>
    <div className="guru-card-footer">
      <GuruFollowButton slug={person.slug} followerCount={entry.followerCount} followed={entry.followedByMe} onChange={onFollowChange} />
      <Link className="guru-card-link" to={`/gurus/${person.slug}`}>{copy.viewProfile}<span aria-hidden="true">↗</span></Link>
    </div>
  </article>
}
