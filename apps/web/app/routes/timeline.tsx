import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { groupActivityDays, groupActivityEvents } from '@diary/domain';
import { ACTIVITY_EVENT_GROUPS, type ActivityEvent } from '@diary/contracts/activity-timeline';
import { useUi, LoadingBlock } from '../ui';
import { useTimeline } from '../use-timeline';
import { timelineCopy } from '../timeline-copy';
import { FailureNotice, invalidField } from '../api-error';
import { signInPath } from '../session';
import { TimelineModeSwitch } from '../timeline-mode-switch';
import { Icon, type IconName } from '../icons';
import { formatAmount, formatQuantity } from '../market-display';
import '../timeline.css';

type Copy = (typeof timelineCopy)['en'];
type Locale = 'zh-TW' | 'zh-CN' | 'en';

const KIND_ICON: Record<ActivityEvent['kind'], IconName> = {
  DIARY: 'book', TRADE: 'scale', REVIEW: 'check', THESIS_REVIEW: 'target',
};
const KIND_LABEL: Record<ActivityEvent['kind'], keyof Copy> = {
  DIARY: 'diaryLabel', TRADE: 'tradeLabel', REVIEW: 'reviewLabel', THESIS_REVIEW: 'thesisReviewLabel',
};

/** Noon UTC, so a calendar date resolves to the same weekday in every zone. */
function dayOf(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

/**
 * One record. The kind lives twice over: as the tinted mark in the gutter that
 * makes a mixed feed scannable, and as the first word of the meta line, because
 * a mark alone is not a label.
 */
function EventRow({ event, c, locale }: { event: ActivityEvent; c: Copy; locale: Locale }) {
  const time = event.occurredAt === null
    ? null
    : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(event.occurredAt));
  return <li data-testid="timeline-entry" data-kind={event.kind} className="timeline-record">
    <span className={`timeline-mark timeline-mark-${event.kind.toLowerCase()}`} aria-hidden="true">
      <Icon name={KIND_ICON[event.kind]} size={15} />
    </span>
    <article>
      {event.kind === 'DIARY' && <DiaryBody event={event} c={c} time={time} />}
      {event.kind === 'TRADE' && <TradeBody event={event} c={c} time={time} />}
      {event.kind === 'REVIEW' && <ReviewBody event={event} c={c} time={time} />}
      {event.kind === 'THESIS_REVIEW' && <ThesisReviewBody event={event} c={c} time={time} />}
    </article>
  </li>;
}

/** The meta line every record carries: kind, time of day, then its own facts. */
function Meta({ kind, c, time, children }: { kind: ActivityEvent['kind']; c: Copy; time: string | null; children?: ReactNode }) {
  return <ul className="timeline-meta" aria-label={c.entries}>
    <li className="timeline-meta-kind">{c[KIND_LABEL[kind]]}</li>
    {time && <li className="timeline-meta-time">{time}</li>}
    {children}
  </ul>;
}

function DiaryBody({ event, c, time }: { event: Extract<ActivityEvent, { kind: 'DIARY' }>; c: Copy; time: string | null }) {
  return <>
    <h3><Link to={`/diaries/${event.diaryId}`}>{event.title}</Link></h3>
    <Meta kind="DIARY" c={c} time={time}>
      {event.stockSymbols.map(symbol => <li key={symbol} className="timeline-symbol">{symbol}</li>)}
      {event.tags.map(tag => <li key={tag}>{tag}</li>)}
      {event.transactionCount > 0 && <li>{event.transactionCount} {c.transactions}</li>}
      {event.alertCount > 0 && <li>{event.alertCount} {c.alerts}</li>}
      {event.reviewStatus === 'reviewed' && <li>{c.reviewed}{event.reviewOutcome ? ` · ${c[event.reviewOutcome]}` : ''}</li>}
    </Meta>
    <p className="timeline-excerpt">{event.excerpt || c.noContent}</p>
    {event.excerpt && <Link className="timeline-read" to={`/diaries/${event.diaryId}`}>{c.read}</Link>}
  </>;
}

