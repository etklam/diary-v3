import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { stockNoteCreateRequestSchema, stockNoteListResponseSchema, type StockNoteResponse } from '@diary/contracts/stock-note';
import { partnerListResponseSchema, type PartnerLinkResponse } from '@diary/contracts/partners';
import type { z } from 'zod';
import { api, useUi } from './ui';
import { useSessionState } from './session';
import { apiFailure, FailureNotice, type Failure } from './api-error';
import { noteCopy } from './stock-notes-copy';
import { Markdown } from './markdown';
import './trade-plan.css';
import './evidence.css';

type Form = { title: string; content: string; date: string; original: StockNoteResponse | null };
export function StockNotes({ symbol }: { symbol: string }) {
  const { locale, t } = useUi(), c = noteCopy[locale], session = useSessionState();
  const [data, setData] = useState<z.infer<typeof stockNoteListResponseSchema> | null>(null), [page, setPage] = useState(1), [origin, setOrigin] = useState<'' | 'USER' | 'AGENT'>('');
  const [partnerId, setPartnerId] = useState(''), [partners, setPartners] = useState<PartnerLinkResponse[]>([]), [partnerError, setPartnerError] = useState<Failure | null>(null);
  const [attempt, reload] = useState(0), [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null);
  const [form, setForm] = useState<Form | null>(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [preview, setPreview] = useState(false), [timezone, setTimezone] = useState('UTC');
  const dirty = useRef(false), request = useRef<AbortController | null>(null), translate = useRef(t), editor = useRef<HTMLDivElement>(null); translate.current = t;
  const blocker = useBlocker(() => dirty.current && session.authenticated === true);
  useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm(c.discard)) { dirty.current = false; blocker.proceed(); } else blocker.reset(); } }, [blocker, c.discard]);
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => { request.current?.abort(); window.removeEventListener('beforeunload', unload); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    if (session.authenticated !== true) return;
    Promise.all([api.GET('/api/stocks/{symbol}/notes', { params: { path: { symbol }, query: { page, limit: 20, ...(partnerId ? { partnerId } : {}), ...(origin ? { createdVia: origin } : {}) } }, signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
      if (controller.signal.aborted) return;
      if (!user.response.ok || !user.data) { setError(apiFailure(user.error, translate.current('failed'))); return; }
      setTimezone(user.data.data.timezone);
      const parsed = stockNoteListResponseSchema.safeParse(result.data);
      if (!parsed.success) setError(apiFailure(result.error, translate.current('failed'))); else if (page > Math.max(1, parsed.data.pagination.totalPages)) setPage(Math.max(1, parsed.data.pagination.totalPages)); else setData(parsed.data);
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
    return () => controller.abort();
  }, [symbol, page, origin, partnerId, attempt, session.authenticated]);
  useEffect(() => {
    const controller = new AbortController(); setPartnerError(null);
    if (session.authenticated !== true) { setPartners([]); return; }
    api.GET('/api/partners', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = partnerListResponseSchema.safeParse(result.data);
      if (!parsed.success) { setPartners([]); setPartnerError(apiFailure(result.error, translate.current('failed'))); return; }
      setPartners(parsed.data.links.filter(row => row.status === 'connected' && row.partnerSharesStockNotes));
    }).catch(() => { if (!controller.signal.aborted) { setPartners([]); setPartnerError(apiFailure(null, translate.current('connection'))); } });
    return () => controller.abort();
  }, [attempt, session.authenticated]);
  useEffect(() => { const refresh = () => reload(value => value + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  function open(note: StockNoteResponse | null) {
    if (dirty.current && !window.confirm(c.discard)) return;
    dirty.current = false; setWriteError(null); setSaved(false); setPreview(false);
    setForm({ title: note?.title ?? '', content: note?.content ?? '', date: (note?.date ?? new Date().toISOString()).slice(0, 16), original: note });
    setTimeout(() => editor.current?.querySelector('input')?.focus(), 0);
  }
  async function mutate(remove?: StockNoteResponse) {
    if (request.current || (!remove && !form)) return;
    if (remove && !window.confirm(c.confirm)) return;
    const parsed = form ? stockNoteCreateRequestSchema.safeParse({ title: form.title, content: form.content, date: form.original && form.date === form.original.date.slice(0, 16) ? form.original.date : form.date + ':00Z' }) : null;
    if (!remove && !parsed?.success) { setWriteError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true); setWriteError(null); setSaved(false);
    try {
      const result = remove ? await api.DELETE('/api/stocks/{symbol}/notes/{id}', { params: { path: { symbol, id: remove.id } }, signal: controller.signal })
        : parsed?.success && form?.original ? await api.PUT('/api/stocks/{symbol}/notes/{id}', { params: { path: { symbol, id: form.original.id } }, body: parsed.data, signal: controller.signal })
        : parsed?.success ? await api.POST('/api/stocks/{symbol}/notes', { params: { path: { symbol } }, body: parsed.data, signal: controller.signal }) : null;
      if (controller.signal.aborted) return;
      if (!result?.response.ok) { setWriteError(apiFailure(result?.error, t('failed'))); return; }
      if (!remove || form?.original?.id === remove.id) { dirty.current = false; setForm(null); }
      setSaved(!remove); reload(value => value + 1);
    } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))); }
    finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); } }
  }
  if (session.authenticated !== true) return null;
  return <section className="evidence-section" aria-label={c.heading}><header className="plan-header"><div><h2>{c.heading}</h2><p>{c.hint}</p></div><div className="actions"><button className="secondary" disabled={busy} onClick={() => { setData(null); reload(value => value + 1); }}>{c.refresh}</button>{!partnerId && <button disabled={busy} onClick={() => open(null)}>{c.add}</button>}</div></header>
    {form && <div ref={editor}><h3>{form.original ? c.editing : c.add}</h3><form className="plan-form" onSubmit={event => { event.preventDefault(); void mutate(); }}><fieldset disabled={busy}><div className="plan-grid">{(['title', 'date'] as const).map(field => <label key={field}>{c[field]}<input required type={field === 'date' ? 'datetime-local' : 'text'} maxLength={field === 'title' ? 255 : undefined} value={form[field]} onChange={event => { dirty.current = true; setForm({ ...form, [field]: event.target.value }); }}/></label>)}<label className="plan-wide">{c.content}<textarea required maxLength={50000} rows={10} value={form.content} onChange={event => { dirty.current = true; setForm({ ...form, content: event.target.value }); }}/></label></div></fieldset><div className="actions"><button disabled={busy}>{busy ? t('pending') : c.save}</button><button type="button" className="secondary" disabled={busy} onClick={() => { if (!dirty.current || window.confirm(c.discard)) { dirty.current = false; setForm(null); setWriteError(null); } }}>{c.cancel}</button><button type="button" className="secondary" onClick={() => setPreview(value => !value)} aria-expanded={preview}>{c.preview}</button></div>{preview && <Markdown>{form.content}</Markdown>}</form></div>}
    <FailureNotice failure={writeError}/>{saved && <p role="status">{c.saved}</p>}
    <FailureNotice failure={partnerError}/>
    <label className="plan-filters">{c.owner}<select disabled={busy} value={partnerId} onChange={event => { if (dirty.current && !window.confirm(c.discard)) return; dirty.current = false; setForm(null); setWriteError(null); setSaved(false); setData(null); setPartnerId(event.target.value); setPage(1); }}><option value="">{c.mine}</option>{partners.map(row => <option key={row.partner.id} value={row.partner.id}>{row.partner.name || `${c.partner} ${row.partner.id}`}</option>)}{partnerId && !partners.some(row => row.partner.id === partnerId) && <option value={partnerId}>{c.partner}</option>}</select></label>
    {partnerId && <p>{c.readonly}</p>}
    <label className="plan-filters">{c.filter}<select value={origin} onChange={event => { setOrigin(event.target.value as typeof origin); setPage(1); }}><option value="">{c.all}</option><option value="USER">{partnerId ? c.human : c.user}</option><option value="AGENT">{c.agent}</option></select></label>
    {error ? <><FailureNotice failure={error}/><button onClick={() => reload(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>{!data.data.length ? <p>{c.empty}</p> : <ul className="plan-list">{data.data.map(note => <li key={note.id} data-testid="stock-note"><h3>{note.title}</h3><p><time dateTime={note.date}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(note.date))} · {timezone}</time> · {note.createdVia === 'USER' ? partnerId ? c.human : c.user : c.agent}{note.createdByLabel ? ` · ${note.createdByLabel}` : ''}</p><Markdown>{note.content}</Markdown>{note.isOwnedByViewer && note.createdVia === 'USER' && <div className="actions"><button className="secondary" disabled={busy} onClick={() => open(note)}>{c.edit}</button><button className="secondary" disabled={busy} onClick={() => void mutate(note)}>{c.remove}</button></div>}</li>)}</ul>}<nav className="plan-pagination" aria-label={c.heading}><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{c.previous}</button><span>{page} / {Math.max(1, data.pagination.totalPages)}</span><button disabled={page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>{c.next}</button></nav></>}
  </section>;
}
