import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { stockGuruResearchQuerySchema, stockGuruResearchResponseSchema } from '@diary/contracts'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { formatAmount, formatPercent } from './market-display'
import { GuruStockWatchButton } from './guru-stock-watch'
import { api, useUi } from './ui'
import './stock-guru-panel.css'

type StockData = ReturnType<typeof stockGuruResearchResponseSchema.parse>['data']

const copy = {
  'zh-TW': {
    title: '大師持倉', fullTitle: '個股大師持倉', intro: '追蹤申報中持有這檔股票的大師、季度動作與歷史持有廣度。', holders: '目前持有大師', averageWeight: '平均組合權重', breadth: '持有廣度', net: '淨買方', tracked: '追蹤大師', quarterCoverage: '季度涵蓋率', mappingCoverage: '映射涵蓋率', buyers: '新建倉／增持', sellers: '減持／退出', new: '新建倉', add: '增持', strongAdd: '大幅增持', unchanged: '不變', reduce: '減持', strongReduce: '大幅減持', exit: '退出', history: '機構持有歷史', quarter: '申報季度', holderHistory: '持有大師', weightHistory: '平均權重', netHistory: '淨買方', current: '目前持有', moves: '本季度動作', action: '動作', manager: '大師／基金', weight: '組合權重', shares: '股數', loading: '正在載入大師持倉…', failed: '無法載入個股大師資料。', retry: '重試', empty: '此季度沒有已整理的大師持倉資料。', noHolders: '此季度沒有可用的大師持倉。', pending: '本季度正在重新整理。暫不顯示上一次的數值。', unavailable: '此季度沒有已整理的大師共識資料。', pendingLabel: '整理中', unavailableLabel: '無資料', ambiguous: '這個代號對應多個證券，暫時無法安全連結持倉。', unresolved: '尚未找到這個代號的已確認證券映射。', source: '來源：SEC Form 13F', warning: '13F 是延遲披露的季度末持倉，未必代表管理人目前或完整的投資組合。', filed: '申報日期', viewFiling: '查看 SEC 申報', detail: '查看完整大師持倉與歷史', back: '返回個股行情',
    prepared: '整理時間',
  },
  'zh-CN': {
    title: '大师持仓', fullTitle: '个股大师持仓', intro: '追踪申报中持有这只股票的大师、季度动作与历史持有广度。', holders: '目前持有大师', averageWeight: '平均组合权重', breadth: '持有广度', net: '净买方', tracked: '追踪大师', quarterCoverage: '季度覆盖率', mappingCoverage: '映射覆盖率', buyers: '新建仓／增持', sellers: '减持／退出', new: '新建仓', add: '增持', strongAdd: '大幅增持', unchanged: '不变', reduce: '减持', strongReduce: '大幅减持', exit: '退出', history: '机构持有历史', quarter: '申报季度', holderHistory: '持有大师', weightHistory: '平均权重', netHistory: '净买方', current: '目前持有', moves: '本季度动作', action: '动作', manager: '大师／基金', weight: '组合权重', shares: '股数', loading: '正在加载大师持仓…', failed: '无法加载个股大师资料。', retry: '重试', empty: '此季度没有已整理的大师持仓资料。', noHolders: '此季度没有可用的大师持仓。', pending: '本季度正在重新整理。暂不显示上一次的数值。', unavailable: '此季度没有已整理的大师共识资料。', pendingLabel: '整理中', unavailableLabel: '无资料', ambiguous: '此代码对应多个证券，暂时无法安全关联持仓。', unresolved: '尚未找到此代码的已确认证券映射。', source: '来源：SEC Form 13F', warning: '13F 是延迟披露的季度末持仓，未必代表管理人目前或完整的投资组合。', filed: '申报日期', viewFiling: '查看 SEC 申报', detail: '查看完整大师持仓与历史', back: '返回个股行情',
    prepared: '整理时间',
  },
  en: {
    title: 'Guru holdings', fullTitle: 'Guru ownership', intro: 'See tracked investors reporting this stock, their quarter actions, and historical ownership breadth.', holders: 'Current Guru holders', averageWeight: 'Average portfolio weight', breadth: 'Weight breadth', net: 'Net buyers', tracked: 'Tracked Gurus', quarterCoverage: 'Quarter coverage', mappingCoverage: 'Mapping coverage', buyers: 'New / added', sellers: 'Reduced / exited', new: 'NEW', add: 'ADD', strongAdd: 'STRONG ADD', unchanged: 'UNCHANGED', reduce: 'REDUCE', strongReduce: 'STRONG REDUCE', exit: 'EXIT', history: 'Institutional ownership history', quarter: 'Reported quarter', holderHistory: 'Guru holders', weightHistory: 'Average weight', netHistory: 'Net buyers', current: 'Current holders', moves: 'Quarter actions', action: 'Action', manager: 'Investor / fund', weight: 'Portfolio weight', shares: 'Shares', loading: 'Loading Guru holdings…', failed: 'Unable to load stock Guru research.', retry: 'Try again', empty: 'No prepared Guru data is available for this quarter.', noHolders: 'No ready Guru portfolios hold this stock in this quarter.', pending: 'This quarter is being rebuilt. Previous metrics are hidden until the rebuild completes.', unavailable: 'No prepared Guru consensus is available for this quarter.', pendingLabel: 'Pending', unavailableLabel: 'Unavailable', ambiguous: 'This symbol matches multiple securities. Holdings cannot be linked safely yet.', unresolved: 'No verified security mapping is available for this symbol yet.', source: 'Source: SEC Form 13F', warning: '13F holdings are delayed quarter-end disclosures and may not represent the manager’s current or complete portfolio.', filed: 'Filed', viewFiling: 'View SEC filing', detail: 'Open full Guru holdings and history', back: 'Back to market research',
    prepared: 'Prepared',
  },
} as const

