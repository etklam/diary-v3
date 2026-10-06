import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { stockSymbolSchema } from '@diary/contracts/watchlist'
import { useUi } from './ui'
import { BrandMark, Icon, type IconName } from './icons'
import { TOOLS } from './tool-shell'
import { CaptureChoices } from './quick-entry'
import { CommandPaletteTrigger } from './command-palette'
import { workspaceCopy } from './destinations'
import { useReviewCount } from './use-review-count'

type Role = 'USER' | 'ADMIN' | null

const sectionCopy = {
  'zh-TW': { diary: '日記與複盤', investing: '投資與交易', markets: '市場與工具', account: '帳戶', admin: '管理' },
  'zh-CN': { diary: '日记与复盘', investing: '投资与交易', markets: '市场与工具', account: '账户', admin: '管理' },
  en: { diary: 'Diary & review', investing: 'Investing & trading', markets: 'Markets & tools', account: 'Account', admin: 'Administration' },
} as const

const navCopy = {
  'zh-TW': { lookup: '查公司行情', lookupHint: '輸入代號，或直接查看 SPY。', lookupSubmit: '查看', waiting: '項待複盤' },
  'zh-CN': { lookup: '查公司行情', lookupHint: '输入代号，或直接查看 SPY。', lookupSubmit: '查看', waiting: '项待复盘' },
  en: { lookup: 'Look up a company', lookupHint: 'Enter a ticker, or open SPY.', lookupSubmit: 'Open', waiting: 'waiting for review' },
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
    try { setRemembered(localStorage.getItem(storageKey) === '1') }
    catch { /* Navigation stays usable when device storage is unavailable. */ }
  }, [storageKey])
  function remember(open: boolean) {
    setRemembered(open)
    try { localStorage.setItem(storageKey, open ? '1' : '0') }
    catch { /* The session keeps the choice even when it cannot be persisted. */ }
  }
  return { open: forcedOpen || remembered, remember }
}


function label(locale: keyof typeof sectionCopy, values: { en: string; 'zh-CN': string; 'zh-TW': string }) {
  return values[locale]
}

function usePageScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = previousOverflow }
  }, [locked])
}

export type NavigationOwner = 'overview' | 'diary' | 'timeline' | 'calendar' | 'reviews' | 'aiReports' | 'diaryReminders' | 'partners' | 'holdings' | 'watchlist' | 'tradePlans' | 'priceReminders' | 'discipline' | 'marketResearch' | 'gurus' | 'tools' | 'articles' | 'achievements' | 'settings' | 'adminBlog' | 'adminUsers' | 'adminGurus' | 'adminInstitutional' | 'adminAi' | 'adminResearch' | 'adminEtf' | 'adminEmail' | null

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

/**
 * Market research always opens on a company, because `/stocks/:symbol` has no
 * index — so the entry point asks which one instead of naming "Market research"
 * and silently meaning SPY. An empty submit still opens that former default,
 * shown as the placeholder, so the no-ticker-in-mind case keeps working.
 */
const LOOKUP_DEFAULT_SYMBOL = 'SPY'

function CompanyLookup({ idPrefix, onNavigate, current }: { idPrefix: string; onNavigate?: () => void; current: boolean }) {
  const { locale } = useUi()
  const c = navCopy[locale]
  const navigate = useNavigate()
  const [symbol, setSymbol] = useState('')
  const trimmed = symbol.trim()
  const parsed = stockSymbolSchema.safeParse(trimmed)
  const destination = trimmed === '' ? LOOKUP_DEFAULT_SYMBOL : parsed.success ? parsed.data : null
  // A company page has no nav link to mark, so the field that opens it carries
  // the current state. `aria-current` is a global state, valid off a link.
  return <form className="nav-lookup" data-testid={`${idPrefix}-lookup-form`}
    aria-current={current ? 'page' : undefined} onSubmit={event => {
    event.preventDefault()
    if (destination === null) return
    setSymbol('')
    onNavigate?.()
    navigate(`/stocks/${destination}`)
  }}>
    <label htmlFor={`${idPrefix}-lookup`}>{c.lookup}</label>
    <div className="nav-lookup-row">
      <input id={`${idPrefix}-lookup`} name="symbol" value={symbol} maxLength={32}
        autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        placeholder={LOOKUP_DEFAULT_SYMBOL} aria-describedby={`${idPrefix}-lookup-hint`}
        onChange={event => setSymbol(event.target.value)} />
      <button type="submit" className="secondary" disabled={destination === null}>{c.lookupSubmit}</button>
    </div>
    <p id={`${idPrefix}-lookup-hint`} className="nav-lookup-hint">{c.lookupHint}</p>
  </form>
}

