import { AlertFields, reminderCopy, reminderDrafts, reminderInputs, type ReminderDraft } from './alert-fields';
import { alertDraftSchema, type AlertResponse } from '@diary/contracts/alerts';
import { CompanyContextInput,companyContextCopy,parseCompanyContext } from './company-context-input';
import { ReviewScheduling,reviewScheduleCopy } from './review-scheduling';
import { resolveLocalTradeInstant,localTradeValue } from './trade-time';
import { canonicalDecimal,ledgerTransactionInputSchema,ledgerTransactionUpdateInputSchema,type LedgerTransactionResponse } from '@diary/contracts/ledger';
import { BuyTransactionFields,type BuyDraft } from './buy-transaction-fields';
import { ledgerCopy } from './ledger-copy';
import { useEffect,useMemo,useRef,useState,type FormEvent } from 'react';
import { Link,useBlocker,useNavigate } from 'react-router';
import { api,useUi } from './ui';
import { signInPath,useSessionState,wasExplicitSignOut } from './session';
import { apiFailure,FailureNotice,invalidField,type Failure } from './api-error';
import { diaryCopy } from './diary-copy';
import { Markdown } from './markdown';
import './diary-editor.css';
import { diaryResponseSchema, type DiaryResponse } from '@diary/contracts';
import { buildCapturePath, normalizeCaptureContext, type CaptureContext } from './capture-context';
import { CaptureNotice } from './capture-notice';
export type DiaryFields={alerts?:AlertResponse[];date:string;title:string;content:string;tags:string[];thesis:string|null;risk:string|null;execution:string|null;stockSymbols?:string[];reviewDueAt?:string|null;transactions?:LedgerTransactionResponse[];reviewStatus?:'none'|'pending'|'reviewed'|null};

const writeRecoveryCopy = {
 'zh-TW': { uncertain:'儲存結果未能確認。伺服器可能已有不同版本；本地內容仍保留。請先載入最新版本，再決定是否繼續編輯。', loadLatest:'載入最新版本' },
 'zh-CN': { uncertain:'保存结果无法确认。服务器可能已有不同版本；本地内容仍保留。请先加载最新版本，再决定是否继续编辑。', loadLatest:'加载最新版本' },
 en: { uncertain:'The save result could not be confirmed. The server may have a different version; your entries remain here. Load the latest version before editing further.', loadLatest:'Load latest version' },
} as const;

function sameDiaryWrite(diary: DiaryResponse, body: Record<string, unknown>) {
 const scalarFields = ['content','date','thesis','risk','execution','reviewDueAt'] as const;
 for (const field of scalarFields) if (body[field] !== undefined && (diary[field] ?? null) !== (body[field] ?? null)) return false;
 if (typeof body.title === 'string' && diary.title !== body.title.trim()) return false;
 if (Array.isArray(body.tags)) {
  const expected = [...new Set(body.tags.filter((tag):tag is string=>typeof tag==='string').map(tag=>tag.trim()).filter(Boolean))];
  if (JSON.stringify(diary.tags) !== JSON.stringify(expected)) return false;
 }
 if (Array.isArray(body.stockSymbols)) {
  const expected = body.stockSymbols.filter((symbol):symbol is string=>typeof symbol==='string').map(symbol=>symbol.trim().toUpperCase());
  if (JSON.stringify(diary.stockSymbols??[]) !== JSON.stringify(expected)) return false;
 }
 if (body.alerts !== undefined) {
  if (!Array.isArray(body.alerts)) return false;
  const expected = body.alerts.map(row => {
   if (!row || typeof row !== 'object') return null;
   const value = row as Record<string, unknown>;
   return { message: value.message, triggerAt: value.triggerAt, recurringMode: value.recurringMode ?? null };
  });
  const actual = reminderDrafts(diary.alerts??[]).map(row => ({ message: row.message, triggerAt: row.instant, recurringMode: row.mode||null }));
  if (JSON.stringify(actual.map(row=>JSON.stringify(row)).sort()) !== JSON.stringify(expected.map(row=>JSON.stringify(row)).sort())) return false;
 }
 if (body.transactions !== undefined) {
  if (!Array.isArray(body.transactions)) return false;
  const expected = body.transactions.map(row => {
   if (!row || typeof row !== 'object') return null;
   const value = row as Record<string, unknown>;
   return { symbol:typeof value.symbol==='string'?value.symbol.trim().toUpperCase():value.symbol, type:value.type, quantity:typeof value.quantity==='string'?canonicalDecimal(value.quantity):value.quantity, price:typeof value.price==='string'?canonicalDecimal(value.price):value.price, tradeDate:value.tradeDate, notes:value.notes??null, strategy:value.strategy??null, emotion:value.emotion??null };
  });
  const actual = (diary.transactions??[]).map(row => ({ symbol:row.symbol.trim().toUpperCase(),type:row.type,quantity:canonicalDecimal(row.quantity),price:canonicalDecimal(row.price),tradeDate:row.tradeDate,notes:row.notes??null,strategy:row.strategy??null,emotion:row.emotion??null }));
  if (JSON.stringify(actual.map(row=>JSON.stringify(row)).sort()) !== JSON.stringify(expected.map(row=>JSON.stringify(row)).sort())) return false;
 }
 return true;
}

