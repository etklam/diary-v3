import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { portfolioAttentionResponseSchema, type PortfolioAttentionResponse } from '@diary/contracts/portfolio-attention';
import { api, useUi } from './ui';
import { apiFailure, FailureNotice, type Failure } from './api-error';
import './company-context.css';
import './portfolio-exposure.css';
const copy = {
  en: { title: 'Needs your attention', empty: 'No items need attention under these rules.', hint: 'Up to 50 items, ordered by priority. Concentration is based on priced market value.', partial: 'Some positions have no quote. Concentration covers priced positions only; review reminders still include all active holdings.', invalidated_thesis_while_held: 'Held thesis invalidated', overdue_thesis_review: 'Thesis review overdue', overdue_diary_review: 'Diary review overdue', position_concentration: 'Position concentration', missing_thesis: 'Add an active thesis', open: 'Open', due: 'Due', asof: 'Checked at' },
  'zh-TW': { title: '需要留意', empty: '目前沒有符合這些規則的待處理項目。', hint: '按優先次序顯示最多 50 筆。集中度按已有報價的市值計算。', partial: '部分持倉缺報價。集中度只涵蓋已有報價的持倉，複盤提醒仍涵蓋全部持倉。', invalidated_thesis_while_held: '仍持有的論點已失效', overdue_thesis_review: '論點複盤逾期', overdue_diary_review: '日記複盤逾期', position_concentration: '持倉集中', missing_thesis: '補上啟用論點', open: '開啟', due: '到期', asof: '檢查時間' },
  'zh-CN': { title: '需要留意', empty: '目前没有符合这些规则的待处理项目。', hint: '按优先顺序显示最多 50 条。集中度按已有报价的市值计算。', partial: '部分持仓缺报价。集中度只涵盖已有报价的持仓，复盘提醒仍涵盖全部持仓。', invalidated_thesis_while_held: '仍持有的论点已失效', overdue_thesis_review: '论点复盘逾期', overdue_diary_review: '日记复盘逾期', position_concentration: '持仓集中', missing_thesis: '补上启用论点', open: '打开', due: '到期', asof: '检查时间' },
};
export function PortfolioAttention() {
  const { locale, t } = useUi(), c = copy[locale];
  const [data, setData] = useState<PortfolioAttentionResponse | null>(null), [error, setError] = useState<Failure | null>(null), [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    api.GET('/api/portfolio/attention', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = portfolioAttentionResponseSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setData(parsed.data); else setError(apiFailure(result.error, t('failed')));
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, t('connection'))); });
    return () => controller.abort();
  }, [attempt]);
  const instant = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
  return <section className="portfolio-exposure" aria-label={c.title}><h2>{c.title}</h2><p>{c.hint}</p>{error ? <><FailureNotice failure={error} id="attention-error"/><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>{!data.coverage.complete && <p role="status">{c.partial}</p>}{!data.items.length ? <p>{c.empty}</p> : <ul className="company-context-list">{data.items.map(item => <li key={item.id} data-testid="attention-item"><strong>{c[item.reason]}</strong><span>{item.symbol ?? item.evidence.title}</span>{item.evidence.concentrationPct !== undefined && item.evidence.concentrationPct !== null && <span>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.evidence.concentrationPct)}%</span>}{item.evidence.reviewDueAt && <time dateTime={item.evidence.reviewDueAt}>{c.due}: {instant(item.evidence.reviewDueAt)}</time>}<Link to={item.targetKind === 'diary' ? `/diaries/${item.targetId}/review` : item.reason === 'position_concentration' ? `/stocks/${encodeURIComponent(item.targetId)}` : `/stocks/${encodeURIComponent(item.targetId)}/thesis`}>{c.open}</Link></li>)}</ul>}<p>{c.asof}: <time dateTime={data.asOf}>{instant(data.asOf)}</time></p></>}</section>;
}
