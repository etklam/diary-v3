import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import { authUserResponseSchema, type DiaryResponse } from '@diary/contracts'
import { diaryListResponseSchema } from '@diary/contracts/diary-list'
import { portfolioAttentionResponseSchema, type PortfolioAttentionItem } from '@diary/contracts/portfolio-attention'
import { portfolioValuationResponseSchema } from '@diary/contracts/portfolio'
import { reviewGroupsResponseSchema, type ReviewGroups, type ReviewItem } from '@diary/contracts/review-queue'
import { tradePlanListResponseSchema } from '@diary/contracts/trade-plan'
import { stockWatchlistResponseSchema } from '@diary/contracts/watchlist'
import { api, useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { useSessionState } from './session'
import { formatNeutralValue } from './market-display'
import { Icon } from './icons'
import './overview.css'

type OverviewLocale = 'en' | 'zh-TW' | 'zh-CN'
type OverviewCopy = Record<string, string>
function tx(c: OverviewCopy, key: string): string { return c[key] ?? key }

const copy: Record<OverviewLocale, OverviewCopy> = {
  en: {
    title: 'Overview', hint: 'Open the next useful action, then return to the reasoning behind it.', quick: 'Quick diary', followUp: 'Follow-up actions', attention: 'Needs your attention', reviewQueue: 'Review queue', recent: 'Recent decisions', plans: 'Trade plans', portfolio: 'Portfolio context', watchlist: 'Tracked companies', viewAll: 'View all', open: 'Open', emptyAttention: 'No risk or review actions need attention right now.', emptyReviews: 'No pending reviews. Recent decisions remain below.', emptyRecent: 'No diary decisions yet. Start with one entry.', emptyPlans: 'No trade plans yet.', emptyWatchlist: 'No tracked companies yet.', overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', unscheduled: 'Unscheduled', review: 'Review', diary: 'Diary', thesis: 'Investment thesis', reviewed: 'Reviewed', pendingReview: 'Review pending', original: 'Original decision', status: 'Status', draft: 'Draft', active: 'Active', closed: 'Closed', cancelled: 'Cancelled', reviewIntact: 'Intact', reviewPartial: 'Partially confirmed', reviewInvalidated: 'Invalidated', reviewUnclear: 'Unclear', sourceWeb: 'Web', sourceApiKey: 'API', sourceTelegram: 'Telegram', currentValue: 'Priced market value', coverage: 'Quote coverage', unpriced: 'Unpriced cost basis', largest: 'Largest priced position', topThree: 'Top three concentration', marketState: 'Market state', riskOn: 'Risk-on', riskOff: 'Risk-off', regular: 'Regular', neutral: 'Neutral', concentration: 'Concentration is elevated.', stale: 'Stale quotes', complete: 'Complete', partial: 'Partial', unavailable: 'Unavailable', emptyPortfolio: 'No open positions yet. Record a purchase to see portfolio context.', firstDiary: 'Write your first diary', research: 'Research', records: 'records', source: 'Source', lastUpdated: 'Updated', retry: 'Try again', failed: 'This section could not load.', hintLoading: 'Loading…', timezoneLoading: 'Loading account timezone…', timezoneFailed: 'Account timezone could not load.', date: 'Date', due: 'Due', plan: 'Plan', reviewStatus: 'Review status', noQuote: 'Missing quotes stay separate from priced value.', quoteSource: 'Priced positions only; unpriced cost remains separate.', portfolioError: 'Portfolio context could not load.', attentionPartial: 'Some quotes are missing; concentration uses priced positions while reminders still include active holdings.', recentHint: 'Bounded recent decisions; open a record for the full reasoning.', plansHint: 'Recent plans and their current status.', watchlistHint: 'Open a tracked company to continue its research record.', unavailableValue: 'Unavailable', asOf: 'As of', unknown: 'Unknown', noSummary: 'No latest research record.', invalidated_thesis_while_held: 'Thesis invalidated while held', overdue_thesis_review: 'Thesis review overdue', overdue_diary_review: 'Diary review overdue', position_concentration: 'Position concentration', missing_thesis: 'Missing thesis'
  },
  'zh-TW': {
    title: '總覽', hint: '先開啟下一個有用的行動，再回看背後的判斷脈絡。', quick: '快速記錄', followUp: '待跟進事項', attention: '需要留意', reviewQueue: '複盤隊列', recent: '近期判斷', plans: '交易計劃', portfolio: '持倉背景', watchlist: '追蹤中的公司', viewAll: '查看全部', open: '開啟', emptyAttention: '目前沒有需要處理的風險或複盤事項。', emptyReviews: '目前沒有待複盤項目；近期判斷仍列在下方。', emptyRecent: '尚未有日記判斷，先記錄一篇。', emptyPlans: '尚未有交易計劃。', emptyWatchlist: '尚未有追蹤中的公司。', overdue: '逾期', today: '今天', upcoming: '即將到期', unscheduled: '未排程', review: '複盤', diary: '日記', thesis: '投資論點', reviewed: '已複盤', pendingReview: '待複盤', original: '原始判斷', status: '狀態', draft: '草稿', active: '啟用中', closed: '已結束', cancelled: '已取消', reviewIntact: '已確認', reviewPartial: '部分確認', reviewInvalidated: '已失效', reviewUnclear: '未能確認', sourceWeb: '網頁', sourceApiKey: 'API', sourceTelegram: 'Telegram', currentValue: '已報價持倉市值', coverage: '報價覆蓋率', unpriced: '未估值成本', largest: '最大已報價持倉', topThree: '前三持倉集中度', marketState: '市場狀態', riskOn: '風險偏好', riskOff: '風險收縮', regular: '一般', neutral: '中性', concentration: '集中度偏高。', stale: '過期報價', complete: '完整', partial: '部分', unavailable: '暫不可用', emptyPortfolio: '尚無未平倉部位。記錄一筆買入後即可查看持倉背景。', firstDiary: '寫第一篇日記', research: '研究', records: '筆記錄', source: '來源', lastUpdated: '更新時間', retry: '重試', failed: '此區段暫時無法載入。', hintLoading: '載入中…', timezoneLoading: '正在載入帳戶時區…', timezoneFailed: '無法載入帳戶時區。', date: '日期', due: '到期', plan: '計劃', reviewStatus: '複盤狀態', noQuote: '缺報價持倉會與已報價市值分開顯示。', quoteSource: '只按已有報價的持倉計算；未估值成本獨立列出。', portfolioError: '持倉背景暫時無法載入。', attentionPartial: '部分持倉缺報價；集中度只涵蓋已有報價部位，但提醒仍涵蓋所有活躍持倉。', recentHint: '顯示有限數量的近期判斷；開啟記錄查看完整脈絡。', plansHint: '近期交易計劃及目前狀態。', watchlistHint: '開啟追蹤中的公司，繼續研究記錄。', unavailableValue: '暫不可用', asOf: '截至', unknown: '未知', noSummary: '尚未有最新研究記錄。', invalidated_thesis_while_held: '持有期間論點失效', overdue_thesis_review: '論點複盤逾期', overdue_diary_review: '日記複盤逾期', position_concentration: '持倉集中度', missing_thesis: '缺少投資論點'
  },
  'zh-CN': {
    title: '总览', hint: '先打开下一个有用的行动，再回看背后的判断脉络。', quick: '快速记录', followUp: '待跟进事项', attention: '需要留意', reviewQueue: '复盘队列', recent: '近期判断', plans: '交易计划', portfolio: '持仓背景', watchlist: '追踪中的公司', viewAll: '查看全部', open: '打开', emptyAttention: '目前没有需要处理的风险或复盘事项。', emptyReviews: '目前没有待复盘项目；近期判断仍列在下方。', emptyRecent: '尚未有日记判断，先记录一篇。', emptyPlans: '尚未有交易计划。', emptyWatchlist: '尚未有追踪中的公司。', overdue: '逾期', today: '今天', upcoming: '即将到期', unscheduled: '未排程', review: '复盘', diary: '日记', thesis: '投资论点', reviewed: '已复盘', pendingReview: '待复盘', original: '原始判断', status: '状态', draft: '草稿', active: '启用中', closed: '已结束', cancelled: '已取消', reviewIntact: '已确认', reviewPartial: '部分确认', reviewInvalidated: '已失效', reviewUnclear: '未能确认', sourceWeb: '网页', sourceApiKey: 'API', sourceTelegram: 'Telegram', currentValue: '已报价持仓市值', coverage: '报价覆盖率', unpriced: '未估值成本', largest: '最大已报价持仓', topThree: '前三持仓集中度', marketState: '市场状态', riskOn: '风险偏好', riskOff: '风险收缩', regular: '一般', neutral: '中性', concentration: '集中度偏高。', stale: '过期报价', complete: '完整', partial: '部分', unavailable: '暂不可用', emptyPortfolio: '尚无未平仓部位。记录一笔买入后即可查看持仓背景。', firstDiary: '写第一篇日记', research: '研究', records: '条记录', source: '来源', lastUpdated: '更新时间', retry: '重试', failed: '此区段暂时无法加载。', hintLoading: '加载中…', timezoneLoading: '正在加载账户时区…', timezoneFailed: '无法加载账户时区。', date: '日期', due: '到期', plan: '计划', reviewStatus: '复盘状态', noQuote: '缺报价持仓会与已报价市值分开显示。', quoteSource: '只按已有报价的持仓计算；未估值成本独立列出。', portfolioError: '持仓背景暂时无法加载。', attentionPartial: '部分持仓缺报价；集中度只涵盖已有报价部位，但提醒仍涵盖所有活跃持仓。', recentHint: '显示有限数量的近期判断；打开记录查看完整脉络。', plansHint: '近期交易计划及当前状态。', watchlistHint: '打开追踪中的公司，继续研究记录。', unavailableValue: '暂不可用', asOf: '截至', unknown: '未知', noSummary: '尚未有最新研究记录。', invalidated_thesis_while_held: '持有期间论点失效', overdue_thesis_review: '论点复盘逾期', overdue_diary_review: '日记复盘逾期', position_concentration: '持仓集中度', missing_thesis: '缺少投资论点'
  }
}

type ResourceName = 'attention' | 'reviews' | 'recent' | 'valuation' | 'plans' | 'watchlist'
type ResourceResult = { response: Response; data?: unknown; error?: unknown }
type ResourceState<T> = { data: T | null; error: Failure | null; loading: boolean }

async function requestResource(name: ResourceName, signal: AbortSignal): Promise<ResourceResult> {
  switch (name) {
    case 'attention': return api.GET('/api/portfolio/attention', { signal }) as unknown as ResourceResult
    case 'reviews': return api.GET('/api/reviews', { params: { query: { page: 1, limit: 20 } }, signal }) as unknown as ResourceResult
    case 'recent': return api.GET('/api/diaries', { params: { query: { page: 1, limit: 5, sortBy: 'date-desc' } }, signal }) as unknown as ResourceResult
    case 'valuation': return api.GET('/api/stocks/portfolio', { signal }) as unknown as ResourceResult
    case 'plans': return api.GET('/api/trade-plans', { params: { query: { page: 1, limit: 5, sortBy: 'updatedAt-desc' } }, signal }) as unknown as ResourceResult
    case 'watchlist': return api.GET('/api/stocks/watchlist', { signal }) as unknown as ResourceResult
  }
}

function useResource<T>(name: ResourceName, schema: z.ZodType<T>, revision: number, failureCopy: string): [ResourceState<T>, () => void] {
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: true })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState({ data: null, error: null, loading: true })
    requestResource(name, controller.signal).then(result => {
      if (!active) return
      const parsed = schema.safeParse(result.data)
      if (result.response.ok && parsed.success) setState({ data: parsed.data, error: null, loading: false })
      else setState({ data: null, error: apiFailure(result.error, failureCopy), loading: false })
    }).catch(() => {
      if (active) setState({ data: null, error: apiFailure(null, failureCopy), loading: false })
    })
    return () => { active = false; controller.abort() }
  }, [name, schema, retry, revision, failureCopy])
  return [state, () => setRetry(value => value + 1)]
}

