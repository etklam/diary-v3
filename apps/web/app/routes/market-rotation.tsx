import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { marketRotationMonitorResponseSchema, type MarketRotationMonitorResponse, type MarketRotationMonitorRow } from '@diary/contracts/rotation-monitor';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import './market-rotation.css';

const copy = {
  en: {
    title: 'Market rotation',
    intro: 'Read the latest available relative-strength snapshot by scope. The monitor shows the observation date and keeps unavailable values explicit.',
    scope: 'Rank scope',
    sectors: 'Sectors',
    indexes: 'Indexes',
    core: 'Core assets',
    asOf: 'Snapshot date',
    summaryAsOf: 'Breadth date',
    comparison: 'Comparison date',
    noComparison: 'No qualified comparison yet',
    marketState: 'Market state',
    above20d: 'Above 20-day SMA',
    above50d: 'Above 50-day SMA',
    averageRsi: 'Average RSI',
    currentSummary: 'Current read',
    leaders: 'Leaders',
    weakening: 'Weakening groups',
    noLeaders: 'No improving groups with a qualified comparison.',
    noWeakening: 'No weakening groups with a qualified comparison.',
    ranking: 'Current ranking',
    symbol: 'Symbol',
    name: 'Name',
    rank: 'Rank',
    score: 'Score',
    change: '2-week change',
    rsi: 'RSI',
    signal: 'Signal',
    price: 'Last price',
    unavailable: 'Unavailable',
    complete: 'Complete',
    insufficient: 'Insufficient data',
    qualified: 'Qualified snapshot',
    partial: 'Partial snapshot',
    empty: 'No rotation snapshot is available for this scope yet.',
  },
  'zh-TW': {
    title: '市場輪動',
    intro: '按範圍閱讀最新的市場相對強弱快照。頁面清楚顯示觀察日期，缺少的數值會保留為無資料。',
    scope: '排名範圍',
    sectors: '板塊',
    indexes: '指數',
    core: '核心資產',
    asOf: '快照日期',
    summaryAsOf: '廣度日期',
    comparison: '比較日期',
    noComparison: '尚未有合資格比較',
    marketState: '市場狀態',
    above20d: '高於 20 日均線',
    above50d: '高於 50 日均線',
    averageRsi: '平均 RSI',
    currentSummary: '目前讀法',
    leaders: '領先群組',
    weakening: '轉弱群組',
    noLeaders: '沒有具備合資格比較的改善群組。',
    noWeakening: '沒有具備合資格比較的轉弱群組。',
    ranking: '目前排名',
    symbol: '代號',
    name: '名稱',
    rank: '排名',
    score: '分數',
    change: '兩週變化',
    rsi: 'RSI',
    signal: '訊號',
    price: '最新價格',
    unavailable: '無資料',
    complete: '完整',
    insufficient: '資料不足',
    qualified: '合資格快照',
    partial: '部分快照',
    empty: '此範圍尚未有市場輪動快照。',
  },
  'zh-CN': {
    title: '市场轮动',
    intro: '按范围阅读最新的市场相对强弱快照。页面清楚显示观察日期，缺少的数值会保留为无数据。',
    scope: '排名范围',
    sectors: '板块',
    indexes: '指数',
    core: '核心资产',
    asOf: '快照日期',
    summaryAsOf: '广度日期',
    comparison: '比较日期',
    noComparison: '尚无合资格比较',
    marketState: '市场状态',
    above20d: '高于 20 日均线',
    above50d: '高于 50 日均线',
    averageRsi: '平均 RSI',
    currentSummary: '目前读法',
    leaders: '领先群组',
    weakening: '转弱群组',
    noLeaders: '没有具备合资格比较的改善群组。',
    noWeakening: '没有具备合资格比较的转弱群组。',
    ranking: '目前排名',
    symbol: '代码',
    name: '名称',
    rank: '排名',
    score: '分数',
    change: '两周变化',
    rsi: 'RSI',
    signal: '信号',
    price: '最新价格',
    unavailable: '无数据',
    complete: '完整',
    insufficient: '数据不足',
    qualified: '合资格快照',
    partial: '部分快照',
    empty: '此范围尚无市场轮动快照。',
  },
} as const;