function TradeBody({ event, c, time }: { event: Extract<ActivityEvent, { kind: 'TRADE' }>; c: Copy; time: string | null }) {
  const { locale } = useUi();
  return <>
    <h3>
      <span className={event.type === 'BUY' ? 'timeline-trade-buy' : 'timeline-trade-sell'}>
        {event.type === 'BUY' ? c.buy : c.sell}
      </span>
      {' '}<span className="timeline-symbol-strong">{event.symbol}</span>
      {' '}<span className="timeline-trade-size">{formatQuantity(locale, event.quantity)}</span>
      {' '}<span className="muted">{c.at} {formatAmount(locale, event.price)}</span>
    </h3>
    <Meta kind="TRADE" c={c} time={time}>
      {event.strategy && <li>{event.strategy}</li>}
      {event.emotion && <li>{event.emotion}</li>}
    </Meta>
    {event.notesExcerpt && <p className="timeline-excerpt">{event.notesExcerpt}</p>}
    {/* A trade can sit on a different day than the judgment that produced it,
        so the card always names the diary it belongs to. */}
    <p className="timeline-origin">
      {c.fromDiary} <Link to={`/diaries/${event.diaryId}`}>{event.diaryTitle}</Link>
      {event.diaryDate !== event.date && <span className="muted"> · {event.diaryDate}</span>}
    </p>
  </>;
}

function ReviewBody({ event, c, time }: { event: Extract<ActivityEvent, { kind: 'REVIEW' }>; c: Copy; time: string | null }) {
  return <>
    <h3><Link to={`/diaries/${event.diaryId}`}>{event.title}</Link></h3>
    <Meta kind="REVIEW" c={c} time={time}>
      <li className={event.outcome ? `timeline-outcome timeline-outcome-${event.outcome.toLowerCase()}` : undefined}>
        {event.outcome ? c[event.outcome] : c.noOutcome}
      </li>
      {event.stockSymbols.map(symbol => <li key={symbol} className="timeline-symbol">{symbol}</li>)}
    </Meta>
    <p className="timeline-origin">{c.reviewOf} <span className="muted">{event.diaryDate}</span></p>
  </>;
}

function ThesisReviewBody({ event, c, time }: { event: Extract<ActivityEvent, { kind: 'THESIS_REVIEW' }>; c: Copy; time: string | null }) {
  return <>
    <h3><Link to={`/stocks/${event.symbol}/thesis`}>{event.symbol}</Link></h3>
    <Meta kind="THESIS_REVIEW" c={c} time={time}>
      <li className={`timeline-outcome timeline-outcome-${event.outcome.toLowerCase()}`}>{c[event.outcome]}</li>
      <li>{c[event.portfolioDecision]}</li>
      {event.invalidationTriggered && <li className="timeline-outcome timeline-outcome-invalidated">{c.invalidationTriggered}</li>}
    </Meta>
  </>;
}

