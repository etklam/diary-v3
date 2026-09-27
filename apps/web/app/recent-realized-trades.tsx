import type { PortfolioSource } from './portfolio-source';
import { useEffect,useState } from 'react';
import type { z } from 'zod';
import type { recentClosedTradeSchema } from '@diary/contracts/ledger';
import { api,useUi } from './ui';
import { ledgerCopy } from './ledger-copy';
import { apiFailure,FailureNotice,type Failure } from './api-error';
import { formatMarketValue, formatMarketValueWithSuffix, marketClass } from './market-display';
export function RecentRealizedTrades({source}: {source?: PortfolioSource<z.infer<typeof recentClosedTradeSchema>[]>} = {}){const {locale,t}=useUi();const l=ledgerCopy[locale];const [localTrades,setTrades]=useState<z.infer<typeof recentClosedTradeSchema>[]|null>(null);const [localError,setError]=useState<Failure|null>(null);
 const trades=source?source.data:localTrades,error=source?source.error:localError;
 async function load(){setTrades(null);setError(null);try{const result=await api.GET('/api/stats/recent-trades',{params:{query:{days:'30',limit:'50'}}});if(result.response.ok&&result.data)setTrades(result.data.trades);else setError(apiFailure(result.error,t('failed')));}catch{setError(apiFailure(null,t('connection')));}}
 useEffect(()=>{if(!source)void load();},[]);
 return <section className="ledger-reading realized-results"><h2>{l.recent}</h2><p className="muted">{l.recentHint}</p>{error?<><FailureNotice failure={error}/><button className="secondary" onClick={()=>source?source.retry():void load()}>{t('retry')}</button></>:trades===null?<p role="status">{t('loading')}</p>:trades.length===0?<p>{l.recentEmpty}</p>:trades.map(trade=><section key={trade.id}><h3>{trade.symbol}</h3><time dateTime={trade.sellDate}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(trade.sellDate))} UTC</time><dl><div><dt>{l.quantity}</dt><dd>{trade.sellQuantity}</dd></div><div><dt>{l.pnl}</dt><dd className={marketClass(trade.realizedPnL)}>{formatMarketValue(locale, trade.realizedPnL)}</dd></div><div><dt>{l.pct}</dt><dd className={marketClass(trade.realizedPnLPct)}>{formatMarketValueWithSuffix(locale, trade.realizedPnLPct, '%')}</dd></div></dl></section>)}</section>;
}
