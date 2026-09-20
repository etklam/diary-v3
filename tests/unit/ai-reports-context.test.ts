import { describe, expect, it } from 'vitest'
import {
  buildReportContext,
  ReportContextNoDataError,
  ReportContextTooLargeError,
  type ReportContextRows,
  type ReportDiaryRow,
  type ReportDisciplineRow,
  type ReportTransactionRow,
} from '@diary/domain/ai-reports/context'
import { canonicalizeReportPeriod } from '@diary/domain/ai-reports/period'

const diary = (id: string, overrides: Partial<ReportDiaryRow> = {}): ReportDiaryRow => ({
  id,
  date: '2026-03-05',
  title: 'Synthetic decision',
  content: 'Recorded synthetic context.',
  tags: ['synthetic'],
  thesis: 'Test thesis',
  risk: null,
  execution: 'Test execution',
  reviewStatus: 'reviewed',
  reviewedAt: null,
  reviewOutcome: null,
  reviewSummary: null,
  reviewLearning: null,
  reviewAdjustment: null,
  createdAt: '2026-03-05T12:00:00.000Z',
  updatedAt: '2026-03-05T12:00:00.000Z',
  ...overrides,
})

const transaction = (id: string, overrides: Partial<ReportTransactionRow> = {}): ReportTransactionRow => ({
  id,
  diaryId: '1',
  symbol: ' aapl ',
  type: 'BUY',
  quantity: '10',
  price: '100',
  tradeDate: '2026-03-01T10:00:00.000Z',
  notes: 'Synthetic transaction',
  strategy: null,
  emotion: null,
  ...overrides,
})

