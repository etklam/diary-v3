import { registrationCompleteRequestSchema } from '@diary/contracts'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { api, useUi } from '../ui'
import './registration-complete.css'

const copy = {
  'zh-TW': {
    title: '完成建立帳戶', intro: '設定名稱與密碼後即可開始使用投資日記。', name: '名稱（可選）', password: '密碼', confirm: '確認密碼', passwordHint: '密碼至少 8 個字元，最多 72 個 UTF-8 bytes。', create: '建立帳戶', success: '帳戶已建立。請登入以開始記錄。', login: '登入', missing: '這個驗證連結不完整。請重新申請驗證電郵。', invalid: '驗證連結無效、已使用或已過期。請重新申請驗證電郵。', mismatch: '兩次輸入的密碼不一致。', failed: '暫時無法完成註冊。請檢查輸入後重試。', connection: '暫時無法連線。請稍後再試。', request: '重新申請驗證電郵', back: '返回登入',
  },
  'zh-CN': {
    title: '完成创建账户', intro: '设置名称和密码后即可开始使用投资日记。', name: '名称（可选）', password: '密码', confirm: '确认密码', passwordHint: '密码至少 8 个字符，最多 72 个 UTF-8 bytes。', create: '创建账户', success: '账户已创建。请登录以开始记录。', login: '登录', missing: '这个验证链接不完整。请重新申请验证邮件。', invalid: '验证链接无效、已使用或已过期。请重新申请验证邮件。', mismatch: '两次输入的密码不一致。', failed: '暂时无法完成注册。请检查输入后重试。', connection: '暂时无法连接。请稍后重试。', request: '重新申请验证邮件', back: '返回登录',
  },
  en: {
    title: 'Finish creating your account', intro: 'Set a name and password to start using your investment diary.', name: 'Name (optional)', password: 'Password', confirm: 'Confirm password', passwordHint: 'Use at least 8 characters and no more than 72 UTF-8 bytes.', create: 'Create account', success: 'Your account is ready. Sign in to start recording.', login: 'Sign in', missing: 'This verification link is incomplete. Request a new verification email.', invalid: 'This verification link is invalid, already used, or expired. Request a new verification email.', mismatch: 'The passwords do not match.', failed: 'Registration could not be completed. Check your entries and try again.', connection: 'Unable to connect. Please try again later.', request: 'Request a new verification email', back: 'Back to sign in',
  },
} as const

export function meta() {
  return [{ name: 'referrer', content: 'no-referrer' }]
}

export default function RegistrationComplete() {
  const { locale } = useUi()
  const c = copy[locale]
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const tokenFromUrl = search.get('token')
  const [token] = useState(() => tokenFromUrl ?? '')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => {
    if (tokenFromUrl) navigate('/register/complete', { replace: true })
  }, [navigate, tokenFromUrl])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirm) { setFailure({ message: c.mismatch, fields: ['confirm'] }); return }
    setPending(true)
    setFailure(null)
    const parsed = registrationCompleteRequestSchema.safeParse({ token, name: name.trim() || undefined, password })
    if (!parsed.success) { setFailure({ message: c.failed, fields: parsed.error.issues.map(issue => String(issue.path[0] ?? '')) }); setPending(false); return }
    try {
      const result = await api.POST('/api/auth/registration/complete', { body: parsed.data, cache: 'no-store' })
      if (!result.response.ok) { setFailure(apiFailure(result.error, c.invalid)); return }
      setCompleted(true)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(false) }
  }

  return <section className="form-page registration-complete-page">
    <h1>{c.title}</h1>
    {completed ? <div className="registration-complete-success" role="status"><p>{c.success}</p><Link className="button" to="/login">{c.login}</Link></div>
      : !token ? <div role="alert"><p>{c.missing}</p><p><Link to="/register">{c.request}</Link></p><p className="form-alternate"><Link to="/login">{c.back}</Link></p></div>
        : <>
          <p className="lede">{c.intro}</p>
          <form onSubmit={submit} aria-busy={pending} autoComplete="off">
            <label>{c.name}<input name="name" value={name} onChange={event => setName(event.target.value)} disabled={pending} maxLength={100} autoComplete="name" /></label>
            <label>{c.password}<input name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} disabled={pending} minLength={8} required autoComplete="new-password" aria-describedby="registration-password-hint" /></label>
            <label>{c.confirm}<input name="confirm" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} disabled={pending} minLength={8} required autoComplete="new-password" aria-invalid={failure?.fields.includes('confirm') || undefined} aria-describedby="registration-password-hint" /></label>
            <p id="registration-password-hint" className="muted">{c.passwordHint}</p>
            <FailureNotice failure={failure} messageOverride={failure?.fields.includes('confirm') ? c.mismatch : undefined} />
            <button type="submit" disabled={pending}>{pending ? '…' : c.create}</button>
          </form>
          <p className="form-alternate"><Link to="/login">{c.back}</Link></p>
        </>}
  </section>
}
