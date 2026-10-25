import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type DetailsHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { csrfToken, sessionFetch, useSessionState } from './session'
import { createApiClient } from '@diary/api-client'
import { Icon } from './icons'

const copy = {
  'zh-TW': {
    skip: '跳至內容',
    workspace: '投資決策日記',
    navigation: '主要導航',
    home: '開始',
    write: '寫日記',
    language: '語言',
    theme: '顯示模式',
    system: '跟隨系統',
    light: '明亮',
    dark: '深色',
    title: '把今天的判斷，留給未來的自己。',
    intro: '記下觀察、理由與還未確定的事情。從第一篇日記開始，保留當時的思考。',
    logout: '登出',
    logoutFailed: '未能確認伺服器已登出。私人畫面已清除，請重試登出。',
    login: '登入',
    register: '建立帳戶',
    email: '電郵',
    password: '密碼',
    name: '名稱',
    pending: '處理中…',
    loginTitle: '回到你的日記',
    registerTitle: '開始你的投資日記',
    registerHint: '密碼至少 8 個字元。註冊後請登入。',
    registered: '帳戶已建立。請登入以開始記錄。',
    failed: '操作未完成。請檢查輸入或稍後再試。',
    connection: '暫時無法連線。內容仍然保留，請重試。',
    date: '日記日期',
    diaryTitle: '標題',
    content: '內容',
    save: '儲存日記',
    newTitle: '今天，你在想甚麼？',
    newHint: '保留原本的觀察，毋須急着為它下結論。',
    loading: '正在載入…',
    retry: '重試',
    loginRequired: '請先登入，再開始記錄。',
    readTitle: '日記',
    saved: '日記已儲存',
    contentHint: '寫下今天的觀察與判斷。',
    unsaved: '尚未儲存',
    preview: '設計預覽',
    synthetic: '合成資料・設計預覽，不代表真實帳戶或市場',
    overview: '總覽',
    company: '公司研究',
    review: '複盤',
    attention: '待處理',
    recent: '近期判斷',
    current: '目前觀點・可編輯',
    original: '原始判斷',
    reflection: '事後複盤',
    evidence: '後續證據',
    sampleTitle: '價格回落後，我仍在等待甚麼？',
    sampleBody: '原先假設需求會回升；本週觀察尚不足以確認，先保留現金。',
    sampleReflection: '價格變化不等於假設得到證明。下次先記下判斷成立所需的證據。',
    sampleEvidence: '合成觀察：本週需求數據仍未確認回升。',
    due: '待複盤',
    quote: '行情尚未取得',
    noQuote: '缺少報價時保留研究內容，不以 0 代替。',
    private: '只供自己的決策記錄',
    emptyPreview: '顯示空狀態',
    empty: '目前沒有待處理複盤。',
    table: '合成證據比較',
    observation: '觀察',
    source: '來源',
    assessment: '評估',
    quick: '快速記錄',
    close: '關閉',
    previewQuick: '開啟快速記錄',
    notFound: '無法讀取這篇日記。可能不存在，或你沒有存取權限。',
    preferences: '偏好設定',
    marketColor: '漲跌顏色',
    marketStandard: '綠漲紅跌',
    marketCn: '紅漲綠跌',
    marketCb: '色盲友善',
    cancel: '取消',
    confirmTitle: '確認這個動作',
    discard: '捨棄變更',
  },
  'zh-CN': {
    skip: '跳至内容',
    workspace: '投资决策日记',
    navigation: '主要导航',
    home: '开始',
    write: '写日记',
    language: '语言',
    theme: '显示模式',
    system: '跟随系统',
    light: '明亮',
    dark: '深色',
    title: '把今天的判断，留给未来的自己。',
    intro: '记下观察、理由与还未确定的事情。从第一篇日记开始，保留当时的思考。',
    logout: '退出登录',
    logoutFailed: '无法确认服务器已退出登录。私人页面已清除，请重试退出。',
    login: '登录',
    register: '创建账户',
    email: '邮箱',
    password: '密码',
    name: '名称',
    pending: '处理中…',
    loginTitle: '回到你的日记',
    registerTitle: '开始你的投资日记',
    registerHint: '密码至少 8 个字符。注册后请登录。',
    registered: '账户已创建。请登录以开始记录。',
    failed: '操作未完成。请检查输入或稍后重试。',
    connection: '暂时无法连接。内容仍然保留，请重试。',
    date: '日记日期',
    diaryTitle: '标题',
    content: '内容',
    save: '保存日记',
    newTitle: '今天，你在想什么？',
    newHint: '保留原本的观察，无需急着为它下结论。',
    loading: '正在加载…',
    retry: '重试',
    loginRequired: '请先登录，再开始记录。',
    readTitle: '日记',
    saved: '日记已保存',
    contentHint: '写下今天的观察与判断。',
    unsaved: '尚未保存',
    preview: '设计预览',
    synthetic: '合成数据・设计预览，不代表真实账户或市场',
    overview: '总览',
    company: '公司研究',
    review: '复盘',
    attention: '待处理',
    recent: '近期判断',
    current: '目前观点・可编辑',
    original: '原始判断',
    reflection: '事后复盘',
    evidence: '后续证据',
    sampleTitle: '价格回落后，我仍在等待什么？',
    sampleBody: '原先假设需求会回升；本周观察尚不足以确认，先保留现金。',
    sampleReflection: '价格变化不等于假设得到证明。下次先记下判断成立所需的证据。',
    sampleEvidence: '合成观察：本周需求数据仍未确认回升。',
    due: '待复盘',
    quote: '行情尚未取得',
    noQuote: '缺少报价时保留研究内容，不以 0 代替。',
    private: '只供自己的决策记录',
    emptyPreview: '显示空状态',
    empty: '目前没有待处理复盘。',
    table: '合成证据比较',
    observation: '观察',
    source: '来源',
    assessment: '评估',
    quick: '快速记录',
    close: '关闭',
    previewQuick: '打开快速记录',
    notFound: '无法读取这篇日记。可能不存在，或你没有访问权限。',
    preferences: '偏好设置',
    marketColor: '涨跌颜色',
    marketStandard: '绿涨红跌',
    marketCn: '红涨绿跌',
    marketCb: '色盲友好',
    cancel: '取消',
    confirmTitle: '确认这个操作',
    discard: '舍弃更改',
  },
  en: {
    skip: 'Skip to content',
    workspace: 'Investment decision diary',
    navigation: 'Main navigation',
    home: 'Start',
    write: 'Write a diary',
    language: 'Language',
    theme: 'Appearance',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    title: 'Keep today’s reasoning for your future self.',
    intro:
      'Record your observations, reasons, and unanswered questions. Start with one diary entry and preserve what you thought at the time.',
    logout: 'Sign out',
    logoutFailed: 'Unable to confirm server sign-out. Private content was cleared. Try signing out again.',
    login: 'Sign in',
    register: 'Create account',
    email: 'Email',
    password: 'Password',
    name: 'Name',
    pending: 'Working…',
    loginTitle: 'Return to your diary',
    registerTitle: 'Start your investment diary',
    registerHint: 'Use at least 8 characters for your password. Sign in after registering.',
    registered: 'Your account is ready. Sign in to start recording.',
    failed: 'The action could not be completed. Check your entries or try again later.',
    connection: 'Unable to connect. Your content is still here. Please try again.',
    date: 'Diary date',
    diaryTitle: 'Title',
    content: 'Content',
    save: 'Save diary',
    newTitle: 'What are you thinking about today?',
    newHint: 'Keep the original observation. You do not need a conclusion yet.',
    loading: 'Loading…',
    retry: 'Try again',
    loginRequired: 'Sign in before starting your diary.',
    readTitle: 'Diary',
    saved: 'Diary saved',
    contentHint: 'Write down today’s observations and reasoning.',
    unsaved: 'Not saved yet',
    preview: 'Design preview',
    synthetic: 'Synthetic data · Design preview, not a real account or market',
    overview: 'Overview',
    company: 'Company research',
    review: 'Review',
    attention: 'Needs attention',
    recent: 'Recent decisions',
    current: 'Current view · Editable',
    original: 'Original reasoning',
    reflection: 'Later reflection',
    evidence: 'Later evidence',
    sampleTitle: 'After the price fell, what am I still waiting for?',
    sampleBody:
      'I expected demand to recover. This week’s observations are not enough to confirm that, so I am keeping cash available.',
    sampleReflection:
      'A price change does not prove the hypothesis. Next time, record the evidence needed to confirm it first.',
    sampleEvidence: 'Synthetic observation: this week’s demand data has not confirmed a recovery.',
    due: 'Review due',
    quote: 'Quote unavailable',
    noQuote: 'Research stays readable when quotes are missing. Missing prices are never shown as zero.',
    private: 'Your personal decision record',
    emptyPreview: 'Show empty state',
    empty: 'No reviews need attention right now.',
    table: 'Synthetic evidence comparison',
    observation: 'Observation',
    source: 'Source',
    assessment: 'Assessment',
    quick: 'Quick diary',
    close: 'Close',
    previewQuick: 'Open quick diary',
    notFound: 'Unable to read this diary. It may not exist, or you may not have access.',
    preferences: 'Preferences',
    marketColor: 'Market colors',
    marketStandard: 'Green up · Red down',
    marketCn: 'Red up · Green down',
    marketCb: 'Colorblind-friendly',
    cancel: 'Cancel',
    confirmTitle: 'Confirm this action',
    discard: 'Discard changes',
  },
}
type Locale = keyof typeof copy
type Theme = 'light' | 'dark' | 'system'
type MarketColor = 'standard' | 'cn' | 'cb'
type Key = keyof typeof copy.en
function persistLocaleCookie(locale: Locale) {
  try {
    document.cookie = `diary-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  } catch {
    /* Server locale resolution can use the signed-in account preference. */
  }
}
const UiContext = createContext<{
  t: (key: Key) => string
  locale: Locale
  setLocale: (locale: Locale) => void
  theme: Theme
  marketColor: MarketColor
  ready: boolean
  localeReady: boolean
  localeError: boolean
  retryLocale: () => void
  applyLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
  setMarketColor: (color: MarketColor) => void
} | null>(null)
export function UiProvider({ children }: { children: ReactNode }) {
  const [locale, applyLocale] = useState<Locale>('zh-TW')
  const session = useSessionState()
  const currentSession = useRef(session)
  currentSession.current = session
  const [localePending, setLocalePending] = useState(false)
  const [localeError, setLocaleError] = useState(false)
  const [localeAttempt, setLocaleAttempt] = useState(0)
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null)
  // A null session is still bootstrapping; enabling locale changes here lets account settings overwrite a guest-style update.
  const localeReady =
    session.authenticated === false ||
    (session.authenticated === true && loadedRevision === session.revision && !localePending && !localeError)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])
  const [theme, setTheme] = useState<Theme>('system')
  const [marketColor, setMarketColor] = useState<MarketColor>('standard')
  useEffect(() => {
    try {
      const l = localStorage.getItem('diary-locale')
      const th = localStorage.getItem('diary-theme')
      if (l === 'en' || l === 'zh-CN' || l === 'zh-TW') applyLocale(l)
      if (th === 'dark' || th === 'light' || th === 'system') setTheme(th)
      const mc = localStorage.getItem('diary-market-color')
      if (mc === 'cn' || mc === 'cb') setMarketColor(mc)
    } catch {
      /* Preferences remain usable when storage is disabled. */
    }
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    try {
      localStorage.setItem('diary-locale', locale)
    } catch {
      /* Optional preference storage. */
    }
    persistLocaleCookie(locale)
  }, [locale])
  useEffect(() => {
    if (!ready) return
    document.documentElement.dataset.theme = theme
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateThemeColor = () =>
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' || (theme === 'system' && media.matches) ? '#111219' : '#f9fafd')
    updateThemeColor()
    media.addEventListener('change', updateThemeColor)
    try {
      localStorage.setItem('diary-theme', theme)
    } catch {
      /* Optional preference storage. */
    }
    return () => media.removeEventListener('change', updateThemeColor)
  }, [theme, ready])
  useEffect(() => {
    if (!ready) return
    document.documentElement.dataset.marketColor = marketColor === 'standard' ? '' : marketColor
    try {
      localStorage.setItem('diary-market-color', marketColor)
    } catch {
      /* Optional preference storage. */
    }
  }, [marketColor, ready])
  useEffect(() => {
    if (!session.authenticated) {
      setLoadedRevision(null)
      setLocaleError(false)
      setLocalePending(false)
      return
    }
    let active = true
    setLocalePending(true)
    setLocaleError(false)
    api
      .GET('/api/user/settings')
      .then(result => {
        if (!active) return
        if (result.response.ok && result.data) {
          applyLocale(result.data.settings.locale)
          setLoadedRevision(session.revision)
        } else setLocaleError(true)
      })
      .catch(() => {
        if (active) setLocaleError(true)
      })
      .finally(() => {
        if (active) setLocalePending(false)
      })
    return () => {
      active = false
    }
  }, [session.authenticated, session.revision, localeAttempt])
  function setLocale(value: Locale) {
    if (session.authenticated === null) return
    if (session.authenticated === false) {
      persistLocaleCookie(value)
      applyLocale(value)
      return
    }
    if (!localeReady) return
    const revision = session.revision
    const active = () => currentSession.current.authenticated === true && currentSession.current.revision === revision
    setLocalePending(true)
    setLocaleError(false)
    api
      .PUT('/api/user/settings', { body: { locale: value } })
      .then(result => {
        if (!active()) return
        if (result.response.ok && result.data) {
          persistLocaleCookie(result.data.settings.locale)
          applyLocale(result.data.settings.locale)
        } else setLocaleError(true)
      })
      .catch(() => {
        if (active()) setLocaleError(true)
      })
      .finally(() => {
        if (active()) setLocalePending(false)
      })
  }
  return (
    <UiContext
      value={{
        t: key => copy[locale][key],
        locale,
        setLocale,
        applyLocale,
        theme,
        setTheme,
        marketColor,
        setMarketColor,
        ready,
        localeReady,
        localeError,
        retryLocale: () => setLocaleAttempt(value => value + 1),
      }}
    >
      {children}
    </UiContext>
  )
}
export function useUi() {
  const context = useContext(UiContext)
  if (!context) throw new Error('UiProvider missing')
  return context
}
/** Skeleton placeholder for list/table loading states; keeps layout roughly stable and exposes the text status to assistive tech. */
export function LoadingBlock({ label, lines = 4 }: { label: string; lines?: number }) {
  return (
    <div role="status">
      <div className="skeleton-list" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <div key={index} className="skeleton skeleton-line" />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}
/**
 * The one disclosure in the product.
 *
 * The `details` element stays — it keeps the browser's own keyboard model,
 * which this system prefers to an application-menu role. The platform *marker*
 * is the part that was never ours: 29 of 35 disclosures used to render the OS
 * triangle beside controls built to a 44px floor with a tokenised border and a
 * focus halo, so the open/closed affordance read differently on nearly every
 * page that had one (ticket 122). This pair owns the marker suppression, the
 * chevron from the single `icons.tsx` family, the target height and the
 * open/closed rotation. A page keeps its own class for layout and inherits the
 * treatment; `scripts/check-disclosures.mjs` fails if a raw disclosure element
 * returns anywhere but here.
 */
export function Disclosure({
  className,
  children,
  ...rest
}: { children?: ReactNode; ref?: Ref<HTMLDetailsElement> } & DetailsHTMLAttributes<HTMLDetailsElement>) {
  return (
    <details {...rest} className={['disclosure', className].filter(Boolean).join(' ')}>
      {children}
    </details>
  )
}
export function DisclosureSummary({
  className,
  children,
  ...rest
}: { children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <summary {...rest} className={['disclosure-summary', className].filter(Boolean).join(' ')}>
      <Icon name="chevronDown" size={16} />
      {children}
    </summary>
  )
}

/**
 * A control whose action can be in flight.
 *
 * The pattern this replaces was a label swap — `busy ? t('pending') : c.save`
 * at roughly twenty-five call sites. Swapping the label changes the control's
 * width mid-submit, so the action row reflows at exactly the moment the reader
 * is watching it, and every call site re-derived the behaviour. Here the label
 * is left alone and the in-flight state is carried by `.is-pending`, a rule
 * along the control's bottom edge that occupies no layout (styles.css). The
 * translated pending string still reaches assistive technology, alongside
 * `aria-busy`.
 *
 * A submit in flight is one of the two sanctioned reasons to disable a button,
 * so `pending` disables on its own; an additional unmet precondition is still
 * passed as `disabled`.
 */
export function ActionButton({
  pending = false,
  disabled,
  className,
  children,
  ...rest
}: { pending?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { t } = useUi()
  const classes = [className, pending ? 'is-pending' : null].filter(Boolean).join(' ')
  return (
    <button {...rest} className={classes || undefined} disabled={disabled || pending} aria-busy={pending || undefined}>
      {children}
      {pending && <span className="sr-only"> {t('pending')}</span>}
    </button>
  )
}
export type ConfirmRequest = {
  /** What the action does, phrased as the question it is. */
  title: string
  /** The object it acts on — the entry's title, the symbol, the key's label. */
  body?: ReactNode
  /** The affirmative label. Name the action, never "OK". */
  confirm: string
  cancel?: string
  /** `danger` for anything that destroys a record; omit for a reversible choice. */
  tone?: 'danger'
  /** Run with the dialog still open and both controls disabled. */
  action?: () => unknown | Promise<unknown>
}
type PendingConfirm = ConfirmRequest & { settle: (confirmed: boolean) => void }
const ConfirmContext = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null)

/**
 * The one confirmation in the product.
 *
 * `window.confirm` was called 32 times across 15 files. It cannot be styled, it
 * cannot be translated by this app's own i18n, it names the origin rather than
 * the product, and it cannot show *what* is about to be destroyed — on a
 * product whose subject is a durable record of decisions, that last one is the
 * disqualifying part (ticket 122). This dialog names the object, routes every
 * string through the caller's own translated copy, autofocuses the
 * non-destructive choice, disables both controls while the action is in flight,
 * closes on Escape and on the backdrop, and returns focus to whatever opened it.
 *
 * It is one mounted dialog, not one per call site: `useConfirm()` returns an
 * `await`-able function, so a call site reads almost exactly the way the
 * synchronous original did.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useUi()
  const [request, setRequest] = useState<PendingConfirm | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<Element | null>(null)
  const confirm = useCallback(
    (next: ConfirmRequest) =>
      new Promise<boolean>(resolve => {
        trigger.current = document.activeElement
        setRequest({ ...next, settle: resolve })
      }),
    [],
  )
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (request && !element.open) element.showModal()
    if (!request && element.open) element.close()
  }, [request])
  function settle(confirmed: boolean) {
    const current = request
    const previous = trigger.current
    trigger.current = null
    setRequest(null)
    setBusy(false)
    // The dialog is closed by the effect above once `request` clears; focus
    // moves back only after that, or the browser hands it to the body.
    requestAnimationFrame(() => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    })
    current?.settle(confirmed)
  }
  async function accept() {
    if (!request) return
    if (!request.action) {
      settle(true)
      return
    }
    setBusy(true)
    // A failing action reports itself on the surface that owns it; the dialog's
    // job ends either way, and leaving it open would strand the reader.
    try {
      await request.action()
    } catch {
      /* surfaced by the caller */
    }
    settle(true)
  }
  return (
    <ConfirmContext value={confirm}>
      {children}
      <dialog
        ref={dialog}
        className="confirm-dialog"
        data-testid="confirm-dialog"
        aria-labelledby="confirm-dialog-title"
        onCancel={event => {
          event.preventDefault()
          if (!busy) settle(false)
        }}
        onClick={event => {
          if (event.target === event.currentTarget && !busy) settle(false)
        }}
      >
        {request && (
          <>
            <h2 id="confirm-dialog-title">{request.title}</h2>
            {request.body !== undefined && <p className="confirm-dialog-object">{request.body}</p>}
            <div className="actions">
              <button type="button" className="secondary" autoFocus disabled={busy} onClick={() => settle(false)}>
                {request.cancel ?? t('cancel')}
              </button>
              <ActionButton
                type="button"
                className={request.tone === 'danger' ? 'danger-button' : undefined}
                pending={busy}
                onClick={() => void accept()}
              >
                {request.confirm}
              </ActionButton>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext>
  )
}
export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('ConfirmProvider missing')
  return confirm
}
export const api = createApiClient({ fetch: sessionFetch, getCsrfToken: csrfToken })
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null
}
