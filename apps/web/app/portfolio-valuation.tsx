import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { portfolioValuationResponseSchema, type PortfolioValuationResponse } from '@diary/contracts/portfolio';
import { api, useUi } from './ui';
import { apiFailure, FailureNotice, type Failure } from './api-error';
import { signInPath } from './session';

const copy = {
 en: { largest:'Largest position', top3:'Top three positions', concentration:'Concentration is elevated (largest ≥ 25% or top three ≥ 60% of priced market value).', riskBasis:'Concentration uses priced market value only.', title:'Portfolio valuation', complete:'All positions priced', partial:'Some positions have no quote', unavailable:'Quotes unavailable', empty:'No open positions', hint:'Values cover priced positions only. Unpriced cost remains separate.', value:'Priced market value', pnl:'Unrealized gain / loss', pct:'Unrealized return', cost:'Priced cost basis', unpriced:'Unpriced cost basis', coverage:'Quote coverage', asof:'Oldest quote', stale:'Quotes older than 72 hours', unknown:'Unavailable', price:'Price', symbol:'Symbol', position:'Position value' },
 'zh-TW': { largest:'最大持倉', top3:'前三持倉', concentration:'集中度偏高（最大持倉達已報價市值 25%，或前三達 60%）。', riskBasis:'集中度只按已有報價的市值計算。', title:'持倉估值', complete:'全部持倉已有報價', partial:'部分持倉缺少報價', unavailable:'報價暫不可用', empty:'沒有未平倉部位', hint:'市值及損益只涵蓋已有報價的持倉，未估值成本獨立列出。', value:'已報價持倉市值', pnl:'未實現損益', pct:'未實現報酬率', cost:'已估值成本', unpriced:'未估值成本', coverage:'報價覆蓋率', asof:'最早報價時間', stale:'超過 72 小時的報價', unknown:'暫不可用', price:'價格', symbol:'代號', position:'部位市值' },
 'zh-CN': { largest:'最大持仓', top3:'前三持仓', concentration:'集中度偏高（最大持仓达已报价市值 25%，或前三达 60%）。', riskBasis:'集中度只按已有报价的市值计算。', title:'持仓估值', complete:'全部持仓已有报价', partial:'部分持仓缺少报价', unavailable:'报价暂不可用', empty:'没有未平仓部位', hint:'市值及损益只涵盖已有报价的持仓，未估值成本独立列出。', value:'已报价持仓市值', pnl:'未实现损益', pct:'未实现回报率', cost:'已估值成本', unpriced:'未估值成本', coverage:'报价覆盖率', asof:'最早报价时间', stale:'超过 72 小时的报价', unknown:'暂不可用', price:'价格', symbol:'代码', position:'部位市值' },
};
export function PortfolioValuation() {
 const {locale,t}=useUi(),c=copy[locale];
 const translate=useRef(t);translate.current=t;
 const [data,setData]=useState<PortfolioValuationResponse|null>(null),[error,setError]=useState<Failure|null>(null),[attempt,retry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setData(null);setError(null);
  api.GET('/api/stocks/portfolio',{signal:controller.signal}).then(response=>{
   if(controller.signal.aborted)return;
   const parsed=portfolioValuationResponseSchema.safeParse(response.data);
   if(parsed.success)setData(parsed.data);else setError(apiFailure(response.error,translate.current('failed')));
  }).catch(()=>{if(!controller.signal.aborted)setError(apiFailure(null,translate.current('connection')));});
  return()=>controller.abort();
 },[attempt]);
 const number=(value:number|null)=>value===null?'—':new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value);
 return <section className="ledger-reading portfolio-valuation" aria-labelledby="portfolio-title"><h2 id="portfolio-title">{c.title}</h2>
  {error?<><FailureNotice failure={error} id="portfolio-error"/><button className="secondary" onClick={()=>retry(value=>value+1)}>{t('retry')}</button>{error.code?.startsWith('AUTH_')&&<Link to={signInPath('/stocks')}>{t('login')}</Link>}</>:!data?<p role="status">{t('loading')}</p>:<>
   <p role="status" data-testid="valuation-status">{c[data.valuation.valuationStatus]}</p>
   {data.valuation.valuationStatus!=='empty'&&<><p className="muted">{c.hint}</p><dl>
    {([['value','currentMarketValue'],['pnl','unrealizedAmount'],['pct','unrealizedPct'],['cost','pricedCostBasis'],['unpriced','unpricedCostBasis'],['coverage','quoteCoveragePct']] as const).map(([label,key])=><div key={key}><dt>{c[label]}</dt><dd data-testid={`valuation-${key}`}>{number(data.valuation[key])}{(key==='unrealizedPct'||key==='quoteCoveragePct')&&data.valuation[key]!==null?'%':''}</dd></div>)}
   </dl><p>{c.riskBasis}</p><dl><div><dt>{c.largest}</dt><dd data-testid="risk-largest">{number(data.valuation.largestPositionPct)}{data.valuation.largestPositionPct!==null&&'%'} {data.valuation.largestPositionSymbol&&<Link to={`/stocks/${encodeURIComponent(data.valuation.largestPositionSymbol)}`}>{data.valuation.largestPositionSymbol}</Link>}</dd></div><div><dt>{c.top3}</dt><dd data-testid="risk-top3">{number(data.valuation.top3ConcentrationPct)}{data.valuation.top3ConcentrationPct!==null&&'%'}</dd></div></dl>{data.valuation.concentrationWarning&&<p role="status">{c.concentration}</p>}<p>{c.asof}: {data.valuation.valuationAsOf?<time dateTime={data.valuation.valuationAsOf}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(data.valuation.valuationAsOf))} UTC</time>:c.unknown}</p><p>{c.stale}: {data.valuation.staleQuoteCount}</p>
   <div className="holdings-table"><table aria-label={c.title}><thead><tr><th>{c.symbol}</th><th>{c.price}</th><th>{c.position}</th><th>{c.pnl}</th></tr></thead><tbody>{data.holdings.map(holding=><tr key={holding.symbol}><th scope="row"><Link to={`/stocks/${encodeURIComponent(holding.symbol)}`}>{holding.symbol}</Link></th><td>{number(holding.price??null)}</td><td>{number(holding.price===undefined?null:holding.price*holding.quantity)}</td><td>{number(holding.price===undefined?null:holding.price*holding.quantity-holding.totalCost)}</td></tr>)}</tbody></table></div></>}
  </>}
 </section>;
}
