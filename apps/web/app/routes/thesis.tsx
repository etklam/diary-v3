import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { INVESTMENT_THESIS_STATUSES, THESIS_REVIEW_OUTCOMES, THESIS_PORTFOLIO_DECISIONS, investmentThesisResponseSchema, saveInvestmentThesisRequestSchema, completeThesisReviewRequestSchema, type InvestmentThesisResponse, type SaveInvestmentThesisRequest, type CompleteThesisReviewInput } from '@diary/contracts/investment-thesis';
import { stockSymbolSchema } from '@diary/contracts/watchlist';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath, useSessionState } from '../session';
import { thesisCopy } from '../thesis-copy';
import '../trade-plan.css';
const fields = ['summary', 'whyIOwnIt', 'growthDrivers', 'risks', 'invalidationConditions', 'expectedHoldingPeriod'] as const;
const reflections = ['whatImproved', 'whatDeteriorated', 'whatChanged'] as const;
const emptyReview = (): CompleteThesisReviewInput => ({ outcome: 'UNCLEAR', portfolioDecision: 'CONTINUE_WATCHING', whatImproved: '', whatDeteriorated: '', whatChanged: '', invalidationTriggered: false });
export default function ThesisPage() {
  const { symbol = '' } = useParams(), { locale, t } = useUi(), c = thesisCopy[locale], session = useSessionState();
  const [data, setData] = useState<InvestmentThesisResponse | null>(null), [draft, setDraft] = useState<SaveInvestmentThesisRequest>({ status: 'DRAFT' }), [review, setReview] = useState(emptyReview);
  const [due, setDue] = useState(''), [timezone, setTimezone] = useState('UTC'), [attempt, reload] = useState(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState<'saved' | 'reviewed' | null>(null);
  const [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null);
  const reviewDirty = useRef(false);
  const dirty = useRef(false), thesisDirty = useRef(false), request = useRef<AbortController | null>(null), translate = useRef(t); translate.current = t;
  const blocker = useBlocker(() => dirty.current && session.authenticated !== false);
  useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm(c.discard)) { dirty.current = false; blocker.proceed(); } else blocker.reset(); } }, [blocker, c.discard]);
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => { request.current?.abort(); window.removeEventListener('beforeunload', unload); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    if (!stockSymbolSchema.safeParse(symbol).success) { setError({ message: translate.current('failed'), code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
    Promise.all([api.GET('/api/stocks/{symbol}/thesis', { params: { path: { symbol }, query: { limit: 100 } }, signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
      if (controller.signal.aborted) return;
      const parsed = investmentThesisResponseSchema.safeParse(result.data);
      if (!parsed.success || !user.data || !user.response.ok) { setError(apiFailure(result.error ?? user.error, translate.current('failed'))); return; }
      setData(parsed.data); setTimezone(user.data.data.timezone);
      const thesis = parsed.data.thesis;
      setDraft(Object.fromEntries([['status', thesis?.status ?? 'DRAFT'], ...fields.map(field => [field, thesis?.[field] ?? ''])]));
      setDue(thesis?.reviewDueAt?.slice(0, 16) ?? ''); dirty.current = reviewDirty.current; thesisDirty.current = false;
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
    return () => controller.abort();
  }, [symbol, attempt]);
  async function submit(isReview: boolean) {
    if (request.current) return;
    const reviewDueAt = due ? due === data?.thesis?.reviewDueAt?.slice(0, 16) ? data.thesis.reviewDueAt : due + ':00Z' : null;
    const parsedDraft = saveInvestmentThesisRequestSchema.safeParse({ ...draft, reviewDueAt }), parsedReview = completeThesisReviewRequestSchema.safeParse(review);
    if (isReview ? !parsedReview.success : !parsedDraft.success) { setWriteError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true); setWriteError(null); setNotice(null);
    try {
      const result = isReview && parsedReview.success ? await api.POST('/api/stocks/{symbol}/thesis/reviews', { params: { path: { symbol } }, body: parsedReview.data, signal: controller.signal }) : parsedDraft.success ? await api.PUT('/api/stocks/{symbol}/thesis', { params: { path: { symbol } }, body: parsedDraft.data, signal: controller.signal }) : null;
      if (controller.signal.aborted) return;
      if (!result?.response.ok) { setWriteError(apiFailure(result?.error, t('failed'))); return; }
      if (isReview) { setReview(emptyReview()); reviewDirty.current = false; } dirty.current = reviewDirty.current; thesisDirty.current = false; setNotice(isReview ? 'reviewed' : 'saved'); reload(value => value + 1);
    } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))); }
    finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); } }
  }
  const instant = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value)) + ` · ${timezone}`;
  return <section className="plan-page"><Link to={`/stocks/${encodeURIComponent(symbol)}`}>{c.company}</Link><h1>{symbol} · {c.title}</h1><p className="lede">{c.hint}</p>{error ? <><FailureNotice failure={error}/><Link to={signInPath(`/stocks/${symbol}/thesis`)}>{t('login')}</Link><button onClick={() => reload(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>
    <h2>{c.current}</h2>{data.thesis && <p data-testid="thesis-health">{c[data.thesis.health]}</p>}
    <form className="plan-form" aria-label={c.current} onSubmit={event => { event.preventDefault(); void submit(false); }}><fieldset disabled={busy}><div className="plan-grid"><label>{c.status}<select value={draft.status} onChange={event => { dirty.current = true; thesisDirty.current = true; setDraft({ ...draft, status: event.target.value as SaveInvestmentThesisRequest['status'] }); }}>{INVESTMENT_THESIS_STATUSES.map(status => <option key={status} value={status}>{c[status]}</option>)}</select></label><label>{c.reviewDueAt}<input type="datetime-local" value={due} onChange={event => { dirty.current = true; thesisDirty.current = true; setDue(event.target.value); }}/></label>{fields.map(field => <label className={field === 'expectedHoldingPeriod' ? '' : 'plan-wide'} key={field}>{c[field]}<textarea rows={field === 'expectedHoldingPeriod' ? 2 : 4} maxLength={field === 'summary' ? 10000 : field === 'expectedHoldingPeriod' ? 255 : 20000} required={draft.status === 'ACTIVE' && (field === 'summary' || field === 'whyIOwnIt')} value={draft[field] ?? ''} onChange={event => { dirty.current = true; thesisDirty.current = true; setDraft({ ...draft, [field]: event.target.value }); }}/></label>)}</div></fieldset><button disabled={busy}>{busy ? t('pending') : c.save}</button></form>
    <FailureNotice failure={writeError}/>{notice && <p role="status">{c[notice]}</p>}
    <h2>{c.review}</h2>{data.thesis?.status !== 'ACTIVE' ? <p>{c.activate}</p> : <form className="plan-form" aria-label={c.review} onSubmit={event => { event.preventDefault(); void submit(true); }}>{thesisDirty.current&&<p role="status">{c.saveFirst}</p>}<fieldset disabled={busy || thesisDirty.current}><div className="plan-grid"><label>{c.outcome}<select value={review.outcome} onChange={event => { dirty.current = true; reviewDirty.current = true; setReview({ ...review, outcome: event.target.value as CompleteThesisReviewInput['outcome'] }); }}>{THESIS_REVIEW_OUTCOMES.map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label><label>{c.portfolioDecision}<select value={review.portfolioDecision} onChange={event => { dirty.current = true; reviewDirty.current = true; setReview({ ...review, portfolioDecision: event.target.value as CompleteThesisReviewInput['portfolioDecision'] }); }}>{THESIS_PORTFOLIO_DECISIONS.map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>{reflections.map(field => <label key={field} className="plan-wide">{c[field]}<textarea rows={4} maxLength={20000} value={review[field] ?? ''} onChange={event => { dirty.current = true; reviewDirty.current = true; setReview({ ...review, [field]: event.target.value }); }}/></label>)}<label><input type="checkbox" checked={review.invalidationTriggered ?? false} onChange={event => { dirty.current = true; reviewDirty.current = true; setReview({ ...review, invalidationTriggered: event.target.checked }); }}/>{c.invalidationTriggered}</label></div></fieldset><button disabled={busy || thesisDirty.current}>{busy ? t('pending') : c.review}</button></form>}
    <h2>{c.history}</h2>{!data.reviews.length ? <p>{c.empty}</p> : <ol className="plan-list">{data.reviews.map(item => <li key={item.id} id={`review-${item.id}`} data-testid="thesis-review"><h3><time dateTime={item.reviewedAt}>{instant(item.reviewedAt)}</time></h3><p>{c[item.outcome]} · {c[item.portfolioDecision]}</p>{reflections.map(field => <div key={field}><h4>{c[field]}</h4><p style={{ whiteSpace: 'pre-wrap' }}>{item[field] || c.blank}</p></div>)}<p>{c.invalidationTriggered}: {item.invalidationTriggered ? c.yes : c.no}</p><details><summary>{c.snapshot}</summary><p>{c[item.snapshot.status]}</p>{fields.map(field => <div key={field}><h4>{c[field]}</h4><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.snapshot[field] || c.blank}</p></div>)}<p>{c.dueDisplay}: {item.snapshot.reviewDueAt ? instant(item.snapshot.reviewDueAt) : c.blank}</p></details></li>)}</ol>}
  </>}</section>;
}
