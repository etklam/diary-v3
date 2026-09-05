import { CompanyContext } from '../company-context';
import { StockNotes } from '../stock-notes';
import { stockSymbolSchema } from '@diary/contracts/watchlist';
import { Evidence } from '../evidence';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { marketSymbolSchema, type MarketQuote, type MarketHistorical, type MarketRange } from '@diary/contracts/market';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { useSessionState } from '../session';
import './company-market.css';

const copy={
  'zh-TW':{title:'市場研究',intro:'查看股票或指數的最新報價與歷史收市價。',symbol:'股票或指數代號',open:'查看行情',invalid:'請輸入有效代號，例如 AAPL、SPY 或 SPX。',quote:'最新報價',price:'價格',currency:'貨幣',previous:'前收市價',change:'變動',percent:'變動百分比',state:'市場狀態',time:'報價時間',unknown:'未提供',refresh:'更新報價',stale:'目前顯示上次成功取得的資料；供應商暫時未能更新。',fetched:'資料取得時間',history:'歷史收市價',range:'歷史範圍',date:'日期（UTC）',close:'收市價',empty:'這個範圍沒有可用的歷史價格。',quoteError:'未能取得報價。請重試，或檢查代號。',historyError:'未能取得歷史價格。請重試或選擇其他範圍。',previousPage:'上一頁',nextPage:'下一頁',page:'頁',personal:'登入後可開始記錄自己的投資判斷。',signIn:'登入',readSource:'資料來源：Yahoo Finance。',ranges:['一個月','三個月','六個月','一年','五年','全部'],states:{REGULAR:'交易時段',CLOSED:'休市',PRE:'盤前',PREPRE:'盤前',POST:'盤後',POSTPOST:'盤後'}},
  'zh-CN':{title:'市场研究',intro:'查看股票或指数的最新报价与历史收盘价。',symbol:'股票或指数代码',open:'查看行情',invalid:'请输入有效代码，例如 AAPL、SPY 或 SPX。',quote:'最新报价',price:'价格',currency:'货币',previous:'前收盘价',change:'变动',percent:'变动百分比',state:'市场状态',time:'报价时间',unknown:'未提供',refresh:'更新报价',stale:'目前显示上次成功获取的数据；供应商暂时无法更新。',fetched:'数据获取时间',history:'历史收盘价',range:'历史范围',date:'日期（UTC）',close:'收盘价',empty:'这个范围没有可用的历史价格。',quoteError:'无法获取报价。请重试，或检查代码。',historyError:'无法获取历史价格。请重试或选择其他范围。',previousPage:'上一页',nextPage:'下一页',page:'页',personal:'登录后可开始记录自己的投资判断。',signIn:'登录',readSource:'数据来源：Yahoo Finance。',ranges:['一个月','三个月','六个月','一年','五年','全部'],states:{REGULAR:'交易时段',CLOSED:'休市',PRE:'盘前',PREPRE:'盘前',POST:'盘后',POSTPOST:'盘后'}},
  en:{title:'Market research',intro:'Read the latest quote and historical closing prices for a stock or index.',symbol:'Stock or index symbol',open:'View market data',invalid:'Enter a valid symbol, such as AAPL, SPY, or SPX.',quote:'Latest quote',price:'Price',currency:'Currency',previous:'Previous close',change:'Change',percent:'Change percent',state:'Market state',time:'Quote time',unknown:'Not provided',refresh:'Refresh quote',stale:'Showing the last successful data. The provider could not refresh it.',fetched:'Data fetched at',history:'Historical closing prices',range:'History range',date:'Date (UTC)',close:'Close',empty:'No historical prices are available for this range.',quoteError:'Unable to get a quote. Try again or check the symbol.',historyError:'Unable to get historical prices. Try again or select another range.',previousPage:'Previous page',nextPage:'Next page',page:'Page',personal:'Sign in to start recording your own investment reasoning.',signIn:'Sign in',readSource:'Source: Yahoo Finance.',ranges:['One month','Three months','Six months','One year','Five years','All history'],states:{REGULAR:'Regular session',CLOSED:'Closed',PRE:'Pre-market',PREPRE:'Pre-market',POST:'Post-market',POSTPOST:'Post-market'}},
};
type ReadState<T>={data:T|null;pending:boolean;error:Failure|null;source:string|null;fetchedAt:string|null};
const initial=<T,>():ReadState<T>=>({data:null,pending:true,error:null,source:null,fetchedAt:null});
const ranges:MarketRange[]=['1mo','3mo','6mo','1y','5y','max'];