// --- Canonical editable state -------------------------------------------------
// Dirty means "the normalized editable state differs from the last confirmed
// server baseline", where normalization mirrors the persisted write semantics
// (trimmed title, deduped tags, parsed symbols, resolved instants, null/empty
// collapse). Unresolvable input keeps a sentinel so it never reads as clean.

type FormState = { date:string;title:string;content:string;tags:string[];thesis:string|null;risk:string|null;execution:string|null };
type CanonicalTransaction = { id?:string;type:'BUY'|'SELL';symbol:string;quantity:string;price:string;tradeDate:string;notes:string|null;strategy:string|null;emotion:string|null };
type CanonicalAlert = { message:string;triggerAt:string;recurringMode:string|null };
type EditableState = { date:string;title:string;content:string;tags:string[];thesis:string|null;risk:string|null;execution:string|null;stockSymbols:string[];reviewDueAt:string|null;transactions:CanonicalTransaction[];alerts:CanonicalAlert[] };
export type EditorSources = { form:FormState;stockSymbols:string;transactions:BuyDraft[];reviewTime:string;reviewInstant:string;reminders:ReminderDraft[] };
type DisableableControl = HTMLButtonElement|HTMLFieldSetElement|HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
const DECIMAL_INPUT=/^\d+(\.\d+)?$/;
// Persisted ledger semantics: uppercase symbol and canonical decimal, with the
// UNRESOLVED sentinel for empty/invalid input so it never reads as saved.
function canonicalLedgerSymbol(value:string){return value.trim().toUpperCase()||UNRESOLVED;}
function canonicalLedgerDecimal(value:string){const trimmed=value.trim();return DECIMAL_INPUT.test(trimmed)&&/[1-9]/.test(trimmed)?canonicalDecimal(trimmed):`${UNRESOLVED}${trimmed}`;}
const UNRESOLVED = '\0';

