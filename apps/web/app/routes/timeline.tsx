import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { groupActivityEvents } from '@diary/domain';
import { ACTIVITY_EVENT_GROUPS, type ActivityEvent } from '@diary/contracts/activity-timeline';
import { useUi, LoadingBlock } from '../ui';
import { useTimeline } from '../use-timeline';
import { timelineCopy } from '../timeline-copy';
import { FailureNotice, invalidField } from '../api-error';
import { signInPath } from '../session';
import { TimelineModeSwitch } from '../timeline-mode-switch';
import { Icon, type IconName } from '../icons';
import '../timeline.css';

type Copy = (typeof timelineCopy)['en'];

const KIND_ICON: Record<ActivityEvent['kind'], IconName> = {
  DIARY: 'book', TRADE: 'scale', REVIEW: 'check', THESIS_REVIEW: 'target',
};
const KIND_LABEL: Record<ActivityEvent['kind'], keyof Copy> = {
  DIARY: 'diaryLabel', TRADE: 'tradeLabel', REVIEW: 'reviewLabel', THESIS_REVIEW: 'thesisReviewLabel',
};

/** The kind badge every card carries, so a mixed feed stays scannable. */
function KindBadge({ kind, c }: { kind: ActivityEvent['kind']; c: Copy }) {
  return <span className={`timeline-kind timeline-kind-${kind.toLowerCase()}`}>
    <Icon name={KIND_ICON[kind]} size={15} aria-hidden="true" />{c[KIND_LABEL[kind]]}
  </span>;
}

function EventCard({ event, c, locale }: { event: ActivityEvent; c: Copy; locale: 'zh-TW' | 'zh-CN' | 'en' }) {
  const time = event.occurredAt === null
    ? null
    : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(event.occurredAt));
  return <li data-testid="timeline-entry" data-kind={event.kind}>
    <div className="timeline-when">
      <time dateTime={event.occurredAt ?? event.date}>{event.date}</time>
      {time && <span className="timeline-time">{time}</span>}
    </div>
    <article>
      <KindBadge kind={event.kind} c={c} />
      {event.kind === 'DIARY' && <DiaryBody event={event} c={c} />}
      {event.kind === 'TRADE' && <TradeBody event={event} c={c} />}
      {event.kind === 'REVIEW' && <ReviewBody event={event} c={c} />}
      {event.kind === 'THESIS_REVIEW' && <ThesisReviewBody event={event} c={c} />}
    </article>
  </li>;
}

function DiaryBody({ event, c }: { event: Extract<ActivityEvent, { kind: 'DIARY' }>; c: Copy }) {
  return <>
    <h3><Link to={`/diaries/${event.diaryId}`}>{event.title}</Link></h3>
    <ul className="timeline-meta" aria-label={c.entries}>
      {event.stockSymbols.map(symbol => <li key={symbol} className="timeline-symbol">{symbol}</li>)}
      {event.tags.map(tag => <li key={tag}>{tag}</li>)}
      {event.transactionCount > 0 && <li>{event.transactionCount} {c.transactions}</li>}
      {event.alertCount > 0 && <li>{event.alertCount} {c.alerts}</li>}
      {event.reviewStatus === 'reviewed' && <li>{c.reviewed}{event.reviewOutcome ? ` · ${c[event.reviewOutcome]}` : ''}</li>}
    </ul>
    <p className="timeline-excerpt">{event.excerpt || c.noContent}</p>
    {event.excerpt && <Link className="timeline-read" to={`/diaries/${event.diaryId}`}>{c.read}</Link>}
  </>;
}

function TradeBody({ event, c }: { event: Extract<ActivityEvent, { kind: 'TRADE' }>; c: Copy }) {
  return <>
    <h3>
      <span className={event.type === 'BUY' ? 'timeline-trade-buy' : 'timeline-trade-sell'}>
        {event.type === 'BUY' ? c.buy : c.sell}
      </span>
      {' '}<span className="timeline-symbol-strong">{event.symbol}</span>
      {' '}<span className="timeline-trade-size">{event.quantity}</span>
      {' '}<span className="muted">{c.at} {event.price}</span>
    </h3>
    <ul className="timeline-meta" aria-label={c.entries}>
      {event.strategy && <li>{event.strategy}</li>}
      {event.emotion && <li>{event.emotion}</li>}
    </ul>
    {event.notesExcerpt && <p className="timeline-excerpt">{event.notesExcerpt}</p>}
    {/* A trade can sit on a different day than the judgment that produced it,
        so the card always names the diary it belongs to. */}
    <p className="timeline-origin">
      {c.fromDiary} <Link to={`/diaries/${event.diaryId}`}>{event.diaryTitle}</Link>
      {event.diaryDate !== event.date && <span className="muted"> · {event.diaryDate}</span>}
    </p>
  </>;
}

