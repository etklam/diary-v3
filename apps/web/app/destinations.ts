import type { IconName } from './icons'
import { TOOLS } from './tool-shell'

/** One label per destination, shared by the sidebar and the command palette. */
export const workspaceCopy = {
  'zh-TW': {
    overview: '總覽', diaryLibrary: '日記庫', timeline: '時間軸', calendar: '日曆', reviewQueue: '複盤隊列', aiReports: 'AI 報告', tradePlans: '交易計劃', holdings: '持倉', watchlist: '關注清單', marketResearch: '行情研究', tools: '工具', diaryManagement: '日記管理', tradeManagement: '交易管理', partners: '伙伴管理', principles: '交易紀律', diaryReminders: '日記提醒', priceReminders: '價格提醒', achievements: '個人成就與目標', publicArticles: '公開文章', settings: '設定', adminAi: 'AI 報告管理', adminGurus: '投資大師管理', adminInstitutional: '機構持倉映射', adminInstitutionalOperations: '機構資料運維', researchStudio: '研究工作室', adminEmail: '電郵設定',
  },
  'zh-CN': {
    overview: '总览', diaryLibrary: '日记库', timeline: '时间轴', calendar: '日历', reviewQueue: '复盘队列', aiReports: 'AI 报告', tradePlans: '交易计划', holdings: '持仓', watchlist: '关注清单', marketResearch: '行情研究', tools: '工具', diaryManagement: '日记管理', tradeManagement: '交易管理', partners: '伙伴管理', principles: '交易纪律', diaryReminders: '日记提醒', priceReminders: '价格提醒', achievements: '个人成就与目标', publicArticles: '公开文章', settings: '设置', adminAi: 'AI 报告管理', adminGurus: '投资大师管理', adminInstitutional: '机构持仓映射', adminInstitutionalOperations: '机构数据运维', researchStudio: '研究工作室', adminEmail: '邮件设置',
  },
  en: {
    overview: 'Overview', diaryLibrary: 'Diary library', timeline: 'Timeline', calendar: 'Calendar', reviewQueue: 'Review queue', aiReports: 'AI reports', tradePlans: 'Trade plans', holdings: 'Holdings', watchlist: 'Watchlist', marketResearch: 'Market research', tools: 'Tools', diaryManagement: 'Diary management', tradeManagement: 'Trade management', partners: 'Partner management', principles: 'Trading principles', diaryReminders: 'Diary reminders', priceReminders: 'Price reminders', achievements: 'Achievements and goals', publicArticles: 'Public articles', settings: 'Settings', adminAi: 'AI administration', adminGurus: 'Guru management', adminInstitutional: 'Institutional mappings', adminInstitutionalOperations: 'Institutional operations', researchStudio: 'Research Studio', adminEmail: 'Mail settings',
  },
} as const

export type Locale = keyof typeof workspaceCopy
export type Destination = { path: string; label: string; icon: IconName; admin?: true }

const extraCopy = {
  'zh-TW': {
    performance: '策略表現', etfWatchlist: 'ETF 關注清單', apiKeys: 'API 金鑰', security: '帳戶安全',
    partnerCompare: '伙伴對照', guide: '使用說明', about: '關於', gurus: '投資大師',
  },
  'zh-CN': {
    performance: '策略表现', etfWatchlist: 'ETF 关注清单', apiKeys: 'API 密钥', security: '账户安全',
    partnerCompare: '伙伴对照', guide: '使用说明', about: '关于', gurus: '投资大师',
  },
  en: {
    performance: 'Strategy performance', etfWatchlist: 'ETF watchlist', apiKeys: 'API keys', security: 'Account security',
    partnerCompare: 'Partner comparison', guide: 'Guide', about: 'About', gurus: 'Guru portfolios',
  },
} as const

/**
 * Every place a signed-in reader can go, including the routes the sidebar has
 * no room for — strategy performance, the ETF watchlist, the settings
 * sub-pages, partner comparison. The sidebar shows what is worth showing
 * always; this list is what search can reach.
 */
