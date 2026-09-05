import { useEffect,useState } from 'react';
import type { z } from 'zod';
import type { recentClosedTradeSchema } from '@diary/contracts/ledger';
import { api,useUi } from './ui';
import { ledgerCopy } from './ledger-copy';
import { apiFailure,FailureNotice,type Failure } from './api-error';
export function RecentRealizedTrades(){const {locale,t}=useUi();const l=ledgerCopy[locale];const [trades,setTrades]=useState<z.infer<typeof recentClosedTradeSchema>[]|null>(null);const [error,setError]=useState<Failure|null>(null);
 async function load(){setTrades(null);setError(null);try{const result=await api.GET('/api/stats/recent-trades',{params:{query:{days:'30',limit:'50'}}});if(result.response.ok&&result.data)setTrades(result.data.trades);else setError(apiFailure(result.error,t('failed')));}catch{setError(apiFailure(null,t('connection')));}}
 useEffect(()=>{void load();},[]);
 return <section className="ledger-reading realized-results"><h2>{l.recent}</h2><p className="muted">{l.recentHint}</p>{error?<><FailureNotice failure={error}/><button className="secondary" onClick={()=>void load()}>{t('retry')}</button></>:trades===null?<p role="status">{t('loading')}</p>:trades.length===0?<p>{l.recentEmpty}</p>:trades.map(trade=><section key={trade.id}><h3>{trade.symbol}</h3><time dateTime={trade.sellDate}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(trade.sellDate))} UTC</time><dl><div><dt>{l.quantity}</dt><dd>{trade.sellQuantity}</dd></div><div><dt>{l.pnl}</dt><dd>{trade.realizedPnL}</dd></div><div><dt>{l.pct}</dt><dd>{trade.realizedPnLPct}%</dd></div></dl></section>)}</section>;
}