type Scope = 'sectors' | 'indexes' | 'core';
type RotationCopy = Record<keyof typeof copy.en, string>;
const scopes: Scope[] = ['sectors', 'indexes', 'core'];
type Locale = keyof typeof copy;
const stateLabels: Record<Locale, Record<MarketRotationMonitorResponse['marketState'], string>> = {
  en: { risk_on: 'Risk on', neutral: 'Neutral', defensive: 'Defensive', risk_off: 'Risk off', unknown: 'Unknown' },
  'zh-TW': { risk_on: '風險偏好', neutral: '中性', defensive: '防守', risk_off: '風險規避', unknown: '未知' },
  'zh-CN': { risk_on: '风险偏好', neutral: '中性', defensive: '防守', risk_off: '风险规避', unknown: '未知' },
};
const signalLabels: Record<Locale, Record<NonNullable<MarketRotationMonitorRow['signal']>, string>> = {
  en: { turning_strong: 'Turning strong', strong_but_extended: 'Strong but extended', losing_momentum: 'Losing momentum', breaking_down: 'Breaking down', early_recovery: 'Early recovery', neutral: 'Neutral' },
  'zh-TW': { turning_strong: '轉強', strong_but_extended: '強勢但偏離', losing_momentum: '動能減弱', breaking_down: '跌破轉弱', early_recovery: '初步復甦', neutral: '中性' },
  'zh-CN': { turning_strong: '转强', strong_but_extended: '强势但偏离', losing_momentum: '动能减弱', breaking_down: '跌破转弱', early_recovery: '初步复苏', neutral: '中性' },
};

