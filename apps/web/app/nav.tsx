import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { ActionButton, Disclosure, DisclosureSummary, useUi } from './ui'
import { BrandMark, Icon, type IconName } from './icons'
import { TOOLS } from './tool-shell'
import { CaptureChoices } from './quick-entry'
import { CommandPaletteTrigger } from './command-palette'
import { extraCopy, workspaceCopy } from './destinations'
import { useReviewCount } from './use-review-count'
import { usePendingPathname } from './navigation-progress'

type Role = 'USER' | 'ADMIN' | null

const sectionCopy = {
  'zh-TW': { diary: '日記與複盤', investing: '投資與市場', account: '帳戶', admin: '管理' },
  'zh-CN': { diary: '日记与复盘', investing: '投资与市场', account: '账户', admin: '管理' },
  en: { diary: 'Diary & review', investing: 'Investing & markets', account: 'Account', admin: 'Administration' },
} as const

const navCopy = {
  'zh-TW': { waiting: '項待複盤' },
  'zh-CN': { waiting: '项待复盘' },
  en: { waiting: 'waiting for review' },
} as const

/**
 * Remembers whether a secondary group is expanded. Owning the current route
 * still forces it open, so arriving by any other means never hides where you
 * are; otherwise the reader's own last choice wins over a collapsed default.
 */
function usePersistedDisclosure(key: string, forcedOpen: boolean) {
  const storageKey = `diary-v3:nav-open:${key}`
  const [remembered, setRemembered] = useState(false)
  useEffect(() => {
    try {
      setRemembered(localStorage.getItem(storageKey) === '1')
    } catch {
      /* Navigation stays usable when device storage is unavailable. */
    }
  }, [storageKey])
  function remember(open: boolean) {
    setRemembered(open)
    try {
      localStorage.setItem(storageKey, open ? '1' : '0')
    } catch {
      /* The session keeps the choice even when it cannot be persisted. */
    }
  }
  return { open: forcedOpen || remembered, remember }
}

function label(locale: keyof typeof sectionCopy, values: { en: string; 'zh-CN': string; 'zh-TW': string }) {
  return values[locale]
}

/**
 * Reports whether a scroll container still has content past its bottom edge,
 * as `data-scroll-more` on the element itself.
 *
 * The sidebar scrolls the whole column — roughly thirty destinations never fit
 * a laptop viewport — and the account controls are glued over its bottom edge
 * with an opaque background, so the list slides under a block that has no edge
 * of its own. A list that continues then looks exactly like a list that ended,
 * and the platform scrollbar is no help: macOS and iOS keep overlay scrollbars
 * hidden until the pointer actually moves, so at rest nothing at all says the
 * column goes on. This reports the one fact a reader needs, and stops
 * reporting it at the end of the list so the cue never claims more than there is.
 *
 * Returns a ref callback rather than taking a ref object: confirming the
 * session swaps the chrome, so the element this measures mounts and unmounts
 * during the session's life and the measurement has to follow it.
 */
export function useScrollAffordance() {
  const [element, setElement] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!element) return
    let frame = 0
    const measure = () => {
      frame = 0
      // A fractional scroll offset is a sub-pixel artifact, not content.
      const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
      element.dataset.scrollMore = remaining > 1 ? 'true' : 'false'
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    element.addEventListener('scroll', schedule, { passive: true })
    // The column's own height answers a viewport resize; the list's height
    // changes without one every time a disclosure opens or the admin group
    // mounts, so both the box and what it holds are watched.
    const resize = new ResizeObserver(schedule)
    resize.observe(element)
    const content = new MutationObserver(schedule)
    content.observe(element, { childList: true, subtree: true, attributeFilter: ['open'] })
    return () => {
      element.removeEventListener('scroll', schedule)
      resize.disconnect()
      content.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [element])
  return setElement
}

function usePageScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previousOverflow
    }
  }, [locked])
}

export type NavigationOwner =
  | 'overview'
  | 'diary'
  | 'timeline'
  | 'calendar'
  | 'reviews'
  | 'aiReports'
  | 'diaryReminders'
  | 'partners'
  | 'holdings'
  | 'watchlist'
  | 'tradePlans'
  | 'priceReminders'
  | 'discipline'
  | 'marketResearch'
  | 'gurus'
  | 'tools'
  | 'articles'
  | 'achievements'
  | 'guide'
  | 'settings'
  | 'adminBlog'
  | 'adminUsers'
  | 'adminGurus'
  | 'adminInstitutional'
  | 'adminAi'
  | 'adminResearch'
  | 'adminEtf'
  | 'adminEmail'
  | null

