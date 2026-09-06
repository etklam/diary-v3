import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { marketHistoricalSchema, marketQuoteSchema, marketSymbolSchema, type MarketQuote } from '@diary/contracts/market'
import { alignRelativeRatioHistory, calculateRelativeValue, generateRelativePricePoints, getRelativeAliasSuggestion, maxGeneratedPricePoints, parseRelativeTargetPrices, relativeHistoryRanges, splitRelativeRatioSegments, type RelativeDirection, type RelativeHistoryRange } from '@diary/domain/relative-value'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { MarketResearchCapture } from '../market-research-capture'
import { ToolShell, toolByHref } from '../tool-shell'
import '../market-research.css'

type Locale = 'en' | 'zh-TW' | 'zh-CN'
type Side = 'primary' | 'comparison'
type QuoteState = { data: MarketQuote | null; pending: boolean; error: Failure | null; source: string | null; fetchedAt: string | null }
type HistoryState = { data: ReturnType<typeof alignRelativeRatioHistory>; pending: boolean; error: Failure | null }

const copy = {
  en: {
    title: 'Relative value', intro: 'Compare two quoted prices with an explicit ratio, editable scenarios and common-date history.', primary: 'Primary', comparison: 'Comparison', symbol: 'Symbol', price: 'Current price', fetch: 'Fetch quote', manual: 'Manual input', quote: 'Fetched quote', source: 'Source', fetched: 'Fetched at', currency: 'Currency', preset: 'Preset pairs', presetHint: 'Presets are starting points, not recommendations.', ratio: 'Current ratio', inverse: 'Inverse ratio', formula: 'Primary ÷ comparison', target: 'Scenario prices', automatic: 'Generate scenarios', manualTargets: 'Enter target prices', targetPlaceholder: 'e.g. 420, 450, 480', count: 'Points each direction', step: 'Price step', direction: 'Direction', down: 'Down', up: 'Up', both: 'Both', calculate: 'Calculate', row: 'Primary price', corresponding: 'Comparison price', select: 'Use this row', selected: 'Selected scenario', currentInputs: 'Calculation inputs', history: 'Common-date ratio history', range: 'History range', date: 'Date', primaryClose: 'Primary close', comparisonClose: 'Comparison close', chart: 'Ratio chart', table: 'History data', noHistory: 'No common valid dates are available for this range.', loading: 'Loading history…', quoteError: 'Quote unavailable; enter a positive manual price or retry.', historyError: 'History unavailable. Try again or choose another range.', invalidSymbol: 'Enter a valid market symbol.', invalidPrices: 'Both current prices must be positive finite numbers.', invalidTargets: 'Enter positive numbers only; prefixes, zero, and negative values are rejected.', tooMany: `Use at most ${maxGeneratedPricePoints} points per direction.`, copy: 'Copy Markdown', copied: 'Copied.', copyFailed: 'Copy failed. Select the text and copy it manually.', capture: 'Save this comparison', provenance: 'The calculation keeps manual and fetched inputs separate.', alias: 'Use canonical index symbol', oneQuote: 'quote', unknown: 'Unavailable', noRows: 'No scenario rows yet.', historyRows: 'common dates',
  },
  'zh-TW': {
    title: '相對價值', intro: '以明確比率比較兩個報價，並提供可編輯情境及共同日期歷史。', primary: '主要標的', comparison: '比較標的', symbol: '代號', price: '目前價格', fetch: '取得報價', manual: '手動輸入', quote: '已取得報價', source: '來源', fetched: '取得時間', currency: '貨幣', preset: '預設配對', presetHint: '預設配對只是起點，不是建議。', ratio: '目前比率', inverse: '反向比率', formula: '主要標的 ÷ 比較標的', target: '情境價格', automatic: '產生情境', manualTargets: '輸入目標價格', targetPlaceholder: '例如 420、450、480', count: '每方向點數', step: '價格步幅', direction: '方向', down: '下跌', up: '上升', both: '兩者', calculate: '計算', row: '主要標的價格', corresponding: '比較標的價格', select: '使用此列', selected: '已選情境', currentInputs: '計算輸入', history: '共同日期比率歷史', range: '歷史範圍', date: '日期', primaryClose: '主要收市價', comparisonClose: '比較收市價', chart: '比率圖', table: '歷史資料', noHistory: '此範圍沒有共同且有效的日期。', loading: '正在載入歷史…', quoteError: '報價無法取得；請輸入正數手動價格或重試。', historyError: '歷史資料無法取得，請重試或選擇其他範圍。', invalidSymbol: '請輸入有效市場代號。', invalidPrices: '兩個目前價格都必須是有限正數。', invalidTargets: '只可輸入正數；不接受前綴、零或負數。', tooMany: `每個方向最多 ${maxGeneratedPricePoints} 點。`, copy: '複製 Markdown', copied: '已複製。', copyFailed: '複製失敗，請選取文字後手動複製。', capture: '保存這次比較', provenance: '計算會分開保留手動及已取得的輸入。', alias: '使用標準指數代號', oneQuote: '報價', unknown: '無資料', noRows: '尚未有情境列。', historyRows: '共同日期',
  },
  'zh-CN': {
    title: '相对价值', intro: '用明确比率比较两个报价，并提供可编辑情景及共同日期历史。', primary: '主要标的', comparison: '比较标的', symbol: '代码', price: '当前价格', fetch: '获取报价', manual: '手动输入', quote: '已获取报价', source: '来源', fetched: '获取时间', currency: '货币', preset: '预设配对', presetHint: '预设配对只是起点，不是建议。', ratio: '当前比率', inverse: '反向比率', formula: '主要标的 ÷ 比较标的', target: '情景价格', automatic: '生成情景', manualTargets: '输入目标价格', targetPlaceholder: '例如 420、450、480', count: '每方向点数', step: '价格步幅', direction: '方向', down: '下跌', up: '上升', both: '两者', calculate: '计算', row: '主要标的价格', corresponding: '比较标的价格', select: '使用此行', selected: '已选情景', currentInputs: '计算输入', history: '共同日期比率历史', range: '历史范围', date: '日期', primaryClose: '主要收盘价', comparisonClose: '比较收盘价', chart: '比率图', table: '历史数据', noHistory: '此范围没有共同且有效的日期。', loading: '正在加载历史…', quoteError: '报价无法获取；请输入正数手动价格或重试。', historyError: '历史数据无法获取，请重试或选择其他范围。', invalidSymbol: '请输入有效市场代码。', invalidPrices: '两个当前价格都必须是有限正数。', invalidTargets: '只可输入正数；不接受前缀、零或负数。', tooMany: `每个方向最多 ${maxGeneratedPricePoints} 点。`, copy: '复制 Markdown', copied: '已复制。', copyFailed: '复制失败，请选择文字后手动复制。', capture: '保存这次比较', provenance: '计算会分开保留手动及已获取的输入。', alias: '使用标准指数代码', oneQuote: '报价', unknown: '无数据', noRows: '尚未有情景行。', historyRows: '共同日期',
  },
} satisfies Record<Locale, Record<string, string>>

