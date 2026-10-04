import { DisciplineTransfer } from '../discipline-transfer';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useBlocker, useLocation } from 'react-router';
import { disciplineListSchema, randomDisciplineSchema, writeDisciplineSchema, type DisciplineResponse } from '@diary/contracts/discipline';
import { api, useUi } from '../ui';
import { signInPath, useSessionState } from '../session';
import { FailureNotice, apiFailure, type Failure } from '../api-error';
import { disciplineCopy, principleCount, principleNumber } from '../discipline-copy';
import { Icon } from '../icons';
import '../trade-plan.css';
const LIMIT = 255, COUNTER_FROM = 200, STATUS_MS = 6000;
export default function Discipline() {
 const { locale, t } = useUi(), c = disciplineCopy[locale], session = useSessionState(), location = useLocation();
 const [rows, setRows] = useState<DisciplineResponse[] | null>(null), [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null);
 const [attempt, retry] = useState(0), [timezone, setTimezone] = useState('UTC'), [pending, setPending] = useState(false), [status, setStatus] = useState('');
 const [content, setContent] = useState(''), [editing, setEditing] = useState<string | null>(null), [editContent, setEditContent] = useState(''), [doomed, setDoomed] = useState<DisciplineResponse | null>(null);
 const [drawn, setDrawn] = useState<{ content: string; isCustom: boolean } | null>(null);
 const input = useRef<HTMLTextAreaElement>(null), editInput = useRef<HTMLTextAreaElement>(null), dirty = useRef(false), transferDirty = useRef(false), mutation = useRef<AbortController | null>(null), translate = useRef(t); translate.current = t;
 const deleteDialog = useRef<HTMLDialogElement>(null), discardDialog = useRef<HTMLDialogElement>(null), focusAfterEdit = useRef<string | null>(null);
 // One honest definition of unsaved work for both the router blocker and the unload guard.
 useEffect(() => { dirty.current = Boolean(content.trim()) || editing !== null; }, [content, editing]);
 const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && (dirty.current || transferDirty.current) && session.authenticated !== false);
 useEffect(() => { if (blocker.state === 'blocked') discardDialog.current?.showModal(); else discardDialog.current?.close(); }, [blocker.state]);
 useEffect(() => { if (editing) editInput.current?.focus(); }, [editing]);
 // Leaving the row editor must not drop focus to the body: send it back to the sentence once the row has rendered again.
 useEffect(() => { if (editing !== null || !focusAfterEdit.current) return; const id = focusAfterEdit.current; focusAfterEdit.current = null; document.getElementById(`principle-${id}`)?.focus(); }, [editing, rows]);
 // A confirmation that stays on screen says nothing; clear it once it has been announced.
 useEffect(() => { if (!status) return; const timer = setTimeout(() => setStatus(''), STATUS_MS); return () => clearTimeout(timer); }, [status]);
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
 function clear() { setContent(''); }
 function stopEditing() { setEditing(null); setEditContent(''); }
 async function run(task: (signal: AbortSignal) => Promise<void>, recoverUncertain?: (signal: AbortSignal) => Promise<void>) {
  if (pending) return;
  setPending(true); setWriteError(null); setStatus(''); const controller = new AbortController(); mutation.current = controller;
  try { await task(controller.signal); }
  catch { if (!controller.signal.aborted) { if (recoverUncertain) { try { await recoverUncertain(controller.signal); } catch { setWriteError({ message: c.uncertain, fields: [] }); } } else setWriteError(apiFailure(null, t('connection'))); } }
  finally { if (!controller.signal.aborted) setPending(false); }
 }
 async function create(event: FormEvent) {
  event.preventDefault(); const parsed = writeDisciplineSchema.safeParse({ content });
  if (!parsed.success) { setWriteError({ message: c.invalid, fields: [] }); return; }
  const before = rows ?? [], beforeIds = new Set(before.map(row => row.id)), appendStart = before.length ? Math.max(...before.map(row => row.order)) + 1 : 0;
  const reconcileCreate = async (signal: AbortSignal) => {
   const result = await api.GET('/api/discipline', { signal }), latest = disciplineListSchema.safeParse(result.data);
   if (!result.response.ok || !latest.success) { setWriteError({ message: c.uncertain, fields: [] }); return; }
   const created = latest.data.slice(before.length);
   const prefixMatches = before.every((row, index) => latest.data[index]?.id === row.id && latest.data[index]?.content === row.content && latest.data[index]?.order === row.order);
   const committed = latest.data.length === before.length + 1 && prefixMatches && created[0] !== undefined && !beforeIds.has(created[0].id) && created[0].content === parsed.data.content && created[0].order === appendStart;
   if (!committed) { setWriteError({ message: c.uncertain, fields: [] }); return; }
   setRows(latest.data); clear(); setDrawn(null); setStatus(c.added); input.current?.focus();
  };
  await run(async signal => {
   const result = await api.POST('/api/discipline', { body: parsed.data, signal });
   if (signal.aborted) return;
   if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return; }
   clear(); setDrawn(null); setStatus(c.added); retry(value => value + 1); input.current?.focus();
  }, reconcileCreate);
 }
 async function update(event: FormEvent) {
  event.preventDefault(); const id = editing; if (!id) return;
  const parsed = writeDisciplineSchema.safeParse({ content: editContent });
  if (!parsed.success) { setWriteError({ message: c.invalid, fields: [] }); return; }
  await run(async signal => {
   const result = await api.PUT('/api/discipline/{id}', { params: { path: { id } }, body: parsed.data, signal });
   if (signal.aborted) return;
   if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return; }
   focusAfterEdit.current = id; stopEditing(); setDrawn(null); setStatus(c.updated); retry(value => value + 1);
  });
 }
 function remove(row: DisciplineResponse) { void run(async signal => {
  const result = await api.DELETE('/api/discipline/{id}', { params: { path: { id: row.id } }, signal });
  if (signal.aborted) return;
  if (!result.response.ok && !(result.response.status === 404 && result.error?.data.code === 'DISCIPLINE_NOT_FOUND')) { setWriteError(apiFailure(result.error, t('failed'))); return; }
  setRows(previous => previous?.filter(entry => entry.id !== row.id) ?? null); setDrawn(null); setStatus(c.deleted);
 }); }
 function move(index: number, offset: number) { if (!rows) return; const reordered = [...rows]; const target = index + offset;
  if (target < 0 || target >= rows.length) return;
  [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!]; const movedId = rows[index]!.id;
  void run(async signal => {
   const result = await api.PATCH('/api/discipline/reorder', { body: reordered.map((row, order) => ({ id: row.id, order })), signal });
   if (signal.aborted) return; const parsed = disciplineListSchema.safeParse(result.data);
   if (!result.response.ok || !parsed.success) { setWriteError(apiFailure(result.error, t('failed'))); return; }
   setRows(parsed.data); setStatus(c.reordered); requestAnimationFrame(() => document.getElementById(`principle-${movedId}`)?.focus());
  });
 }
 function draw() { void run(async signal => {
  const result = await api.GET('/api/discipline/random', { signal });
  if (signal.aborted) return; const parsed = randomDisciplineSchema.safeParse(result.data);
  if (!result.response.ok || !parsed.success) { setWriteError(apiFailure(result.error, t('failed'))); return; }
  setDrawn(parsed.data);
 }); }
 function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  // Ctrl/Cmd+Enter only, matching Quick Diary: plain Enter keeps inserting a newline and an IME Enter stays with the candidate.
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.shiftKey || event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
  event.preventDefault(); if (!pending) event.currentTarget.form?.requestSubmit();
 }
 const drawnIndex = drawn?.isCustom ? (rows ?? []).findIndex(row => row.content === drawn.content) : -1;
 const remaining = LIMIT - content.length;
 return <section className="plan-page discipline-page">
  <header className="plan-header discipline-header">
   <div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>
   {rows !== null && <p className="discipline-count">{principleCount(locale, rows.length)}</p>}
  </header>
  {error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath(location.pathname + location.search)}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : rows === null ? <p role="status">{t('loading')}</p> : <>
   <FailureNotice failure={writeError}/>
   <p role="status" className="discipline-status">{status}</p>
   {drawn ? <div role="status" className="discipline-draw">
    <p className="discipline-draw-label">{drawnIndex >= 0 && <span className="discipline-draw-number">{principleNumber(locale, drawnIndex + 1)}</span>}<span>{drawn.isCustom ? c.custom : c.fallback}</span></p>
    <p className="discipline-sentence">{drawn.content}</p>
    <div className="actions"><button type="button" className="secondary button-compact" disabled={pending} onClick={draw}>{c.drawAnother}</button></div>
   </div> : <button type="button" className="secondary discipline-draw-button" disabled={pending} onClick={draw}>{c.draw}</button>}
   <h2>{c.list}</h2>
   {!rows.length ? <div className="empty-state"><h3>{c.emptyHeading}</h3><p>{c.empty}</p><p className="discipline-example"><span className="muted">{c.exampleLabel}</span> <q>{c.example}</q></p></div> : <>
    <ol className="discipline-list">{rows.map((row, index) => <li key={row.id} data-testid="principle" className={editing === row.id ? 'discipline-row discipline-row-editing' : 'discipline-row'}>
     {editing === row.id ? <form className="discipline-edit" onSubmit={update}><fieldset disabled={pending}>
      <textarea ref={editInput} aria-label={c.editingLabel.replace('{n}', String(index + 1).padStart(2, '0'))} required maxLength={LIMIT} rows={3} value={editContent} onChange={event => setEditContent(event.target.value)} onKeyDown={shortcut}/>
      <p className="muted discipline-meta">{c.createdAt}: <time dateTime={row.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(row.createdAt))}</time></p>
      <div className="actions"><button type="submit">{pending ? t('pending') : c.save}</button><button type="button" className="secondary" onClick={stopEditing}>{c.cancel}</button></div>
     </fieldset></form> : <>
      <p id={`principle-${row.id}`} tabIndex={-1} className="discipline-sentence">{row.content}</p>
      <div className="discipline-row-actions">
       <button type="button" className="quiet-button button-compact discipline-icon-button" aria-label={c.up} disabled={pending || editing !== null || index === 0} onClick={() => move(index, -1)}><Icon name="arrowUp"/></button>
       <button type="button" className="quiet-button button-compact discipline-icon-button" aria-label={c.down} disabled={pending || editing !== null || index === rows.length - 1} onClick={() => move(index, 1)}><Icon name="arrowDown"/></button>
       <button type="button" className="quiet-button button-compact" disabled={pending || editing !== null} onClick={() => { setEditing(row.id); setEditContent(row.content); setWriteError(null); }}>{c.edit}</button>
       <button type="button" className="danger-button button-compact discipline-icon-button" aria-label={c.remove} disabled={pending || editing !== null} onClick={() => { setDoomed(row); deleteDialog.current?.showModal(); }}><Icon name="trash"/></button>
      </div>
     </>}
    </li>)}</ol>
    {editing !== null && rows.length > 1 && <p className="muted discipline-locked">{c.editingNotice}</p>}
   </>}
   <form className="plan-form discipline-add" onSubmit={create}><fieldset disabled={pending}>
    <legend>{c.addHeading}</legend>
    <div className="discipline-field"><label htmlFor="discipline-content">{c.content}</label><textarea id="discipline-content" ref={input} required maxLength={LIMIT} rows={3} value={content} onChange={event => setContent(event.target.value)} onKeyDown={shortcut}/></div>
    {content.length >= COUNTER_FROM && <p className="muted discipline-counter">{c.remaining.replace('{n}', String(remaining))}</p>}
    <div className="actions"><button type="submit">{pending ? t('pending') : c.create}</button>{content && <button className="secondary" type="button" onClick={clear}>{c.cancel}</button>}<span className="discipline-shortcut">{c.shortcut} <kbd>⌘ / Ctrl Enter</kbd></span></div>
   </fieldset></form>
   <DisciplineTransfer draftState={transferDirty} principles={rows} disabled={pending || editing !== null} onImported={() => { setDrawn(null); retry(value => value + 1); }}/>
   <dialog ref={deleteDialog} className="delete-dialog" aria-labelledby="discipline-delete-title" onClose={() => setDoomed(null)}>
    <h2 id="discipline-delete-title">{c.confirmTitle}</h2>
    <p>{c.confirmBody}</p>
    <p className="discipline-doomed"><q>{doomed ? doomed.content.slice(0, 20) + (doomed.content.length > 20 ? '…' : '') : ''}</q></p>
    <div className="actions">
     <button type="button" className="secondary" autoFocus disabled={pending} onClick={() => deleteDialog.current?.close()}>{c.cancel}</button>
     <button type="button" className="danger-button" disabled={pending} onClick={() => { const target = doomed; deleteDialog.current?.close(); if (target) remove(target); }}>{pending ? t('pending') : c.remove}</button>
    </div>
   </dialog>
  </>}
  <dialog ref={discardDialog} className="delete-dialog" aria-labelledby="discipline-discard-title" onClose={() => { if (blocker.state === 'blocked') blocker.reset(); }}>
   <h2 id="discipline-discard-title">{c.discardTitle}</h2>
   <p>{c.discard}</p>
   <div className="actions">
    <button type="button" className="secondary" autoFocus onClick={() => blocker.reset?.()}>{c.stay}</button>
    <button type="button" className="danger-button" onClick={() => blocker.proceed?.()}>{c.discardConfirm}</button>
   </div>
  </dialog>
 </section>;
}
