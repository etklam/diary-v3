import { authCapabilitiesSchema } from '@diary/contracts'
import { defaultWorkspacePath, markSignedIn, safeReturnPath } from './session'
import { apiFailure, FailureNotice, invalidField, type Failure } from './api-error'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, useUi } from './ui'
import './routes/registration-complete.css'

const copy = {
  'zh-TW': {
    capabilityLoading: '正在確認帳戶註冊設定…',
    capabilityFailed: '暫時無法確認註冊設定。請重試。',
    emailRegisterIntro: '輸入電郵後，我們會寄出一次性驗證連結。',
    sendVerification: '寄出驗證電郵',
    verificationSent: '如果這個電郵可以註冊，你會收到驗證連結。連結會在 24 小時後失效。',
    resend: '再次寄出驗證電郵',
    resendReady: '可以再次寄出驗證電郵。',
    resendWait: (seconds: number) => `${seconds} 秒後可以再次寄出。`,
    changeEmail: '更改電郵',
    forgotPassword: '忘記密碼？',
    retry: '重試',
  },
  'zh-CN': {
    capabilityLoading: '正在确认账户注册设置…',
    capabilityFailed: '暂时无法确认注册设置。请重试。',
    emailRegisterIntro: '输入邮箱后，我们会发送一次性验证链接。',
    sendVerification: '发送验证邮件',
    verificationSent: '如果这个邮箱可以注册，你会收到验证链接。链接将在 24 小时后失效。',
    resend: '再次发送验证邮件',
    resendReady: '可以再次发送验证邮件。',
    resendWait: (seconds: number) => `${seconds} 秒后可以再次发送。`,
    changeEmail: '更改邮箱',
    forgotPassword: '忘记密码？',
    retry: '重试',
  },
  en: {
    capabilityLoading: 'Checking account registration settings…',
    capabilityFailed: 'Registration settings are temporarily unavailable. Try again.',
    emailRegisterIntro: 'Enter your email and we will send a one-time verification link.',
    sendVerification: 'Send verification email',
    verificationSent: 'If this email can be registered, you will receive a verification link. The link expires in 24 hours.',
    resend: 'Send verification email again',
    resendReady: 'You can send another verification email.',
    resendWait: (seconds: number) => `You can send another email in ${seconds} seconds.`,
    changeEmail: 'Change email',
    forgotPassword: 'Forgot password?',
    retry: 'Try again',
  },
} as const

type Capability = ReturnType<typeof authCapabilitiesSchema.parse>
type CapabilityState = 'loading' | 'ready' | 'error'

function safeAuthReturnPath(value: string | null) {
  if (value && value.startsWith('/admin/') && !value.startsWith('//') && !value.includes('://')) return value
  return safeReturnPath(value)
}

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get('retry-after')?.trim()
  if (!raw) return 0
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  const retryAt = Date.parse(raw)
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : 0
}

