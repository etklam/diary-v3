import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  guruComparisonQuerySchema,
  guruComparisonResponseSchema,
  guruDirectoryQuerySchema,
  guruDirectoryResponseSchema,
} from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { formatNeutralValue } from '../market-display'
import { api, useUi } from '../ui'
import { guruCopy } from './gurus-copy'
import './guru-comparison.css'

type ComparisonData = ReturnType<typeof guruComparisonResponseSchema.parse>['data']
type DirectoryData = ReturnType<typeof guruDirectoryResponseSchema.parse>['data']

const copy = {
  'zh-TW': {
    title: '比較投資大師', intro: '對照不同大師同一申報季度的投資組合、持倉交集與相反動作。', search: '搜尋大師或基金', add: '加入比較', remove: '移除', selected: '已選大師', choose: '選擇 2 至 5 位大師開始比較。', max: '最多比較 5 位大師。',
    quarter: '申報季度', source: '來源：SEC Form 13F', filed: '申報日期', warning: '13F 是延遲披露的季度末持倉，未必代表管理人目前或完整的投資組合。', ready: '可用', partial: '部分資料', error: '處理錯誤', pending: '處理中', superseded: '已取代', noFiling: '未有申報',
    metric: '投資組合指標', position: '持倉', value: '申報組合價值', count: '持倉數', topTen: '前十持倉集中度', turnover: '季度周轉率', sectorAllocation: '板塊配置', actions: '最新季度動作（新建倉 · 增持 · 減持 · 退出）', manager: '大師', weight: '組合權重',
    common: '共同持倉', unique: '單一持倉', quarterMoves: '本季變化', shares: '股數', opposing: '相反動作', heldBy: '持有', selectedCount: '位已選大師', readyDenominator: '位可用大師', emptyPositions: '此季度沒有可比較的已映射持倉。', emptyMoves: '此季度沒有已披露的持倉變化。', emptyActions: '此季度沒有相反方向的已披露動作。', emptySearch: '沒有找到符合的大師。', loading: '正在整理比較資料…', failed: '無法載入比較資料。', retry: '重試', notEnough: '請再加入一位大師，才可建立比較。', dataUnavailable: '此季度尚無可用組合。非可用資料不會顯示估值。',
    directory: '大師名錄', consensus: '持倉共識', stocks: '最常持有', sectors: '板塊方向', compare: '比較',
  },
  'zh-CN': {
    title: '比较投资大师', intro: '对照不同大师同一申报季度的投资组合、持仓交集与相反动作。', search: '搜索大师或基金', add: '加入比较', remove: '移除', selected: '已选大师', choose: '选择 2 至 5 位大师开始比较。', max: '最多比较 5 位大师。',
    quarter: '申报季度', source: '来源：SEC Form 13F', filed: '申报日期', warning: '13F 是延迟披露的季度末持仓，未必代表管理人目前或完整的投资组合。', ready: '可用', partial: '部分数据', error: '处理错误', pending: '处理中', superseded: '已取代', noFiling: '未有申报',
    metric: '投资组合指标', position: '持仓', value: '申报组合价值', count: '持仓数', topTen: '前十持仓集中度', turnover: '季度周转率', sectorAllocation: '板块配置', actions: '最新季度动作（新建仓 · 增持 · 减持 · 退出）', manager: '大师', weight: '组合权重',
    common: '共同持仓', unique: '单一持仓', quarterMoves: '本季变化', shares: '股数', opposing: '相反动作', heldBy: '持有', selectedCount: '位已选大师', readyDenominator: '位可用大师', emptyPositions: '此季度没有可比较的已映射持仓。', emptyMoves: '此季度没有已披露的持仓变化。', emptyActions: '此季度没有相反方向的已披露动作。', emptySearch: '没有找到符合的大师。', loading: '正在整理比较资料…', failed: '无法加载比较资料。', retry: '重试', notEnough: '请再加入一位大师，才可建立比较。', dataUnavailable: '此季度尚无可用组合。非可用资料不会显示估值。',
    directory: '大师名录', consensus: '持仓共识', stocks: '最常持有', sectors: '板块方向', compare: '比较',
  },
  en: {
    title: 'Compare investors', intro: 'Compare reported portfolios, shared holdings, and opposing actions for one filing quarter.', search: 'Search Guru or fund', add: 'Add to comparison', remove: 'Remove', selected: 'Selected Gurus', choose: 'Choose two to five investors to start a comparison.', max: 'You can compare up to five investors.',
    quarter: 'Reported quarter', source: 'Source: SEC Form 13F', filed: 'Filed', warning: '13F holdings are delayed quarter-end disclosures and may not represent the manager’s current or complete portfolio.', ready: 'Ready', partial: 'Partial', error: 'Error', pending: 'Pending', superseded: 'Superseded', noFiling: 'No filing',
    metric: 'Portfolio metrics', position: 'Position', value: 'Reported portfolio value', count: 'Positions', topTen: 'Top ten concentration', turnover: 'Quarter turnover', sectorAllocation: 'Sector allocation', actions: 'Quarter actions (new · add · reduce · exit)', manager: 'Guru', weight: 'Portfolio weight',
    common: 'Common holdings', unique: 'Unique holdings', quarterMoves: 'Quarter moves', shares: 'shares', opposing: 'Opposing actions', heldBy: 'Held by', selectedCount: 'selected Gurus', readyDenominator: 'ready Gurus', emptyPositions: 'No mapped positions are available for comparison in this quarter.', emptyMoves: 'No reported position changes are available for this quarter.', emptyActions: 'No opposing reported actions were found for this quarter.', emptySearch: 'No matching Gurus found.', loading: 'Preparing comparison…', failed: 'Unable to load the comparison.', retry: 'Try again', notEnough: 'Add one more Guru to compare portfolios.', dataUnavailable: 'No ready portfolios are available for this quarter. Values are hidden for non-ready data.',
    directory: 'Guru directory', consensus: 'Consensus', stocks: 'Most held', sectors: 'Sector direction', compare: 'Compare',
  },
} as const

