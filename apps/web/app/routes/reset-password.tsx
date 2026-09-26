import { authCapabilitiesSchema, passwordResetCompleteRequestSchema } from '@diary/contracts'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { api, useUi } from '../ui'
import './registration-complete.css'

const copy = {
  'zh-TW': {
    title: '設定新密碼', intro: '輸入新密碼以恢復帳戶存取。其他現有登入會被登出。', password: '新密碼', confirm: '確認新密碼', hint: '密碼至少 8 個字元，最多 72 個 UTF-8 bytes。', submit: '重設密碼', success: '密碼已更改，其他登入工作階段已登出。請重新登入。', login: '登入', missing: '這個重設連結不完整。請重新申請重設電郵。', invalid: '這個重設連結無效、已使用或已過期。請重新申請重設電郵。', request: '重新申請重設電郵', mismatch: '兩次輸入的密碼不一致。', failed: '暫時無法重設密碼。請檢查輸入後重試。', connection: '暫時無法連線。請稍後再試。', back: '返回登入', unavailable: '電郵密碼復原目前未啟用。請聯絡管理員，或返回登入。', checkingRecovery: '正在確認電郵密碼復原設定…',
  },
  'zh-CN': {
    title: '设置新密码', intro: '输入新密码以恢复账户访问。其他现有登录会被退出。', password: '新密码', confirm: '确认新密码', hint: '密码至少 8 个字符，最多 72 个 UTF-8 bytes。', submit: '重置密码', success: '密码已更改，其他登录会话已退出。请重新登录。', login: '登录', missing: '这个重置链接不完整。请重新申请重置邮件。', invalid: '这个重置链接无效、已使用或已过期。请重新申请重置邮件。', request: '重新申请重置邮件', mismatch: '两次输入的密码不一致。', failed: '暂时无法重置密码。请检查输入后重试。', connection: '暂时无法连接。请稍后重试。', back: '返回登录', unavailable: '邮箱密码恢复目前未启用。请联系管理员，或返回登录。', checkingRecovery: '正在确认邮箱密码恢复设置…',
  },
  en: {
    title: 'Set a new password', intro: 'Enter a new password to restore account access. Other active sessions will be signed out.', password: 'New password', confirm: 'Confirm new password', hint: 'Use at least 8 characters and no more than 72 UTF-8 bytes.', submit: 'Reset password', success: 'Your password changed and other sessions were signed out. Sign in again.', login: 'Sign in', missing: 'This reset link is incomplete. Request a new password reset email.', invalid: 'This reset link is invalid, already used, or expired. Request a new password reset email.', request: 'Request a new reset email', mismatch: 'The passwords do not match.', failed: 'Your password could not be reset. Check your entries and try again.', connection: 'Unable to connect. Please try again later.', back: 'Back to sign in', unavailable: 'Email password recovery is not enabled. Contact an administrator or return to sign in.', checkingRecovery: 'Checking email recovery settings…',
  },
} as const

export function meta() {
  return [{ name: 'referrer', content: 'no-referrer' }]
}

export default function ResetPassword() {
  const { locale } = useUi()
  const c = copy[locale]
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const tokenFromUrl = search.get('token')
  const [token] = useState(() => tokenFromUrl ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [recoveryAvailability, setRecoveryAvailability] = useState<'unknown' | 'checking' | 'available' | 'unavailable'>('unknown')

  useEffect(() => {
    if (tokenFromUrl) navigate('/reset-password', { replace: true })
  }, [navigate, tokenFromUrl])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirm) { setFailure({ message: c.mismatch, fields: ['confirm'] }); return }
    setPending(true)
    setFailure(null)
    const parsed = passwordResetCompleteRequestSchema.safeParse({ token, newPassword: password })
    if (!parsed.success) { setFailure({ message: c.failed, fields: parsed.error.issues.map(issue => String(issue.path[0] ?? '')) }); setPending(false); return }
    try {
      const result = await api.POST('/api/auth/password-reset/complete', { body: parsed.data, cache: 'no-store' })
      if (!result.response.ok) {
        const nextFailure = apiFailure(result.error, c.invalid)
        setFailure(nextFailure)
        if (nextFailure.code === 'AUTH_EMAIL_TOKEN_INVALID' || nextFailure.code === 'AUTH_EMAIL_TOKEN_EXPIRED') {
          setRecoveryAvailability('checking')
          void api.GET('/api/auth/capabilities', { cache: 'no-store' }).then(capabilitiesResult => {
            const capabilities = authCapabilitiesSchema.safeParse(capabilitiesResult.data)
            setRecoveryAvailability(capabilitiesResult.response.ok && capabilities.success
              ? capabilities.data.passwordRecoveryAvailable ? 'available' : 'unavailable'
              : 'unknown')
          }).catch(() => setRecoveryAvailability('unknown'))
        }
        return
      }
      setCompleted(true)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(false) }
  }

  const rejectedLink = failure?.code === 'AUTH_EMAIL_TOKEN_INVALID' || failure?.code === 'AUTH_EMAIL_TOKEN_EXPIRED'
  return <section className="form-page registration-complete-page">
    <h1>{c.title}</h1>
    {completed ? <div className="registration-complete-success" role="status"><p>{c.success}</p><Link className="button" to="/login">{c.login}</Link></div>
      : !token ? <div role="alert"><p>{c.missing}</p><p><Link to="/forgot-password">{c.request}</Link></p><p className="form-alternate"><Link to="/login">{c.back}</Link></p></div>
        : rejectedLink ? <>
          <FailureNotice failure={failure} />
          {recoveryAvailability === 'checking' ? <p role="status">{c.checkingRecovery}</p>
            : recoveryAvailability === 'unavailable' ? <p role="status">{c.unavailable}</p>
              : <p><Link to="/forgot-password">{c.request}</Link></p>}
          <p className="form-alternate"><Link to="/login">{c.back}</Link></p>
        </> : <>
          <p className="lede">{c.intro}</p>
          <form onSubmit={submit} aria-busy={pending} autoComplete="off">
            <label>{c.password}<input name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} disabled={pending} minLength={8} required autoComplete="new-password" aria-describedby="reset-password-hint" /></label>
            <label>{c.confirm}<input name="confirm" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} disabled={pending} minLength={8} required autoComplete="new-password" aria-invalid={failure?.fields.includes('confirm') || undefined} aria-describedby="reset-password-hint" /></label>
            <p id="reset-password-hint" className="muted">{c.hint}</p>
            <FailureNotice failure={failure} messageOverride={failure?.fields.includes('confirm') ? c.mismatch : undefined} />
            <button type="submit" disabled={pending}>{pending ? '…' : c.submit}</button>
          </form>
          <p className="form-alternate"><Link to="/login">{c.back}</Link></p>
        </>}
  </section>
}
