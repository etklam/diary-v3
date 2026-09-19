import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router';
import { STOCK_TIMELINE_SOURCE_TYPES, stockSymbolTimelineResponseSchema, stockTimelineRecordSchema, webEvidenceRequestSchema, type StockTimelineRecord } from '@diary/contracts/evidence';
import { stockSymbolSchema } from '@diary/contracts/watchlist';
import type { z } from 'zod';
import { api, useUi } from './ui';
import { apiFailure, FailureNotice, type Failure } from './api-error';
import { evidenceCopy } from './evidence-copy';
import { useSessionState, signInPath } from './session';
import './trade-plan.css';
import './evidence.css';

type Capture = { symbol: string; body: z.infer<typeof webEvidenceRequestSchema> };
type EvidenceSource = { title: string; path: string };

function EvidenceNavigationGuard({ dirty, authenticated, discardMessage, onProceed }: { dirty: boolean; authenticated: boolean | null; discardMessage: string; onProceed: () => void }) {
  const blocker = useBlocker(() => dirty && authenticated !== false);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(discardMessage)) {
      onProceed();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, discardMessage, onProceed]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  return null;
}

export function Evidence({ symbol: fixedSymbol, source, collapsed = false }: { symbol?: string; source?: EvidenceSource; collapsed?: boolean }) {
  const { locale, t } = useUi();
  const c = evidenceCopy[locale];
  const session = useSessionState();
  const [symbol, setSymbol] = useState(fixedSymbol ?? '');
  const [summary, setSummary] = useState('');
  const [sourceType, setSourceType] = useState<(typeof STOCK_TIMELINE_SOURCE_TYPES)[number]>(source ? 'DIARY' : 'MANUAL');
  const [sourceTitle, setSourceTitle] = useState(source?.title ?? '');
  const [sourceUrl, setSourceUrl] = useState('');
  const [date, setDate] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [records, setRecords] = useState<StockTimelineRecord[] | null>(null);
  const [attempt, reload] = useState(0);
  const [readError, setReadError] = useState<Failure | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedRecord, setSavedRecord] = useState<StockTimelineRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(!collapsed);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(!collapsed);
  const submission = useRef<Capture | null>(null);
  const request = useRef<AbortController | null>(null);
  const translate = useRef(t);
  translate.current = t;
  const captureId = `evidence-capture-${fixedSymbol ?? 'diary'}`;

  useEffect(() => {
    setDate(new Date().toISOString().slice(0, 16));
    if (source) setSourceUrl(new URL(source.path, location.origin).href);
    return () => request.current?.abort();
  }, []);

  useEffect(() => {
    if (!collapsed) return;
    if (open && !wasOpen.current) firstField.current?.focus();
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [collapsed, open]);

  useEffect(() => {
    const controller = new AbortController();
    setRecords(null);
    setReadError(null);
    if (!fixedSymbol || session.authenticated !== true) return;
    Promise.all([
      api.GET('/api/stocks/{symbol}/timeline', { params: { path: { symbol: fixedSymbol }, query: { limit: 200 } }, signal: controller.signal }),
      api.GET('/api/auth/me', { signal: controller.signal }),
    ]).then(([result, user]) => {
      if (controller.signal.aborted) return;
      if (!user.response.ok || !user.data) {
        setReadError(apiFailure(user.error, translate.current('failed')));
        return;
      }
      setTimezone(user.data.data.timezone);
      const parsed = stockSymbolTimelineResponseSchema.safeParse(result.data);
      if (parsed.success) setRecords(parsed.data.records);
      else setReadError(apiFailure(result.error, translate.current('failed')));
    }).catch(() => {
      if (!controller.signal.aborted) setReadError(apiFailure(null, translate.current('connection')));
    });
    return () => controller.abort();
  }, [fixedSymbol, attempt, session.authenticated]);

  async function capture() {
    if (request.current) return;
    if (!submission.current) {
      const company = stockSymbolSchema.safeParse(symbol);
      const body = webEvidenceRequestSchema.safeParse({
        summary,
        sourceType,
        sourceTitle: sourceTitle.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        occurredAt: date.length === 16 ? date + ':00Z' : date + 'Z',
        idempotencyKey: crypto.randomUUID(),
      });
      if (!company.success || !body.success) {
        setError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: [] });
        return;
      }
      submission.current = { symbol: company.data, body: body.data };
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.POST('/api/stocks/{symbol}/evidence', { params: { path: { symbol: submission.current.symbol } }, body: submission.current.body, signal: controller.signal });
      if (controller.signal.aborted) return;
      const parsed = stockTimelineRecordSchema.safeParse(result.data);
      if (!result.response.ok || !parsed.success) {
        setError(apiFailure(result.error, t('failed')));
        // Only explicit validation/auth rejection proves the write did not occur.
        if ([400, 401, 403].includes(result.response.status)) {
          submission.current = null;
          setUncertain(false);
        } else {
          setUncertain(true);
        }
        return;
      }
      submission.current = null;
      setUncertain(false);
      setSaved(true);
      setSavedRecord(parsed.data);
      setDirty(false);
      setSummary('');
      reload(value => value + 1);
    } catch {
      if (!controller.signal.aborted) {
        setError(apiFailure(null, t('connection')));
        setUncertain(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  if (!stockSymbolSchema.safeParse(fixedSymbol ?? 'AAPL').success) return null;
  if (session.authenticated !== true) return <p><Link to={signInPath(fixedSymbol ? `/stocks/${fixedSymbol}` : source?.path ?? '/stocks/watchlist')}>{t('login')}</Link></p>;

  const markDirty = () => setDirty(true);
  const destination = savedRecord?.sourceDiaryId ? <Link data-testid="evidence-destination" to={`/diaries/${savedRecord.sourceDiaryId}`}>{c.diary}</Link> : savedRecord?.sourceUrl && /^https?:\/\//i.test(savedRecord.sourceUrl) ? <a data-testid="evidence-destination" href={savedRecord.sourceUrl} target="_blank" rel="noopener noreferrer">{c.original}</a> : null;

  return <section className={`evidence-section${collapsed ? ' evidence-section-collapsible' : ''}`} aria-label={c.title}>
    {collapsed && <EvidenceNavigationGuard dirty={dirty} authenticated={session.authenticated} discardMessage={c.discard} onProceed={() => setDirty(false)} />}
    {collapsed && !open ? <button ref={trigger} type="button" className="secondary evidence-open" aria-expanded={false} aria-controls={captureId} onClick={() => setOpen(true)}>{c.open}</button> : <div id={captureId} className="evidence-capture">
      <div className="evidence-heading"><h2>{c.title}</h2>{collapsed && <button type="button" className="secondary evidence-close" aria-expanded={true} aria-controls={captureId} onClick={() => setOpen(false)}>{c.close}</button>}</div>
      <p>{c.hint}</p>
      <form className="plan-form" onSubmit={event => { event.preventDefault(); void capture(); }}>
        <fieldset disabled={busy || uncertain}><div className="plan-grid">
          {!fixedSymbol && <label>{c.symbol}<input ref={element => { firstField.current = element; }} required value={symbol} maxLength={32} onChange={event => { markDirty(); setSymbol(event.target.value); }} /></label>}
          <label>{c.source}<select ref={element => { if (fixedSymbol) firstField.current = element; }} value={sourceType} onChange={event => { markDirty(); setSourceType(event.target.value as typeof sourceType); }}>{STOCK_TIMELINE_SOURCE_TYPES.map((type, index) => <option key={type} value={type}>{c.types[index]}</option>)}</select></label>
          <label>{c.date}<input type="datetime-local" required value={date} onChange={event => { markDirty(); setDate(event.target.value); }} /></label>
          <label className="plan-wide">{c.summary}<textarea required maxLength={10000} rows={5} value={summary} onChange={event => { markDirty(); setSummary(event.target.value); }} /></label>
          <label>{c.sourceTitle}<input maxLength={255} value={sourceTitle} onChange={event => { markDirty(); setSourceTitle(event.target.value); }} /></label>
          <label>{c.url}<input type="url" maxLength={1000} value={sourceUrl} onChange={event => { markDirty(); setSourceUrl(event.target.value); }} /></label>
        </div></fieldset>
        {uncertain && <p role="status">{c.uncertain}</p>}
        {error && <FailureNotice failure={error} />}
        <button disabled={busy || !date}>{busy ? t('pending') : uncertain ? c.retry : c.save}</button>
        {saved && <p role="status" className="evidence-saved"><span>{c.saved}</span>{destination && <> · {destination}</>}</p>}
      </form>
      {fixedSymbol && <><h3>{c.timeline}</h3><p>{c.limit}</p>{readError ? <><FailureNotice failure={readError} /><button onClick={() => reload(value => value + 1)}>{t('retry')}</button></> : !records ? <p role="status">{t('loading')}</p> : !records.length ? <p>{c.empty}</p> : <ol className="plan-list">{records.map(record => <li key={record.id} data-testid="evidence-record"><p><time dateTime={record.occurredAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(record.occurredAt))} · {timezone}</time> · {c.types[STOCK_TIMELINE_SOURCE_TYPES.indexOf(record.sourceType)]}</p>{record.confidence !== null && <p>{c.confidence}: {record.confidence}%</p>}{record.sourceTitle && <h4>{record.sourceTitle}</h4>}<p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.summary}</p>{record.sourceDiaryId && <Link to={`/diaries/${record.sourceDiaryId}`}>{c.diary}</Link>}{record.sourceUrl && /^https?:\/\//i.test(record.sourceUrl) && <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer">{c.original}</a>}</li>)}</ol>}</>}
    </div>}
  </section>;
}