/** Tool shortcuts from the shared registry, so a signed-in reader reaches every
 * tool the public header already discloses instead of only the index. */
function NavToolShortcuts({ onNavigate, forcedOpen }: { onNavigate?: () => void; forcedOpen: boolean }) {
  const { locale } = useUi()
  const c = workspaceCopy[locale]
  const disclosure = usePersistedDisclosure('tools', forcedOpen)
  return <details className="nav-more" open={disclosure.open}
    onToggle={event => disclosure.remember(event.currentTarget.open)}>
    <summary><Icon name="chevronDown" />{c.tools}</summary>
    <div className="nav-group-links nav-secondary-links">
      {TOOLS.map(tool => <Link key={tool.href} to={tool.href} onClick={onNavigate}>
        <Icon name={tool.icon} />{tool.name[locale]}
      </Link>)}
    </div>
  </details>
}

export function NavigationLinks({ role, onNavigate, idPrefix = 'nav', showDiaryViews = true }: { role: Role; onNavigate?: () => void; idPrefix?: string; showDiaryViews?: boolean }) {
  const { locale } = useUi()
  const location = useLocation()
  const sections = sectionCopy[locale]
  const c = workspaceCopy[locale]
  const n = navCopy[locale]
  const owner = navigationOwner(location.pathname)
  const waiting = useReviewCount()
  const trade = usePersistedDisclosure('trade-management', owner === 'priceReminders' || owner === 'discipline')
  const link = (to: string, text: string, icon: IconName, destination: NavigationOwner, badge = 0) => <Link key={to} to={to} onClick={onNavigate} className={destination === 'diary' || destination === 'timeline' || destination === 'calendar' ? 'nav-diary-view' : undefined} aria-current={owner === destination ? 'page' : undefined} aria-label={badge > 0 ? `${text} · ${badge} ${n.waiting}` : undefined}><Icon name={icon} />{text}{badge > 0 && <span className="nav-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}</Link>
  return <>
    <div className="nav-overview">{link('/', c.overview, 'home', 'overview')}</div>
    {/* Diary sub-items stay in the open list rather than behind a disclosure:
        reminders and partner sharing are diary functions, and the product is
        the diary loop, so none of them should cost an extra click. */}
    <section className="nav-group" aria-labelledby={`${idPrefix}-diary`}><h2 id={`${idPrefix}-diary`}>{sections.diary}</h2><div className="nav-group-links">
      {showDiaryViews && <>
        {link('/diaries', c.diaryLibrary, 'book', 'diary')}
        {link('/timeline', c.timeline, 'timeline', 'timeline')}
        {link('/calendar', c.calendar, 'calendar', 'calendar')}
      </>}
      {link('/reviews', c.reviewQueue, 'check', 'reviews', waiting ?? 0)}
      {link('/reviews/ai-reports', c.aiReports, 'zap', 'aiReports')}
      {link('/alerts', c.diaryReminders, 'bell', 'diaryReminders')}
      {link('/partners', c.partners, 'users', 'partners')}
    </div></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-investing`}><h2 id={`${idPrefix}-investing`}>{sections.investing}</h2><div className="nav-group-links">
      {link('/stocks', c.holdings, 'briefcase', 'holdings')}
      {link('/stocks/watchlist', c.watchlist, 'star', 'watchlist')}
      {link('/gurus', label(locale, { en: 'Guru portfolios', 'zh-CN': '投资大师', 'zh-TW': '投資大師' }), 'layers', 'gurus')}
      {link('/trade-plans', c.tradePlans, 'clipboard', 'tradePlans')}
    </div><details className="nav-more" open={trade.open} onToggle={event => trade.remember(event.currentTarget.open)}>
      <summary><Icon name="chevronDown" />{c.tradeManagement}</summary>
      <div className="nav-group-links nav-secondary-links">
        {link('/stocks/alerts', c.priceReminders, 'bell', 'priceReminders')}
        {link('/discipline', c.principles, 'shield', 'discipline')}
      </div>
    </details></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-markets`}><h2 id={`${idPrefix}-markets`}>{sections.markets}</h2>
      <CompanyLookup idPrefix={idPrefix} onNavigate={onNavigate} current={owner === 'marketResearch'} />
      <div className="nav-group-links">
        {link('/tools', c.tools, 'wrench', 'tools')}
      </div>
      <NavToolShortcuts onNavigate={onNavigate} forcedOpen={owner === 'tools' && location.pathname !== '/tools'} />
    </section>
    <section className="nav-group nav-account" aria-labelledby={`${idPrefix}-account`}><h2 id={`${idPrefix}-account`}>{sections.account}</h2><div className="nav-group-links">
      {link('/articles', c.publicArticles, 'fileText', 'articles')}
      {link('/achievements', c.achievements, 'target', 'achievements')}
      {link('/settings', c.settings, 'settings', 'settings')}
    </div></section>
    {role === 'ADMIN' && <section className="nav-group" aria-labelledby={`${idPrefix}-admin`}><h2 id={`${idPrefix}-admin`}>{sections.admin}</h2><div className="nav-group-links">
      {link('/admin/blog', label(locale, { en: 'Article management', 'zh-CN': '文章管理', 'zh-TW': '文章管理' }), 'fileText', 'adminBlog')}
      {link('/admin/users', label(locale, { en: 'User management', 'zh-CN': '用户管理', 'zh-TW': '用戶管理' }), 'users', 'adminUsers')}
      {link('/admin/gurus', label(locale, { en: 'Guru management', 'zh-CN': '投资大师管理', 'zh-TW': '投資大師管理' }), 'layers', 'adminGurus')}
      {link('/admin/institutional/mappings', label(locale, { en: 'Institutional mappings', 'zh-CN': '机构持仓映射', 'zh-TW': '機構持倉映射' }), 'layers', 'adminInstitutional')}
      {link('/admin/ai', c.adminAi, 'compass', 'adminAi')}
      {link('/admin/research', c.researchStudio, 'chart', 'adminResearch')}
      {link('/admin/etf', label(locale, { en: 'ETF catalog', 'zh-CN': 'ETF 目录管理', 'zh-TW': 'ETF 目錄管理' }), 'layers', 'adminEtf')}
      {link('/admin/email-settings', c.adminEmail, 'settings', 'adminEmail')}
    </div></section>}
  </>
}

