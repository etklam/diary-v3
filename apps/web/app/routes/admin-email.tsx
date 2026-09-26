import {
  adminEmailSettingsResponseSchema,
  adminEmailTestResponseSchema,
} from '@diary/contracts/account-email'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useOutletContext } from 'react-router'
import type { ShellOutletContext } from '../root'
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error'
import { api, useUi } from '../ui'
import './admin-email.css'

const copy = {
  'zh-TW': {
    title: '電郵設定', intro: '設定可選的 SMTP 傳送，管理註冊驗證與密碼復原電郵。', back: '偏好設定', loading: '正在載入電郵設定…', retry: '重試', denied: '你沒有管理電郵設定的權限。', failed: '電郵設定暫時無法使用。', connection: '暫時無法連線。請稍後再試。', enabled: '已啟用', disabled: '已停用', state: '服務狀態', enabledEffect: '新帳戶需要電郵驗證，並可使用密碼復原。', disabledEffect: '新帳戶可直接註冊，密碼復原電郵不會寄出。', enable: '啟用電郵', disable: '停用電郵', enableHint: '啟用前，必須先儲存設定並成功寄出測試電郵。', disableConfirm: '停用電郵後，新使用者可直接註冊，新的密碼復原電郵會停止寄出。已接受的電郵不能收回，已發出的連結會在到期前仍然有效。確定要停用嗎？', settings: '已儲存的 SMTP 設定', connectionFields: '連線', host: '主機', port: '連接埠', security: '加密', tls: 'TLS', starttls: 'STARTTLS', none: '無加密', auth: '驗證', authEnabled: '使用 SMTP 驗證', username: '使用者名稱', password: '密碼', passwordConfigured: '目前密碼狀態', configured: '已設定', notConfigured: '未設定', retain: '保留現有密碼', replace: '更換密碼', clearPassword: '清除密碼', retainHint: '密碼不會載入或顯示；保留現有密碼時不會送出密碼。', sender: '寄件者', fromName: '寄件者名稱', fromEmail: '寄件者電郵', replyTo: '回覆地址（可選）', save: '儲存設定', saveConsequence: '儲存連線或寄件者變更會停用電郵傳送，並需要重新測試後才能啟用。', saved: '設定已儲存，電郵傳送目前已停用。', test: '測試電郵', testIntro: '測試會使用已儲存的設定。成功表示 SMTP 伺服器接受了訊息，不代表收件者已收到。', recipient: '收件者', sendTest: '寄出測試電郵', saveFirst: '請先儲存設定，再測試電郵。', testPassed: '測試已通過。', testFailed: '測試未通過。請檢查主機、連接埠、加密與驗證設定。', lastTest: '最近測試', never: '尚未測試', activity: '近期電郵活動', activityIntro: '測試或帳戶要求發生後，活動會顯示在這裡。收件者會以遮罩顯示。', emptyActivity: '尚未有電郵活動。', purpose: '用途', status: '狀態', attempts: '嘗試次數', errorCode: '錯誤代碼', created: '建立時間', registration: '註冊驗證', reset: '密碼復原', changed: '密碼已更改', adminTest: '管理員測試', queued: '排隊中', running: '處理中', sent: '已寄出', failedStatus: '失敗', cancelled: '已取消', remove: '移除已儲存設定', removeIntro: '只有在電郵停用時才能清除設定。這會移除已儲存的 SMTP 連線與寄件者資料。', removeConfirm: '確定要清除已儲存的電郵設定嗎？此操作會移除 SMTP 連線與寄件者資料。', clear: '清除設定', conflict: '設定已被另一位管理員更改。請重新載入最新設定後再試。', reload: '重新載入最新設定', signIn: '登入', saveRequired: '請先儲存完整設定。',
  },
  'zh-CN': {
    title: '邮件设置', intro: '配置可选的 SMTP 发送，管理注册验证和密码恢复邮件。', back: '偏好设置', loading: '正在加载邮件设置…', retry: '重试', denied: '你没有管理邮件设置的权限。', failed: '邮件设置暂时无法使用。', connection: '暂时无法连接。请稍后重试。', enabled: '已启用', disabled: '已停用', state: '服务状态', enabledEffect: '新账户需要邮件验证，并可使用密码恢复。', disabledEffect: '新账户可直接注册，密码恢复邮件不会发送。', enable: '启用邮件', disable: '停用邮件', enableHint: '启用前，必须先保存设置并成功发送测试邮件。', disableConfirm: '停用邮件后，新用户可直接注册，新的密码恢复邮件会停止发送。已接受的邮件不能收回，已发出的链接会在到期前仍然有效。确定要停用吗？', settings: '已保存的 SMTP 设置', connectionFields: '连接', host: '主机', port: '端口', security: '加密', tls: 'TLS', starttls: 'STARTTLS', none: '无加密', auth: '验证', authEnabled: '使用 SMTP 验证', username: '用户名', password: '密码', passwordConfigured: '当前密码状态', configured: '已设置', notConfigured: '未设置', retain: '保留现有密码', replace: '替换密码', clearPassword: '清除密码', retainHint: '密码不会加载或显示；保留现有密码时不会发送密码。', sender: '发件人', fromName: '发件人名称', fromEmail: '发件人邮箱', replyTo: '回复地址（可选）', save: '保存设置', saveConsequence: '保存连接或发件人更改会停用邮件发送，并需要重新测试后才能启用。', saved: '设置已保存，邮件发送目前已停用。', test: '测试邮件', testIntro: '测试会使用已保存的设置。成功表示 SMTP 服务器接受了消息，不代表收件人已收到。', recipient: '收件人', sendTest: '发送测试邮件', saveFirst: '请先保存设置，再测试邮件。', testPassed: '测试已通过。', testFailed: '测试未通过。请检查主机、端口、加密和验证设置。', lastTest: '最近测试', never: '尚未测试', activity: '近期邮件活动', activityIntro: '测试或账户请求发生后，活动会显示在这里。收件人会以遮罩显示。', emptyActivity: '尚无邮件活动。', purpose: '用途', status: '状态', attempts: '尝试次数', errorCode: '错误代码', created: '创建时间', registration: '注册验证', reset: '密码恢复', changed: '密码已更改', adminTest: '管理员测试', queued: '排队中', running: '处理中', sent: '已发送', failedStatus: '失败', cancelled: '已取消', remove: '移除已保存设置', removeIntro: '只有在邮件停用时才能清除设置。这会移除已保存的 SMTP 连接和发件人资料。', removeConfirm: '确定要清除已保存的邮件设置吗？此操作会移除 SMTP 连接和发件人资料。', clear: '清除设置', conflict: '设置已被另一位管理员更改。请重新加载最新设置后重试。', reload: '重新加载最新设置', signIn: '登录', saveRequired: '请先保存完整设置。',
  },
  en: {
    title: 'Mail settings', intro: 'Configure optional SMTP delivery for registration verification and password recovery email.', back: 'Preferences', loading: 'Loading mail settings…', retry: 'Try again', denied: 'You do not have permission to manage mail settings.', failed: 'Mail settings are temporarily unavailable.', connection: 'Unable to connect. Try again later.', enabled: 'Enabled', disabled: 'Disabled', state: 'Service state', enabledEffect: 'New accounts require email verification, and password recovery is available.', disabledEffect: 'New accounts can register directly, and password recovery emails are not sent.', enable: 'Enable mail', disable: 'Disable mail', enableHint: 'Save the settings and send a successful test email before enabling mail.', disableConfirm: 'Disabling mail lets new users register directly and stops new password recovery emails. Accepted mail cannot be recalled; issued links remain usable until they expire. Disable mail?', settings: 'Saved SMTP settings', connectionFields: 'Connection', host: 'Host', port: 'Port', security: 'Encryption', tls: 'TLS', starttls: 'STARTTLS', none: 'None', auth: 'Authentication', authEnabled: 'Use SMTP authentication', username: 'Username', password: 'Password', passwordConfigured: 'Current password status', configured: 'Configured', notConfigured: 'Not configured', retain: 'Retain existing password', replace: 'Replace password', clearPassword: 'Clear password', retainHint: 'The password is never loaded or displayed. Retaining it omits the password from the request.', sender: 'Sender', fromName: 'Sender name', fromEmail: 'Sender email', replyTo: 'Reply-To address (optional)', save: 'Save settings', saveConsequence: 'Saving connection or sender changes disables mail delivery and requires another successful test before it can be enabled.', saved: 'Settings saved. Mail delivery is currently disabled.', test: 'Test email', testIntro: 'The test uses saved settings. A successful result means the SMTP server accepted the message; it does not confirm delivery to the recipient.', recipient: 'Recipient', sendTest: 'Send test email', saveFirst: 'Save the settings before testing email.', testPassed: 'Test passed.', testFailed: 'Test failed. Check the host, port, encryption, and authentication settings.', lastTest: 'Latest test', never: 'Not tested yet', activity: 'Recent mail activity', activityIntro: 'Activity appears after a test or account request. Recipients are masked.', emptyActivity: 'No mail activity yet.', purpose: 'Purpose', status: 'Status', attempts: 'Attempts', errorCode: 'Error code', created: 'Created', registration: 'Registration verification', reset: 'Password recovery', changed: 'Password changed', adminTest: 'Admin test', queued: 'Queued', running: 'Running', sent: 'Sent', failedStatus: 'Failed', cancelled: 'Cancelled', remove: 'Remove saved settings', removeIntro: 'Saved settings can be cleared only while mail is disabled. This removes the stored SMTP connection and sender details.', removeConfirm: 'Clear the saved mail settings? This removes the SMTP connection and sender details.', clear: 'Clear settings', conflict: 'The settings changed under another administrator. Reload the latest settings before trying again.', reload: 'Reload latest settings', signIn: 'Sign in', saveRequired: 'Save a complete configuration first.',
  },
} as const