const discipline = (id: string, overrides: Partial<ReportDisciplineRow> = {}): ReportDisciplineRow => ({
  id,
  content: 'Follow the recorded plan.',
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const input = (overrides: Partial<Parameters<typeof buildReportContext>[0]> = {}) => ({
  userId: 11n,
  periodType: 'weekly' as const,
  periodStart: '2026-03-02',
  timezone: 'UTC',
  locale: 'en' as const,
  capturedAt: new Date('2026-03-16T00:00:00.000Z'),
  ...overrides,
})

const rows = (overrides: Partial<ReportContextRows> = {}): ReportContextRows => ({
  diaries: [diary('1')],
  transactions: [transaction('1')],
  disciplines: [],
  ...overrides,
})

describe('AI report context period and ledger projection', () => {
  it('keeps local period boundaries on the target civil date when midnight is skipped', () => {
    const cairo = canonicalizeReportPeriod({
      periodType: 'monthly', periodStart: '2014-08-01', timezone: 'Africa/Cairo',
      capturedAt: new Date('2014-09-15T00:00:00.000Z'),
    })
    expect(cairo.startInstant).toBe('2014-07-31T22:00:00.000Z')
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', dateStyle: 'short' }).format(new Date(cairo.startInstant))).toBe('8/1/14')
  })

  it('uses local calendar bounds across spring DST without changing the seven-day period', async () => {
    const result = await buildReportContext(input({
      periodStart: '2026-03-02', timezone: 'America/New_York',
      capturedAt: new Date('2026-03-09T16:00:00.000Z'),
    }), rows({ diaries: [diary('1', { date: '2026-03-02' })] }))

    expect(result.context.period).toEqual({
      periodType: 'weekly', periodStart: '2026-03-02', periodEndExclusive: '2026-03-09', isPartialPeriod: false,
    })
    expect(result.context.window).toMatchObject({
      startInstant: '2026-03-02T05:00:00.000Z',
      periodEndInstant: '2026-03-09T04:00:00.000Z',
      effectiveEndInstant: '2026-03-09T04:00:00.000Z',
      effectiveEndDateExclusive: '2026-03-09',
    })
    expect(result.context.metrics.find(metric => metric.id === 'period.calendar_days')?.value).toBe(7)
  })

  it('uses local calendar bounds across fall DST and excludes the exact end instant', async () => {
    const result = await buildReportContext(input({
      periodStart: '2026-10-26', timezone: 'America/New_York',
      capturedAt: new Date('2026-11-09T16:00:00.000Z'),
    }), rows({
      diaries: [diary('1', { date: '2026-10-26' })],
      transactions: [
        transaction('1', { tradeDate: '2026-11-02T04:59:59.000Z' }),
        transaction('2', { tradeDate: '2026-11-02T05:00:00.000Z' }),
      ],
    }))

    expect(result.context.window.periodEndInstant).toBe('2026-11-02T05:00:00.000Z')
    expect(result.context.transactions.map(item => item.sourceId)).toEqual(['T1'])
    expect(result.context.metrics.find(metric => metric.id === 'transaction.count')?.value).toBe(1)
  })

  it('canonicalizes month end from calendar dates, including leap day', async () => {
    const result = await buildReportContext(input({
      periodType: 'monthly', periodStart: '2024-02-01', capturedAt: new Date('2024-03-15T00:00:00.000Z'),
    }), rows({
      diaries: [diary('1', { date: '2024-02-29' }), diary('2', { date: '2024-03-01' })],
      transactions: [
        transaction('1', { tradeDate: '2024-02-29T23:59:59.000Z' }),
        transaction('2', { tradeDate: '2024-03-01T00:00:00.000Z' }),
      ],
    }))

    expect(result.context.period).toMatchObject({ periodType: 'monthly', periodStart: '2024-02-01', periodEndExclusive: '2024-03-01' })
    expect(result.context.diaries).toHaveLength(1)
    expect(result.context.transactions).toHaveLength(1)
    expect(result.context.metrics.find(metric => metric.id === 'period.calendar_days')?.value).toBe(29)
  })

  it('replays pre-period buys for period sells, keeps future rows out, and records dependencies', async () => {
    const result = await buildReportContext(input(), rows({
      diaries: [diary('2', { date: '2026-03-05' })],
      transactions: [
        transaction('1', { diaryId: '1', tradeDate: '2026-03-01T10:00:00.000Z', quantity: '10', price: '100' }),
        transaction('2', { diaryId: '2', type: 'SELL', tradeDate: '2026-03-05T10:00:00.000Z', quantity: '4', price: '120' }),
        transaction('3', { diaryId: '2', tradeDate: '2026-03-10T10:00:00.000Z', quantity: '100', price: '1' }),
      ],
    }))

    expect(result.context.holdings).toEqual([expect.objectContaining({ symbol: 'AAPL', quantity: '6', avgCost: '100', totalCost: '600' })])
    expect(result.context.closedTrades).toEqual([expect.objectContaining({ sourceId: 'T1', realizedPnL: '80', avgCostBasis: '100' })])
    expect(result.context.metrics.find(metric => metric.id === 'transaction.count')?.value).toBe(1)
    expect(result.context.metrics.find(metric => metric.id === 'ledger.closed_trade_count')?.value).toBe(1)
    expect(result.context.transactions[0]?.diaryId).toBe('D1')
    expect(result.context.transactions[0]?.diaryId).not.toBe('2')
    expect(result.sourceManifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ alias: 'TD1', sourceType: 'transaction', sourceId: '1', dependency: true, role: 'ledger_dependency' }),
      expect.objectContaining({ alias: 'T1', sourceType: 'transaction', sourceId: '2', dependency: false, role: 'direct' }),
    ]))
    expect(result.context.sources.map(source => source.alias)).toEqual(['D1', 'P1', 'P2', 'T1'])
    expect(result.context.sources.every(source => /^[DTRP]\d+$/.test(source.alias))).toBe(true)
    expect(JSON.stringify(result.context)).not.toContain('"sourceId":"1"')
    expect(JSON.stringify(result.context)).not.toContain('"sourceId":"2"')
  })

  it('keeps completed-period input hashes stable when capture metadata changes', async () => {
    const first = await buildReportContext(input({ capturedAt: new Date('2026-03-16T00:00:00.000Z') }), rows())
    const second = await buildReportContext(input({ capturedAt: new Date('2026-03-20T00:00:00.000Z') }), rows())
    const differentOwner = await buildReportContext(input({ userId: 12n }), rows())

    expect(first.inputHash).toBe(second.inputHash)
    expect(first.context.snapshotCapturedAt).not.toBe(second.context.snapshotCapturedAt)
    expect(first.inputHash).not.toBe(differentOwner.inputHash)
  })

  it('keeps a partial-period hash stable while the same sources remain in scope', async () => {
    const partialRows = rows({
      diaries: [diary('1', { date: '2026-03-13' })],
      transactions: [
        transaction('1', { tradeDate: '2026-03-13T13:00:00.000Z' }),
        transaction('2', { tradeDate: '2026-03-08T13:00:00.000Z' }),
      ],
    })
    const first = await buildReportContext(input({
      periodStart: '2026-03-09', capturedAt: new Date('2026-03-13T12:00:00.000Z'),
    }), partialRows)
    const second = await buildReportContext(input({
      periodStart: '2026-03-09', capturedAt: new Date('2026-03-13T12:01:00.000Z'),
    }), partialRows)

    expect(first.context.period.isPartialPeriod).toBe(true)
    expect(first.context.holdings).toEqual([expect.objectContaining({ sourceId: 'P1', quantity: '10' })])
    expect(first.sourceManifest.find(source => source.sourceType === 'holding')?.contentHash)
      .toBe(second.sourceManifest.find(source => source.sourceType === 'holding')?.contentHash)
    expect(first.inputHash).toBe(second.inputHash)
  })
})