export function MobileMenu({ role, authenticated, preferences, onLogout, logoutPending, logoutError }: { role: Role; authenticated: boolean | null; preferences: ReactNode; onLogout: () => void; logoutPending: boolean; logoutError: boolean }) {
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
    const onCancel = (event: Event) => { event.preventDefault(); close() }
    current.addEventListener('cancel', onCancel)
    return () => current.removeEventListener('cancel', onCancel)
  })
  return <>
    <div className="mobile-shell-header">
      <Link className="brand" to="/"><BrandMark size={26} /><div><span className="brand-name mobile-brand-name"><strong>Trade</strong> basic</span><span className="brand-sub">{t('workspace')}</span></div></Link>
      {/* Search before Menu: on a phone the bottom bar owns the diary loop, so
          the top bar's job is reaching everything else — by name, or by list. */}
      <div className="mobile-shell-actions">{authenticated === true && <CommandPaletteTrigger compact/>}<button type="button" className="secondary mobile-menu-trigger" ref={trigger} data-testid="mobile-menu" aria-haspopup="dialog" aria-expanded={open} onClick={show}>{menu}</button></div>
    </div>
    <dialog ref={dialog} className="mobile-menu-dialog" data-testid="mobile-menu-dialog" aria-labelledby="mobile-menu-title" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="mobile-menu-panel">
        <header className="mobile-menu-header"><h2 id="mobile-menu-title" tabIndex={-1}>{menu}</h2><button type="button" className="secondary" onClick={close}>{t('close')}</button></header>
        {authenticated === true && <section className="mobile-menu-capture" aria-labelledby="mobile-capture-title"><h2 id="mobile-capture-title">{label(locale, { en: 'Capture', 'zh-CN': '记录', 'zh-TW': '記錄' })}</h2><div className="quick-entry-controls"><CaptureChoices mobile onNavigate={close}/></div></section>}
        <nav aria-label={t('navigation')}><NavigationLinks role={role} idPrefix="mobile-nav" onNavigate={close} showDiaryViews={false}/></nav>
        <div className="mobile-menu-preferences">{preferences}{(authenticated || logoutError || logoutPending) && <button type="button" className="secondary" data-testid="mobile-sign-out" disabled={logoutPending} onClick={() => { close(); onLogout() }}>{t(logoutPending ? 'pending' : 'logout')}</button>}</div>
      </div>
    </dialog>
  </>
}

