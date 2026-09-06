import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useUi } from './ui'

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
  const link = (to: string, text: string, end = false) => <NavLink key={to} to={to} end={end} onClick={onNavigate}>{text}</NavLink>
  const marketResearch = <Link to="/stocks/SPY" onClick={onNavigate} aria-current={(location.pathname.startsWith('/stocks/') && location.pathname !== '/stocks/watchlist' && location.pathname !== '/stocks/alerts') ? 'page' : undefined}>{label(locale, { en: 'Market research', 'zh-CN': '市场研究', 'zh-TW': '市場研究' })}</Link>
  return <>
    <section className="nav-group" aria-labelledby={`${idPrefix}-daily`}><h2 id={`${idPrefix}-daily`}>{sections.daily}</h2><div className="nav-group-links">
      {link('/', t('home'), true)}
      {link('/timeline', label(locale, { en: 'Timeline', 'zh-CN': '时间轴', 'zh-TW': '時間軸' }))}
      {link('/trade-plans', label(locale, { en: 'Trade plans', 'zh-CN': '交易计划', 'zh-TW': '交易計劃' }))}
      {link('/partners', label(locale, { en: 'Partners', 'zh-CN': '伙伴', 'zh-TW': '伙伴' }))}
      {link('/discipline', label(locale, { en: 'Trading principles', 'zh-CN': '交易纪律', 'zh-TW': '交易紀律' }))}
      {link('/alerts', label(locale, { en: 'Diary reminders', 'zh-CN': '日记提醒', 'zh-TW': '日記提醒' }))}
      {link('/reviews', label(locale, { en: 'Review queue', 'zh-CN': '复盘队列', 'zh-TW': '複盤隊列' }))}
      {link('/calendar', label(locale, { en: 'Calendar', 'zh-CN': '日历', 'zh-TW': '日曆' }))}
      {link('/diaries', label(locale, { en: 'Diary library', 'zh-CN': '日记库', 'zh-TW': '日記庫' }), true)}
      {link('/diaries/new', t('write'))}
      <Link to="/diaries/quick" onClick={onNavigate}>{t('quick')}</Link>
    </div></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-portfolio`}><h2 id={`${idPrefix}-portfolio`}>{sections.portfolio}</h2><div className="nav-group-links">
      {link('/stocks', label(locale, { en: 'Holdings', 'zh-CN': '持仓', 'zh-TW': '持倉' }), true)}
      {link('/stocks/watchlist', label(locale, { en: 'Watchlist', 'zh-CN': '关注清单', 'zh-TW': '關注清單' }))}
      {link('/stocks/alerts', label(locale, { en: 'Price reminders', 'zh-CN': '价格提醒', 'zh-TW': '價格提醒' }))}
      {marketResearch}
      {link('/tools/etf', label(locale, { en: 'ETF research', 'zh-CN': 'ETF 研究', 'zh-TW': 'ETF 研究' }))}
    </div></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-tools`}><h2 id={`${idPrefix}-tools`}>{sections.tools}</h2><div className="nav-group-links">
      {link('/tools', label(locale, { en: 'All tools', 'zh-CN': '全部工具', 'zh-TW': '全部工具' }), true)}
      {link('/tools/market-rotation', label(locale, { en: 'Market rotation', 'zh-CN': '市场轮动', 'zh-TW': '市場輪動' }))}
      {link('/tools/relative-value', label(locale, { en: 'Relative value', 'zh-CN': '相对价值', 'zh-TW': '相對價值' }))}
      {link('/tools/seasonality', label(locale, { en: 'Seasonality', 'zh-CN': '季节性', 'zh-TW': '季節性' }))}
      {link('/tools/sec-filings', label(locale, { en: 'SEC filings', 'zh-CN': 'SEC 申报', 'zh-TW': 'SEC 申報' }))}
      {link('/tools/financial-freedom', label(locale, { en: 'FIRE calculator', 'zh-CN': '财务自由计算', 'zh-TW': '財務自由計算' }))}
      {link('/tools/position-sizing', label(locale, { en: 'Position sizing', 'zh-CN': '仓位计算', 'zh-TW': '部位計算' }))}
    </div></section>
    <section className="nav-group" aria-labelledby={`${idPrefix}-account`}><h2 id={`${idPrefix}-account`}>{sections.account}</h2><div className="nav-group-links">
      {link('/settings', label(locale, { en: 'Preferences', 'zh-CN': '偏好设置', 'zh-TW': '偏好設定' }), true)}
      {link('/settings/security', label(locale, { en: 'Account security', 'zh-CN': '账户安全', 'zh-TW': '帳戶安全' }))}
    </div></section>
    {role === 'ADMIN' && <section className="nav-group" aria-labelledby={`${idPrefix}-admin`}><h2 id={`${idPrefix}-admin`}>{sections.admin}</h2><div className="nav-group-links">
      {link('/admin/etf', label(locale, { en: 'Manage ETF catalog', 'zh-CN': '管理 ETF 目录', 'zh-TW': '管理 ETF 目錄' }))}
      {link('/admin/users', label(locale, { en: 'Manage accounts', 'zh-CN': '管理账户', 'zh-TW': '管理帳戶' }))}
      {link('/admin/blog', label(locale, { en: 'Manage articles', 'zh-CN': '管理文章', 'zh-TW': '管理文章' }))}
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
      <Link className="brand" to="/"><span className="mobile-brand-name">diary-v3</span><span>{t('workspace')}</span></Link>
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
