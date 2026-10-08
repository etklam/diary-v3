import { authCapabilitiesSchema } from '@diary/contracts'
import { defaultWorkspacePath, markSignedIn, safeAuthReturnPath } from './session'
import { apiFailure, FailureNotice, invalidField, type Failure } from './api-error'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, useUi } from './ui'
import { AuthPage } from './auth-page'
import { authAsideCopy } from './auth-copy'
import { recoveryPathOffered } from './auth-recovery'
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
    confirm: '確認密碼',
    mismatch: '兩次輸入的密碼不一致。',
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
    confirm: '确认密码',
    mismatch: '两次输入的密码不一致。',
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
    confirm: 'Confirm password',
    mismatch: 'The passwords do not match.',
    retry: 'Try again',
  },
} as const

type Capability = ReturnType<typeof authCapabilitiesSchema.parse>
type CapabilityState = 'loading' | 'ready' | 'error'

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get('retry-after')?.trim()
  if (!raw) return 0
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  const retryAt = Date.parse(raw)
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : 0
}

export function AuthForm({ register = false, supportUrl = null }: { register?: boolean; supportUrl?: string | null }) {
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
  const [confirm, setConfirm] = useState('')
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
    // Registration is the one password this account may never be able to
    // recover: with optional account email unconfigured there is no reset path
    // at all. It gets the same confirmation `/settings/security` already has.
    if (register && password !== confirm) { setError({ message: text.mismatch, fields: ['confirm'] }); return }
    setPending(true)
    setError(null)
    try {
      const result = register
        ? await api.POST('/api/auth/register', { body: { email: email.trim(), password, name: name.trim() || undefined } })
        : await api.POST('/api/auth/login', { body: { email: email.trim(), password } })
      if (!result.response.ok) { setError(apiFailure(result.error, t('failed'))); return }
      if (register) { setDirectDone(true); return }
      markSignedIn()
      // The sign-in response already carries the chosen start page, so the
      // first screen is not held behind a second settings request.
      const destination = search.has('returnTo')
        ? returnTo
        : defaultWorkspacePath(result.data && 'data' in result.data ? result.data.data.defaultWorkspacePage : undefined)
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

  return <AuthPage lede={authAsideCopy[locale][register ? 'register' : 'signIn']}>
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
              {register && !emailMode && <label>{text.confirm}<input disabled={!ready || pending} name="confirm" value={confirm} onChange={event => setConfirm(event.target.value)} aria-invalid={invalidField(error, 'confirm')} type="password" autoComplete="new-password" minLength={8} required aria-describedby={['password-hint', error ? 'form-error' : ''].filter(Boolean).join(' ')} /></label>}
              {register && !emailMode && <p id="password-hint" className="muted">{t('registerHint')}</p>}
              <FailureNotice failure={error} messageOverride={error?.fields.includes('confirm') ? text.mismatch : undefined} />
              <button disabled={pending || !ready} type="submit">{pending ? t('pending') : emailMode ? text.sendVerification : register ? t('register') : t('login')}</button>
            </form>
            {/* The alternative journey carries weight; recovery stays quiet and
                only appears when account email can actually deliver it. */}
            <div className="auth-alternate">
              <Link className="button secondary" to={`${register ? '/login' : '/register'}${returnQuery}`}>{t(register ? 'login' : 'register')}</Link>
              {!register && recoveryPathOffered(capability, supportUrl) && <Link className="auth-recovery" to="/forgot-password">{text.forgotPassword}</Link>}
            </div>
          </>}
  </AuthPage>
}
