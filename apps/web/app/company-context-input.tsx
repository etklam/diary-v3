import { useEffect, useId, useState } from 'react';
import { createDiaryRequestSchema, MAX_DIARY_STOCK_SYMBOLS } from '@diary/contracts';
import { api, useUi } from './ui';
import { getSessionRevision, useSessionState } from './session';
export const companyContextCopy={en:{label:'Company context',hint:'Link up to 10 company symbols, separated by commas. These are diary associations, not executed trades.',invalid:'Enter up to 10 unique company symbols, separated by commas. Use letters, numbers, spaces, dots or hyphens; each symbol has a 20-character limit.',suggestions:'Symbols from your own holdings and watchlist are suggested as you type. Any other symbol can still be typed in full.'},'zh-TW':{label:'關聯公司',hint:'最多關聯 10 個公司代號，以逗號分隔。這些是日記關聯，並非已成交交易。',invalid:'請以逗號分隔最多 10 個不同公司代號。可用英文字母、數字、空格、句點或連字號，每個代號最多 20 字元。',suggestions:'輸入時會建議你自己的持倉與觀察清單代號，其他代號仍可自行輸入。'},'zh-CN':{label:'关联公司',hint:'最多关联 10 个公司代码，以逗号分隔。这些是日记关联，并非已成交交易。',invalid:'请以逗号分隔最多 10 个不同公司代码。可用英文字母、数字、空格、句点或连字符，每个代码最多 20 字符。',suggestions:'输入时会建议你自己的持仓与观察清单代码，其他代码仍可自行输入。'}};
export function parseCompanyContext(value:string){return createDiaryRequestSchema.shape.stockSymbols.safeParse(value.split(',').map(symbol=>symbol.trim()).filter(Boolean));}
// The browser filters the whole option list locally, so this bound is only there
// to keep the DOM small for an unusually large book. It is not a product limit.
const SUGGESTION_LIMIT=120;
function symbolList(value:string){return value.split(',').map(symbol=>symbol.trim().toUpperCase()).filter(Boolean);}
/**
 * Reads the account's own holdings and watchlist symbols once, after the author
 * first focuses the field, so a collapsed composer costs nothing. Both reads are
 * owner-scoped on the server, and the session revision they started under is
 * stored with them, so a sign-out or an account switch drops the result instead
 * of offering the previous account's symbols. Every failure is swallowed on
 * purpose: suggestions are a convenience and must never block writing or raise
 * an error in the capture path.
 */
function useAccountSymbols(requested:boolean){
 const session=useSessionState();const [loaded,setLoaded]=useState<{revision:number;symbols:string[]}|null>(null);
 useEffect(()=>{
  if(!requested||session.authenticated!==true)return;
  const controller=new AbortController(),revision=session.revision;
  void (async()=>{try{
   const [holdings,watchlist]=await Promise.all([api.GET('/api/stocks/holdings',{signal:controller.signal}).catch(()=>null),api.GET('/api/stocks/watchlist',{signal:controller.signal}).catch(()=>null)]);
   if(controller.signal.aborted||revision!==getSessionRevision())return;
   const rows=holdings?.response.ok?holdings.data:undefined,items=watchlist?.response.ok?watchlist.data?.items:undefined;
   const held=Array.isArray(rows)?rows.map(row=>row.symbol):[],watched=Array.isArray(items)?items.map(item=>item.stock.symbol):[];
   setLoaded({revision,symbols:[...new Set([...held,...watched].map(symbol=>String(symbol).trim().toUpperCase()).filter(Boolean))].sort().slice(0,SUGGESTION_LIMIT)});
  }catch{/* A slow, failed or malformed suggestion read leaves an ordinary text field. */}})();
  return ()=>controller.abort();
 },[requested,session.authenticated,session.revision]);
 return session.authenticated===true&&loaded?.revision===session.revision?loaded.symbols:[];
}
export function CompanyContextInput({value,onChange,invalid,errorId='form-error'}:{value:string;onChange:(value:string)=>void;invalid?:boolean;errorId?:string}){const {locale}=useUi();const id=useId();const l=companyContextCopy[locale];const [requested,setRequested]=useState(false);const symbols=useAccountSymbols(requested);
 // A native datalist matches against the whole field value, so each option carries
 // the symbols already typed. The head keeps the author's own spacing so their
 // partial text still matches, and the existing blur/submit normalization turns a
 // selected option into exactly the value typing it by hand would produce.
 const head=value.slice(0,value.lastIndexOf(',')+1),entered=[...new Set(symbolList(head))];
 const options=entered.length>=MAX_DIARY_STOCK_SYMBOLS?[]:symbols.filter(symbol=>!entered.includes(symbol)).map(symbol=>head+symbol);
 return <div className="company-context-input"><label htmlFor={id}>{l.label}</label><input id={id} type="text" value={value} autoComplete="off" list={`${id}-symbols`} onFocus={()=>setRequested(true)} onChange={event=>onChange(event.target.value)} onBlur={()=>{const parsed=parseCompanyContext(value);if(parsed.success){const normalized=(parsed.data??[]).join(', ');if(normalized!==value)onChange(normalized);}}} aria-invalid={invalid} aria-describedby={`${id}-hint${invalid?' '+errorId:''}`}/><datalist id={`${id}-symbols`}>{options.map(option=><option key={option} value={option}/>)}</datalist><p className="muted" id={`${id}-hint`}>{l.hint}{symbols.length>0&&` ${l.suggestions}`}</p></div>;}
