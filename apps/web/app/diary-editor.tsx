import { AlertFields, reminderCopy, reminderDrafts, reminderInputs } from './alert-fields';
import { alertDraftSchema, type AlertResponse } from '@diary/contracts/alerts';
import { CompanyContextInput,companyContextCopy,parseCompanyContext } from './company-context-input';
import { ReviewScheduling,reviewScheduleCopy } from './review-scheduling';
import { resolveLocalTradeInstant,localTradeValue } from './trade-time';
import { ledgerTransactionInputSchema,ledgerTransactionUpdateInputSchema,type LedgerTransactionResponse } from '@diary/contracts/ledger';
import { BuyTransactionFields,type BuyDraft } from './buy-transaction-fields';
import { ledgerCopy } from './ledger-copy';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Link,useBlocker,useNavigate } from 'react-router';
import { api,useUi } from './ui';
import { signInPath,useSessionState } from './session';
import { apiFailure,FailureNotice,invalidField,type Failure } from './api-error';
import { diaryCopy } from './diary-copy';
import { Markdown } from './markdown';
import './diary-editor.css';
import { diaryResponseSchema, type DiaryResponse } from '@diary/contracts';
export type DiaryFields={alerts?:AlertResponse[];date:string;title:string;content:string;tags:string[];thesis:string|null;risk:string|null;execution:string|null;stockSymbols?:string[];reviewDueAt?:string|null;transactions?:LedgerTransactionResponse[];reviewStatus?:'none'|'pending'|'reviewed'|null};

const writeRecoveryCopy = {
 'zh-TW': { uncertain:'儲存結果未能確認。伺服器可能已有不同版本；本地內容仍保留。請先載入最新版本，再決定是否繼續編輯。', loadLatest:'載入最新版本' },
 'zh-CN': { uncertain:'保存结果无法确认。服务器可能已有不同版本；本地内容仍保留。请先加载最新版本，再决定是否继续编辑。', loadLatest:'加载最新版本' },
 en: { uncertain:'The save result could not be confirmed. The server may have a different version; your entries remain here. Load the latest version before editing further.', loadLatest:'Load latest version' },
} as const;

