import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { performanceQuerySchema, performanceResponseSchema, type PerformanceResponse } from '@diary/contracts/performance';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath } from '../session';
import { performanceCopy } from '../performance-copy';
import { MIN_CHART_POINTS, PerformanceChart } from '../performance-chart';
import { PerformanceTable } from '../performance-table';
import { formatAmount, formatInstantUtc, formatMarketValue, formatNeutralValue, formatPercent, formatQuantity, formatSignedPercent, marketClass } from '../market-display';
import '../ledger.css';
import '../performance.css';
export default function Performance() {
  const { locale, t } = useUi(), c = performanceCopy[locale], [params, setParams] = useSearchParams();
  const query = params.toString(), [period, setPeriod] = useState(params.get('period') ?? 'month'), [symbol, setSymbol] = useState(params.get('symbol') ?? '');
  const [data, setData] = useState<PerformanceResponse | null>(null), [error, setError] = useState<Failure | null>(null), [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    const search = new URLSearchParams(query), parsed = performanceQuerySchema.safeParse(Object.fromEntries(search));
    if (!parsed.success) { setError({ message: t('failed'), code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
    setPeriod(parsed.data.period); setSymbol(parsed.data.symbol ?? '');
    api.GET('/api/stats/performance', { params: { query: parsed.data }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const value = performanceResponseSchema.safeParse(result.data);
      if (result.response.ok && value.success) setData(value.data); else setError(apiFailure(result.error, t('failed')));
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, t('connection'))); });
    return () => controller.abort();
  }, [query, attempt]);
  function submit(event: FormEvent) { event.preventDefault(); setParams({ period, ...(symbol.trim() ? { symbol: symbol.trim().toUpperCase() } : {}) }); }
  const number = (value: number | null, digits = 2) => formatNeutralValue(locale, value, digits);
  const signed = (value: number | null, digits = 2) => formatMarketValue(locale, value, digits);
  const percent = (value: number | null) => formatPercent(locale, value);
  const drawdownClass = (value: number | null) => value === null || !Number.isFinite(value) ? '' : value > 0 ? 'market-down' : value === 0 ? 'market-flat' : '';
  // An absent value is not content. A section whose only body was the words
  // "Not recorded" used to occupy a full ruled section at figure weight; it is
  // one muted line until there is something to read.
  const absent = (title: string) => <p className="performance-absent" key={title}>{title}: {c.none}</p>;
  const breakdown = (title: string, rows: PerformanceResponse['strategyBreakdown']) => rows.length === 0 ? absent(title) : <section key={title}><h2>{title}</h2><PerformanceTable key={query + title} title={title} headers={[c.name,c.count,c.pnl,c.winRate]} rows={rows.map(row => [row.name,number(row.tradeCount,0),<span className={marketClass(row.realizedPnL)}>{signed(row.realizedPnL)}</span>,percent(row.winRate)])}/></section>;
  const trades = (title: string, rows: PerformanceResponse['topWins']) => rows.length === 0 ? absent(title) : <section key={title}><h2>{title}</h2><PerformanceTable title={title} headers={[c.symbolLabel,c.date,c.quantity,c.price,c.basis,c.pnl,c.returns]} rows={rows.map(row => [<Link key={row.id} to={`/stocks/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link>,<time key={row.id} dateTime={row.sellDate}>{formatInstantUtc(locale,row.sellDate)}</time>,formatQuantity(locale,row.sellQuantity),formatAmount(locale,row.sellPrice),formatAmount(locale,row.avgCostBasis),<span className={marketClass(row.realizedPnL)}>{signed(row.realizedPnL)}</span>,<span className={marketClass(row.realizedPnLPct)}>{formatSignedPercent(locale,row.realizedPnLPct)}</span>])}/></section>;
  return <section className="performance-page"><h1>{c.title}</h1><p className="lede">{c.hint}</p><form className="performance-filters" onSubmit={submit}><label>{c.period}<select value={period} onChange={event => setPeriod(event.target.value)}>{(['month','quarter','year'] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label><label>{c.symbol}<input value={symbol} maxLength={32} placeholder={c.all} onChange={event => setSymbol(event.target.value)} autoCapitalize="characters"/></label><button className="secondary">{c.apply}</button></form>
    {error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/strategy-performance')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : !data.summary.totalClosedTrades ? <><p>{c.empty}</p><Link to="/diaries/new">{c.record}</Link></> : <>
      {/* Seven figures are a column of amounts, closed by the one that is the
          point. Nine stat tiles side by side was more than working memory
          holds, and it gave "Not recorded" the same weight as a result. */}
      <div className="ledger performance-summary">
        {(['totalClosedTrades','wins','losses','winRate','maxDrawdownPct','sharpe'] as const).map(key => <div className="ledger-row" key={key}>
          <span>{c[key]}</span>
          <span className={key==='maxDrawdownPct'?drawdownClass(data.summary.maxDrawdownPct):undefined} data-testid={`performance-${key}`}>{key==='maxDrawdownPct'||key==='winRate'?percent(data.summary[key]):number(data.summary[key],['totalClosedTrades','wins','losses'].includes(key)?0:2)}</span>
        </div>)}
        <div className="ledger-row ledger-row-total">
          <span>{c.totalRealizedPnL}</span>
          <span className={marketClass(data.summary.totalRealizedPnL)} data-testid="performance-totalRealizedPnL">{signed(data.summary.totalRealizedPnL)}</span>
        </div>
      </div>
      {/* Strategy names are not amounts, so they read as a line rather than as
          two more ledger figures. */}
      <p className="performance-extremes">{c.best}: {data.bestStrategy?.name ?? c.none} · {c.worst}: {data.worstStrategy?.name ?? c.none}</p>
      <p>{c.limits}</p><p>{c.utc}</p>
      <section><h2>{c.periods}</h2><PerformanceChart title={c.periods} bars points={data.periodStats.map(row=>({label:row.period,value:row.realizedPnL}))}/><PerformanceTable key={query} title={c.periods} headers={[c.periodLabel,c.pnl,c.count,c.winRate]} rows={data.periodStats.map(row=>[row.period,<span className={marketClass(row.realizedPnL)}>{signed(row.realizedPnL)}</span>,number(row.tradeCount,0),percent(row.winRate)])}/></section>
      {/* The curve's table hides behind a disclosure because the chart is the
          answer. With too few points to chart, the table *is* the answer and
          must not be the thing behind a summary. */}
      {(() => {
        const curveTable = <PerformanceTable key={query} title={c.curve} headers={[c.date,c.pnl]} rows={data.equityCurve.map(row=>[row.date,<span className={marketClass(row.cumPnL)}>{signed(row.cumPnL)}</span>])}/>;
        return <section><h2>{c.curve}</h2><PerformanceChart title={c.curve} points={data.equityCurve.map(row=>({label:row.date,value:row.cumPnL}))}/>{data.equityCurve.length < MIN_CHART_POINTS ? curveTable : <details><summary>{c.data}</summary>{curveTable}</details>}</section>;
      })()}
      <section><h2>{c.symbols}</h2><PerformanceChart title={c.symbols} bars points={data.symbolBreakdown.slice(0,10).map(row=>({label:row.symbol,value:row.realizedPnL}))}/><PerformanceTable key={query} title={c.symbols} headers={[c.symbolLabel,c.count,c.pnl,c.winRate]} rows={data.symbolBreakdown.map(row=>[<Link key={row.symbol} to={`/stocks/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link>,number(row.tradeCount,0),<span className={marketClass(row.realizedPnL)}>{signed(row.realizedPnL)}</span>,percent(row.winRate)])}/></section>
      {breakdown(c.strategy,data.strategyBreakdown)}{breakdown(c.emotion,data.emotionBreakdown)}{trades(c.topWins,data.topWins)}{trades(c.topLosses,data.topLosses)}
    </>}
  </section>;
}
