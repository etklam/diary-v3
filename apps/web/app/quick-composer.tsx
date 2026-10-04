import { CompanyContextInput,companyContextCopy,parseCompanyContext } from './company-context-input';
import { recentClosedTradeSchema } from '@diary/contracts/ledger';
import { useEffect,useMemo,useRef,useState,type FormEvent } from 'react';
import { Link,useBlocker,useNavigate } from 'react-router';
import { calendarDateInTimezone,createEmptyQuickNoteTemplateData,deriveQuickTitle,generateTemplateDraft,mergeQuickTemplate,quickSnippets,type QuickNoteTemplateData,type QuickNoteTemplateKind } from '@diary/domain';
import { api,useUi } from './ui';
import './diary-editor.css';
import { signInPath,useSessionState,wasExplicitSignOut } from './session';
import { apiFailure,FailureNotice,invalidField,type Failure } from './api-error';
import { QuickFields } from './quick-fields';
import { Markdown } from './markdown';
import { quickCopy } from './quick-copy';
import './quick.css';
import { CaptureReminder,VoiceCapture } from './quick-capture-tools';
import { NO_AUTOMATIC_SESSION_RETRY_HEADER } from '@diary/api-client';
import { buildCapturePath, buildCompanyPath, composeSharedContent, normalizeCaptureContext, type CaptureContext, type CaptureContextIssue, type CaptureShare } from './capture-context';
import { CaptureNotice } from './capture-notice';
import { Icon } from './icons';
import { useRecentTags } from './recent-tags';
import { ConfirmDialog, TagField, WritingToolbar, authoringCopy, splitTags } from './authoring-controls';
import { diaryResponseSchema, type DiaryResponse } from '@diary/contracts';
export type Draft={date:string;title:string;content:string;tags:string;stockSymbols:string;kind:QuickNoteTemplateKind;data:QuickNoteTemplateData;mode:'create'|'append';titleTouched:boolean;contentTouched:boolean;applied:string;captureContext?:CaptureContext;uncertain?:boolean};
type Snippet={id:string;name:string;content:string};
function isDefiniteAppendRejection(status:number,code?:string){if(status===400)return code==='SYS_VALIDATION_ERROR';if(status===401)return code==='AUTH_UNAUTHORIZED'||code==='AUTH_TOKEN_INVALID'||code==='AUTH_TOKEN_EXPIRED'||code==='AUTH_TOKEN_NOT_FOUND'||code==='AUTH_TOKEN_REVOKED';if(status===403)return code==='AUTH_FORBIDDEN'||code==='CSRF_FAILED';return status===409&&code==='DIARY_ALREADY_EXISTS';}
function empty(date:string,stockSymbols='',captureContext?:CaptureContext,content=''):Draft{return {date,title:'',content,tags:'',stockSymbols:stockSymbols.trim(),kind:'blank',data:createEmptyQuickNoteTemplateData(),mode:'create',titleTouched:false,/* Shared text is the author's own content: a template must never overwrite it. */contentTouched:Boolean(content),applied:'',...(captureContext?{captureContext}: {})};}
/**
 * The private shell replaces the public one as soon as the session is confirmed,
 * which remounts everything under `main`. That lands in the exact window this
 * composer now renders in, so writing typed before the account read confirms is
 * carried across that single remount in memory — same document, never stored,
 * dropped as soon as the account confirms or the session ends.
 */
