type Locale = 'zh-TW' | 'zh-CN' | 'en'

const privatePageTitles: Array<{ matches: (path: string) => boolean; title: Record<Locale, string> }> = [
  { matches: path => /^\/diaries\/[^/]+\/edit$/.test(path), title: { 'zh-TW': '編輯日記', 'zh-CN': '编辑日记', en: 'Edit diary' } },
  { matches: path => /^\/diaries\/[^/]+\/review$/.test(path), title: { 'zh-TW': '日記複盤', 'zh-CN': '日记复盘', en: 'Diary review' } },
  { matches: path => /^\/diaries\/[^/]+$/.test(path) && !['new', 'quick'].includes(path.split('/')[2] ?? ''), title: { 'zh-TW': '日記', 'zh-CN': '日记', en: 'Diary' } },
  { matches: path => /^\/trade-plans\/[^/]+$/.test(path) && path !== '/trade-plans/new', title: { 'zh-TW': '交易計劃', 'zh-CN': '交易计划', en: 'Trade plan' } },
  { matches: path => /^\/stocks\/[^/]+(?:\/thesis)?$/.test(path) && !['watchlist', 'alerts'].includes(path.split('/')[2] ?? ''), title: { 'zh-TW': '公司研究', 'zh-CN': '公司研究', en: 'Company research' } },
  { matches: path => /^\/admin\/research\/[^/]+$/.test(path) && !['new', 'settings'].includes(path.split('/')[3] ?? ''), title: { 'zh-TW': '研究執行', 'zh-CN': '研究执行', en: 'Research run' } },
  { matches: path => /^\/admin\/blog\/[^/]+\/edit$/.test(path), title: { 'zh-TW': '編輯文章', 'zh-CN': '编辑文章', en: 'Edit article' } },
]

const applicationName: Record<Locale, string> = {
  'zh-TW': '投資決策日記',
  'zh-CN': '投资决策日记',
  en: 'Investment decision diary',
}

export function pageTitle(pathname: string, locale: Locale, heading: string | null | undefined) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const privateTitle = privatePageTitles.find(item => item.matches(path))?.title[locale]
  const title = privateTitle ?? (heading?.replace(/\s+/gu, ' ').trim() || applicationName[locale])
  return title.endsWith(' — Trade basic') ? title : `${title} — Trade basic`
}