function formatInstant(value: string, locale: string, timezone: string | null, unavailable = 'Unknown') {
  return timezone ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value)) : unavailable
}

function formatNumber(value: number | null | undefined, locale: string, _unavailable: string) {
  return formatNeutralValue(locale, value, 2)
}

function formatPercent(value: number | null | undefined, locale: string, unavailable: string) {
  const formatted = formatNumber(value, locale, unavailable)
  return formatted === '—' ? formatted : `${formatted}%`
}

function attentionHref(item: PortfolioAttentionItem) {
  if (item.targetKind === 'diary') return `/diaries/${item.targetId}/review`
  return item.reason === 'position_concentration' ? `/stocks/${encodeURIComponent(item.targetId)}` : `/stocks/${encodeURIComponent(item.targetId)}/thesis`
}

function sourceLabel(value: DiaryResponse['createdVia'], c: OverviewCopy) {
  return value === 'API_KEY' ? tx(c, 'sourceApiKey') : value === 'TELEGRAM_BOT' ? tx(c, 'sourceTelegram') : tx(c, 'sourceWeb')
}

function marketStateLabel(value: string | null, c: OverviewCopy) {
  const normalized = value?.toLowerCase()
  return normalized === 'risk_on' ? tx(c, 'riskOn') : normalized === 'risk_off' ? tx(c, 'riskOff') : normalized === 'regular' ? tx(c, 'regular') : normalized === 'neutral' ? tx(c, 'neutral') : value ?? tx(c, 'unknown')
}