export default function CompanyMarket(){
  const {locale,t}=useUi();const text=copy[locale];const session=useSessionState();
  const params=useParams();const parsed=marketSymbolSchema.safeParse(params.symbol);const symbol=parsed.success?parsed.data:'';
  const navigate=useNavigate();const [input,setInput]=useState(params.symbol??'');const [inputError,setInputError]=useState(false);
  const [quote,setQuote]=useState<ReadState<MarketQuote>>(initial);const [history,setHistory]=useState<ReadState<MarketHistorical>>(initial);
  const [range,setRange]=useState<MarketRange>('1y');const [page,setPage]=useState(0);const quoteVersion=useRef(0);const historyVersion=useRef(0);
  const number=(value:number|null)=>value===null?text.unknown:new Intl.NumberFormat(locale,{maximumFractionDigits:6}).format(value);
  const instant=(value:string|null)=>value===null?text.unknown:new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' UTC';
  async function loadQuote(bypass=false){
    const version=++quoteVersion.current;setQuote(initial());
    try{const result=await api.GET('/api/market/quote/{symbol}',{params:{path:{symbol},query:bypass?{nocache:'1'}:{}}});if(version!==quoteVersion.current)return;
      setQuote({data:result.data??null,pending:false,error:result.response.ok?null:apiFailure(result.error,text.quoteError),source:result.response.headers.get('x-market-data-source'),fetchedAt:result.response.headers.get('x-market-data-fetched-at')});
    }catch{if(version===quoteVersion.current)setQuote({...initial(),pending:false,error:apiFailure(null,text.quoteError)});}
  }
  async function loadHistory(){
    const version=++historyVersion.current;setHistory(initial());setPage(0);
    try{const result=await api.GET('/api/market/historical',{params:{query:{symbol,range}}});if(version!==historyVersion.current)return;
      setHistory({data:result.data??null,pending:false,error:result.response.ok?null:apiFailure(result.error,text.historyError),source:result.response.headers.get('x-market-data-source'),fetchedAt:result.response.headers.get('x-market-data-fetched-at')});
    }catch{if(version===historyVersion.current)setHistory({...initial(),pending:false,error:apiFailure(null,text.historyError)});}
  }
  useEffect(()=>{setInput(params.symbol??'');setInputError(false);if(symbol)void loadQuote();return()=>{quoteVersion.current++;};},[symbol]);
  useEffect(()=>{if(symbol)void loadHistory();return()=>{historyVersion.current++;};},[symbol,range]);
  function lookup(event:FormEvent){event.preventDefault();const value=marketSymbolSchema.safeParse(input);setInputError(!value.success);if(value.success)navigate(`/stocks/${encodeURIComponent(value.data)}`);}
  const quoteFailure=useMemo(()=>quote.error?{...quote.error,message:text.quoteError}:null,[quote.error,text.quoteError]);
  const historyFailure=useMemo(()=>history.error?{...history.error,message:text.historyError}:null,[history.error,text.historyError]);
  const rows=history.data?[...history.data].reverse():[];const count=Math.max(1,Math.ceil(rows.length/50));
  return <section className="company-market"><h1>{symbol||text.title}</h1><p className="lede">{text.intro}</p>
    <form className="market-lookup" onSubmit={lookup}><label>{text.symbol}<input value={input} onChange={event=>setInput(event.target.value)} required maxLength={32} autoCapitalize="characters" spellCheck={false} aria-invalid={inputError||!symbol||undefined} aria-describedby={inputError||!symbol?'symbol-error':undefined}/></label><button type="submit">{text.open}</button></form>
    {(inputError||!symbol)&&<p id="symbol-error" className="error" role="alert">{text.invalid}</p>}
    {stockSymbolSchema.safeParse(symbol).success&&session.authenticated===true&&<CompanyContext key={`context-${symbol}`} symbol={symbol}/>}
    {symbol&&<><section className="market-section" aria-labelledby="market-quote-title"><div className="market-heading"><h2 id="market-quote-title">{text.quote}</h2><button type="button" className="secondary" disabled={quote.pending} onClick={()=>void loadQuote(true)}>{quote.pending?t('loading'):text.refresh}</button></div>
      {quote.pending?<p role="status">{t('loading')}</p>:quote.error?<FailureNotice failure={quoteFailure} id="quote-error"/>:quote.data&&<>
        {quote.source==='stale'&&<p role="status" className="market-stale">{text.stale}</p>}
        <dl className="market-metrics"><div><dt>{text.price}</dt><dd data-testid="market-price">{number(quote.data.regularMarketPrice)}</dd></div><div><dt>{text.currency}</dt><dd>{quote.data.currency??text.unknown}</dd></div><div><dt>{text.previous}</dt><dd>{number(quote.data.previousClose)}</dd></div><div><dt>{text.change}</dt><dd>{number(quote.data.change)}</dd></div><div><dt>{text.percent}</dt><dd>{quote.data.changePercent===null?text.unknown:`${number(quote.data.changePercent)}%`}</dd></div><div><dt>{text.state}</dt><dd>{quote.data.marketState?(text.states[quote.data.marketState as keyof typeof text.states]??quote.data.marketState):text.unknown}</dd></div></dl>
        <p className="market-timestamp">{text.time}: <time dateTime={quote.data.lastUpdateTime??undefined}>{instant(quote.data.lastUpdateTime)}</time></p><p className="market-timestamp">{text.fetched}: <time dateTime={quote.fetchedAt??undefined}>{instant(quote.fetchedAt)}</time></p>
      </>}
    </section>
    <section className="market-section" aria-labelledby="market-history-title"><div className="market-heading"><h2 id="market-history-title">{text.history}</h2><label>{text.range}<select value={range} onChange={event=>setRange(event.target.value as MarketRange)}>{ranges.map((value,index)=><option key={value} value={value}>{text.ranges[index]}</option>)}</select></label></div>
      {history.pending?<p role="status">{t('loading')}</p>:history.error?<><FailureNotice failure={historyFailure} id="history-error"/><button type="button" className="secondary" onClick={()=>void loadHistory()}>{t('retry')}</button></>:<>
        {history.source==='stale'&&<p role="status" className="market-stale">{text.stale}</p>}
        {rows.length===0?<p>{text.empty}</p>:<><div className="market-table"><table><caption>{symbol} · {text.history}</caption><thead><tr><th scope="col">{text.date}</th><th scope="col">{text.close}</th></tr></thead><tbody>{rows.slice(page*50,page*50+50).map((row,index)=><tr key={`${row.timestamp}-${index}`}><td><time dateTime={new Date(row.timestamp*1000).toISOString()}>{new Date(row.timestamp*1000).toISOString().slice(0,10)}</time></td><td>{number(row.close)}</td></tr>)}</tbody></table></div>
          {count>1&&<div className="market-pagination"><button className="secondary" disabled={page===0} onClick={()=>setPage(value=>value-1)}>{text.previousPage}</button><span>{text.page} {page+1} / {count}</span><button className="secondary" disabled={page+1===count} onClick={()=>setPage(value=>value+1)}>{text.nextPage}</button></div>}
        </>}
        <p className="market-timestamp">{text.fetched}: <time dateTime={history.fetchedAt??undefined}>{instant(history.fetchedAt)}</time></p>
      </>}
    </section><p className="muted">{text.readSource}</p></>}
    {stockSymbolSchema.safeParse(symbol).success&&session.authenticated===true&&<p><Link to={`/stocks/alerts?symbol=${encodeURIComponent(symbol)}`}>{locale==='en'?'Price reminders':locale==='zh-CN'?'价格提醒':'價格提醒'}</Link>{' · '}<Link to={`/stocks/${symbol}/thesis`}>{locale==='en'?'Investment thesis':locale==='zh-CN'?'投资论点':'投資論點'}</Link></p>}
    {stockSymbolSchema.safeParse(symbol).success&&session.authenticated===true&&<StockNotes key={`notes-${symbol}`} symbol={symbol}/>}
    {stockSymbolSchema.safeParse(symbol).success&&session.authenticated===true&&<Evidence key={`evidence-${symbol}`} symbol={symbol}/>}
    {session.authenticated===false&&<p className="market-personal">{text.personal} <Link to="/login">{text.signIn}</Link></p>}
  </section>;
}
