import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { reviewGroupsResponseSchema, reviewQueueQuerySchema, type ReviewGroups } from '@diary/contracts/review-queue';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { thesisCopy } from '../thesis-copy';
import { signInPath } from '../session';
import '../trade-plan.css';
import '../review-queue.css';
const buckets = ['overdue', 'today', 'upcoming', 'unscheduled', 'completed'] as const;
const copy = {
  en: { title: 'Review queue', hint: 'Return to earlier decisions and compare them with what you know now.', overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', unscheduled: 'Unscheduled', completed: 'Completed', diary: 'Diary', thesis: 'Investment thesis', empty: 'No items on this page.', previous: 'Previous page', next: 'Next page', page: 'Page', date: 'Review date', open: 'Open review', scope: 'Each page shows up to 20 items per group. Completed diaries show the latest 50; active theses include up to 100.' },
  'zh-TW': { title: '複盤隊列', hint: '回看過往決策，對照目前掌握的資料。', overdue: '逾期', today: '今天', upcoming: '即將到期', unscheduled: '未排程', completed: '已完成', diary: '日記', thesis: '投資論點', empty: '這頁沒有項目。', previous: '上一頁', next: '下一頁', page: '頁', date: '複盤日期', open: '開啟複盤', scope: '每頁每組最多 20 筆。已完成日記顯示最近 50 筆，啟用論點最多 100 筆。' },
  'zh-CN': { title: '复盘队列', hint: '回看过往决策，对照目前掌握的资料。', overdue: '逾期', today: '今天', upcoming: '即将到期', unscheduled: '未排程', completed: '已完成', diary: '日记', thesis: '投资论点', empty: '这页没有项目。', previous: '上一页', next: '下一页', page: '页', date: '复盘日期', open: '打开复盘', scope: '每页每组最多 20 笔。已完成日记显示最近 50 笔，启用论点最多 100 笔。' },
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
  return <section className="plan-page"><h1>{c.title}</h1><p className="lede">{c.hint}</p><p>{c.scope}</p>{error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/reviews')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <><nav className="plan-pagination" aria-label={c.title}><button disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>{c.previous}</button><span>{c.page} {page}</span><button disabled={!buckets.some(bucket => data[bucket].length === 20)} onClick={() => setParams({ page: String(page + 1) })}>{c.next}</button></nav>{buckets.map(bucket => <section className="queue-group" key={bucket} aria-label={c[bucket]}><h2>{c[bucket]}</h2>{!data[bucket].length ? <p>{c.empty}</p> : <ul className="plan-list">{data[bucket].map(item => <li key={item.id} data-testid="review-queue-item"><header className="plan-header"><h3><Link to={item.targetType === 'diary' ? `/diaries/${item.id}/review` : `/stocks/${encodeURIComponent(item.symbol ?? '')}/thesis`}>{item.targetType === 'thesis' ? `${item.symbol} · ${c.thesis}` : item.title}</Link></h3><span>{c[item.targetType]}</span></header>{item.targetType === 'diary' && <p>{t('date')}: <time dateTime={item.date}>{item.date}</time></p>}{item.reviewOutcome && <p>{labels.outcome}: {label(item.reviewOutcome)}</p>}{item.targetType === 'thesis' && item.portfolioDecision && <p>{labels.portfolioDecision}: {label(item.portfolioDecision)}</p>}{item.reviewDueAt && <p>{c.date}: <time dateTime={item.reviewDueAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(item.reviewDueAt))} · {timezone}</time></p>}{item.thesis && <p className="queue-summary">{item.thesis}</p>}{item.risk && <p className="queue-summary">{item.risk}</p>}</li>)}</ul>}</section>)}</>}</section>;
}