function reviewHref(item: ReviewItem) {
  return item.targetType === 'diary' ? `/diaries/${item.id}/review` : `/stocks/${encodeURIComponent(item.symbol ?? '')}/thesis`
}

function FailureSection({ state, retry, copy }: { state: ResourceState<unknown>; retry: () => void; copy: OverviewCopy }) {
  if (state.loading) return <p className="overview-status" role="status">{copy.hintLoading}</p>
  if (state.error) return <div className="overview-error"><FailureNotice failure={state.error} /><button className="secondary" onClick={retry}>{copy.retry}</button></div>
  return null
}

function AttentionSection({ state, retry, timezone, locale, c }: { state: ResourceState<z.infer<typeof portfolioAttentionResponseSchema>>; retry: () => void; timezone: string | null; locale: string; c: OverviewCopy }) {
  return <section className="overview-section" aria-labelledby="overview-attention-title"><header className="overview-section-header"><h2 id="overview-attention-title"><Icon name="bell" />{c.attention}</h2><Link to="/stocks">{c.viewAll}</Link></header>
    <p className="overview-section-intro">{c.followUp}</p>
    <FailureSection state={state} retry={retry} copy={c} />
    {state.data && <>{!state.data.coverage.complete && <p className="overview-partial" role="status">{c.attentionPartial}</p>}{!state.data.items.length ? <p>{c.emptyAttention}</p> : <ul className="overview-action-list">{state.data.items.slice(0, 6).map(item => { const title = item.evidence.title ?? item.symbol ?? item.targetId; return <li key={item.id} data-testid="overview-attention-item"><div><strong>{c[item.reason]}</strong><span>{title}</span>{item.evidence.concentrationPct !== undefined && item.evidence.concentrationPct !== null && <span>{formatPercent(item.evidence.concentrationPct, locale, tx(c, 'unavailable'))}</span>}{item.evidence.reviewDueAt && <time dateTime={item.evidence.reviewDueAt}>{c.due}: {formatInstant(item.evidence.reviewDueAt, locale, timezone, tx(c, 'unknown'))}</time>}</div><Link to={attentionHref(item)}>{c.open}</Link></li> })}</ul>}</>}
  </section>
}

