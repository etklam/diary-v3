import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { partnerCompareResponseSchema } from '@diary/contracts/partners';
import type { z } from 'zod';
import { api, useUi } from '../ui';
import { signInPath } from '../session';
import { FailureNotice, apiFailure, type Failure } from '../api-error';
import { Markdown } from '../markdown';
import { TimelineModeSwitch } from '../timeline-mode-switch';
import '../trade-plan.css';
import '../timeline.css';
import '../partner-compare.css';
const copy = {
 en: { title: 'Pair View', intro: 'Two perspectives, one day at a time.', manage: 'Manage partners', partner: 'Partner', mine: 'My diary', theirs: 'Partner diary', empty: 'No diary on this day.', private: 'Your partner has not shared diaries.', none: 'Connect with a partner to compare diaries.', pending: 'An invitation is still waiting for acceptance. Comparison opens once you are connected.', removed: 'This partner connection is no longer available. It may have been removed or sharing was withdrawn.', noDays: 'No diaries in this comparison yet.', limit: 'Recent days', refresh: 'Refresh comparison', dates: 'Dates follow each diary’s calendar day. Shared entries are read only.', read: 'Read diary', edit: 'Edit diary', expand: 'Show all of this entry', collapse: 'Show less', source: { WEB: 'Web', API_KEY: 'API key', TELEGRAM_BOT: 'Telegram' } },
 'zh-TW': { title: '日記對照', intro: '逐日閱讀，理解彼此的觀點。', manage: '管理伙伴', partner: '伙伴', mine: '我的日記', theirs: '伙伴日記', empty: '當日沒有日記。', private: '伙伴尚未分享日記。', none: '連結伙伴後即可比較日記。', pending: '邀請仍在等待接受。連結後即可比較日記。', removed: '此伙伴關係已無法使用。可能已被解除，或分享已被撤回。', noDays: '目前沒有可比較的日記。', limit: '最近日數', refresh: '重新整理對照', dates: '按日記的曆日對齊。共享內容僅供閱讀。', read: '閱讀日記', edit: '編輯日記', expand: '展開全部內容', collapse: '收合內容', source: { WEB: '網頁', API_KEY: 'API 金鑰', TELEGRAM_BOT: 'Telegram' } },
 'zh-CN': { title: '日记对照', intro: '逐日阅读，理解彼此的观点。', manage: '管理伙伴', partner: '伙伴', mine: '我的日记', theirs: '伙伴日记', empty: '当日没有日记。', private: '伙伴尚未分享日记。', none: '连接伙伴后即可比较日记。', pending: '邀请仍在等待接受。连接后即可比较日记。', removed: '此伙伴关系已无法使用。可能已被解除，或分享已被撤回。', noDays: '目前没有可比较的日记。', limit: '最近日数', refresh: '刷新对照', dates: '按日记的历日对齐。共享内容仅供阅读。', read: '阅读日记', edit: '编辑日记', expand: '展开全部内容', collapse: '收起内容', source: { WEB: '网页', API_KEY: 'API 密钥', TELEGRAM_BOT: 'Telegram' } },
};
type CompareData = z.infer<typeof partnerCompareResponseSchema>;
type PairDiary = NonNullable<CompareData['compareDays'][number]['ownerDiary']>;
const COLLAPSED_CHARS = 2000;
function sourceLabel(c: (typeof copy)['en'], diary: PairDiary) {
 return diary.createdByLabel || c.source[diary.createdVia];
}
/** Long shared entries stay collapsed until asked for, so a 60-day page never renders dozens of full documents at once. */
function PairBody({ content, c }: { content: string; c: (typeof copy)['en'] }) {
 const [expanded, setExpanded] = useState(false);
 const long = content.length > COLLAPSED_CHARS;
 return <>
  <Markdown>{expanded || !long ? content : `${content.slice(0, COLLAPSED_CHARS)}…`}</Markdown>
  {long && <button type="button" className="secondary pair-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? c.collapse : c.expand}</button>}
 </>
}
export default function PartnerCompare() {
 const { locale, t } = useUi(), c = copy[locale], [params, setParams] = useSearchParams();
 const partnerId = params.get('partnerId') ?? '', limitParam = params.get('limit'), limit = limitParam === '40' || limitParam === '60' ? Number(limitParam) : 20;
 const [data, setData] = useState<CompareData | null>(null), [error, setError] = useState<Failure | null>(null), [attempt, refresh] = useState(0);
 const translate = useRef(t); translate.current = t;
 const query = params.toString();
 useEffect(() => {
  const controller = new AbortController(); setData(null); setError(null);
  api.GET('/api/partners/compare', { params: { query: { ...(partnerId ? { partnerId } : {}), limit } }, signal: controller.signal }).then(result => {
   if (controller.signal.aborted) return;
   const parsed = partnerCompareResponseSchema.safeParse(result.data);
   if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, translate.current('failed'))); else setData(parsed.data);
  }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
  return () => controller.abort();
 }, [partnerId, limit, attempt]);
 // Focus revalidation re-runs the bounded query, so revoked sharing drops already-rendered content.
 useEffect(() => { const focused = () => { setData(null); refresh(value => value + 1); }; window.addEventListener('focus', focused); return () => window.removeEventListener('focus', focused); }, []);
 const selected = data?.links.find(row => row.partner.id === data.selectedPartnerId);
 const pendingLink = data?.links.find(row => row.pendingIncoming || row.pendingOutgoing);
 const setQuery = (next: { partnerId?: string; limit?: string }) => setParams({ ...(next.partnerId ? { partnerId: next.partnerId } : {}), ...(next.limit ? { limit: next.limit } : {}) });
 return <section className="plan-page pair-page"><header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link to="/partners">{c.manage}</Link></header><TimelineModeSwitch mode="partner"/><p>{c.dates}</p>
 <button className="secondary" onClick={() => refresh(value => value + 1)}>{c.refresh}</button>
 {error ? error.code === 'PARTNER_LINK_PENDING' ? <p role="status" data-testid="compare-pending">{c.pending}</p> : error.code === 'PARTNER_LINK_NOT_FOUND' ? <div data-testid="compare-removed"><p role="status">{c.removed}</p><button onClick={() => refresh(value => value + 1)}>{c.refresh}</button></div> : <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath(`/partners/compare${query ? `?${query}` : ''}`)}>{t('login')}</Link>}<button onClick={() => refresh(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>
 {!data.partner ? pendingLink ? <p role="status" data-testid="compare-pending">{c.pending}</p> : <p>{c.none}</p> : <><div className="plan-filters"><label>{c.partner}<select value={data.selectedPartnerId ?? ''} onChange={event => setQuery({ partnerId: event.target.value, ...(limitParam ? { limit: limitParam } : {}) })}>{data.links.filter(row => row.status === 'connected').map(row => <option key={row.id} value={row.partner.id}>{row.partner.name || `${c.partner} ${row.partner.id}`}</option>)}</select></label><label>{c.limit}<select value={limit} onChange={event => setQuery({ partnerId, ...(Number(event.target.value) === 20 ? {} : { limit: event.target.value }) })}>{[20,40,60].map(value => <option key={value}>{value}</option>)}</select></label></div>
 {!selected?.partnerSharesDiaries && <p role="status">{c.private}</p>}
 {!data.compareDays.length ? <p>{c.noDays}</p> : <div>{data.compareDays.map(day => <section className="pair-day" key={day.dateKey} data-testid="compare-day"><h2><time dateTime={day.dateKey}>{day.dateKey}</time></h2><div className="pair-columns">{([['owner', day.ownerDiary], ['partner', day.partnerDiary]] as const).map(([side, diary]) => <article key={side} data-testid={`${side}-diary`}><p className="pair-side">{side === 'owner' ? c.mine : data.partner?.name || c.theirs}</p>{diary ? <><h3>{diary.title}</h3><p className="pair-meta">{sourceLabel(c, diary)}{diary.tags.length > 0 ? ` · ${diary.tags.join(' · ')}` : ''}</p><PairBody content={diary.content} c={c}/>{side === 'owner' && <p className="pair-actions"><Link to={`/diaries/${diary.id}`}>{c.read}</Link>{' · '}<Link to={`/diaries/${diary.id}/edit`}>{c.edit}</Link></p>}</> : <p>{side === 'partner' && !selected?.partnerSharesDiaries ? c.private : c.empty}</p>}</article>)}</div></section>)}</div>}
 </>}
 </>}
 </section>;
}
