import { useEffect, useId, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { z } from 'zod'
import { diarySummaryListResponseSchema, type DiarySummary } from '@diary/contracts/diary-summary'
import { portfolioAttentionResponseSchema } from '@diary/contracts/portfolio-attention'
import { portfolioValuationResponseSchema } from '@diary/contracts/portfolio'
import {
  portfolioOverviewResponseSchema,
  type PortfolioOverviewResponse,
  type PortfolioOverviewSection,
} from '@diary/contracts/portfolio-overview'
import { reviewGroupsResponseSchema, type ReviewGroups } from '@diary/contracts/review-queue'
import { tradePlanListResponseSchema } from '@diary/contracts/trade-plan'
import { stockWatchlistResponseSchema } from '@diary/contracts/watchlist'
import { ActionButton, api, useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { useSessionState } from './session'
import type { ShellOutletContext } from './root'
import { formatAmount, formatInstantIn, formatPercent as sharedFormatPercent } from './market-display'
import { Icon } from './icons'
import { CaveatMark, CaveatNote, CaveatNotes, figureCaveat } from './figure-caveat'
import { buildOverviewAttentionRows, isOverviewFirstUse, type OverviewAttentionRow } from './overview-logic'
import { overviewCopy, type OverviewCopy as OverviewCopyShape } from './overview-copy'
import type { Locale } from './locale-copy'
import {
  attentionBandLabel,
  bandFromOverviewPriority,
  boundAttentionRuns,
  groupAttentionRuns,
} from './attention-display'
import './overview.css'

type OverviewLocale = Locale
type OverviewCopy = OverviewCopyShape

type ResourceName = 'portfolioOverview' | 'reviews' | 'recent' | 'plans' | 'watchlist'
type ResourceResult = { response: Response; data?: unknown; error?: unknown }
type ResourceState<T> = { data: T | null; error: Failure | null; loading: boolean }

async function requestResource(name: ResourceName, signal: AbortSignal): Promise<ResourceResult> {
  switch (name) {
    case 'portfolioOverview':
      return api.GET('/api/portfolio/overview', { signal })
    case 'reviews':
      return api.GET('/api/reviews', { params: { query: { page: 1, limit: 20 } }, signal })
    case 'recent':
      return api.GET('/api/diaries/summary', { params: { query: { page: 1, limit: 3, sortBy: 'date-desc' } }, signal })
    case 'plans':
      return api.GET('/api/trade-plans', { params: { query: { page: 1, limit: 5, sortBy: 'updatedAt-desc' } }, signal })
    case 'watchlist':
      return api.GET('/api/stocks/watchlist', { signal })
  }
}

function useResource<T>(
  name: ResourceName,
  schema: z.ZodType<T>,
  revision: number,
  failureCopy: string,
): [ResourceState<T>, () => void] {
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: true })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState({ data: null, error: null, loading: true })
    requestResource(name, controller.signal)
      .then(result => {
        if (!active) return
        const parsed = schema.safeParse(result.data)
        if (result.response.ok && parsed.success) setState({ data: parsed.data, error: null, loading: false })
        else setState({ data: null, error: apiFailure(result.error, failureCopy), loading: false })
      })
      .catch(() => {
        if (active) setState({ data: null, error: apiFailure(null, failureCopy), loading: false })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [name, schema, retry, revision, failureCopy])
  return [state, () => setRetry(value => value + 1)]
}

function formatInstant(value: string, locale: string, timezone: string | null, unavailable = 'Unknown') {
  return timezone ? formatInstantIn(locale, value, timezone) : unavailable
}

function formatNumber(value: number | null | undefined, locale: string) {
  return formatAmount(locale, value)
}

function formatPercent(value: number | null | undefined, locale: string) {
  return sharedFormatPercent(locale, value)
}

function sourceLabel(value: DiarySummary['createdVia'], c: OverviewCopy) {
  return value === 'API_KEY' ? c.sourceApiKey : value === 'TELEGRAM_BOT' ? c.sourceTelegram : c.sourceWeb
}

function FailureSection({
  state,
  retry,
  copy,
  errorId,
  label,
}: {
  state: ResourceState<unknown>
  retry: () => void
  copy: OverviewCopy
  errorId: string
  label: string
}) {
  if (state.loading)
    return (
      <p className="overview-status" role="status">
        {copy.hintLoading}
      </p>
    )
  if (state.error)
    return (
      <div className="overview-error" id={errorId}>
        <p className="overview-error-label">{label}</p>
        <FailureNotice failure={state.error} id={`${errorId}-notice`} />
        <button className="secondary" onClick={retry}>
          {copy.retry}
        </button>
      </div>
    )
  return null
}

function PortfolioSection({
  state,
  retry,
  locale,
  timezone,
  c,
}: {
  state: ResourceState<z.infer<typeof portfolioValuationResponseSchema>>
  retry: () => void
  locale: string
  timezone: string | null
  c: OverviewCopy
}) {
  const noteBase = useId(),
    portfolioCoverageNote = `${noteBase}-coverage`,
    portfolioQuoteAgeNote = `${noteBase}-quote-age`
  return (
    <section className="overview-section overview-side-section" aria-labelledby="overview-portfolio-title">
      <header className="overview-section-header">
        <h2 id="overview-portfolio-title">
          <Icon name="briefcase" />
          {c.portfolio}
        </h2>
        <Link to="/stocks">{c.viewAll}</Link>
      </header>
      <FailureSection state={state} retry={retry} copy={c} errorId="overview-portfolio-error" label={c.portfolio} />
      {state.data &&
        (state.data.valuation.valuationStatus === 'empty' ? (
          <p>
            {c.emptyPortfolio} <Link to="/diaries/new">{c.firstDiary}</Link>
          </p>
        ) : (
          <>
            <dl className="overview-metrics">
              <div>
                <dt>
                  {c.currentValue}
                  <CaveatMark />
                </dt>
                <dd data-testid="overview-current-value" aria-describedby={portfolioCoverageNote}>
                  {formatNumber(state.data.valuation.currentMarketValue, locale)}
                </dd>
              </div>
              <div>
                <dt>
                  {c.coverage}
                  <CaveatMark />
                  <CaveatMark mark="†" />
                </dt>
                <dd
                  data-testid="overview-quote-coverage"
                  aria-describedby={`${portfolioCoverageNote} ${portfolioQuoteAgeNote}`}
                >
                  {formatPercent(state.data.valuation.quoteCoveragePct, locale)}
                </dd>
              </div>
              <div>
                <dt>{c.unpriced}</dt>
                <dd data-testid="overview-unpriced-cost">
                  {formatNumber(state.data.valuation.unpricedCostBasis, locale)}
                </dd>
              </div>
            </dl>
            <CaveatNotes>
              <CaveatNote id={portfolioCoverageNote} testId="coverage-note">
                {figureCaveat(locale)}
              </CaveatNote>
              <CaveatNote id={portfolioQuoteAgeNote} mark="†" testId="quote-age-note">
                {c.stale}: {state.data.valuation.staleQuoteCount} · {c.asOf}:{' '}
                {state.data.valuation.valuationAsOf
                  ? formatInstant(state.data.valuation.valuationAsOf, locale, timezone, c.unknown)
                  : c.unavailableValue}
              </CaveatNote>
              {state.data.valuation.concentrationWarning && (
                <p className="figure-caveat-status" role="status">
                  {c.concentration}
                </p>
              )}
            </CaveatNotes>
          </>
        ))}
    </section>
  )
}

function WatchlistSection({
  state,
  retry,
  c,
}: {
  state: ResourceState<z.infer<typeof stockWatchlistResponseSchema>>
  retry: () => void
  c: OverviewCopy
}) {
  return (
    <section className="overview-section overview-side-section" aria-labelledby="overview-watchlist-title">
      <header className="overview-section-header">
        <h2 id="overview-watchlist-title">
          <Icon name="star" />
          {c.watchlist}
        </h2>
        <Link to="/stocks/watchlist">{c.viewAll}</Link>
      </header>
      <FailureSection state={state} retry={retry} copy={c} errorId="overview-watchlist-error" label={c.watchlist} />
      {state.data?.items.length ? (
        <ul className="overview-watchlist">
          {state.data.items.slice(0, 3).map(item => (
            <li key={item.id} data-testid="overview-watch-item">
              <Link to={`/stocks/${encodeURIComponent(item.stock.symbol)}`}>
                <strong>{item.stock.symbol}</strong>
                {item.stock.name && <span>{item.stock.name}</span>}
              </Link>
              <small>
                {item.recordCount} {c.records} · {item.latestRecord?.summary ?? c.noSummary}
              </small>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function loaded<T>(state: ResourceState<T>): state is ResourceState<T> & { data: T; error: null; loading: false } {
  return !state.loading && !state.error && state.data !== null
}

function portfolioSectionState<T>(
  parent: ResourceState<PortfolioOverviewResponse>,
  section: PortfolioOverviewSection<T> | undefined,
  failureCopy: string,
): ResourceState<T> {
  if (parent.loading) return { data: null, error: null, loading: true }
  if (parent.error) return { data: null, error: parent.error, loading: false }
  if (section?.status === 'ready') return { data: section.data, error: null, loading: false }
  if (section?.status === 'failed') {
    return { data: null, error: apiFailure({ data: { ...section.error, details: null } }, failureCopy), loading: false }
  }
  return { data: null, error: apiFailure(null, failureCopy), loading: false }
}

const attentionCountCopy = {
  en: (n: number) => `${n} companies`,
  'zh-TW': (n: number) => `${n} 間公司`,
  'zh-CN': (n: number) => `${n} 间公司`,
} as const
const attentionMoreCopy = {
  en: (n: number) => `and ${n} more`,
  'zh-TW': (n: number) => `還有 ${n} 項`,
  'zh-CN': (n: number) => `还有 ${n} 项`,
} as const
function attentionCount(n: number, locale: string) {
  return (attentionCountCopy[locale as OverviewLocale] ?? attentionCountCopy.en)(n)
}
function attentionMore(n: number, locale: string) {
  return (attentionMoreCopy[locale as OverviewLocale] ?? attentionMoreCopy.en)(n)
}

function rowLabel(row: OverviewAttentionRow, c: OverviewCopy) {
  if (row.reason === 'review')
    return `${row.reviewBucket === 'overdue' ? c.overdue : c.today} · ${row.targetType === 'thesis' ? c.thesis : c.diary}`
  return c[row.reason]
}

function WorkspaceAttentionSection({
  attention,
  retryAttention,
  reviews,
  retryReviews,
  timezone,
  locale,
  c,
}: {
  attention: ResourceState<z.infer<typeof portfolioAttentionResponseSchema>>
  retryAttention: () => void
  reviews: ResourceState<ReviewGroups>
  retryReviews: () => void
  timezone: string | null
  locale: string
  c: OverviewCopy
}) {
  const rows = buildOverviewAttentionRows(attention.data, reviews.data)
  const bounded = boundAttentionRuns(
    groupAttentionRuns(rows, row => `${row.reason}:${row.reviewBucket ?? ''}`),
    5,
  )
  const attentionReady = loaded(attention)
  const reviewsReady = loaded(reviews)
  // Audit UI-003: keep the section heading visible even when nothing needs attention,
  // so the muted sentence has context instead of floating between dividers.
  if (attentionReady && reviewsReady && !rows.length)
    return (
      <section className="overview-section" aria-labelledby="overview-attention-title">
        <header className="overview-section-header">
          <h2 id="overview-attention-title">
            <Icon name="bell" />
            {c.attention}
          </h2>
          <div className="overview-section-links">
            <Link to="/reviews">{c.reviewQueue}</Link>
            <Link to="/stocks">{c.portfolio}</Link>
          </div>
        </header>
        <p className="overview-no-actions" role="status" data-testid="overview-no-current-actions">
          {c.noCurrentActions}
        </p>
      </section>
    )
  return (
    <section className="overview-section" aria-labelledby="overview-attention-title">
      <header className="overview-section-header">
        <h2 id="overview-attention-title">
          <Icon name="bell" />
          {c.attention}
        </h2>
        <div className="overview-section-links">
          <Link to="/reviews">{c.reviewQueue}</Link>
          <Link to="/stocks">{c.portfolio}</Link>
        </div>
      </header>
      <p className="overview-section-intro">{c.followUp}</p>
      <FailureSection
        state={attention}
        retry={retryAttention}
        copy={c}
        errorId="overview-attention-error"
        label={c.attention}
      />
      <FailureSection
        state={reviews}
        retry={retryReviews}
        copy={c}
        errorId="overview-reviews-error"
        label={c.reviewQueue}
      />
      {attention.data && !attention.data.coverage.complete && (
        <p className="overview-partial" role="status">
          {c.attentionPartial}
        </p>
      )}
      {/* The row is the link: "Open" named nothing and sat ~1,150px from the
        label it belonged to, five times over. Severity is carried structurally
        by `data-attention-band`, and a run of one reason is one row with its
        subjects inline (ticket 119). */}
      {rows.length ? (
        <>
          <ul className="overview-action-list attention-list">
            {bounded.shown.map(run => {
              const [first] = run as [OverviewAttentionRow, ...OverviewAttentionRow[]]
              const band = bandFromOverviewPriority(first.priority)
              if (run.length === 1)
                return (
                  <li
                    key={first.key}
                    data-testid="overview-attention-item"
                    data-overview-priority={first.priority}
                    data-attention-band={band}
                  >
                    <Link className="attention-row" to={first.href}>
                      <span className="sr-only">{attentionBandLabel(band, locale)}</span>
                      <strong>{rowLabel(first, c)}</strong>
                      <span>{first.title}</span>
                      {first.reason === 'position_concentration' && (
                        <span className="figure">{formatPercent(first.concentrationPct, locale)}</span>
                      )}
                      {first.dueAt && (
                        <time dateTime={first.dueAt}>
                          {c.due}: {formatInstant(first.dueAt, locale, timezone, c.unknown)}
                        </time>
                      )}
                    </Link>
                  </li>
                )
              return (
                <li
                  key={first.key}
                  data-testid="overview-attention-item"
                  data-overview-priority={first.priority}
                  data-attention-band={band}
                  data-attention-group={run.length}
                >
                  <div className="attention-row attention-row-group">
                    <span className="sr-only">{attentionBandLabel(band, locale)}</span>
                    <strong>{rowLabel(first, c)}</strong>
                    <span className="muted">{attentionCount(run.length, locale)}</span>
                    <span className="attention-subjects">
                      {run.map(row => (
                        <Link key={row.key} to={row.href} aria-label={`${rowLabel(row, c)} — ${row.title}`}>
                          {row.title}
                        </Link>
                      ))}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          {bounded.remaining > 0 && (
            <p className="attention-more" data-testid="overview-attention-more">
              {attentionMore(bounded.remaining, locale)}
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}

function RecentDiary({ diary, c }: { diary: DiarySummary; c: OverviewCopy }) {
  const status =
    diary.reviewStatus === 'reviewed' ? c.reviewed : diary.reviewStatus === 'pending' ? c.pendingReview : c.original
  const outcome =
    diary.reviewOutcome === 'INTACT'
      ? c.reviewIntact
      : diary.reviewOutcome === 'PARTIAL'
        ? c.reviewPartial
        : diary.reviewOutcome === 'INVALIDATED'
          ? c.reviewInvalidated
          : diary.reviewOutcome === 'UNCLEAR'
            ? c.reviewUnclear
            : null
  return (
    <li data-testid="overview-recent-item">
      <time dateTime={diary.date}>{diary.date}</time>
      <div>
        <h3>
          <Link to={`/diaries/${diary.id}`}>{diary.title}</Link>
        </h3>
        <p>{diary.excerpt || c.emptyRecent}</p>
        <span className="overview-meta">
          {sourceLabel(diary.createdVia, c)} · {status}
          {outcome ? ` · ${outcome}` : ''}
        </span>
      </div>
    </li>
  )
}

function WorkspaceRecentSection({
  state,
  retry,
  c,
}: {
  state: ResourceState<z.infer<typeof diarySummaryListResponseSchema>>
  retry: () => void
  c: OverviewCopy
}) {
  if (loaded(state) && !state.data.data.length)
    return (
      <p className="overview-secondary-prompt" data-testid="overview-first-diary-prompt">
        {c.firstDiaryPrompt} <Link to="/diaries/new">{c.firstDiary}</Link>
      </p>
    )
  return (
    <section className="overview-section" aria-labelledby="overview-recent-title">
      <header className="overview-section-header">
        <h2 id="overview-recent-title">
          <Icon name="book" />
          {c.recent}
        </h2>
        <Link to="/diaries">{c.diaryLibrary}</Link>
      </header>
      <FailureSection state={state} retry={retry} copy={c} errorId="overview-recent-error" label={c.recent} />
      {state.data?.data.length ? (
        <>
          <ol className="overview-recent-list">
            {state.data.data.slice(0, 3).map(diary => (
              <RecentDiary key={diary.id} diary={diary} c={c} />
            ))}
          </ol>
          {state.data.pagination.total === 1 && (
            <p className="overview-secondary-prompt" data-testid="overview-single-record-prompt">
              {c.singleRecordPrompt} <Link to={`/diaries/${state.data.data[0]!.id}`}>{c.open}</Link> ·{' '}
              <Link to={`/diaries/${state.data.data[0]!.id}/edit`}>{c.arrangeReview}</Link>
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}

/**
 * The account timezone decides which calendar day an entry is filed under, and
 * it defaults to `Asia/Taipei` without ever being stated (ticket 137). This is
 * the one screen that renders exactly once per account, before the first entry
 * exists, so it is where the fact is cheapest to state and cheapest to correct.
 *
 * It states, then offers. A reader whose device already agrees sees one quiet
 * sentence and no decision; only a mismatch produces a control.
 */
function FirstUseTimezone({ c, timezone, onChanged }: { c: OverviewCopy; timezone: string; onChanged: () => void }) {
  const [device] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
      return null
    }
  })
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const differs = Boolean(device && device !== timezone)

  async function useDevice() {
    if (!device) return
    setPending(true)
    setFailed(false)
    try {
      // `/api/user/settings` replaces the whole record, so the current one is
      // read first rather than guessing at the fields this screen never shows.
      const current = await api.GET('/api/user/settings')
      if (!current.response.ok || !current.data) throw new Error('settings unavailable')
      const result = await api.PUT('/api/user/settings', {
        body: { ...current.data.settings, timezone: device },
      })
      if (!result.response.ok) throw new Error('settings rejected')
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="overview-first-use-timezone">
      <p>
        {c.timezoneStatement} <span className="figure">{timezone}</span>
        {differs && (
          <>
            {' · '}
            {c.timezoneDiffers} <span className="figure">{device}</span>
          </>
        )}
      </p>
      {differs && (
        <ActionButton type="button" className="quiet-button button-compact" pending={pending} onClick={useDevice}>
          {c.useDeviceTimezone}
        </ActionButton>
      )}
      {failed && (
        <p className="error" role="alert">
          {c.timezoneSaveFailed}
        </p>
      )}
    </div>
  )
}

function FirstUseSection({
  c,
  timezone,
  onTimezoneChanged,
}: {
  c: OverviewCopy
  timezone: string | null
  onTimezoneChanged: () => void
}) {
  return (
    <section className="overview-first-use" data-testid="overview-first-use" aria-labelledby="overview-first-use-title">
      <h2 id="overview-first-use-title">{c.firstUseTitle}</h2>
      <p>{c.firstUseCopy}</p>
      <div className="overview-first-use-actions">
        <Link className="button" to="/diaries/quick">
          {c.startRecording}
        </Link>
        <Link className="button secondary" to="/tools">
          {c.exploreTools}
        </Link>
      </div>
      {timezone && <FirstUseTimezone c={c} timezone={timezone} onChanged={onTimezoneChanged} />}
    </section>
  )
}

function DestinationsSection({
  c,
  plans,
  retryPlans,
}: {
  c: OverviewCopy
  plans: ResourceState<z.infer<typeof tradePlanListResponseSchema>>
  retryPlans: () => void
}) {
  return (
    <nav className="overview-destinations" aria-labelledby="overview-destinations-title">
      <h2 id="overview-destinations-title">{c.destinations}</h2>
      <ul>
        <li>
          <Link to="/trade-plans">
            <Icon name="clipboard" />
            {c.plans}
          </Link>
          {(plans.loading || plans.error) && (
            <FailureSection state={plans} retry={retryPlans} copy={c} errorId="overview-plans-error" label={c.plans} />
          )}
        </li>
        <li>
          <Link to="/stocks/watchlist">
            <Icon name="star" />
            {c.research}
          </Link>
        </li>
        <li>
          <Link to="/tools">
            <Icon name="wrench" />
            {c.tools}
          </Link>
        </li>
      </ul>
    </nav>
  )
}

export default function Overview() {
  const { locale } = useUi()
  const session = useSessionState()
  const c = overviewCopy[locale]
  // The shell already holds this response; Overview used to fetch it again and
  // gate its first-use screen on the second copy (ticket 136).
  const { viewer, viewerError, refreshViewer } = useOutletContext<ShellOutletContext>()
  const timezone = viewer?.timezone ?? null
  const timezoneError = viewerError
  const [portfolioOverview, retryPortfolioOverview] = useResource(
    'portfolioOverview',
    portfolioOverviewResponseSchema,
    session.revision,
    c.failed,
  )
  const attention = portfolioSectionState(portfolioOverview, portfolioOverview.data?.attention, c.failed)
  const valuation = portfolioSectionState(portfolioOverview, portfolioOverview.data?.valuation, c.failed)
  const retryAttention = retryPortfolioOverview
  const retryValuation = retryPortfolioOverview
  const [reviews, retryReviews] = useResource('reviews', reviewGroupsResponseSchema, session.revision, c.failed)
  const [recent, retryRecent] = useResource('recent', diarySummaryListResponseSchema, session.revision, c.failed)
  const [plans, retryPlans] = useResource('plans', tradePlanListResponseSchema, session.revision, c.failed)
  const [watchlist, retryWatchlist] = useResource('watchlist', stockWatchlistResponseSchema, session.revision, c.failed)

  const accountDate = timezone
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: timezone }).format(new Date())
    : null
  // Ticket 136: first use is decided by the diary count, which is the smallest
  // of the six queries and the only one that answers "is this a new account".
  // The other five answer "is this account empty in every dimension", which is
  // a different question — they still refine the answer, but a section that is
  // slow or broken no longer suppresses the welcome, and neither does the
  // account timezone. A resource that has not resolved is not evidence of
  // content, so it reads as unknown rather than as a reason to wait.
  const firstUse = isOverviewFirstUse({
    recent: recent.data,
    attention: attention.data,
    reviews: reviews.data,
    valuation: valuation.data,
    plans: plans.data,
    watchlist: watchlist.data,
  })
  const showPortfolio =
    valuation.loading ||
    Boolean(valuation.error) ||
    Boolean(valuation.data && valuation.data.valuation.valuationStatus !== 'empty')
  const showWatchlist = watchlist.loading || Boolean(watchlist.error) || Boolean(watchlist.data?.items.length)
  return (
    <section className="overview-page" aria-labelledby="overview-title">
      <header className="overview-header">
        <div>
          <div className="overview-date-row">
            <p className="overview-date" role="status">
              {accountDate ?? (timezoneError ? c.timezoneFailed : c.timezoneLoading)}
            </p>
            {timezoneError && accountDate && <span role="status">{c.timezoneFailed}</span>}
            {timezoneError && (
              <button type="button" className="secondary overview-retry" onClick={refreshViewer}>
                {c.retry}
              </button>
            )}
          </div>
          <h1 id="overview-title">{c.title}</h1>
          <p className="lede">{c.hint}</p>
        </div>
        {!firstUse && (
          <Link className="button secondary" to="/diaries/quick">
            <Icon name="zap" />
            {c.quick}
          </Link>
        )}
      </header>
      {/* Audit UI-001: first-use accounts still get the destination shortcuts so the
    dashboard is not a dead end with only one action. */}
      {firstUse ? (
        <>
          <FirstUseSection c={c} timezone={timezone} onTimezoneChanged={refreshViewer} />
          {attention.error && (
            <FailureSection
              state={attention}
              retry={retryAttention}
              copy={c}
              errorId="overview-attention-error"
              label={c.attention}
            />
          )}
          {reviews.error && (
            <FailureSection
              state={reviews}
              retry={retryReviews}
              copy={c}
              errorId="overview-reviews-error"
              label={c.reviewQueue}
            />
          )}
          {valuation.error && (
            <FailureSection
              state={valuation}
              retry={retryValuation}
              copy={c}
              errorId="overview-portfolio-error"
              label={c.portfolio}
            />
          )}
          {watchlist.error && (
            <FailureSection
              state={watchlist}
              retry={retryWatchlist}
              copy={c}
              errorId="overview-watchlist-error"
              label={c.watchlist}
            />
          )}
          <DestinationsSection c={c} plans={plans} retryPlans={retryPlans} />
        </>
      ) : (
        <>
          <WorkspaceAttentionSection
            attention={attention}
            retryAttention={retryAttention}
            reviews={reviews}
            retryReviews={retryReviews}
            timezone={timezone}
            locale={locale}
            c={c}
          />
          <WorkspaceRecentSection state={recent} retry={retryRecent} c={c} />
          <div className="overview-context-grid">
            {showPortfolio && (
              <PortfolioSection state={valuation} retry={retryValuation} locale={locale} timezone={timezone} c={c} />
            )}{' '}
            {showWatchlist && <WatchlistSection state={watchlist} retry={retryWatchlist} c={c} />}
          </div>
          <DestinationsSection c={c} plans={plans} retryPlans={retryPlans} />
        </>
      )}
    </section>
  )
}