describe('AI report context coverage and limits', () => {
  it('caps an in-progress period at capture time and distinguishes zero from unavailable', async () => {
    const result = await buildReportContext(input({
      periodStart: '2026-03-09', capturedAt: new Date('2026-03-13T12:00:00.000Z'),
    }), rows({
      diaries: [diary('1', { date: '2026-03-13' }), diary('2', { date: '2026-03-14' })],
      transactions: [transaction('1', { tradeDate: '2026-03-13T12:00:00.000Z' })],
    }))

    expect(result.context.period.isPartialPeriod).toBe(true)
    expect(result.context.window.effectiveEndInstant).toBe('2026-03-13T12:00:00.000Z')
    expect(result.context.diaries).toHaveLength(1)
    expect(result.context.transactions).toHaveLength(0)
    expect(result.context.metrics.find(metric => metric.id === 'transaction.count')).toMatchObject({ value: 0, availability: 'zero' })
    expect(result.context.metrics.find(metric => metric.id === 'ledger.realized_pnl')).toMatchObject({ value: null, availability: 'unavailable' })
  })

  it('rejects discipline-only snapshots as no data', async () => {
    await expect(buildReportContext(input(), rows({ diaries: [], transactions: [], disciplines: [discipline('1')] })))
      .rejects.toBeInstanceOf(ReportContextNoDataError)
    await expect(buildReportContext(input(), rows({ diaries: [], transactions: [], disciplines: [discipline('1')] })))
      .rejects.toMatchObject({ code: 'AI_REPORT_NO_DATA' })
  })

  it('does not include rules created after capture and reports snapshot-history limits', async () => {
    const result = await buildReportContext(input({ capturedAt: new Date('2026-03-06T00:00:00.000Z') }), rows({
      disciplines: [
        discipline('1', { createdAt: '2026-03-05T23:59:59.000Z' }),
        discipline('2', { createdAt: '2026-03-06T00:00:01.000Z' }),
      ],
    }))

    expect(result.context.disciplines).toHaveLength(1)
    expect(result.context.coverage.notes).toContain('Discipline content is a generation-time snapshot; historical effective dates are unavailable.')
    expect(result.context.disciplines[0]?.createdAfterPeriod).toBe(false)
  })

  it('fails closed when the context exceeds a configured limit instead of truncating', async () => {
    await expect(buildReportContext(input(), rows(), { maxTextLength: 3 }))
      .rejects.toMatchObject({ code: 'AI_REPORT_CONTEXT_TOO_LARGE', limit: 'maxTextLength' })
    await expect(buildReportContext(input(), rows(), { maxRows: 1 }))
      .rejects.toBeInstanceOf(ReportContextTooLargeError)
  })
})