export function navigationOwner(pathname: string): NavigationOwner {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/') return 'overview'
  if (path === '/reviews/ai-reports') return 'aiReports'
  if (path === '/reviews' || /^\/diaries\/[1-9]\d*\/review$/.test(path)) return 'reviews'
  if (path === '/timeline' || path === '/partners/compare') return 'timeline'
  if (path === '/calendar') return 'calendar'
  if (path === '/diaries' || path.startsWith('/diaries/')) return 'diary'
  if (path === '/alerts') return 'diaryReminders'
  if (path === '/partners') return 'partners'
  if (path === '/stocks/watchlist') return 'watchlist'
  if (path === '/stocks/alerts') return 'priceReminders'
  if (path === '/stocks' || path === '/strategy-performance') return 'holdings'
  if (path === '/gurus' || path.startsWith('/gurus/')) return 'gurus'
  if (path === '/trade-plans' || path.startsWith('/trade-plans/')) return 'tradePlans'
  if (path === '/discipline' || path.startsWith('/discipline/')) return 'discipline'
  if (/^\/stocks\/[^/]+(?:\/thesis)?$/.test(path)) return 'marketResearch'
  if (path === '/tools' || path.startsWith('/tools/') || path === '/etf/watchlist') return 'tools'
  if (path === '/articles' || path.startsWith('/articles/')) return 'articles'
  if (path === '/settings' || path.startsWith('/settings/')) return 'settings'
  if (path === '/achievements') return 'achievements'
  if (path === '/guide') return 'guide'
  if (path === '/admin/blog' || path.startsWith('/admin/blog/')) return 'adminBlog'
  if (path === '/admin/users' || path.startsWith('/admin/users/')) return 'adminUsers'
  if (path === '/admin/gurus' || path.startsWith('/admin/gurus/')) return 'adminGurus'
  if (path === '/admin/institutional' || path.startsWith('/admin/institutional/')) return 'adminInstitutional'
  if (path === '/admin/ai' || path.startsWith('/admin/ai/')) return 'adminAi'
  if (path === '/admin/research' || path.startsWith('/admin/research/')) return 'adminResearch'
  if (path === '/admin/etf' || path.startsWith('/admin/etf/')) return 'adminEtf'
  if (path === '/admin/email-settings' || path.startsWith('/admin/email-settings/')) return 'adminEmail'
  return null
}

/* Market research has no sidebar entry of its own. `/stocks/:symbol` has no
   index, so naming it in the list would mean silently picking a company; the
   list used to carry a ticker field instead, which cost 96px — nearly three
   rows — to duplicate the command palette four rows above it. The palette
   already resolves a bare ticker to that company, and `destinations()` lists
   Market research at the ticker the field defaulted to, so both ways in
   survive the field's removal. */

/** Tool shortcuts from the shared registry, so a signed-in reader reaches every
 * tool the public header already discloses instead of only the index. */
function NavToolShortcuts({ onNavigate, forcedOpen }: { onNavigate?: () => void; forcedOpen: boolean }) {
  const { locale } = useUi()
  const c = workspaceCopy[locale]
  const disclosure = usePersistedDisclosure('tools', forcedOpen)
  return (
    <Disclosure
      className="nav-more"
      open={disclosure.open}
      onToggle={event => disclosure.remember(event.currentTarget.open)}
    >
      <DisclosureSummary>{c.tools}</DisclosureSummary>
      <div className="nav-group-links nav-secondary-links">
        {TOOLS.map(tool => (
          <Link key={tool.href} to={tool.href} onClick={onNavigate}>
            <Icon name={tool.icon} />
            {tool.name[locale]}
          </Link>
        ))}
      </div>
    </Disclosure>
  )
}

