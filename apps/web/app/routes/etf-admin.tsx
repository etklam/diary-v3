import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { adminEtfCreateSchema, adminEtfListSchema } from '@diary/contracts/etf';
import type { z } from 'zod';
import { api, useUi } from '../ui';
import { signInPath } from '../session';
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error';
import '../trade-plan.css';
const copy = {
 en: { title:'ETF catalog', intro:'Maintain the shared research catalog and five years of monthly prices.', symbol:'ETF symbol', name:'Name (optional)', skip:'Skip market symbol validation', add:'Add ETF', seed:'Add common ETFs', refresh:'Refresh catalog', initialize:'Initialize monthly history', remove:'Delete ETF', confirm:'Delete this ETF and all its historical prices and user watchlist entries?', empty:'The catalog is empty.', prices:'Monthly prices', watches:'Watchlist entries', added:'Added', skipped:'Skipped', total:'Total', deleted:'Deleted', from:'Date range', invalid:'Check the symbol and name.', back:'Preferences', created:'ETF added.', seedHint:'Adds 24 common ETFs. Existing entries are kept.' },
 'zh-TW': { title:'ETF 目錄', intro:'管理共用研究目錄及五年月線價格。', symbol:'ETF 代號', name:'名稱（選填）', skip:'略過市場代號驗證', add:'新增 ETF', seed:'加入常用 ETF', refresh:'重新整理目錄', initialize:'初始化月線歷史', remove:'刪除 ETF', confirm:'刪除此 ETF、全部歷史價格及使用者 watchlist 項目？', empty:'目錄目前沒有 ETF。', prices:'月線價格', watches:'Watchlist 項目', added:'新增', skipped:'略過', total:'總數', deleted:'已刪除', from:'日期範圍', invalid:'請檢查代號及名稱。', back:'偏好設定', created:'已新增 ETF。', seedHint:'加入 24 項常用 ETF，保留已有項目。' },
 'zh-CN': { title:'ETF 目录', intro:'管理共用研究目录及五年月线价格。', symbol:'ETF 代码', name:'名称（选填）', skip:'跳过市场代码验证', add:'新增 ETF', seed:'加入常用 ETF', refresh:'刷新目录', initialize:'初始化月线历史', remove:'删除 ETF', confirm:'删除此 ETF、全部历史价格及用户 watchlist 项目？', empty:'目录目前没有 ETF。', prices:'月线价格', watches:'Watchlist 项目', added:'新增', skipped:'跳过', total:'总数', deleted:'已删除', from:'日期范围', invalid:'请检查代码及名称。', back:'偏好设置', created:'已新增 ETF。', seedHint:'加入 24 项常用 ETF，保留已有项目。' },
};
export default function EtfAdmin() {
 const { locale, t } = useUi(), c = copy[locale];
 const [rows, setRows] = useState<z.infer<typeof adminEtfListSchema> | null>(null), [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null), [attempt, refresh] = useState(0);
 const [symbol, setSymbol] = useState(''), [name, setName] = useState(''), [skip, setSkip] = useState(false), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
 const request = useRef<AbortController | null>(null), translate = useRef(t); translate.current = t;
 useEffect(() => () => request.current?.abort(), []);
 useEffect(() => {
  const controller = new AbortController(); setError(null);
  api.GET('/api/admin/etf', { signal: controller.signal }).then(result => { if (controller.signal.aborted) return; const parsed = adminEtfListSchema.safeParse(result.data); if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, translate.current('failed'))); else setRows(parsed.data); }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
  return () => controller.abort();
 }, [attempt]);
 async function perform(action: 'create'|'seed'|'initialize'|'delete', id = '', itemSymbol = '') {
  if (request.current) return;
  if (action === 'delete' && !window.confirm(`${c.confirm} (${itemSymbol})`)) return;
  const input = adminEtfCreateSchema.safeParse({ symbol, name, skipValidation: skip });
  if (action === 'create' && !input.success) { setWriteError({ message: c.invalid, fields: input.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []) }); return; }
  const controller = new AbortController(); request.current = controller; setPending(true); setWriteError(null); setNotice('');
  try {
   let response: Response, failure: unknown, message = '';
   if (action === 'create' && input.success) { const result = await api.POST('/api/admin/etf', { body: input.data, signal: controller.signal }); response=result.response; failure=result.error; message=c.created; }
   else if (action === 'seed') { const result=await api.POST('/api/admin/etf/seed', { signal: controller.signal }); response=result.response; failure=result.error; if(result.data) message=`${c.added}: ${result.data.added} · ${c.skipped}: ${result.data.skipped} · ${c.total}: ${result.data.total}`; }
   else if (action === 'initialize') { const result=await api.POST('/api/admin/etf/{id}/initialize', { params:{path:{id}}, signal:controller.signal }); response=result.response; failure=result.error; if(result.data) message=`${result.data.symbol} · ${c.added}: ${result.data.added} / ${result.data.total} · ${c.from}: ${result.data.dateRange.from} – ${result.data.dateRange.to}`; }
   else { const result=await api.DELETE('/api/admin/etf/{id}', { params:{path:{id}}, signal:controller.signal }); response=result.response; failure=result.error; if(result.data) message=`${c.deleted} · ${c.prices}: ${result.data.deletedPrices} · ${c.watches}: ${result.data.deletedWatchlists}`; }
   if(controller.signal.aborted)return;
   if(!response.ok){setWriteError(apiFailure(failure,t('failed')));return;}
   if(action==='create'){setSymbol('');setName('');setSkip(false);}
   setNotice(message);refresh(n=>n+1);
  } catch { if(!controller.signal.aborted)setWriteError(apiFailure(null,t('connection'))); }
  finally { if(!controller.signal.aborted){request.current=null;setPending(false);} }
 }
 return <section className="plan-page"><header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link to="/settings">{c.back}</Link></header>
 {error?<><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_')&&error.code!=='AUTH_FORBIDDEN'&&<Link to={signInPath('/admin/etf')}>{t('login')}</Link>}<button onClick={()=>refresh(n=>n+1)}>{t('retry')}</button></>:rows===null?<p role="status">{t('loading')}</p>:<>
 <form className="plan-form" onSubmit={event=>{event.preventDefault();void perform('create');}}><fieldset disabled={pending}><div className="plan-grid"><label>{c.symbol}<input id="etf-admin-symbol" required maxLength={20} value={symbol} onChange={event=>setSymbol(event.target.value)} aria-invalid={invalidField(writeError,'symbol')} aria-describedby={writeError?'etf-admin-error':undefined}/></label><label>{c.name}<input id="etf-admin-name" maxLength={255} value={name} onChange={event=>setName(event.target.value)} aria-invalid={invalidField(writeError,'name')} aria-describedby={writeError?'etf-admin-error':undefined}/></label></div><label style={{display:'flex',gap:12,alignItems:'center',minHeight:44,margin:'20px 0'}}><input type="checkbox" checked={skip} onChange={event=>setSkip(event.target.checked)} style={{width:20,height:20,flexShrink:0}}/>{c.skip}</label><button>{pending?t('pending'):c.add}</button></fieldset></form>
 <p>{c.seedHint}</p><div className="actions"><button className="secondary" disabled={pending} onClick={()=>void perform('seed')}>{c.seed}</button><button className="secondary" disabled={pending} onClick={()=>refresh(n=>n+1)}>{c.refresh}</button></div><FailureNotice failure={writeError} id="etf-admin-error"/>{notice&&<p role="status">{notice}</p>}
 {!rows.length?<p>{c.empty}</p>:<ul className="plan-list">{rows.map(row=><li key={row.id} data-testid="etf-catalog-item" aria-label={`${row.symbol}${row.name?` · ${row.name}`:''} ${c.initialize} ${c.remove}`}><h2 id={`etf-catalog-${row.id}`}>{row.symbol}{row.name?` · ${row.name}`:''}</h2><p>{c.prices}: {row.priceCount} · {c.watches}: {row.watchlistCount}</p><div className="actions"><button className="secondary" disabled={pending} aria-describedby={`etf-catalog-${row.id}`} onClick={()=>void perform('initialize',row.id)}>{c.initialize}</button><button className="secondary" disabled={pending} aria-describedby={`etf-catalog-${row.id}`} onClick={()=>void perform('delete',row.id,row.symbol)}>{c.remove}</button></div></li>)}</ul>}
 </>}</section>;
}
