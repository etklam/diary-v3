import { calendarDateInTimezone } from '@diary/domain';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import { Icon } from '../icons';
import '../calendar.css';

import type { DiaryActivityDay } from '@diary/contracts/diary-activity';

type Activity = DiaryActivityDay;
type Preferences = { timezone: string; excludeHolidaysInStats: boolean };

const shift = (key: string, days: number) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Four steps, not presence: a day's weight is the diary plus the trades and
 * reviews recorded against it. The ramp is tinted from the ink action colour,
 * held clear of the market palette so a busy day never reads as a gain.
 */
function activityLevel(day: Activity | undefined) {
  if (!day) return 0;
  const weight = (day.diaryId ? 1 : 0) + day.transactionCount + day.reviewCount;
  if (weight === 0) return 0;
  if (weight <= 2) return 1;
  if (weight <= 5) return 2;
  return 3;
}

export default function Calendar() {
  const { locale, t } = useUi();
  const l = calendarCopy[locale];
  const navigate = useNavigate();
  const grid = useRef<HTMLDivElement>(null);
  const heatmap = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [month, setMonth] = useState('');
  const [today, setToday] = useState('');
  const [monthActivity, setMonthActivity] = useState<Activity[]>([]);
  const [yearActivity, setYearActivity] = useState<Activity[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [focusDate, setFocusDate] = useState('');

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
  const days = useMemo(() => month ? calendarMonthKeys(year, monthIndex) : [], [month, year, monthIndex]);

  useEffect(() => {
    if (!month) return;
    let active = true;
    setPending(true);
    setError(null);
    api.GET('/api/diaries/activity', { params: { query: { dateFrom: days[0]!, dateTo: days.at(-1)! } } }).then(result => {
      if (!active) return;
      if (!result.response.ok || !result.data) setError(apiFailure(result.error, t('failed')));
      else setMonthActivity(result.data.data);
    }).catch(() => {
      if (active) setError(apiFailure(null, t('connection')));
    }).finally(() => {
      if (active) setPending(false);
    });
    return () => { active = false; };
  }, [month, days, attempt]);

  // The year strip covers today − 370 → today and never depends on the month
  // being browsed, so paging through months costs one request each.
  useEffect(() => {
    if (!today) return;
    let active = true;
    api.GET('/api/diaries/activity', { params: { query: { dateFrom: shift(today, -370), dateTo: today } } }).then(result => {
      if (!active) return;
      if (!result.response.ok || !result.data) setError(apiFailure(result.error, t('failed')));
      else setYearActivity(result.data.data);
    }).catch(() => {
      if (active) setError(apiFailure(null, t('connection')));
    });
    return () => { active = false; };
  }, [today, attempt]);

  useEffect(() => {
    if (!pending && heatmap.current) heatmap.current.scrollLeft = heatmap.current.scrollWidth;
  }, [pending, today]);

  const byDate = new Map([...yearActivity, ...monthActivity].map(day => [day.date, day]));
  // Coverage and the month marks measure diary writing, so they count days that
  // hold a diary. A day whose only activity is a trade or a review is still
  // marked on the grid, and opens the merged timeline for that date.
  const activeDays = new Set([...byDate.values()].filter(day => day.diaryId !== null).map(day => day.date));
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
  const monthName = month ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthIndex, 1))) : '';
  const yearRange = today ? `${shift(today, -370)} → ${today}` : '';
  const roving = days.includes(focusDate) ? focusDate : days.includes(today) ? today : days[0] ?? '';

  function open(date: string) {
    const entry = byDate.get(date);
    if (entry?.diaryId) navigate(`/diaries/${entry.diaryId}`);
    // Trades and reviews have no single record to open; the day's merged
    // timeline is the view that shows all of them.
    else if (entry) navigate(`/timeline?dateFrom=${date}&dateTo=${date}`);
    else navigate(`/diaries/quick?date=${date}`);
  }

  function focusCell(date: string) {
    setFocusDate(date);
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
  }

  // One tab stop with arrow movement, matching the year strip.
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
    focusCell(days[Math.max(0, Math.min(days.length - 1, index + offset))]!);
  }

  /** What opening this day does, stated for assistive technology and in the title. */
  const destination = (date: string) => {
    const day = byDate.get(date);
    return day?.diaryId ? l.openDiary : day ? l.openTimeline : l.openQuick;
  };

  const label = (date: string, excluded = false) => {
    const day = byDate.get(date);
    return `${date} · ${activeDays.has(date) ? l.recorded : l.empty}${excluded ? ` · ${l.holiday}` : ''}`
      + `${day?.transactionCount ? ` · ${day.transactionCount} ${l.transactions}` : ''}`
      + `${day?.reviewCount ? ` · ${day.reviewCount} ${l.reviews}` : ''}`
      + ` · ${destination(date)}`;
  };

  function move(delta: number) {
    const date = new Date(Date.UTC(year, monthIndex + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
  }

  return <section className="diary-calendar">
    <header><h1>{l.title}</h1><p className="lede">{l.hint}</p></header>
    {preferences && <div className="calendar-controls">
      <div className="calendar-month-control">
        <label htmlFor="calendar-month">{l.month}</label>
        <input id="calendar-month" type="month" min="1900-01" max="2100-12" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value); }} />
        <div className="actions">
          <button className="secondary button-compact" disabled={month <= '1900-01'} onClick={() => move(-1)} aria-label={l.previous}><Icon name="chevronLeft" size={16}/></button>
          <button className="secondary button-compact" onClick={() => setMonth(today.slice(0, 7))}>{l.today}</button>
          <button className="secondary button-compact" disabled={month >= '2100-12'} onClick={() => move(1)} aria-label={l.next}><Icon name="chevronRight" size={16}/></button>
        </div>
      </div>
      <dl className="calendar-figures">
        <div><dt>{l.entries}</dt><dd className="num">{days.filter(date => activeDays.has(date)).length}</dd></div>
        <div><dt>{l.coverage}</dt><dd><span className="num" data-testid="coverage">{coverage?.coverage ?? '—'}</span> <span className="muted">{coverage ? l.coverageOf.replace('{n}', String(coverage.eligibleDays)) : ''}</span></dd></div>
      </dl>
      <p className="muted calendar-policy"><span>{excludeHolidays ? l.excluded : l.allDays}</span> · <span>{l.timezone}: {preferences.timezone}</span></p>
    </div>}
    {pending ? <p role="status">{t('loading')}</p> : error ? <><FailureNotice failure={error}/><button onClick={() => setAttempt(value => value + 1)}>{t('retry')}</button><Link to={signInPath('/calendar')}>{t('login')}</Link></> : preferences && <>
      {excludeHolidays && !monthCalendarAvailable && <div className="calendar-warning" role="status"><p>{l.monthUnavailable}</p></div>}
      <section className="calendar-month" aria-label={monthName}>
        <div className="calendar-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index}>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + index)))}</span>)}</div>
        <div ref={grid} className="calendar-grid" role="group" aria-label={`${l.select} · ${monthName}`}>
          {Array.from({ length: new Date(`${days[0]}T00:00:00Z`).getUTCDay() }, (_, index) => <span key={`blank${index}`}/>)}
          {days.map((date, index) => {
            const day = byDate.get(date);
            const kind = day?.diaryId ? 'has-diary' : day ? 'has-activity' : 'is-empty';
            return <button key={date} data-date={date} type="button" className={`calendar-day ${kind}${holidays.has(date) ? ' holiday' : ''}`} aria-label={label(date, holidays.has(date))} title={destination(date)} aria-current={date === today ? 'date' : undefined} tabIndex={date === roving ? 0 : -1} onFocus={() => setFocusDate(date)} onKeyDown={event => keys(event, index)} onClick={() => open(date)}>
              <span className="calendar-day-number num">{index + 1}</span>
              <span className="calendar-day-marks" aria-hidden="true">
                {day?.diaryId && <span className="calendar-mark is-diary"><Icon name="book" size={14}/></span>}
                {(day?.transactionCount ?? 0) > 0 && <span className="calendar-mark"><Icon name="briefcase" size={14}/><span className="num">{day!.transactionCount}</span></span>}
                {(day?.reviewCount ?? 0) > 0 && <span className="calendar-mark"><Icon name="check" size={14}/><span className="num">{day!.reviewCount}</span></span>}
                {kind === 'is-empty' && <span className="calendar-capture"><Icon name="pen" size={14}/></span>}
              </span>
            </button>;
          })}
        </div>
        <p className="calendar-legend">
          <span><Icon name="book" size={14}/> {l.markDiary}</span>
          <span><Icon name="briefcase" size={14}/> {l.markTrades}</span>
          <span><Icon name="check" size={14}/> {l.markReviews}</span>
          <span><Icon name="pen" size={14}/> {l.markEmpty}</span>
          {excludeHolidays && monthCalendarAvailable && <span><span className="calendar-legend-holiday" aria-hidden="true"/> {l.holiday}</span>}
        </p>
        {!days.some(date => activeDays.has(date)) && <div className="empty-state calendar-empty"><p>{l.emptyMonth}</p><Link className="button secondary" to={`/diaries/quick?date=${days.includes(today) ? today : days[0]}`}>{l.startDiary}</Link></div>}
      </section>
      <section className="calendar-heatmap" aria-labelledby="calendar-year-title">
        <h2 id="calendar-year-title">{l.heatmap}</h2><p className="muted"><span className="num">{yearRange}</span> · {l.heatmapHint}</p>
        {excludeHolidays && !heatmapCalendarAvailable && <p className="calendar-warning" role="status">{l.heatmapUnavailable}</p>}
        <div className="heatmap-scroll" ref={heatmap} tabIndex={0} role="group" aria-label={l.heatmap}>
          <div className="heatmap-months" aria-hidden="true">{weeks.map((week, index) => {
            const first = week.find(cell => cell)?.dateKey;
            const previous = weeks[index - 1]?.find(cell => cell)?.dateKey;
            const started = Boolean(first) && (!previous || previous.slice(0, 7) !== first!.slice(0, 7));
            return <span key={index}>{started && first ? new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${first}T00:00:00Z`)) : ''}</span>;
          })}</div>
          <div className="heatmap-weeks">{weeks.map((week, index) => <div className="heatmap-week" key={index}>{week.map((cell, day) => cell ? <button key={cell.dateKey} type="button" className={`heatmap-day level-${activityLevel(byDate.get(cell.dateKey))}${cell.excluded ? ' holiday' : ''}`} aria-label={label(cell.dateKey, cell.excluded)} title={label(cell.dateKey, cell.excluded)} data-heatdate={cell.dateKey} tabIndex={cell.dateKey === today ? 0 : -1} onKeyDown={event => { const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown']; if (delta !== undefined) { event.preventDefault(); event.currentTarget.closest('.heatmap-weeks')?.querySelector<HTMLButtonElement>(`[data-heatdate="${shift(cell.dateKey, delta)}"]`)?.focus(); } }} onClick={() => open(cell.dateKey)}/> : <span key={day}/>)}</div>)}</div>
        </div>
        <p className="calendar-legend">
          <span>{l.levelLess}</span>
          {[0, 1, 2, 3].map(level => <span key={level} className={`heatmap-day level-${level} calendar-legend-swatch`} aria-hidden="true"/>)}
          <span>{l.levelMore}</span>
          <span className="muted">{l.levelHint}</span>
          {excludeHolidays && heatmapCalendarAvailable && <span><span className="calendar-legend-holiday" aria-hidden="true"/> {l.holiday}</span>}
        </p>
      </section>
    </>}
  </section>;
}
