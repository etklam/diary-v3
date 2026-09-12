import { Link, useLocation } from 'react-router'
import { Icon } from './icons'
import { useUi } from './ui'

const copy = {
  'zh-TW': { nav: '日記快捷導覽', library: '日記庫', timeline: '時間軸', calendar: '日曆' },
  'zh-CN': { nav: '日记快捷导航', library: '日记库', timeline: '时间轴', calendar: '日历' },
  en: { nav: 'Diary shortcuts', library: 'Diary library', timeline: 'Timeline', calendar: 'Calendar' },
} as const

function activeView(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/calendar') return 'calendar'
  if (path === '/timeline' || path === '/partners/compare') return 'timeline'
  if (path === '/reviews' || /^\/diaries\/[1-9]\d*\/review$/.test(path)) return null
  if (path === '/diaries' || path.startsWith('/diaries/')) return 'library'
  return null
}

export function DiaryNavigation() {
  const { locale } = useUi()
  const location = useLocation()
  const c = copy[locale]
  const active = activeView(location.pathname)
  return <nav className="mobile-diary-navigation" data-testid="mobile-diary-navigation" aria-label={c.nav}>
    <Link to="/diaries" aria-current={active === 'library' ? 'page' : undefined}><Icon name="book" size={20} /><span>{c.library}</span></Link>
    <Link to="/timeline" aria-current={active === 'timeline' ? 'page' : undefined}><Icon name="timeline" size={20} /><span>{c.timeline}</span></Link>
    <Link to="/calendar" aria-current={active === 'calendar' ? 'page' : undefined}><Icon name="calendar" size={20} /><span>{c.calendar}</span></Link>
  </nav>
}
