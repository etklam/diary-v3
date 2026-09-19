import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { groupTimelineEntries } from '@diary/domain';
import { useUi } from '../ui';
import { useTimeline } from '../use-timeline';
import { timelineCopy } from '../timeline-copy';
import { FailureNotice, invalidField } from '../api-error';
import { signInPath } from '../session';
import { TimelineModeSwitch } from '../timeline-mode-switch';
import { Icon } from '../icons';
import '../timeline.css';

export default function TimelinePage() {
  const { locale, t } = useUi();
  const c = timelineCopy[locale];
  const [params, setParams] = useSearchParams();
  const timeline = useTimeline(params.toString());
  const groups = useMemo(() => groupTimelineEntries(timeline.entries), [timeline.entries]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const dateFrom = params.get('dateFrom') ?? '';
  const dateTo = params.get('dateTo') ?? '';
  const hasDateFilter = Boolean(dateFrom || dateTo);

  useEffect(() => {
    if (timeline.error) setFiltersOpen(true);
  }, [timeline.error]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) if (typeof value === 'string' && value) next.set(key, value);
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

  return <section className="diary-timeline">
    <header className="page-heading"><div><h1>{c.title}</h1><p className="muted">{c.intro}</p></div><Link className="button" to="/diaries/quick">{t('quick')}</Link></header>
    <TimelineModeSwitch mode="mine" />
    <div className="timeline-filter-bar" data-testid="timeline-filters">
      <details className="timeline-filters" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
        <summary><span className="timeline-filter-label"><Icon name="chevronDown" size={17} aria-hidden="true" /><span>{c.filter}</span></span><span className="timeline-filter-range" data-testid="timeline-filter-range">{rangeSummary}</span></summary>
        <form key={params.toString()} onSubmit={filter}>
          <label>{c.from}<input name="dateFrom" type="date" defaultValue={dateFrom} aria-invalid={invalidField(timeline.error, 'dateFrom')} aria-describedby={timeline.error ? 'timeline-error' : undefined} /></label>
          <label>{c.to}<input name="dateTo" type="date" defaultValue={dateTo} aria-invalid={invalidField(timeline.error, 'dateTo')} aria-describedby={timeline.error ? 'timeline-error' : undefined} /></label>
          <div className="actions"><button type="submit">{c.apply}</button><button type="button" className="secondary" onClick={() => setParams({})}>{c.reset}</button></div>
        </form>
      </details>
      {hasDateFilter && <button type="button" className="secondary timeline-filter-clear" onClick={() => setParams({})}>{c.clear}</button>}
    </div>
    {timeline.loading ? <p role="status">{t('loading')}</p> : <>
      <p className="muted" role="status">{timeline.entries.length} {locale === 'en' && timeline.entries.length === 1 ? 'diary loaded' : c.loaded}</p>
      {groups.map(group => <section className="timeline-month" key={group.period} aria-label={monthLabel(group.period)}><header><h2>{monthLabel(group.period)}</h2><span className="muted">{group.entries.length} {locale === 'en' && group.entries.length === 1 ? 'entry' : c.entries}</span></header><ol>{group.entries.map(entry => <li key={entry.id} data-testid="timeline-entry"><time dateTime={entry.date}>{entry.date}</time><article><h3><Link to={`/diaries/${entry.id}`}>{entry.title}</Link></h3><ul className="timeline-meta" aria-label={c.entries}>{entry.stockSymbols.map(symbol => <li key={symbol} className="timeline-symbol">{symbol}</li>)}{entry.tags.map(tag => <li key={tag}>{tag}</li>)}{entry.transactionCount > 0 && <li>{entry.transactionCount} {c.transactions}</li>}{entry.alertCount > 0 && <li>{entry.alertCount} {c.alerts}</li>}{entry.reviewed && <li>{c.reviewed}{entry.reviewOutcome && entry.reviewOutcome in c ? ` · ${c[entry.reviewOutcome as 'INTACT']}` : ''}</li>}</ul><p className="timeline-excerpt">{entry.excerpt || c.noContent}</p>{entry.excerpt && <Link className="timeline-read" to={`/diaries/${entry.id}`}>{c.read}</Link>}</article></li>)}</ol></section>)}
      {!timeline.error && timeline.entries.length === 0 && <div className="timeline-empty"><p>{c.empty}</p><Link className="button secondary" to="/diaries/new">{t('write')}</Link></div>}
    </>}
    {timeline.error && <div className="timeline-recovery"><FailureNotice failure={timeline.error} id="timeline-error" /><div className="actions"><button type="button" onClick={timeline.retry}>{t('retry')}</button>{timeline.error.code?.startsWith('AUTH_') && <Link to={signInPath('/timeline')}>{t('login')}</Link>}</div></div>}
    {!timeline.error && !timeline.loading && timeline.hasMore && <button type="button" className="secondary timeline-more" disabled={timeline.loadingMore} onClick={timeline.loadMore}>{timeline.loadingMore ? t('loading') : c.more}</button>}
    {!timeline.loading && !timeline.error && timeline.entries.length > 0 && !timeline.hasMore && <p className="muted">{c.all}</p>}
  </section>;
}