function sameDiaryWrite(diary: DiaryResponse, body: Record<string, unknown>) {
 const fields = ['title','content','date','tags','thesis','risk','execution','reviewDueAt','stockSymbols'] as const;
 for (const field of fields) {
  if (body[field] !== undefined && JSON.stringify(diary[field] ?? null) !== JSON.stringify(body[field] ?? null)) return false;
 }
 if (body.alerts !== undefined) {
  if (!Array.isArray(body.alerts)) return false;
  const expected = body.alerts.map(row => {
   if (!row || typeof row !== 'object') return null;
   const value = row as Record<string, unknown>;
   return { message: value.message, triggerAt: value.triggerAt, recurringMode: value.recurringMode ?? null };
  });
  const actual = (diary.alerts ?? []).map(row => ({ message: row.message, triggerAt: row.triggerAt, recurringMode: row.recurringMode ?? null }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
 }
 if (body.transactions !== undefined) {
  if (!Array.isArray(body.transactions)) return false;
  const expected = body.transactions.map(row => {
   if (!row || typeof row !== 'object') return null;
   const value = row as Record<string, unknown>;
   return { symbol: value.symbol, type: value.type, quantity: value.quantity, price: value.price, tradeDate: value.tradeDate, notes: value.notes ?? null, strategy: value.strategy ?? null, emotion: value.emotion ?? null };
  });
  const actual = (diary.transactions ?? []).map(row => ({ symbol: row.symbol, type: row.type, quantity: row.quantity, price: row.price, tradeDate: row.tradeDate, notes: row.notes ?? null, strategy: row.strategy ?? null, emotion: row.emotion ?? null }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
 }
 return true;
}

// Device-local recovery for unsaved editor content: keyed by account and diary,
// 24-hour TTL, written debounced while dirty, cleared only after a confirmed
// server save, an explicit discard, or an explicit sign-out (never on 401).
const draftStringFields = ['date','title','content','stockSymbols'] as const;
const draftNullableFields = ['thesis','risk','execution'] as const;
type EditorDraft = { date?:string;title?:string;content?:string;tags?:string[];thesis?:string|null;risk?:string|null;execution?:string|null;stockSymbols?:string };
function readEditorDraft(key:string):EditorDraft|null{
 try{
  const saved=JSON.parse(localStorage.getItem(key)??'null');
  if(!saved||typeof saved.at!=='number'||saved.at>Date.now()||Date.now()-saved.at>86_400_000||!saved.value||typeof saved.value!=='object')return null;
  const value=saved.value as Record<string,unknown>;
  const draft:EditorDraft={};
  for(const field of draftStringFields)if(typeof value[field]==='string')draft[field]=value[field];
  for(const field of draftNullableFields)if(typeof value[field]==='string'||value[field]===null)draft[field]=value[field];
  if(Array.isArray(value.tags))draft.tags=value.tags.filter((tag):tag is string=>typeof tag==='string');
  return draft.content||draft.title?draft:null;
 }catch{return null;}
}
function sameEditorDraft(draft:EditorDraft,initial:DiaryFields,stockSymbols:string){
 const initialTags=initial.tags.length?initial.tags:[''];
 return draft.title===initial.title&&draft.content===initial.content&&draft.date===initial.date&&draft.thesis===initial.thesis&&draft.risk===initial.risk&&draft.execution===initial.execution&&draft.stockSymbols===stockSymbols&&JSON.stringify(draft.tags??initialTags)===JSON.stringify(initialTags);
}

export function DiaryEditor({initial,id,accountId,quick=false}:{initial:DiaryFields;id?:string;accountId?:string;quick?:boolean}){
 const {t,locale}=useUi();const labels=diaryCopy[locale];const session=useSessionState();const navigate=useNavigate();
 const [reminders,setReminders]=useState(()=>reminderDrafts(initial.alerts??[]));const remindersChanged=useRef(false);
 const [form,setForm]=useState({date:initial.date,title:initial.title,content:initial.content,tags:initial.tags.length?[...initial.tags]:[''],thesis:initial.thesis,risk:initial.risk,execution:initial.execution});const [preview,setPreview]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState<Failure|null>(null);const dirtyRef=useRef(false);const [dirty,setDirty]=useState(false);const [saveState,setSaveState]=useState<'idle'|'saving'|'failed'>('idle');const savingRef=useRef(false);
 const [transactions,setTransactions]=useState<BuyDraft[]>(()=>initial.transactions?.map(row=>({key:row.id,id:row.id,type:row.type,symbol:row.symbol,quantity:row.quantity,price:row.price,tradeDate:localTradeValue(new Date(row.tradeDate)),instant:row.tradeDate,notes:row.notes??'',strategy:row.strategy??'',emotion:row.emotion??''}))??[]);const [transactionError,setTransactionError]=useState('');const [stockSymbols,setStockSymbols]=useState((initial.stockSymbols??[]).join(', '));const [reviewTime,setReviewTime]=useState(initial.reviewDueAt?localTradeValue(new Date(initial.reviewDueAt)):'');const [reviewInstant,setReviewInstant]=useState(initial.reviewDueAt??'');const [recoveryState,setRecoveryState]=useState<'conflict'|'unavailable'|null>(null);const [recoveryDiary,setRecoveryDiary]=useState<DiaryResponse|null>(null);
 const draftKey=accountId&&!quick?`diary-editor-draft:${accountId}:${id??'new'}`:null;
 // A draft identical to the freshly loaded baseline offers nothing to restore.
 const [restorable,setRestorable]=useState<EditorDraft|null>(()=>{if(!draftKey)return null;const draft=readEditorDraft(draftKey);return draft&&!sameEditorDraft(draft,initial,(initial.stockSymbols??[]).join(', '))?draft:null;});
 const [draftClosed,setDraftClosed]=useState(false);const restorableRef=useRef(restorable);restorableRef.current=restorable;const draftClosedRef=useRef(draftClosed);draftClosedRef.current=draftClosed;
 const contentRef=useRef<HTMLTextAreaElement>(null);const caretState=useRef<{start:number;end:number;top:number}|null>(null);const previewSectionRef=useRef<HTMLElement|null>(null);const previewVisited=useRef(false);
 const blocker=useBlocker(()=>dirtyRef.current&&session.authenticated!==false);
 useEffect(()=>{if(blocker.state==='blocked'){if(window.confirm(labels.discard))blocker.proceed();else blocker.reset();}},[blocker,labels.discard]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 // Debounced device-local backup of the writing fields; paused while a restore
 // decision is pending or the draft was explicitly discarded.
 useEffect(()=>{if(!draftKey||restorable||draftClosed||!dirty)return;const timer=setTimeout(()=>{try{localStorage.setItem(draftKey,JSON.stringify({at:Date.now(),value:{...form,stockSymbols}}));}catch{/* Recovery is best effort; storage may be unavailable. */}},600);return()=>clearTimeout(timer);},[draftKey,restorable,draftClosed,dirty,form,stockSymbols]);
 // The debounced write may not have fired yet when the editor unmounts dirty
 // (accepted navigation, session-expiry redirect); flush the snapshot so an
 // in-flight save failure or leave still leaves recoverable content.
 const draftSnapshot=useRef({form,stockSymbols});draftSnapshot.current={form,stockSymbols};
 useEffect(()=>()=>{if(!draftKey||draftClosedRef.current||restorableRef.current||!dirtyRef.current)return;const {form:currentForm,stockSymbols:currentSymbols}=draftSnapshot.current;try{localStorage.setItem(draftKey,JSON.stringify({at:Date.now(),value:{...currentForm,stockSymbols:currentSymbols}}));}catch{/* Recovery is best effort; storage may be unavailable. */}},[draftKey]);
 // Returning from preview restores the exact caret, scroll offset and focus.
 useEffect(()=>{if(preview){previewSectionRef.current?.focus();return;}if(!previewVisited.current)return;const element=contentRef.current;if(!element)return;const caret=caretState.current;const target=caret??{start:element.value.length,end:element.value.length,top:element.scrollTop};element.focus();element.setSelectionRange(target.start,target.end);element.scrollTop=target.top;},[preview]);
 function markDirty(){dirtyRef.current=true;setDirty(true);}
 function markClean(){dirtyRef.current=false;setDirty(false);}
 function clearDraft(){if(draftKey){try{localStorage.removeItem(draftKey);}catch{/* Ignore. */}}}
 function change(field:Exclude<keyof typeof form,'tags'>,value:string){markDirty();setForm(current=>({...current,[field]:value}));}
 function restoreDraft(draft:EditorDraft){setForm(current=>({date:draft.date??current.date,title:draft.title??current.title,content:draft.content??current.content,tags:draft.tags?draft.tags.length?[...draft.tags]:['']:current.tags,thesis:draft.thesis??current.thesis,risk:draft.risk??current.risk,execution:draft.execution??current.execution}));if(draft.stockSymbols!==undefined)setStockSymbols(draft.stockSymbols);setRestorable(null);setDraftClosed(false);markDirty();}
 function discardDraft(){setDraftClosed(true);setRestorable(null);clearDraft();}
 function togglePreview(){
  if(!preview){const element=contentRef.current;if(element)caretState.current={start:element.selectionStart,end:element.selectionEnd,top:element.scrollTop};previewVisited.current=true;setPreview(true);}
  else setPreview(false);
 }
 async function readLatest():Promise<DiaryResponse|null>{
  try {
   const result=id?await api.GET('/api/diaries/{id}',{params:{path:{id}}}):await api.GET('/api/diaries/by-date',{params:{query:{date:form.date}}});
   if(!result.response.ok)return null;
   const parsed=diaryResponseSchema.safeParse(result.data);
   return parsed.success?parsed.data:null;
  } catch { return null; }
 }
 function applyLatest(latest:DiaryResponse){
  setForm({date:latest.date,title:latest.title,content:latest.content??'',tags:latest.tags.length?[...latest.tags]:[''],thesis:latest.thesis??null,risk:latest.risk??null,execution:latest.execution??null});
  setReminders(reminderDrafts(latest.alerts??[])); remindersChanged.current=false;
  setTransactions(latest.transactions?.map(row=>({key:row.id,id:row.id,type:row.type,symbol:row.symbol,quantity:row.quantity,price:row.price,tradeDate:localTradeValue(new Date(row.tradeDate)),instant:row.tradeDate,notes:row.notes??'',strategy:row.strategy??'',emotion:row.emotion??''}))??[]);
  setStockSymbols((latest.stockSymbols??[]).join(', ')); setReviewTime(latest.reviewDueAt?localTradeValue(new Date(latest.reviewDueAt)):''); setReviewInstant(latest.reviewDueAt??'');
  markClean(); setSaveState('idle'); setError(null); clearDraft(); setDraftClosed(false);
 }
 async function loadLatest(){
  setPending(true); const latest=recoveryDiary??await readLatest();
  if(!latest){setPending(false);setRecoveryState('unavailable');return;}
  if(!id){markClean();clearDraft();setDraftClosed(false);setPending(false);setError(null);navigate(`/diaries/${latest.id}/edit`);return;}
  applyLatest(latest); setRecoveryDiary(null); setRecoveryState(null); setPending(false);
 }
 async function save(event:FormEvent){
  event.preventDefault();
  // One in-flight write per editor; blocks same-frame double submits that
  // outrun the disabled-button re-render. Server-side date uniqueness is the
  // final duplicate guard.
  if(savingRef.current||recoveryState)return;
  setSaveState('failed'); // Client-side validation failures keep the failed status if they return early.
  setTransactionError('');const alerts=reminderInputs(reminders);if(remindersChanged.current&&(!alerts.every(row=>alertDraftSchema.safeParse(row).success)||alerts.length>50)){setTransactionError(reminderCopy[locale].invalid);return;}const companies=parseCompanyContext(stockSymbols);if(!companies.success){setError({message:companyContextCopy[locale].invalid,fields:['stockSymbols']});return;}const reviewDueAt=reviewTime?resolveLocalTradeInstant(reviewTime,reviewInstant):null;if(reviewTime&&!reviewDueAt){setTransactionError(reviewScheduleCopy[locale].invalid);return;}const parsedTransactions=[];for(const row of transactions){const instant=resolveLocalTradeInstant(row.tradeDate,row.instant);if(!instant){setTransactionError(ledgerCopy[locale].dateInvalid);return;}const parsed=(id?ledgerTransactionUpdateInputSchema:ledgerTransactionInputSchema).safeParse({...((id&&row.id)?{id:row.id}:{}),symbol:row.symbol,type:row.type,quantity:row.quantity,price:row.price,tradeDate:instant,notes:row.notes||null,strategy:row.strategy||null,emotion:row.emotion||null});if(!parsed.success){setTransactionError(ledgerCopy[locale].invalid);return;}parsedTransactions.push(parsed.data);}
  setPending(true);savingRef.current=true;setSaveState('saving');setError(null);setRecoveryState(null);setRecoveryDiary(null);const body={...form,...(remindersChanged.current?{alerts}:{}),reviewDueAt,stockSymbols:companies.data??[],tags:form.tags.map(tag=>tag.trim()).filter(Boolean),thesis:form.thesis||null,risk:form.risk||null,execution:form.execution||null,transactions:parsedTransactions};try{const result=id?await api.PUT('/api/diaries/{id}',{params:{path:{id}},body}):await api.POST('/api/diaries',{body});if(result.response.ok&&result.data){markClean();clearDraft();window.dispatchEvent(new Event('diary-reminders-changed'));navigate(`/diaries/${result.data.id}`,{state:{saved:true}});}else{setSaveState('failed');setError(apiFailure(result.error,t('failed')));}}catch{const latest=await readLatest();if(latest&&sameDiaryWrite(latest,body)){markClean();clearDraft();window.dispatchEvent(new Event('diary-reminders-changed'));navigate(`/diaries/${latest.id}`,{state:{saved:true}});}else{setSaveState('failed');setRecoveryDiary(latest);setRecoveryState(latest?'conflict':'unavailable');setError({message:writeRecoveryCopy[locale].uncertain,code:'DIARY_WRITE_UNCERTAIN',fields:[]});}}finally{setPending(false);savingRef.current=false;}
 }
 function field(name:'title'|'date'|'thesis'|'risk'|'execution',label:string,className?:string){
  const multiline=name==='thesis'||name==='risk'||name==='execution';
  const shared={name,className,value:form[name]??'',onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>change(name,event.target.value),'aria-invalid':invalidField(error,name),'aria-describedby':error?'form-error':undefined};
  return <label>{label}{multiline?<textarea {...shared} rows={3} maxLength={10000}/>:<input {...shared} type={name==='date'?'date':'text'} required={name==='title'||name==='date'} maxLength={name==='title'?500:undefined}/>}</label>;
 }
 return <form onSubmit={save} aria-busy={pending}>{restorable&&<div className="editor-restore" role="status"><button type="button" onClick={()=>restoreDraft(restorable)}>{labels.restoreDraft}</button><button type="button" className="secondary" onClick={discardDraft}>{labels.discardDraft}</button></div>}<div className="editor-meta">{field('date',t('date'))}</div>{field('title',t('diaryTitle'),'title-input')}<CompanyContextInput value={stockSymbols} onChange={value=>{markDirty();setStockSymbols(value);}} invalid={invalidField(error,'stockSymbols')}/><div className="editor-mode"><button type="button" className="secondary" aria-pressed={preview} onClick={togglePreview}>{preview?labels.writing:labels.preview}</button></div>{preview?<section ref={previewSectionRef} tabIndex={-1} aria-label={labels.preview}><Markdown>{form.content}</Markdown></section>:<label>{t('content')}<textarea ref={contentRef} name="content" className="editor-content" rows={quick?6:13} required value={form.content} onChange={event=>change('content',event.target.value)} aria-invalid={invalidField(error,'content')} aria-describedby={error?'content-hint form-error':'content-hint'}/></label>}<p id="content-hint" className="muted">{t('contentHint')}</p>{!quick&&<><fieldset className="original-fields"><legend>{labels.tags}</legend>{form.tags.map((tag,index)=><div className="tag-input" key={index}><label>{labels.tag} {index+1}<textarea rows={1} value={tag} maxLength={100} onChange={event=>{markDirty();setForm(current=>({...current,tags:current.tags.map((value,i)=>i===index?event.target.value:value)}));}} aria-invalid={invalidField(error,'tags')} aria-describedby={error?'form-error':undefined}/></label><button type="button" className="secondary" aria-label={`${labels.removeTag} ${index+1}`} onClick={()=>{markDirty();setForm(current=>({...current,tags:current.tags.filter((_,i)=>i!==index)}));}}>{labels.removeTag}</button></div>)}<button type="button" className="secondary" disabled={form.tags.length>=50} onClick={()=>{markDirty();setForm(current=>({...current,tags:[...current.tags,'']}));}}>{labels.addTag}</button></fieldset><fieldset className="original-fields"><legend>{labels.original}</legend>{field('thesis',labels.thesis)}{field('risk',labels.risk)}{field('execution',labels.execution)}</fieldset></>}{!quick&&<BuyTransactionFields value={transactions} pending={pending} onChange={value=>{markDirty();setTransactions(value);}}/>}{!quick&&<ReviewScheduling value={reviewTime} instant={reviewInstant} onChange={(value,instant)=>{markDirty();setReviewTime(value);setReviewInstant(instant);}}/>}{!quick&&<AlertFields value={reminders} pending={pending} editing={Boolean(id)} onChange={rows=>{markDirty();remindersChanged.current=true;setReminders(rows);}}/>}{transactionError&&<p className="error" role="alert">{transactionError}</p>}{invalidField(error,'transactions')&&<p className="error">{ledgerCopy[locale].oversell}</p>}<FailureNotice failure={error}/>{(error?.code==='AUTH_TOKEN_INVALID'||error?.code==='AUTH_UNAUTHORIZED')&&<p className="editor-signin"><Link className="button secondary" to={signInPath(id?`/diaries/${id}/edit`:'/diaries/new')}>{t('login')}</Link></p>}{recoveryState&&<div className="actions" role="group" aria-label={writeRecoveryCopy[locale].loadLatest}><button type="button" className="secondary" onClick={()=>void loadLatest()} disabled={pending}>{writeRecoveryCopy[locale].loadLatest}</button></div>}<div className="editor-footer"><span className={saveState==='failed'?'save-status is-failed':saveState==='saving'?'save-status is-saving':dirty?'save-status is-dirty':'save-status'} data-testid="save-status" role="status">{saveState==='saving'?labels.statusSaving:saveState==='failed'?labels.statusFailed:dirty?labels.statusDirty:''}</span><div className="actions">{id&&<button type="button" className="secondary" onClick={()=>navigate(`/diaries/${id}`)}>{labels.cancel}</button>}<button type="submit" disabled={pending||Boolean(recoveryState)||!form.content.trim()}>{t(pending?'pending':'save')}</button></div></div></form>;
}