type SettingsResponse = ReturnType<typeof adminEmailSettingsResponseSchema.parse>
type Settings = SettingsResponse['settings']
type Security = Settings['security']
type PasswordAction = 'retain' | 'replace' | 'clear'
type Pending = 'load' | 'save' | 'test' | 'enable' | 'disable' | 'clear' | null
type FormState = { host: string; port: string; security: Security; authEnabled: boolean; username: string; passwordAction: PasswordAction; password: string; fromName: string; fromEmail: string; replyTo: string }

const emptyForm: FormState = { host: '', port: '', security: 'tls', authEnabled: false, username: '', passwordAction: 'retain', password: '', fromName: '', fromEmail: '', replyTo: '' }
const hydrate = (settings: Settings): FormState => ({ host: settings.host ?? '', port: settings.port === null ? '' : String(settings.port), security: settings.security, authEnabled: settings.authEnabled, username: settings.username ?? '', passwordAction: 'retain', password: '', fromName: settings.fromName ?? '', fromEmail: settings.fromEmail ?? '', replyTo: settings.replyTo ?? '' })
const dateTime = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export default function AdminEmail() {
  const { locale } = useUi()
  const c = copy[locale]
  const { authenticated, viewer } = useOutletContext<ShellOutletContext>()
  const adminReady = authenticated === true && viewer?.role === 'ADMIN'
  const translate = useRef(c)
  translate.current = c
  const [response, setResponse] = useState<SettingsResponse | null>(null)
  const [draft, setDraft] = useState<FormState>(emptyForm)
  const [draftDirty, setDraftDirty] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [pending, setPending] = useState<Pending>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    setPending('load'); setFailure(null); setResponse(null)
    api.GET('/api/admin/email-settings', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = adminEmailSettingsResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) { setResponse(parsed.data); setDraft(hydrate(parsed.data.settings)); setDraftDirty(false) }
      else setFailure(apiFailure(result.error, result.response.status === 403 ? translate.current.denied : translate.current.failed))
    }).catch(() => { if (!controller.signal.aborted) setFailure({ message: translate.current.connection, fields: [] }) }).finally(() => { if (!controller.signal.aborted) setPending(null) })
    return () => controller.abort()
  }, [adminReady, attempt])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setDraft(current => ({ ...current, [key]: value })); setDraftDirty(true); setNotice('') }
  function settingsBody() {
    const port = draft.port.trim() === '' ? null : Number(draft.port)
    return { expectedRevision: response?.settings.revision ?? 0, host: draft.host.trim() || null, port, security: draft.security, authEnabled: draft.authEnabled, username: draft.authEnabled ? draft.username.trim() || null : null, passwordAction: draft.passwordAction, ...(draft.passwordAction === 'replace' ? { password: draft.password } : {}), fromName: draft.fromName.trim() || null, fromEmail: draft.fromEmail.trim() || null, replyTo: draft.replyTo.trim() || null }
  }
  function applyResponse(result: unknown, fallback: string) {
    const parsed = adminEmailSettingsResponseSchema.safeParse(result)
    if (!parsed.success) { setFailure({ message: fallback, fields: [] }); return false }
    setResponse(parsed.data); setDraft(hydrate(parsed.data.settings)); setDraftDirty(false); return true
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!response || pending) return
    setPending('save'); setFailure(null); setNotice('')
    try {
      const result = await api.PUT('/api/admin/email-settings', { body: settingsBody() })
      if (!result.response.ok) { setFailure(apiFailure(result.error, result.response.status === 409 ? c.conflict : c.failed)); return }
      if (applyResponse(result.data, c.failed)) setNotice(c.saved)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(null) }
  }
  async function testEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!response || pending || draftDirty || !recipient.trim()) return
    setPending('test'); setFailure(null); setNotice('')
    try {
      const result = await api.POST('/api/admin/email-settings/test', { body: { expectedRevision: response.settings.revision, recipient: recipient.trim() } })
      const parsed = adminEmailTestResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, c.testFailed)); return }
      setNotice(parsed.data.status === 'passed' ? c.testPassed : c.testFailed)
      setAttempt(value => value + 1)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(null) }
  }
  async function action(kind: 'enable' | 'disable' | 'clear') {
    if (!response || pending) return
    if (kind === 'disable' && !window.confirm(c.disableConfirm)) return
    if (kind === 'clear' && !window.confirm(c.removeConfirm)) return
    setPending(kind); setFailure(null); setNotice('')
    try {
      const body = { expectedRevision: response.settings.revision }
      const result = kind === 'enable'
        ? await api.POST('/api/admin/email-settings/enable', { body })
        : kind === 'disable'
          ? await api.POST('/api/admin/email-settings/disable', { body })
          : await api.POST('/api/admin/email-settings/clear', { body })
      if (!result.response.ok) { setFailure(apiFailure(result.error, result.response.status === 409 ? c.conflict : c.failed)); return }
      if (applyResponse(result.data, c.failed)) setNotice(kind === 'clear' ? c.saved : kind === 'enable' ? c.enabled : c.disabled)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(null) }
  }

  if (authenticated !== true || viewer === null) return <section className="admin-email-page"><p role="status">{c.loading}</p></section>
  if (viewer.role !== 'ADMIN') return <section className="admin-email-page"><p role="alert">{c.denied}</p></section>
  if (!response) return <section className="admin-email-page"><header className="admin-email-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link className="secondary" to="/settings">{c.back}</Link></header><FailureNotice failure={failure} /><button type="button" className="secondary" disabled={pending === 'load'} onClick={() => { setNotice(''); setAttempt(value => value + 1) }}>{pending === 'load' ? '…' : c.retry}</button></section>

  const current = response.settings
  const readyToEnable = current.testedRevision === current.revision && current.lastTestStatus === 'passed'
  const statusLabel = current.enabled ? c.enabled : c.disabled
  const kindLabel = (kind: SettingsResponse['deliveries'][number]['kind']) => kind === 'registration_verification' ? c.registration : kind === 'password_reset' ? c.reset : kind === 'password_changed' ? c.changed : c.adminTest
  const deliveryStatus = (status: SettingsResponse['deliveries'][number]['status']) => status === 'queued' ? c.queued : status === 'running' ? c.running : status === 'sent' ? c.sent : status === 'failed' ? c.failedStatus : c.cancelled
  return <section className="admin-email-page">
    <header className="admin-email-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link className="secondary" to="/settings">{c.back}</Link></header>
    <FailureNotice failure={failure} />
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to="/login">{c.signIn}</Link>}
    {(failure?.code === 'ADMIN_EMAIL_CONFIG_CONFLICT' || failure?.code === 'ADMIN_EMAIL_REVISION_CONFLICT') && <button type="button" className="secondary" onClick={() => { setNotice(''); setAttempt(value => value + 1) }}>{c.reload}</button>}
    {notice && <p className="admin-email-notice" role="status">{notice}</p>}
    <section className="admin-email-section admin-email-state" aria-labelledby="admin-email-state-heading">
      <div className="admin-email-section-heading"><h2 id="admin-email-state-heading">{c.state}</h2><span className={`badge ${current.enabled ? 'badge-info' : ''}`}>{statusLabel}</span></div>
      <p>{current.enabled ? c.enabledEffect : c.disabledEffect}</p>
      <div className="admin-email-actions"><button type="button" disabled={pending !== null || (!current.enabled && !readyToEnable)} onClick={() => void action(current.enabled ? 'disable' : 'enable')}>{pending === 'enable' || pending === 'disable' ? '…' : current.enabled ? c.disable : c.enable}</button>{!current.enabled && !readyToEnable && <p className="muted">{c.enableHint}</p>}</div>
    </section>
    <section className="admin-email-section" aria-labelledby="admin-email-settings-heading"><h2 id="admin-email-settings-heading">{c.settings}</h2>
      <form onSubmit={save} aria-busy={pending === 'save'}>
        <fieldset disabled={pending !== null}><legend>{c.connectionFields}</legend><div className="admin-email-grid"><label>{c.host}<input name="host" value={draft.host} onChange={event => update('host', event.target.value)} maxLength={255} aria-invalid={invalidField(failure, 'host')} /></label><label>{c.port}<input name="port" value={draft.port} onChange={event => update('port', event.target.value)} inputMode="numeric" type="number" min={1} max={65535} aria-invalid={invalidField(failure, 'port')} /></label><label>{c.security}<select name="security" value={draft.security} onChange={event => update('security', event.target.value as Security)}><option value="tls">{c.tls}</option><option value="starttls">{c.starttls}</option><option value="none">{c.none}</option></select></label></div></fieldset>
        <fieldset disabled={pending !== null}><legend>{c.auth}</legend><label className="admin-email-checkbox"><input name="authEnabled" type="checkbox" checked={draft.authEnabled} onChange={event => update('authEnabled', event.target.checked)} />{c.authEnabled}</label>{draft.authEnabled && <div className="admin-email-grid"><label>{c.username}<input name="username" value={draft.username} onChange={event => update('username', event.target.value)} autoComplete="username" maxLength={255} aria-invalid={invalidField(failure, 'username')} /></label><label>{c.password}<input name="password" type="password" value={draft.password} onChange={event => update('password', event.target.value)} autoComplete="new-password" disabled={draft.passwordAction !== 'replace'} aria-invalid={invalidField(failure, 'password')} /></label></div>}<p className="admin-email-password-state">{c.passwordConfigured}: <strong>{current.passwordConfigured ? c.configured : c.notConfigured}</strong></p><div className="admin-email-radio-group" role="group" aria-label={c.password}>{(['retain', 'replace', 'clear'] as const).map(actionValue => <label key={actionValue} className="admin-email-radio"><input type="radio" name="passwordAction" value={actionValue} checked={draft.passwordAction === actionValue} onChange={() => update('passwordAction', actionValue)} />{actionValue === 'retain' ? c.retain : actionValue === 'replace' ? c.replace : c.clearPassword}</label>)}</div><p className="muted">{c.retainHint}</p></fieldset>
        <fieldset disabled={pending !== null}><legend>{c.sender}</legend><div className="admin-email-grid"><label>{c.fromName}<input name="fromName" value={draft.fromName} onChange={event => update('fromName', event.target.value)} maxLength={200} /></label><label>{c.fromEmail}<input name="fromEmail" type="email" value={draft.fromEmail} onChange={event => update('fromEmail', event.target.value)} autoComplete="email" maxLength={255} aria-invalid={invalidField(failure, 'fromEmail')} /></label><label>{c.replyTo}<input name="replyTo" type="email" value={draft.replyTo} onChange={event => update('replyTo', event.target.value)} autoComplete="email" maxLength={255} aria-invalid={invalidField(failure, 'replyTo')} /></label></div></fieldset>
        <p className="admin-email-consequence">{c.saveConsequence}</p><div className="admin-email-actions"><button type="submit" disabled={pending !== null}>{pending === 'save' ? '…' : c.save}</button></div>
      </form>
    </section>
    <section className="admin-email-section" aria-labelledby="admin-email-test-heading"><h2 id="admin-email-test-heading">{c.test}</h2><p>{c.testIntro}</p><form onSubmit={testEmail} aria-busy={pending === 'test'}><label>{c.recipient}<input type="email" name="recipient" autoComplete="email" value={recipient} onChange={event => setRecipient(event.target.value)} disabled={pending !== null} required /></label><p className="muted">{draftDirty ? c.saveFirst : current.lastTestAt ? `${c.lastTest}: ${dateTime(current.lastTestAt, locale)}` : c.never}</p><button type="submit" disabled={pending !== null || draftDirty}>{pending === 'test' ? '…' : c.sendTest}</button></form></section>
    <section className="admin-email-section" aria-labelledby="admin-email-activity-heading"><h2 id="admin-email-activity-heading">{c.activity}</h2><p>{c.activityIntro}</p>{response.deliveries.length === 0 ? <div className="empty-state"><p>{c.emptyActivity}</p></div> : <div className="admin-email-table-region" tabIndex={0} role="region" aria-label={c.activity}><table className="admin-email-table"><caption>{c.activity}</caption><thead><tr><th scope="col">{c.recipient}</th><th scope="col">{c.purpose}</th><th scope="col">{c.status}</th><th scope="col">{c.attempts}</th><th scope="col">{c.errorCode}</th><th scope="col">{c.created}</th></tr></thead><tbody>{response.deliveries.map(delivery => <tr key={delivery.id}><th scope="row">{delivery.recipientMasked}</th><td>{kindLabel(delivery.kind)}</td><td>{deliveryStatus(delivery.status)}</td><td className="num">{delivery.attemptCount}</td><td>{delivery.lastErrorCode ?? '—'}</td><td><time dateTime={delivery.createdAt}>{dateTime(delivery.createdAt, locale)}</time></td></tr>)}</tbody></table></div>}</section>
    {!current.enabled && <section className="admin-email-section admin-email-remove" aria-labelledby="admin-email-remove-heading"><h2 id="admin-email-remove-heading">{c.remove}</h2><p>{c.removeIntro}</p><button type="button" className="secondary" disabled={pending !== null} onClick={() => void action('clear')}>{pending === 'clear' ? '…' : c.clear}</button></section>}
  </section>
}
