import { Link } from 'react-router'
import { buildCapturePath, captureContextForCompanySymbol } from './capture-context'
import { Icon } from './icons'
import { useUi } from './ui'

// The label belongs to the entry, not to a page: holdings, the watchlist and
// price reminders all offer the same control, so it is stated once here rather
// than copied into three page copy modules.
const copy = {
  'zh-TW': { record: '記錄想法' },
  'zh-CN': { record: '记录想法' },
  en: { record: 'Record a thought' },
} as const

/**
 * One per-row entry into Quick Diary with the row's company already linked.
 * Shared by every dense list that shows a symbol, so the prefill rule is
 * expressed once and `buildCapturePath` stays the only place that shapes the
 * handoff query.
 *
 * A symbol that cannot be linked to a diary renders no entry at all: offering
 * the control would drop the prefill silently, which is worse than not
 * offering it. Those symbols keep the Company page's explicit explanation.
 */
export function CaptureEntry({ symbol }: { symbol: string }) {
  const { locale } = useUi()
  const context = captureContextForCompanySymbol(symbol)
  if (!context) return null
  const label = copy[locale].record
  // The icon is decorative, so the symbol reaches assistive technology through
  // the link's own name — without it every row in the list announces the same.
  return <Link className="button quiet-button button-compact capture-entry" to={buildCapturePath('quick', context)}
    aria-label={`${label} · ${context.symbol}`} title={label} data-testid={`capture-entry-${context.symbol}`}>
    <Icon name="pen" size={16} />
  </Link>
}
