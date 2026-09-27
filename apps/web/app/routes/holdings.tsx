import { PortfolioAttention } from '../portfolio-attention';
import { PortfolioExposure } from '../portfolio-exposure';
import { PortfolioValuation } from '../portfolio-valuation';
import { TradeExport } from '../trade-export';
import { RecentRealizedTrades } from '../recent-realized-trades';
import { useEffect, useRef, useState } from 'react';
import { signInPath, useSessionState } from '../session';
import { Link } from 'react-router';
import { portfolioLedgerResponseSchema, portfolioOverviewResponseSchema, type PortfolioLedgerResponse, type PortfolioOverviewResponse } from '@diary/contracts/portfolio-overview';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { ledgerCopy } from '../ledger-copy';
import { formatMarketValue, formatNeutralValue, marketClass } from '../market-display';
import '../ledger.css';

const copy = {
  en: { scroll: 'Scroll across the table to see prices and quote status.', title: 'Holdings', price: 'Current price', value: 'Market value', pnl: 'Gain / loss', status: 'Quote status', missing: 'No quote', stale: 'Stale quote', timeUnknown: 'Quote time unknown', updated: 'Last updated', refreshing: 'Updating; showing the last confirmed results.', details: 'Risk, exposure and realized trades', strategy: 'Strategy performance', changed: 'Transactions changed during loading. Refresh to align prices and holdings.' },
  'zh-TW': { scroll: '橫向捲動表格，可查看價格與報價狀態。', title: '持倉', price: '現價', value: '市值', pnl: '盈虧', status: '報價狀態', missing: '缺少報價', stale: '報價已過時', timeUnknown: '報價時間未知', updated: '最後更新', refreshing: '正在更新，暫時顯示上次確認的結果。', details: '風險、曝險及已實現交易', strategy: '策略績效', changed: '載入期間交易已有變更，請重新整理以對齊持倉與估值。' },
  'zh-CN': { scroll: '横向滚动表格，可查看价格与报价状态。', title: '持仓', price: '现价', value: '市值', pnl: '盈亏', status: '报价状态', missing: '缺少报价', stale: '报价已过时', timeUnknown: '报价时间未知', updated: '最后更新', refreshing: '正在更新，暂时显示上次确认的结果。', details: '风险、敞口及已实现交易', strategy: '策略绩效', changed: '加载期间交易已有变更，请刷新以对齐持仓与估值。' },
};