function actionName(action: string | null, text: typeof copy[keyof typeof copy]) {
  if (!action) return '—'
  const key: Record<string, keyof typeof copy.en> = {
    NEW: 'new', ADD: 'add', STRONG_ADD: 'strongAdd', UNCHANGED: 'unchanged', REDUCE: 'reduce', STRONG_REDUCE: 'strongReduce', EXIT: 'exit',
  }
  return key[action] ? text[key[action]] : action
}

export function StockGuruPanel({ symbol, compact = true }: { symbol: string; compact?: boolean }) {
  const { locale } = useUi()
  const text = copy[locale]
  const [searchParams, setSearchParams] = useSearchParams()
  const period = compact ? '' : searchParams.get('period') ?? ''
  const [data, setData] = useState<StockData | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setPending(true); setFailure(null); setData(null)
    const query = stockGuruResearchQuerySchema.parse(period ? { period } : {})
    void api.GET('/api/stocks/{symbol}/gurus', { params: { path: { symbol }, query }, signal: controller.signal }).then(result => {
      const parsed = stockGuruResearchResponseSchema.safeParse(result.data)
      if (controller.signal.aborted) return
      if (!result.response.ok || !parsed.success) setFailure(apiFailure(result.error, text.failed))
      else setData(parsed.data.data)
    }).catch(error => { if (!controller.signal.aborted) setFailure(apiFailure(error, text.failed)) })
      .finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [attempt, period, symbol, text.failed])

  // A percentage is two decimals app-wide; anything else here is a ratio or a count.
  function value(value: string | null, suffix = '') {
    if (value === null) return '—'
    return suffix === '%' ? formatPercent(locale, value) : `${formatAmount(locale, value)}${suffix}`
  }

  function choosePeriod(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('period', value); else next.delete('period')
    setSearchParams(next)
  }

  const summary = data?.summary
  const currentHolders = data?.currentHolders ?? []
  const moves = data?.latestMoves ?? []
  const actionCounts = summary ? (summary.newBuyerCount ?? 0) + (summary.addCount ?? 0) : null
  const maxHolders = Math.max(1, ...((data?.history ?? []).map(point => point.holderCount ?? 0)))

  const content = <>
    {pending && <p role="status">{text.loading}</p>}
    {failure && <><FailureNotice failure={failure} id={`stock-guru-error-${symbol}`} /><button className="secondary" type="button" onClick={() => setAttempt(value => value + 1)}>{text.retry}</button></>}
    {summary && <>
      {summary.dataStatus === 'PENDING' && <p className="stock-guru-state" role="status">{text.pending}</p>}
      {summary.mappingStatus === 'MATCHED' && summary.dataStatus === 'UNAVAILABLE' && <p className="stock-guru-state" role="status">{text.unavailable}</p>}
      {summary.mappingStatus === 'AMBIGUOUS' && <p className="stock-guru-state" role="status">{text.ambiguous}</p>}
      {summary.mappingStatus === 'UNRESOLVED' && <p className="stock-guru-state" role="status">{text.unresolved}</p>}
      <p className="stock-guru-source">{text.source} · {text.quarter}: {summary.periodEnd ?? '—'}{summary.calculatedAt ? ` · ${text.prepared}: ${summary.calculatedAt}` : ''}</p>
      {summary.dataStatus === 'READY' && <dl className="stock-guru-metrics">
        <div><dt>{text.holders}</dt><dd>{summary.currentHolderCount ?? '—'}</dd></div>
        <div><dt>{text.averageWeight}</dt><dd>{value(summary.averagePortfolioWeightPercent, '%')}</dd></div>
        <div><dt>{text.breadth}</dt><dd>{value(summary.weightBreadthPercent, '%')}</dd></div>
        <div><dt>{text.net}</dt><dd>{summary.netBuyerCount === null ? '—' : summary.netBuyerCount > 0 ? `+${summary.netBuyerCount}` : summary.netBuyerCount}</dd></div>
        <div><dt>{text.tracked}</dt><dd>{summary.readyGuruCount === null || summary.activeGuruCount === null ? '—' : `${summary.readyGuruCount} / ${summary.activeGuruCount}`}</dd></div>
        <div><dt>{text.quarterCoverage}</dt><dd>{value(summary.quarterCoveragePercent, '%')}</dd></div>
        <div><dt>{text.mappingCoverage}</dt><dd>{value(summary.mappingCoveragePercent, '%')}</dd></div>
        {!compact && <>
          <div><dt>{text.buyers}</dt><dd>{actionCounts ?? '—'}</dd></div>
          <div><dt>{text.sellers}</dt><dd>{(summary.reduceCount ?? 0) + (summary.exitCount ?? 0)}</dd></div>
        </>}
      </dl>}
      {!compact && <>
        <section className="stock-guru-section" aria-labelledby="stock-guru-history-title">
          <div className="stock-guru-heading"><h2 id="stock-guru-history-title">{text.history}</h2></div>
          {(data.history ?? []).length === 0 ? <p className="muted">{text.empty}</p> : <>
            <div className="stock-guru-chart" role="group" aria-label={`${text.holderHistory}, ${text.weightHistory}, ${text.netHistory}`}>
              <div className="stock-guru-chart-head"><span>{text.quarter}</span><span aria-hidden="true" /><span>{text.holderHistory}</span><span>{text.weightHistory}</span><span>{text.netHistory}</span></div>
              {data.history.map(point => <div className="stock-guru-chart-row" key={point.periodEnd}>
                <time dateTime={point.periodEnd}>{point.periodEnd}{point.status === 'PENDING' && <small>{text.pendingLabel}</small>}{point.status === 'UNAVAILABLE' && <small>{text.unavailableLabel}</small>}</time>
                <div className="stock-guru-bar-track"><span style={{ width: `${point.holderCount === null ? 0 : Math.max(4, point.holderCount / maxHolders * 100)}%` }} /></div>
                <strong>{point.holderCount ?? '—'}</strong>
                <span>{value(point.averagePortfolioWeightPercent, '%')}</span>
                <span>{point.netBuyerCount === null ? '—' : point.netBuyerCount > 0 ? `+${point.netBuyerCount}` : point.netBuyerCount}</span>
              </div>)}
            </div>
          </>}
        </section>
        <section className="stock-guru-section" aria-labelledby="stock-guru-holders-title">
          <h2 id="stock-guru-holders-title">{text.current}</h2>
          {currentHolders.length === 0 ? <p className="muted">{text.noHolders}</p> : <div className="stock-guru-table-wrap"><table>
            <thead><tr><th scope="col">{text.manager}</th><th scope="col">{text.action}</th><th scope="col">{text.shares}</th><th scope="col">{text.weight}</th><th scope="col">{text.filed}</th></tr></thead>
            <tbody>{currentHolders.map(holder => <tr key={holder.profile.slug}><th scope="row"><Link to={`/gurus/${holder.profile.slug}`}>{holder.profile.name}</Link><small>{holder.profile.managerName}</small></th><td>{actionName(holder.action, text)}</td><td>{value(holder.quantity)}</td><td>{value(holder.weightPercent, '%')}</td><td>{holder.source.sourceUrl ? <a href={holder.source.sourceUrl} target="_blank" rel="noreferrer">{holder.source.filedAt ? holder.source.filedAt.slice(0, 10) : text.viewFiling}</a> : holder.source.filedAt?.slice(0, 10) ?? '—'}</td></tr>)}</tbody>
          </table></div>}
        </section>
        <section className="stock-guru-section" aria-labelledby="stock-guru-moves-title">
          <h2 id="stock-guru-moves-title">{text.moves}</h2>
          {moves.length === 0 ? <p className="muted">{text.empty}</p> : <ul className="stock-guru-moves">{moves.map((holder, index) => <li key={`${holder.profile.slug}-${holder.action}-${index}`}>
            <Link to={`/gurus/${holder.profile.slug}`}>{holder.profile.name}</Link><span>{actionName(holder.action, text)}</span><strong>{value(holder.weightPercent, '%')}</strong>
          </li>)}</ul>}
        </section>
      </>}
      {compact && <Link className="stock-guru-detail-link" to={`/stocks/${encodeURIComponent(symbol)}/gurus`}>{text.detail}</Link>}
      {compact && <p className="stock-guru-disclosure">{text.warning}</p>}
    </>}
  </>

  if (compact) return <section className="stock-guru-panel" aria-labelledby={`stock-guru-title-${symbol}`}>
    <div className="stock-guru-heading"><h2 id={`stock-guru-title-${symbol}`}>{text.title}</h2></div>{content}
  </section>

  return <main className="stock-guru-page">
    <header><div><Link to={`/stocks/${encodeURIComponent(symbol)}`}>{text.back}</Link><h1>{symbol} · {text.fullTitle}</h1><p>{summary?.company ?? text.intro}</p></div></header>
    <p className="stock-guru-disclosure" role="note">{text.warning}</p>
    <div className="stock-guru-toolbar"><label>{text.quarter}<select value={summary?.periodEnd ?? ''} onChange={event => choosePeriod(event.target.value)}>{(data?.history ?? []).map(point => <option key={point.periodEnd} value={point.periodEnd}>{point.periodEnd}</option>)}</select></label>
      <GuruStockWatchButton symbol={symbol} />
    </div>
    {content}
  </main>
}

export default function StockGuruPage() {
  const { symbol = '' } = useParams()
  return <StockGuruPanel symbol={symbol.toUpperCase()} compact={false} />
}
