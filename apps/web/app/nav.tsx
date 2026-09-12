import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useUi } from './ui'
import { BrandMark, Icon, type IconName } from './icons'
import { TOOLS } from './tool-shell'
import { CaptureChoices } from './quick-entry'

type Role = 'USER' | 'ADMIN' | null

const sectionCopy = {
  'zh-TW': { diary: '日記與複盤', investing: '投資與交易', markets: '市場與工具', account: '帳戶', admin: '管理' },
  'zh-CN': { diary: '日记与复盘', investing: '投资与交易', markets: '市场与工具', account: '账户', admin: '管理' },
  en: { diary: 'Diary & review', investing: 'Investing & trading', markets: 'Markets & tools', account: 'Account', admin: 'Administration' },
} as const

const workspaceCopy = {
  'zh-TW': {
    overview: '總覽', diary: '日記', reviewQueue: '複盤隊列', tradePlans: '交易計劃', holdings: '持倉', watchlist: '關注清單', marketResearch: '行情研究', tools: '工具', diaryManagement: '日記管理', tradeManagement: '交易管理', partners: '伙伴管理', principles: '交易紀律', diaryReminders: '日記提醒', priceReminders: '價格提醒', publicArticles: '公開文章', settings: '設定',
  },
  'zh-CN': {
    overview: '总览', diary: '日记', reviewQueue: '复盘队列', tradePlans: '交易计划', holdings: '持仓', watchlist: '关注清单', marketResearch: '行情研究', tools: '工具', diaryManagement: '日记管理', tradeManagement: '交易管理', partners: '伙伴管理', principles: '交易纪律', diaryReminders: '日记提醒', priceReminders: '价格提醒', publicArticles: '公开文章', settings: '设置',
  },
  en: {
    overview: 'Overview', diary: 'Diary', reviewQueue: 'Review queue', tradePlans: 'Trade plans', holdings: 'Holdings', watchlist: 'Watchlist', marketResearch: 'Market research', tools: 'Tools', diaryManagement: 'Diary management', tradeManagement: 'Trade management', partners: 'Partner management', principles: 'Trading principles', diaryReminders: 'Diary reminders', priceReminders: 'Price reminders', publicArticles: 'Public articles', settings: 'Settings',
  },
} as const

function label(locale: keyof typeof sectionCopy, values: { en: string; 'zh-CN': string; 'zh-TW': string }) {
  return values[locale]
}

export type NavigationOwner = 'overview' | 'diary' | 'reviews' | 'diaryReminders' | 'partners' | 'holdings' | 'watchlist' | 'tradePlans' | 'priceReminders' | 'discipline' | 'marketResearch' | 'tools' | 'articles' | 'settings' | 'adminBlog' | 'adminUsers' | 'adminEtf' | null

export function navigationOwner(pathname: string): NavigationOwner {
  if (pathname === '/') return 'overview'
  if (pathname === '/reviews' || /^\/diaries\/[1-9]\d*\/review$/.test(pathname)) return 'reviews'
  if (pathname === '/partners/compare' || pathname === '/timeline' || pathname === '/calendar' || pathname === '/diaries' || pathname.startsWith('/diaries/')) return 'diary'
  if (pathname === '/alerts') return 'diaryReminders'
  if (pathname === '/partners') return 'partners'
  if (pathname === '/stocks/watchlist') return 'watchlist'
  if (pathname === '/stocks/alerts') return 'priceReminders'
  if (pathname === '/stocks' || pathname === '/strategy-performance') return 'holdings'
  if (pathname.startsWith('/trade-plans')) return 'tradePlans'
  if (pathname === '/discipline' || pathname.startsWith('/discipline/')) return 'discipline'
  if (/^\/stocks\/[^/]+(?:\/thesis)?$/.test(pathname)) return 'marketResearch'
  if (pathname === '/tools' || pathname.startsWith('/tools/') || pathname === '/etf/watchlist') return 'tools'
  if (pathname === '/articles' || pathname.startsWith('/articles/')) return 'articles'
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings'
  if (pathname === '/admin/blog' || pathname.startsWith('/admin/blog/')) return 'adminBlog'
  if (pathname === '/admin/users' || pathname.startsWith('/admin/users/')) return 'adminUsers'
  if (pathname === '/admin/etf' || pathname.startsWith('/admin/etf/')) return 'adminEtf'
  return null
}

