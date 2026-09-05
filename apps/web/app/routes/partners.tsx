import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { invitePartnerSchema, partnerListResponseSchema, type PartnerLinkResponse } from '@diary/contracts/partners';
import { api, useUi } from '../ui';
import { signInPath } from '../session';
import { FailureNotice, apiFailure, type Failure } from '../api-error';
import '../trade-plan.css';
const copy = {
 en: { compare: 'Compare diaries', title: 'Partners', intro: 'Connect with another account. Each of you chooses what to share.', email: 'Partner email', invite: 'Invite partner', incoming: 'Invitation received', outgoing: 'Awaiting acceptance', connected: 'Connected', accept: 'Accept invitation', remove: 'Remove connection', confirm: 'Remove this invitation or connection? Sharing through this connection will stop.', empty: 'No partners yet.', mine: 'What I share', theirs: 'What they share', diaries: 'Diaries', notes: 'Stock notes', on: 'Shared', off: 'Private', startDiaries: 'Share my diaries', stopDiaries: 'Stop sharing my diaries', startNotes: 'Share my stock notes', stopNotes: 'Stop sharing my stock notes', updated: 'Partner settings updated.', invalid: 'Enter a valid partner email.', privacy: 'Acceptance keeps sharing off. Turn on each type only when you want your partner to read it.', refresh: 'Refresh partners' },
 'zh-TW': { compare: '比較日記', title: '伙伴', intro: '與另一個帳戶連結，雙方各自選擇分享內容。', email: '伙伴電郵', invite: '邀請伙伴', incoming: '收到邀請', outgoing: '等待接受', connected: '已連結', accept: '接受邀請', remove: '解除關係', confirm: '移除此邀請或關係？透過此關係的分享將會停止。', empty: '目前沒有伙伴。', mine: '我分享的內容', theirs: '對方分享的內容', diaries: '日記', notes: '股票筆記', on: '已分享', off: '私人', startDiaries: '分享我的日記', stopDiaries: '停止分享我的日記', startNotes: '分享我的股票筆記', stopNotes: '停止分享我的股票筆記', updated: '伙伴設定已更新。', invalid: '請輸入有效的伙伴電郵。', privacy: '接受邀請後仍預設不分享。只有希望對方閱讀時，才開啟相應類型。', refresh: '重新整理伙伴' },
 'zh-CN': { compare: '比较日记', title: '伙伴', intro: '与另一个账户连接，双方各自选择分享内容。', email: '伙伴邮箱', invite: '邀请伙伴', incoming: '收到邀请', outgoing: '等待接受', connected: '已连接', accept: '接受邀请', remove: '解除关系', confirm: '移除此邀请或关系？通过此关系的分享将会停止。', empty: '目前没有伙伴。', mine: '我分享的内容', theirs: '对方分享的内容', diaries: '日记', notes: '股票笔记', on: '已分享', off: '私人', startDiaries: '分享我的日记', stopDiaries: '停止分享我的日记', startNotes: '分享我的股票笔记', stopNotes: '停止分享我的股票笔记', updated: '伙伴设置已更新。', invalid: '请输入有效的伙伴邮箱。', privacy: '接受邀请后仍默认不分享。只有希望对方阅读时，才开启相应类型。', refresh: '刷新伙伴' },
};
export default function Partners() {
 const { locale, t } = useUi(), c = copy[locale];
 const [rows, setRows] = useState<PartnerLinkResponse[] | null>(null), [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null), [attempt, retry] = useState(0);
 const [email, setEmail] = useState(''), [pending, setPending] = useState(false), [saved, setSaved] = useState(false);
 const mutation = useRef<AbortController | null>(null), translate = useRef(t); translate.current = t;
 useEffect(() => () => mutation.current?.abort(), []);
 useEffect(() => {
  const controller = new AbortController(); setError(null);
  api.GET('/api/partners', { signal: controller.signal }).then(result => {
   if (controller.signal.aborted) return; const parsed = partnerListResponseSchema.safeParse(result.data);
   if (!result.response.ok || !parsed.success) { setError(apiFailure(result.error, translate.current('failed'))); return; }
   setRows(parsed.data.links);
  }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
  return () => controller.abort();
 }, [attempt]);
 async function perform(operation: (signal: AbortSignal) => Promise<{ response: Response; error?: unknown }>, invited = false) {
  if (pending) return; const controller = new AbortController(); mutation.current = controller; setPending(true); setSaved(false); setWriteError(null);
  try {
   const result = await operation(controller.signal); if (controller.signal.aborted) return;
   if (!result.response.ok) { setWriteError(apiFailure(result.error, t('failed'))); return; }
   if (invited) setEmail(''); setSaved(true); retry(value => value + 1);
  } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, t('connection'))); }
  finally { if (!controller.signal.aborted) setPending(false); }
 }
 function invite(event: FormEvent) { event.preventDefault(); const parsed = invitePartnerSchema.safeParse({ partnerEmail: email }); if (!parsed.success) { setWriteError({ message: c.invalid, fields: [] }); return; } void perform(signal => api.POST('/api/partners', { body: parsed.data, signal }), true); }
 function share(row: PartnerLinkResponse, diaries: boolean) { void perform(signal => api.PUT('/api/partners/{id}/sharing', { params: { path: { id: row.id } }, body: diaries ? { shareDiaries: !row.selfSharesDiaries } : { shareStockNotes: !row.selfSharesStockNotes }, signal })); }
 return <section className="plan-page"><h1>{c.title}</h1><p className="lede">{c.intro}</p><p>{c.privacy}</p>{error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/partners')}>{t('login')}</Link>}<button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : rows === null ? <p role="status">{t('loading')}</p> : <>
 <form className="plan-form" onSubmit={invite}><label>{c.email}<input type="email" required maxLength={255} disabled={pending} value={email} onChange={event => setEmail(event.target.value)}/></label><button style={{ marginTop: 20 }} disabled={pending}>{pending ? t('pending') : c.invite}</button></form><FailureNotice failure={writeError}/>{saved && <p role="status">{c.updated}</p>}<button className="secondary" disabled={pending} onClick={() => retry(value => value + 1)}>{c.refresh}</button>
 {!rows.length ? <p>{c.empty}</p> : <ul className="plan-list">{rows.map(row => <li key={row.id} data-testid="partner"><h2 style={{ overflowWrap: 'anywhere' }}>{row.partner.name || row.partner.email}</h2>{row.partner.name && <p style={{ overflowWrap: 'anywhere' }}>{row.partner.email}</p>}<p>{row.status === 'connected' ? c.connected : row.pendingIncoming ? c.incoming : c.outgoing}</p>{row.status === 'connected' && <><Link to={`/partners/compare?partnerId=${row.partner.id}`}>{c.compare}</Link><h3>{c.mine}</h3><p>{c.diaries}: {row.selfSharesDiaries ? c.on : c.off} · {c.notes}: {row.selfSharesStockNotes ? c.on : c.off}</p><div className="actions"><button className="secondary" disabled={pending} onClick={() => share(row, true)}>{row.selfSharesDiaries ? c.stopDiaries : c.startDiaries}</button><button className="secondary" disabled={pending} onClick={() => share(row, false)}>{row.selfSharesStockNotes ? c.stopNotes : c.startNotes}</button></div><h3>{c.theirs}</h3><p data-testid="partner-sharing">{c.diaries}: {row.partnerSharesDiaries ? c.on : c.off} · {c.notes}: {row.partnerSharesStockNotes ? c.on : c.off}</p></>}<div className="actions">{row.pendingIncoming && <button disabled={pending} onClick={() => void perform(signal => api.POST('/api/partners/{id}/accept', { params: { path: { id: row.id } }, signal }))}>{c.accept}</button>}<button className="secondary" disabled={pending} onClick={() => { if (window.confirm(c.confirm)) void perform(signal => api.DELETE('/api/partners/{id}', { params: { path: { id: row.id } }, signal })); }}>{c.remove}</button></div></li>)}</ul>}
 </>}</section>;
}