// ---- Public site navigation (single-row header + compact drawer) ----

const publicCopy = {
  'zh-TW': { tools: '工具', articles: '文章', guide: '使用說明', about: '關於', shortcuts: '工具快捷入口', menu: '選單', workspace: '返回工作區', manageArticles: '管理文章' },
  'zh-CN': { tools: '工具', articles: '文章', guide: '使用说明', about: '关于', shortcuts: '工具快捷入口', menu: '菜单', workspace: '返回工作区', manageArticles: '管理文章' },
  en: { tools: 'Tools', articles: 'Articles', guide: 'Guide', about: 'About', shortcuts: 'Tool shortcuts', menu: 'Menu', workspace: 'Workspace', manageArticles: 'Manage articles' },
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
    const onPointerDown = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
  }, [open])
  return <div className="nav-tools" ref={wrap}>
    <NavLink to="/tools" onClick={onNavigate}>{c.tools}</NavLink>
    <button type="button" ref={trigger} className="nav-tools-trigger" aria-label={c.shortcuts} aria-expanded={open} aria-controls="tools-shortcuts" onClick={() => setOpen(v => !v)}><Icon name="chevronDown" size={16} /></button>
    {open && <div className="tools-menu-panel" id="tools-shortcuts">
      {TOOLS.map(tool => <Link key={tool.href} to={tool.href} onClick={() => { setOpen(false); onNavigate?.() }}><Icon name={tool.icon} size={16} />{tool.name[locale]}</Link>)}
    </div>}
  </div>
}

export function PublicNavLinks({ onNavigate, disclosure = true }: { onNavigate?: () => void; disclosure?: boolean }) {
  const { locale } = useUi()
  const c = publicCopy[locale]
  return <>
    {disclosure ? <ToolsDisclosure onNavigate={onNavigate} /> : <NavLink to="/tools" onClick={onNavigate}>{c.tools}</NavLink>}
    <NavLink to="/articles" onClick={onNavigate}>{c.articles}</NavLink>
    <NavLink to="/guide" onClick={onNavigate}>{c.guide}</NavLink>
    <NavLink to="/about" onClick={onNavigate}>{c.about}</NavLink>
  </>
}

/** Compact public drawer: full navigation, the tool list, preferences and registration. */
const PUBLIC_MENU_DESKTOP_MEDIA = '(min-width: 1024px)'

export function PublicMenu({ preferences, authenticated, role }: { preferences: ReactNode; authenticated: boolean | null; role: Role }) {
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
    const onCancel = (event: Event) => { event.preventDefault(); close() }
    current.addEventListener('cancel', onCancel)
    return () => current.removeEventListener('cancel', onCancel)
  })
  return <>
    <button type="button" className="secondary mobile-menu-trigger public-menu-trigger" ref={trigger} data-testid="mobile-menu" aria-haspopup="dialog" aria-expanded={open} onClick={show}>{c.menu}</button>
    <dialog ref={dialog} className="public-menu-dialog" data-testid="mobile-menu-dialog" aria-labelledby="public-menu-title" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="public-menu-panel">
        <header className="mobile-menu-header"><h2 id="public-menu-title" tabIndex={-1}>{c.menu}</h2><button type="button" className="secondary" onClick={close}>{t('close')}</button></header>
        <nav aria-label={t('navigation')}><PublicNavLinks onNavigate={close} disclosure={false} /></nav>
        <section aria-labelledby="public-menu-tools-title">
          <h2 id="public-menu-tools-title" className="public-menu-tools-title">{c.tools}</h2>
          <div className="public-menu-tools">{TOOLS.map(tool => <Link key={tool.href} to={tool.href} onClick={close}><Icon name={tool.icon} size={16} />{tool.name[locale]}</Link>)}</div>
        </section>
        <div className="public-menu-preferences">{preferences}{authenticated === true ? <>
          {role === 'ADMIN' && <Link to="/admin/blog" onClick={close}>{c.manageArticles}</Link>}
          <Link className="button secondary" to="/" onClick={close}>{c.workspace}</Link>
        </> : <Link className="button" to="/register" onClick={close}>{t('register')}</Link>}</div>
      </div>
    </dialog>
  </>
}
