import { useCallback,useEffect,useRef,useState } from 'react';
import { useNavigationType } from 'react-router';
import { diaryListQuerySchema } from '@diary/contracts/diary-list';
import { diarySummaryListResponseSchema,type DiarySummary } from '@diary/contracts/diary-summary';
import { mergeTimelineEntries } from '@diary/domain';
import { api,useUi } from './ui';
import { apiFailure,type Failure } from './api-error';
type Entry={id:string;date:string;title:string;excerpt:string;tags:string[];stockSymbols:string[];transactionCount:number;alertCount:number;reviewed:boolean;reviewOutcome:DiarySummary['reviewOutcome']};
/** Compact projection of the bounded summary feed; display bounds stay identical
 * to the former full-graph projection in @diary/domain. */
function projectSummary(summary:DiarySummary):Entry{return {id:summary.id,date:summary.date,title:summary.title,excerpt:summary.excerpt,tags:summary.tags.slice(0,2),stockSymbols:summary.stockSymbols.slice(0,3),transactionCount:summary.transactionCount,alertCount:summary.alertCount,reviewed:summary.reviewStatus==='reviewed',reviewOutcome:summary.reviewOutcome};}
type State={entries:Entry[];page:number;totalPages:number;loading:boolean;loadingMore:boolean;error:Failure|null};
const initial:State={entries:[],page:0,totalPages:0,loading:true,loadingMore:false,error:null};
/** Session-scoped restoration hints: per query string, how many pages were loaded
 * and how far the reader had scrolled. Entries always come from fresh fetches. */
