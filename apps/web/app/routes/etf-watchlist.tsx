import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { z } from 'zod';
import { etfWatchlistListSchema, etfWatchlistCreateSchema } from '@diary/contracts/etf';
import { api, useUi } from '../ui';
import { signInPath } from '../session';
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error';
import '../trade-plan.css';
const copy={
 en:{title:'ETF watchlist',intro:'Follow ETFs from the shared catalog. Monthly closing prices are separate from live research quotes.',symbol:'ETF symbol',add:'Add ETF',remove:'Remove',read:'Read research',empty:'No ETFs followed yet.',price:'Latest monthly close',unknown:'Unavailable',refresh:'Refresh watchlist',invalid:'Enter an ETF symbol of 1–20 characters.',uncertain:'Unable to confirm the change. Refresh the watchlist before trying again.',research:'ETF research'},
 'zh-TW':{title:'ETF 關注清單',intro:'從共用目錄關注 ETF。月線收市價與即時研究報價分開顯示。',symbol:'ETF 代號',add:'加入 ETF',remove:'移除',read:'閱讀研究',empty:'尚未關注 ETF。',price:'最新月線收市價',unknown:'無資料',refresh:'重新整理清單',invalid:'請輸入 1–20 字元的 ETF 代號。',uncertain:'未能確認變更結果。請先重新整理清單再重試。',research:'ETF 研究'},
 'zh-CN':{title:'ETF 关注清单',intro:'从共用目录关注 ETF。月线收盘价与即时研究报价分开显示。',symbol:'ETF 代码',add:'加入 ETF',remove:'移除',read:'阅读研究',empty:'尚未关注 ETF。',price:'最新月线收盘价',unknown:'无数据',refresh:'刷新清单',invalid:'请输入 1–20 字符的 ETF 代码。',uncertain:'未能确认变更结果。请先刷新清单再重试。',research:'ETF 研究'}
};
export default function EtfWatchlist(){
 const {locale,t}=useUi(),c=copy[locale];
 const [items,setItems]=useState<z.infer<typeof etfWatchlistListSchema>|null>(null),[attempt,reload]=useState(0),[error,setError]=useState<Failure|null>(null),[writeError,setWriteError]=useState<Failure|null>(null),[symbol,setSymbol]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const request=useRef<AbortController|null>(null),translate=useRef(t);translate.current=t;
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{const controller=new AbortController();setItems(null);setError(null);
 api.GET('/api/etf/watchlist',{signal:controller.signal}).then(result=>{if(controller.signal.aborted)return;const parsed=etfWatchlistListSchema.safeParse(result.data);if(!result.response.ok||!parsed.success)setError(apiFailure(result.error,translate.current('failed')));else {setItems(parsed.data);setUncertain(false);setWriteError(null);}}).catch(()=>{if(!controller.signal.aborted)setError(apiFailure(null,translate.current('connection')));});return()=>controller.abort();},[attempt]);
 async function change(id?:string){
  if(request.current||uncertain)return;const parsed=etfWatchlistCreateSchema.safeParse({symbol});if(!id&&!parsed.success){setWriteError({message:c.invalid,fields:['symbol']});return;}
  const controller=new AbortController();request.current=controller;setBusy(true);setWriteError(null);
  try {const result=id?await api.DELETE('/api/etf/watchlist/{id}',{params:{path:{id}},signal:controller.signal}):await api.POST('/api/etf/watchlist',{body:parsed.success?parsed.data:{symbol},signal:controller.signal});if(controller.signal.aborted)return;
   if(result.response.status>=500){setUncertain(true);setWriteError({message:c.uncertain,fields:[]});return;}
   if(!result.response.ok&&!(id&&result.response.status===404)){setWriteError(apiFailure(result.error,t('failed')));return;}if(!id)setSymbol('');reload(n=>n+1);
  }catch{if(!controller.signal.aborted){setUncertain(true);setWriteError({message:c.uncertain,fields:[]});}}
  finally{if(!controller.signal.aborted){request.current=null;setBusy(false);}}
 }
 const formatDate=(value:string|null)=>value===null?c.unknown:`${new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${value}T00:00:00.000Z`))} UTC`;
 return <section className="plan-page"><header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link to="/tools/etf">{c.research}</Link></header>
 {error?<><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_')&&<Link to={signInPath('/etf/watchlist')}>{t('login')}</Link>}</>:items===null?<p role="status">{t('loading')}</p>:<>
 <form className="plan-filters" onSubmit={event=>{event.preventDefault();void change();}}><label>{c.symbol}<input id="etf-watchlist-symbol" value={symbol} onChange={event=>setSymbol(event.target.value)} maxLength={20} required autoCapitalize="characters" spellCheck={false} aria-invalid={invalidField(writeError,'symbol')} aria-describedby={writeError?'etf-watchlist-error':undefined}/></label><button disabled={busy||uncertain}>{busy?t('pending'):c.add}</button></form><FailureNotice failure={writeError} id="etf-watchlist-error"/>
 {!items.length?<p>{c.empty}</p>:<ul className="plan-list">{items.map(item=><li key={item.id} data-testid="etf-watch-item" aria-label={`${item.symbol}${item.name?` · ${item.name}`:''} ${c.read} ${c.remove}`}><h2 id={`etf-watch-${item.id}`}>{item.symbol}{item.name?` · ${item.name}`:''}</h2><p>{c.price}: {item.latestPrice===null?c.unknown:new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(item.latestPrice)} · {item.latestDate?<time dateTime={`${item.latestDate}T00:00:00.000Z`}>{formatDate(item.latestDate)}</time>:c.unknown}</p><div className="actions"><Link to={`/tools/etf?symbol=${encodeURIComponent(item.symbol)}`} aria-describedby={`etf-watch-${item.id}`}>{c.read}</Link><button className="secondary" disabled={busy||uncertain} aria-describedby={`etf-watch-${item.id}`} onClick={()=>void change(item.id)}>{c.remove}</button></div></li>)}</ul>}
 </>}<button className="secondary" disabled={busy} onClick={()=>reload(n=>n+1)}>{c.refresh}</button></section>;
}
