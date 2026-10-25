import type { PortfolioSource } from './portfolio-source'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  portfolioAttentionResponseSchema,
  type PortfolioAttentionItem,
  type PortfolioAttentionResponse,
} from '@diary/contracts/portfolio-attention'
import { api, useUi } from './ui'
import { apiFailure, FailureNotice, type Failure } from './api-error'
import { formatInstantUtc, formatPercent } from './market-display'
import {
  attentionBandLabel,
  bandFromContractPriority,
  boundAttentionRuns,
  groupAttentionRuns,
} from './attention-display'
import { CaveatMark, CaveatNote, CaveatNotes, figureCaveat } from './figure-caveat'
import './company-context.css'
import './portfolio-exposure.css'

/** How many rows the region shows before it names the remainder. */
const SHOWN_RUNS = 5

const copy = {
  en: {
    title: 'Needs your attention',
    empty: 'No items need attention under these rules.',
    hint: 'Ordered by priority.',
    partial:
      'Some positions have no quote. Concentration covers priced positions only; review reminders still include all active holdings.',
    invalidated_thesis_while_held: 'Held thesis invalidated',
    overdue_thesis_review: 'Thesis review overdue',
    overdue_diary_review: 'Diary review overdue',
    position_concentration: 'Position concentration',
    missing_thesis: 'Add an active thesis',
    due: 'Due',
    asof: 'Checked at',
    more: (n: number) => `and ${n} more`,
    count: (n: number) => `${n} companies`,
  },
  'zh-TW': {
    title: '需要留意',
    empty: '目前沒有符合這些規則的待處理項目。',
    hint: '按優先次序顯示。',
    partial: '部分持倉缺報價。集中度只涵蓋已有報價的持倉，複盤提醒仍涵蓋全部持倉。',
    invalidated_thesis_while_held: '仍持有的論點已失效',
    overdue_thesis_review: '論點複盤逾期',
    overdue_diary_review: '日記複盤逾期',
    position_concentration: '持倉集中',
    missing_thesis: '補上啟用論點',
    due: '到期',
    asof: '檢查時間',
    more: (n: number) => `還有 ${n} 項`,
    count: (n: number) => `${n} 間公司`,
  },
  'zh-CN': {
    title: '需要留意',
    empty: '目前没有符合这些规则的待处理项目。',
    hint: '按优先顺序显示。',
    partial: '部分持仓缺报价。集中度只涵盖已有报价的持仓，复盘提醒仍涵盖全部持仓。',
    invalidated_thesis_while_held: '仍持有的论点已失效',
    overdue_thesis_review: '论点复盘逾期',
    overdue_diary_review: '日记复盘逾期',
    position_concentration: '持仓集中',
    missing_thesis: '补上启用论点',
    due: '到期',
    asof: '检查时间',
    more: (n: number) => `还有 ${n} 项`,
    count: (n: number) => `${n} 间公司`,
  },
}

function targetPath(item: PortfolioAttentionItem) {
  if (item.targetKind === 'diary') return `/diaries/${item.targetId}/review`
  if (item.reason === 'position_concentration') return `/stocks/${encodeURIComponent(item.targetId)}`
  return `/stocks/${encodeURIComponent(item.targetId)}/thesis`
}

function subject(item: PortfolioAttentionItem) {
  return item.symbol ?? item.evidence.title ?? item.targetId
}

export function PortfolioAttention({ source }: { source?: PortfolioSource<PortfolioAttentionResponse> } = {}) {
  const { locale, t } = useUi(),
    c = copy[locale]
  const [localData, setData] = useState<PortfolioAttentionResponse | null>(null),
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
      .GET('/api/portfolio/attention', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        const parsed = portfolioAttentionResponseSchema.safeParse(result.data)
        if (result.response.ok && parsed.success) setData(parsed.data)
        else setError(apiFailure(result.error, t('failed')))
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(apiFailure(null, t('connection')))
      })
    return () => controller.abort()
  }, [attempt])
  const instant = (value: string) => formatInstantUtc(locale, value)
  const bounded = boundAttentionRuns(
    groupAttentionRuns(data?.items ?? [], item => item.reason),
    SHOWN_RUNS,
  )

  return (
    <section className="portfolio-exposure attention-region" aria-label={c.title}>
      <h2>{c.title}</h2>
      <p className="muted">{c.hint}</p>
      {error ? (
        <>
          <FailureNotice failure={error} id="attention-error" />
          <button onClick={() => (source ? source.retry() : retry(value => value + 1))}>{t('retry')}</button>
        </>
      ) : !data ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          {!data.coverage.complete && <p role="status">{c.partial}</p>}
          {!data.items.length ? (
            <p>{c.empty}</p>
          ) : (
            <>
              <ul className="attention-list">
                {bounded.shown.map(run => {
                  const [first] = run as [PortfolioAttentionItem, ...PortfolioAttentionItem[]]
                  const band = bandFromContractPriority(first.priority)
                  // A run of one is the whole row's link, so the travel from the
                  // reason to its action is zero and the action names its object.
                  if (run.length === 1)
                    return (
                      <li key={first.id} data-testid="attention-item" data-attention-band={band}>
                        <Link className="attention-row" to={targetPath(first)}>
                          <span className="sr-only">{attentionBandLabel(band, locale)}</span>
                          <strong>{c[first.reason]}</strong>
                          <span>{subject(first)}</span>
                          {first.evidence.concentrationPct !== undefined &&
                            first.evidence.concentrationPct !== null && (
                              <span className="figure">
                                {formatPercent(locale, first.evidence.concentrationPct)}
                                <CaveatMark />
                              </span>
                            )}
                          {first.evidence.reviewDueAt && (
                            <time dateTime={first.evidence.reviewDueAt}>
                              {c.due}: {instant(first.evidence.reviewDueAt)}
                            </time>
                          )}
                        </Link>
                      </li>
                    )
                  // One fact with several subjects is one row. Each subject keeps its
                  // own link, because there is no filtered list to send the reader to
                  // and inventing one would be a route nobody asked for.
                  return (
                    <li
                      key={first.id}
                      data-testid="attention-item"
                      data-attention-band={band}
                      data-attention-group={run.length}
                    >
                      <div className="attention-row attention-row-group">
                        <span className="sr-only">{attentionBandLabel(band, locale)}</span>
                        <strong>{c[first.reason]}</strong>
                        <span className="muted">{c.count(run.length)}</span>
                        <span className="attention-subjects">
                          {run.map(item => (
                            <Link
                              key={item.id}
                              to={targetPath(item)}
                              aria-label={`${c[item.reason]} — ${subject(item)}`}
                            >
                              {subject(item)}
                            </Link>
                          ))}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {bounded.remaining > 0 && (
                <p className="attention-more" data-testid="attention-more">
                  {c.more(bounded.remaining)}
                </p>
              )}
            </>
          )}
          <CaveatNotes>
            <CaveatNote id="attention-coverage-note">{figureCaveat(locale)}</CaveatNote>
            <p className="figure-caveat-status">
              {c.asof}: <time dateTime={data.asOf}>{instant(data.asOf)}</time>
            </p>
          </CaveatNotes>
        </>
      )}
    </section>
  )
}
