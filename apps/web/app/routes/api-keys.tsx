import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router';
import { createApiKeySchema, apiKeyListResponseSchema, apiKeyCreateResponseSchema, type apiKeySummarySchema } from '@diary/contracts/api-keys';
import type { z } from 'zod';
import { api, useUi } from '../ui';
import { signInPath, useSessionState } from '../session';
import { FailureNotice, apiFailure, type Failure } from '../api-error';
import '../trade-plan.css';
const copy = {
 en: { title:'API keys', intro:'Give an external agent access to the capabilities you choose.', back:'Preferences', label:'Key label', scope:'Access scope', diary:'Create diaries', agent:'Write agent research', diaryHint:'Create new diaries in your account. Cannot append to an existing diary.', agentHint:'Create diaries and publish stock research. Does not grant account administration.', create:'Create key', empty:'No API keys yet.', secret:'New API key', once:'Copy this key now. It cannot be displayed again after you close this message.', dismiss:'I have saved this key', copy:'Copy key', copied:'Key copied.', denied:'Copy was unavailable. Select the key and copy it manually.', revoke:'Revoke key', confirm:'Revoke this key? Clients using it will lose access.', active:'Active', revoked:'Revoked', unused:'Never used', last:'Last used', refresh:'Refresh keys', discard:'Leave without saving this key? You will need to revoke it and create a replacement.', uncertain:'Key creation was not confirmed. Refresh the list and revoke any newly created key before trying again.', invalid:'Enter a label of 1–100 characters.' },
 'zh-TW': { title:'API 金鑰', intro:'只授權外部 Agent 使用你選擇的功能。', back:'偏好設定', label:'金鑰名稱', scope:'授權範圍', diary:'建立日記', agent:'撰寫 Agent 研究', diaryHint:'在你的帳戶建立新日記，不能附加至既有日記。', agentHint:'建立日記及發佈股票研究，不包含帳戶管理權限。', create:'建立金鑰', empty:'目前沒有 API 金鑰。', secret:'新 API 金鑰', once:'請立即複製。關閉此訊息後，無法再次顯示完整金鑰。', dismiss:'我已儲存金鑰', copy:'複製金鑰', copied:'已複製金鑰。', denied:'無法自動複製，請選取金鑰後手動複製。', revoke:'撤銷金鑰', confirm:'撤銷此金鑰？使用它的 client 將失去存取權。', active:'有效', revoked:'已撤銷', unused:'尚未使用', last:'最後使用', refresh:'重新整理金鑰', discard:'尚未儲存金鑰就離開？你將需要撤銷它並重新建立。', uncertain:'未能確認建立結果。重試前請重新整理列表，並撤銷可能已建立的金鑰。', invalid:'名稱須為 1–100 個字元。' },
 'zh-CN': { title:'API 密钥', intro:'只授权外部 Agent 使用你选择的功能。', back:'偏好设置', label:'密钥名称', scope:'授权范围', diary:'创建日记', agent:'撰写 Agent 研究', diaryHint:'在你的账户创建新日记，不能附加至已有日记。', agentHint:'创建日记及发布股票研究，不包含账户管理权限。', create:'创建密钥', empty:'目前没有 API 密钥。', secret:'新 API 密钥', once:'请立即复制。关闭此消息后，无法再次显示完整密钥。', dismiss:'我已保存密钥', copy:'复制密钥', copied:'已复制密钥。', denied:'无法自动复制，请选取密钥后手动复制。', revoke:'撤销密钥', confirm:'撤销此密钥？使用它的 client 将失去访问权。', active:'有效', revoked:'已撤销', unused:'尚未使用', last:'最后使用', refresh:'刷新密钥', discard:'尚未保存密钥就离开？你将需要撤销它并重新创建。', uncertain:'未能确认创建结果。重试前请刷新列表，并撤销可能已创建的密钥。', invalid:'名称须为 1–100 个字符。' },
};
export default function ApiKeys() {
 const { locale, t } = useUi(), c = copy[locale], session = useSessionState();
 const [keys, setKeys] = useState<z.infer<typeof apiKeySummarySchema>[] | null>(null), [error, setError] = useState<Failure | null>(null), [writeError, setWriteError] = useState<Failure | null>(null);
 const [label, setLabel] = useState(''), [scope, setScope] = useState<'DIARY_CREATE'|'AGENT_WRITE'>('DIARY_CREATE'), [secret, setSecret] = useState<{ id: string; raw: string } | null>(null), [notice, setNotice] = useState(''), [pending, setPending] = useState(false), [attempt, refresh] = useState(0);
 const request = useRef<AbortController | null>(null), translate = useRef(t); translate.current = t;
 const blocker = useBlocker(() => !!secret && session.authenticated === true);
 useEffect(() => { if (blocker.state === 'blocked') { if (window.confirm(c.discard)) blocker.proceed(); else blocker.reset(); } }, [blocker, c.discard]);
 useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (secret) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload); }, [secret]);
 useEffect(() => () => request.current?.abort(), []);
 useEffect(() => {
  const controller = new AbortController(); setError(null);
  api.GET('/api/api-keys', { signal: controller.signal }).then(result => { if (controller.signal.aborted) return; const parsed = apiKeyListResponseSchema.safeParse(result.data); if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, translate.current('failed'))); else setKeys(parsed.data.keys); }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
  return () => controller.abort();
 }, [attempt]);
 async function mutate(id?: string) {
  if (request.current) return;
  if (id && !window.confirm(c.confirm)) return;
  const parsed = createApiKeySchema.safeParse({ label, scope });
  if (!id && !parsed.success) { setWriteError({ message: c.invalid, fields: [] }); return; }
  const controller = new AbortController(); request.current = controller; setPending(true); setWriteError(null); setNotice('');
  try {
   if (id) {
    const result = await api.DELETE('/api/api-keys/{id}', { params: { path: { id } }, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!result.response.ok && result.response.status !== 404) { setWriteError(apiFailure(result.error, t('failed'))); return; }
    if (secret?.id === id) setSecret(null);
   } else if (parsed.success) {
    const result = await api.POST('/api/api-keys', { body: parsed.data, signal: controller.signal });
    if (controller.signal.aborted) return;
    const created = apiKeyCreateResponseSchema.safeParse(result.data);
    if (!result.response.ok || !created.success) { setWriteError(apiFailure(result.error, c.uncertain)); return; }
    setSecret({ id: created.data.key.id, raw: created.data.rawKey }); setLabel('');
   }
   refresh(value => value + 1);
  } catch { if (!controller.signal.aborted) setWriteError(apiFailure(null, id ? t('connection') : c.uncertain)); }
  finally { if (!controller.signal.aborted) { request.current = null; setPending(false); } }
 }
 return <section className="plan-page"><header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link to="/settings">{c.back}</Link></header>
 {error ? <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/settings/api-keys')}>{t('login')}</Link>}<button onClick={() => refresh(n => n + 1)}>{t('retry')}</button></> : keys === null ? <p role="status">{t('loading')}</p> : <>
 <form className="plan-form" onSubmit={event => { event.preventDefault(); void mutate(); }}><fieldset disabled={pending || !!secret}><div className="plan-grid"><label>{c.label}<input required maxLength={100} value={label} onChange={event => setLabel(event.target.value)}/></label><label>{c.scope}<select value={scope} onChange={event => setScope(event.target.value as typeof scope)}><option value="DIARY_CREATE">{c.diary}</option><option value="AGENT_WRITE">{c.agent}</option></select></label></div><p>{scope === 'DIARY_CREATE' ? c.diaryHint : c.agentHint}</p><button>{pending ? t('pending') : c.create}</button></fieldset></form>
 {secret && <section aria-label={c.secret}><h2>{c.secret}</h2><p>{c.once}</p><label>{c.secret}<textarea readOnly rows={3} value={secret.raw} onFocus={event => event.currentTarget.select()} style={{ width: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere' }}/></label><div className="actions"><button className="secondary" onClick={() => { void (async () => { try { await navigator.clipboard.writeText(secret.raw); setNotice(c.copied); } catch { setNotice(c.denied); } })(); }}>{c.copy}</button><button className="secondary" onClick={() => { setSecret(null); setNotice(''); }}>{c.dismiss}</button></div></section>}
 <FailureNotice failure={writeError}/>{notice && <p role="status">{notice}</p>}<button className="secondary" disabled={pending} onClick={() => refresh(n => n + 1)}>{c.refresh}</button>
 {!keys.length ? <p>{c.empty}</p> : <ul className="plan-list">{keys.map(key => <li key={key.id} data-testid="api-key"><h2>{key.label}</h2><p><code>{key.keyPrefix}…</code> · {key.scope === 'DIARY_CREATE' ? c.diary : c.agent} · {key.revokedAt ? c.revoked : c.active}</p><p>{key.lastUsedAt ? <>{c.last}: <time dateTime={key.lastUsedAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(key.lastUsedAt))} UTC</time></> : c.unused}</p>{!key.revokedAt && <button className="secondary" disabled={pending} onClick={() => void mutate(key.id)}>{c.revoke}</button>}</li>)}</ul>}
 </>}</section>;
}