export function NavigationLinks({ role, onNavigate, idPrefix = 'nav' }: { role: Role; onNavigate?: () => void; idPrefix?: string }) {
  const { locale } = useUi()
  const location = useLocation()
  const sections = sectionCopy[locale]
  const c = workspaceCopy[locale]
  const owner = navigationOwner(location.pathname)
  const link = (to: string, text: string, icon: IconName, destination: NavigationOwner) => <Link key={to} to={to} onClick={onNavigate} aria-current={owner === destination ? 'page' : undefined}><Icon name={icon} />{text}</Link>
  return <>
    <div className="nav-overview">{link('/', c.overview, 'home', 'overview')}</div>
    <section className="nav-group" aria-labelledby={`${idPrefix}-diary`}><h2 id={`${idPrefix}-diary`}>{sections.diary}</h2><div className="nav-group-links">
      {link('/diaries', c.diary, 'book', 'diary')}
      {link('/reviews', c.reviewQueue, 'check', 'reviews')}
    </div><details className="nav-more" open={owner === 'diaryReminders' || owner === 'partners' || undefined}>
      <summary><Icon name="chevronDown" />{c.diaryManagement}</summary>
      <div className="nav-group-links">
        {link('/alerts', c.diaryReminders, 'bell', 'diaryReminders')}
        {link('/partners', c.partners, 'users', 'partners')}
      </div>
    </details></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-investing`}><h2 id={`${idPrefix}-investing`}>{sections.investing}</h2><div className="nav-group-links">
      {link('/stocks', c.holdings, 'briefcase', 'holdings')}
      {link('/stocks/watchlist', c.watchlist, 'star', 'watchlist')}
      {link('/trade-plans', c.tradePlans, 'clipboard', 'tradePlans')}
    </div><details className="nav-more" open={owner === 'priceReminders' || owner === 'discipline' || undefined}>
      <summary><Icon name="chevronDown" />{c.tradeManagement}</summary>
      <div className="nav-group-links nav-secondary-links">
        {link('/stocks/alerts', c.priceReminders, 'bell', 'priceReminders')}
        {link('/discipline', c.principles, 'shield', 'discipline')}
      </div>
    </details></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-markets`}><h2 id={`${idPrefix}-markets`}>{sections.markets}</h2><div className="nav-group-links">
      {link('/stocks/SPY', c.marketResearch, 'chart', 'marketResearch')}
      {link('/tools', c.tools, 'wrench', 'tools')}
    </div></section>
    {role === 'ADMIN' && <section className="nav-group" aria-labelledby={`${idPrefix}-admin`}><h2 id={`${idPrefix}-admin`}>{sections.admin}</h2><div className="nav-group-links">
      {link('/admin/blog', label(locale, { en: 'Article management', 'zh-CN': '文章管理', 'zh-TW': '文章管理' }), 'fileText', 'adminBlog')}
      {link('/admin/users', label(locale, { en: 'User management', 'zh-CN': '用户管理', 'zh-TW': '用戶管理' }), 'users', 'adminUsers')}
      {link('/admin/etf', label(locale, { en: 'ETF catalog', 'zh-CN': 'ETF 目录管理', 'zh-TW': 'ETF 目錄管理' }), 'layers', 'adminEtf')}
    </div></section>}
    <section className="nav-group nav-account" aria-labelledby={`${idPrefix}-account`}><h2 id={`${idPrefix}-account`}>{sections.account}</h2><div className="nav-group-links">
      {link('/articles', c.publicArticles, 'fileText', 'articles')}
      {link('/settings', c.settings, 'settings', 'settings')}
    </div></section>
  </>
}

