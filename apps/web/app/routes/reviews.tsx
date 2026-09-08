import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { reviewGroupsResponseSchema, reviewQueueQuerySchema, type ReviewGroups, type ReviewItem } from '@diary/contracts/review-queue';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { thesisCopy } from '../thesis-copy';
import { signInPath } from '../session';
import '../trade-plan.css';
import '../review-queue.css';
const buckets = ['overdue', 'today', 'upcoming', 'unscheduled', 'completed'] as const;
type Bucket = (typeof buckets)[number];
const priorityBuckets = ['overdue', 'today', 'upcoming'] as const, secondaryBuckets = ['unscheduled', 'completed'] as const;
// Day difference between an instant and now counted in account-local calendar
// days, so the text matches the bucket classification instead of UTC days.
const dayKey = (timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
export function accountDayDiff(instant: string, now: Date, timezone: string): number {
  const day = (date: Date) => {
    const parts = dayKey(timezone).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)!.value);
    return Date.UTC(value('year'), value('month') - 1, value('day'));
  };
  return (day(new Date(instant)) - day(now)) / 86400000;
}
const copy = {
  en: { title: 'Review queue', hint: 'Return to earlier decisions and compare them with what you know now.', overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', unscheduled: 'Unscheduled', completed: 'Completed', diary: 'Diary', thesis: 'Investment thesis', empty: 'No items on this page.', previous: 'Previous page', next: 'Next page', page: 'Page', date: 'Review date', scope: 'Each page shows up to 20 items per group. Completed diaries show the latest 50; active theses include up to 100.', more: 'Unscheduled and completed', stateNone: 'No review due', statePending: 'Review pending', stateReviewed: 'Reviewed', dueToday: 'Due today', overdueOne: '1 day overdue', overdueDays: '{n} days overdue', dueInOne: 'Due in 1 day', dueInDays: 'Due in {n} days' },
  'zh-TW': { title: '複盤隊列', hint: '回看過往決策，對照目前掌握的資料。', overdue: '逾期', today: '今天', upcoming: '即將到期', unscheduled: '未排程', completed: '已完成', diary: '日記', thesis: '投資論點', empty: '這頁沒有項目。', previous: '上一頁', next: '下一頁', page: '頁', date: '複盤日期', scope: '每頁每組最多 20 筆。已完成日記顯示最近 50 筆，啟用論點最多 100 筆。', more: '未排程與已完成', stateNone: '未安排複盤', statePending: '待複盤', stateReviewed: '已複盤', dueToday: '今天到期', overdueOne: '逾期 1 天', overdueDays: '逾期 {n} 天', dueInOne: '1 天後到期', dueInDays: '{n} 天後到期' },
  'zh-CN': { title: '复盘队列', hint: '回看过往决策，对照目前掌握的资料。', overdue: '逾期', today: '今天', upcoming: '即将到期', unscheduled: '未排程', completed: '已完成', diary: '日记', thesis: '投资论点', empty: '这页没有项目。', previous: '上一页', next: '下一页', page: '页', date: '复盘日期', scope: '每页每组最多 20 笔。已完成日记显示最近 50 笔，启用论点最多 100 笔。', more: '未排程与已完成', stateNone: '未安排复盘', statePending: '待复盘', stateReviewed: '已复盘', dueToday: '今天到期', overdueOne: '逾期 1 天', overdueDays: '逾期 {n} 天', dueInOne: '1 天后到期', dueInDays: '{n} 天后到期' },
};
export default function Reviews() {
  const { locale, t } = useUi(), c = copy[locale], [params, setParams] = useSearchParams();
  const [data, setData] = useState<ReviewGroups | null>(null), [error, setError] = useState<Failure | null>(null), [attempt, retry] = useState(0), [timezone, setTimezone] = useState('UTC');
  const labels = thesisCopy[locale];
  const label = (value: string) => Object.hasOwn(labels, value) ? labels[value as keyof typeof labels] : value;
  const translate = useRef(t); translate.current = t;
  const query = params.toString(), parsed = reviewQueueQuerySchema.safeParse({ page: params.get('page') ?? '1', limit: 20 }), page = parsed.success ? parsed.data.page : 1;
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    const parsed = reviewQueueQuerySchema.safeParse({ page: new URLSearchParams(query).get('page') ?? '1', limit: 20 });
    if (!parsed.success) { setError({ message: translate.current('failed'), code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
    Promise.all([api.GET('/api/reviews', { params: { query: parsed.data }, signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
      if (controller.signal.aborted) return;
      const value = reviewGroupsResponseSchema.safeParse(result.data);
      if (!value.success || !user.response.ok || !user.data) { setError(apiFailure(result.error ?? user.error, translate.current('failed'))); return; }
      setData(value.data); setTimezone(user.data.data.timezone);
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
    return () => controller.abort();
  }, [query, attempt]);
  const stateLabel = (status: ReviewItem['reviewStatus']) => status === 'reviewed' ? c.stateReviewed : status === 'pending' ? c.statePending : c.stateNone;
  const dueText = (days: number) => days === 0 ? c.dueToday : days < 0 ? days === -1 ? c.overdueOne : c.overdueDays.replace('{n}', String(-days)) : days === 1 ? c.dueInOne : c.dueInDays.replace('{n}', String(days));
  const dueClass = (days: number) => days < 0 ? 'queue-due-overdue' : days === 0 ? 'queue-due-today' : 'queue-due-upcoming';
  const renderItem = (item: ReviewItem) => {
    const due = item.reviewDueAt && item.reviewStatus !== 'reviewed' ? accountDayDiff(item.reviewDueAt, new Date(), timezone) : null;
    return <li key={item.id} data-testid="review-queue-item" className="queue-item">
      <header className="plan-header"><h3><Link to={item.targetType === 'diary' ? `/diaries/${item.id}/review` : `/stocks/${encodeURIComponent(item.symbol ?? '')}/thesis`}>{item.targetType === 'thesis' ? `${item.symbol} · ${c.thesis}` : item.title}</Link></h3><span className="queue-badge">{c[item.targetType]}</span></header>
      <p className="queue-meta">
        {item.targetType === 'diary' && <time dateTime={item.date}>{item.date}</time>}
        {item.reviewDueAt && <span>{c.date}: <time dateTime={item.reviewDueAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(item.reviewDueAt))} · {timezone}</time></span>}
        {due !== null && <span className={`queue-due ${dueClass(due)}`}>{dueText(due)}</span>}
        <span>{item.reviewOutcome ? `${labels.outcome}: ${label(item.reviewOutcome)}` : stateLabel(item.reviewStatus)}</span>
        {item.targetType === 'thesis' && item.portfolioDecision && <span>{labels.portfolioDecision}: {label(item.portfolioDecision)}</span>}
      </p>
      {item.targetType === 'diary' && item.stockSymbols.length > 0 && <ul className="queue-symbols">{item.stockSymbols.map(symbol => <li key={symbol}>{symbol}</li>)}</ul>}
      {item.thesis && <p className="queue-summary queue-clamp">{item.thesis}</p>}
    </li>;
  };
  const group = (bucket: Bucket) => data !== null && <section className="queue-group" id={`queue-${bucket}`} key={bucket} aria-label={c[bucket]}><h2>{c[bucket]}</h2>{!data[bucket].length ? <p>{c.empty}</p> : <ul className="plan-list">{data[bucket].map(renderItem)}</ul>}</section>;
  // Secondary buckets stay collapsed unless there is nothing urgent to review.
  const showSecondary = data !== null && priorityBuckets.every(bucket => data.counts[bucket] === 0) && data.unscheduled.length > 0;
  return <section className="plan-page"><h1>{c.title}</h1><p className="lede">{c.hint}</p><p>{c.scope}</p>{error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/reviews')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <><div className="queue-priorities">{priorityBuckets.map(bucket => <a key={bucket} className={`queue-priority queue-priority-${bucket}`} href={`#queue-${bucket}`} data-testid={`queue-count-${bucket}`}><strong>{data.counts[bucket]}</strong> {c[bucket]}</a>)}</div><nav className="plan-pagination" aria-label={c.title}><button disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>{c.previous}</button><span>{c.page} {page}</span><button disabled={!buckets.some(bucket => data.counts[bucket] > page * 20)} onClick={() => setParams({ page: String(page + 1) })}>{c.next}</button></nav>{priorityBuckets.map(bucket => group(bucket))}<details className="queue-secondary" data-testid="queue-secondary" open={showSecondary || undefined}><summary>{c.more}</summary>{secondaryBuckets.map(bucket => group(bucket))}</details></>}</section>;
}
