import { useEffect,useMemo,useRef,useState,type FormEvent } from 'react';
import { Link,useBlocker,useLocation,useParams } from 'react-router';
import { diaryReviewResponseSchema,structuredReviewInputSchema } from '@diary/contracts/review';
import type { z } from 'zod';
import { api,useUi } from '../ui';
import { apiFailure,FailureNotice,invalidField,type Failure } from '../api-error';
import { signInPath,useSessionState,wasExplicitSignOut } from '../session';
import { Markdown } from '../markdown';
import { diaryCopy } from '../diary-copy';
import { reviewCopy } from '../review-copy';
import '../review.css';
type Review=z.infer<typeof diaryReviewResponseSchema>;
type ReflectionKey='reviewSummary'|'reviewLearning'|'reviewAdjustment';
type Form={reviewOutcome:NonNullable<Review['reviewOutcome']>|''}&Record<ReflectionKey,string>;
const fields=['reviewSummary','reviewLearning','reviewAdjustment'] as const;
const outcomes=['INTACT','PARTIAL','INVALIDATED','UNCLEAR'] as const;
function formFrom(review:Review):Form{return {reviewOutcome:review.reviewOutcome??'',reviewSummary:review.reviewSummary??'',reviewLearning:review.reviewLearning??'',reviewAdjustment:review.reviewAdjustment??''};}

// --- Confirmed-baseline dirty state --------------------------------------------
// Dirty means the normalized form differs from the last confirmed server state
// (GET response on load, PATCH response on save). Normalization mirrors the
// persisted write semantics: the server trims reflections and collapses empty
// strings to null, so '' and null are equal and whitespace-only edits read as
// clean. An outcome selection counts the moment it changes and stops when the
// original outcome is picked again.
export type ReviewBaseline={reviewOutcome:NonNullable<Review['reviewOutcome']>|null;reviewSummary:string|null;reviewLearning:string|null;reviewAdjustment:string|null};
export function baselineFrom(review:Review):ReviewBaseline{return {reviewOutcome:review.reviewOutcome??null,reviewSummary:review.reviewSummary??null,reviewLearning:review.reviewLearning??null,reviewAdjustment:review.reviewAdjustment??null};}
export function normalizeReview(form:Form):ReviewBaseline{return {reviewOutcome:form.reviewOutcome||null,reviewSummary:form.reviewSummary.trim()||null,reviewLearning:form.reviewLearning.trim()||null,reviewAdjustment:form.reviewAdjustment.trim()||null};}
export function sameReview(a:ReviewBaseline,b:ReviewBaseline){return a.reviewOutcome===b.reviewOutcome&&a.reviewSummary===b.reviewSummary&&a.reviewLearning===b.reviewLearning&&a.reviewAdjustment===b.reviewAdjustment;}

// --- Device-local draft ---------------------------------------------------------
// Keyed by account and diary, 24-hour TTL, written debounced while dirty and
// paused while a restore decision is pending or the draft was explicitly
// discarded. Cleared only by a confirmed save, an explicit discard, or a
// signed-out session — never by a 401, so content survives re-login. Only the
// reflection fields are stored; no session or token material.
type ReviewDraft=Partial<{reviewOutcome:NonNullable<Review['reviewOutcome']>}&Record<ReflectionKey,string>>;
function readReviewDraft(key:string):ReviewDraft|null{
 try{const saved=JSON.parse(localStorage.getItem(key)??'null');
  if(!saved||typeof saved.at!=='number'||saved.at>Date.now()||Date.now()-saved.at>86_400_000||!saved.value||typeof saved.value!=='object')return null;
  const value=saved.value as ReviewDraft,draft:ReviewDraft={};
  if(outcomes.includes(value.reviewOutcome as (typeof outcomes)[number]))draft.reviewOutcome=value.reviewOutcome;
  for(const field of fields)if(typeof value[field]==='string'&&value[field].length<=10000)draft[field]=value[field];
  return draft.reviewOutcome||fields.some(field=>draft[field]?.trim())?draft:null;
 }catch{return null;}
}
function stringOr(value:unknown,fallback:string){return typeof value==='string'&&value.length<=10000?value:fallback;}
function mergeDraft(base:Form,draft:ReviewDraft):Form{
 return {reviewOutcome:outcomes.includes(draft.reviewOutcome as (typeof outcomes)[number])?draft.reviewOutcome!:base.reviewOutcome,
  reviewSummary:stringOr(draft.reviewSummary,base.reviewSummary),reviewLearning:stringOr(draft.reviewLearning,base.reviewLearning),reviewAdjustment:stringOr(draft.reviewAdjustment,base.reviewAdjustment)};
}
// A draft identical to the confirmed baseline offers nothing to restore.
function restorableDraft(draft:ReviewDraft|null,baseline:ReviewBaseline,review:Review):ReviewDraft|null{
 if(!draft)return null;
 return sameReview(normalizeReview(mergeDraft(formFrom(review),draft)),baseline)?null:draft;
}

