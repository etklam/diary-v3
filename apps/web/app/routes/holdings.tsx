import { PortfolioAttention } from '../portfolio-attention';
import { PortfolioExposure } from '../portfolio-exposure';
import { PortfolioValuation } from '../portfolio-valuation';
import { TradeExport } from '../trade-export';
import { RecentRealizedTrades } from '../recent-realized-trades';
import { useEffect,useState } from 'react';
import { signInPath } from '../session';
import { Link } from 'react-router';
import type { Holding } from '@diary/contracts/ledger';
import { api,useUi } from '../ui';
import { apiFailure,FailureNotice,type Failure } from '../api-error';
import { ledgerCopy } from '../ledger-copy';
import '../ledger.css';
export default function Holdings(){const {locale,t}=useUi();const l=ledgerCopy[locale];const [data,setData]=useState<Holding[]|null>(null);const [error,setError]=useState<Failure|null>(null);
 async function load(){setData(null);setError(null);try{const result=await api.GET('/api/stocks/holdings');if(result.response.ok&&result.data)setData(result.data);else setError(apiFailure(result.error,t('failed')));}catch{setError(apiFailure(null,t('connection')));}}
 useEffect(()=>{void load();},[]);
 return <section><header><h1>{l.holdings}</h1><p className="lede">{l.holdingsHint}</p></header>{error?<><FailureNotice failure={error}/><Link className="inline-link" to={signInPath('/stocks')}>{t('login')}</Link><button onClick={()=>void load()}>{t('retry')}</button></>:data===null?<p role="status">{t('loading')}</p>:data.length===0?<p>{l.empty}</p>:<div className="holdings-table"><table aria-label={l.holdings}><thead><tr>{(['symbol','quantity','avgCost','totalCost'] as const).map(key=><th scope="col" key={key}>{l[key]}</th>)}</tr></thead><tbody>{data.map(row=><tr key={row.symbol}><th scope="row"><Link to={`/stocks/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link></th><td>{row.quantity}</td><td>{row.avgCost}</td><td>{row.totalCost}</td></tr>)}</tbody></table></div>}<Link className="button" to="/diaries/new">{l.record}</Link><p><Link to="/strategy-performance">{locale==='en'?'Strategy performance':locale==='zh-CN'?'策略绩效':'策略績效'}</Link></p><PortfolioAttention/><PortfolioValuation/><PortfolioExposure/><RecentRealizedTrades/><TradeExport/></section>;
}
