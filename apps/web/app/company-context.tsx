import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { companyHubResponseSchema, type CompanyHubResponse } from '@diary/contracts/company-hub';
import { api, useUi } from './ui';
import { apiFailure, FailureNotice, type Failure } from './api-error';
import { thesisCopy } from './thesis-copy';
import './company-context.css';
const copy = {
  en: { title: 'Your company research', position: 'Your position', current: 'Current view', original: 'Original decisions', review: 'Later reviews', empty: 'Nothing recorded yet.', edit: 'Open thesis and reviews', diary: 'Read diary', reviewDiary: 'Review diary', quantity: 'Quantity', averageCost: 'Average cost', totalCost: 'Cost basis', marketValue: 'Market value', concentration: 'Portfolio share · cost basis', missing: 'Quote unavailable. Your research and cost basis are still available.', held: 'Currently held', closed: 'Position closed', research_only: 'Research only', untracked: 'Not tracked', hint: 'Recent context, up to ten original decisions and ten thesis reviews. Notes remain editable; evidence preserves the recorded event.' },
  'zh-TW': { title: '你的公司研究', position: '你的持倉', current: '目前觀點', original: '原始決策', review: '事後複盤', empty: '尚未有記錄。', edit: '開啟論點與複盤', diary: '閱讀日記', reviewDiary: '複盤日記', quantity: '數量', averageCost: '平均成本', totalCost: '成本', marketValue: '市值', concentration: '佔投資組合比例・按成本', missing: '報價暫時不可用，研究記錄與成本仍然可讀。', held: '目前持有', closed: '已平倉', research_only: '僅研究', untracked: '未追蹤', hint: '顯示最近最多十筆原始決策及十次論點複盤。筆記可持續修改，證據保留當時事件。' },
  'zh-CN': { title: '你的公司研究', position: '你的持仓', current: '目前观点', original: '原始决策', review: '事后复盘', empty: '尚无记录。', edit: '打开论点与复盘', diary: '阅读日记', reviewDiary: '复盘日记', quantity: '数量', averageCost: '平均成本', totalCost: '成本', marketValue: '市值', concentration: '占投资组合比例・按成本', missing: '报价暂时不可用，研究记录与成本仍然可读。', held: '目前持有', closed: '已平仓', research_only: '仅研究', untracked: '未跟踪', hint: '显示最近最多十条原始决策及十次论点复盘。笔记可持续修改，证据保留当时事件。' },
};
export function CompanyContext({ symbol }: { symbol: string }) {
  const { locale, t } = useUi(), c = copy[locale], labels = thesisCopy[locale];
  const [data, setData] = useState<CompanyHubResponse | null>(null), [error, setError] = useState<Failure | null>(null), [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    api.GET('/api/stocks/{symbol}/hub', { params: { path: { symbol } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = companyHubResponseSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setData(parsed.data); else setError(apiFailure(result.error, t('failed')));
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, t('connection'))); });
    return () => controller.abort();
  }, [symbol, attempt]);
  const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(value);
  return <section className="company-context" aria-label={c.title}><h2>{c.title}</h2><p>{c.hint}</p>{error ? <><FailureNotice failure={error} id="company-context-error"/><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>
    <section aria-label={c.position}><h3>{c.position} · {c[data.position.state]}</h3>{data.position.quoteStatus === 'missing' && <p role="status">{c.missing}</p>}
      <dl className="market-metrics">{(['quantity', 'averageCost', 'totalCost', 'marketValue'] as const).map(key => <div key={key}><dt>{c[key]}</dt><dd data-testid={`company-${key}`}>{number(data.position[key])}</dd></div>)}<div><dt>{c.concentration}</dt><dd>{number(data.position.concentrationPct)}{data.position.concentrationPct !== null && '%'}</dd></div></dl>
      {data.company.currency && <p>{data.company.currency}</p>}
    </section>
    <section aria-label={c.current}><h3>{c.current}</h3>{data.thesis ? <><p>{labels[data.thesis.health]}</p><p className="company-context-text">{data.thesis.summary}</p><p className="company-context-text">{data.thesis.whyIOwnIt}</p></> : <p>{c.empty}</p>}<Link to={`/stocks/${encodeURIComponent(symbol)}/thesis`}>{c.edit}</Link></section>
    <section aria-label={c.original}><h3>{c.original}</h3>{data.relatedDiaries.length ? <ul className="company-context-list">{data.relatedDiaries.map(diary => <li key={diary.id}><time dateTime={diary.date}>{diary.date}</time><Link to={`/diaries/${diary.id}`}>{diary.title}</Link><Link to={`/diaries/${diary.id}/review`} aria-label={`${c.reviewDiary}: ${diary.title}`}>{c.reviewDiary}</Link></li>)}</ul> : <p>{c.empty}</p>}</section>
    <section aria-label={c.review}><h3>{c.review}</h3>{data.reviews.length ? <ul className="company-context-list">{data.reviews.map(review => <li key={review.id}><time dateTime={review.reviewedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(review.reviewedAt))} UTC</time><span>{labels[review.outcome]} · {labels[review.portfolioDecision]}</span><Link to={`/stocks/${encodeURIComponent(symbol)}/thesis#review-${review.id}`}>{c.edit}</Link></li>)}</ul> : <p>{c.empty}</p>}</section>
  </>}</section>;
}