const reviewBuckets = ['overdue', 'today', 'upcoming', 'unscheduled'] as const

function ReviewSection({ state, retry, timezone, locale, c }: { state: ResourceState<ReviewGroups>; retry: () => void; timezone: string | null; locale: string; c: OverviewCopy }) {
  return <section className="overview-section" aria-labelledby="overview-review-title"><header className="overview-section-header"><h2 id="overview-review-title"><Icon name="check" />{c.reviewQueue}</h2><Link to="/reviews">{c.viewAll}</Link></header>
    <FailureSection state={state} retry={retry} copy={c} />
    {state.data && <>{reviewBuckets.every(bucket => state.data![bucket].length === 0) ? <p>{c.emptyReviews}</p> : <div className="overview-review-groups">{reviewBuckets.map(bucket => state.data![bucket].length ? <section key={bucket} aria-labelledby={`overview-review-${bucket}`}><h3 id={`overview-review-${bucket}`}>{c[bucket]}</h3><ul className="overview-action-list">{state.data![bucket].slice(0, 5).map(item => <li key={item.id} data-testid="overview-review-item"><div><strong>{item.targetType === 'diary' ? c.diary : c.thesis}</strong><span>{item.title}</span>{item.reviewDueAt && <time dateTime={item.reviewDueAt}>{c.due}: {formatInstant(item.reviewDueAt, locale, timezone, tx(c, 'unknown'))}</time>}</div><Link to={reviewHref(item)}>{c.open}</Link></li>)}</ul></section> : null)}</div>}</>}
  </section>
}