let preAccountDraft:{at:number;value:Draft}|null=null;
const PRE_ACCOUNT_CARRY_MS=15_000;
export function draftValueForStorage(form:Draft,uncertain=false):Draft{return uncertain?{...form,uncertain:true}:form;}
export function readDraft(key:string):Draft|null{try{const saved=JSON.parse(localStorage.getItem(key)??'null');if(!saved||typeof saved.at!=='number'||Date.now()-saved.at>86400000||saved.at>Date.now()||!saved.value)return null;const v=saved.value;if(typeof v.content!=='string'||typeof v.title!=='string'||typeof v.tags!=='string'||typeof v.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!['blank','trading','reflection','observation'].includes(v.kind)||!v.data||typeof v.data!=='object')return null;const data=createEmptyQuickNoteTemplateData();for(const field of ['tradingType','symbols','marketMood','note','marketCondition','goodPoints','improvePoints','topic','observationType','observationContent','action'] as const){if(typeof v.data[field]==='string')data[field]=v.data[field];}data.rating=Number.isInteger(v.data.rating)&&v.data.rating>=0&&v.data.rating<=5?v.data.rating:0;data.noRashTrading=v.data.noRashTrading===true;data.relatedTrades=Array.isArray(v.data.relatedTrades)?v.data.relatedTrades.flatMap((trade:Record<string,unknown>)=>{if(!trade||typeof trade!=='object')return [];const candidate={...trade};for(const field of ['sellQuantity','realizedPnL','realizedPnLPct'])if(typeof candidate[field]==='number'&&Number.isFinite(candidate[field]))candidate[field]=String(candidate[field]);const parsed=recentClosedTradeSchema.safeParse(candidate);return parsed.success?[parsed.data]:[];}):[];const captureContext=normalizeCaptureContext(v.captureContext);return {date:v.date,title:v.title,content:v.content,tags:v.tags,stockSymbols:typeof v.stockSymbols==='string'?v.stockSymbols:Array.isArray(v.stockSymbols)?v.stockSymbols.filter((value:unknown)=>typeof value==='string').join(', '):'',kind:v.kind,data,mode:v.mode==='append'?'append':'create',titleTouched:v.titleTouched===true,contentTouched:v.contentTouched===true,applied:typeof v.applied==='string'?v.applied:'',...(captureContext?{captureContext}: {}),...(v.uncertain===true?{uncertain:true}: {})};}catch{return null;}}
export function QuickComposer({onSaved,onNavigate,initialDate,captureContext,captureIssue,share,autoFocusContent=false}:{onSaved?:(id:string,captureContext?:CaptureContext|null)=>void;onNavigate?:()=>void;initialDate?:string;captureContext?:CaptureContext|null;captureIssue?:CaptureContextIssue|null;share?:CaptureShare;autoFocusContent?:boolean}){
 const {t}=useUi();const [account,setAccount]=useState<{id:string;date:string}|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);const session=useSessionState(),sessionRef=useRef(session);sessionRef.current=session;
 // The writing area must not wait on the account read. The device date seeds the
 // draft, the account read corrects it, and the composer is only remounted when
 // a *different* account is confirmed — never on the first confirmation.
 const deviceDate=initialDate??calendarDateInTimezone(new Date(),Intl.DateTimeFormat().resolvedOptions().timeZone);
 const typed=useRef(false),confirmedId=useRef<string|null>(null),[generation,setGeneration]=useState(0);
 useEffect(()=>{let active=true;const revision=session.revision;setAccount(null);setError(false);if(session.authenticated===false)return()=>{active=false;};const live=()=>active&&sessionRef.current.authenticated!==false&&sessionRef.current.revision===revision;api.GET('/api/auth/me').then(result=>{if(!live())return;if(result.data){const id=result.data.data.id;if(confirmedId.current&&confirmedId.current!==id){typed.current=false;setGeneration(value=>value+1);}confirmedId.current=id;setAccount({id,date:initialDate??calendarDateInTimezone(new Date(),result.data.data.timezone)});}else setError(true);}).catch(()=>{if(live())setError(true);});return()=>{active=false;};},[attempt,initialDate,session.authenticated,session.revision]);
 if(session.authenticated===false)return <><p>{t('loginRequired')}</p><Link to={signInPath(buildCapturePath('quick',captureContext,initialDate,share))}>{t('login')}</Link></>;
 // Confirming the session swaps the public shell for the private one, which
 // remounts everything under `main`. Rendering a writing area into that window
 // would hand back a surface that resets a frame later, so the composer waits
 // for the bootstrap — and then renders without waiting for the account read.
 if(session.authenticated===null)return <p role="status">{t('loading')}</p>;
 if(error&&!typed.current)return <><p role="alert">{t('connection')}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</button></>;
 return <>{error&&<div role="alert" className="quick-account-error"><p>{t('connection')}</p><button type="button" className="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</button></div>}<Composer key={generation} accountId={account?.id??null} accountDate={account?.date??null} deviceDate={deviceDate} onTyped={()=>{typed.current=true;}} share={share} initialDate={initialDate} captureContext={captureContext} captureIssue={captureIssue} onSaved={onSaved} onNavigate={onNavigate} autoFocusContent={autoFocusContent}/></>;
}
export function QuickSavedState({id,captureContext,onNew,onNavigate}:{id:string;captureContext?:CaptureContext|null;onNew:()=>void;onNavigate?:()=>void}){
 const {locale}=useUi(),c=quickCopy[locale],openRef=useRef<HTMLAnchorElement>(null),companyPath=buildCompanyPath(captureContext);
 useEffect(()=>{openRef.current?.focus();},[id]);
 // One filled action at the one moment the flow is finished; the rest stay quiet.
 return <section className="quick-saved" role="status" aria-labelledby="quick-saved-title"><h2 id="quick-saved-title">{c.savedHeading}</h2><p>{c.saved}</p><div className="actions"><Link ref={openRef} className="button" to={`/diaries/${id}`} state={{saved:true,captureContext}} onClick={onNavigate}>{c.openDiary}</Link><Link className="button quiet-button" to={`/diaries/${id}/edit`} onClick={onNavigate}>{c.editDetails}</Link><button type="button" className="quiet-button" onClick={onNew}>{c.newNote}</button>{companyPath&&<Link className="button quiet-button" to={companyPath} onClick={onNavigate}>{c.returnCompany}</Link>}</div></section>;
}
/** Snippet management is its own dialog instead of a fourth inline disclosure level. */
function SnippetManager({open,snippets,onSave,onClose}:{open:boolean;snippets:Snippet[];onSave:(value:Snippet[])=>void;onClose:()=>void}){
 const {locale}=useUi(),c=quickCopy[locale],ref=useRef<HTMLDialogElement>(null);
 const [editId,setEditId]=useState(''),[name,setName]=useState(''),[body,setBody]=useState('');
 useEffect(()=>{if(open)ref.current?.showModal();else ref.current?.close();},[open]);
 return <dialog ref={ref} className="snippet-dialog" aria-labelledby="quick-snippets-title" onClose={onClose}>
  <h2 id="quick-snippets-title">{c.manageTitle}</h2>
  <p className="muted">{c.local}</p>
  <div className="authoring-field"><label htmlFor="quick-snippet-edit">{c.manage}</label><select id="quick-snippet-edit" value={editId} onChange={event=>{const item=snippets.find(item=>item.id===event.target.value);setEditId(event.target.value);setName(item?.name??'');setBody(item?.content??'');}}><option value="">{c.newSnippet}</option>{snippets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
  <div className="authoring-field"><label htmlFor="quick-snippet-name">{c.name}</label><input id="quick-snippet-name" value={name} maxLength={100} onChange={event=>setName(event.target.value)}/></div>
  <div className="authoring-field"><label htmlFor="quick-snippet-body">{c.snippets}</label><textarea id="quick-snippet-body" rows={4} value={body} onChange={event=>setBody(event.target.value)}/></div>
  <div className="actions">
   <button type="button" disabled={!name.trim()||!body.trim()} onClick={()=>{const item={id:editId||crypto.randomUUID(),name:name.trim(),content:body};onSave(editId?snippets.map(value=>value.id===editId?item:value):[item,...snippets]);setEditId(item.id);}}>{c.saveSnippet}</button>
   {editId&&<button type="button" className="secondary" onClick={()=>{onSave(snippets.filter(item=>item.id!==editId));setEditId('');setName('');setBody('');}}>{c.deleteSnippet}</button>}
   <button type="button" className="secondary" onClick={onClose}>{c.done}</button>
  </div>
 </dialog>;
}
function Composer({accountId,accountDate,deviceDate,onTyped,share,initialDate,captureContext,captureIssue,onSaved,onNavigate,autoFocusContent}:{accountId:string|null;accountDate:string|null;deviceDate:string;onTyped:()=>void;share?:CaptureShare;initialDate?:string;captureContext?:CaptureContext|null;captureIssue?:CaptureContextIssue|null;onSaved?: (id:string,captureContext?:CaptureContext|null)=>void;onNavigate?:()=>void;autoFocusContent?:boolean}){
 const {locale,t}=useUi(),c=quickCopy[locale],navigate=useNavigate(),session=useSessionState();const key=accountId?`diary-quick-draft:${accountId}`:'',snippetKey=accountId?`diary-quick-snippets:${accountId}`:'';
 const sessionRef=useRef(session);sessionRef.current=session;
 const incomingDate=initialDate??accountDate??deviceDate;
 const seed=composeSharedContent(share);
 const [restorable,setRestorable]=useState<Draft|null>(()=>key?readDraft(key):null);
 const captureRef=useRef(captureContext??null);
 const carried=useRef(!accountId&&preAccountDraft&&Date.now()-preAccountDraft.at<PRE_ACCOUNT_CARRY_MS?preAccountDraft.value:null);
 const [form,setForm]=useState<Draft>(()=>carried.current??(restorable?empty(incomingDate,'',undefined,seed):empty(incomingDate,captureRef.current?.symbol,captureRef.current??undefined,seed))),[draftError,setDraftError]=useState(false),[savedDraft,setSavedDraft]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<Failure|null>(null),[destination,setDestination]=useState<DiaryResponse|null>(null),[checking,setChecking]=useState(false),[lookupError,setLookupError]=useState(false),[lookupAttempt,setLookupAttempt]=useState(0),[preview,setPreview]=useState(false),[snippets,setSnippets]=useState<Snippet[]>(()=>{try{const value=JSON.parse((snippetKey?localStorage.getItem(snippetKey):null)??'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&typeof item.content==='string'):[];}catch{return [];}}),[snippet,setSnippet]=useState('default-1');
 const modeTouched=useRef(false),skipSave=useRef(false),skipSuggested=useRef(false),dirtyRef=useRef(false),active=useRef(true),incomingKey=useRef(buildCapturePath('quick',captureContext,incomingDate,share)),contentRef=useRef<HTMLTextAreaElement>(null),restoreRef=useRef<HTMLButtonElement>(null),destinationRef=useRef<DiaryResponse|null>(null),lookupRevision=useRef(0);
 const [recentTags,rememberTags]=useRecentTags(accountId??'');
 const a=authoringCopy[locale];
 const formRef=useRef<HTMLFormElement>(null),queued=useRef(false);
 const [confirming,setConfirming]=useState<'leave'|'snippet'|'template'|null>(null),[manageOpen,setManageOpen]=useState(false),[announce,setAnnounce]=useState(''),[queuedNotice,setQueuedNotice]=useState(false);
 useEffect(()=>{if(!announce)return;const timer=setTimeout(()=>setAnnounce(''),4000);return()=>clearTimeout(timer);},[announce]);
 const [uncertain,setUncertain]=useState(()=>Boolean(restorable?.uncertain));
 useEffect(()=>{active.current=true;return()=>{active.current=false;}},[]);
 useEffect(()=>{if(!autoFocusContent)return;if(restorable)restoreRef.current?.focus();else contentRef.current?.focus();},[autoFocusContent,restorable]);
 const blocker=useBlocker(()=>dirtyRef.current&&session.authenticated!==false);
 useEffect(()=>{if(blocker.state==='blocked')setConfirming('leave');},[blocker.state]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 const suggested=useMemo(()=>generateTemplateDraft({templateKind:form.kind,date:form.date,locale,templateData:form.data}),[form.kind,form.date,locale,form.data]);
 useEffect(()=>{if(skipSuggested.current){skipSuggested.current=false;return;}setForm(current=>({...current,title:current.titleTouched?current.title:current.kind==='blank'?'':suggested.title,content:current.contentTouched?current.content:suggested.content,applied:current.contentTouched?current.applied:suggested.content}));},[suggested]);
 useEffect(()=>{const nextKey=buildCapturePath('quick',captureContext,incomingDate,share);if(nextKey===incomingKey.current)return;if(dirtyRef.current)return;incomingKey.current=nextKey;const next=normalizeCaptureContext(captureContext);captureRef.current=next;if(restorable)return;modeTouched.current=false;setUncertain(false);setForm(empty(incomingDate,next?.symbol,next??undefined,seed));setLookupAttempt(value=>value+1);},[incomingDate,captureContext,restorable]);
 useEffect(()=>{const revision=++lookupRevision.current;let valid=true;const previous=destinationRef.current;setChecking(true);setLookupError(false);setDestination(null);destinationRef.current=null;api.GET('/api/diaries/by-date',{params:{query:{date:form.date}}}).then(result=>{if(!valid||revision!==lookupRevision.current)return;if(result.response.ok){const parsed=diaryResponseSchema.safeParse(result.data);const next=parsed.success?parsed.data:null;destinationRef.current=next;setDestination(next);if(!modeTouched.current)setForm(current=>({...current,mode:next?'append':'create',...(next?{title:next.title,titleTouched:false}:previous?{title:'',titleTouched:false}:{})}));}else setLookupError(true);}).catch(()=>{if(valid&&revision===lookupRevision.current)setLookupError(true);}).finally(()=>{if(valid&&revision===lookupRevision.current)setChecking(false);});return()=>{valid=false;};},[form.date,lookupAttempt]);
 useEffect(()=>{if(!key||session.authenticated!==true||!active.current||wasExplicitSignOut()||skipSave.current||restorable||(!form.content&&!form.title&&!form.tags&&form.kind==='blank'))return;const value=draftValueForStorage(form,uncertain);try{localStorage.setItem(key,JSON.stringify({at:Date.now(),value}));setSavedDraft(true);setDraftError(false);}catch{setDraftError(true);}},[form,key,restorable,session.authenticated,uncertain]);
 function change(patch:Partial<Draft>){dirtyRef.current=true;onTyped();setForm(current=>({...current,...patch}));}
 const dateTouched=useRef(false),reconciled=useRef(false);
 useEffect(()=>{if(carried.current){dirtyRef.current=true;onTyped();}},[onTyped]);
 useEffect(()=>{
  if(session.authenticated===false||wasExplicitSignOut()){preAccountDraft=null;return;}
  if(accountId){preAccountDraft=null;return;}
  if(dirtyRef.current)preAccountDraft={at:Date.now(),value:form};
 },[form,accountId,session.authenticated]);
 useEffect(()=>{
  if(!accountId||reconciled.current)return;
  reconciled.current=true;
  const stored=readDraft(`diary-quick-draft:${accountId}`);
  if(stored&&!dirtyRef.current)setRestorable(stored);
  try{const value=JSON.parse(localStorage.getItem(`diary-quick-snippets:${accountId}`)??'[]');if(Array.isArray(value))setSnippets(value.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&typeof item.content==='string'));}catch{/* Snippets are optional local content. */}
 },[accountId]);
 // The account timezone is authoritative for today's date, but never overrides a
 // date the author chose or one carried in from a capture link.
 useEffect(()=>{if(!accountDate||initialDate||dateTouched.current)return;setForm(current=>current.date===accountDate?current:{...current,date:accountDate});},[accountDate,initialDate]);
 function saveSnippets(value:Snippet[]){setSnippets(value);if(!snippetKey)return;try{localStorage.setItem(snippetKey,JSON.stringify(value));setDraftError(false);}catch{setDraftError(true);}}
 function persistUncertainMarker(valueForm=form){if(!key||!active.current||session.authenticated===false||wasExplicitSignOut())return false;const value=draftValueForStorage(valueForm,true);try{localStorage.setItem(key,JSON.stringify({at:Date.now(),value}));setUncertain(true);setSavedDraft(true);setDraftError(false);return true;}catch{setUncertain(false);setDraftError(true);return false;}}
 function clearUncertainMarker(valueForm=form){if(!key||!active.current||session.authenticated===false||wasExplicitSignOut())return false;const value=draftValueForStorage(valueForm,false);try{localStorage.setItem(key,JSON.stringify({at:Date.now(),value}));setUncertain(false);setDraftError(false);return true;}catch{setUncertain(true);setDraftError(true);return false;}}
 function markUncertain(valueForm=form){if(!persistUncertainMarker(valueForm)){setError({message:c.storageUnavailable,code:'SYS_INTERNAL_ERROR',fields:[]});return;}setError({message:uncertainCopy,code:'DIARY_WRITE_UNCERTAIN',fields:[]});}
 function insertSnippet(replace:boolean){const item=[...quickSnippets,...snippets].find(item=>item.id===snippet);if(!item)return;change({content:replace||!form.content?item.content:[form.content,item.content].join('\n\n'),contentTouched:true});}
 function insert(replace:boolean){if(replace&&form.content){setConfirming('snippet');return;}insertSnippet(replace);}
 const uncertainCopy=locale==='en'?'The append result could not be confirmed. Your writing is locked until you inspect the existing diary or discard this draft.':locale==='zh-CN'?'追加结果无法确认。你的内容仍保存在此设备上；请先检查现有日记或丢弃这份草稿。':'追加結果無法確認。你的內容仍保存在此裝置上；請先檢查現有日記或捨棄這份草稿。';
 function liveWrite(revision:number){return active.current&&sessionRef.current.authenticated===true&&sessionRef.current.revision===revision&&!wasExplicitSignOut();}
 async function save(event:FormEvent){event.preventDefault();if(pending||uncertain)return;const writeRevision=session.revision;const companies=parseCompanyContext(form.stockSymbols);if(!companies.success){setError({message:companyContextCopy[locale].invalid,fields:['stockSymbols']});return;}const append=form.mode==='append',target=destination?.date===form.date?destination:null,tags=splitTags(form.tags);const protectedForm=append&&target?{...form,title:target.title,titleTouched:false}:form;if(checking){queued.current=true;setQueuedNotice(true);setError(null);return;}if(destination&&destination.date!==form.date){setError({message:uncertainCopy,code:'DIARY_WRITE_UNCERTAIN',fields:[]});return;}if(!liveWrite(writeRevision)){setError({message:uncertainCopy,code:'DIARY_WRITE_UNCERTAIN',fields:[]});return;}if(append&&target&&form.title!==target.title)setForm(current=>({...current,title:target.title,titleTouched:false}));if(append&&!persistUncertainMarker(protectedForm)){setError({message:c.storageUnavailable,code:'SYS_INTERNAL_ERROR',fields:[]});return;}setPending(true);setError(null);try{const result=await api.POST('/api/diaries',{headers:append?{[NO_AUTOMATIC_SESSION_RETRY_HEADER]:'1'}:undefined,body:{title:append&&target?target.title:form.title.trim()||deriveQuickTitle(form.content,suggested.title),content:form.content.trim(),date:form.date,tags,stockSymbols:companies.data??[],appendToToday:append}});if(!liveWrite(writeRevision))return;if(result.response.ok&&result.data&&typeof result.data.id==='string'){skipSave.current=true;dirtyRef.current=false;modeTouched.current=false;if(liveWrite(writeRevision))rememberTags(tags);try{localStorage.removeItem(key);localStorage.removeItem(`diary-quick-reminder:${accountId}`);}catch{/* In-memory draft cleared on success. */}window.dispatchEvent(new Event('diary-quick-saved'));setForm(empty(incomingDate));setSavedDraft(false);setLookupAttempt(value=>value+1);if(onSaved)onSaved(result.data.id,captureRef.current);else navigate(`/diaries/${result.data.id}`,{state:{saved:true,captureContext:captureRef.current}});}else{const failure=apiFailure(result.error,t('failed'));if(append&&isDefiniteAppendRejection(result.response.status,failure.code)){if(!clearUncertainMarker(protectedForm))setError({message:uncertainCopy,code:'DIARY_WRITE_UNCERTAIN',fields:[]});else setError(failure);}else if(append)markUncertain(protectedForm);else setError(failure);}}catch{if(liveWrite(writeRevision)){if(append)markUncertain(protectedForm);else setError(apiFailure(null,t('connection')));}}finally{if(active.current)setPending(false);}}
 function restore(){if(!restorable)return;modeTouched.current=true;dirtyRef.current=true;skipSuggested.current=true;captureRef.current=normalizeCaptureContext(restorable.captureContext);setUncertain(Boolean(restorable.uncertain));const next={...restorable,titleTouched:restorable.titleTouched||Boolean(restorable.title),contentTouched:restorable.contentTouched||Boolean(restorable.content)};setForm(next);if(restorable.uncertain)setError({message:uncertainCopy,code:'DIARY_WRITE_UNCERTAIN',fields:[]});setRestorable(null);}
 function discard(){modeTouched.current=false;dirtyRef.current=false;skipSuggested.current=false;captureRef.current=captureContext??null;setUncertain(false);setError(null);setRestorable(null);setForm(empty(incomingDate,captureRef.current?.symbol,captureRef.current??undefined,seed));setLookupAttempt(value=>value+1);if(!key)return;try{localStorage.removeItem(key);}catch{setDraftError(true);}}
 const selectedTags=splitTags(form.tags);
 const toggleTag=(tag:string)=>change({tags:(selectedTags.includes(tag)?selectedTags.filter(value=>value!==tag):[...selectedTags,tag]).join('\n')});
 const currentDestination=destination?.date===form.date?destination:null;
 // Create on an occupied date can only return 409; prevent it in the control.
 useEffect(()=>{if(currentDestination&&form.mode==='create')setForm(current=>current.mode==='create'?{...current,mode:'append'}:current);},[currentDestination,form.mode]);
 // The lookup lock stays — create/append depends on its result — but a submit
 // arriving during it is queued instead of swallowed, and the reason is stated.
 const submitDisabled=pending||lookupError||uncertain||!form.content.trim()||(form.mode==='append'&&!accountId);
 useEffect(()=>{if(checking||!queued.current)return;queued.current=false;setQueuedNotice(false);if(!submitDisabled)formRef.current?.requestSubmit();},[checking,submitDisabled]);
 return <div className="quick-composer">
  <CaptureNotice context={captureContext} issue={captureIssue}/>
  {restorable&&<div role="status" className="quick-restore"><button ref={restoreRef} type="button" onClick={restore}>{c.restore}</button><button type="button" className="secondary" onClick={discard}>{c.discard}</button></div>}
  <form ref={formRef} onSubmit={save} aria-busy={pending}><fieldset disabled={pending||uncertain}>
   <div className="authoring-grid">
    <section className="quick-writing authoring-writing" aria-labelledby="quick-writing-title">
     <h2 id="quick-writing-title">{t('content')}</h2>
     {/* The control that rewrites the writing sits above the writing it rewrites. */}
     <div className="authoring-field quick-template"><label htmlFor="quick-template">{c.kind}</label><select id="quick-template" value={form.kind} onChange={event=>{const kind=event.target.value as QuickNoteTemplateKind;if(!form.contentTouched)setAnnounce(c.templateApplied);change({kind});}}>{(['blank','trading','reflection','observation'] as const).map(kind=><option key={kind} value={kind}>{c[kind]}</option>)}</select></div>
     <WritingToolbar preview={preview} onTogglePreview={()=>setPreview(!preview)} status={<p className={draftError?'authoring-status is-error':'authoring-status'} role="status">{draftError?c.draftError:announce||(savedDraft?c.draft:'')}</p>}>
      <VoiceCapture compact append={text=>{dirtyRef.current=true;setForm(current=>({...current,content:[current.content,text].filter(Boolean).join(' ').trim(),contentTouched:true}))}}/>
     </WritingToolbar>
     {preview?<section className="authoring-preview" tabIndex={-1} aria-label={a.previewRegion}><Markdown>{form.content}</Markdown></section>:<textarea id="quick-content" aria-labelledby="quick-writing-title" ref={contentRef} rows={8} required value={form.content} onChange={event=>change({content:event.target.value,contentTouched:true})} onKeyDown={event=>{/* Ctrl/Cmd+Enter only: plain Enter keeps inserting a newline and an IME Enter stays with the candidate. requestSubmit keeps save() and every submit-disabled condition authoritative. */if(event.defaultPrevented||event.nativeEvent.isComposing||event.altKey||event.shiftKey||event.key!=='Enter'||!(event.metaKey||event.ctrlKey))return;event.preventDefault();if(submitDisabled)return;event.currentTarget.form?.requestSubmit();}} aria-invalid={invalidField(error,'content')} aria-describedby={error?'quick-error quick-submit-shortcut':'quick-submit-shortcut'}/>}
    </section>
    {form.kind!=='blank'&&<section className="authoring-fields" aria-label={c[form.kind]}>
     <QuickFields kind={form.kind} data={form.data} change={patch=>change({data:{...form.data,...patch}})}/>
     {form.contentTouched&&form.applied!==suggested.content&&<div className="actions"><button type="button" className="secondary button-compact" onClick={()=>{change({content:mergeQuickTemplate(form.content,suggested.content,form.applied),applied:suggested.content});setAnnounce(c.templateApplied);}}>{c.apply}</button><button type="button" className="secondary button-compact" onClick={()=>setConfirming('template')}>{c.regenerate}</button></div>}
    </section>}
    <div className="authoring-aside">
     {/* Destination is correct by default on nearly every capture, so it reads as
         one line and expands; the occupied-date note stays visible either way. */}
     <details className="quick-destination"><summary><Icon name="chevronDown" size={16}/><span className="authoring-summary-row"><span>{c.destination}</span><span className="quick-destination-value"><time dateTime={form.date}>{form.date}</time> · {form.mode==='append'?c.append:c.create}</span></span></summary>
      <div className="quick-meta">
       <div className="authoring-field"><label htmlFor="quick-date">{t('date')}</label><input id="quick-date" required type="date" value={form.date} onChange={event=>{modeTouched.current=false;dateTouched.current=true;setChecking(true);setLookupError(false);setDestination(null);destinationRef.current=null;change({date:event.target.value});}} aria-invalid={invalidField(error,'date')} aria-describedby={error?'quick-error':undefined}/></div>
       <div className="authoring-field"><label htmlFor="quick-mode">{c.mode}</label><select id="quick-mode" value={form.mode} onChange={event=>{modeTouched.current=true;change({mode:event.target.value as Draft['mode']});}}><option value="create" disabled={Boolean(currentDestination)}>{c.create}</option><option value="append">{c.append}</option></select></div>
      </div>
      {currentDestination&&<p className="muted">{c.createBlocked}</p>}
     </details>
     {currentDestination&&<p className="muted quick-existing" data-testid="quick-existing-destination">{c.exists} <span>{c.titleLocked}</span>{' '}<strong data-testid="quick-existing-title">{currentDestination.title}</strong> · <time dateTime={currentDestination.date}>{currentDestination.date}</time></p>}
     <details className="quick-options"><summary><Icon name="chevronDown" size={16}/><span className="authoring-summary-row">{c.options}</span></summary>
      <CompanyContextInput value={form.stockSymbols} onChange={stockSymbols=>change({stockSymbols})} invalid={invalidField(error,'stockSymbols')} errorId="quick-error"/>
      {!(currentDestination&&form.mode==='append')&&<div className="authoring-field"><label htmlFor="quick-title">{t('diaryTitle')}</label><input id="quick-title" maxLength={500} value={form.title} onChange={event=>change({title:event.target.value,titleTouched:true})}/></div>}
      <TagField id="quick-tags" value={form.tags} onChange={tags=>change({tags})} recent={recentTags} selected={selectedTags} onToggle={toggleTag}/>
     </details>
     <details className="quick-snippets"><summary><Icon name="chevronDown" size={16}/><span className="authoring-summary-row">{c.snippets}</span></summary>
      <div className="authoring-field"><label htmlFor="quick-snippet">{c.snippets}</label><select id="quick-snippet" value={snippet} onChange={event=>setSnippet(event.target.value)}>{[...quickSnippets,...snippets].map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
      <div className="actions"><button type="button" className="secondary button-compact" onClick={()=>insert(false)}>{c.insert}</button><button type="button" className="secondary button-compact" onClick={()=>insert(true)}>{c.replace}</button><button type="button" className="quiet-button button-compact" onClick={()=>setManageOpen(true)}>{c.manage}</button></div>
     </details>
    </div>
    <div className="authoring-footer">
     <FailureNotice focusField failure={error} id="quick-error"/>
     {!uncertain&&lookupError&&<div role="alert"><p>{t('connection')}</p><button type="button" className="secondary" onClick={()=>setLookupAttempt(value=>value+1)}>{t('retry')}</button></div>}
     <div className="quick-submit"><button type="submit" disabled={submitDisabled}>{pending?t('pending'):form.mode==='append'?c.append:c.create}</button><span className="quick-submit-shortcut" id="quick-submit-shortcut">{c.submitShortcut} <kbd>⌘ / Ctrl Enter</kbd></span>{checking&&<span className="quick-submit-note" role="status">{queuedNotice?c.queuedSave:c.checking}</span>}</div>
    </div>
   </div>
  </fieldset>
  {uncertain&&!restorable&&<div className="quick-recovery" role="alert"><p>{uncertainCopy}</p>{currentDestination?<Link className="button secondary" to={`/diaries/${currentDestination.id}`} onClick={onNavigate}>{c.inspect}</Link>:null}<button type="button" className="secondary" onClick={()=>setLookupAttempt(value=>value+1)}>{c.retryReadback}</button><button type="button" className="secondary" onClick={discard}>{c.discard}</button></div>}
  </form>
  {accountId&&<CaptureReminder accountId={accountId}/>}
  <ConfirmDialog open={confirming==='leave'} title={c.discardTitle} body={c.discardBody} confirmLabel={c.discardConfirm} danger onConfirm={()=>{setConfirming(null);dirtyRef.current=false;blocker.proceed?.();}} onCancel={()=>{setConfirming(null);if(blocker.state==='blocked')blocker.reset();}}/>
  <ConfirmDialog open={confirming==='snippet'} title={c.replaceTitle} body={c.replaceBody} confirmLabel={c.replaceConfirm} onConfirm={()=>{setConfirming(null);insertSnippet(true);}} onCancel={()=>setConfirming(null)}/>
  <ConfirmDialog open={confirming==='template'} title={c.replaceTitle} body={c.replaceBody} confirmLabel={c.replaceConfirm} onConfirm={()=>{setConfirming(null);change({content:suggested.content,applied:suggested.content});setAnnounce(c.templateApplied);}} onCancel={()=>setConfirming(null)}/>
  <SnippetManager open={manageOpen} snippets={snippets} onSave={saveSnippets} onClose={()=>setManageOpen(false)}/>
 </div>;
}
