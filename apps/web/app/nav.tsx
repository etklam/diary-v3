import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useUi } from './ui'
import { BrandMark, Icon, type IconName } from './icons'
import { TOOLS } from './tool-shell'

type Role = 'USER' | 'ADMIN' | null

const sectionCopy = {
  'zh-TW': { daily: '日常工作', portfolio: '投資組合與研究', tools: '工具', account: '帳戶', admin: '管理' },
  'zh-CN': { daily: '日常工作', portfolio: '投资组合与研究', tools: '工具', account: '账户', admin: '管理' },
  en: { daily: 'Daily work', portfolio: 'Portfolio and research', tools: 'Tools', account: 'Account', admin: 'Administration' },
} as const

function label(locale: keyof typeof sectionCopy, values: { en: string; 'zh-CN': string; 'zh-TW': string }) {
  return values[locale]
}

export function NavigationLinks({ role, onNavigate, idPrefix = 'nav' }: { role: Role; onNavigate?: () => void; idPrefix?: string }) {
  const { locale, t } = useUi()
  const location = useLocation()
  const sections = sectionCopy[locale]
  const link = (to: string, text: string, icon: IconName, end = false) => <NavLink key={to} to={to} end={end} onClick={onNavigate}><Icon name={icon} />{text}</NavLink>
  const marketResearch = <Link to="/stocks/SPY" onClick={onNavigate} aria-current={(location.pathname.startsWith('/stocks/') && location.pathname !== '/stocks/watchlist' && location.pathname !== '/stocks/alerts') ? 'page' : undefined}><Icon name="chart" />{label(locale, { en: 'Market research', 'zh-CN': '市场研究', 'zh-TW': '市場研究' })}</Link>
  return <>
    <section className="nav-group" aria-labelledby={`${idPrefix}-daily`}><h2 id={`${idPrefix}-daily`}>{sections.daily}</h2><div className="nav-group-links">
      {link('/', t('home'), 'home', true)}
      {link('/timeline', label(locale, { en: 'Timeline', 'zh-CN': '时间轴', 'zh-TW': '時間軸' }), 'timeline')}
      {link('/trade-plans', label(locale, { en: 'Trade plans', 'zh-CN': '交易计划', 'zh-TW': '交易計劃' }), 'clipboard')}
      {link('/partners', label(locale, { en: 'Partners', 'zh-CN': '伙伴', 'zh-TW': '伙伴' }), 'users')}
      {link('/discipline', label(locale, { en: 'Trading principles', 'zh-CN': '交易纪律', 'zh-TW': '交易紀律' }), 'shield')}
      {link('/alerts', label(locale, { en: 'Diary reminders', 'zh-CN': '日记提醒', 'zh-TW': '日記提醒' }), 'bell')}
      {link('/reviews', label(locale, { en: 'Review queue', 'zh-CN': '复盘队列', 'zh-TW': '複盤隊列' }), 'check')}
      {link('/calendar', label(locale, { en: 'Calendar', 'zh-CN': '日历', 'zh-TW': '日曆' }), 'calendar')}
      {link('/diaries', label(locale, { en: 'Diary library', 'zh-CN': '日记库', 'zh-TW': '日記庫' }), 'book', true)}
      {link('/diaries/new', t('write'), 'pen')}
      <Link to="/diaries/quick" onClick={onNavigate}><Icon name="zap" />{t('quick')}</Link>
    </div></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-portfolio`}><h2 id={`${idPrefix}-portfolio`}>{sections.portfolio}</h2><div className="nav-group-links">
      {link('/stocks', label(locale, { en: 'Holdings', 'zh-CN': '持仓', 'zh-TW': '持倉' }), 'briefcase', true)}
      {link('/stocks/watchlist', label(locale, { en: 'Watchlist', 'zh-CN': '关注清单', 'zh-TW': '關注清單' }), 'star')}
      {link('/stocks/alerts', label(locale, { en: 'Price reminders', 'zh-CN': '价格提醒', 'zh-TW': '價格提醒' }), 'bell')}
      {marketResearch}
      {link('/tools/etf', label(locale, { en: 'ETF research', 'zh-CN': 'ETF 研究', 'zh-TW': 'ETF 研究' }), 'layers')}
    </div></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-tools`}><h2 id={`${idPrefix}-tools`}>{sections.tools}</h2><div className="nav-group-links">
      {link('/tools', label(locale, { en: 'All tools', 'zh-CN': '全部工具', 'zh-TW': '全部工具' }), 'wrench', true)}
      {link('/tools/market-rotation', label(locale, { en: 'Market rotation', 'zh-CN': '市场轮动', 'zh-TW': '市場輪動' }), 'refresh')}
      {link('/tools/relative-value', label(locale, { en: 'Relative value', 'zh-CN': '相对价值', 'zh-TW': '相對價值' }), 'scale')}
      {link('/tools/seasonality', label(locale, { en: 'Seasonality', 'zh-CN': '季节性', 'zh-TW': '季節性' }), 'calendarRange')}
      {link('/tools/sec-filings', label(locale, { en: 'SEC filings', 'zh-CN': 'SEC 申报', 'zh-TW': 'SEC 申報' }), 'fileText')}
      {link('/tools/financial-freedom', label(locale, { en: 'FIRE calculator', 'zh-CN': '财务自由计算', 'zh-TW': '財務自由計算' }), 'flame')}
      {link('/tools/position-sizing', label(locale, { en: 'Position sizing', 'zh-CN': '仓位计算', 'zh-TW': '部位計算' }), 'target')}
    </div></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-account`}><h2 id={`${idPrefix}-account`}>{sections.account}</h2><div className="nav-group-links">
      {link('/settings', label(locale, { en: 'Preferences', 'zh-CN': '偏好设置', 'zh-TW': '偏好設定' }), 'settings', true)}
      {link('/settings/security', label(locale, { en: 'Account security', 'zh-CN': '账户安全', 'zh-TW': '帳戶安全' }), 'lock')}
    </div></section>
    {role === 'ADMIN' && <section className="nav-group" aria-labelledby={`${idPrefix}-admin`}><h2 id={`${idPrefix}-admin`}>{sections.admin}</h2><div className="nav-group-links">
      {link('/admin/etf', label(locale, { en: 'Manage ETF catalog', 'zh-CN': '管理 ETF 目录', 'zh-TW': '管理 ETF 目錄' }), 'layers')}
      {link('/admin/users', label(locale, { en: 'Manage accounts', 'zh-CN': '管理账户', 'zh-TW': '管理帳戶' }), 'users')}
      {link('/admin/blog', label(locale, { en: 'Manage articles', 'zh-CN': '管理文章', 'zh-TW': '管理文章' }), 'fileText')}
    </div></section>}
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