function RecentSection({ state, retry, c }: { state: ResourceState<z.infer<typeof diaryListResponseSchema>>; retry: () => void; c: OverviewCopy }) {
  return <section className="overview-section" aria-labelledby="overview-recent-title"><header className="overview-section-header"><h2 id="overview-recent-title"><Icon name="book" />{c.recent}</h2><Link to="/timeline">{c.viewAll}</Link></header><p className="overview-section-intro">{c.recentHint}</p>
    <FailureSection state={state} retry={retry} copy={c} />
    {state.data && (!state.data.data.length ? <p>{c.emptyRecent} <Link to="/diaries/new">{c.firstDiary}</Link></p> : <ol className="overview-recent-list">{state.data.data.map(diary => <RecentDiary key={diary.id} diary={diary} c={c} />)}</ol>)}
  </section>
}

function RecentDiary({ diary, c }: { diary: DiaryResponse; c: OverviewCopy }) {
  const status = diary.reviewStatus === 'reviewed' ? c.reviewed : diary.reviewStatus === 'pending' ? c.pendingReview : c.original
  const summary = (diary.content ?? '').replace(/\s+/g, ' ').trim()
  const outcome = diary.reviewOutcome === 'INTACT' ? c.reviewIntact : diary.reviewOutcome === 'PARTIAL' ? c.reviewPartial : diary.reviewOutcome === 'INVALIDATED' ? c.reviewInvalidated : diary.reviewOutcome === 'UNCLEAR' ? c.reviewUnclear : null
  return <li data-testid="overview-recent-item"><time dateTime={diary.date}>{diary.date}</time><div><h3><Link to={`/diaries/${diary.id}`}>{diary.title}</Link></h3><p>{summary ? summary.slice(0, 180) : c.emptyRecent}</p><span className="overview-meta">{sourceLabel(diary.createdVia, c)} · {status}{outcome ? ` · ${outcome}` : ''}</span></div></li>
}