export function NavigationLinks({
  role,
  onNavigate,
  idPrefix = 'nav',
  showDiaryViews = true,
  showAccount = true,
}: {
  role: Role
  onNavigate?: () => void
  idPrefix?: string
  showDiaryViews?: boolean
  showAccount?: boolean
}) {
  const { locale } = useUi()
  const location = useLocation()
  const sections = sectionCopy[locale]
  const c = workspaceCopy[locale]
  const n = navCopy[locale]
  const owner = navigationOwner(location.pathname)
  // The destination a click is still loading. It takes the selection treatment
  // immediately, so the list answers the click in the frame it happens rather
  // than when the loader resolves; `aria-current` below still moves only on the
  // route that arrived, so assistive technology is never told otherwise
  // (ticket 118).
  const pendingPath = usePendingPathname()
  const pendingOwner = pendingPath === null ? null : navigationOwner(pendingPath)
  const waiting = useReviewCount()
  const diary = usePersistedDisclosure(
    'diary-management',
    owner === 'aiReports' || owner === 'diaryReminders' || owner === 'partners',
  )
  const trade = usePersistedDisclosure('trade-management', owner === 'priceReminders' || owner === 'discipline')
  const admin = usePersistedDisclosure('administration', location.pathname.startsWith('/admin'))
  const link = (to: string, text: string, icon: IconName, destination: NavigationOwner, badge = 0) => (
    <Link
      key={to}
      to={to}
      onClick={onNavigate}
      className={
        destination === 'diary' || destination === 'timeline' || destination === 'calendar'
          ? 'nav-diary-view'
          : undefined
      }
      aria-current={owner === destination ? 'page' : undefined}
      data-nav-pending={pendingOwner === destination && owner !== destination ? 'true' : undefined}
      aria-label={badge > 0 ? `${text} · ${badge} ${n.waiting}` : undefined}
    >
      <Icon name={icon} />
      {text}
      {badge > 0 && (
        <span className="nav-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
  return (
    <>
      <div className="nav-overview">{link('/', c.overview, 'home', 'overview')}</div>
      {/* The capture-read-review loop is the product, so those four stay in the
        open list. AI reports, reminders and partner sharing support that loop
        rather than close it, and the earlier arrangement — all seven open —
        pushed them below the fold anyway, where finding them cost a blind
        scroll instead of one labelled click. A disclosure is the cheaper of
        the two, and it opens itself on the routes it owns. */}
      <section className="nav-group" aria-labelledby={`${idPrefix}-diary`}>
        <h2 id={`${idPrefix}-diary`}>{sections.diary}</h2>
        <div className="nav-group-links">
          {showDiaryViews && (
            <>
              {link('/diaries', c.diaryLibrary, 'book', 'diary')}
              {link('/timeline', c.timeline, 'timeline', 'timeline')}
              {link('/calendar', c.calendar, 'calendar', 'calendar')}
            </>
          )}
          {link('/reviews', c.reviewQueue, 'check', 'reviews', waiting ?? 0)}
        </div>
        <Disclosure className="nav-more" open={diary.open} onToggle={event => diary.remember(event.currentTarget.open)}>
          <DisclosureSummary>{c.diaryManagement}</DisclosureSummary>
          <div className="nav-group-links nav-secondary-links">
            {link('/reviews/ai-reports', c.aiReports, 'zap', 'aiReports')}
            {link('/alerts', c.diaryReminders, 'bell', 'diaryReminders')}
            {link('/partners', c.partners, 'users', 'partners')}
          </div>
        </Disclosure>
      </section>
      {/* Tools and the public articles join the investing group rather than hold
        a heading of their own: once the ticker field left, three rows were
        paying for a heading, a rule and the gap around them. */}
      <section className="nav-group" aria-labelledby={`${idPrefix}-investing`}>
        <h2 id={`${idPrefix}-investing`}>{sections.investing}</h2>
        <div className="nav-group-links">
          {link('/stocks', c.holdings, 'briefcase', 'holdings')}
          {link('/stocks/watchlist', c.watchlist, 'star', 'watchlist')}
          {link(
            '/gurus',
            label(locale, { en: 'Guru portfolios', 'zh-CN': '投资大师', 'zh-TW': '投資大師' }),
            'layers',
            'gurus',
          )}
          {link('/trade-plans', c.tradePlans, 'clipboard', 'tradePlans')}
          {link('/tools', c.tools, 'wrench', 'tools')}
          {link('/articles', c.publicArticles, 'fileText', 'articles')}
        </div>
        <Disclosure className="nav-more" open={trade.open} onToggle={event => trade.remember(event.currentTarget.open)}>
          <DisclosureSummary>{c.tradeManagement}</DisclosureSummary>
          <div className="nav-group-links nav-secondary-links">
            {link('/stocks/alerts', c.priceReminders, 'bell', 'priceReminders')}
            {link('/discipline', c.principles, 'shield', 'discipline')}
          </div>
        </Disclosure>
        <NavToolShortcuts onNavigate={onNavigate} forcedOpen={owner === 'tools' && location.pathname !== '/tools'} />
      </section>
      {/* Desktop renders these two in the pinned block at the foot of the column
        instead, where they are always visible; see `AccountLinks`. */}
      {showAccount && (
        <section className="nav-group nav-account" aria-labelledby={`${idPrefix}-account`}>
          <h2 id={`${idPrefix}-account`}>{sections.account}</h2>
          <div className="nav-group-links">
            {link('/guide', extraCopy[locale].guide, 'compass', 'guide')}
            {link('/achievements', c.achievements, 'target', 'achievements')}
            {link('/settings', c.settings, 'settings', 'settings')}
          </div>
        </section>
      )}
      {role === 'ADMIN' && (
        <section className="nav-group" aria-labelledby={`${idPrefix}-admin`}>
          <h2 id={`${idPrefix}-admin`}>{sections.admin}</h2>
          <Disclosure
            className="nav-more"
            open={admin.open}
            onToggle={event => admin.remember(event.currentTarget.open)}
          >
            <DisclosureSummary>{sections.admin}</DisclosureSummary>
            <div className="nav-group-links nav-secondary-links">
              {link(
                '/admin/blog',
                label(locale, { en: 'Article management', 'zh-CN': '文章管理', 'zh-TW': '文章管理' }),
                'fileText',
                'adminBlog',
              )}
              {link(
                '/admin/users',
                label(locale, { en: 'User management', 'zh-CN': '用户管理', 'zh-TW': '用戶管理' }),
                'users',
                'adminUsers',
              )}
              {link(
                '/admin/gurus',
                label(locale, { en: 'Guru management', 'zh-CN': '投资大师管理', 'zh-TW': '投資大師管理' }),
                'layers',
                'adminGurus',
              )}
              {link(
                '/admin/institutional/mappings',
                label(locale, { en: 'Institutional mappings', 'zh-CN': '机构持仓映射', 'zh-TW': '機構持倉映射' }),
                'layers',
                'adminInstitutional',
              )}
              {link('/admin/ai', c.adminAi, 'compass', 'adminAi')}
              {link('/admin/research', c.researchStudio, 'chart', 'adminResearch')}
              {link(
                '/admin/etf',
                label(locale, { en: 'ETF catalog', 'zh-CN': 'ETF 目录管理', 'zh-TW': 'ETF 目錄管理' }),
                'layers',
                'adminEtf',
              )}
              {link('/admin/email-settings', c.adminEmail, 'settings', 'adminEmail')}
            </div>
          </Disclosure>
        </section>
      )}
    </>
  )
}

/**
 * The Account group, rendered into the pinned block at the foot of the desktop
 * column. Two links do not earn a heading, a rule and the gap around them at
 * the end of a list that scrolls — and down there both were below the fold.
 * Pinned, they cost nothing and are always reachable.
 */
export function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { locale } = useUi()
  const location = useLocation()
  const c = workspaceCopy[locale]
  const e = extraCopy[locale]
  const owner = navigationOwner(location.pathname)
  const pendingPath = usePendingPathname()
  const pendingOwner = pendingPath === null ? null : navigationOwner(pendingPath)
  const pending = (destination: NavigationOwner) =>
    pendingOwner === destination && owner !== destination ? 'true' : undefined
  return (
    <>
      {/* The guide used to leave the product at sign-in: it rendered in the
        public header, drawer and footer, and nowhere in the workspace. For a
        product this dense with terms a new investor has to learn, that is the
        wrong way round. It joins the pinned block rather than the scrolling
        list so it cannot fall below the fold (ticket 139). */}
      <Link
        to="/guide"
        onClick={onNavigate}
        aria-current={owner === 'guide' ? 'page' : undefined}
        data-nav-pending={pending('guide')}
      >
        <Icon name="compass" />
        {e.guide}
      </Link>
      <Link
        to="/achievements"
        onClick={onNavigate}
        aria-current={owner === 'achievements' ? 'page' : undefined}
        data-nav-pending={pending('achievements')}
      >
        <Icon name="target" />
        {c.achievements}
      </Link>
      <Link
        to="/settings"
        onClick={onNavigate}
        aria-current={owner === 'settings' ? 'page' : undefined}
        data-nav-pending={pending('settings')}
      >
        <Icon name="settings" />
        {c.settings}
      </Link>
    </>
  )
}

export function MobileMenu({
  role,
  authenticated,
  preferences,
  onLogout,
  logoutPending,
  logoutError,
}: {
  role: Role
  authenticated: boolean | null
  preferences: ReactNode
  onLogout: () => void
  logoutPending: boolean
  logoutError: boolean
}) {
  const { locale, t } = useUi()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  usePageScrollLock(open)
  const menu = label(locale, { en: 'Menu', 'zh-CN': '菜单', 'zh-TW': '選單' })

  function close() {
    setOpen(false)
    if (dialog.current?.open) dialog.current.close()
    requestAnimationFrame(() => trigger.current?.focus())
  }
  function show() {
    setOpen(true)
    requestAnimationFrame(() => dialog.current?.showModal())
  }
  useEffect(() => {
    const current = dialog.current
    if (!current) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      close()
    }
    current.addEventListener('cancel', onCancel)
    return () => current.removeEventListener('cancel', onCancel)
  })
  return (
    <>
      <div className="mobile-shell-header">
        <Link className="brand" to="/">
          <BrandMark size={26} />
          <div>
            <span className="brand-name mobile-brand-name">
              <strong>Trade</strong> basic
            </span>
            <span className="brand-sub">{t('workspace')}</span>
          </div>
        </Link>
        {/* Search before Menu: on a phone the bottom bar owns the diary loop, so
          the top bar's job is reaching everything else — by name, or by list. */}
        <div className="mobile-shell-actions">
          {authenticated === true && <CommandPaletteTrigger compact />}
          <button
            type="button"
            className="secondary mobile-menu-trigger"
            ref={trigger}
            data-testid="mobile-menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={show}
          >
            {menu}
          </button>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="mobile-menu-dialog"
        data-testid="mobile-menu-dialog"
        aria-labelledby="mobile-menu-title"
        onClick={event => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div className="mobile-menu-panel">
          <header className="mobile-menu-header">
            <h2 id="mobile-menu-title" tabIndex={-1}>
              {menu}
            </h2>
            <button type="button" className="secondary" onClick={close}>
              {t('close')}
            </button>
          </header>
          {authenticated === true && (
            <section className="mobile-menu-capture" aria-labelledby="mobile-capture-title">
              <h2 id="mobile-capture-title">{label(locale, { en: 'Capture', 'zh-CN': '记录', 'zh-TW': '記錄' })}</h2>
              <div className="quick-entry-controls">
                <CaptureChoices mobile onNavigate={close} />
              </div>
            </section>
          )}
          <nav aria-label={t('navigation')}>
            <NavigationLinks role={role} idPrefix="mobile-nav" onNavigate={close} showDiaryViews={false} />
          </nav>
          <div className="mobile-menu-preferences">
            {preferences}
            {(authenticated || logoutError || logoutPending) && (
              <ActionButton
                type="button"
                className="secondary"
                data-testid="mobile-sign-out"
                pending={logoutPending}
                onClick={() => {
                  close()
                  onLogout()
                }}
              >
                {t('logout')}
              </ActionButton>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}

// ---- Public site navigation (single-row header + compact drawer) ----

const publicCopy = {
  'zh-TW': {
    tools: '工具',
    articles: '文章',
    guide: '使用說明',
    about: '關於',
    shortcuts: '工具快捷入口',
    menu: '選單',
    workspace: '返回工作區',
    manageArticles: '管理文章',
  },
  'zh-CN': {
    tools: '工具',
    articles: '文章',
    guide: '使用说明',
    about: '关于',
    shortcuts: '工具快捷入口',
    menu: '菜单',
    workspace: '返回工作区',
    manageArticles: '管理文章',
  },
  en: {
    tools: 'Tools',
    articles: 'Articles',
    guide: 'Guide',
    about: 'About',
    shortcuts: 'Tool shortcuts',
    menu: 'Menu',
    workspace: 'Workspace',
    manageArticles: 'Manage articles',
  },
} as const

/** Tools text links to /tools; the chevron next to it discloses tool shortcuts from the shared TOOLS registry. */
function ToolsDisclosure({ onNavigate }: { onNavigate?: () => void }) {
  const { locale } = useUi()
  const c = publicCopy[locale]
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  return (
    <div className="nav-tools" ref={wrap}>
      <NavLink to="/tools" onClick={onNavigate}>
        {c.tools}
      </NavLink>
      <button
        type="button"
        ref={trigger}
        className="nav-tools-trigger"
        aria-label={c.shortcuts}
        aria-expanded={open}
        aria-controls="tools-shortcuts"
        onClick={() => setOpen(v => !v)}
      >
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="tools-menu-panel" id="tools-shortcuts">
          {TOOLS.map(tool => (
            <Link
              key={tool.href}
              to={tool.href}
              onClick={() => {
                setOpen(false)
                onNavigate?.()
              }}
            >
              <Icon name={tool.icon} size={16} />
              {tool.name[locale]}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function PublicNavLinks({ onNavigate, disclosure = true }: { onNavigate?: () => void; disclosure?: boolean }) {
  const { locale } = useUi()
  const c = publicCopy[locale]
  return (
    <>
      {disclosure ? (
        <ToolsDisclosure onNavigate={onNavigate} />
      ) : (
        <NavLink to="/tools" onClick={onNavigate}>
          {c.tools}
        </NavLink>
      )}
      <NavLink to="/articles" onClick={onNavigate}>
        {c.articles}
      </NavLink>
      <NavLink to="/guide" onClick={onNavigate}>
        {c.guide}
      </NavLink>
      <NavLink to="/about" onClick={onNavigate}>
        {c.about}
      </NavLink>
    </>
  )
}

/** Compact public drawer: full navigation, the tool list, preferences and registration. */
const PUBLIC_MENU_DESKTOP_MEDIA = '(min-width: 1024px)'

export function PublicMenu({
  preferences,
  authenticated,
  role,
}: {
  preferences: ReactNode
  authenticated: boolean | null
  role: Role
}) {
  const { locale, t } = useUi()
  const c = publicCopy[locale]
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  usePageScrollLock(open)
  function close() {
    setOpen(false)
    if (dialog.current?.open) dialog.current.close()
    requestAnimationFrame(() => trigger.current?.focus())
  }
  function show() {
    setOpen(true)
    requestAnimationFrame(() => dialog.current?.showModal())
  }
  useEffect(() => {
    if (!open) return
    const desktopMedia = window.matchMedia(PUBLIC_MENU_DESKTOP_MEDIA)
    const closeOnDesktop = () => {
      if (!desktopMedia.matches) return
      setOpen(false)
      if (dialog.current?.open) dialog.current.close()
      requestAnimationFrame(() => {
        if (desktopMedia.matches) document.querySelector<HTMLElement>('.public-nav a')?.focus()
      })
    }
    if (desktopMedia.matches) closeOnDesktop()
    desktopMedia.addEventListener('change', closeOnDesktop)
    return () => desktopMedia.removeEventListener('change', closeOnDesktop)
  }, [open])
  useEffect(() => {
    const current = dialog.current
    if (!current) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      close()
    }
    current.addEventListener('cancel', onCancel)
    return () => current.removeEventListener('cancel', onCancel)
  })
  return (
    <>
      <button
        type="button"
        className="secondary mobile-menu-trigger public-menu-trigger"
        ref={trigger}
        data-testid="mobile-menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        {c.menu}
      </button>
      <dialog
        ref={dialog}
        className="public-menu-dialog"
        data-testid="mobile-menu-dialog"
        aria-labelledby="public-menu-title"
        onClick={event => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <div className="public-menu-panel">
          <header className="mobile-menu-header">
            <h2 id="public-menu-title" tabIndex={-1}>
              {c.menu}
            </h2>
            <button type="button" className="secondary" onClick={close}>
              {t('close')}
            </button>
          </header>
          <nav aria-label={t('navigation')}>
            <PublicNavLinks onNavigate={close} disclosure={false} />
          </nav>
          <section aria-labelledby="public-menu-tools-title">
            <h2 id="public-menu-tools-title" className="public-menu-tools-title">
              {c.tools}
            </h2>
            <div className="public-menu-tools">
              {TOOLS.map(tool => (
                <Link key={tool.href} to={tool.href} onClick={close}>
                  <Icon name={tool.icon} size={16} />
                  {tool.name[locale]}
                </Link>
              ))}
            </div>
          </section>
          <div className="public-menu-preferences">
            {preferences}
            {authenticated === true ? (
              <>
                {role === 'ADMIN' && (
                  <Link to="/admin/blog" onClick={close}>
                    {c.manageArticles}
                  </Link>
                )}
                <Link className="button secondary" to="/" onClick={close}>
                  {c.workspace}
                </Link>
              </>
            ) : (
              <Link className="button" to="/register" onClick={close}>
                {t('register')}
              </Link>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}
