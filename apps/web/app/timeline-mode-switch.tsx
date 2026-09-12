import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useUi } from './ui'
import { lastTimelineSearch } from './use-timeline'

const copy = {
  'zh-TW': { label: '時間軸檢視', mine: '我的時間軸', partner: '伙伴對照' },
  'zh-CN': { label: '时间轴检视', mine: '我的时间轴', partner: '伙伴对照' },
  en: { label: 'Timeline view', mine: 'My timeline', partner: 'Partner comparison' },
} as const

export type TimelineMode = 'mine' | 'partner'

/** Real links between the two timeline reading modes; Back/Forward and new tabs keep their semantics. */
export function TimelineModeSwitch({ mode }: { mode: TimelineMode }) {
  const { locale } = useUi()
  const c = copy[locale]
  const location = useLocation()
  // Returning to the personal mode restores the reader's most recent filters;
  // SSR renders the plain route and the client refines it after mount.
  const [mineTo, setMineTo] = useState('/timeline')
  useEffect(() => { if (mode === 'partner') { const search = lastTimelineSearch(); setMineTo(`/timeline${search ? `?${search}` : ''}`) } }, [mode])
  return <nav className="timeline-modes" data-testid="timeline-modes" aria-label={c.label}>
    <Link to={mode === 'mine' ? `${location.pathname}${location.search}` : mineTo} aria-current={mode === 'mine' ? 'page' : undefined}>{c.mine}</Link>
    <Link to="/partners/compare" aria-current={mode === 'partner' ? 'page' : undefined}>{c.partner}</Link>
  </nav>
}
