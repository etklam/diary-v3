import { NavLink } from 'react-router'
import { useUi } from './ui'

const copy = {
  'zh-TW': { nav: '日記導覽', library: '日記庫', timeline: '時間軸', calendar: '日曆' },
  'zh-CN': { nav: '日记导航', library: '日记库', timeline: '时间轴', calendar: '日历' },
  en: { nav: 'Diary navigation', library: 'Diary library', timeline: 'Timeline', calendar: 'Calendar' },
} as const

export function DiaryNavigation() {
  const { locale } = useUi()
  const c = copy[locale]
  return <nav className="diary-navigation" data-testid="diary-navigation" aria-label={c.nav}>
    <NavLink to="/diaries" end>{c.library}</NavLink>
    <NavLink to="/timeline">{c.timeline}</NavLink>
    <NavLink to="/calendar">{c.calendar}</NavLink>
  </nav>
}
