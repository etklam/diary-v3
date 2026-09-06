import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from './icons'
import { useUi } from './ui'

export type ToolCategory = 'calculator' | 'research'

export type ToolEntry = {
  href: string
  icon: IconName
  category: ToolCategory
  name: { en: string; 'zh-TW': string; 'zh-CN': string }
  purpose: { en: string; 'zh-TW': string; 'zh-CN': string }
}

// One registry feeds the tools index, the home page exploration grid and the
// per-tool breadcrumb, so names and entry points stay in sync.
export const TOOLS: readonly ToolEntry[] = [
  {
    href: '/tools/position-sizing', icon: 'target', category: 'calculator',
    name: { en: 'Position sizing', 'zh-TW': '部位計算', 'zh-CN': '仓位计算' },
    purpose: { en: 'Split a planned position into whole-share batches with reserved cash.', 'zh-TW': '把預計部位分成整股批次，並先保留現金。', 'zh-CN': '把预计部位分成整股批次，并先保留现金。' },
  },
  {
    href: '/tools/financial-freedom', icon: 'flame', category: 'calculator',
    name: { en: 'Financial freedom', 'zh-TW': '財務自由', 'zh-CN': '财务自由' },
    purpose: { en: 'Estimate the target amount and the years it still takes.', 'zh-TW': '估算目標金額，以及還需要的年數。', 'zh-CN': '估算目标金额，以及还需要的年数。' },
  },
  {
    href: '/tools/relative-value', icon: 'scale', category: 'research',
    name: { en: 'Relative value', 'zh-TW': '相對價值', 'zh-CN': '相对价值' },
    purpose: { en: 'Compare two prices with an explicit ratio, scenarios and history.', 'zh-TW': '以明確比率比較兩個價格，附情境與歷史。', 'zh-CN': '以明确比率比较两个价格，附情景与历史。' },
  },
  {
    href: '/tools/seasonality', icon: 'calendarRange', category: 'research',
    name: { en: 'Seasonality', 'zh-TW': '季節性', 'zh-CN': '季节性' },
    purpose: { en: 'S&P 500 monthly average returns, a fixed reference since 1950.', 'zh-TW': 'S&P 500 月度平均回報，1950 年起的固定參考。', 'zh-CN': 'S&P 500 月度平均回报，1950 年起的固定参考。' },
  },
  {
    href: '/tools/etf', icon: 'layers', category: 'research',
    name: { en: 'ETF research', 'zh-TW': 'ETF 研究', 'zh-CN': 'ETF 研究' },
    purpose: { en: 'Read risk, fund details and relative returns with their data dates.', 'zh-TW': '連同資料日期閱讀風險、基金資料及相對回報。', 'zh-CN': '连同数据日期阅读风险、基金资料及相对回报。' },
  },
  {
    href: '/tools/market-rotation', icon: 'refresh', category: 'research',
    name: { en: 'Market rotation', 'zh-TW': '市場輪動', 'zh-CN': '市场轮动' },
    purpose: { en: 'Read the latest market relative-strength snapshot by scope.', 'zh-TW': '按範圍閱讀最新的市場相對強弱快照。', 'zh-CN': '按范围阅读最新的市场相对强弱快照。' },
  },
  {
    href: '/tools/sec-filings', icon: 'fileText', category: 'research',
    name: { en: 'SEC filings', 'zh-TW': 'SEC 申報', 'zh-CN': 'SEC 申报' },
    purpose: { en: 'Search companies and read or download their SEC filings.', 'zh-TW': '搜尋公司，閱讀或下載其 SEC 申報文件。', 'zh-CN': '搜寻公司，阅读或下载其 SEC 申报文件。' },
  },
] as const

const copy = {
  en: { tools: 'Tools', calculator: 'Calculators', research: 'Research', use: 'Use the tool' },
  'zh-TW': { tools: '工具', calculator: '計算工具', research: '研究工具', use: '使用工具' },
  'zh-CN': { tools: '工具', calculator: '计算工具', research: '研究工具', use: '使用工具' },
} as const

export function toolName(tool: ToolEntry, locale: keyof typeof copy) { return tool.name[locale] }

export function toolByHref(href: string): ToolEntry {
  const tool = TOOLS.find(entry => entry.href === href)
  if (!tool) throw new Error(`Unknown tool href: ${href}`)
  return tool
}

/** Shared tool page header: breadcrumb, icon tile, title, intro and actions. */
export function ToolShell({ tool, title, intro, actions }: { tool: ToolEntry; title: string; intro: string; actions?: ReactNode }) {
  const { locale } = useUi()
  const c = copy[locale]
  return <header className="tool-header">
    <nav className="tool-breadcrumb" aria-label="Breadcrumb">
      <Link to="/tools">{c.tools}</Link>
      <span aria-hidden="true">/</span>
      <span>{c[tool.category]}</span>
    </nav>
    <div className="tool-title-row">
      <span className="tool-icon"><Icon name={tool.icon} size={22} /></span>
      <div>
        <h1>{title}</h1>
        <p className="lede">{intro}</p>
      </div>
    </div>
    {actions && <div className="tool-actions">{actions}</div>}
  </header>
}