function number(locale: string, value: number | null, digits = 2) {
  return value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function percent(locale: string, value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function date(locale: string, value: string | null) {
  return value === null ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function stateLabel(value: MarketRotationMonitorResponse['marketState'], locale: Locale) {
  return stateLabels[locale][value];
}

function rowLabel(row: MarketRotationMonitorRow, c: RotationCopy, locale: Locale) {
  return row.signalStatus === 'complete' ? (row.signal ? signalLabels[locale][row.signal] : c.complete) : c.insufficient;
}

export default function MarketRotation() {
  const { locale, t } = useUi();
  const c = copy[locale];
  const [params, setParams] = useSearchParams();
  const scopeParam = params.get('scope');
  const scope: Scope = scopes.includes(scopeParam as Scope) ? scopeParam as Scope : 'sectors';
  const [data, setData] = useState<MarketRotationMonitorResponse | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [attempt, retry] = useState(0);
  const messages = useRef({ c, t });
  messages.current = { c, t };

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    api.GET('/api/market/rotation-monitor', { params: { query: { scope } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = marketRotationMonitorResponseSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setData(parsed.data);
      else setError(apiFailure(result.error, messages.current.t('failed')));
    }).catch(() => {
      if (!controller.signal.aborted) setError(apiFailure(null, messages.current.t('connection')));
    });
    return () => controller.abort();
  }, [scope, attempt]);

  function changeScope(value: Scope) {
    setParams(value === 'sectors' ? {} : { scope: value });
  }

  const ratio = (metric: { count: number; total: number; ratio: number | null }) => `${metric.count}/${metric.total} · ${percent(locale, metric.ratio)}`;
  const localizedSummary = data ? [
    `${c.marketState}: ${stateLabel(data.marketState, locale)}`,
    `${c.above50d}: ${ratio(data.summary.above50d)}`,
    ...(data.topImproving.length ? [`${c.leaders}: ${data.topImproving.map(row => row.sectorName ?? row.name).join(', ')}`] : []),
    ...(data.bottomWeakening.length ? [`${c.weakening}: ${data.bottomWeakening.map(row => row.sectorName ?? row.name).join(', ')}`] : []),
    ...(data.summary.averageRsi === null ? [] : [`${c.averageRsi}: ${number(locale, data.summary.averageRsi)}`]),
  ].join(' · ') : '';
  return <section className="rotation-page">
    <header className="rotation-header">
      <div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>
      <label>{c.scope}<select aria-label={c.scope} value={scope} onChange={event => changeScope(event.target.value as Scope)}>{scopes.map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>
    </header>
    {error ? error.code === 'SYS_NOT_FOUND' ? <><p role="status">{c.empty}</p><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : <><FailureNotice failure={error}/><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>
      <section className="rotation-meta" aria-label={c.asOf}>
        <p><span>{c.asOf}</span> <time dateTime={data.asOfDate}>{date(locale, data.asOfDate)}</time></p>
        <p><span>{c.summaryAsOf}</span> <time dateTime={data.summaryAsOfDate ?? undefined}>{date(locale, data.summaryAsOfDate)}</time></p>
        <p><span>{c.comparison}</span> {data.comparisonDate ? <time dateTime={data.comparisonDate}>{date(locale, data.comparisonDate)}</time> : c.noComparison}</p>
        <p className={data.dataQuality.isQualified ? 'rotation-quality rotation-quality-good' : 'rotation-quality'}>{data.dataQuality.isQualified ? c.qualified : c.partial}</p>
      </section>
      <section className="rotation-summary" aria-labelledby="rotation-summary-title">
        <div className="rotation-section-heading"><h2 id="rotation-summary-title">{c.currentSummary}</h2><p className="rotation-summary-text">{localizedSummary}</p></div>
        <dl className="rotation-cards">
          <div><dt>{c.marketState}</dt><dd>{stateLabel(data.marketState, locale)}</dd></div>
          <div><dt>{c.above20d}</dt><dd>{ratio(data.summary.above20d)}</dd></div>
          <div><dt>{c.above50d}</dt><dd>{ratio(data.summary.above50d)}</dd></div>
          <div><dt>{c.averageRsi}</dt><dd>{number(locale, data.summary.averageRsi)}</dd></div>
        </dl>
      </section>
      <section className="rotation-leadership" aria-label={`${c.leaders} and ${c.weakening}`}>
        <article><h2>{c.leaders}</h2>{data.topImproving.length ? <ol>{data.topImproving.map(row => <li key={row.symbol}><strong>{row.sectorName ?? row.name}</strong><span>{row.symbol} · {number(locale, row.rotationScoreDelta2W)} {c.change}</span></li>)}</ol> : <p className="muted">{c.noLeaders}</p>}</article>
        <article><h2>{c.weakening}</h2>{data.bottomWeakening.length ? <ol>{data.bottomWeakening.map(row => <li key={row.symbol}><strong>{row.sectorName ?? row.name}</strong><span>{row.symbol} · {number(locale, row.rotationScoreDelta2W)} {c.change}</span></li>)}</ol> : <p className="muted">{c.noWeakening}</p>}</article>
      </section>
      <section className="rotation-table-section" aria-labelledby="rotation-ranking-title">
        <div className="rotation-section-heading"><h2 id="rotation-ranking-title">{c.ranking}</h2><p className="muted">{data.dataQuality.actualSymbolCount}/{data.dataQuality.expectedSymbolCount}</p></div>
        <div className="rotation-table-scroll"><table data-testid="rotation-table"><caption className="sr-only">{c.ranking}</caption><thead><tr><th scope="col">{c.rank}</th><th scope="col">{c.symbol}</th><th scope="col">{c.name}</th><th scope="col">{c.price}</th><th scope="col">{c.score}</th><th scope="col">{c.change}</th><th scope="col">{c.rsi}</th><th scope="col">{c.signal}</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.symbol} data-testid="rotation-row"><th scope="row">{row.rotationRank ?? '—'}</th><td><strong>{row.symbol}</strong></td><td>{row.name}</td><td>{number(locale, row.lastPrice)}</td><td>{number(locale, row.rotationScore)}</td><td>{number(locale, row.rotationScoreDelta2W)}</td><td>{number(locale, row.rsi14)}</td><td><span className={`rotation-signal rotation-signal-${row.signalStatus}`}>{rowLabel(row, c, locale)}</span></td></tr>)}</tbody></table></div>
        {data.rows.length === 0 && <p className="muted">{c.empty}</p>}
      </section>
    </>}
  </section>;
}
