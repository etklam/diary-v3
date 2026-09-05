import { DisciplineTransfer } from '../discipline-transfer';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker, useLocation } from 'react-router';
import { disciplineListSchema, randomDisciplineSchema, writeDisciplineSchema, type DisciplineResponse } from '@diary/contracts/discipline';
import { api, useUi } from '../ui';
import { signInPath, useSessionState } from '../session';
import { FailureNotice, apiFailure, type Failure } from '../api-error';
import { disciplineCopy } from '../discipline-copy';
import '../trade-plan.css';
export default function Discipline() {
 const { locale, t } = useUi(), c = disciplineCopy[locale], session = useSessionState(), location = useLocation();
 const [rows, setRows] = useState<DisciplineResponse[] | null>(null), [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null);
 const [attempt, retry] = useState(0), [timezone, setTimezone] = useState('UTC'), [pending, setPending] = useState(false), [saved, setSaved] = useState(false);
 const [content, setContent] = useState(''), [editing, setEditing] = useState<string | null>(null), [drawn, setDrawn] = useState<{ content: string; isCustom: boolean } | null>(null);
 const input = useRef<HTMLTextAreaElement>(null), dirty = useRef(false), transferDirty = useRef(false), mutation = useRef<AbortController | null>(null), translate = useRef(t); translate.current = t;
 const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && (dirty.current || transferDirty.current) && session.authenticated !== false);
 useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm(c.discard)) blocker.proceed(); else blocker.reset(); } }, [blocker, c.discard]);
 useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
 useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (dirty.current || transferDirty.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', leave); return () => { mutation.current?.abort(); window.removeEventListener('beforeunload', leave); }; }, []);
 useEffect(() => {
  const controller = new AbortController(); setError(null);
  Promise.all([api.GET('/api/discipline', { signal: controller.signal }), api.GET('/api/auth/me', { signal: controller.signal })]).then(([result, user]) => {
   if (controller.signal.aborted) return;
   const parsed = disciplineListSchema.safeParse(result.data);
   if (!result.response.ok || !parsed.success || !user.data) { setError(apiFailure(result.error ?? user.error, translate.current('failed'))); return; }
   setRows(parsed.data); setTimezone(user.data.data.timezone);
  }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
  return () => controller.abort();
 }, [attempt]);
 function clear() { dirty.current = false; setContent(''); setEditing(null); }
 async function run(task: (signal: AbortSignal) => Promise<void>, recoverUncertain?: (signal: AbortSignal) => Promise<void>) {
  if (pending) return;
  setPending(true); setWriteError(null); setSaved(false); const controller = new AbortController(); mutation.current = controller;
  try { await task(controller.signal); }
  catch { if (!controller.signal.aborted) { if (recoverUncertain) { try { await recoverUncertain(controller.signal); } catch { setWriteError({ message: c.uncertain, fields: [] }); } } else setWriteError(apiFailure(null, t('connection'))); } }
  finally { if (!controller.signal.aborted) setPending(false); }
 }
 async function save(event: FormEvent) {
  event.preventDefault(); const parsed = writeDisciplineSchema.safeParse({ content });
  if (!parsed.success) { setWriteError({ message: c.invalid, fields: [] }); return; }
  const wasEditing = editing, before = rows ?? [], beforeIds = new Set(before.map(row => row.id)), appendStart = before.length ? Math.max(...before.map(row => row.order)) + 1 : 0;
  const reconcileCreate = async (signal: AbortSignal) => {
   const result = await api.GET('/api/discipline', { signal }), latest = disciplineListSchema.safeParse(result.data);
   if (!result.response.ok || !latest.success) { setWriteError({ message: c.uncertain, fields: [] }); return; }
   const created = latest.data.slice(before.length);
   const prefixMatches = before.every((row, index) => latest.data[index]?.id === row.id && latest.data[index]?.content === row.content && latest.data[index]?.order === row.order);
   const committed = latest.data.length === before.length + 1 && prefixMatches && created[0] !== undefined && !beforeIds.has(created[0].id) && created[0].content === parsed.data.content && created[0].order === appendStart;
   if (!committed) { setWriteError({ message: c.uncertain, fields: [] }); return; }
   setRows(latest.data); clear(); setDrawn(null); setSaved(true); input.current?.focus();
  };
  await run(async signal => {
   const result = wasEditing ? await api.PUT('/api/discipline/{id}', { params: { path: { id: wasEditing } }, body: parsed.data, signal }) : await api.POST('/api/discipline', { body: parsed.data, signal });
   if (signal.aborted) return;
   if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return; }
   clear(); setDrawn(null); setSaved(true); retry(value => value + 1); input.current?.focus();
  }, wasEditing ? undefined : reconcileCreate);
 }
 function remove(id: string) { void run(async signal => {
  const result = await api.DELETE('/api/discipline/{id}', { params: { path: { id } }, signal });
  if (signal.aborted) return;
  if (!result.response.ok && !(result.response.status === 404 && result.error?.data.code === 'DISCIPLINE_NOT_FOUND')) { setWriteError(apiFailure(result.error, t('failed'))); return; }
  setRows(previous => previous?.filter(row => row.id !== id) ?? null); setDrawn(null); setSaved(true);
 }); }
 function move(index: number, offset: number) { if (!rows) return; const reordered = [...rows]; const target = index + offset;
  if (target < 0 || target >= rows.length) return;
  [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!]; const movedId = rows[index]!.id;
  void run(async signal => {
   const result = await api.PATCH('/api/discipline/reorder', { body: reordered.map((row, order) => ({ id: row.id, order })), signal });
   if (signal.aborted) return; const parsed = disciplineListSchema.safeParse(result.data);
   if (!result.response.ok || !parsed.success) { setWriteError(apiFailure(result.error, t('failed'))); return; }
   setRows(parsed.data); setSaved(true); requestAnimationFrame(() => document.getElementById(`principle-${movedId}`)?.focus());
  });
 }
 function draw() { void run(async signal => {
  const result = await api.GET('/api/discipline/random', { signal });
  if (signal.aborted) return; const parsed = randomDisciplineSchema.safeParse(result.data);
  if (!result.response.ok || !parsed.success) { setWriteError(apiFailure(result.error, t('failed'))); return; }
  setDrawn(parsed.data);
 }); }
 return <section className="plan-page"><h1>{c.title}</h1><p className="lede">{c.intro}</p>{error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath(location.pathname + location.search)}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : rows === null ? <p role="status">{t('loading')}</p> : <>
  <form className="plan-form" onSubmit={save}><fieldset disabled={pending}><legend>{editing ? c.edit : c.create}</legend><label>{c.content}<textarea ref={input} aria-label={c.content} required maxLength={255} rows={3} value={content} onChange={event => { dirty.current = true; setContent(event.target.value); }}/></label><div className="actions" style={{ marginTop: 20 }}><button type="submit">{pending ? t('pending') : editing ? c.save : c.create}</button>{(editing || content) && <button className="secondary" type="button" onClick={clear}>{c.cancel}</button>}</div></fieldset></form>
  <FailureNotice failure={writeError}/>{saved && <p role="status">{c.saved}</p>}<button className="secondary" disabled={pending} onClick={draw}>{c.draw}</button>{drawn && <div role="status"><p className="muted">{drawn.isCustom ? c.custom : c.fallback}</p><p style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{drawn.content}</p></div>}
  <h2>{c.list}</h2>{!rows.length ? <p>{c.empty}</p> : <ol className="plan-list">{rows.map((row, index) => <li key={row.id} data-testid="principle"><p id={`principle-${row.id}`} tabIndex={-1} style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{row.content}</p><p className="muted">{c.created}: <time dateTime={row.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(row.createdAt))}</time></p><div className="actions"><button className="secondary" disabled={pending || editing !== null || dirty.current || index === 0} onClick={() => move(index, -1)}>{c.up}</button><button className="secondary" disabled={pending || editing !== null || dirty.current || index === rows.length - 1} onClick={() => move(index, 1)}>{c.down}</button><button className="secondary" disabled={pending || editing !== null || dirty.current} onClick={() => { setEditing(row.id); setContent(row.content); setWriteError(null); }}>{c.edit}</button><button className="secondary" disabled={pending || editing !== null || dirty.current} onClick={() => remove(row.id)}>{c.remove}</button></div></li>)}</ol>}
 <DisciplineTransfer draftState={transferDirty} principles={rows} disabled={pending || editing !== null || dirty.current} onImported={() => { setDrawn(null); retry(value => value + 1); }}/></>}</section>;
}