export function destinations(locale: Locale): Destination[] {
  const c = workspaceCopy[locale]
  const e = extraCopy[locale]
  return [
    { path: '/', label: c.overview, icon: 'home' },
    { path: '/diaries', label: c.diaryLibrary, icon: 'book' },
    { path: '/diaries/quick', label: c.diaryLibrary, icon: 'pen' },
    { path: '/timeline', label: c.timeline, icon: 'timeline' },
    { path: '/calendar', label: c.calendar, icon: 'calendar' },
    { path: '/reviews', label: c.reviewQueue, icon: 'check' },
    { path: '/reviews/ai-reports', label: c.aiReports, icon: 'zap' },
    { path: '/alerts', label: c.diaryReminders, icon: 'bell' },
    { path: '/partners', label: c.partners, icon: 'users' },
    { path: '/partners/compare', label: e.partnerCompare, icon: 'users' },
    { path: '/stocks', label: c.holdings, icon: 'briefcase' },
    { path: '/gurus', label: e.gurus, icon: 'layers' },
    { path: '/gurus/notifications', label: locale === 'en' ? 'Guru alerts' : locale === 'zh-CN' ? '大师提醒' : '大師提醒', icon: 'bell' },
    { path: '/gurus/consensus', label: locale === 'en' ? 'Guru consensus' : locale === 'zh-CN' ? '大师共识' : '大師共識', icon: 'layers' },
    { path: '/gurus/stocks', label: locale === 'en' ? 'Most-owned stocks' : locale === 'zh-CN' ? '大师持仓排行' : '大師持倉排行', icon: 'layers' },
    { path: '/gurus/sectors', label: locale === 'en' ? 'Guru sector direction' : locale === 'zh-CN' ? '大师板块方向' : '大師板塊方向', icon: 'layers' },
    { path: '/stocks/watchlist', label: c.watchlist, icon: 'star' },
    { path: '/stocks/alerts', label: c.priceReminders, icon: 'bell' },
    { path: '/strategy-performance', label: e.performance, icon: 'chart' },
    { path: '/trade-plans', label: c.tradePlans, icon: 'clipboard' },
    { path: '/discipline', label: c.principles, icon: 'shield' },
    { path: '/tools', label: c.tools, icon: 'wrench' },
    ...TOOLS.map(tool => ({ path: tool.href, label: tool.name[locale], icon: tool.icon })),
    { path: '/etf/watchlist', label: e.etfWatchlist, icon: 'layers' },
    { path: '/articles', label: c.publicArticles, icon: 'fileText' },
    { path: '/achievements', label: c.achievements, icon: 'target' },
    { path: '/settings', label: c.settings, icon: 'settings' },
    { path: '/settings/api-keys', label: e.apiKeys, icon: 'lock' },
    { path: '/settings/security', label: e.security, icon: 'lock' },
    { path: '/guide', label: e.guide, icon: 'compass' },
    { path: '/about', label: e.about, icon: 'compass' },
    { path: '/admin/blog', label: locale === 'en' ? 'Article management' : '文章管理', icon: 'fileText', admin: true },
    { path: '/admin/users', label: locale === 'en' ? 'User management' : locale === 'zh-CN' ? '用户管理' : '用戶管理', icon: 'users', admin: true },
    { path: '/admin/gurus', label: c.adminGurus, icon: 'layers', admin: true },
    { path: '/admin/institutional', label: c.adminInstitutionalOperations, icon: 'layers', admin: true },
    { path: '/admin/institutional/mappings', label: c.adminInstitutional, icon: 'layers', admin: true },
    { path: '/admin/ai', label: c.adminAi, icon: 'compass', admin: true },
    { path: '/admin/research', label: c.researchStudio, icon: 'chart', admin: true },
    { path: '/admin/etf', label: locale === 'en' ? 'ETF catalog' : locale === 'zh-CN' ? 'ETF 目录管理' : 'ETF 目錄管理', icon: 'layers', admin: true },
    { path: '/admin/email-settings', label: c.adminEmail, icon: 'settings', admin: true },
  ]
}

/** Quick capture shares the library's noun, so give it its own verb label. */
export function destinationLabel(destination: Destination, locale: Locale) {
  if (destination.path !== '/diaries/quick') return destination.label
  return locale === 'en' ? 'Quick diary' : locale === 'zh-CN' ? '快速记录' : '快速記錄'
}

/**
 * Case-insensitive subsequence match, so "trpl" finds Trade plans and a partial
 * CJK label matches on any contained run. Scored so earlier and tighter matches
 * sort first; a non-match returns null rather than 0.
 */
export function matchScore(label: string, query: string): number | null {
  if (query === '') return 0
  const haystack = label.toLowerCase(), needle = query.toLowerCase()
  const direct = haystack.indexOf(needle)
  // A contiguous hit always beats a scattered one, and an earlier hit wins.
  if (direct !== -1) return direct
  let index = 0, span = 0
  for (const character of needle) {
    const found = haystack.indexOf(character, index)
    if (found === -1) return null
    span += found - index
    index = found + 1
  }
  return 1000 + span
}

/** A plausible ticker, which the company page can be opened with directly. */
export function symbolCandidate(query: string): string | null {
  const trimmed = query.trim().toUpperCase()
  return /^[A-Z][A-Z.-]{0,9}$/.test(trimmed) ? trimmed : null
}
