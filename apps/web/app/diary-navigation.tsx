import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from './icons'
import { useUi } from './ui'
import { useReviewCount } from './use-review-count'

const copy = {
  'zh-TW': { nav: '日記快捷導覽', capture: '記錄', library: '日記庫', timeline: '時間軸', calendar: '日曆', reviews: '複盤', waiting: '項待複盤' },
  'zh-CN': { nav: '日记快捷导航', capture: '记录', library: '日记库', timeline: '时间轴', calendar: '日历', reviews: '复盘', waiting: '项待复盘' },
  en: { nav: 'Diary shortcuts', capture: 'Capture', library: 'Library', timeline: 'Timeline', calendar: 'Calendar', reviews: 'Reviews', waiting: 'waiting for review' },
} as const

type View = 'capture' | 'library' | 'timeline' | 'calendar' | 'reviews'

function activeView(pathname: string): View | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/diaries/new' || path === '/diaries/quick') return 'capture'
  if (path === '/calendar') return 'calendar'
  if (path === '/timeline' || path === '/partners/compare') return 'timeline'
  if (path === '/reviews' || /^\/diaries\/[1-9]\d*\/review$/.test(path)) return 'reviews'
  if (path === '/diaries' || path.startsWith('/diaries/')) return 'library'
  return null
}

/**
 * The thumb-reachable bar carries the diary loop end to end — capture, read,
 * and review — because that loop is the product. Everything else (holdings,
 * trade plans, tools, settings) stays behind the Menu trigger in the top bar,
 * so none of it competes for these five slots.
 */
export function DiaryNavigation() {
  const { locale } = useUi()
  const location = useLocation()
  const c = copy[locale]
  const active = activeView(location.pathname)
  const waiting = useReviewCount()

  // The badge is decorative; the count reaches assistive technology through the
  // link's own accessible name so it is never announced twice.
  const item = (view: View, to: string, icon: IconName, text: string, badge = 0) =>
    <Link key={view} to={to} aria-current={active === view ? 'page' : undefined}
      aria-label={badge > 0 ? `${text} · ${badge} ${c.waiting}` : undefined}>
      <span className="mobile-diary-icon">
        <Icon name={icon} size={20} />
        {badge > 0 && <span className="mobile-diary-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
      </span>
      <span>{text}</span>
    </Link>

  return <nav className="mobile-diary-navigation" data-testid="mobile-diary-navigation" aria-label={c.nav}>
    {/* Quick capture is the low-friction path the product is built around, so
        it is the one the bar offers — the full editor stays in the drawer. */}
    {item('capture', '/diaries/quick', 'pen', c.capture)}
    {item('library', '/diaries', 'book', c.library)}
    {item('timeline', '/timeline', 'timeline', c.timeline)}
    {item('calendar', '/calendar', 'calendar', c.calendar)}
    {item('reviews', '/reviews', 'check', c.reviews, waiting ?? 0)}
  </nav>
}