function statusLabel(status: string, text: typeof copy[keyof typeof copy]) {
  switch (status) {
    case 'READY': return text.ready
    case 'PARTIAL': return text.partial
    case 'ERROR': return text.error
    case 'SUPERSEDED': return text.superseded
    case 'NO_FILING': return text.noFiling
    default: return text.pending
  }
}

function actionLabel(action: string | null, locale: string) {
  if (!action) return '—'
  const words: Record<string, Record<string, string>> = {
    NEW: { 'zh-TW': '新建倉', 'zh-CN': '新建仓', en: 'NEW' },
    STRONG_ADD: { 'zh-TW': '大幅增持', 'zh-CN': '大幅增持', en: 'STRONG ADD' },
    ADD: { 'zh-TW': '增持', 'zh-CN': '增持', en: 'ADD' },
    UNCHANGED: { 'zh-TW': '不變', 'zh-CN': '不变', en: 'UNCHANGED' },
    REDUCE: { 'zh-TW': '減持', 'zh-CN': '减持', en: 'REDUCE' },
    STRONG_REDUCE: { 'zh-TW': '大幅減持', 'zh-CN': '大幅减持', en: 'STRONG REDUCE' },
    EXIT: { 'zh-TW': '退出', 'zh-CN': '退出', en: 'EXIT' },
  }
  return words[action]?.[locale] ?? action
}

