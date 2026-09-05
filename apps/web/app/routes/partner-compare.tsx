import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { partnerCompareResponseSchema } from '@diary/contracts/partners';
import type { z } from 'zod';
import { api, useUi } from '../ui';
import { signInPath } from '../session';
import { FailureNotice, apiFailure, type Failure } from '../api-error';
import { Markdown } from '../markdown';
import '../trade-plan.css';
import '../partner-compare.css';
const copy = {
 en: { title: 'Pair View', intro: 'Two perspectives, one day at a time.', manage: 'Manage partners', partner: 'Partner', mine: 'My diary', theirs: 'Partner diary', empty: 'No diary on this day.', private: 'Your partner has not shared diaries.', none: 'Connect with a partner to compare diaries.', noDays: 'No diaries in this comparison yet.', limit: 'Recent days', refresh: 'Refresh comparison', dates: 'Dates follow each diary’s calendar day. Shared entries are read only.' },
 'zh-TW': { title: '日記對照', intro: '逐日閱讀，理解彼此的觀點。', manage: '管理伙伴', partner: '伙伴', mine: '我的日記', theirs: '伙伴日記', empty: '當日沒有日記。', private: '伙伴尚未分享日記。', none: '連結伙伴後即可比較日記。', noDays: '目前沒有可比較的日記。', limit: '最近日數', refresh: '重新整理對照', dates: '按日記的曆日對齊。共享內容僅供閱讀。' },
 'zh-CN': { title: '日记对照', intro: '逐日阅读，理解彼此的观点。', manage: '管理伙伴', partner: '伙伴', mine: '我的日记', theirs: '伙伴日记', empty: '当日没有日记。', private: '伙伴尚未分享日记。', none: '连接伙伴后即可比较日记。', noDays: '目前没有可比较的日记。', limit: '最近日数', refresh: '刷新对照', dates: '按日记的历日对齐。共享内容仅供阅读。' },
};
export default function PartnerCompare() {
 const { locale, t } = useUi(), c = copy[locale], [params, setParams] = useSearchParams();
 const partnerId = params.get('partnerId') ?? '', [limit, setLimit] = useState(20), [attempt, refresh] = useState(0);
 const [data, setData] = useState<z.infer<typeof partnerCompareResponseSchema> | null>(null), [error, setError] = useState<Failure | null>(null);
 const translate = useRef(t); translate.current = t;
 useEffect(() => {
  const controller = new AbortController(); setData(null); setError(null);
  api.GET('/api/partners/compare', { params: { query: { ...(partnerId ? { partnerId } : {}), limit } }, signal: controller.signal }).then(result => {
   if (controller.signal.aborted) return;
   const parsed = partnerCompareResponseSchema.safeParse(result.data);
   if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, translate.current('failed'))); else setData(parsed.data);
  }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
  return () => controller.abort();
 }, [partnerId, limit, attempt]);
 useEffect(() => { const focused = () => { setData(null); refresh(n => n + 1); }; window.addEventListener('focus', focused); return () => window.removeEventListener('focus', focused); }, []);
 const selected = data?.links.find(row => row.partner.id === data.selectedPartnerId);
 return <section className="plan-page pair-page"><header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link to="/partners">{c.manage}</Link></header><p>{c.dates}</p>
 <button className="secondary" onClick={() => { setData(null); refresh(n => n + 1); }}>{c.refresh}</button>
 {error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath(`/partners/compare${partnerId ? `?partnerId=${partnerId}` : ''}`)}>{t('login')}</Link>}<button onClick={() => refresh(n => n + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>
 {!data.partner ? <p>{c.none}</p> : <><div className="plan-filters"><label>{c.partner}<select value={data.selectedPartnerId ?? ''} onChange={event => { setData(null); setParams({ partnerId: event.target.value }); }}>{data.links.filter(row => row.status === 'connected').map(row => <option key={row.id} value={row.partner.id}>{row.partner.name || `${c.partner} ${row.partner.id}`}</option>)}</select></label><label>{c.limit}<select value={limit} onChange={event => { setData(null); setLimit(Number(event.target.value)); }}>{[20,40,60].map(value => <option key={value}>{value}</option>)}</select></label></div>
 {!selected?.partnerSharesDiaries && <p role="status">{c.private}</p>}
 {!data.compareDays.length ? <p>{c.noDays}</p> : <div>{data.compareDays.map(day => <section className="pair-day" key={day.dateKey} data-testid="compare-day"><h2><time dateTime={day.dateKey}>{day.dateKey}</time></h2><div className="pair-columns">{([['owner', day.ownerDiary], ['partner', day.partnerDiary]] as const).map(([side, diary]) => <article key={side} data-testid={`${side}-diary`}><p className="pair-side">{side === 'owner' ? c.mine : data.partner?.name || c.theirs}</p>{diary ? <><h3>{diary.title}</h3><p>{diary.createdByLabel || diary.createdVia}{diary.tags.length > 0 ? ` · ${diary.tags.join(' · ')}` : ''}</p><Markdown>{diary.content}</Markdown></> : <p>{side === 'partner' && !selected?.partnerSharesDiaries ? c.private : c.empty}</p>}</article>)}</div></section>)}</div>}
 </>}
 </>}
 </section>;
}
