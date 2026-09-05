import { useEffect, useMemo, useState } from 'react'
import { authUserResponseSchema } from '@diary/contracts'
import { seasonalityMonthData, seasonalityMonthInTimezone, seasonalityMonthName, seasonalityPeriodAverage, seasonalityPeriodCopy, seasonalityShortMonthName, seasonalityStrength, strongestSeasonalityMonths, weakSeasonalityMonths, type SeasonalityLocale, type SeasonalityMonth, type SeasonalityStrength, type SeasonalityVolatility } from '@diary/domain/seasonality'
import { api, useUi } from '../ui'
import { useSessionState } from '../session'
import { MarketResearchCapture } from '../market-research-capture'
import '../market-research.css'

type Locale = SeasonalityLocale

const copy = {
  en: {
    title: 'Seasonality', intro: 'A fixed historical reference for the S&P 500, using arithmetic monthly averages from 1950 onward.', scope: 'Scope and source', scopeValue: 'S&P 500 · monthly averages · 1950+', current: 'Current month', next: 'Next month', timezone: 'Account timezone', average: 'Average return', volatility: 'Volatility', strength: 'Strength', reasons: 'Historical reasons', fullYear: 'Full year', month: 'Month', characteristics: 'Historical character', interpretation: 'Interpretation', best: 'Strongest three', worst: 'Weakest three', strongPeriod: 'November–April', weakPeriod: 'May–October', monthly: 'Monthly reference', barChart: 'Monthly average return chart', zero: '0% reference', copy: 'Copy Markdown', copied: 'Copied.', copyFailed: 'Copy failed. Select the text and copy it manually.', capture: 'Save this reading', noTimezone: 'Using browser timezone', source: 'Source boundary', sourceValue: 'Fixed research dataset; no provider or company data is requested.', returnUnit: '%', periodAverage: 'Period average', currentDate: 'Current month is based on the account timezone.',
  },
  'zh-TW': {
    title: '季節性', intro: 'S&P 500 的固定歷史參考，採用 1950 年起的月度算術平均回報。', scope: '範圍及來源', scopeValue: 'S&P 500・月度平均・1950 年起', current: '目前月份', next: '下個月份', timezone: '帳戶時區', average: '平均回報', volatility: '波動性', strength: '強弱', reasons: '歷史原因', fullYear: '全年', month: '月份', characteristics: '歷史特徵', interpretation: '解讀', best: '最強三個月', worst: '最弱三個月', strongPeriod: '11 月至 4 月', weakPeriod: '5 月至 10 月', monthly: '月度參考', barChart: '月度平均回報圖', zero: '0% 參考線', copy: '複製 Markdown', copied: '已複製。', copyFailed: '複製失敗，請選取文字後手動複製。', capture: '保存這次閱讀', noTimezone: '使用瀏覽器時區', source: '來源邊界', sourceValue: '固定研究資料集；不會請求供應商或公司資料。', returnUnit: '%', periodAverage: '期間平均', currentDate: '目前月份按帳戶時區計算。',
  },
  'zh-CN': {
    title: '季节性', intro: 'S&P 500 的固定历史参考，采用 1950 年起的月度算术平均回报。', scope: '范围及来源', scopeValue: 'S&P 500・月度平均・1950 年起', current: '当前月份', next: '下个月份', timezone: '账户时区', average: '平均回报', volatility: '波动性', strength: '强弱', reasons: '历史原因', fullYear: '全年', month: '月份', characteristics: '历史特征', interpretation: '解读', best: '最强三个月', worst: '最弱三个月', strongPeriod: '11 月至 4 月', weakPeriod: '5 月至 10 月', monthly: '月度参考', barChart: '月度平均回报图', zero: '0% 参考线', copy: '复制 Markdown', copied: '已复制。', copyFailed: '复制失败，请选择文字后手动复制。', capture: '保存这次阅读', noTimezone: '使用浏览器时区', source: '来源边界', sourceValue: '固定研究数据集；不会请求供应商或公司数据。', returnUnit: '%', periodAverage: '期间平均', currentDate: '当前月份按账户时区计算。',
  },
} satisfies Record<Locale, Record<string, string>>