export default function GuruComparisonPage() {
  const { locale } = useUi()
  const text = copy[locale]
  const common = guruCopy[locale]
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = (searchParams.get('gurus') ?? '').split(',').filter(Boolean).slice(0, 5)
  const period = searchParams.get('period') ?? ''
  const [term, setTerm] = useState('')
  const [directory, setDirectory] = useState<DirectoryData>([])
  const [data, setData] = useState<ComparisonData | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState(false)
  const [directoryPending, setDirectoryPending] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const query = term.trim()
    if (query.length < 2) { setDirectory([]); setDirectoryPending(false); return }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setDirectoryPending(true)
      const request = guruDirectoryQuerySchema.parse({ search: query, page: 1, limit: 10, sort: 'az' })
      void api.GET('/api/gurus', { params: { query: request }, signal: controller.signal }).then(result => {
        const parsed = guruDirectoryResponseSchema.safeParse(result.data)
        if (!controller.signal.aborted) setDirectory(result.response.ok && parsed.success ? parsed.data.data : [])
      }).catch(() => { if (!controller.signal.aborted) setDirectory([]) }).finally(() => { if (!controller.signal.aborted) setDirectoryPending(false) })
    }, 180)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [term])

  useEffect(() => {
    if (selected.length < 2) { setData(null); setFailure(null); setPending(false); return }
    const controller = new AbortController()
    setPending(true); setFailure(null); setData(null)
    const query = guruComparisonQuerySchema.parse({ slugs: selected.join(','), ...(period ? { period } : {}) })
    void api.GET('/api/gurus/compare', { params: { query }, signal: controller.signal }).then(result => {
      const parsed = guruComparisonResponseSchema.safeParse(result.data)
      if (controller.signal.aborted) return
      if (!result.response.ok || !parsed.success) setFailure(apiFailure(result.error, text.failed))
      else setData(parsed.data.data)
    }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, text.failed)) })
      .finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [attempt, selected.join(','), period, text.failed])

  function update(nextSelected: string[], nextPeriod = period) {
    const params = new URLSearchParams(searchParams)
    if (nextSelected.length) params.set('gurus', nextSelected.join(',')); else params.delete('gurus')
    if (nextPeriod) params.set('period', nextPeriod); else params.delete('period')
    setSearchParams(params)
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const match = directory.find(item => item.profile.slug === term.trim())
    if (match) add(match.profile.slug)
  }

  function add(slug: string) {
    if (selected.includes(slug) || selected.length >= 5) return
    update([...selected, slug], '')
    setTerm('')
  }

  function shownValue(value: string | null, suffix = '') {
    return value === null ? '—' : `${formatNeutralValue(locale, Number(value), 4)}${suffix}`
  }

  const periodOptions = data?.periods ?? []
  return <main className="guru-comparison-page">
    <header className="guru-comparison-hero">
      <div><h1>{text.title}</h1><p>{text.intro}</p></div>
      <nav aria-label={text.directory}>
        <Link to="/gurus">{text.directory}</Link><Link to="/gurus/consensus">{text.consensus}</Link>
        <Link to="/gurus/stocks">{text.stocks}</Link><Link to="/gurus/sectors">{text.sectors}</Link>
        <Link aria-current="page" to="/gurus/compare">{text.compare}</Link>
      </nav>
    </header>
    <p className="guru-disclosure" role="note">{text.warning}</p>

    <section className="guru-comparison-select" aria-label={text.selected}>
      <form onSubmit={submitSearch}>
        <label htmlFor="guru-comparison-search">{text.search}</label>
        <div><input id="guru-comparison-search" type="search" value={term} onChange={event => setTerm(event.target.value)} autoComplete="off" />
          <button type="submit" disabled={!directory.some(item => item.profile.slug === term.trim())}>{text.add}</button></div>
      </form>
      {term.trim().length >= 2 && <ul className="guru-comparison-results" aria-live="polite">
        {directoryPending && <li role="status">{common.loading}</li>}
        {!directoryPending && directory.filter(item => !selected.includes(item.profile.slug)).map(item => <li key={item.profile.slug}>
          <span><strong>{item.profile.name}</strong><small>{item.profile.managerName}</small></span>
          <button type="button" className="secondary" disabled={selected.length >= 5} onClick={() => add(item.profile.slug)}>{text.add}</button>
        </li>)}
        {!directoryPending && directory.length === 0 && <li>{text.emptySearch}</li>}
      </ul>}
      <div className="guru-comparison-selected"><h2>{text.selected} <span>{selected.length}/5</span></h2>
        {selected.length === 0 ? <p className="muted">{text.choose}</p> : <ul>{selected.map(slug => {
          const manager = data?.managers.find(item => item.profile.slug === slug)
          const directoryItem = directory.find(item => item.profile.slug === slug)
          const label = manager?.profile.name ?? directoryItem?.profile.name ?? slug
          return <li key={slug}><span>{label}</span><button type="button" className="secondary" aria-label={`${text.remove} ${label}`} onClick={() => update(selected.filter(value => value !== slug))}>{text.remove}</button></li>
        })}</ul>}
        {selected.length === 5 && <p className="muted">{text.max}</p>}
      </div>
    </section>

    {selected.length < 2 ? <p className="guru-comparison-empty">{text.notEnough}</p> : <>
      {pending && <p role="status">{text.loading}</p>}
      {failure && <><FailureNotice failure={failure} id="guru-comparison-error" /><button className="secondary" type="button" onClick={() => setAttempt(value => value + 1)}>{text.retry}</button></>}
      {data && <>
        <div className="guru-comparison-toolbar">
          <label>{text.quarter}<select value={data.periodEnd ?? ''} onChange={event => update(selected, event.target.value)}>
            {periodOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select></label>
          <p>{text.source} · {data.periodEnd ?? '—'} · {data.readyGuruCount}/{data.selectedGuruCount} {text.readyDenominator}</p>
        </div>
        <section className="guru-comparison-metrics" aria-labelledby="guru-comparison-metrics-title">
          <h2 id="guru-comparison-metrics-title">{text.metric}</h2>
          {data.readyGuruCount === 0 && <p className="guru-comparison-empty">{text.dataUnavailable}</p>}
          <div className="guru-comparison-table-wrap"><table><thead><tr><th scope="col">{text.metric}</th>{data.managers.map(item => <th scope="col" key={item.profile.slug}><Link to={`/gurus/${item.profile.slug}`}>{item.profile.name}</Link><span className={`guru-status guru-status-${item.status.toLowerCase()}`}>{statusLabel(item.status, text)}</span></th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">{text.value}</th>{data.managers.map(item => <td key={item.profile.slug}>{shownValue(item.reportedValueUsd)}</td>)}</tr>
              <tr><th scope="row">{text.count}</th>{data.managers.map(item => <td key={item.profile.slug}>{item.holdingCount === null ? '—' : formatNeutralValue(locale, item.holdingCount, 0)}</td>)}</tr>
              <tr><th scope="row">{text.topTen}</th>{data.managers.map(item => <td key={item.profile.slug}>{shownValue(item.topTenConcentrationPercent, '%')}</td>)}</tr>
              <tr><th scope="row">{text.turnover}</th>{data.managers.map(item => <td key={item.profile.slug}>{shownValue(item.turnoverPercent, '%')}</td>)}</tr>
              <tr><th scope="row">{text.actions}</th>{data.managers.map(item => <td key={item.profile.slug}>{item.status === 'READY' ? `${item.actionCounts.new} · ${item.actionCounts.add} · ${item.actionCounts.reduce} · ${item.actionCounts.exit}` : '—'}</td>)}</tr>
              <tr><th scope="row">{text.sectorAllocation}</th>{data.managers.map(item => <td key={item.profile.slug}><ul>{item.sectorAllocation.slice(0, 5).map(sector => <li key={sector.name}>{sector.name} · {shownValue(sector.weightPercent, '%')}</li>)}</ul></td>)}</tr>
            </tbody>
          </table></div>
        </section>
        <section className="guru-comparison-positions" aria-labelledby="guru-common-title">
          <div><h2 id="guru-common-title">{text.common}</h2><p>{data.commonHoldings.length} · {text.heldBy} N/{data.readyGuruCount} {text.readyDenominator} · {data.selectedGuruCount} {text.selectedCount}</p></div>
          {data.commonHoldings.length === 0 ? <p className="muted">{text.emptyPositions}</p> : <div className="guru-comparison-position-list">{data.commonHoldings.map(position => <article key={position.positionKey}>
            <h3>{position.ticker ? <Link to={`/stocks/${encodeURIComponent(position.ticker)}/gurus`}>{position.ticker} · {position.company}</Link> : position.company}</h3><p>{text.heldBy} {position.heldByCount}/{position.readyGuruCount} · {position.selectedGuruCount} {text.selectedCount}</p>
            <ul>{position.members.map(member => <li key={member.guruSlug}><Link to={`/gurus/${member.guruSlug}`}>{member.guruName}</Link><span>{actionLabel(member.action, locale)} · {shownValue(member.weightPercent, '%')}</span></li>)}</ul>
          </article>)}</div>}
        </section>
        <section className="guru-comparison-positions" aria-labelledby="guru-moves-title">
          <h2 id="guru-moves-title">{text.quarterMoves}</h2>
          {data.quarterMoves.length === 0 ? <p className="muted">{text.emptyMoves}</p> : <div className="guru-comparison-position-list guru-comparison-move-list">
            {data.quarterMoves.map(move => <article key={move.positionKey}>
              <h3>{move.ticker ? <Link to={`/stocks/${encodeURIComponent(move.ticker)}/gurus`}>{move.ticker} · {move.company}</Link> : move.company}</h3>
              <ul>{move.members.map(member => <li key={member.guruSlug}><Link to={`/gurus/${member.guruSlug}`}>{member.guruName}</Link><span>
                {actionLabel(member.action, locale)} · {text.shares} {shownValue(member.previousQuantity)} → {shownValue(member.currentQuantity)} · {text.weight} {shownValue(member.previousWeightPercent, '%')} → {shownValue(member.weightPercent, '%')}
              </span></li>)}</ul>
            </article>)}
          </div>}
        </section>
        <section className="guru-comparison-positions" aria-labelledby="guru-unique-title">
          <h2 id="guru-unique-title">{text.unique}</h2>
          {data.uniqueHoldings.length === 0 ? <p className="muted">{text.emptyPositions}</p> : <div className="guru-comparison-table-wrap"><table><thead><tr><th scope="col">{text.position}</th><th scope="col">{text.manager}</th><th scope="col">{text.weight}</th></tr></thead><tbody>{data.uniqueHoldings.map(position => <tr key={position.positionKey}><th scope="row">{position.ticker ? <Link to={`/stocks/${encodeURIComponent(position.ticker)}/gurus`}>{position.ticker} · {position.company}</Link> : position.company}</th><td><Link to={`/gurus/${position.members[0]!.guruSlug}`}>{position.members[0]!.guruName}</Link></td><td>{shownValue(position.members[0]!.weightPercent, '%')}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="guru-comparison-positions" aria-labelledby="guru-opposing-title">
          <h2 id="guru-opposing-title">{text.opposing}</h2>
          {data.opposingActions.length === 0 ? <p className="muted">{text.emptyActions}</p> : <div className="guru-comparison-position-list">{data.opposingActions.map(position => <article key={position.positionKey}>
            <h3>{position.ticker ? <Link to={`/stocks/${encodeURIComponent(position.ticker)}/gurus`}>{position.ticker} · {position.company}</Link> : position.company}</h3>
            <ul>{position.members.map(member => <li key={member.guruSlug}><Link to={`/gurus/${member.guruSlug}`}>{member.guruName}</Link><span>{actionLabel(member.action, locale)}</span></li>)}</ul>
          </article>)}</div>}
        </section>
        {data.managers.map(item => <p className="guru-comparison-source" key={item.profile.slug}>{item.profile.name} · {item.source.form ?? text.source} · {item.source.accession ?? '—'} · {text.filed}: {item.source.filedAt ?? '—'}{item.source.sourceUrl && <> · <a href={item.source.sourceUrl} target="_blank" rel="noreferrer">{common.readFiling}</a></>}</p>)}
      </>}
    </>}
  </main>
}
