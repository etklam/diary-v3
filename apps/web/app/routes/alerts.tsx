import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { alertCreateRequestSchema, alertListResponseSchema, type AlertResponse } from '@diary/contracts/alerts';
import { diarySummaryListResponseSchema, type DiarySummary } from '@diary/contracts/diary-summary';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath } from '../session';
import { reminderCopy, type ReminderDraft } from '../alert-fields';
import { changeInstantLocalValue, localTradeChoices, resolveLocalTradeInstant } from '../trade-time';
import '../trade-plan.css';
import '../alerts.css';
import { deviceTimeZone, formatDay, formatInstantIn } from '../market-display';
const copy = {
  en: { title: 'Diary reminders', hint: 'Return to a decision when it needs your attention.', scope: 'The earliest 100 active reminders, including overdue reminders.', empty: 'No active reminders.', open: 'Open diary', dismiss: 'Dismiss reminder', series: 'Dismiss entire series', week: 'Weekday series', month: 'Monthly weekday series', paused: 'Paused', timezone: 'Times shown in', done: 'Reminder dismissed.', rootHint: 'Dismissing the first occurrence also dismisses the remaining series.', write: 'Write a diary', create: 'Set a reminder', diary: 'Diary', listTitle: 'Active reminders', overdue: 'Overdue', created: 'Reminder added.', invalid: 'Check the diary, message and reminder time. Choose a UTC instant when the clock repeats.', noOccurrence: 'That repeat produced no reminder. Choose an earlier start date.', noDiaries: 'A reminder belongs to a diary. Write one first, then set a reminder on it.' },
  'zh-TW': { title: '日記提醒', hint: '在需要的時候，回頭檢視你的決策。', scope: '顯示最早的 100 筆有效提醒，包括已到期提醒。', empty: '目前沒有有效提醒。', open: '開啟日記', dismiss: '取消這次提醒', series: '取消整組提醒', week: '本週工作日提醒', month: '本月工作日提醒', paused: '已暫停', timezone: '時間顯示時區', done: '已取消提醒。', rootHint: '取消首筆提醒會同時取消整組剩餘提醒。', write: '寫日記', create: '設定提醒', diary: '日記', listTitle: '有效提醒', overdue: '已到期', created: '已新增提醒。', invalid: '請檢查日記、訊息及提醒時間；時鐘重複時選擇 UTC 時刻。', noOccurrence: '這個重複設定沒有產生提醒，請選擇較早的開始日期。', noDiaries: '提醒會附在日記上。先寫一篇日記，再為它設定提醒。' },
  'zh-CN': { title: '日记提醒', hint: '在需要的时候，回头检视你的决策。', scope: '显示最早的 100 条有效提醒，包括已到期提醒。', empty: '目前没有有效提醒。', open: '打开日记', dismiss: '取消这次提醒', series: '取消整组提醒', week: '本周工作日提醒', month: '本月工作日提醒', paused: '已暂停', timezone: '时间显示时区', done: '已取消提醒。', rootHint: '取消首条提醒会同时取消整组剩余提醒。', write: '写日记', create: '设置提醒', diary: '日记', listTitle: '有效提醒', overdue: '已到期', created: '已新增提醒。', invalid: '请检查日记、消息及提醒时间；时钟重复时选择 UTC 时刻。', noOccurrence: '这个重复设置没有生成提醒，请选择较早的开始日期。', noDiaries: '提醒会附在日记上。先写一篇日记，再为它设置提醒。' },
};
export default function Alerts() {
  const { locale, t } = useUi(), c = copy[locale], rc = reminderCopy[locale];
  const [rows, setRows] = useState<AlertResponse[] | null>(null), [timezone, setTimezone] = useState('UTC'), [asOf, setAsOf] = useState(() => Date.now());
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null), [diaryError, setDiaryError] = useState<Failure | null>(null);
  const [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null);
  const [attempt, retry] = useState(0), [diaryAttempt, retryDiaries] = useState(0), [pending, setPending] = useState<string | null>(null), [done, setDone] = useState(false), [created, setCreated] = useState(false);
  // One reminder being composed: the diary it belongs to, its message, and the
  // same local-time plus explicit-instant pair the editor uses, so a repeated
  // clock hour is resolved here exactly as it is there.
  const [draft, setDraft] = useState<Omit<ReminderDraft, 'key'> & { diaryId: string }>({ diaryId: '', message: '', time: '', instant: '', mode: '' });
  const translate = useRef(t); translate.current = t;
  const mutation = useRef<AbortController | null>(null), diarySelect = useRef<HTMLSelectElement>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); setRows(null); setError(null);
    Promise.all([api.GET('/api/alerts', { signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
      if (controller.signal.aborted) return;
      const parsed = alertListResponseSchema.safeParse(result.data);
      if (!result.response.ok || !parsed.success || !user.data) { setError(apiFailure(result.error ?? user.error, translate.current('failed'))); return; }
      setRows(parsed.data); setTimezone(user.data.data.timezone); setAsOf(Date.now());
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))) });
    return () => controller.abort();
  }, [attempt]);
  // The create form needs a diary to attach to, which the reminder list does
  // not carry; the summary projection keeps diary bodies out of this page.
  useEffect(() => {
    const controller = new AbortController(); setDiaries(null); setDiaryError(null);
    api.GET('/api/diaries/summary', { params: { query: { page: 1, limit: 50, sortBy: 'date-desc' } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = diarySummaryListResponseSchema.safeParse(result.data);
      if (!result.response.ok || !parsed.success) { setDiaryError(apiFailure(result.error, translate.current('failed'))); return; }
      setDiaries(parsed.data.data);
    }).catch(() => { if (!controller.signal.aborted) setDiaryError(apiFailure(null, translate.current('connection'))) });
    return () => controller.abort();
  }, [diaryAttempt]);
  async function dismiss(id: string) {
    if (pending) return;
    const controller = new AbortController(); mutation.current = controller;
    setPending(id); setWriteError(null); setDone(false); setCreated(false);
    try {
      const result = await api.PUT('/api/alerts/{id}/dismiss', { params: { path: { id } }, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return; }
      window.dispatchEvent(new Event('diary-reminders-changed')); setDone(true); retry(value => value + 1);
    } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))) }
    finally { if (!controller.signal.aborted) setPending(null) }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const body = alertCreateRequestSchema.safeParse({ diaryId: draft.diaryId, message: draft.message, triggerAt: resolveLocalTradeInstant(draft.time, draft.instant) ?? '', ...(draft.mode ? { recurringMode: draft.mode } : {}) });
    if (!body.success) { setWriteError({ message: c.invalid, fields: [] }); return; }
    const controller = new AbortController(); mutation.current = controller;
    setPending('create'); setWriteError(null); setDone(false); setCreated(false);
    try {
      const result = await api.POST('/api/alerts', { body: body.data, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return; }
      // A recurring start with no remaining weekday answers 200 with an empty
      // body: nothing was written, so this must not report success.
      if (result.data === null) { setWriteError({ message: c.noOccurrence, fields: [] }); return; }
      setDraft(current => ({ ...current, message: '', time: '', instant: '', mode: '' }));
      window.dispatchEvent(new Event('diary-reminders-changed')); setCreated(true); retry(value => value + 1);
    } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))) }
    finally { if (!controller.signal.aborted) setPending(null) }
  }
  const choices = localTradeChoices(draft.time, draft.instant);
  const hasSeries = rows?.some(row => row.recurringMode !== null && row.instanceNumber === 1 && (row.parentId === null || row.parentId === row.id)) ?? false;
  return <section className="plan-page reminders-page"><h1>{c.title}</h1><p className="lede">{c.hint}</p>
    {error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/alerts')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : <>
      <section className="panel reminder-create" aria-labelledby="reminder-create-title">
        <div className="section-head"><h2 id="reminder-create-title">{c.create}</h2></div>
        {diaryError ? <><FailureNotice failure={diaryError}/><button className="secondary" onClick={() => retryDiaries(value => value + 1)}>{t('retry')}</button></>
          : !diaries ? <p role="status">{t('loading')}</p>
            : !diaries.length ? <div className="empty-state"><p>{c.noDiaries}</p><Link className="button secondary" to="/diaries/new">{c.write}</Link></div>
              : <form className="plan-form" onSubmit={create}><fieldset disabled={pending !== null}><legend className="sr-only">{c.create}</legend><div className="plan-grid">
                <label>{c.diary}<select ref={diarySelect} aria-label={c.diary} required value={draft.diaryId} onChange={event => setDraft(current => ({ ...current, diaryId: event.target.value }))}><option value="">—</option>{diaries.map(diary => <option key={diary.id} value={diary.id}>{formatDay(diary.date)} · {diary.title}</option>)}</select></label>
                <label>{rc.time}<input aria-label={rc.time} type="datetime-local" required value={draft.time} onChange={event => { const edit = changeInstantLocalValue({ value: draft.time, instant: draft.instant }, event.target.value); setDraft(current => ({ ...current, time: edit.value, instant: edit.instant })); }}/></label>
                {choices.length > 1 && <label>UTC<select aria-label="UTC" required value={draft.instant} onChange={event => setDraft(current => ({ ...current, instant: event.target.value }))}><option value="">—</option>{choices.map(instant => <option key={instant}>{instant}</option>)}</select></label>}
                <label>{rc.mode}<select aria-label={rc.mode} value={draft.mode} onChange={event => setDraft(current => ({ ...current, mode: event.target.value as ReminderDraft['mode'] }))}><option value="">{rc.once}</option><option value="WEEK">{rc.week}</option><option value="MONTH">{rc.month}</option></select></label>
                <label className="plan-wide">{rc.message}<textarea aria-label={rc.message} rows={2} required maxLength={500} value={draft.message} onChange={event => setDraft(current => ({ ...current, message: event.target.value }))}/></label>
              </div><p className="muted">{rc.device} {deviceTimeZone()}</p>{draft.mode && <p className="muted">{rc.recurrence}</p>}<div className="actions"><button type="submit">{pending === 'create' ? t('pending') : rc.add}</button></div></fieldset></form>}
      </section>
      {created && <p role="status">{c.created}</p>}{done && <p role="status">{c.done}</p>}{writeError && <FailureNotice failure={writeError}/>}
      <section className="panel reminder-list" aria-labelledby="reminder-list-title">
        <div className="section-head"><h2 id="reminder-list-title">{c.listTitle}{rows ? ` (${rows.length})` : ''}</h2></div>
        {!rows ? <p role="status">{t('loading')}</p> : !rows.length
          ? <div className="empty-state"><p>{c.empty}</p>{diaries?.length
            ? <button type="button" className="secondary" onClick={() => { diarySelect.current?.scrollIntoView({ block: 'center', behavior: 'auto' }); diarySelect.current?.focus(); }}>{c.create}</button>
            : <Link className="button secondary" to="/diaries/new">{c.write}</Link>}</div>
          : <><p className="muted">{c.scope}</p><p className="muted">{c.timezone}: {timezone}</p>{hasSeries && <p className="muted">{c.rootHint}</p>}<ol className="plan-list">{rows.map(row => {
            const root = row.recurringMode !== null && row.instanceNumber === 1 && (row.parentId === null || row.parentId === row.id);
            // Overdue is stated in words as well as position: the lede promises
            // the list carries overdue reminders, so the distinction cannot rest
            // on the row simply sorting first.
            const overdue = Date.parse(row.triggerAt) <= asOf;
            return <li key={row.id} data-testid="diary-reminder" data-overdue={overdue ? 'true' : undefined}><div className="reminder-meta"><time dateTime={row.triggerAt}>{formatInstantIn(locale, row.triggerAt, timezone)}</time>{overdue && <span className="badge badge-warn">{c.overdue}</span>}{row.recurringMode && <span className="badge">{row.recurringMode === 'WEEK' ? c.week : c.month} · {row.instanceNumber}{row.isPaused ? ` · ${c.paused}` : ''}</span>}</div><h3>{row.message}</h3><div className="plan-header"><Link to={`/diaries/${row.diaryId}`}>{row.diary?.title ?? c.open}</Link><button className="quiet-button" disabled={pending !== null} onClick={() => void dismiss(row.id)}>{pending === row.id ? t('pending') : root ? c.series : c.dismiss}</button></div></li>;
          })}</ol></>}
      </section>
    </>}
  </section>;
}
