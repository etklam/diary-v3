import type { PortfolioSource } from './portfolio-source'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { portfolioValuationResponseSchema, type PortfolioValuationResponse } from '@diary/contracts/portfolio'
import { api, useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { signInPath } from './session'
import { CaveatMark, CaveatNote, CaveatNotes, figureCaveat } from './figure-caveat'
import {
  formatAmount,
  formatInstantUtc,
  formatMarketValue,
  formatPercent,
  formatSignedPercent,
  marketClass,
} from './market-display'

const copy = {
  en: {
    largest: 'Largest position',
    top3: 'Top three positions',
    concentration: 'Concentration is elevated (largest ≥ 25% or top three ≥ 60% of priced market value).',
    title: 'Portfolio valuation',
    complete: 'All positions priced',
    partial: 'Some positions have no quote',
    unavailable: 'Quotes unavailable',
    empty: 'No open positions',
    value: 'Priced market value',
    pnl: 'Unrealized gain / loss',
    pct: 'Unrealized return',
    cost: 'Priced cost basis',
    unpriced: 'Unpriced cost basis',
    coverage: 'Quote coverage',
    asof: 'Oldest quote',
    stale: 'Quotes older than 72 hours',
    unknown: 'Unavailable',
    price: 'Price',
    symbol: 'Symbol',
    position: 'Position value',
  },
  'zh-TW': {
    largest: '最大持倉',
    top3: '前三持倉',
    concentration: '集中度偏高（最大持倉達已報價市值 25%，或前三達 60%）。',
    title: '持倉估值',
    complete: '全部持倉已有報價',
    partial: '部分持倉缺少報價',
    unavailable: '報價暫不可用',
    empty: '沒有未平倉部位',
    value: '已報價持倉市值',
    pnl: '未實現損益',
    pct: '未實現報酬率',
    cost: '已估值成本',
    unpriced: '未估值成本',
    coverage: '報價覆蓋率',
    asof: '最早報價時間',
    stale: '超過 72 小時的報價',
    unknown: '暫不可用',
    price: '價格',
    symbol: '代號',
    position: '部位市值',
  },
  'zh-CN': {
    largest: '最大持仓',
    top3: '前三持仓',
    concentration: '集中度偏高（最大持仓达已报价市值 25%，或前三达 60%）。',
    title: '持仓估值',
    complete: '全部持仓已有报价',
    partial: '部分持仓缺少报价',
    unavailable: '报价暂不可用',
    empty: '没有未平仓部位',
    value: '已报价持仓市值',
    pnl: '未实现损益',
    pct: '未实现回报率',
    cost: '已估值成本',
    unpriced: '未估值成本',
    coverage: '报价覆盖率',
    asof: '最早报价时间',
    stale: '超过 72 小时的报价',
    unknown: '暂不可用',
    price: '价格',
    symbol: '代码',
    position: '部位市值',
  },
}
export function PortfolioValuation({
  source,
  showHoldings = true,
}: { source?: PortfolioSource<PortfolioValuationResponse>; showHoldings?: boolean } = {}) {
  const { locale, t } = useUi(),
    c = copy[locale]
  const translate = useRef(t)
  translate.current = t
  const [localData, setData] = useState<PortfolioValuationResponse | null>(null),
    [localError, setError] = useState<Failure | null>(null),
    [attempt, retry] = useState(0)
  const data = source ? source.data : localData,
    error = source ? source.error : localError
  useEffect(() => {
    if (source) return
    const controller = new AbortController()
    setData(null)
    setError(null)
    api
      .GET('/api/stocks/portfolio', { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return
        const parsed = portfolioValuationResponseSchema.safeParse(response.data)
        if (parsed.success) setData(parsed.data)
        else setError(apiFailure(response.error, translate.current('failed')))
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection')))
      })
    return () => controller.abort()
  }, [attempt])
  const noteBase = useId(),
    coverageNote = `${noteBase}-coverage`,
    quoteAgeNote = `${noteBase}-quote-age`
  const amount = (value: number | null) => formatAmount(locale, value)
  const signed = (value: number | null) => formatMarketValue(locale, value, 2)
  return (
    <section className="ledger-reading portfolio-valuation" aria-labelledby="portfolio-title">
      <h2 id="portfolio-title">{c.title}</h2>
      {error ? (
        <>
          <FailureNotice failure={error} id="portfolio-error" />
          <button className="secondary" onClick={() => (source ? source.retry() : retry(value => value + 1))}>
            {t('retry')}
          </button>
          {error.code?.startsWith('AUTH_') && <Link to={signInPath('/stocks')}>{t('login')}</Link>}
        </>
      ) : !data ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          <p role="status" data-testid="valuation-status">
            {c[data.valuation.valuationStatus]}
          </p>
          {/* Figures and labels only. The four sentences that used to sit between the
       label/value pairs broke a scan intended for figures four times; each one
       is now a mark on the figures it qualifies and a note below the rule that
       closes the region (ticket 121). `unpricedCostBasis` carries no mark — it
       is the complement of the caveat, not a figure limited by it. */}
          {data.valuation.valuationStatus !== 'empty' && (
            <>
              <dl>
                {(
                  [
                    ['value', 'currentMarketValue'],
                    ['pnl', 'unrealizedAmount'],
                    ['pct', 'unrealizedPct'],
                    ['cost', 'pricedCostBasis'],
                    ['unpriced', 'unpricedCostBasis'],
                    ['coverage', 'quoteCoveragePct'],
                  ] as const
                ).map(([label, key]) => {
                  const market = key === 'unrealizedAmount' || key === 'unrealizedPct'
                  const figure =
                    key === 'unrealizedPct'
                      ? formatSignedPercent(locale, data.valuation[key])
                      : key === 'quoteCoveragePct'
                        ? formatPercent(locale, data.valuation[key])
                        : market
                          ? signed(data.valuation[key])
                          : amount(data.valuation[key])
                  const priced = key !== 'unpricedCostBasis'
                  const aged = key === 'quoteCoveragePct'
                  return (
                    <div key={key}>
                      <dt>
                        {c[label]}
                        {priced && <CaveatMark />}
                        {aged && <CaveatMark mark="†" />}
                      </dt>
                      <dd
                        className={market ? marketClass(data.valuation[key]) : undefined}
                        data-testid={`valuation-${key}`}
                        aria-describedby={
                          [priced ? coverageNote : null, aged ? quoteAgeNote : null].filter(Boolean).join(' ') ||
                          undefined
                        }
                      >
                        {figure}
                      </dd>
                    </div>
                  )
                })}
              </dl>
              <dl>
                <div>
                  <dt>
                    {c.largest}
                    <CaveatMark />
                  </dt>
                  <dd data-testid="risk-largest" aria-describedby={coverageNote}>
                    {formatPercent(locale, data.valuation.largestPositionPct)}{' '}
                    {data.valuation.largestPositionSymbol && (
                      <Link to={`/stocks/${encodeURIComponent(data.valuation.largestPositionSymbol)}`}>
                        {data.valuation.largestPositionSymbol}
                      </Link>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>
                    {c.top3}
                    <CaveatMark />
                  </dt>
                  <dd data-testid="risk-top3" aria-describedby={coverageNote}>
                    {formatPercent(locale, data.valuation.top3ConcentrationPct)}
                  </dd>
                </div>
              </dl>
              <CaveatNotes>
                <CaveatNote id={coverageNote} testId="coverage-note">
                  {figureCaveat(locale)}
                </CaveatNote>
                {/* Quote age was two prose lines below the table restating what the table's
        own column already said per row. One note, one presentation (ticket 123). */}
                <CaveatNote id={quoteAgeNote} mark="†" testId="quote-age-note">
                  {c.asof}:{' '}
                  {data.valuation.valuationAsOf ? (
                    <time dateTime={data.valuation.valuationAsOf}>
                      {formatInstantUtc(locale, data.valuation.valuationAsOf)}
                    </time>
                  ) : (
                    c.unknown
                  )}{' '}
                  · {c.stale}: {data.valuation.staleQuoteCount}
                </CaveatNote>
                {data.valuation.concentrationWarning && (
                  <p className="figure-caveat-status" role="status">
                    {c.concentration}
                  </p>
                )}
              </CaveatNotes>
              {showHoldings && (
                <div className="holdings-table">
                  <table aria-label={c.title}>
                    <thead>
                      <tr>
                        <th>{c.symbol}</th>
                        <th>{c.price}</th>
                        <th>{c.position}</th>
                        <th>{c.pnl}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.holdings.map(holding => {
                        const unrealized =
                          holding.price === undefined ? null : holding.price * holding.quantity - holding.totalCost
                        return (
                          <tr key={holding.symbol}>
                            <th scope="row">
                              <Link to={`/stocks/${encodeURIComponent(holding.symbol)}`}>{holding.symbol}</Link>
                            </th>
                            <td>{amount(holding.price ?? null)}</td>
                            <td>{amount(holding.price === undefined ? null : holding.price * holding.quantity)}</td>
                            <td className={marketClass(unrealized)}>{signed(unrealized)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