export function MobileMenu({ role, authenticated, preferences, onLogout, logoutPending, logoutError }: { role: Role; authenticated: boolean | null; preferences: ReactNode; onLogout: () => void; logoutPending: boolean; logoutError: boolean }) {
  const { locale, t } = useUi()
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
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
      <div className="mobile-shell-actions"><button type="button" className="secondary mobile-menu-trigger" ref={trigger} data-testid="mobile-menu" aria-haspopup="dialog" aria-expanded={open} onClick={show}>{menu}</button></div>
    </div>
    <dialog ref={dialog} className="mobile-menu-dialog" data-testid="mobile-menu-dialog" aria-labelledby="mobile-menu-title" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="mobile-menu-panel">
        <header className="mobile-menu-header"><h2 id="mobile-menu-title" tabIndex={-1}>{menu}</h2><button type="button" className="secondary" onClick={close}>{t('close')}</button></header>
        {authenticated === true && <section className="mobile-menu-capture" aria-labelledby="mobile-capture-title"><h2 id="mobile-capture-title">{label(locale, { en: 'Capture', 'zh-CN': '记录', 'zh-TW': '記錄' })}</h2><div className="quick-entry-controls"><CaptureChoices mobile onNavigate={close}/></div></section>}
        <nav aria-label={t('navigation')}><NavigationLinks role={role} idPrefix="mobile-nav" onNavigate={close}/></nav>
        <div className="mobile-menu-preferences">{preferences}{(authenticated || logoutError || logoutPending) && <button type="button" className="secondary" data-testid="mobile-sign-out" disabled={logoutPending} onClick={() => { close(); onLogout() }}>{t(logoutPending ? 'pending' : 'logout')}</button>}</div>
      </div>
    </dialog>
  </>
}

// ---- Public site navigation (single-row header + compact drawer) ----

const publicCopy = {
  'zh-TW': { tools: '工具', articles: '文章', guide: '使用說明', about: '關於', shortcuts: '工具快捷入口', menu: '選單' },
  'zh-CN': { tools: '工具', articles: '文章', guide: '使用说明', about: '关于', shortcuts: '工具快捷入口', menu: '菜单' },
  en: { tools: 'Tools', articles: 'Articles', guide: 'Guide', about: 'About', shortcuts: 'Tool shortcuts', menu: 'Menu' },
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
export function PublicMenu({ preferences }: { preferences: ReactNode }) {
  const { locale, t } = useUi()
  const c = publicCopy[locale]
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
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
    <button type="button" className="secondary mobile-menu-trigger public-menu-trigger" ref={trigger} data-testid="mobile-menu" aria-haspopup="dialog" aria-expanded={open} onClick={show}>{c.menu}</button>
    <dialog ref={dialog} className="public-menu-dialog" data-testid="mobile-menu-dialog" aria-labelledby="public-menu-title" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="public-menu-panel">
        <header className="mobile-menu-header"><h2 id="public-menu-title" tabIndex={-1}>{c.menu}</h2><button type="button" className="secondary" onClick={close}>{t('close')}</button></header>
        <nav aria-label={t('navigation')}><PublicNavLinks onNavigate={close} disclosure={false} /></nav>
        <section aria-labelledby="public-menu-tools-title">
          <h2 id="public-menu-tools-title" className="public-menu-tools-title">{c.tools}</h2>
          <div className="public-menu-tools">{TOOLS.map(tool => <Link key={tool.href} to={tool.href} onClick={close}><Icon name={tool.icon} size={16} />{tool.name[locale]}</Link>)}</div>
        </section>
        <div className="public-menu-preferences">{preferences}<Link className="button" to="/register" onClick={close}>{t('register')}</Link></div>
      </div>
    </dialog>
  </>
}