export default function TimelinePage() {
  const { locale, t } = useUi();
  const c = timelineCopy[locale];
  const [params, setParams] = useSearchParams();
  const timeline = useTimeline(params.toString());
  const groups = useMemo(() => groupActivityEvents(timeline.events), [timeline.events]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const dateFrom = params.get('dateFrom') ?? '';
  const dateTo = params.get('dateTo') ?? '';
  const hasDateFilter = Boolean(dateFrom || dateTo);
  const group = params.get('group') ?? '';

  useEffect(() => {
    if (timeline.error) setFiltersOpen(true);
  }, [timeline.error]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(params);
    next.delete('dateFrom'); next.delete('dateTo');
    for (const [key, value] of new FormData(event.currentTarget)) if (typeof value === 'string' && value) next.set(key, value);
    setParams(next);
  }

  /** The kind filter and the date range compose; changing one keeps the other. */
  function groupTo(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('group', value); else next.delete('group');
    return `?${next.toString()}`;
  }

  function clearDates() {
    const next = new URLSearchParams(params);
    next.delete('dateFrom'); next.delete('dateTo');
    setParams(next);
  }

  const rangeSummary = dateFrom && dateTo
    ? `${dateFrom} – ${dateTo}`
    : dateFrom
      ? `${c.from} ${dateFrom}`
      : dateTo
        ? `${c.to} ${dateTo}`
        : c.allDates;
  const monthLabel = (period: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`));
  const dayNumber = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const fullDay = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
  const groupName = { diary: c.kindDiary, trade: c.kindTrade, review: c.kindReview } as const;
  const count = (total: number) => `${total} ${locale === 'en' && total === 1 ? 'record' : c.entries}`;

  return <section className="diary-timeline">
    <header className="page-heading">
      <div><h1>{c.title}</h1><p className="muted">{c.intro}</p></div>
      <Link className="button" to="/diaries/quick">{t('quick')}</Link>
    </header>

    {/* One chrome band: which timeline, which records, which dates, how many —
        instead of four stacked rows between the heading and the first memory. */}
    <div className="timeline-toolbar" data-testid="timeline-filters">
      <TimelineModeSwitch mode="mine" />
      <nav className="timeline-kinds" data-testid="timeline-kinds" aria-label={c.kinds}>
        <Link to={groupTo('')} aria-current={group === '' ? 'true' : undefined}>{c.kindAll}</Link>
        {ACTIVITY_EVENT_GROUPS.map(value => <Link key={value} to={groupTo(value)} aria-current={group === value ? 'true' : undefined}>{groupName[value]}</Link>)}
      </nav>
      <details className="timeline-filters" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
        {/* The control names itself and states its current value, so the row
            needs no separate label line above the range. */}
        <summary aria-label={`${c.filter}: ${rangeSummary}`}>
          <Icon name="calendarRange" size={16} aria-hidden="true" />
          <span className="timeline-filter-range" data-testid="timeline-filter-range">{rangeSummary}</span>
          <Icon name="chevronDown" size={15} aria-hidden="true" className="timeline-filter-caret" />
        </summary>
        <form key={params.toString()} onSubmit={filter}>
          <label>{c.from}<input name="dateFrom" type="date" defaultValue={dateFrom} aria-invalid={invalidField(timeline.error, 'dateFrom')} aria-describedby={timeline.error ? 'timeline-error' : undefined} /></label>
          <label>{c.to}<input name="dateTo" type="date" defaultValue={dateTo} aria-invalid={invalidField(timeline.error, 'dateTo')} aria-describedby={timeline.error ? 'timeline-error' : undefined} /></label>
          <div className="actions"><button type="submit" className="button-compact">{c.apply}</button><button type="button" className="secondary button-compact" onClick={clearDates}>{c.reset}</button></div>
        </form>
      </details>
      {hasDateFilter && <button type="button" className="quiet-button button-compact timeline-filter-clear" onClick={clearDates}>{c.clear}</button>}
      {!timeline.loading && <p className="timeline-count muted" role="status">{timeline.events.length} {locale === 'en' && timeline.events.length === 1 ? 'record loaded' : c.loaded}</p>}
    </div>

    {timeline.loading ? <LoadingBlock label={t('loading')} /> : <>
      {groups.map(month => <section className="timeline-month" key={month.period} aria-label={monthLabel(month.period)}>
        <header><h2>{monthLabel(month.period)}</h2><span className="muted">{count(month.entries.length)}</span></header>
        {/* The day is the unit, not the record: one date mark holds the diary
            that framed the day, the trades it produced and the reviews that
            closed earlier judgments, in that order. */}
        <ol className="timeline-days">
          {groupActivityDays(month.entries).map(day => <li className="timeline-day" key={day.date}>
            {/* Sighted readers get the month from the sticky header above; a
                screen reader reaching this day out of that context does not. */}
            <time className="timeline-day-mark" dateTime={day.date}>
              <span className="sr-only">{fullDay.format(dayOf(day.date))}</span>
              <span className="timeline-day-number" aria-hidden="true">{dayNumber.format(dayOf(day.date))}</span>
              <span className="timeline-day-weekday" aria-hidden="true">{weekday.format(dayOf(day.date))}</span>
            </time>
            <ol className="timeline-records">
              {day.entries.map(event => <EventRow key={event.id} event={event} c={c} locale={locale} />)}
            </ol>
          </li>)}
        </ol>
      </section>)}
      {!timeline.error && timeline.events.length === 0 && <div className="empty-state timeline-empty"><p>{c.empty}</p><Link className="button secondary" to="/diaries/quick">{t('quick')}</Link></div>}
    </>}
    {timeline.error && <div className="timeline-recovery"><FailureNotice failure={timeline.error} id="timeline-error" /><div className="actions"><button type="button" onClick={timeline.retry}>{t('retry')}</button>{timeline.error.code?.startsWith('AUTH_') && <Link to={signInPath('/timeline')}>{t('login')}</Link>}</div></div>}
    {!timeline.error && !timeline.loading && timeline.hasMore && <button type="button" className="secondary timeline-more" disabled={timeline.loadingMore} onClick={timeline.loadMore}>{timeline.loadingMore ? t('loading') : c.more}</button>}
    {!timeline.loading && !timeline.error && timeline.events.length > 0 && !timeline.hasMore && <p className="muted timeline-end">{c.all}</p>}
  </section>;
}