export default function Holdings() {
  const { locale, t } = useUi(), l = ledgerCopy[locale], c = copy[locale], session = useSessionState();
  const translate = useRef(t); translate.current = t;
  const [ledger, setLedger] = useState<{ revision: number; fingerprint: string | null; data: PortfolioLedgerResponse } | null>(null);
  const [market, setMarket] = useState<{ revision: number; fingerprint: string | null; data: PortfolioOverviewResponse } | null>(null);
  const [ledgerError, setLedgerError] = useState<Failure | null>(null), [marketError, setMarketError] = useState<Failure | null>(null);
  const [ledgerAttempt, retryLedger] = useState(0), [marketAttempt, retryMarket] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false), [marketLoading, setMarketLoading] = useState(false);
  useEffect(() => {
    if (session.authenticated !== true) { setLedger(null); return; }
    const controller = new AbortController(); setLedgerLoading(true); setLedgerError(null);
    api.GET('/api/portfolio/ledger', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = portfolioLedgerResponseSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setLedger({ revision: session.revision, fingerprint: result.response.headers.get('X-Portfolio-Ledger-Revision'), data: parsed.data });
      else { if ([401, 403].includes(result.response.status)) setLedger(null); setLedgerError(apiFailure(result.error, translate.current('failed'))); }
    }).catch(() => { if (!controller.signal.aborted) setLedgerError(apiFailure(null, translate.current('connection'))); })
      .finally(() => { if (!controller.signal.aborted) setLedgerLoading(false); });
    return () => controller.abort();
  }, [session.authenticated, session.revision, ledgerAttempt]);
  useEffect(() => {
    if (session.authenticated !== true) { setMarket(null); return; }
    const controller = new AbortController(); setMarketLoading(true); setMarketError(null);
    api.GET('/api/portfolio/overview', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = portfolioOverviewResponseSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setMarket({ revision: session.revision, fingerprint: result.response.headers.get('X-Portfolio-Ledger-Revision'), data: parsed.data });
      else { if ([401, 403].includes(result.response.status)) setMarket(null); setMarketError(apiFailure(result.error, translate.current('failed'))); }
    }).catch(() => { if (!controller.signal.aborted) setMarketError(apiFailure(null, translate.current('connection'))); })
      .finally(() => { if (!controller.signal.aborted) setMarketLoading(false); });
    return () => controller.abort();
  }, [session.authenticated, session.revision, marketAttempt]);
  const data = session.authenticated === true && ledger?.revision === session.revision ? ledger.data : null;
  const quotes = session.authenticated === true && market?.revision === session.revision ? market.data : null;
  const mismatch = Boolean(data && quotes && ledger?.fingerprint && market?.fingerprint && ledger.fingerprint !== market.fingerprint);
  const coherentQuotes = mismatch ? null : quotes;
  const valuation = coherentQuotes?.valuation.status === 'ready' ? coherentQuotes.valuation.data : null;
  const attention = coherentQuotes?.attention.status === 'ready' ? coherentQuotes.attention.data : null;
  const exposure = data?.exposure.status === 'ready' ? data.exposure.data : null;
  const retryPrices = () => retryMarket(value => value + 1), retryBook = () => retryLedger(value => value + 1);
  const sectionError = (section: { status: string; error?: unknown } | undefined, fallback: Failure | null) => section?.status === 'failed' ? apiFailure({ data: section.error }, t('failed')) : fallback;
  const number = (value: number | null) => formatNeutralValue(locale, value, 2);
  if (session.authenticated === false) return <section><h1>{c.title}</h1><Link to={signInPath('/stocks')}>{t('login')}</Link></section>;
  return <section className="holdings-workspace"><header><h1>{c.title}</h1><p className="lede">{l.holdingsHint}</p></header>
    {ledgerError && <><FailureNotice failure={ledgerError}/><button onClick={retryBook}>{t('retry')}</button></>}
    {ledgerLoading && data && <p role="status">{c.refreshing}</p>}
    {!data ? !ledgerError && <p role="status">{t('loading')}</p> : data.holdings.length === 0 ? <p>{l.empty}</p> : <>
      <p className="holdings-scroll-hint muted" id="holdings-scroll-hint">{c.scroll}</p><div className="holdings-table" role="region" aria-label={c.title} aria-describedby="holdings-scroll-hint" tabIndex={0}><table aria-label={c.title}><thead><tr>{[l.symbol, l.quantity, l.avgCost, l.totalCost, c.price, c.value, c.pnl, c.status].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.holdings.map(row => {
        const quote = valuation?.holdings.find(item => item.symbol === row.symbol);
        const compatible = quote && quote.quantity === Number(row.quantity) && quote.totalCost === Number(row.totalCost);
        const price = compatible ? quote.price : undefined;
        const value = price === undefined ? null : price * Number(row.quantity), pnl = value === null ? null : value - Number(row.totalCost);
        const stale = quote?.source === 'stale' || (quote?.quoteAsOf && Date.now() - Date.parse(quote.quoteAsOf) > 72 * 3600_000);
        return <tr key={row.symbol}><th scope="row"><Link to={`/stocks/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link></th><td>{row.quantity}</td><td>{row.avgCost}</td><td>{row.totalCost}</td><td>{number(price ?? null)}</td><td>{number(value)}</td><td className={marketClass(pnl)}>{formatMarketValue(locale, pnl, 2)}</td><td>{price === undefined ? c.missing : <>{stale && <span>{c.stale} · </span>}{quote?.quoteAsOf ? <time dateTime={quote.quoteAsOf}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(quote.quoteAsOf))} UTC</time> : c.timeUnknown}</>}</td></tr>;
      })}</tbody></table></div><p className="muted">{c.updated}: <time dateTime={data.asOf}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(data.asOf))} UTC</time></p>
    </>}
    <div className="actions"><Link className="button" to="/diaries/new">{l.record}</Link><button className="secondary" onClick={() => { retryBook(); retryPrices(); }} disabled={ledgerLoading || marketLoading}>{t('retry')}</button></div>
    {marketLoading && quotes && <p role="status">{c.refreshing}</p>}
    {mismatch && <p role="status">{c.changed}</p>}
    {!mismatch && <PortfolioValuation showHoldings={false} source={{ data: valuation, error: sectionError(quotes?.valuation, marketError), retry: retryPrices }}/>}
    <details className="holdings-details"><summary>{c.details}</summary>
      {!mismatch && <PortfolioAttention source={{ data: attention, error: sectionError(quotes?.attention, marketError), retry: retryPrices }}/>}
      <PortfolioExposure source={{ data: exposure, error: sectionError(data?.exposure, ledgerError), retry: retryBook }}/>
      <RecentRealizedTrades source={{ data: data?.recent.trades ?? null, error: ledgerError, retry: retryBook }}/>
      <p><Link to="/strategy-performance">{c.strategy}</Link></p><TradeExport/>
    </details>
  </section>;
}
