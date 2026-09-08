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
  en: { title: 'Review queue', hint: 'Return to earlier decisions and compare them with what you know now.', overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', unscheduled: 'Unscheduled', completed: 'Completed', diary: 'Diary', thesis: 'Investment thesis', diaries: 'Diaries', theses: 'Investment theses', all: 'All', filter: 'Filter by type', empty: 'No items on this page.', emptyOverdue: 'Nothing overdue.', emptyToday: 'Nothing due today.', emptyUpcoming: 'Nothing scheduled next.', emptyAll: 'Nothing waiting for review right now.', library: 'Diary library', previous: 'Previous page', next: 'Next page', page: 'Page', date: 'Review date', more: 'Other — unscheduled and completed', stateNone: 'No review due', statePending: 'Review pending', stateReviewed: 'Reviewed', dueToday: 'Due today', overdueOne: '1 day overdue', overdueDays: '{n} days overdue', dueInOne: 'Due in 1 day', dueInDays: 'Due in {n} days', reviewDiary: 'Review diary', reviewThesis: 'Review thesis' },
  'zh-TW': { title: '複盤隊列', hint: '回看過往決策，對照目前掌握的資料。', overdue: '逾期', today: '今天', upcoming: '即將到期', unscheduled: '未排程', completed: '已完成', diary: '日記', thesis: '投資論點', diaries: '日記', theses: '投資論點', all: '全部', filter: '依類型篩選', empty: '這頁沒有項目。', emptyOverdue: '沒有逾期項目。', emptyToday: '今天沒有到期複盤。', emptyUpcoming: '接下來沒有排定複盤。', emptyAll: '目前沒有待複盤的項目。', library: '日記庫', previous: '上一頁', next: '下一頁', page: '頁', date: '複盤日期', more: '其他 — 未排程與已完成', stateNone: '未安排複盤', statePending: '待複盤', stateReviewed: '已複盤', dueToday: '今天到期', overdueOne: '逾期 1 天', overdueDays: '逾期 {n} 天', dueInOne: '1 天後到期', dueInDays: '{n} 天後到期', reviewDiary: '複盤日記', reviewThesis: '複盤論點' },
  'zh-CN': { title: '复盘队列', hint: '回看过往决策，对照目前掌握的资料。', overdue: '逾期', today: '今天', upcoming: '即将到期', unscheduled: '未排程', completed: '已完成', diary: '日记', thesis: '投资论点', diaries: '日记', theses: '投资论点', all: '全部', filter: '按类型筛选', empty: '这页没有项目。', emptyOverdue: '没有逾期项目。', emptyToday: '今天没有到期复盘。', emptyUpcoming: '接下来没有排定复盘。', emptyAll: '目前没有待复盘的项目。', library: '日记库', previous: '上一页', next: '下一页', page: '页', date: '复盘日期', more: '其他 — 未排程与已完成', stateNone: '未安排复盘', statePending: '待复盘', stateReviewed: '已复盘', dueToday: '今天到期', overdueOne: '逾期 1 天', overdueDays: '逾期 {n} 天', dueInOne: '1 天后到期', dueInDays: '{n} 天后到期', reviewDiary: '复盘日记', reviewThesis: '复盘论点' },
};
export default function Reviews() {
  const { locale, t } = useUi(), c = copy[locale], [params, setParams] = useSearchParams();
  const [data, setData] = useState<ReviewGroups | null>(null), [error, setError] = useState<Failure | null>(null), [attempt, retry] = useState(0), [timezone, setTimezone] = useState('UTC');
  const labels = thesisCopy[locale];
  const label = (value: string) => Object.hasOwn(labels, value) ? labels[value as keyof typeof labels] : value;
  const translate = useRef(t); translate.current = t;
  const query = params.toString(), parsed = reviewQueueQuerySchema.safeParse({ page: params.get('page') ?? '1', limit: 20, target: params.get('target') ?? undefined }), page = parsed.success ? parsed.data.page : 1;
  const resultsHeading = useRef<HTMLHeadingElement>(null), focusResults = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    const raw = new URLSearchParams(query);
    const parsed = reviewQueueQuerySchema.safeParse({ page: raw.get('page') ?? '1', limit: 20, target: raw.get('target') ?? undefined });
    if (!parsed.success) { setError({ message: translate.current('failed'), code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
    Promise.all([api.GET('/api/reviews', { params: { query: parsed.data }, signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
      if (controller.signal.aborted) return;
      const value = reviewGroupsResponseSchema.safeParse(result.data);
      if (!value.success || !user.response.ok || !user.data) { setError(apiFailure(result.error ?? user.error, translate.current('failed'))); return; }
      setData(value.data); setTimezone(user.data.data.timezone);
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
    return () => controller.abort();
  }, [query, attempt]);
  // One focus move per explicit page/filter change, onto the results heading.
  useEffect(() => { if (data && focusResults.current) { resultsHeading.current?.focus(); focusResults.current = false; } }, [data]);
  const turn = (next: number) => { const updated = new URLSearchParams(params); updated.set('page', String(next)); focusResults.current = true; setParams(updated); };
  const filterTo = (target: string) => { const updated = new URLSearchParams(params); if (target) updated.set('target', target); else updated.delete('target'); updated.delete('page'); return `/reviews${updated.toString() ? `?${updated}` : ''}`; };
  const stateLabel = (status: ReviewItem['reviewStatus']) => status === 'reviewed' ? c.stateReviewed : status === 'pending' ? c.statePending : c.stateNone;
  const dueText = (days: number) => days === 0 ? c.dueToday : days < 0 ? days === -1 ? c.overdueOne : c.overdueDays.replace('{n}', String(-days)) : days === 1 ? c.dueInOne : c.dueInDays.replace('{n}', String(days));
  const dueClass = (days: number) => days < 0 ? 'queue-due-overdue' : days === 0 ? 'queue-due-today' : 'queue-due-upcoming';
  const renderItem = (item: ReviewItem) => {
    const due = item.reviewDueAt && item.reviewStatus !== 'reviewed' ? accountDayDiff(item.reviewDueAt, new Date(), timezone) : null;
    return <li key={item.id} data-testid="review-queue-item" className="queue-item">
      <header className="plan-header"><h3><Link to={item.targetType === 'diary' ? `/diaries/${item.id}/review` : `/stocks/${encodeURIComponent(item.symbol ?? '')}/thesis`} state={{ queueSearch: query }}><span className="queue-sr">{item.targetType === 'diary' ? `${c.reviewDiary}: ` : `${c.reviewThesis}: `}</span>{item.targetType === 'thesis' ? `${item.symbol} · ${c.thesis}` : item.title}</Link></h3><span className="queue-badge">{c[item.targetType]}</span></header>
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
  // Short muted line per empty bucket; unscheduled/completed share the plain one.
  const emptyLine = { overdue: c.emptyOverdue, today: c.emptyToday, upcoming: c.emptyUpcoming, unscheduled: c.empty, completed: c.empty } as const;
  const group = (bucket: Bucket, level: 'h2' | 'h3') => {
    if (data === null) return null;
    const Heading = level;
    return <section className="queue-group" id={`queue-${bucket}`} key={bucket} aria-label={c[bucket]}><Heading>{c[bucket]}</Heading>{data[bucket].length ? <ul className="plan-list">{data[bucket].map(renderItem)}</ul> : <p className="queue-empty-line">{emptyLine[bucket]}</p>}</section>;
  };
  // Secondary buckets stay collapsed unless there is nothing urgent to review.
  const showSecondary = data !== null && priorityBuckets.every(bucket => data.counts[bucket] === 0) && data.unscheduled.length > 0;
  const emptyQueue = data !== null && page === 1 && buckets.every(bucket => data.counts[bucket] === 0);
  return <section className="plan-page"><h1>{c.title}</h1><p className="lede">{c.hint}</p>{error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/reviews')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <><nav className="queue-filter" aria-label={c.filter}>{([['', c.all], ['diary', c.diaries], ['thesis', c.theses]] as const).map(([value, name]) => <Link key={value} to={filterTo(value)} aria-current={(params.get('target') ?? '') === value ? 'true' : undefined} onClick={() => { if ((params.get('target') ?? '') !== value) focusResults.current = true; }}>{name}</Link>)}</nav><div className="queue-priorities">{priorityBuckets.map(bucket => <a key={bucket} className={`queue-priority queue-priority-${bucket}`} href={`#queue-${bucket}`} data-testid={`queue-count-${bucket}`}><strong>{data.counts[bucket]}</strong> {c[bucket]}</a>)}</div>{emptyQueue && <div className="queue-empty" data-testid="queue-empty"><p>{c.emptyAll}</p><div className="actions"><Link className="button" to="/diaries/new">{t('write')}</Link><Link className="button secondary" to="/diaries">{c.library}</Link></div></div>}<nav className="plan-pagination" aria-label={c.title}><button disabled={page <= 1} onClick={() => turn(page - 1)}>{c.previous}</button><span>{c.page} {page}</span><button disabled={!buckets.some(bucket => data.counts[bucket] > page * 20)} onClick={() => turn(page + 1)}>{c.next}</button></nav><section className="queue-attention"><h2 ref={resultsHeading} tabIndex={-1}>{t('attention')}</h2>{group('overdue', 'h3')}{group('today', 'h3')}</section>{group('upcoming', 'h2')}<details className="queue-secondary" data-testid="queue-secondary" open={showSecondary || undefined}><summary>{c.more}</summary>{secondaryBuckets.map(bucket => group(bucket, 'h2'))}</details></>}</section>;
}