const strengthLabels: Record<Locale, Record<SeasonalityStrength, string>> = {
  en: { weakest: 'Weakest', weak: 'Weak', neutral: 'Neutral', strong: 'Strong', strongest: 'Strongest' },
  'zh-TW': { weakest: '最弱', weak: '偏弱', neutral: '中性', strong: '偏強', strongest: '最強' },
  'zh-CN': { weakest: '最弱', weak: '偏弱', neutral: '中性', strong: '偏强', strongest: '最强' },
}
const volatilityLabels: Record<Locale, Record<SeasonalityVolatility, string>> = {
  en: { low: 'Low', 'low-medium': 'Low–medium', medium: 'Medium', 'medium-high': 'Medium–high', high: 'High' },
  'zh-TW': { low: '低', 'low-medium': '低至中', medium: '中', 'medium-high': '中至高', high: '高' },
  'zh-CN': { low: '低', 'low-medium': '低至中', medium: '中', 'medium-high': '中至高', high: '高' },
}

function fallbackTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

function formatNumber(locale: Locale, value: number) {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(value)}%`
}

function monthList(months: readonly SeasonalityMonth[], locale: Locale) {
  return months.map(month => seasonalityMonthName(month.month, locale)).join(locale === 'en' ? ', ' : '、')
}

export default function Seasonality() {
  const { locale } = useUi()
  const c = copy[locale]
  const session = useSessionState()
  const [timeZone, setTimeZone] = useState(fallbackTimezone)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [copyFallback, setCopyFallback] = useState<string | null>(null)
  useEffect(() => {
    if (session.authenticated !== true) return
    let active = true
    api.GET('/api/auth/me').then(result => {
      if (!active) return
      const parsed = authUserResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setTimeZone(parsed.data.data.timezone)
    }).catch(() => undefined)
    return () => { active = false }
  }, [session.authenticated, session.revision])

  const now = new Date()
  const currentMonth = seasonalityMonthInTimezone(now, timeZone)
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
  const current = seasonalityMonthData(currentMonth)!
  const next = seasonalityMonthData(nextMonth)!
  const strongest: SeasonalityMonth[] = strongestSeasonalityMonths(3)
  const weakest: SeasonalityMonth[] = [...weakSeasonalityMonths].map(month => seasonalityMonthData(month)!).sort((a, b) => a.avgReturn - b.avgReturn || a.month - b.month).slice(0, 3)
  const period = seasonalityPeriodCopy(locale)
  const strongAverage = seasonalityPeriodAverage([11, 12, 1, 2, 3, 4])
  const weakAverage = seasonalityPeriodAverage([5, 6, 7, 8, 9, 10])
  const maxMagnitude = Math.max(...[...Array.from({ length: 12 }, (_, index) => seasonalityMonthData(index + 1)!.avgReturn)].map(value => Math.abs(value)))
  const markdown = useMemo(() => {
    const rows = [...Array.from({ length: 12 }, (_, index) => seasonalityMonthData(index + 1)!)]
    return [`# ${c.title}`, '', c.scopeValue, `${c.timezone}: ${timeZone}`, '', `${c.current}: ${seasonalityMonthName(currentMonth, locale)} — ${formatNumber(locale, current.avgReturn)}`, `${c.next}: ${seasonalityMonthName(nextMonth, locale)} — ${formatNumber(locale, next.avgReturn)}`, '', `${period.strongName}: ${period.strongDescription}`, `${period.weakName}: ${period.weakDescription}`, '', `| ${c.month} | ${c.average} | ${c.volatility} | ${c.strength} | ${c.characteristics} | ${c.reasons} |`, '| --- | ---: | --- | --- | --- | --- |', ...rows.map(row => `| ${seasonalityMonthName(row.month, locale)} | ${formatNumber(locale, row.avgReturn)} | ${volatilityLabels[locale][row.volatility]} | ${strengthLabels[locale][seasonalityStrength(row.avgReturn)]} | ${row.characteristics[locale]} | ${row.reasons[locale].join('; ')} |`), '', period.strongStrategy, period.weakStrategy].join('\n')
  }, [c, current, currentMonth, locale, next, nextMonth, period, timeZone])

  async function copyMarkdown() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(markdown)
      else throw new Error('clipboard unavailable')
      setCopyState('copied'); setCopyFallback(null)
    } catch {
      try {
        const textarea = document.createElement('textarea'); textarea.value = markdown; textarea.className = 'market-research-copy-fallback'; document.body.append(textarea); textarea.select(); const copied = document.execCommand('copy'); textarea.remove(); setCopyState(copied ? 'copied' : 'failed'); if (!copied) setCopyFallback(markdown)
      } catch { setCopyState('failed'); setCopyFallback(markdown) }
    }
  }

  function monthPanel(label: string, month: SeasonalityMonth) {
    return <section className="market-research-section" aria-label={label}><h2>{label}: {seasonalityMonthName(month.month, locale)}</h2><dl className="market-ratio-read"><div><dt>{c.average}</dt><dd className={month.avgReturn >= 0 ? 'seasonality-value-positive' : 'seasonality-value-negative'}>{formatNumber(locale, month.avgReturn)}</dd></div><div><dt>{c.volatility}</dt><dd>{volatilityLabels[locale][month.volatility]}</dd></div><div><dt>{c.strength}</dt><dd>{strengthLabels[locale][seasonalityStrength(month.avgReturn)]}</dd></div></dl><p>{month.characteristics[locale]}</p><p className="market-research-meta">{c.reasons}: {month.reasons[locale].join(' · ')}</p></section>
  }

  return <section className="market-research-page">
    <header className="market-research-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><button type="button" className="secondary" onClick={() => void copyMarkdown()}>{copyState === 'copied' ? c.copied : copyState === 'failed' ? c.copyFailed : c.copy}</button></header>{copyFallback && <textarea readOnly className="market-research-copy-fallback" aria-label={c.copyFailed} value={copyFallback} />}
    <section className="market-research-section"><h2>{c.scope}</h2><p>{c.scopeValue}</p><p className="market-research-meta">{c.timezone}: {timeZone || c.noTimezone} · {c.currentDate}</p><p className="market-research-meta">{c.source}: {c.sourceValue}</p></section>
    <div className="market-research-grid">{monthPanel(c.current, current)}{monthPanel(c.next, next)}</div>
    <section className="market-research-section" aria-labelledby="seasonality-chart-title"><h2 id="seasonality-chart-title">{c.monthly}</h2><div className="seasonality-chart" tabIndex={0} aria-label={c.barChart}><svg viewBox="0 0 840 280" role="img" aria-label={c.barChart}><line x1="420" y1="18" x2="420" y2="252" />{Array.from({ length: 12 }, (_, index) => { const month = seasonalityMonthData(index + 1)!; const y = 20 + index * 19; const width = Math.abs(month.avgReturn) / maxMagnitude * 360; return <g key={month.month}><text x="8" y={y + 12}>{seasonalityShortMonthName(month.month, locale)}</text><rect className={month.avgReturn >= 0 ? 'positive' : 'negative'} x={month.avgReturn >= 0 ? 420 : 420 - width} y={y} width={width} height="13" /><text x={month.avgReturn >= 0 ? 426 + width : 414 - width} y={y + 12}>{formatNumber(locale, month.avgReturn)}</text></g> })}</svg><p className="market-research-meta">{c.zero}</p></div><div className="seasonality-table"><table><caption>{c.monthly}</caption><thead><tr><th scope="col">{c.month}</th><th scope="col">{c.average}</th><th scope="col">{c.volatility}</th><th scope="col">{c.strength}</th><th scope="col">{c.characteristics}</th><th scope="col">{c.reasons}</th></tr></thead><tbody>{Array.from({ length: 12 }, (_, index) => seasonalityMonthData(index + 1)!).map(month => <tr key={month.month} className={month.month === currentMonth ? 'current' : undefined}><th scope="row">{seasonalityMonthName(month.month, locale)}</th><td className={month.avgReturn >= 0 ? 'seasonality-value-positive' : 'seasonality-value-negative'}>{formatNumber(locale, month.avgReturn)}</td><td>{volatilityLabels[locale][month.volatility]}</td><td>{strengthLabels[locale][seasonalityStrength(month.avgReturn)]}</td><td>{month.characteristics[locale]}</td><td>{month.reasons[locale].join(' · ')}</td></tr>)}</tbody></table></div></section>
    <section className="market-research-section"><h2>{c.interpretation}</h2><div className="market-research-grid"><div><h3>{c.best}</h3><p>{monthList(strongest, locale)}</p><p>{period.strongDescription}</p><p>{c.periodAverage}: {formatNumber(locale, strongAverage)}</p></div><div><h3>{c.worst}</h3><p>{monthList(weakest, locale)}</p><p>{period.weakDescription}</p><p>{c.periodAverage}: {formatNumber(locale, weakAverage)}</p></div></div><div className="seasonality-interpretation"><p>{period.strongStrategy}</p><p>{period.weakStrategy}</p></div></section>
    <MarketResearchCapture sourceType="SEASONALITY" sourceTitle={c.title} suggestedSummary={markdown} metadata={{ scope: 'S&P 500', source: 'fixed-1950-monthly-reference', timeZone, currentMonth, nextMonth, strongest: strongest.map((month: SeasonalityMonth) => month.month), weakest: weakest.map((month: SeasonalityMonth) => month.month) }} allowCompanyEvidence={false} />
  </section>
}
