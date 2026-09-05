import { useCallback,useEffect,useRef,useState } from 'react';
import { diaryListQuerySchema,diaryListResponseSchema } from '@diary/contracts/diary-list';
import { mergeTimelineEntries,projectTimelineEntry } from '@diary/domain';
import { api,useUi } from './ui';
import { apiFailure,type Failure } from './api-error';
type Entry=ReturnType<typeof projectTimelineEntry>;
type State={entries:Entry[];page:number;totalPages:number;loading:boolean;loadingMore:boolean;error:Failure|null};
const initial:State={entries:[],page:0,totalPages:0,loading:true,loadingMore:false,error:null};
export function useTimeline(queryString:string){const {t}=useUi(),message=useRef(t);message.current=t;const [state,setState]=useState<State>(initial),generation=useRef(0),flight=useRef<AbortController|null>(null),busy=useRef(false);
 const fetchPage=useCallback(async(page:number,epoch:number)=>{const append=page>1;busy.current=true;const controller=new AbortController();flight.current=controller;setState(current=>({...current,loading:!append,loadingMore:append,error:null}));const parsed=diaryListQuerySchema.safeParse({...Object.fromEntries(new URLSearchParams(queryString)),page,limit:20,sortBy:'date-desc'});if(!parsed.success){setState(current=>({...current,loading:false,loadingMore:false,error:{message:message.current('failed'),code:'SYS_VALIDATION_ERROR',fields:parsed.error.issues.map(issue=>issue.path.join('.'))}}));busy.current=false;return;}
 try{const result=await api.GET('/api/diaries',{params:{query:parsed.data},signal:controller.signal});if(epoch!==generation.current)return;if(result.response.ok&&result.data){const response=diaryListResponseSchema.parse(result.data);setState(current=>({...current,entries:mergeTimelineEntries(append?current.entries:[],response.data.map(projectTimelineEntry)),page,totalPages:response.pagination.totalPages,error:null}));}else setState(current=>({...current,error:apiFailure(result.response.status===401?{data:{code:'AUTH_UNAUTHORIZED'}}:result.error,message.current('failed'))}));}catch(error){if(epoch===generation.current&&!controller.signal.aborted)setState(current=>({...current,error:apiFailure(error,message.current('connection'))}));}finally{if(epoch===generation.current){busy.current=false;setState(current=>({...current,loading:false,loadingMore:false}));}}},[queryString]);
 useEffect(()=>{function refresh(){const epoch=++generation.current;flight.current?.abort();setState(initial);void fetchPage(1,epoch);}refresh();window.addEventListener('diary-quick-saved',refresh);return()=>{generation.current++;flight.current?.abort();window.removeEventListener('diary-quick-saved',refresh);};},[fetchPage]);
 function loadMore(){if(busy.current||state.page>=state.totalPages)return;void fetchPage(state.page+1,generation.current);}
 function retry(){if(busy.current)return;void fetchPage(state.page===0?1:state.page+1,generation.current);}
 return {...state,hasMore:state.page<state.totalPages,loadMore,retry};
}