function draftTransactionFromResponse(row:LedgerTransactionResponse):BuyDraft{
 return {key:row.id,id:row.id,type:row.type,symbol:row.symbol,quantity:row.quantity,price:row.price,tradeDate:localTradeValue(new Date(row.tradeDate)),instant:row.tradeDate,notes:row.notes??'',strategy:row.strategy??'',emotion:row.emotion??''};
}
function editableFromDiary(diary:DiaryFields):EditorSources{
 return {
  form:{date:diary.date,title:diary.title,content:diary.content,tags:diary.tags.length?[...diary.tags]:[''],thesis:diary.thesis,risk:diary.risk,execution:diary.execution},
  stockSymbols:(diary.stockSymbols??[]).join(', '),
  transactions:diary.transactions?.map(draftTransactionFromResponse)??[],
  reviewTime:diary.reviewDueAt?localTradeValue(new Date(diary.reviewDueAt)):'',
  reviewInstant:diary.reviewDueAt??'',
  reminders:reminderDrafts(diary.alerts??[]),
 };
}
function editableFromResponse(diary:DiaryResponse):EditorSources{
 return editableFromDiary({...diary,content:diary.content??'',thesis:diary.thesis??null,risk:diary.risk??null,execution:diary.execution??null,stockSymbols:diary.stockSymbols??[],reviewDueAt:diary.reviewDueAt??null,transactions:diary.transactions??[],alerts:diary.alerts??[]});
}
export function canonicalState(source:EditorSources):EditableState{
 const companies=parseCompanyContext(source.stockSymbols);
 return {
  date:source.form.date,
  title:source.form.title.trim(),
  content:source.form.content,
  tags:[...new Set(source.form.tags.map(tag=>tag.trim()).filter(Boolean))],
  thesis:source.form.thesis||null,risk:source.form.risk||null,execution:source.form.execution||null,
  stockSymbols:companies.success?companies.data??[]:[source.stockSymbols],
  reviewDueAt:source.reviewTime?(resolveLocalTradeInstant(source.reviewTime,source.reviewInstant)??`${UNRESOLVED}${source.reviewTime}`):null,
  transactions:source.transactions.map(row=>({...(row.id?{id:row.id}:{}),type:row.type,symbol:canonicalLedgerSymbol(row.symbol),quantity:canonicalLedgerDecimal(row.quantity),price:canonicalLedgerDecimal(row.price),tradeDate:resolveLocalTradeInstant(row.tradeDate,row.instant)??`${UNRESOLVED}${row.tradeDate}`,notes:row.notes||null,strategy:row.strategy||null,emotion:row.emotion||null})),
  alerts:reminderInputs(source.reminders).map(row=>({message:row.message,triggerAt:row.triggerAt||UNRESOLVED,recurringMode:row.recurringMode??null})),
 };
}
function sameTransaction(a:CanonicalTransaction,b:CanonicalTransaction){
 return (a.id??null)===(b.id??null)&&a.type===b.type&&a.symbol===b.symbol&&a.quantity===b.quantity&&a.price===b.price&&a.tradeDate===b.tradeDate&&a.notes===b.notes&&a.strategy===b.strategy&&a.emotion===b.emotion;
}
export function sameAlerts(a:CanonicalAlert[],b:CanonicalAlert[]){
 return a.length===b.length&&a.every((row,index)=>row.message===b[index]!.message&&row.triggerAt===b[index]!.triggerAt&&row.recurringMode===b[index]!.recurringMode);
}
export function sameEditable(a:EditableState,b:EditableState){
 return a.date===b.date&&a.title===b.title&&a.content===b.content&&a.thesis===b.thesis&&a.risk===b.risk&&a.execution===b.execution
  &&(a.reviewDueAt??null)===(b.reviewDueAt??null)
  &&a.tags.length===b.tags.length&&a.tags.every((tag,index)=>tag===b.tags[index])
  &&a.stockSymbols.length===b.stockSymbols.length&&a.stockSymbols.every((symbol,index)=>symbol===b.stockSymbols[index])
  &&a.transactions.length===b.transactions.length&&a.transactions.every((row,index)=>sameTransaction(row,b.transactions[index]!))
  &&sameAlerts(a.alerts,b.alerts);
}

// --- Device-local recovery ----------------------------------------------------
// Covers the whole editable state (writing fields, tags, symbols, transactions,
// review scheduling, reminders). Keyed by account and diary, 24-hour TTL,
// written debounced while dirty, cleared only after a confirmed server save, an
// explicit discard, or an explicit sign-out (never on 401).

type StoredTransaction = {key?:string;id?:string;type?:string;symbol?:string;quantity?:string;price?:string;tradeDate?:string;instant?:string;notes?:string;strategy?:string;emotion?:string};
type StoredReminder = {key?:string;message?:string;time?:string;instant?:string;mode?:string};
type EditorDraft = {form?:{date?:string;title?:string;content?:string;tags?:string[];thesis?:string|null;risk?:string|null;execution?:string|null};stockSymbols?:string;transactions?:StoredTransaction[];reviewTime?:string;reviewInstant?:string;reminders?:StoredReminder[];captureContext?:CaptureContext};

