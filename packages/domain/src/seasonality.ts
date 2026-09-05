export const seasonalityLocales = ['en', 'zh-TW', 'zh-CN'] as const
export type SeasonalityLocale = typeof seasonalityLocales[number]
export type SeasonalityVolatility = 'low' | 'low-medium' | 'medium' | 'medium-high' | 'high'
export type SeasonalityStrength = 'weakest' | 'weak' | 'neutral' | 'strong' | 'strongest'

type Localized = Record<SeasonalityLocale, string>

export type SeasonalityMonth = {
  month: number
  avgReturn: number
  volatility: SeasonalityVolatility
  characteristics: Localized
  reasons: Record<SeasonalityLocale, string[]>
}

const localized = (en: string, tw: string, cn: string): Localized => ({ en, 'zh-TW': tw, 'zh-CN': cn })
const reasons = (en: string[], tw: string[], cn: string[]) => ({ en, 'zh-TW': tw, 'zh-CN': cn })

export const seasonalityMonths: readonly SeasonalityMonth[] = [
  { month: 1, avgReturn: 1.07, volatility: 'medium', characteristics: localized('Strong start to the year, with a common January effect.', '年初強勢，常見「January Effect」。', '年初强势，常见「January Effect」。'), reasons: reasons(['Buyback after December tax-loss selling', 'New-year investment optimism', 'Fund-manager window dressing'], ['12 月稅損賣出後回補買盤', '新年投資樂觀情緒', '基金經理粉飾報表'], ['12 月税损卖出后回补买盘', '新年投资乐观情绪', '基金经理粉饰报表']) },
  { month: 2, avgReturn: -0.01, volatility: 'medium-high', characteristics: localized('Mixed and weak, relatively flat.', '混合偏弱、較平淡。', '混合偏弱、较平淡。'), reasons: reasons(['Profit taking', 'Earnings season begins', 'Post-holiday adjustment'], ['獲利了結', '財報季開始', '節後調整'], ['获利了结', '财报季开始', '节后调整']) },
  { month: 3, avgReturn: 1.13, volatility: 'medium', characteristics: localized('Positive, with an end-of-quarter rebound.', '正面，第一季末反彈。', '正面，第一季末反弹。'), reasons: reasons(['Quarterly rebalancing', 'Institutional capital return'], ['季度再平衡', '機構資金回流'], ['季度再平衡', '机构资金回流']) },
  { month: 4, avgReturn: 1.46, volatility: 'medium', characteristics: localized('One of the strongest months, with a post-tax-season rally.', '強勁之一，稅季後上漲。', '强劲之一，税季后上涨。'), reasons: reasons(['End of personal and corporate tax season', 'Good first-quarter earnings expectations'], ['個人及企業稅季結束', '良好第一季財報預期'], ['个人及企业税季结束', '良好第一季财报预期']) },
  { month: 5, avgReturn: 0.30, volatility: 'low-medium', characteristics: localized('The weaker period begins.', '弱勢期開始。', '弱势期开始。'), reasons: reasons(['Sell-in-May effect', 'Investors prepare for summer holidays'], ['「Sell in May」效應啟動', '投資人準備夏季度假'], ['「Sell in May」效应启动', '投资人准备夏季度假']) },
  { month: 6, avgReturn: 0.11, volatility: 'low', characteristics: localized('Weak, with summer sluggishness.', '弱勢、夏季低迷。', '弱势、夏季低迷。'), reasons: reasons(['Summer holiday season', 'Low trading volume', 'Institutional selling'], ['夏季度假季', '低交易量', '機構減持'], ['夏季度假季', '低交易量', '机构减持']) },
  { month: 7, avgReturn: 1.28, volatility: 'low', characteristics: localized('A strong rebound.', '強勁反彈。', '强劲反弹。'), reasons: reasons(['Trading resumes after Independence Day', 'Relative mid-summer optimism'], ['獨立日後交易恢復', '夏季中相對樂觀'], ['独立日后交易恢复', '夏季中相对乐观']) },
  { month: 8, avgReturn: -0.01, volatility: 'low', characteristics: localized('Weak, with low-volume trading.', '弱勢、低量交易。', '弱势、低量交易。'), reasons: reasons(['Traditional peak vacation season', 'Low liquidity is sensitive to news'], ['傳統度假高峰', '低流動性易受消息影響'], ['传统度假高峰', '低流动性易受消息影响']) },
  { month: 9, avgReturn: -0.72, volatility: 'high', characteristics: localized('The weakest month, with common declines.', '最差月份，常見下跌。', '最差月份，常见下跌。'), reasons: reasons(['Fiscal-year-end fund rebalancing', 'End-of-summer capital adjustment', 'Back-to-school and budget pressure'], ['財政年結束基金再平衡', '夏季結束資金調整', '開學及企業預算壓力'], ['财政年结束基金再平衡', '夏季结束资金调整', '开学及企业预算压力']) },
  { month: 10, avgReturn: 0.91, volatility: 'high', characteristics: localized('Positive but volatile, historically a crash month.', '正面但震盪大，歷史上是「崩盤月」。', '正面但震荡大，历史上是「崩盘月」。'), reasons: reasons(['Concentrated third-quarter earnings', 'Historical shocks but average rebounds', 'Seasonal VIX peak'], ['第三季財報季集中公布', '歷史事件但平均常反彈', 'VIX 季節高峰'], ['第三季财报季集中公布', '历史事件但平均常反弹', 'VIX 季节高峰']) },
  { month: 11, avgReturn: 1.82, volatility: 'medium', characteristics: localized('The year-end rally begins.', '年末強勢啟動。', '年末强势启动。'), reasons: reasons(['Less uncertainty after elections', 'Holiday spending expectations', 'Santa Claus rally begins'], ['選舉後不確定性減低', '假期消費預期', 'Santa Claus Rally 開始'], ['选举后不确定性降低', '假期消费预期', 'Santa Claus Rally 开始']) },
  { month: 12, avgReturn: 1.49, volatility: 'medium', characteristics: localized('A strong year-end finish.', '年末 rally、強勢收官。', '年末 rally、强势收官。'), reasons: reasons(['Year-end bonus and capital inflow', 'Tax planning delays selling', 'Institutional window dressing', 'Holiday optimism'], ['年終獎金及資金投入', '稅務規劃延後賣出', '機構粉飾報表', '假期樂觀情緒'], ['年终奖金及资金投入', '税务规划延后卖出', '机构粉饰报表', '假期乐观情绪']) },
]