export default function DiaryReviewPage(){const {id=''}=useParams(),{locale,t}=useUi(),c=reviewCopy[locale],original=diaryCopy[locale],session=useSessionState();const [review,setReview]=useState<Review|null>(null),[timezone,setTimezone]=useState(''),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState<Failure|null>(null),[attempt,setAttempt]=useState(0),[editing,setEditing]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState<Form>({reviewOutcome:'',reviewSummary:'',reviewLearning:'',reviewAdjustment:''}),[error,setError]=useState<Failure|null>(null),[saved,setSaved]=useState(false);const [saveState,setSaveState]=useState<'idle'|'saving'|'failed'>('idle'),[accountId,setAccountId]=useState(''),[baseline,setBaseline]=useState<ReviewBaseline|null>(null),[restorable,setRestorable]=useState<ReviewDraft|null>(null);const active=useRef(true),completedHeading=useRef<HTMLHeadingElement>(null);const draftKey=accountId?`review-draft:${accountId}:${id}`:null;
 // Queue context handed over by the review queue link (page/target only).
 const backToQueue=(useLocation().state as {queueSearch?:string}|null)?.queueSearch;
 const dirty=useMemo(()=>baseline!==null&&!sameReview(normalizeReview(form),baseline),[baseline,form]);const dirtyRef=useRef(dirty);dirtyRef.current=dirty;const stateRef=useRef({form,draftKey,restorable});stateRef.current={form,draftKey,restorable};
 const blocker=useBlocker(()=>dirtyRef.current&&session.authenticated!==false);
 useEffect(()=>{if(blocker.state==='blocked'){if(window.confirm(c.discard))blocker.proceed();else blocker.reset();}},[blocker,c.discard]);
 useEffect(()=>{const unload=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[]);
 // Debounced device-local backup; paused while a restore decision is pending.
 // Discarding a recovery only drops that old snapshot: after the discard the
 // form still matches the confirmed baseline, so this effect stays idle until a
 // genuinely new edit makes it dirty again — then backups resume with the new
 // content and never rewrite the discarded one.
 useEffect(()=>{if(!draftKey||restorable||!dirty)return;const timer=setTimeout(()=>{try{localStorage.setItem(draftKey,JSON.stringify({at:Date.now(),value:stateRef.current.form}));}catch{/* Recovery is best effort; storage may be unavailable. */}},600);return()=>clearTimeout(timer);},[draftKey,restorable,dirty,form]);
 // The debounced write may not have fired yet when the page unmounts dirty
 // (accepted navigation, session-expiry redirect); flush the snapshot so the
 // reflection stays recoverable after re-login. An explicit sign-out
 // suppresses the flush — the user asked for a clean device.
 useEffect(()=>()=>{const {form:current,draftKey:key,restorable:pending}=stateRef.current;if(!key||pending||!dirtyRef.current||wasExplicitSignOut())return;try{localStorage.setItem(key,JSON.stringify({at:Date.now(),value:current}));}catch{/* Recovery is best effort. */}},[draftKey]);
 useEffect(()=>{active.current=true;const controller=new AbortController();setLoading(true);setReview(null);setLoadError(null);Promise.all([api.GET('/api/diaries/{id}/review',{params:{path:{id}},signal:controller.signal}),api.GET('/api/auth/me',{signal:controller.signal})]).then(([result,user])=>{if(!active.current||controller.signal.aborted)return;if(!result.response.ok){setLoadError(apiFailure(result.response.status===401?{data:{code:'AUTH_UNAUTHORIZED'}}:result.error,t('failed')));return;}if(!user.response.ok||!user.data){setLoadError(apiFailure(user.error,t('connection')));return;}const data=diaryReviewResponseSchema.parse(result.data);const confirmed=baselineFrom(data);setReview(data);setForm(formFrom(data));setBaseline(confirmed);setTimezone(user.data.data.timezone);setEditing(false);setSaveState('idle');setError(null);setSaved(false);setAccountId(user.data.data.id);setRestorable(restorableDraft(readReviewDraft(`review-draft:${user.data.data.id}:${id}`),confirmed,data));}).catch(()=>{if(active.current&&!controller.signal.aborted)setLoadError(apiFailure(null,t('connection')));}).finally(()=>{if(active.current&&!controller.signal.aborted)setLoading(false);});return()=>{active.current=false;controller.abort();};},[id,attempt]);
 useEffect(()=>{if(saved&&!editing)completedHeading.current?.focus();},[saved,editing]);
 function clearDraft(){if(draftKey){try{localStorage.removeItem(draftKey);}catch{/* Ignore. */}}}
 function restoreDraft(){if(!review)return;setForm(mergeDraft(formFrom(review),restorable!));setRestorable(null);setEditing(true);setError(null);setSaved(false);}
 function discardDraft(){setRestorable(null);clearDraft();}
 function cancelEditing(){if(!review||(dirty&&!window.confirm(c.discard)))return;clearDraft();setRestorable(null);setForm(formFrom(review));setEditing(false);setError(null);setSaved(false);}
 function change<K extends keyof Form>(key:K,value:Form[K]){setSaved(false);setForm(current=>({...current,[key]:value}));}
 async function save(event:FormEvent){event.preventDefault();setError(null);setSaved(false);const parsed=structuredReviewInputSchema.safeParse(form);if(!parsed.success){setSaveState('failed');setError({message:c.reflectionHint,code:'SYS_VALIDATION_ERROR',fields:parsed.error.issues.map(issue=>issue.path.join('.'))});return;}setSaving(true);setSaveState('saving');try{const result=await api.PATCH('/api/diaries/{id}/review',{params:{path:{id}},body:parsed.data});if(!active.current)return;if(result.response.ok&&result.data){const data=diaryReviewResponseSchema.parse(result.data);setBaseline(baselineFrom(data));setReview(data);setForm(formFrom(data));setEditing(false);setSaved(true);setSaveState('idle');clearDraft();setRestorable(null);}else{setSaveState('failed');setError(apiFailure(result.error,t('failed')));}}catch{if(active.current){setSaveState('failed');setError(apiFailure(null,t('connection')));}}finally{if(active.current)setSaving(false);}}
 const formatInstant=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(value));
 if(loading)return <p role="status">{t('loading')}</p>;
 if(loadError||!review)return <section><h1>{c.title}</h1><FailureNotice failure={loadError}/><div className="actions"><button type="button" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</button><Link to={signInPath(`/diaries/${id}/review`)}>{t('login')}</Link></div></section>;
 const completed=review.reviewOutcome!==null;
 const statusClass=saveState==='failed'?'save-status is-failed':saveState==='saving'?'save-status is-saving':dirty?'save-status is-dirty':'save-status';
 const statusText=saveState==='saving'?c.statusSaving:saveState==='failed'?c.statusFailed:dirty?c.statusDirty:'';
 return <article className="diary-review"><Link className="inline-link" to={`/diaries/${id}`}>{c.back}</Link><header className="review-heading"><div><h1>{c.title}</h1><p className="review-diary-title">{review.title}</p><time dateTime={review.date}>{review.date}</time></div><span className="review-status" data-testid="review-status">{c[review.reviewStatus]}</span></header><div className="review-schedule"><div><p className="muted">{c.timezone}: <strong data-testid="review-timezone">{timezone}</strong></p><p>{c.due}: {review.reviewDueAt?<time dateTime={review.reviewDueAt} data-testid="review-due">{formatInstant(review.reviewDueAt)}</time>:c.none}</p>{review.reviewedAt&&<p>{c.completedAt}: <time dateTime={review.reviewedAt} data-testid="reviewed-at">{formatInstant(review.reviewedAt)}</time></p>}</div><Link className="button secondary" to={`/diaries/${id}/edit`}>{c.schedule}</Link></div><div className="review-columns"><section className="review-original" aria-labelledby="review-original-title"><h2 id="review-original-title">{c.original}</h2><p className="muted">{c.originalHint}</p><dl>{(['thesis','risk','execution'] as const).map(key=><div key={key}><dt>{original[key]}</dt><dd>{review[key]||c.empty}</dd></div>)}</dl>{review.content&&<Markdown>{review.content}</Markdown>}</section><section className="review-reflection" aria-labelledby="review-reflection-title"><h2 ref={completedHeading} id="review-reflection-title" tabIndex={-1}>{completed&&!editing?c.complete:c.reflection}</h2><p className="muted">{c.private}</p>{restorable&&<div className="review-restore" role="status"><button type="button" onClick={restoreDraft}>{c.restore}</button><button type="button" className="secondary" onClick={discardDraft}>{c.discardDraft}</button></div>}{saved&&<p role="status" className="success">{c.saved}</p>}{completed&&!editing?<><p className="review-outcome">{c[review.reviewOutcome!]}</p><dl>{fields.filter(key=>review[key]).map(key=><div key={key}><dt>{c[key]}</dt><dd>{review[key]}</dd></div>)}</dl><div className="actions review-complete-actions"><button type="button" className="secondary" onClick={()=>{setEditing(true);setError(null);setSaved(false);}}>{c.edit}</button><Link className="button secondary" to={`/diaries/${id}`}>{c.back}</Link><Link className="button secondary" to={backToQueue?`/reviews?${backToQueue}`:'/reviews'}>{c.queue}</Link><Link to="/timeline">{c.timeline}</Link></div></>:<form onSubmit={save} aria-busy={saving}><fieldset disabled={saving}><legend>{c.outcome}</legend><p className="muted">{c.reflectionHint}</p><div className="review-outcomes">{outcomes.map(outcome=><label key={outcome}><input type="radio" required name="reviewOutcome" value={outcome} checked={form.reviewOutcome===outcome} onChange={()=>change('reviewOutcome',outcome)} aria-invalid={invalidField(error,'reviewOutcome')} aria-describedby={error?'review-error':undefined}/>{c[outcome]}</label>)}</div>{fields.map((key,index)=><label key={key}>{c[key]}<span className="review-field-hint" id={`${key}-hint`}>{[c.summaryHint,c.learningHint,c.adjustmentHint][index]}</span><textarea aria-label={c[key]} name={key} className={key==='reviewSummary'?'review-primary':undefined} rows={key==='reviewSummary'?6:4} maxLength={10000} value={form[key]} onChange={event=>change(key,event.target.value)} aria-invalid={invalidField(error,key)} aria-describedby={`${key}-hint${error?' review-error':''}`}/></label>)}<FailureNotice failure={error} id="review-error"/><div className="review-footer"><span className={statusClass} data-testid="save-status" role="status">{statusText}</span><div className="actions">{completed&&<button type="button" className="secondary" onClick={cancelEditing}>{c.cancel}</button>}<button type="submit" disabled={saving}>{saving?t('pending'):completed?c.update:c.save}</button></div></div></fieldset></form>}</section></div>{review.transactions.length>0&&<section className="review-related"><h2>{c.transactions}</h2><ul>{review.transactions.map(transaction=><li key={transaction.id}><strong>{transaction.symbol}</strong><span>{transaction.type}</span><span className="review-decimal">{transaction.quantity} × {transaction.price}</span><time dateTime={transaction.tradeDate}>{formatInstant(transaction.tradeDate)}</time>{transaction.notes&&<p>{transaction.notes}</p>}</li>)}</ul></section>}{review.tradePlans.length>0&&<section className="review-related"><h2>{c.plans}</h2><ul>{review.tradePlans.map(plan=><li key={plan.id}><strong>{plan.symbol}</strong><span>{c.status}: {plan.status}</span>{plan.setupType&&<p>{c.setup}: {plan.setupType}</p>}{plan.invalidationCondition&&<p>{c.invalidation}: {plan.invalidationCondition}</p>}</li>)}</ul></section>}</article>;
}
