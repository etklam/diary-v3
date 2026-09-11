import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import { authUserResponseSchema } from '@diary/contracts'
import { diarySummaryListResponseSchema, type DiarySummary } from '@diary/contracts/diary-summary'
import { portfolioAttentionResponseSchema } from '@diary/contracts/portfolio-attention'
import { portfolioValuationResponseSchema } from '@diary/contracts/portfolio'
import { reviewGroupsResponseSchema, type ReviewGroups } from '@diary/contracts/review-queue'
import { tradePlanListResponseSchema } from '@diary/contracts/trade-plan'
import { stockWatchlistResponseSchema } from '@diary/contracts/watchlist'
import { api, useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { useSessionState } from './session'
import { formatNeutralValue } from './market-display'
import { Icon } from './icons'
import { buildOverviewAttentionRows, isOverviewFirstUse, type OverviewAttentionRow } from './overview-logic'
import './overview.css'

type OverviewLocale = 'en' | 'zh-TW' | 'zh-CN'
type OverviewCopy = Record<string, string>
function tx(c: OverviewCopy, key: string): string { return c[key] ?? key }

const copy: Record<OverviewLocale, OverviewCopy> = {
  en: {
    title: "Today's workspace", hint: 'See what needs attention, then keep the reasoning close.', quick: 'Quick diary', writeDiary: 'Write diary', captureOptions: 'More ways to record', followUp: 'Follow-up actions', attention: 'Needs your attention', reviewQueue: 'Review queue', recent: 'Recent decisions', plans: 'Trade plans', portfolio: 'Portfolio context', watchlist: 'Tracked companies', research: 'Research', tools: 'Tools', destinations: 'Continue elsewhere', viewAll: 'View all', diaryLibrary: 'Diary library', open: 'Open', emptyAttention: 'No risk or review actions need attention right now.', emptyReviews: 'No pending reviews. Recent decisions remain below.', emptyRecent: 'No diary decisions yet. Start with one entry.', emptyPlans: 'No trade plans yet.', emptyWatchlist: 'No tracked companies yet.', noCurrentActions: 'No current actions.', overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', unscheduled: 'Unscheduled', review: 'Review', diary: 'Diary', thesis: 'Investment thesis', reviewed: 'Reviewed', pendingReview: 'Review pending', original: 'Original decision', status: 'Status', draft: 'Draft', active: 'Active', closed: 'Closed', cancelled: 'Cancelled', reviewIntact: 'Intact', reviewPartial: 'Partially confirmed', reviewInvalidated: 'Invalidated', reviewUnclear: 'Unclear', sourceWeb: 'Web', sourceApiKey: 'API', sourceTelegram: 'Telegram', currentValue: 'Priced market value', coverage: 'Quote coverage', unpriced: 'Unpriced cost basis', largest: 'Largest priced position', topThree: 'Top three concentration', marketState: 'Market state', riskOn: 'Risk-on', riskOff: 'Risk-off', regular: 'Regular', neutral: 'Neutral', concentration: 'Concentration is elevated.', stale: 'Stale quotes', complete: 'Complete', partial: 'Partial', unavailable: 'Unavailable', emptyPortfolio: 'No open positions yet. Record a purchase to see portfolio context.', firstDiary: 'Write your first diary', records: 'records', source: 'Source', lastUpdated: 'Updated', retry: 'Try again', failed: 'This section could not load.', hintLoading: 'Loading…', timezoneLoading: 'Loading account timezone…', timezoneFailed: 'Account timezone could not load.', date: 'Date', due: 'Due', plan: 'Plan', reviewStatus: 'Review status', noQuote: 'Missing quotes stay separate from priced value.', quoteSource: 'Priced positions only; unpriced cost remains separate.', portfolioError: 'Portfolio context could not load.', attentionPartial: 'Some quotes are missing; concentration uses priced positions while reminders still include active holdings.', recentHint: 'Three recent decisions; open a record for the full reasoning.', singleRecordPrompt: 'Keep this record easy to revisit.', arrangeReview: 'Arrange a later review', firstUseTitle: 'Record a judgment you may want to revisit.', startRecording: 'Start recording', firstUseCopy: 'It can be an observation, a question, or a trade idea you haven’t acted on.', exploreTools: 'Explore tools', firstDiaryPrompt: 'No diary is recorded yet. Start one when you are ready.', watchlistHint: 'Open a tracked company to continue its research record.', unavailableValue: 'Unavailable', asOf: 'As of', unknown: 'Unknown', noSummary: 'No latest research record.', invalidated_thesis_while_held: 'Thesis invalidated while held', overdue_thesis_review: 'Thesis review overdue', overdue_diary_review: 'Diary review overdue', position_concentration: 'Position concentration', missing_thesis: 'Missing thesis'
  },
  'zh-TW': {
    title: '今日工作區', hint: '先看需要留意的事項，再把判斷脈絡留在身邊。', quick: '快速記錄', writeDiary: '寫日記', captureOptions: '其他記錄方式', followUp: '待跟進事項', attention: '需要留意', reviewQueue: '複盤隊列', recent: '近期判斷', plans: '交易計劃', portfolio: '持倉背景', watchlist: '追蹤中的公司', research: '研究', tools: '工具', destinations: '繼續前往', viewAll: '查看全部', diaryLibrary: '日記庫', open: '開啟', emptyAttention: '目前沒有需要處理的風險或複盤事項。', emptyReviews: '目前沒有待複盤項目；近期判斷仍列在下方。', emptyRecent: '尚未有日記判斷，先記錄一篇。', emptyPlans: '尚未有交易計劃。', emptyWatchlist: '尚未有追蹤中的公司。', noCurrentActions: '目前沒有需要處理的事項。', overdue: '逾期', today: '今天', upcoming: '即將到期', unscheduled: '未排程', review: '複盤', diary: '日記', thesis: '投資論點', reviewed: '已複盤', pendingReview: '待複盤', original: '原始判斷', status: '狀態', draft: '草稿', active: '啟用中', closed: '已結束', cancelled: '已取消', reviewIntact: '已確認', reviewPartial: '部分確認', reviewInvalidated: '已失效', reviewUnclear: '未能確認', sourceWeb: '網頁', sourceApiKey: 'API', sourceTelegram: 'Telegram', currentValue: '已報價持倉市值', coverage: '報價覆蓋率', unpriced: '未估值成本', largest: '最大已報價持倉', topThree: '前三持倉集中度', marketState: '市場狀態', riskOn: '風險偏好', riskOff: '風險收縮', regular: '一般', neutral: '中性', concentration: '集中度偏高。', stale: '過期報價', complete: '完整', partial: '部分', unavailable: '暫不可用', emptyPortfolio: '尚無未平倉部位。記錄一筆買入後即可查看持倉背景。', firstDiary: '寫第一篇日記', records: '筆記錄', source: '來源', lastUpdated: '更新時間', retry: '重試', failed: '此區段暫時無法載入。', hintLoading: '載入中…', timezoneLoading: '正在載入帳戶時區…', timezoneFailed: '無法載入帳戶時區。', date: '日期', due: '到期', plan: '計劃', reviewStatus: '複盤狀態', noQuote: '缺報價持倉會與已報價市值分開顯示。', quoteSource: '只按已有報價的持倉計算；未估值成本獨立列出。', portfolioError: '持倉背景暫時無法載入。', attentionPartial: '部分持倉缺報價；集中度只涵蓋已有報價部位，但提醒仍涵蓋所有活躍持倉。', recentHint: '顯示三筆近期判斷；開啟記錄查看完整脈絡。', singleRecordPrompt: '讓這筆記錄日後更容易回看。', arrangeReview: '安排稍後複盤', firstUseTitle: '記下一個日後可能想回看的判斷。', startRecording: '開始記錄', firstUseCopy: '可以是觀察、疑問，或者暫時未打算執行的交易想法。', exploreTools: '探索工具', firstDiaryPrompt: '尚未記錄日記，準備好時就開始一篇。', watchlistHint: '開啟追蹤中的公司，繼續研究記錄。', unavailableValue: '暫不可用', asOf: '截至', unknown: '未知', noSummary: '尚未有最新研究記錄。', invalidated_thesis_while_held: '持有期間論點失效', overdue_thesis_review: '論點複盤逾期', overdue_diary_review: '日記複盤逾期', position_concentration: '持倉集中度', missing_thesis: '缺少投資論點'
  },
  'zh-CN': {
    title: '今日工作区', hint: '先看需要留意的事项，再把判断脉络留在身边。', quick: '快速记录', writeDiary: '写日记', captureOptions: '其他记录方式', followUp: '待跟进事项', attention: '需要留意', reviewQueue: '复盘队列', recent: '近期判断', plans: '交易计划', portfolio: '持仓背景', watchlist: '追踪中的公司', research: '研究', tools: '工具', destinations: '继续前往', viewAll: '查看全部', diaryLibrary: '日记库', open: '打开', emptyAttention: '目前没有需要处理的风险或复盘事项。', emptyReviews: '目前没有待复盘项目；近期判断仍列在下方。', emptyRecent: '尚未有日记判断，先记录一篇。', emptyPlans: '尚未有交易计划。', emptyWatchlist: '尚未有追踪中的公司。', noCurrentActions: '目前没有需要处理的事项。', overdue: '逾期', today: '今天', upcoming: '即将到期', unscheduled: '未排程', review: '复盘', diary: '日记', thesis: '投资论点', reviewed: '已复盘', pendingReview: '待复盘', original: '原始判断', status: '状态', draft: '草稿', active: '启用中', closed: '已结束', cancelled: '已取消', reviewIntact: '已确认', reviewPartial: '部分确认', reviewInvalidated: '已失效', reviewUnclear: '未能确认', sourceWeb: '网页', sourceApiKey: 'API', sourceTelegram: 'Telegram', currentValue: '已报价持仓市值', coverage: '报价覆盖率', unpriced: '未估值成本', largest: '最大已报价持仓', topThree: '前三持仓集中度', marketState: '市场状态', riskOn: '风险偏好', riskOff: '风险收缩', regular: '一般', neutral: '中性', concentration: '集中度偏高。', stale: '过期报价', complete: '完整', partial: '部分', unavailable: '暂不可用', emptyPortfolio: '尚无未平仓部位。记录一笔买入后即可查看持仓背景。', firstDiary: '写第一篇日记', records: '条记录', source: '来源', lastUpdated: '更新时间', retry: '重试', failed: '此区段暂时无法加载。', hintLoading: '加载中…', timezoneLoading: '正在加载账户时区…', timezoneFailed: '无法加载账户时区。', date: '日期', due: '到期', plan: '计划', reviewStatus: '复盘状态', noQuote: '缺报价持仓会与已报价市值分开显示。', quoteSource: '只按已有报价的持仓计算；未估值成本独立列出。', portfolioError: '持仓背景暂时无法加载。', attentionPartial: '部分持仓缺报价；集中度只涵盖已有报价部位，但提醒仍涵盖所有活跃持仓。', recentHint: '显示三条近期判断；打开记录查看完整脉络。', singleRecordPrompt: '让这条记录日后更容易回看。', arrangeReview: '安排稍后复盘', firstUseTitle: '记录一个日后可能想回看的判断。', startRecording: '开始记录', firstUseCopy: '可以是观察、疑问，或者暂时未打算执行的交易想法。', exploreTools: '探索工具', firstDiaryPrompt: '尚未记录日记，准备好时就开始一篇。', watchlistHint: '打开追踪中的公司，继续研究记录。', unavailableValue: '暂不可用', asOf: '截至', unknown: '未知', noSummary: '尚未有最新研究记录。', invalidated_thesis_while_held: '持有期间论点失效', overdue_thesis_review: '论点复盘逾期', overdue_diary_review: '日记复盘逾期', position_concentration: '持仓集中度', missing_thesis: '缺少投资论点'
  }
}

type ResourceName = 'attention' | 'reviews' | 'recent' | 'valuation' | 'plans' | 'watchlist'
type ResourceResult = { response: Response; data?: unknown; error?: unknown }
type ResourceState<T> = { data: T | null; error: Failure | null; loading: boolean }

async function requestResource(name: ResourceName, signal: AbortSignal): Promise<ResourceResult> {
  switch (name) {
    case 'attention': return api.GET('/api/portfolio/attention', { signal }) as unknown as ResourceResult
    case 'reviews': return api.GET('/api/reviews', { params: { query: { page: 1, limit: 20 } }, signal }) as unknown as ResourceResult
    case 'recent': return api.GET('/api/diaries/summary', { params: { query: { page: 1, limit: 3, sortBy: 'date-desc' } }, signal }) as unknown as ResourceResult
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

function sourceLabel(value: DiarySummary['createdVia'], c: OverviewCopy) {
  return value === 'API_KEY' ? tx(c, 'sourceApiKey') : value === 'TELEGRAM_BOT' ? tx(c, 'sourceTelegram') : tx(c, 'sourceWeb')
}

function FailureSection({ state, retry, copy, errorId, label }: { state: ResourceState<unknown>; retry: () => void; copy: OverviewCopy; errorId: string; label: string }) {
  if (state.loading) return <p className="overview-status" role="status">{copy.hintLoading}</p>
  if (state.error) return <div className="overview-error" id={errorId}><p className="overview-error-label">{label}</p><FailureNotice failure={state.error} id={`${errorId}-notice`} /><button className="secondary" onClick={retry}>{copy.retry}</button></div>
  return null
}

function PortfolioSection({ state, retry, locale, timezone, c }: { state: ResourceState<z.infer<typeof portfolioValuationResponseSchema>>; retry: () => void; locale: string; timezone: string | null; c: OverviewCopy }) {
  return <section className="overview-section overview-side-section" aria-labelledby="overview-portfolio-title"><header className="overview-section-header"><h2 id="overview-portfolio-title"><Icon name="briefcase" />{c.portfolio}</h2><Link to="/stocks">{c.viewAll}</Link></header><FailureSection state={state} retry={retry} copy={c} errorId="overview-portfolio-error" label={tx(c, 'portfolio')} />
    {state.data && (state.data.valuation.valuationStatus === 'empty' ? <p>{c.emptyPortfolio} <Link to="/diaries/new">{c.firstDiary}</Link></p> : <><p className="overview-meta">{c.quoteSource}</p><dl className="overview-metrics"><div><dt>{c.currentValue}</dt><dd data-testid="overview-current-value">{formatNumber(state.data.valuation.currentMarketValue, locale, tx(c, 'unavailableValue'))}</dd></div><div><dt>{c.coverage}</dt><dd data-testid="overview-quote-coverage">{formatPercent(state.data.valuation.quoteCoveragePct, locale, tx(c, 'unavailableValue'))}</dd></div><div><dt>{c.unpriced}</dt><dd data-testid="overview-unpriced-cost">{formatNumber(state.data.valuation.unpricedCostBasis, locale, tx(c, 'unavailableValue'))}</dd></div></dl>{state.data.valuation.concentrationWarning && <p className="overview-partial" role="status">{c.concentration}</p>}<p className="overview-meta">{c.stale}: {state.data.valuation.staleQuoteCount} · {c.asOf}: {state.data.valuation.valuationAsOf ? formatInstant(state.data.valuation.valuationAsOf, locale, timezone, tx(c, 'unknown')) : c.unavailableValue}</p></>)}
  </section>
}

function WatchlistSection({ state, retry, c }: { state: ResourceState<z.infer<typeof stockWatchlistResponseSchema>>; retry: () => void; c: OverviewCopy }) {
  return <section className="overview-section overview-side-section" aria-labelledby="overview-watchlist-title"><header className="overview-section-header"><h2 id="overview-watchlist-title"><Icon name="star" />{c.watchlist}</h2><Link to="/stocks/watchlist">{c.viewAll}</Link></header><FailureSection state={state} retry={retry} copy={c} errorId="overview-watchlist-error" label={tx(c, 'watchlist')} />
    {state.data?.items.length ? <ul className="overview-watchlist">{state.data.items.slice(0, 3).map(item => <li key={item.id} data-testid="overview-watch-item"><Link to={`/stocks/${encodeURIComponent(item.stock.symbol)}`}><strong>{item.stock.symbol}</strong>{item.stock.name && <span>{item.stock.name}</span>}</Link><small>{item.recordCount} {c.records} · {item.latestRecord?.summary ?? c.noSummary}</small></li>)}</ul> : null}
  </section>
}

function loaded<T>(state: ResourceState<T>): state is ResourceState<T> & { data: T; error: null; loading: false } {
  return !state.loading && !state.error && state.data !== null
}

function rowLabel(row: OverviewAttentionRow, c: OverviewCopy) {
  if (row.reason === 'review') return `${row.reviewBucket === 'overdue' ? c.overdue : c.today} · ${row.targetType === 'thesis' ? c.thesis : c.diary}`
  return c[row.reason]
}

function WorkspaceAttentionSection({ attention, retryAttention, reviews, retryReviews, timezone, locale, c }: {
  attention: ResourceState<z.infer<typeof portfolioAttentionResponseSchema>>
  retryAttention: () => void
  reviews: ResourceState<ReviewGroups>
  retryReviews: () => void
  timezone: string | null
  locale: string
  c: OverviewCopy
}) {
  const rows = buildOverviewAttentionRows(attention.data, reviews.data)
  const attentionReady = loaded(attention)
  const reviewsReady = loaded(reviews)
  if (attentionReady && reviewsReady && !rows.length) return <p className="overview-no-actions" role="status" data-testid="overview-no-current-actions">{c.noCurrentActions}</p>
  return <section className="overview-section" aria-labelledby="overview-attention-title"><header className="overview-section-header"><h2 id="overview-attention-title"><Icon name="bell" />{c.attention}</h2><div className="overview-section-links"><Link to="/reviews">{c.reviewQueue}</Link><Link to="/stocks">{c.portfolio}</Link></div></header>
    <p className="overview-section-intro">{c.followUp}</p>
    <FailureSection state={attention} retry={retryAttention} copy={c} errorId="overview-attention-error" label={tx(c, 'attention')} />
    <FailureSection state={reviews} retry={retryReviews} copy={c} errorId="overview-reviews-error" label={tx(c, 'reviewQueue')} />
    {attention.data && !attention.data.coverage.complete && <p className="overview-partial" role="status">{c.attentionPartial}</p>}
    {rows.length ? <ul className="overview-action-list">{rows.slice(0, 5).map(row => <li key={row.key} data-testid="overview-attention-item" data-overview-priority={row.priority}><div><strong>{rowLabel(row, c)}</strong><span>{row.title}</span>{row.reason === 'position_concentration' && <span>{formatPercent(row.concentrationPct, locale, tx(c, 'unavailable'))}</span>}{row.dueAt && <time dateTime={row.dueAt}>{c.due}: {formatInstant(row.dueAt, locale, timezone, tx(c, 'unknown'))}</time>}</div><Link to={row.href}>{c.open}</Link></li>)}</ul> : null}
  </section>
}

function RecentDiary({ diary, c }: { diary: DiarySummary; c: OverviewCopy }) {
  const status = diary.reviewStatus === 'reviewed' ? c.reviewed : diary.reviewStatus === 'pending' ? c.pendingReview : c.original
  const outcome = diary.reviewOutcome === 'INTACT' ? c.reviewIntact : diary.reviewOutcome === 'PARTIAL' ? c.reviewPartial : diary.reviewOutcome === 'INVALIDATED' ? c.reviewInvalidated : diary.reviewOutcome === 'UNCLEAR' ? c.reviewUnclear : null
  return <li data-testid="overview-recent-item"><time dateTime={diary.date}>{diary.date}</time><div><h3><Link to={`/diaries/${diary.id}`}>{diary.title}</Link></h3><p>{diary.excerpt || c.emptyRecent}</p><span className="overview-meta">{sourceLabel(diary.createdVia, c)} · {status}{outcome ? ` · ${outcome}` : ''}</span></div></li>
}

function WorkspaceRecentSection({ state, retry, c }: { state: ResourceState<z.infer<typeof diarySummaryListResponseSchema>>; retry: () => void; c: OverviewCopy }) {
  if (loaded(state) && !state.data.data.length) return <p className="overview-secondary-prompt" data-testid="overview-first-diary-prompt">{c.firstDiaryPrompt} <Link to="/diaries/new">{c.firstDiary}</Link></p>
  return <section className="overview-section" aria-labelledby="overview-recent-title"><header className="overview-section-header"><h2 id="overview-recent-title"><Icon name="book" />{c.recent}</h2><Link to="/diaries">{c.diaryLibrary}</Link></header>
    <FailureSection state={state} retry={retry} copy={c} errorId="overview-recent-error" label={tx(c, 'recent')} />
    {state.data?.data.length ? <><ol className="overview-recent-list">{state.data.data.slice(0, 3).map(diary => <RecentDiary key={diary.id} diary={diary} c={c} />)}</ol>{state.data.pagination.total === 1 && <p className="overview-secondary-prompt" data-testid="overview-single-record-prompt">{c.singleRecordPrompt} <Link to={`/diaries/${state.data.data[0]!.id}`}>{c.open}</Link> · <Link to={`/diaries/${state.data.data[0]!.id}/edit`}>{c.arrangeReview}</Link></p>}</> : null}
  </section>
}

function FirstUseSection({ c }: { c: OverviewCopy }) {
  return <section className="overview-first-use" data-testid="overview-first-use" aria-labelledby="overview-first-use-title"><h2 id="overview-first-use-title">{c.firstUseTitle}</h2><p>{c.firstUseCopy}</p><div className="overview-first-use-actions"><Link className="button" to="/diaries/quick">{c.startRecording}</Link><Link className="button secondary" to="/tools">{c.exploreTools}</Link></div></section>
}

function DestinationsSection({ c, plans, retryPlans }: { c: OverviewCopy; plans: ResourceState<z.infer<typeof tradePlanListResponseSchema>>; retryPlans: () => void }) {
  return <nav className="overview-destinations" aria-labelledby="overview-destinations-title"><h2 id="overview-destinations-title">{c.destinations}</h2><ul><li><Link to="/trade-plans"><Icon name="clipboard" />{c.plans}</Link>{(plans.loading || plans.error) && <FailureSection state={plans} retry={retryPlans} copy={c} errorId="overview-plans-error" label={tx(c, 'plans')} />}</li><li><Link to="/stocks/watchlist"><Icon name="star" />{c.research}</Link></li><li><Link to="/tools"><Icon name="wrench" />{c.tools}</Link></li></ul></nav>
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
  const [recent, retryRecent] = useResource('recent', diarySummaryListResponseSchema, session.revision, tx(c, 'failed'))
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
  const allResourcesReady = Boolean(timezone && !timezoneError && loaded(attention) && loaded(reviews) && loaded(recent) && loaded(valuation) && loaded(plans) && loaded(watchlist))
  const firstUse = allResourcesReady && isOverviewFirstUse({ attention: attention.data!, reviews: reviews.data!, recent: recent.data!, valuation: valuation.data!, plans: plans.data!, watchlist: watchlist.data! })
  const showPortfolio = valuation.loading || Boolean(valuation.error) || Boolean(valuation.data && valuation.data.valuation.valuationStatus !== 'empty')
  const showWatchlist = watchlist.loading || Boolean(watchlist.error) || Boolean(watchlist.data?.items.length)
  return <section className="overview-page" aria-labelledby="overview-title"><header className="overview-header"><div><div className="overview-date-row"><p className="overview-date" role="status">{accountDate ?? (timezoneError ? c.timezoneFailed : c.timezoneLoading)}</p>{timezoneError && <button type="button" className="secondary overview-retry" onClick={() => setTimezoneAttempt(value => value + 1)}>{c.retry}</button>}</div><h1 id="overview-title">{c.title}</h1><p className="lede">{c.hint}</p></div>{!firstUse && <Link className="button" to="/diaries/quick"><Icon name="zap" />{c.quick}</Link>}</header>{firstUse ? <FirstUseSection c={c} /> : <><WorkspaceAttentionSection attention={attention} retryAttention={retryAttention} reviews={reviews} retryReviews={retryReviews} timezone={timezone} locale={locale} c={c}/><WorkspaceRecentSection state={recent} retry={retryRecent} c={c}/><div className="overview-context-grid">{showPortfolio && <PortfolioSection state={valuation} retry={retryValuation} locale={locale} timezone={timezone} c={c}/>} {showWatchlist && <WatchlistSection state={watchlist} retry={retryWatchlist} c={c}/>}</div><DestinationsSection c={c} plans={plans} retryPlans={retryPlans}/></>}</section>
}