const presets = [
  ['^GSPC', 'SPY'], ['SPY', 'SPLG'], ['QQQ', 'QQQM'], ['GLD', 'GLDM'],
] as const

const emptyQuote = (): QuoteState => ({ data: null, pending: false, error: null, source: null, fetchedAt: null })
const emptyHistory = (): HistoryState => ({ data: [], pending: false, error: null })

function positivePrice(value: string) {
  if (!/^\+?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function formatNumber(locale: Locale, value: number | null, digits = 4) {
  return value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)
}

function formatInstant(locale: Locale, timestamp: string | null) {
  return timestamp ? `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(timestamp))} UTC` : '—'
}

function formatDay(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

export default function RelativeValue() {
  const { locale, t } = useUi()
  const c = copy[locale]
  const [primarySymbol, setPrimarySymbol] = useState('^GSPC')
  const [comparisonSymbol, setComparisonSymbol] = useState('SPY')
  const [primaryPrice, setPrimaryPrice] = useState('')
  const [comparisonPrice, setComparisonPrice] = useState('')
  const [primaryOrigin, setPrimaryOrigin] = useState<'manual' | 'quote'>('manual')
  const [comparisonOrigin, setComparisonOrigin] = useState<'manual' | 'quote'>('manual')
  const [primaryQuote, setPrimaryQuote] = useState<QuoteState>(emptyQuote)
  const [comparisonQuote, setComparisonQuote] = useState<QuoteState>(emptyQuote)
  const [targetMode, setTargetMode] = useState<'automatic' | 'manual'>('automatic')
  const [targetText, setTargetText] = useState('')
  const [count, setCount] = useState('5')
  const [step, setStep] = useState('50')
  const [direction, setDirection] = useState<RelativeDirection>('both')
  const [selected, setSelected] = useState<number | null>(null)
  const [historyPrimary, setHistoryPrimary] = useState('^GSPC')
  const [historyComparison, setHistoryComparison] = useState('SPY')
  const [historyRange, setHistoryRange] = useState<RelativeHistoryRange>('1y')
  const [history, setHistory] = useState<HistoryState>(emptyHistory)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [copyFallback, setCopyFallback] = useState<string | null>(null)
  const quoteVersions = useRef({ primary: 0, comparison: 0 })
  const historyVersion = useRef(0)

  async function fetchQuote(side: Side, requestedSymbol: string) {
    const setState = side === 'primary' ? setPrimaryQuote : setComparisonQuote
    const parsed = marketSymbolSchema.safeParse(requestedSymbol)
    if (!parsed.success) {
      setState({ data: null, pending: false, error: { message: c.invalidSymbol, fields: [side === 'primary' ? 'primarySymbol' : 'comparisonSymbol'] }, source: null, fetchedAt: null })
      return
    }
    const symbol = parsed.data
    const version = ++quoteVersions.current[side]
    setState({ data: null, pending: true, error: null, source: null, fetchedAt: null })
    try {
      const result = await api.GET('/api/market/quote/{symbol}', { params: { path: { symbol } } })
      if (version !== quoteVersions.current[side]) return
      const quote = marketQuoteSchema.safeParse(result.data)
      if (!result.response.ok || !quote.success) {
        const failure = apiFailure(result.error, c.quoteError)
        setState(current => ({ ...current, pending: false, error: failure }))
        return
      }
      setState({ data: quote.data, pending: false, error: null, source: result.response.headers.get('x-market-data-source'), fetchedAt: result.response.headers.get('x-market-data-fetched-at') })
      if (side === 'primary') {
        setPrimarySymbol(symbol); setPrimaryPrice(String(quote.data.regularMarketPrice)); setPrimaryOrigin('quote')
      } else {
        setComparisonSymbol(symbol); setComparisonPrice(String(quote.data.regularMarketPrice)); setComparisonOrigin('quote')
      }
    } catch {
      const failure = apiFailure(null, c.quoteError)
      if (version === quoteVersions.current[side]) setState(current => ({ ...current, pending: false, error: failure }))
    }
  }

  async function loadHistory(primary = historyPrimary, comparison = historyComparison, range = historyRange) {
    const first = marketSymbolSchema.safeParse(primary)
    const second = marketSymbolSchema.safeParse(comparison)
    if (!first.success || !second.success) { setHistory({ data: [], pending: false, error: { message: c.invalidSymbol, fields: ['history'] } }); return }
    const version = ++historyVersion.current
    setHistory({ data: [], pending: true, error: null })
    try {
      const responses = await Promise.all([
        api.GET('/api/market/historical', { params: { query: { symbol: first.data, range } } }),
        api.GET('/api/market/historical', { params: { query: { symbol: second.data, range } } }),
      ])
      if (version !== historyVersion.current) return
      const firstData = marketHistoricalSchema.safeParse(responses[0].data)
      const secondData = marketHistoricalSchema.safeParse(responses[1].data)
      if (!responses[0].response.ok || !responses[1].response.ok || !firstData.success || !secondData.success) {
        setHistory({ data: [], pending: false, error: apiFailure(responses.find(response => !response.response.ok)?.error, c.historyError) })
      } else setHistory({ data: alignRelativeRatioHistory(firstData.data, secondData.data), pending: false, error: null })
    } catch {
      if (version === historyVersion.current) setHistory({ data: [], pending: false, error: apiFailure(null, c.historyError) })
    }
  }

  useEffect(() => {
    void fetchQuote('primary', primarySymbol)
    void fetchQuote('comparison', comparisonSymbol)
    void loadHistory()
  }, [])

  const primaryValue = positivePrice(primaryPrice)
  const comparisonValue = positivePrice(comparisonPrice)
  const targetParse = useMemo(() => {
    if (targetMode !== 'manual') return { values: [] as number[], invalid: false }
    if (!targetText.trim()) return { values: [] as number[], invalid: false }
    try { return { values: parseRelativeTargetPrices(targetText), invalid: false } } catch { return { values: [] as number[], invalid: true } }
  }, [targetMode, targetText])
  const parsedTargets = targetParse.values
  const targetError = targetParse.invalid ? c.invalidTargets : null
  const stepValue = positivePrice(step)
  const countValue = Number(count)
  const validCount = Number.isInteger(countValue) && countValue >= 1 && countValue <= maxGeneratedPricePoints
  const generatedTargets = targetMode === 'automatic' && primaryValue !== null && stepValue !== null && validCount ? generateRelativePricePoints(primaryValue, countValue, stepValue, direction) : []
  const targets = targetMode === 'manual' ? parsedTargets : generatedTargets
  const result = primaryValue !== null && comparisonValue !== null && targets.length > 0 ? calculateRelativeValue({ primarySymbol, primaryPrice: primaryValue, relativeSymbol: comparisonSymbol, relativePrice: comparisonValue, targetPrices: targets }) : null
  const rows = result ? [...result.priceTable].sort((a, b) => b.targetPrice - a.targetPrice) : []
  const ratioSegments = splitRelativeRatioSegments(history.data)
  const knownRatios = history.data.flatMap(point => point.ratio === null ? [] : [point.ratio])
  const historyMin = knownRatios.length ? Math.min(...knownRatios) : 0
  const historyMax = knownRatios.length ? Math.max(...knownRatios) : 1
  const summary = result ? `${primarySymbol} / ${comparisonSymbol} = ${formatNumber(locale, result.ratio)} (${c.formula}).` : c.provenance
  const markdown = useMemo(() => {
    if (!result) return ''
    const provenance = `${primarySymbol}: ${primaryOrigin === 'quote' ? `${c.quote} (${formatInstant(locale, primaryQuote.fetchedAt)})` : c.manual}; ${comparisonSymbol}: ${comparisonOrigin === 'quote' ? `${c.quote} (${formatInstant(locale, comparisonQuote.fetchedAt)})` : c.manual}`
    return [`# ${c.title}`, '', `${c.currentInputs}:`, `- ${primarySymbol}: ${primaryPrice} (${primaryOrigin === 'quote' ? c.quote : c.manual})`, `- ${comparisonSymbol}: ${comparisonPrice} (${comparisonOrigin === 'quote' ? c.quote : c.manual})`, `- ${c.ratio}: ${formatNumber(locale, result.ratio)}`, `- ${c.inverse}: ${formatNumber(locale, result.inverseRatio)}`, '', `${c.target}:`, `| ${c.row} | ${c.corresponding} |`, '| ---: | ---: |', ...rows.map(row => `| ${formatNumber(locale, row.targetPrice)} | ${formatNumber(locale, row.correspondingPrice)} |`), '', `${c.history}: ${historyRange}; ${history.data.length} ${c.historyRows}.`, provenance].join('\n')
  }, [c, comparisonOrigin, comparisonPrice, comparisonQuote.fetchedAt, comparisonSymbol, history.data.length, historyRange, locale, primaryOrigin, primaryPrice, primaryQuote.fetchedAt, primarySymbol, result, rows])

  async function copyMarkdown() {
    if (!markdown) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(markdown)
      else throw new Error('clipboard unavailable')
      setCopyState('copied'); setCopyFallback(null)
    } catch {
      try {
        const textarea = document.createElement('textarea'); textarea.value = markdown; textarea.className = 'market-research-copy-fallback'; document.body.append(textarea); textarea.select(); const copied = document.execCommand('copy'); textarea.remove(); setCopyState(copied ? 'copied' : 'failed')
        if (!copied) setCopyFallback(markdown)
      } catch { setCopyState('failed'); setCopyFallback(markdown) }
    }
  }

  function applyPreset(first: string, second: string) {
    setPrimarySymbol(first); setComparisonSymbol(second); setPrimaryPrice(''); setComparisonPrice(''); setPrimaryOrigin('manual'); setComparisonOrigin('manual'); setSelected(null)
    void fetchQuote('primary', first); void fetchQuote('comparison', second); setHistoryPrimary(first); setHistoryComparison(second); void loadHistory(first, second, historyRange)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void fetchQuote('primary', primarySymbol)
    void fetchQuote('comparison', comparisonSymbol)
    setHistoryPrimary(primarySymbol); setHistoryComparison(comparisonSymbol); void loadHistory(primarySymbol, comparisonSymbol, historyRange)
  }

  return <section className="market-research-page">
    <ToolShell tool={toolByHref('/tools/relative-value')} title={c.title} intro={c.intro} actions={<button type="button" className="secondary" onClick={() => void copyMarkdown()} disabled={!markdown}>{copyState === 'copied' ? c.copied : copyState === 'failed' ? c.copyFailed : c.copy}</button>} />{copyFallback && <textarea readOnly className="market-research-copy-fallback" aria-label={c.copyFailed} value={copyFallback} />}
    <form className="market-research-section" onSubmit={submit}>
      <div className="market-research-inputs">
        <div className="market-research-pair"><label>{c.primary} · {c.symbol}<input value={primarySymbol} onChange={event => setPrimarySymbol(event.target.value)} maxLength={32} spellCheck={false} autoCapitalize="characters" aria-label={`${c.primary} ${c.symbol}`} /></label><label>{c.primary} · {c.price}<input value={primaryPrice} onChange={event => { setPrimaryPrice(event.target.value); setPrimaryOrigin('manual') }} inputMode="decimal" aria-label={`${c.primary} ${c.price}`} /></label><button type="button" className="secondary" onClick={() => void fetchQuote('primary', primarySymbol)} disabled={primaryQuote.pending}>{primaryQuote.pending ? t('loading') : c.fetch}</button>{primaryQuote.error && <FailureNotice failure={primaryQuote.error} id="relative-primary-quote-error" />}</div>
        <div className="market-research-pair"><label>{c.comparison} · {c.symbol}<input value={comparisonSymbol} onChange={event => setComparisonSymbol(event.target.value)} maxLength={32} spellCheck={false} autoCapitalize="characters" aria-label={`${c.comparison} ${c.symbol}`} /></label><label>{c.comparison} · {c.price}<input value={comparisonPrice} onChange={event => { setComparisonPrice(event.target.value); setComparisonOrigin('manual') }} inputMode="decimal" aria-label={`${c.comparison} ${c.price}`} /></label><button type="button" className="secondary" onClick={() => void fetchQuote('comparison', comparisonSymbol)} disabled={comparisonQuote.pending}>{comparisonQuote.pending ? t('loading') : c.fetch}</button>{comparisonQuote.error && <FailureNotice failure={comparisonQuote.error} id="relative-comparison-quote-error" />}</div>
      </div>
      <div className="market-research-input-actions"><button type="submit">{c.fetch}</button><p className="market-research-meta">{c.provenance}</p></div>
      <div className="market-preset-row" aria-label={c.preset}><span className="muted">{c.preset}: </span>{presets.map(([first, second]) => <button key={`${first}/${second}`} type="button" className="secondary" onClick={() => applyPreset(first, second)}>{first} / {second}</button>)}</div>
      {getRelativeAliasSuggestion(primarySymbol) && <p className="muted">{c.alias}: {getRelativeAliasSuggestion(primarySymbol)}</p>}
      {(primaryQuote.data || comparisonQuote.data) && <div className="market-research-meta"><span>{primarySymbol}: {primaryQuote.data ? `${c.quote} · ${primaryQuote.data.currency ?? c.unknown} · ${formatInstant(locale, primaryQuote.fetchedAt)}` : c.manual}</span><span>{comparisonSymbol}: {comparisonQuote.data ? `${c.quote} · ${comparisonQuote.data.currency ?? c.unknown} · ${formatInstant(locale, comparisonQuote.fetchedAt)}` : c.manual}</span></div>}
    </form>
    {result && <dl className="market-ratio-read" aria-label={c.ratio}><div><dt>{c.ratio}</dt><dd><strong>{formatNumber(locale, result.ratio)}</strong><span className="market-research-meta">{primarySymbol} ÷ {comparisonSymbol}</span></dd></div><div><dt>{c.inverse}</dt><dd><strong>{formatNumber(locale, result.inverseRatio)}</strong><span className="market-research-meta">{comparisonSymbol} ÷ {primarySymbol}</span></dd></div></dl>}
    <div className="market-research-grid market-research-relative-grid">
    <section className="market-research-section" aria-labelledby="relative-scenario-title"><h2 id="relative-scenario-title">{c.target}</h2><div className="market-research-controls"><label>{c.automatic}<select value={targetMode} onChange={event => setTargetMode(event.target.value as 'automatic' | 'manual')}><option value="automatic">{c.automatic}</option><option value="manual">{c.manualTargets}</option></select></label>{targetMode === 'automatic' ? <><label>{c.count}<input type="number" min="1" max={maxGeneratedPricePoints} value={count} onChange={event => setCount(event.target.value)} /></label><label>{c.step}<input inputMode="decimal" value={step} onChange={event => setStep(event.target.value)} /></label><label>{c.direction}<select value={direction} onChange={event => setDirection(event.target.value as RelativeDirection)}><option value="down">{c.down}</option><option value="up">{c.up}</option><option value="both">{c.both}</option></select></label></> : <label className="wide">{c.manualTargets}<input value={targetText} onChange={event => setTargetText(event.target.value)} placeholder={c.targetPlaceholder} aria-invalid={targetError ? true : undefined} /></label>}</div>{targetError && <p className="market-error" role="alert">{targetError}</p>}{targetMode === 'automatic' && (!validCount || stepValue === null) && <p className="market-error" role="alert">{c.tooMany}</p>}{result && <p className="market-research-meta">{c.ratio}: <strong>{formatNumber(locale, result.ratio)}</strong> · {c.inverse}: <strong>{formatNumber(locale, result.inverseRatio)}</strong> · {c.formula}</p>}{!result && primaryPrice && comparisonPrice && !targetError && <p className="market-error" role="alert">{primaryValue === null || comparisonValue === null ? c.invalidPrices : c.noRows}</p>}{rows.length > 0 ? <div className="market-scenario-table"><table><caption>{c.selected}</caption><thead><tr><th scope="col">{c.row}</th><th scope="col">{c.corresponding}</th><th scope="col"><span className="sr-only">{c.select}</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.targetPrice}><td>{formatNumber(locale, row.targetPrice)}</td><td>{formatNumber(locale, row.correspondingPrice)}</td><td><button type="button" className="secondary" onClick={() => { setPrimaryPrice(String(row.targetPrice)); setComparisonPrice(String(row.correspondingPrice)); setSelected(row.targetPrice) }}>{selected === row.targetPrice ? c.selected : c.select}</button></td></tr>)}</tbody></table></div> : <p className="market-empty">{c.noRows}</p>}</section>

    <section className="market-research-section" aria-labelledby="relative-history-title"><div className="market-heading"><h2 id="relative-history-title">{c.history}</h2><label>{c.range}<select value={historyRange} onChange={event => { const next = event.target.value as RelativeHistoryRange; setHistoryRange(next); void loadHistory(historyPrimary, historyComparison, next) }} aria-label={c.range}>{relativeHistoryRanges.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>{history.pending ? <p role="status">{c.loading}</p> : history.error ? <><FailureNotice failure={history.error} id="relative-history-error" /><button type="button" className="secondary" onClick={() => void loadHistory()}>{t('retry')}</button></> : history.data.length === 0 ? <p className="market-empty">{c.noHistory}</p> : <><div className="market-history-chart" tabIndex={0} aria-label={`${c.chart} · ${historyPrimary} / ${historyComparison}`}><svg viewBox="0 0 720 260" role="img" aria-label={c.chart}><line x1="20" y1="235" x2="700" y2="235" />{ratioSegments.map((segment, segmentIndex) => <polyline key={segmentIndex} points={segment.map(point => { if (point.ratio === null) return ''; const index = history.data.indexOf(point); return `${(index / Math.max(1, history.data.length - 1)) * 680 + 20},${235 - ((point.ratio - historyMin) / Math.max(0.000001, historyMax - historyMin)) * 200}` }).join(' ')} />)}</svg></div><details className="market-history-table"><summary>{c.table} · {history.data.length} {c.historyRows}</summary><table><caption>{c.table} · {history.data.length} {c.historyRows}</caption><thead><tr><th scope="col">{c.date}</th><th scope="col">{c.primaryClose}</th><th scope="col">{c.comparisonClose}</th><th scope="col">{c.ratio}</th></tr></thead><tbody>{history.data.slice().reverse().map(point => <tr key={point.timestamp}><td>{formatDay(point.timestamp)}</td><td>{formatNumber(locale, point.primaryClose)}</td><td>{formatNumber(locale, point.relativeClose)}</td><td>{formatNumber(locale, point.ratio)}</td></tr>)}</tbody></table></details></>}</section>

    </div>
    {result && <MarketResearchCapture symbol={primarySymbol} sourceType="RELATIVE_VALUE" sourceTitle={`${primarySymbol} / ${comparisonSymbol}`} suggestedSummary={markdown || summary} metadata={{ primarySymbol, comparisonSymbol, primaryPrice, comparisonPrice, primaryOrigin, comparisonOrigin, ratio: result.ratio, inverseRatio: result.inverseRatio, historyRange, historyRows: history.data.length }} />}
  </section>
}