function readEditorDraft(key:string):EditorDraft|null{
 try{
  const saved=JSON.parse(localStorage.getItem(key)??'null');
  if(!saved||typeof saved.at!=='number'||saved.at>Date.now()||Date.now()-saved.at>86_400_000||!saved.value||typeof saved.value!=='object')return null;
  const value=saved.value as EditorDraft;
  const draft:EditorDraft={};
  if(value.form&&typeof value.form==='object'){
   const form:EditorDraft['form']={};
   for(const field of ['date','title','content'] as const)if(typeof value.form[field]==='string')form[field]=value.form[field];
   for(const field of ['thesis','risk','execution'] as const)if(typeof value.form[field]==='string'||value.form[field]===null)form[field]=value.form[field];
   if(Array.isArray(value.form.tags))form.tags=value.form.tags.filter((tag):tag is string=>typeof tag==='string');
   draft.form=form;
  }
  if(typeof value.stockSymbols==='string')draft.stockSymbols=value.stockSymbols;
  if(Array.isArray(value.transactions))draft.transactions=value.transactions.filter(row=>row&&typeof row==='object').slice(0,100);
  if(typeof value.reviewTime==='string')draft.reviewTime=value.reviewTime;
  if(typeof value.reviewInstant==='string')draft.reviewInstant=value.reviewInstant;
  if(Array.isArray(value.reminders))draft.reminders=value.reminders.filter(row=>row&&typeof row==='object').slice(0,50);
  const captureContext=normalizeCaptureContext(value.captureContext);
  if(captureContext)draft.captureContext=captureContext;
  const hasWriting=draft.form&&(draft.form.content||draft.form.title);
  return hasWriting||draft.transactions?.length||draft.reminders?.length||draft.reviewTime?draft:null;
 }catch{return null;}
}
function stringOr<T extends string>(value:unknown,fallback:T,maxLength=10000):string|T{
 return typeof value==='string'&&value.length<=maxLength?value:fallback;
}
function mergeDraft(base:EditorSources,draft:EditorDraft,missingStockSymbols=base.stockSymbols):EditorSources{
 const form=draft.form??{};
 const tags=Array.isArray(form.tags)?form.tags.filter((tag):tag is string=>typeof tag==='string'):base.form.tags;
 return {
  form:{
   date:stringOr(form.date,base.form.date,10),
   title:stringOr(form.title,base.form.title,500),
   content:stringOr(form.content,base.form.content,500_000),
   tags,
   thesis:typeof form.thesis==='string'||form.thesis===null?form.thesis:base.form.thesis,
   risk:typeof form.risk==='string'||form.risk===null?form.risk:base.form.risk,
   execution:typeof form.execution==='string'||form.execution===null?form.execution:base.form.execution,
  },
  stockSymbols:typeof draft.stockSymbols==='string'?stringOr(draft.stockSymbols,missingStockSymbols,300):missingStockSymbols,
  transactions:Array.isArray(draft.transactions)?draft.transactions.map(row=>({
   key:stringOr(row.key,crypto.randomUUID(),64),id:typeof row.id==='string'&&row.id?row.id:undefined,
   type:row.type==='SELL'?'SELL':'BUY',symbol:stringOr(row.symbol,'',20),quantity:stringOr(row.quantity,''),price:stringOr(row.price,''),
   tradeDate:stringOr(row.tradeDate,'',40),instant:stringOr(row.instant,'',40),notes:stringOr(row.notes,''),strategy:stringOr(row.strategy,'',100),emotion:stringOr(row.emotion,'',20),
  })):base.transactions,
  reviewTime:stringOr(draft.reviewTime,base.reviewTime,40),
  reviewInstant:stringOr(draft.reviewInstant,base.reviewInstant,40),
  reminders:Array.isArray(draft.reminders)?draft.reminders.map(row=>({
   key:stringOr(row.key,crypto.randomUUID(),64),message:stringOr(row.message,'',500),time:stringOr(row.time,'',40),instant:stringOr(row.instant,'',40),
   mode:row.mode==='WEEK'||row.mode==='MONTH'?row.mode:'',
  })):base.reminders,
 };
}
// A draft identical to the confirmed baseline offers nothing to restore.
function restorableDraft(draft:EditorDraft|null,baseline:EditableState,initial:DiaryFields,missingStockSymbols?:string):EditorDraft|null{
 if(!draft)return null;
 const merged=canonicalState(mergeDraft(editableFromDiary(initial),draft,missingStockSymbols));
 return sameEditable(merged,baseline)?null:draft;
}

