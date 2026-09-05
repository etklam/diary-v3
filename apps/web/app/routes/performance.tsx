import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { performanceQuerySchema, performanceResponseSchema, type PerformanceResponse } from '@diary/contracts/performance';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath } from '../session';
import { performanceCopy } from '../performance-copy';
import { PerformanceChart } from '../performance-chart';
import { PerformanceTable } from '../performance-table';
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
  const number = (value: number | null, digits = 2) => value === null ? '—' : new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const breakdown = (title: string, rows: PerformanceResponse['strategyBreakdown']) => <section><h2>{title}</h2><PerformanceTable key={query + title} title={title} headers={[c.name,c.count,c.pnl,c.winRate]} rows={rows.map(row => [row.name,number(row.tradeCount,0),number(row.realizedPnL),number(row.winRate)+'%'])}/></section>;
  const trades = (title: string, rows: PerformanceResponse['topWins']) => <section><h2>{title}</h2><PerformanceTable title={title} headers={[c.symbolLabel,c.date,c.quantity,c.price,c.basis,c.pnl,c.returns]} rows={rows.map(row => [<Link key={row.id} to={`/stocks/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link>,<time key={row.id} dateTime={row.sellDate}>{new Intl.DateTimeFormat(locale, { dateStyle:'medium',timeStyle:'short',timeZone:'UTC' }).format(new Date(row.sellDate))}</time>,number(row.sellQuantity,4),number(row.sellPrice,4),number(row.avgCostBasis,4),number(row.realizedPnL),number(row.realizedPnLPct)+'%'])}/></section>;
  return <section className="performance-page"><h1>{c.title}</h1><p className="lede">{c.hint}</p><form className="performance-filters" onSubmit={submit}><label>{c.period}<select value={period} onChange={event => setPeriod(event.target.value)}>{(['month','quarter','year'] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label><label>{c.symbol}<input value={symbol} maxLength={32} placeholder={c.all} onChange={event => setSymbol(event.target.value)} autoCapitalize="characters"/></label><button>{c.apply}</button></form>
    {error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/strategy-performance')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : !data.summary.totalClosedTrades ? <><p>{c.empty}</p><Link to="/diaries/new">{c.record}</Link></> : <>
      <dl className="performance-summary">{(['totalRealizedPnL','totalClosedTrades','winRate','wins','losses','maxDrawdownPct','sharpe'] as const).map(key => <div key={key}><dt>{c[key]}</dt><dd data-testid={`performance-${key}`}>{number(data.summary[key],['totalClosedTrades','wins','losses'].includes(key)?0:2)}{(key==='winRate'||key==='maxDrawdownPct')&&'%'}</dd></div>)}<div><dt>{c.best}</dt><dd>{data.bestStrategy?.name ?? c.none}</dd></div><div><dt>{c.worst}</dt><dd>{data.worstStrategy?.name ?? c.none}</dd></div></dl><p>{c.limits}</p><p>{c.utc}</p>
      <section><h2>{c.periods}</h2><PerformanceChart title={c.periods} bars points={data.periodStats.map(row=>({label:row.period,value:row.realizedPnL}))}/><PerformanceTable key={query} title={c.periods} headers={[c.periodLabel,c.pnl,c.count,c.winRate]} rows={data.periodStats.map(row=>[row.period,number(row.realizedPnL),number(row.tradeCount,0),number(row.winRate)+'%'])}/></section>
      <section><h2>{c.curve}</h2><PerformanceChart title={c.curve} points={data.equityCurve.map(row=>({label:row.date,value:row.cumPnL}))}/><details><summary>{c.data}</summary><PerformanceTable key={query} title={c.curve} headers={[c.date,c.pnl]} rows={data.equityCurve.map(row=>[row.date,number(row.cumPnL)])}/></details></section>
      <section><h2>{c.symbols}</h2><PerformanceChart title={c.symbols} bars points={data.symbolBreakdown.slice(0,10).map(row=>({label:row.symbol,value:row.realizedPnL}))}/><PerformanceTable key={query} title={c.symbols} headers={[c.symbolLabel,c.count,c.pnl,c.winRate]} rows={data.symbolBreakdown.map(row=>[<Link key={row.symbol} to={`/stocks/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link>,number(row.tradeCount,0),number(row.realizedPnL),number(row.winRate)+'%'])}/></section>
      {breakdown(c.strategy,data.strategyBreakdown)}{breakdown(c.emotion,data.emotionBreakdown)}{trades(c.topWins,data.topWins)}{trades(c.topLosses,data.topLosses)}
    </>}
  </section>;
}
