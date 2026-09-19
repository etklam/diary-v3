import { calendarDateInTimezone } from '@diary/domain';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  buildHeatmapWeeks,
  calendarMonthKeys,
  calculateMonthCoverage,
} from '@diary/domain/calendar';
import {
  buildUsEquityClosedDateSet,
  buildUsEquityClosedDateSetForDates,
  getUsEquityCalendarYear,
  isUsEquityCalendarYearSupported,
} from '@diary/domain/us-equity-calendar';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath } from '../session';
import { calendarCopy } from '../calendar-copy';
import '../calendar.css';

type Activity = { date: string; diaryId: string; transactionCount: number; alertCount: number };
type Preferences = { timezone: string; excludeHolidaysInStats: boolean };

const shift = (key: string, days: number) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function Calendar() {
  const { locale, t } = useUi();
  const l = calendarCopy[locale];
  const navigate = useNavigate();
  const grid = useRef<HTMLDivElement>(null);
  const heatmap = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [month, setMonth] = useState('');
  const [today, setToday] = useState('');
  const [activity, setActivity] = useState<Activity[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.GET('/api/user/settings').then(result => {
      if (!active) return;
      if (!result.data) {
        setError(apiFailure(result.error, t('failed')));
        setPending(false);
        return;
      }
      setPreferences(result.data.settings);
      const date = calendarDateInTimezone(new Date(), result.data.settings.timezone);
      setToday(date);
      setMonth(current => current || date.slice(0, 7));
    }).catch(() => {
      if (active) {
        setError(apiFailure(null, t('connection')));
        setPending(false);
      }
    });
    return () => { active = false; };
  }, [attempt]);

  const year = +month.slice(0, 4);
  const monthIndex = +month.slice(5) - 1;
  const days = month ? calendarMonthKeys(year, monthIndex) : [];

  useEffect(() => {
    if (!month || !today) return;
    let active = true;
    setPending(true);
    setError(null);
    Promise.all([
      api.GET('/api/diaries/activity', { params: { query: { dateFrom: days[0]!, dateTo: days.at(-1)! } } }),
      api.GET('/api/diaries/activity', { params: { query: { dateFrom: shift(today, -370), dateTo: today } } }),
    ]).then(results => {
      if (!active) return;
      const failure = results.find(result => !result.response.ok || !result.data);
      if (failure) setError(apiFailure(failure.error, t('failed')));
      else setActivity([...new Map(results.flatMap(result => result.data!.data).map(day => [day.date, day])).values()]);
    }).catch(() => {
      if (active) setError(apiFailure(null, t('connection')));
    }).finally(() => {
      if (active) setPending(false);
    });
    return () => { active = false; };
  }, [month, today, attempt]);

  useEffect(() => {
    if (!pending && heatmap.current) heatmap.current.scrollLeft = heatmap.current.scrollWidth;
  }, [pending, today]);

  const byDate = new Map(activity.map(day => [day.date, day]));
  const activeDays = new Set(byDate.keys());
  const baseWeeks = today ? buildHeatmapWeeks({
    endDate: today,
    activeDays,
    excludedDays: new Set(),
    excludeHolidays: false,
  }) : [];
  const heatmapDates = baseWeeks.flatMap(week => week.flatMap(cell => cell ? [cell.dateKey] : []));
  const excludeHolidays = preferences?.excludeHolidaysInStats ?? false;
  const monthCalendarAvailable = !excludeHolidays || getUsEquityCalendarYear(year) !== null;
  const heatmapCalendarAvailable = !excludeHolidays
    || [...new Set(heatmapDates.map(date => Number(date.slice(0, 4))))].every(isUsEquityCalendarYearSupported);
  const monthClosedDates = excludeHolidays && monthCalendarAvailable
    ? buildUsEquityClosedDateSet(year) ?? new Set<string>()
    : new Set<string>();
  const holidays = new Set(days.filter(date => monthClosedDates.has(date)));
  const heatmapClosedDates = excludeHolidays && heatmapCalendarAvailable
    ? buildUsEquityClosedDateSetForDates(heatmapDates) ?? new Set<string>()
    : new Set<string>();
  const coverage = month && monthCalendarAvailable
    ? calculateMonthCoverage({ year, month: monthIndex, activeDays, excludedDays: monthClosedDates })
    : null;
  const weeks = today ? buildHeatmapWeeks({
    endDate: today,
    activeDays,
    excludedDays: heatmapClosedDates,
    excludeHolidays,
  }) : [];

  function open(date: string) {
    const entry = byDate.get(date);
    navigate(entry ? `/diaries/${entry.diaryId}` : `/diaries/quick?date=${date}`);
  }

  function move(delta: number) {
    const date = new Date(Date.UTC(year, monthIndex + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
  }

  function keys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -index,
      End: days.length - 1 - index,
    }[event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'];
    if (offset === undefined) return;
    event.preventDefault();
    grid.current?.querySelectorAll<HTMLButtonElement>('button')[Math.max(0, Math.min(days.length - 1, index + offset))]?.focus();
  }

  const label = (date: string, excluded = false) => `${date} · ${byDate.has(date) ? l.recorded : l.empty}${excluded ? ` · ${l.holiday}` : ''}${byDate.get(date)?.transactionCount ? ` · ${byDate.get(date)!.transactionCount} ${l.transactions}` : ''}`;

  return <section className="diary-calendar">
    <header><h1>{l.title}</h1><p className="lede">{l.hint}</p></header>
    {preferences && <>
      <p className="muted">{l.timezone}: {preferences.timezone}</p>
      <div className="calendar-controls">
        <label>{l.month}<input type="month" min="1900-01" max="2100-12" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value); }} /></label>
        <div className="actions"><button className="secondary" disabled={month <= '1900-01'} onClick={() => move(-1)} aria-label={l.previous}>‹</button><button className="secondary" onClick={() => setMonth(today.slice(0, 7))}>{l.today}</button><button className="secondary" disabled={month >= '2100-12'} onClick={() => move(1)} aria-label={l.next}>›</button></div>
      </div>
    </>}
    {pending ? <p role="status">{t('loading')}</p> : error ? <><FailureNotice failure={error}/><button onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button><Link to={signInPath('/calendar')}>{t('login')}</Link></> : preferences && <>
      <h2>{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthIndex, 1)))}</h2>
      <div className="calendar-summary"><p>{l.entries}: <strong>{days.filter(date => activeDays.has(date)).length}</strong></p><p>{l.coverage}: <strong data-testid="coverage">{coverage?.coverage ?? '—'}</strong></p></div>
      {excludeHolidays && !monthCalendarAvailable
        ? <div className="calendar-warning" role="status"><p>{l.monthUnavailable}</p></div>
        : <p className="muted">{excludeHolidays ? l.excluded : l.allDays}</p>}
      <div className="calendar-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index}>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + index)))}</span>)}</div>
      <div ref={grid} className="calendar-grid" role="group" aria-label={l.select}>
        {Array.from({ length: new Date(`${days[0]}T00:00:00Z`).getUTCDay() }, (_, index) => <span key={`blank${index}`}/>)}
        {days.map((date, index) => <button key={date} data-date={date} className={`${byDate.has(date) ? 'recorded' : ''} ${holidays.has(date) ? 'holiday' : ''}`} aria-label={label(date, holidays.has(date))} aria-current={date === today ? 'date' : undefined} onKeyDown={event => keys(event, index)} onClick={() => open(date)}><span>{index + 1}</span>{byDate.has(date) && <span className="calendar-marker" aria-hidden="true">●</span>}{(byDate.get(date)?.transactionCount ?? 0) > 0 && <span className="calendar-trades" aria-hidden="true">{byDate.get(date)!.transactionCount} ↔</span>}</button>)}
      </div>
      {!days.some(date => activeDays.has(date)) && <p className="muted">{l.emptyMonth}</p>}
      <section className="calendar-heatmap">
        <h2>{l.heatmap}</h2><p className="muted">{l.heatmapHint}</p>
        {excludeHolidays && !heatmapCalendarAvailable && <p className="calendar-warning" role="status">{l.heatmapUnavailable}</p>}
        <div className="heatmap-scroll" ref={heatmap}><div className="heatmap-weeks">{weeks.map((week, index) => <div className="heatmap-week" key={index}>{week.map((cell, day) => cell ? <button key={cell.dateKey} className={`${cell.level ? 'recorded' : ''} ${cell.excluded ? 'holiday' : ''}`} aria-label={label(cell.dateKey, cell.excluded)} title={label(cell.dateKey, cell.excluded)} data-heatdate={cell.dateKey} tabIndex={cell.dateKey === today ? 0 : -1} onKeyDown={event => { const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown']; if (delta !== undefined) { event.preventDefault(); event.currentTarget.closest('.heatmap-weeks')?.querySelector<HTMLButtonElement>(`[data-heatdate="${shift(cell.dateKey, delta)}"]`)?.focus(); } }} onClick={() => open(cell.dateKey)}/>: <span key={day}/>)}</div>)}</div></div>
        <p className="calendar-legend"><span>● {l.recorded}</span><span>○ {l.empty}</span>{excludeHolidays && heatmapCalendarAvailable && <span>／ {l.holiday}</span>}</p>
      </section>
    </>}
  </section>;
}