export function DiaryEditor({initial,id,accountId,quick=false,captureContext,captureIssue}:{initial:DiaryFields;id?:string;accountId?:string;quick?:boolean;captureContext?:CaptureContext|null;captureIssue?:import('./capture-context').CaptureContextIssue|null}){
 const {t,locale}=useUi();const labels=diaryCopy[locale];const session=useSessionState();const navigate=useNavigate();
 const captureRef=useRef(normalizeCaptureContext(captureContext));
 const [reminders,setReminders]=useState(()=>editableFromDiary(initial).reminders);const remindersChanged=useRef(false);
 const [form,setForm]=useState(()=>editableFromDiary(initial).form);const [preview,setPreview]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState<Failure|null>(null);
 const [saveState,setSaveState]=useState<'idle'|'saving'|'failed'>('idle');const savingRef=useRef(false);
 const [transactions,setTransactions]=useState(()=>editableFromDiary(initial).transactions);const [transactionError,setTransactionError]=useState('');const [stockSymbols,setStockSymbols]=useState(()=>editableFromDiary(initial).stockSymbols);const [reviewTime,setReviewTime]=useState(()=>editableFromDiary(initial).reviewTime);const [reviewInstant,setReviewInstant]=useState(()=>editableFromDiary(initial).reviewInstant);const [recoveryState,setRecoveryState]=useState<'conflict'|'unavailable'|null>(null);const [recoveryDiary,setRecoveryDiary]=useState<DiaryResponse|null>(null);
 const draftKey=accountId&&!quick?`diary-editor-draft:${accountId}:${id??'new'}`:null;
 const baselineReference=useMemo(()=>canonicalState(editableFromDiary(initial)),[initial]);
 const [baseline,setBaseline]=useState<EditableState>(baselineReference);
 const baselineRef=useRef(baseline);baselineRef.current=baseline;
 const sources=useMemo(()=>({form,stockSymbols,transactions,reviewTime,reviewInstant,reminders}),[form,stockSymbols,transactions,reviewTime,reviewInstant,reminders]);
 const sourcesRef=useRef(sources);sourcesRef.current=sources;
 const dirty=useMemo(()=>!sameEditable(canonicalState(sources),baseline),[sources,baseline]);
 const alertsDirty=useMemo(()=>!sameAlerts(canonicalState(sources).alerts,baseline.alerts),[sources,baseline]);
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
 const [restorable,setRestorable]=useState<EditorDraft|null>(()=>restorableDraft(readEditorDraft(draftKey??''),baselineReference,initial,id?undefined:''));
 const restorableRef=useRef(restorable);restorableRef.current=restorable;
 const contentRef=useRef<HTMLTextAreaElement>(null);const caretState=useRef<{start:number;end:number;top:number}|null>(null);const previewSectionRef=useRef<HTMLElement|null>(null);const previewVisited=useRef(false);const incomingKey=useRef(buildCapturePath('new',captureContext,initial.date));
 const blocker=useBlocker(()=>dirtyRef.current&&session.authenticated!==false);
 useEffect(()=>{if(blocker.state==='blocked'){if(pending){blocker.reset();return;}if(window.confirm(labels.discard)){dirtyRef.current=false;blocker.proceed();}else blocker.reset();}},[blocker,labels.discard,pending]);
 useEffect(()=>{const nextKey=buildCapturePath('new',captureContext,initial.date);if(nextKey===incomingKey.current)return;if(dirtyRef.current)return;incomingKey.current=nextKey;const nextContext=normalizeCaptureContext(captureContext);captureRef.current=nextContext;if(restorable)return;const next=editableFromDiary(initial);setForm(next.form);setReminders(next.reminders);setTransactions(next.transactions);setStockSymbols(next.stockSymbols);setReviewTime(next.reviewTime);setReviewInstant(next.reviewInstant);const confirmed=canonicalState(next);baselineRef.current=confirmed;setBaseline(confirmed);setSaveState('idle');setError(null);},[captureContext,initial.date,restorable]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 // Debounced device-local backup; paused while a restore decision is pending.
 // Discarding a recovery only drops that old snapshot: after the discard the
 // form still matches the confirmed baseline, so this effect stays idle until a
 // genuinely new edit makes it dirty again — then backups resume with the new
 // content and never rewrite the discarded one.
 useEffect(()=>{
  if(!draftKey||restorable||!dirty)return;
  const timer=setTimeout(()=>{try{localStorage.setItem(draftKey,JSON.stringify({at:Date.now(),value:{...sourcesRef.current,...(captureRef.current?{captureContext:captureRef.current}:{})}}));}catch{/* Recovery is best effort; storage may be unavailable. */}},600);
  return()=>clearTimeout(timer);
 },[draftKey,restorable,dirty,sources]);
 // The debounced write may not have fired yet when the editor unmounts dirty
 // (accepted navigation, session-expiry redirect); flush the snapshot so an
 // in-flight save failure or leave still leaves recoverable content. An
 // explicit sign-out suppresses the flush — the user asked for a clean device.
 useEffect(()=>()=>{if(!draftKey||restorableRef.current||!dirtyRef.current||wasExplicitSignOut())return;try{localStorage.setItem(draftKey,JSON.stringify({at:Date.now(),value:{...sourcesRef.current,...(captureRef.current?{captureContext:captureRef.current}:{})}}));}catch{/* Recovery is best effort; storage may be unavailable. */}},[draftKey]);
 // Returning from preview restores the exact caret, scroll offset and focus.
 useEffect(()=>{if(preview){previewSectionRef.current?.focus();return;}if(!previewVisited.current)return;const element=contentRef.current;if(!element)return;const caret=caretState.current;const target=caret??{start:element.value.length,end:element.value.length,top:element.scrollTop};element.focus();element.setSelectionRange(target.start,target.end);element.scrollTop=target.top;},[preview]);
 function clearDraft(){if(draftKey){try{localStorage.removeItem(draftKey);}catch{/* Ignore. */}}}
 function change(field:Exclude<keyof FormState,'tags'>,value:string){setForm(current=>({...current,[field]:value}));}
 function restoreDraft(){const draft=restorable!;const merged=mergeDraft(sourcesRef.current,draft,id?sourcesRef.current.stockSymbols:'');captureRef.current=normalizeCaptureContext(draft.captureContext);setForm(merged.form);setStockSymbols(merged.stockSymbols);setTransactions(merged.transactions);setReviewTime(merged.reviewTime);setReviewInstant(merged.reviewInstant);setReminders(merged.reminders);setRestorable(null);}
 function discardDraft(){const next=editableFromDiary(initial);captureRef.current=normalizeCaptureContext(captureContext);setForm(next.form);setReminders(next.reminders);setTransactions(next.transactions);setStockSymbols(next.stockSymbols);setReviewTime(next.reviewTime);setReviewInstant(next.reviewInstant);const confirmed=canonicalState(next);baselineRef.current=confirmed;dirtyRef.current=false;setBaseline(confirmed);setSaveState('idle');setError(null);setRecoveryState(null);setRecoveryDiary(null);setRestorable(null);clearDraft();}
 function togglePreview(){
  if(!preview){const element=contentRef.current;if(element)caretState.current={start:element.selectionStart,end:element.selectionEnd,top:element.scrollTop};previewVisited.current=true;setPreview(true);}
  else setPreview(false);
 }
 async function readLatest():Promise<DiaryResponse|null>{
  try {
   const result=id?await api.GET('/api/diaries/{id}',{params:{path:{id}}}):await api.GET('/api/diaries/by-date',{params:{query:{date:sources.form.date}}});
   if(!result.response.ok)return null;
   const parsed=diaryResponseSchema.safeParse(result.data);
   return parsed.success?parsed.data:null;
  } catch { return null; }
 }
 function applyLatest(latest:DiaryResponse){
  const next=editableFromResponse(latest);
  setForm(next.form);setReminders(next.reminders);setTransactions(next.transactions);setStockSymbols(next.stockSymbols);setReviewTime(next.reviewTime);setReviewInstant(next.reviewInstant);
  const confirmed=canonicalState(next);baselineRef.current=confirmed;dirtyRef.current=false;setBaseline(confirmed);setSaveState('idle');setError(null);clearDraft();
 }
 async function loadLatest(){
  setPending(true); const latest=recoveryDiary??await readLatest();
  if(!latest){setPending(false);setRecoveryState('unavailable');return;}
  if(!id){clearDraft();dirtyRef.current=false;setPending(false);setError(null);navigate(`/diaries/${latest.id}/edit`);return;}
  applyLatest(latest); setRecoveryDiary(null); setRecoveryState(null); setPending(false);
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  // One in-flight write per editor; blocks same-frame double submits that
  // outrun the disabled-button re-render. Server-side date uniqueness is the
  // final duplicate guard.
  if(savingRef.current||recoveryState)return;
  setSaveState('failed'); // Client-side validation failures keep the failed status if they return early.
  setTransactionError('');const alerts=reminderInputs(reminders);if(alertsDirty&&(!alerts.every(row=>alertDraftSchema.safeParse(row).success)||alerts.length>50)){setTransactionError(reminderCopy[locale].invalid);return;}const companies=parseCompanyContext(stockSymbols);if(!companies.success){setError({message:companyContextCopy[locale].invalid,fields:['stockSymbols']});return;}const reviewDueAt=reviewTime?resolveLocalTradeInstant(reviewTime,reviewInstant):null;if(reviewTime&&!reviewDueAt){setTransactionError(reviewScheduleCopy[locale].invalid);return;}const parsedTransactions=[];for(const row of transactions){const instant=resolveLocalTradeInstant(row.tradeDate,row.instant);if(!instant){setTransactionError(ledgerCopy[locale].dateInvalid);return;}const parsed=(id?ledgerTransactionUpdateInputSchema:ledgerTransactionInputSchema).safeParse({...((id&&row.id)?{id:row.id}:{}),symbol:row.symbol,type:row.type,quantity:row.quantity,price:row.price,tradeDate:instant,notes:row.notes||null,strategy:row.strategy||null,emotion:row.emotion||null});if(!parsed.success){setTransactionError(ledgerCopy[locale].invalid);return;}parsedTransactions.push(parsed.data);}
  const controls=Array.from(event.currentTarget.elements).filter((element):element is DisableableControl=>'disabled' in element&&!element.disabled&&!(element instanceof HTMLButtonElement&&element.type==='submit'));
  controls.forEach(control=>{control.disabled=true;});
  setPending(true);savingRef.current=true;setSaveState('saving');setError(null);setRecoveryState(null);setRecoveryDiary(null);const body={...form,...(alertsDirty?{alerts}:{}),reviewDueAt,stockSymbols:companies.data??[],tags:form.tags.map(tag=>tag.trim()).filter(Boolean),thesis:form.thesis||null,risk:form.risk||null,execution:form.execution||null,transactions:parsedTransactions};try{const result=id?await api.PUT('/api/diaries/{id}',{params:{path:{id}},body}):await api.POST('/api/diaries',{body});if(result.response.ok&&result.data){const confirmed=canonicalState(editableFromResponse(result.data));baselineRef.current=confirmed;dirtyRef.current=false;setBaseline(confirmed);clearDraft();window.dispatchEvent(new Event('diary-reminders-changed'));navigate(`/diaries/${result.data.id}`,{state:{saved:true,captureContext:captureRef.current}});}else{setSaveState('failed');setError(apiFailure(result.error,t('failed')));}}catch{const latest=await readLatest();if(latest&&sameDiaryWrite(latest,body)){const confirmed=canonicalState(editableFromResponse(latest));baselineRef.current=confirmed;dirtyRef.current=false;setBaseline(confirmed);clearDraft();window.dispatchEvent(new Event('diary-reminders-changed'));navigate(`/diaries/${latest.id}`,{state:{saved:true,captureContext:captureRef.current}});}else{setSaveState('failed');setRecoveryDiary(latest);setRecoveryState(latest?'conflict':id?'unavailable':null);setError({message:writeRecoveryCopy[locale].uncertain,code:'DIARY_WRITE_UNCERTAIN',fields:[]});}}finally{controls.forEach(control=>{control.disabled=false;});setPending(false);savingRef.current=false;}
 }
 function field(name:'title'|'date'|'thesis'|'risk'|'execution',label:string,className?:string){
  const multiline=name==='thesis'||name==='risk'||name==='execution';
  const shared={name,className,value:form[name]??'',onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>change(name,event.target.value),'aria-invalid':invalidField(error,name),'aria-describedby':error?'form-error':undefined};
  return <label>{label}{multiline?<textarea {...shared} rows={3} maxLength={10000}/>:<input {...shared} type={name==='date'?'date':'text'} required={name==='title'||name==='date'} maxLength={name==='title'?500:undefined}/>}</label>;
 }
 return <form onSubmit={save} aria-busy={pending}><CaptureNotice context={captureContext} issue={captureIssue}/>{restorable&&<div className="editor-restore" role="status"><button type="button" onClick={restoreDraft}>{labels.restoreDraft}</button><button type="button" className="secondary" onClick={discardDraft}>{labels.discardDraft}</button></div>}<div className="editor-meta">{field('date',t('date'))}</div>{field('title',t('diaryTitle'),'title-input')}<CompanyContextInput value={stockSymbols} onChange={setStockSymbols} invalid={invalidField(error,'stockSymbols')}/><div className="editor-mode"><button type="button" className="secondary" aria-pressed={preview} onClick={togglePreview}>{preview?labels.writing:labels.preview}</button></div>{preview?<section ref={previewSectionRef} tabIndex={-1} aria-label={labels.preview}><Markdown>{form.content}</Markdown></section>:<label>{t('content')}<textarea ref={contentRef} name="content" className="editor-content" rows={quick?6:13} required value={form.content} onChange={event=>change('content',event.target.value)} aria-invalid={invalidField(error,'content')} aria-describedby={error?'content-hint form-error':'content-hint'}/></label>}<p id="content-hint" className="muted">{t('contentHint')}</p>{!quick&&<><fieldset className="original-fields"><legend>{labels.tags}</legend>{form.tags.map((tag,index)=><div className="tag-input" key={index}><label>{labels.tag} {index+1}<textarea rows={1} value={tag} maxLength={100} onChange={event=>{setForm(current=>({...current,tags:current.tags.map((value,i)=>i===index?event.target.value:value)}));}} aria-invalid={invalidField(error,'tags')} aria-describedby={error?'form-error':undefined}/></label><button type="button" className="secondary" aria-label={`${labels.removeTag} ${index+1}`} onClick={()=>{setForm(current=>({...current,tags:current.tags.filter((_,i)=>i!==index)}));}}>{labels.removeTag}</button></div>)}<button type="button" className="secondary" disabled={form.tags.length>=50} onClick={()=>{setForm(current=>({...current,tags:[...current.tags,'']}));}}>{labels.addTag}</button></fieldset><fieldset className="original-fields"><legend>{labels.original}</legend>{field('thesis',labels.thesis)}{field('risk',labels.risk)}{field('execution',labels.execution)}</fieldset></>}{!quick&&<BuyTransactionFields value={transactions} pending={pending} onChange={setTransactions}/>}{!quick&&<ReviewScheduling value={reviewTime} instant={reviewInstant} onChange={(value,instant)=>{setReviewTime(value);setReviewInstant(instant);}}/>}{!quick&&<AlertFields value={reminders} pending={pending} editing={Boolean(id)} onChange={rows=>{remindersChanged.current=true;setReminders(rows);}}/>}{transactionError&&<p className="error" role="alert">{transactionError}</p>}{invalidField(error,'transactions')&&<p className="error">{ledgerCopy[locale].oversell}</p>}<FailureNotice failure={error}/>{(error?.code==='AUTH_TOKEN_INVALID'||error?.code==='AUTH_UNAUTHORIZED')&&<p className="editor-signin"><Link className="button secondary" to={signInPath(id?`/diaries/${id}/edit`:buildCapturePath('new',captureRef.current,form.date))}>{t('login')}</Link></p>}{recoveryState&&<div className="actions" role="group" aria-label={writeRecoveryCopy[locale].loadLatest}><button type="button" className="secondary" onClick={()=>void loadLatest()} disabled={pending}>{writeRecoveryCopy[locale].loadLatest}</button></div>}<div className="editor-footer"><span className={saveState==='failed'?'save-status is-failed':saveState==='saving'?'save-status is-saving':dirty?'save-status is-dirty':'save-status'} data-testid="save-status" role="status">{saveState==='saving'?labels.statusSaving:saveState==='failed'?labels.statusFailed:dirty?labels.statusDirty:''}</span><div className="actions">{id&&<button type="button" className="secondary" onClick={()=>navigate(`/diaries/${id}`)}>{labels.cancel}</button>}<button type="submit" disabled={pending||Boolean(recoveryState)||!form.content.trim()}>{t(pending?'pending':'save')}</button></div></div></form>;
}
