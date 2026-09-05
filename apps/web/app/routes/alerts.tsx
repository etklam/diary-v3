import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { alertListResponseSchema, type AlertResponse } from '@diary/contracts/alerts';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath } from '../session';
import '../trade-plan.css';
import '../alerts.css';
const copy = {
  en: { title: 'Diary reminders', hint: 'Return to a decision when it needs your attention.', scope: 'The earliest 100 active reminders, including overdue reminders.', empty: 'No active reminders.', open: 'Open diary', dismiss: 'Dismiss reminder', series: 'Dismiss entire series', week: 'Weekday series', month: 'Monthly weekday series', paused: 'Paused', timezone: 'Times shown in', done: 'Reminder dismissed.', rootHint: 'Dismissing the first occurrence also dismisses the remaining series.', write: 'Write a diary' },
  'zh-TW': { title: '日記提醒', hint: '在需要的時候，回頭檢視你的決策。', scope: '顯示最早的 100 筆有效提醒，包括已到期提醒。', empty: '目前沒有有效提醒。', open: '開啟日記', dismiss: '取消這次提醒', series: '取消整組提醒', week: '本週工作日提醒', month: '本月工作日提醒', paused: '已暫停', timezone: '時間顯示時區', done: '已取消提醒。', rootHint: '取消首筆提醒會同時取消整組剩餘提醒。', write: '寫日記' },
  'zh-CN': { title: '日记提醒', hint: '在需要的时候，回头检视你的决策。', scope: '显示最早的 100 条有效提醒，包括已到期提醒。', empty: '目前没有有效提醒。', open: '打开日记', dismiss: '取消这次提醒', series: '取消整组提醒', week: '本周工作日提醒', month: '本月工作日提醒', paused: '已暂停', timezone: '时间显示时区', done: '已取消提醒。', rootHint: '取消首条提醒会同时取消整组剩余提醒。', write: '写日记' },
};
export default function Alerts() {
  const { locale, t } = useUi(), c = copy[locale];
  const [rows, setRows] = useState<AlertResponse[] | null>(null), [timezone, setTimezone] = useState('UTC');
  const [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null);
  const [attempt, retry] = useState(0), [pending, setPending] = useState<string | null>(null), [done, setDone] = useState(false);
  const translate = useRef(t); translate.current = t;
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); setRows(null); setError(null);
    Promise.all([api.GET('/api/alerts', { signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
      if (controller.signal.aborted) return;
      const parsed = alertListResponseSchema.safeParse(result.data);
      if (!result.response.ok || !parsed.success || !user.data) { setError(apiFailure(result.error ?? user.error, translate.current('failed'))); return; }
      setRows(parsed.data); setTimezone(user.data.data.timezone);
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
    return () => controller.abort();
  }, [attempt]);
  async function dismiss(id: string) {
    if (pending) return;
    const controller = new AbortController(); mutation.current = controller;
    setPending(id); setWriteError(null); setDone(false);
    try {
      const result = await api.PUT('/api/alerts/{id}/dismiss', { params: { path: { id } }, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return; }
      window.dispatchEvent(new Event('diary-reminders-changed')); setDone(true); retry(value => value + 1);
    } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))); }
    finally { if (!controller.signal.aborted) setPending(null); }
  }
  return <section className="plan-page reminders-page"><h1>{c.title}</h1><p className="lede">{c.hint}</p><p>{c.scope}</p>
    {done && <p role="status">{c.done}</p>}{writeError && <FailureNotice failure={writeError}/>}
    {error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/alerts')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !rows ? <p role="status">{t('loading')}</p> : <>
      <p className="muted">{c.timezone}: {timezone}</p>{rows.length === 0 ? <><p>{c.empty}</p><Link to="/diaries/new">{c.write}</Link></> : <><p>{c.rootHint}</p><ol className="plan-list">{rows.map(row => {
        const root = row.recurringMode !== null && row.instanceNumber === 1 && (row.parentId === null || row.parentId === row.id);
        return <li key={row.id} data-testid="diary-reminder"><time dateTime={row.triggerAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(row.triggerAt))}</time><h2>{row.message}</h2>{row.recurringMode && <p>{row.recurringMode === 'WEEK' ? c.week : c.month} · {row.instanceNumber}{row.isPaused ? ` · ${c.paused}` : ''}</p>}<div className="plan-header"><Link to={`/diaries/${row.diaryId}`}>{row.diary?.title ?? c.open}</Link><button className="secondary" disabled={pending !== null} onClick={() => void dismiss(row.id)}>{pending === row.id ? t('pending') : root ? c.series : c.dismiss}</button></div></li>;
      })}</ol></>}
    </>}
  </section>;
}