function PlansSection({ state, retry, locale, timezone, c }: { state: ResourceState<z.infer<typeof tradePlanListResponseSchema>>; retry: () => void; locale: string; timezone: string | null; c: OverviewCopy }) {
  const status = (value: string) => c[value as 'draft' | 'active' | 'closed' | 'cancelled'] ?? value
  return <section className="overview-section" aria-labelledby="overview-plans-title"><header className="overview-section-header"><h2 id="overview-plans-title"><Icon name="clipboard" />{c.plans}</h2><Link to="/trade-plans">{c.viewAll}</Link></header><p className="overview-section-intro">{c.plansHint}</p>
    <FailureSection state={state} retry={retry} copy={c} />
    {state.data && (!state.data.data.length ? <p>{c.emptyPlans} <Link to="/trade-plans/new">{c.plan}</Link></p> : <ul className="overview-plan-list">{state.data.data.map(plan => <li key={plan.id} data-testid="overview-plan-item"><div><Link to={`/trade-plans/${plan.id}`}><strong>{plan.symbol}</strong>{plan.setupType ? ` · ${plan.setupType}` : ''}</Link><span>{c.status}: {status(plan.status)}</span><time dateTime={plan.updatedAt}>{c.lastUpdated}: {formatInstant(plan.updatedAt, locale, timezone, tx(c, 'unknown'))}</time></div>{plan.diary && <Link to={`/diaries/${plan.diary.id}`}>{plan.diary.title}</Link>}</li>)}</ul>)}
  </section>
}

function PortfolioSection({ state, retry, locale, timezone, c }: { state: ResourceState<z.infer<typeof portfolioValuationResponseSchema>>; retry: () => void; locale: string; timezone: string | null; c: OverviewCopy }) {
  return <section className="overview-section overview-side-section" aria-labelledby="overview-portfolio-title"><header className="overview-section-header"><h2 id="overview-portfolio-title"><Icon name="briefcase" />{c.portfolio}</h2><Link to="/stocks">{c.viewAll}</Link></header><FailureSection state={state} retry={retry} copy={c} />
    {state.data && (state.data.valuation.valuationStatus === 'empty' ? <p>{c.emptyPortfolio} <Link to="/diaries/new">{c.firstDiary}</Link></p> : <><p className="overview-meta">{c.quoteSource}</p><p className="overview-meta">{c.marketState}: {marketStateLabel(state.data.marketState, c)}</p><dl className="overview-metrics"><div><dt>{c.currentValue}</dt><dd data-testid="overview-current-value">{formatNumber(state.data.valuation.currentMarketValue, locale, tx(c, 'unavailableValue'))}</dd></div><div><dt>{c.coverage}</dt><dd data-testid="overview-quote-coverage">{formatPercent(state.data.valuation.quoteCoveragePct, locale, tx(c, 'unavailableValue'))}</dd></div><div><dt>{c.unpriced}</dt><dd data-testid="overview-unpriced-cost">{formatNumber(state.data.valuation.unpricedCostBasis, locale, tx(c, 'unavailableValue'))}</dd></div><div><dt>{c.largest}</dt><dd>{state.data.valuation.largestPositionSymbol ? <Link to={`/stocks/${encodeURIComponent(state.data.valuation.largestPositionSymbol)}`}>{state.data.valuation.largestPositionSymbol}</Link> : c.unavailableValue} {state.data.valuation.largestPositionPct !== null && `· ${formatPercent(state.data.valuation.largestPositionPct, locale, tx(c, 'unavailableValue'))}`}</dd></div><div><dt>{c.topThree}</dt><dd>{formatPercent(state.data.valuation.top3ConcentrationPct, locale, tx(c, 'unavailableValue'))}</dd></div></dl>{state.data.valuation.concentrationWarning && <p className="overview-partial" role="status">{c.concentration}</p>}<p className="overview-meta">{c.stale}: {state.data.valuation.staleQuoteCount} · {c.asOf}: {state.data.valuation.valuationAsOf ? formatInstant(state.data.valuation.valuationAsOf, locale, timezone, tx(c, 'unknown')) : c.unavailableValue}</p></>)}
  </section>
}