export function AuthForm({ register = false }: { register?: boolean }) {
  const { t, locale, ready } = useUi()
  const text = copy[locale]
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Failure | null>(null)
  const [directDone, setDirectDone] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [capability, setCapability] = useState<Capability | null>(null)
  const [capabilityState, setCapabilityState] = useState<CapabilityState>('loading')
  const [capabilityAttempt, setCapabilityAttempt] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const returnTo = safeAuthReturnPath(search.get('returnTo'))
  const returnQuery = search.has('returnTo') ? `?${new URLSearchParams({ returnTo })}` : ''

  useEffect(() => {
    let active = true
    setCapabilityState('loading')
    setCapability(null)
    api.GET('/api/auth/capabilities', { cache: 'no-store' }).then(result => {
      if (!active) return
      const parsed = authCapabilitiesSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) {
        setCapability(parsed.data)
        setCapabilityState('ready')
      } else setCapabilityState('error')
    }).catch(() => { if (active) setCapabilityState('error') })
    return () => { active = false }
  }, [capabilityAttempt])

  useEffect(() => {
    if (!cooldownUntil) { setCooldownSeconds(0); return }
    const update = () => setCooldownSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  async function requestVerification() {
    setPending(true)
    setError(null)
    try {
      const result = await api.POST('/api/auth/registration/request', { body: { email: email.trim(), locale }, cache: 'no-store' })
      const retryAfter = retryAfterSeconds(result.response)
      setCooldownUntil(retryAfter > 0 ? Date.now() + retryAfter * 1000 : null)
      if (!result.response.ok) { setError(apiFailure(result.error, t('failed'))); return }
      setEmailSent(true)
    } catch { setError(apiFailure(null, t('connection'))) }
    finally { setPending(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (register && capability?.registrationMode === 'email') { await requestVerification(); return }
    setPending(true)
    setError(null)
    try {
      const result = register
        ? await api.POST('/api/auth/register', { body: { email: email.trim(), password, name: name.trim() || undefined } })
        : await api.POST('/api/auth/login', { body: { email: email.trim(), password } })
      if (!result.response.ok) { setError(apiFailure(result.error, t('failed'))); return }
      if (register) { setDirectDone(true); return }
      markSignedIn()
      await api.GET('/api/auth/me')
      let destination = '/timeline'
      if (search.has('returnTo')) destination = returnTo
      else {
        try {
          const settings = await api.GET('/api/user/settings')
          destination = defaultWorkspacePath(settings.data?.settings.defaultWorkspacePage)
        } catch { /* Keep Timeline as the default when preferences cannot load. */ }
      }
      navigate(destination, { replace: true })
    } catch { setError(apiFailure(null, t('connection'))) }
    finally { setPending(false) }
  }

  async function resend() {
    if (pending || cooldownSeconds > 0 || !email.trim()) return
    await requestVerification()
  }

  const capabilityLoading = register && capabilityState === 'loading'
  const capabilityFailed = register && capabilityState === 'error'
  const emailMode = register && capability?.registrationMode === 'email'
  const directRegistrationDone = directDone && register

  return <section className="form-page">
    <h1>{t(register ? 'registerTitle' : 'loginTitle')}</h1>
    {capabilityLoading ? <p role="status">{text.capabilityLoading}</p>
      : capabilityFailed ? <div role="alert"><p>{text.capabilityFailed}</p><button type="button" className="secondary" onClick={() => setCapabilityAttempt(value => value + 1)}>{text.retry}</button></div>
        : directRegistrationDone ? <div role="status"><p>{t('registered')}</p><Link className="button" to={`/login${returnQuery}`}>{t('login')}</Link></div>
          : emailSent && emailMode ? <div className="auth-request-complete">
            <p role="status">{text.verificationSent}</p>
            <p className="muted" aria-live="off">{cooldownSeconds > 0 ? text.resendWait(cooldownSeconds) : text.resendReady}</p>
            <button type="button" className="secondary" disabled={pending || cooldownSeconds > 0} onClick={() => void resend()}>{pending ? t('pending') : text.resend}</button>
            <button type="button" className="secondary" onClick={() => { setEmailSent(false); setError(null); setCooldownUntil(null) }}>{text.changeEmail}</button>
            <p className="form-alternate"><Link to={`/login${returnQuery}`}>{t('login')}</Link></p>
          </div>
          : <>
            {emailMode && <p className="lede">{text.emailRegisterIntro}</p>}
            <form id="auth-form" onSubmit={submit} aria-busy={pending}>
              {register && !emailMode && <label>{t('name')}<input disabled={!ready || pending} name="name" value={name} onChange={event => setName(event.target.value)} aria-invalid={invalidField(error, 'name')} aria-describedby={error ? 'form-error' : undefined} autoComplete="name" maxLength={100} /></label>}
              <label>{t('email')}<input disabled={!ready || pending} name="email" value={email} onChange={event => setEmail(event.target.value)} aria-invalid={invalidField(error, 'email')} aria-describedby={error ? 'form-error' : undefined} type="email" autoComplete="email" required /></label>
              {!emailMode && <label>{t('password')}<input disabled={!ready || pending} name="password" value={password} onChange={event => setPassword(event.target.value)} aria-invalid={invalidField(error, 'password')} type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} required aria-describedby={[register ? 'password-hint' : '', error ? 'form-error' : ''].filter(Boolean).join(' ') || undefined} /></label>}
              {register && !emailMode && <p id="password-hint" className="muted">{t('registerHint')}</p>}
              <FailureNotice failure={error} />
              <button disabled={pending || !ready} type="submit">{pending ? t('pending') : emailMode ? text.sendVerification : register ? t('register') : t('login')}</button>
            </form>
            {!register && capability?.passwordRecoveryAvailable && <p className="form-alternate"><Link to="/forgot-password">{text.forgotPassword}</Link></p>}
            <p className="form-alternate"><Link to={`${register ? '/login' : '/register'}${returnQuery}`}>{t(register ? 'login' : 'register')}</Link></p>
          </>}
  </section>
}