export const strongSeasonalityMonths = [11, 12, 1, 2, 3, 4] as const
export const weakSeasonalityMonths = [5, 6, 7, 8, 9, 10] as const

const monthNames: Record<SeasonalityLocale, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  'zh-TW': ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
  'zh-CN': ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
}
const shortMonthNames: Record<SeasonalityLocale, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  'zh-TW': ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  'zh-CN': ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
}

export function seasonalityMonthName(month: number, locale: SeasonalityLocale) {
  return monthNames[locale][month - 1] ?? String(month)
}

export function seasonalityShortMonthName(month: number, locale: SeasonalityLocale) {
  return shortMonthNames[locale][month - 1] ?? String(month)
}

export function seasonalityMonthInTimezone(now: Date, timeZone: string) {
  const month = new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric' }).format(now)
  return Number(month)
}

export function seasonalityMonthData(month: number) {
  return seasonalityMonths.find(item => item.month === month) ?? null
}

export function seasonalityStrength(avgReturn: number): SeasonalityStrength {
  if (avgReturn >= 1.5) return 'strongest'
  if (avgReturn >= 0.8) return 'strong'
  if (avgReturn >= 0) return 'neutral'
  if (avgReturn >= -0.3) return 'weak'
  return 'weakest'
}

export function seasonalityPeriodAverage(months: readonly number[]) {
  const values = seasonalityMonths.filter(item => months.includes(item.month)).map(item => item.avgReturn)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export function strongestSeasonalityMonths(count = 3) {
  return [...seasonalityMonths].sort((a, b) => b.avgReturn - a.avgReturn || a.month - b.month).slice(0, count)
}

export function weakestSeasonalityMonths(count = 3) {
  return [...seasonalityMonths].sort((a, b) => a.avgReturn - b.avgReturn || a.month - b.month).slice(0, count)
}

export function seasonalityPeriodCopy(locale: SeasonalityLocale) {
  return {
    strongName: locale === 'en' ? 'Best six months' : locale === 'zh-TW' ? '最佳六個月' : '最佳六个月',
    weakName: locale === 'en' ? 'Weak period' : locale === 'zh-TW' ? '相對弱勢期' : '相对弱势期',
    strongDescription: locale === 'en' ? 'November to April (historically higher returns than May to October).' : locale === 'zh-TW' ? '11 月至 4 月（歷史平均回報高於 5 月至 10 月）。' : '11 月至 4 月（历史平均回报高于 5 月至 10 月）。',
    weakDescription: locale === 'en' ? 'May to October (the “Sell in May and go away” phenomenon).' : locale === 'zh-TW' ? '5 月至 10 月（「Sell in May and go away」現象）。' : '5 月至 10 月（「Sell in May and go away」现象）。',
    strongStrategy: locale === 'en' ? 'Supports the historical “Sell in May and go away” observation, while long-term holding still outperforms timing.' : locale === 'zh-TW' ? '支持歷史上的「Sell in May and go away」觀察，但長期持有仍優於擇時。' : '支持历史上的「Sell in May and go away」观察，但长期持有仍优于择时。',
    weakStrategy: locale === 'en' ? 'Autumn volatility is historically higher, especially in September and October; summer is relatively stable.' : locale === 'zh-TW' ? '秋季波動性歷史上較高，尤其是 9 月及 10 月；夏季相對平穩。' : '秋季波动性历史上较高，尤其是 9 月及 10 月；夏季相对平稳。',
  }
}
