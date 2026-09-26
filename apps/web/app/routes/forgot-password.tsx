import { authCapabilitiesSchema } from '@diary/contracts'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLoaderData } from 'react-router'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { api, useUi } from '../ui'
import './registration-complete.css'
import { resolveAccountRecoverySupportUrl } from '../account-recovery-support.server'

export function loader() {
  return { supportUrl: resolveAccountRecoverySupportUrl(process.env.ACCOUNT_RECOVERY_SUPPORT_URL) }
}

const copy = {
  'zh-TW': {
    title: '重設密碼', intro: '輸入帳戶電郵，我們會寄出重設連結。', email: '電郵', send: '寄出重設電郵', sent: '如果這個電郵已註冊，你會收到重設連結。連結會在 30 分鐘後失效。', resend: '再次寄出重設電郵', resendReady: '可以再次寄出重設電郵。', resendWait: (seconds: number) => `${seconds} 秒後可以再次寄出。`, unavailable: '電郵密碼復原目前未啟用。請聯絡管理員，或返回登入。', contactSupport: '取得登入協助', back: '返回登入', failed: '暫時無法處理要求。請稍後再試。', connection: '暫時無法連線。請稍後再試。', loading: '正在確認密碼復原設定…', retry: '重試',
  },
  'zh-CN': {
    title: '重置密码', intro: '输入账户邮箱，我们会发送重置链接。', email: '邮箱', send: '发送重置邮件', sent: '如果这个邮箱已注册，你会收到重置链接。链接将在 30 分钟后失效。', resend: '再次发送重置邮件', resendReady: '可以再次发送重置邮件。', resendWait: (seconds: number) => `${seconds} 秒后可以再次发送。`, unavailable: '邮箱密码恢复目前未启用。请联系管理员，或返回登录。', contactSupport: '获取登录帮助', back: '返回登录', failed: '暂时无法处理请求。请稍后重试。', connection: '暂时无法连接。请稍后重试。', loading: '正在确认密码恢复设置…', retry: '重试',
  },
  en: {
    title: 'Reset your password', intro: 'Enter your account email and we will send a reset link.', email: 'Email', send: 'Send reset email', sent: 'If this email is registered, you will receive a reset link. The link expires in 30 minutes.', resend: 'Send reset email again', resendReady: 'You can send another reset email.', resendWait: (seconds: number) => `You can send another email in ${seconds} seconds.`, unavailable: 'Email password recovery is not enabled. Contact an administrator or return to sign in.', contactSupport: 'Get sign-in help', back: 'Back to sign in', failed: 'The request could not be completed. Try again later.', connection: 'Unable to connect. Please try again later.', loading: 'Checking password recovery settings…', retry: 'Try again',
  },
} as const

type Capability = ReturnType<typeof authCapabilitiesSchema.parse>

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get('retry-after')?.trim()
  if (!raw) return 0
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  const retryAt = Date.parse(raw)
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : 0
}

export default function ForgotPassword() {
  const { supportUrl } = useLoaderData<typeof loader>()
  const { locale } = useUi()
  const c = copy[locale]
  const [capability, setCapability] = useState<Capability | null>(null)
  const [capabilityState, setCapabilityState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [failure, setFailure] = useState<Failure | null>(null)

  useEffect(() => {
    let active = true
    setCapabilityState('loading')
    api.GET('/api/auth/capabilities', { cache: 'no-store' }).then(result => {
      if (!active) return
      const parsed = authCapabilitiesSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) { setCapability(parsed.data); setCapabilityState('ready') }
      else setCapabilityState('error')
    }).catch(() => { if (active) setCapabilityState('error') })
    return () => { active = false }
  }, [attempt])

  useEffect(() => {
    if (!cooldownUntil) { setCooldownSeconds(0); return }
    const update = () => setCooldownSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  async function requestReset() {
    setPending(true)
    setFailure(null)
    try {
      const result = await api.POST('/api/auth/password-reset/request', { body: { email: email.trim(), locale }, cache: 'no-store' })
      const retryAfter = retryAfterSeconds(result.response)
      if (retryAfter > 0) setCooldownUntil(Date.now() + retryAfter * 1000)
      else setCooldownUntil(null)
      if (!result.response.ok) {
        const nextFailure = apiFailure(result.error, c.failed)
        if (nextFailure.code === 'AUTH_EMAIL_SERVICE_DISABLED') {
          setCapability(current => current ? { ...current, passwordRecoveryAvailable: false } : current)
          setSubmitted(false)
          setFailure(null)
          return
        }
        setFailure(nextFailure)
        return
      }
      setSubmitted(true)
    } catch { setFailure({ message: c.connection, fields: [] }) }
    finally { setPending(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await requestReset()
  }

  const cooldownMessage = cooldownSeconds > 0 ? c.resendWait(cooldownSeconds) : c.resendReady
  return <section className="form-page">
    <h1>{c.title}</h1>
    {capabilityState === 'loading' ? <p role="status">{c.loading}</p>
      : capabilityState === 'error' ? <div role="alert"><p>{c.connection}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></div>
        : !capability?.passwordRecoveryAvailable ? <div role="status"><p>{c.unavailable}</p>{supportUrl && <p className="form-alternate"><a href={supportUrl}>{c.contactSupport}</a></p>}<p className="form-alternate"><Link to="/login">{c.back}</Link></p></div>
          : submitted ? <div className="auth-request-complete"><p role="status">{c.sent}</p><p className="muted" aria-live="off">{cooldownMessage}</p><button type="button" className="secondary" disabled={pending || cooldownSeconds > 0} onClick={() => void requestReset()}>{pending ? '…' : c.resend}</button><p className="form-alternate"><Link to="/login">{c.back}</Link></p></div>
            : <>
              <p className="lede">{c.intro}</p>
              <form onSubmit={submit} aria-busy={pending}><label>{c.email}<input type="email" name="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={pending} required /></label><FailureNotice failure={failure} /><button type="submit" disabled={pending}>{pending ? '…' : c.send}</button></form>
              <p className="form-alternate"><Link to="/login">{c.back}</Link></p>
            </>}
  </section>
}