function WatchlistSection({ state, retry, c }: { state: ResourceState<z.infer<typeof stockWatchlistResponseSchema>>; retry: () => void; c: OverviewCopy }) {
  return <section className="overview-section overview-side-section" aria-labelledby="overview-watchlist-title"><header className="overview-section-header"><h2 id="overview-watchlist-title"><Icon name="star" />{c.watchlist}</h2><Link to="/stocks/watchlist">{c.viewAll}</Link></header><p className="overview-section-intro">{c.watchlistHint}</p><FailureSection state={state} retry={retry} copy={c} />
    {state.data && (!state.data.items.length ? <p>{c.emptyWatchlist} <Link to="/stocks/watchlist">{c.research}</Link></p> : <ul className="overview-watchlist">{state.data.items.slice(0, 6).map(item => <li key={item.id} data-testid="overview-watch-item"><Link to={`/stocks/${encodeURIComponent(item.stock.symbol)}`}><strong>{item.stock.symbol}</strong>{item.stock.name && <span>{item.stock.name}</span>}</Link><small>{item.recordCount} {c.records} · {item.latestRecord?.summary ?? c.noSummary}</small></li>)}</ul>)}
  </section>
}

export default function Overview() {
  const { locale } = useUi()
  const session = useSessionState()
  const c = copy[locale]
  const [timezone, setTimezone] = useState<string | null>(null)
  const [timezoneError, setTimezoneError] = useState(false)
  const [timezoneAttempt, setTimezoneAttempt] = useState(0)
  const [attention, retryAttention] = useResource('attention', portfolioAttentionResponseSchema, session.revision, tx(c, 'failed'))
  const [reviews, retryReviews] = useResource('reviews', reviewGroupsResponseSchema, session.revision, tx(c, 'failed'))
  const [recent, retryRecent] = useResource('recent', diaryListResponseSchema, session.revision, tx(c, 'failed'))
  const [valuation, retryValuation] = useResource('valuation', portfolioValuationResponseSchema, session.revision, tx(c, 'failed'))
  const [plans, retryPlans] = useResource('plans', tradePlanListResponseSchema, session.revision, tx(c, 'failed'))
  const [watchlist, retryWatchlist] = useResource('watchlist', stockWatchlistResponseSchema, session.revision, tx(c, 'failed'))

  useEffect(() => {
    const controller = new AbortController()
    setTimezone(null)
    setTimezoneError(false)
    api.GET('/api/auth/me', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = authUserResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setTimezone(parsed.data.data.timezone)
        setTimezoneError(false)
      } else setTimezoneError(true)
    }).catch(() => {
      if (!controller.signal.aborted) setTimezoneError(true)
    })
    return () => controller.abort()
  }, [session.revision, timezoneAttempt])

  const accountDate = timezone ? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: timezone }).format(new Date()) : null
  return <section className="overview-page" aria-labelledby="overview-title"><header className="overview-header"><div><div className="overview-date-row"><p className="overview-date" role="status">{accountDate ?? (timezoneError ? c.timezoneFailed : c.timezoneLoading)}</p>{timezoneError && <button type="button" className="secondary overview-retry" onClick={() => setTimezoneAttempt(value => value + 1)}>{c.retry}</button>}</div><h1 id="overview-title">{c.title}</h1><p className="lede">{c.hint}</p></div><Link className="button" to="/diaries/quick"><Icon name="zap" />{c.quick}</Link></header><p className="overview-follow-up-label">{c.followUp}</p><div className="overview-grid"><div className="overview-main"><AttentionSection state={attention} retry={retryAttention} timezone={timezone} locale={locale} c={c}/><ReviewSection state={reviews} retry={retryReviews} timezone={timezone} locale={locale} c={c}/><RecentSection state={recent} retry={retryRecent} c={c}/><PlansSection state={plans} retry={retryPlans} locale={locale} timezone={timezone} c={c}/></div><aside className="overview-side"><PortfolioSection state={valuation} retry={retryValuation} locale={locale} timezone={timezone} c={c}/><WatchlistSection state={watchlist} retry={retryWatchlist} c={c}/></aside></div></section>
}