function ReviewBody({ event, c }: { event: Extract<ActivityEvent, { kind: 'REVIEW' }>; c: Copy }) {
  return <>
    <h3><Link to={`/diaries/${event.diaryId}`}>{event.title}</Link></h3>
    <ul className="timeline-meta" aria-label={c.entries}>
      <li className={event.outcome ? `timeline-outcome timeline-outcome-${event.outcome.toLowerCase()}` : undefined}>
        {event.outcome ? c[event.outcome] : c.noOutcome}
      </li>
      {event.stockSymbols.map(symbol => <li key={symbol} className="timeline-symbol">{symbol}</li>)}
    </ul>
    <p className="timeline-origin">{c.reviewOf} <span className="muted">{event.diaryDate}</span></p>
  </>;
}

function ThesisReviewBody({ event, c }: { event: Extract<ActivityEvent, { kind: 'THESIS_REVIEW' }>; c: Copy }) {
  return <>
    <h3><Link to={`/stocks/${event.symbol}/thesis`}>{event.symbol}</Link></h3>
    <ul className="timeline-meta" aria-label={c.entries}>
      <li className={`timeline-outcome timeline-outcome-${event.outcome.toLowerCase()}`}>{c[event.outcome]}</li>
      <li>{c[event.portfolioDecision]}</li>
      {event.invalidationTriggered && <li className="timeline-outcome timeline-outcome-invalidated">{c.invalidationTriggered}</li>}
    </ul>
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
  const groupName = { diary: c.kindDiary, trade: c.kindTrade, review: c.kindReview } as const;

  return <section className="diary-timeline">
    <header className="page-heading"><div><h1>{c.title}</h1><p className="muted">{c.intro}</p></div><Link className="button" to="/diaries/quick">{t('quick')}</Link></header>
    <TimelineModeSwitch mode="mine" />
    <nav className="timeline-kinds" data-testid="timeline-kinds" aria-label={c.kinds}>
      <Link to={groupTo('')} aria-current={group === '' ? 'true' : undefined}>{c.kindAll}</Link>
      {ACTIVITY_EVENT_GROUPS.map(value => <Link key={value} to={groupTo(value)} aria-current={group === value ? 'true' : undefined}>{groupName[value]}</Link>)}
    </nav>
    <div className="timeline-filter-bar" data-testid="timeline-filters">
      <details className="timeline-filters" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
        <summary><span className="timeline-filter-label"><Icon name="chevronDown" size={17} aria-hidden="true" /><span>{c.filter}</span></span><span className="timeline-filter-range" data-testid="timeline-filter-range">{rangeSummary}</span></summary>
        <form key={params.toString()} onSubmit={filter}>
          <label>{c.from}<input name="dateFrom" type="date" defaultValue={dateFrom} aria-invalid={invalidField(timeline.error, 'dateFrom')} aria-describedby={timeline.error ? 'timeline-error' : undefined} /></label>
          <label>{c.to}<input name="dateTo" type="date" defaultValue={dateTo} aria-invalid={invalidField(timeline.error, 'dateTo')} aria-describedby={timeline.error ? 'timeline-error' : undefined} /></label>
          <div className="actions"><button type="submit">{c.apply}</button><button type="button" className="secondary" onClick={clearDates}>{c.reset}</button></div>
        </form>
      </details>
      {hasDateFilter && <button type="button" className="secondary timeline-filter-clear" onClick={clearDates}>{c.clear}</button>}
    </div>
    {timeline.loading ? <LoadingBlock label={t('loading')} /> : <>
      <p className="muted" role="status">{timeline.events.length} {locale === 'en' && timeline.events.length === 1 ? 'record loaded' : c.loaded}</p>
      {groups.map(group => <section className="timeline-month" key={group.period} aria-label={monthLabel(group.period)}><header><h2>{monthLabel(group.period)}</h2><span className="muted">{group.entries.length} {locale === 'en' && group.entries.length === 1 ? 'record' : c.entries}</span></header><ol>{group.entries.map(event => <EventCard key={event.id} event={event} c={c} locale={locale} />)}</ol></section>)}
      {!timeline.error && timeline.events.length === 0 && <div className="timeline-empty"><p>{c.empty}</p><Link className="button secondary" to="/diaries/quick">{t('quick')}</Link></div>}
    </>}
    {timeline.error && <div className="timeline-recovery"><FailureNotice failure={timeline.error} id="timeline-error" /><div className="actions"><button type="button" onClick={timeline.retry}>{t('retry')}</button>{timeline.error.code?.startsWith('AUTH_') && <Link to={signInPath('/timeline')}>{t('login')}</Link>}</div></div>}
    {!timeline.error && !timeline.loading && timeline.hasMore && <button type="button" className="secondary timeline-more" disabled={timeline.loadingMore} onClick={timeline.loadMore}>{timeline.loadingMore ? t('loading') : c.more}</button>}
    {!timeline.loading && !timeline.error && timeline.events.length > 0 && !timeline.hasMore && <p className="muted">{c.all}</p>}
  </section>;
}