const CONTEXT_KEY='diary-v3:timeline-context',MAX_CONTEXT_KEYS=3;
/** Back/forward restoration refetches at most this many pages (20 entries each). */
const MAX_RESTORE_PAGES=10;
type Context={pages:number;scrollY:number;savedAt:number};
type Contexts=Record<string,Context>;
/** Most recently used timeline query, so the partner mode can link back to the reader's filters. */
export function lastTimelineSearch():string{try{const raw=sessionStorage.getItem(CONTEXT_KEY);if(!raw)return '';const contexts=JSON.parse(raw) as Contexts;return Object.keys(contexts).sort((a,b)=>(contexts[b]?.savedAt??0)-(contexts[a]?.savedAt??0))[0]??'';}catch{return '';}}
function readContexts():Contexts{try{const raw=sessionStorage.getItem(CONTEXT_KEY);return raw?JSON.parse(raw) as Contexts:{};}catch{return {};}}
function writeContexts(contexts:Contexts){try{sessionStorage.setItem(CONTEXT_KEY,JSON.stringify(contexts));}catch{/* Reading stays fully usable when session storage is unavailable. */}}
function saveContext(queryString:string,patch:Partial<Omit<Context,'savedAt'>>){const contexts=readContexts();contexts[queryString]={...(contexts[queryString]??{pages:1,scrollY:0,savedAt:0}),...patch,savedAt:Date.now()};writeContexts(Object.fromEntries(Object.entries(contexts).sort(([,a],[,b])=>a.savedAt-b.savedAt).slice(-MAX_CONTEXT_KEYS)));}
function restorationContext(queryString:string):Context|null{const found=readContexts()[queryString];return found&&Number.isFinite(found.pages)&&found.pages>1&&Number.isFinite(found.scrollY)?found:null;}
export function useTimeline(queryString:string){const {t}=useUi(),message=useRef(t);message.current=t;const [state,setState]=useState<State>(initial),generation=useRef(0),flight=useRef<AbortController|null>(null),busy=useRef(false),navigation=useRef<ReturnType<typeof useNavigationType>|null>(null);navigation.current=useNavigationType();
 const fetchPage=useCallback(async(page:number,epoch:number):Promise<number|null>=>{const append=page>1;busy.current=true;const controller=new AbortController();flight.current=controller;setState(current=>({...current,loading:!append,loadingMore:append,error:null}));const parsed=diaryListQuerySchema.safeParse({...Object.fromEntries(new URLSearchParams(queryString)),page,limit:20,sortBy:'date-desc'});if(!parsed.success){setState(current=>({...current,loading:false,loadingMore:false,error:{message:message.current('failed'),code:'SYS_VALIDATION_ERROR',fields:parsed.error.issues.map(issue=>issue.path.join('.'))}}));busy.current=false;return null;}
 try{const result=await api.GET('/api/diaries/summary',{params:{query:parsed.data},signal:controller.signal});if(epoch!==generation.current)return null;if(result.response.ok&&result.data){const response=diarySummaryListResponseSchema.parse(result.data);setState(current=>({...current,entries:mergeTimelineEntries(append?current.entries:[],response.data.map(projectSummary)),page,totalPages:response.pagination.totalPages,error:null}));saveContext(queryString,{pages:page});return response.pagination.totalPages;}else{setState(current=>({...current,error:apiFailure(result.response.status===401?{data:{code:'AUTH_UNAUTHORIZED'}}:result.error,message.current('failed'))}));return null;}}catch(error){if(epoch===generation.current&&!controller.signal.aborted)setState(current=>({...current,error:apiFailure(error,message.current('connection'))}));return null;}finally{if(epoch===generation.current){busy.current=false;setState(current=>({...current,loading:false,loadingMore:false}));}}},[queryString]);
 useEffect(()=>{let frame=0;
  // A navigation to a shorter page clamps the window scroll to 0 and fires a
  // trailing scroll event while this listener is still attached; recording that
  // 0 would erase the reader's real anchor. Skip once the timeline is gone.
  const record=()=>{frame=0;if(!document.querySelector('.diary-timeline')?.isConnected)return;saveContext(queryString,{scrollY:window.scrollY});};
  function onScroll(){if(!frame)frame=requestAnimationFrame(record);}
  window.addEventListener('scroll',onScroll,{passive:true});
  return()=>{window.removeEventListener('scroll',onScroll);if(frame){cancelAnimationFrame(frame);record();}};},[queryString]);
 useEffect(()=>{
  let anchor:ReturnType<typeof setInterval>|null=null;
  async function bootstrap(){const epoch=++generation.current;flight.current?.abort();
   const stored=navigation.current==='POP'?restorationContext(queryString):null;
   if(!stored){setState(initial);await fetchPage(1,epoch);return;}
   // History Back/Forward: refetch each previously loaded page fresh, then scroll.
   const first=await fetchPage(1,epoch);if(first===null||epoch!==generation.current)return;
   for(let page=2,last=Math.min(stored.pages,first,MAX_RESTORE_PAGES);page<=last;page++){if(epoch!==generation.current)return;await fetchPage(page,epoch);}
   if(epoch!==generation.current)return;
   // Anchor restoration: rendering pages and router-level scroll restoration can
   // clamp the window back to 0 for a while on a busy main thread, so re-assert
   // the anchor on a short interval until it holds. The loop is bounded and the
   // window is far below any deliberate reader scroll.
   let confirmations=0,attempts=0;anchor=setInterval(()=>{
    window.scrollTo({top:stored.scrollY,behavior:'instant'});
    confirmations=window.scrollY===stored.scrollY?confirmations+1:0;
    if(confirmations>=3||++attempts>=15){clearInterval(anchor!);anchor=null;}
   },200);
  }
  function refresh(){const epoch=++generation.current;flight.current?.abort();setState(initial);void fetchPage(1,epoch);}
  void bootstrap();window.addEventListener('diary-quick-saved',refresh);return()=>{generation.current++;flight.current?.abort();if(anchor)clearInterval(anchor);window.removeEventListener('diary-quick-saved',refresh);};},[fetchPage]);
 function loadMore(){if(busy.current||state.page>=state.totalPages)return;void fetchPage(state.page+1,generation.current);}
 function retry(){if(busy.current)return;void fetchPage(state.page===0?1:state.page+1,generation.current);}
 return {...state,hasMore:state.page<state.totalPages,loadMore,retry};
}
