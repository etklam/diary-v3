import { describe, expect, it } from 'vitest'
import { calculateGuruPortfolioAnalytics, type GuruAnalyticsHolding, type GuruAnalyticsSnapshot, type GuruSecurityIdentityEvent } from '../../packages/domain/src/guru-portfolio-analytics.js'

function holding(input: Partial<GuruAnalyticsHolding> & Pick<GuruAnalyticsHolding, 'sourceRowKey' | 'securityId' | 'quantity'>): GuruAnalyticsHolding {
  return {
    sourceRowKey: input.sourceRowKey, securityId: input.securityId, quantity: input.quantity,
    ticker: input.ticker ?? null, company: input.company ?? `Company ${input.securityId ?? input.sourceRowKey}`,
    sector: input.sector ?? null, industry: input.industry ?? null,
    quantityType: input.quantityType ?? 'SH', putCall: input.putCall ?? null,
    reportedValue: input.reportedValue ?? '100', reportedValueUnit: input.reportedValueUnit ?? 'USD',
    mappingStatus: input.mappingStatus ?? (input.securityId ? 'MATCHED' : 'UNRESOLVED'),
  }
}

function snapshot(periodEnd: string, holdings: GuruAnalyticsHolding[], status: GuruAnalyticsSnapshot['status'] = 'READY'): GuruAnalyticsSnapshot {
  return { periodEnd, status, holdings }
}

function actionForQuantity(previousQuantity: string, currentQuantity: string) {
  return calculateGuruPortfolioAnalytics({
    previous: snapshot('2026-03-31', [holding({ sourceRowKey: 'prior', securityId: '1', quantity: previousQuantity })]),
    current: snapshot('2026-06-30', [holding({ sourceRowKey: 'current', securityId: '1', quantity: currentQuantity })]),
  }).changes[0]?.action
}

describe('deterministic Guru portfolio analytics', () => {
  it('aggregates mapped duplicate rows and normalizes historical 13F values into USD', () => {
    const result = calculateGuruPortfolioAnalytics({
      previous: snapshot('2026-03-31', [
        holding({ sourceRowKey: 'p1', securityId: '1', ticker: 'AAA', quantity: '60', reportedValue: '400', reportedValueUnit: 'THOUSANDS_USD', sector: 'Technology' }),
        holding({ sourceRowKey: 'p2', securityId: '1', ticker: 'AAA', quantity: '40', reportedValue: '100', reportedValueUnit: 'THOUSANDS_USD', sector: 'Technology' }),
        holding({ sourceRowKey: 'p3', securityId: '2', ticker: 'BBB', quantity: '50', reportedValue: '500000', sector: 'Technology' }),
      ]),
      current: snapshot('2026-06-30', [
        holding({ sourceRowKey: 'c1', securityId: '1', ticker: 'AAA', quantity: '60', reportedValue: '300000', sector: 'Technology', industry: 'Software' }),
        holding({ sourceRowKey: 'c2', securityId: '1', ticker: 'AAA', quantity: '60', reportedValue: '300000', sector: 'Technology', industry: 'Software' }),
        holding({ sourceRowKey: 'c3', securityId: '2', ticker: 'BBB', quantity: '50', reportedValue: '400000', sector: 'Technology', industry: 'Hardware' }),
        holding({ sourceRowKey: 'c4', securityId: '3', ticker: 'CCC', quantity: '10', reportedValue: '200000', sector: 'Healthcare', industry: 'Biotech' }),
      ]),
    })
    expect(result).toMatchObject({
      comparisonStatus: 'COMPARABLE',
      portfolio: {
        reportedValueUsd: '1200000', holdingCount: 3, sourceRowCount: 4, mappedRowCount: 4,
        mappingCoveragePercent: '100', topOneConcentrationPercent: '50', topFiveConcentrationPercent: '100',
        topTenConcentrationPercent: '100', hhi: '3888.8889',
      },
      actionCounts: { NEW: 1, ADD: 1, UNCHANGED: 1, EXIT: 0 },
      disclosedWeightTurnoverPercent: '16.66666667', turnoverBand: 'MODERATE',
    })
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticker: 'AAA', action: 'ADD', previousQuantity: '100', currentQuantity: '120', quantityChangePercent: '20', weightChangePercentagePoints: '0' }),
      expect.objectContaining({ ticker: 'BBB', action: 'UNCHANGED', reportedValueChangeUsd: '-100000', weightChangePercentagePoints: '-16.66666667' }),
      expect.objectContaining({ ticker: 'CCC', action: 'NEW', previousQuantity: null, currentQuantity: '10', quantityChangePercent: null }),
    ]))
    expect(result.portfolio.sectorAllocation).toEqual([
      { name: 'Technology', reportedValueUsd: '1000000', weightPercent: '83.33333333' },
      { name: 'Healthcare', reportedValueUsd: '200000', weightPercent: '16.66666667' },
    ])
    expect(result.portfolio.topHoldings).toMatchObject([
      { ticker: 'AAA', reportedValueUsd: '600000', weightPercent: '50', rank: 1 },
      { ticker: 'BBB', reportedValueUsd: '400000', weightPercent: '33.33333333', rank: 2 },
      { ticker: 'CCC', reportedValueUsd: '200000', weightPercent: '16.66666667', rank: 3 },
    ])
  })

  it.each([
    ['105', 'UNCHANGED'], ['106', 'ADD'], ['150', 'STRONG_ADD'],
    ['95', 'UNCHANGED'], ['94', 'REDUCE'], ['50', 'STRONG_REDUCE'], ['0', 'STRONG_REDUCE'],
  ] as const)('classifies exact share-change boundary at %s shares as %s', (current, action) => {
    expect(actionForQuantity('100', current)).toBe(action)
  })

  it('does not infer changes across a baseline, missing quarter, non-adjacent quarter, or unresolved identity', () => {
    const current = snapshot('2026-09-30', [holding({ sourceRowKey: 'now', securityId: null, quantity: '10', reportedValue: '100', mappingStatus: 'AMBIGUOUS' })])
    const baseline = calculateGuruPortfolioAnalytics({ current })
    const gap = calculateGuruPortfolioAnalytics({ previous: snapshot('2026-03-31', [holding({ sourceRowKey: 'before', securityId: '1', quantity: '100' })]), current })
    const missing = calculateGuruPortfolioAnalytics({ previous: snapshot('2026-06-30', [], 'PARTIAL'), current })
    expect(baseline).toMatchObject({ comparisonStatus: 'BASELINE', changes: [], turnoverUnavailableReason: 'BASELINE' })
    expect(gap).toMatchObject({ comparisonStatus: 'NON_ADJACENT_QUARTER', changes: [], turnoverUnavailableReason: 'NON_ADJACENT_QUARTER' })
    expect(missing).toMatchObject({ comparisonStatus: 'PREVIOUS_NOT_READY', changes: [], turnoverUnavailableReason: 'PREVIOUS_NOT_READY' })
    expect(current.holdings[0]?.securityId).toBeNull()
  })

  it('compares stable mapped identities with incomplete mapping but suppresses false entries and exits', () => {
    const previous = snapshot('2026-03-31', [
      holding({ sourceRowKey: 'old-common', securityId: '1', quantity: '100' }),
      holding({ sourceRowKey: 'old-ambiguous', securityId: null, quantity: '20', mappingStatus: 'AMBIGUOUS' }),
      holding({ sourceRowKey: 'old-exit', securityId: '2', quantity: '30' }),
    ])
    const current = snapshot('2026-06-30', [
      holding({ sourceRowKey: 'new-common', securityId: '1', quantity: '110' }),
      holding({ sourceRowKey: 'new-ambiguous', securityId: null, quantity: '20', mappingStatus: 'UNRESOLVED' }),
      holding({ sourceRowKey: 'new-position', securityId: '3', quantity: '40' }),
    ])
    const result = calculateGuruPortfolioAnalytics({ previous, current })
    expect(result.comparisonStatus).toBe('MAPPING_INCOMPLETE')
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({ securityId: '1', action: 'ADD', quantityChange: '10' })
    expect(result.turnoverBand).toBeNull()
    expect(result.turnoverUnavailableReason).toBe('MAPPING_INCOMPLETE')
  })

  it('keeps SH, PRN, Put, Call, and unresolved source rows as distinct positions', () => {
    const result = calculateGuruPortfolioAnalytics({ current: snapshot('2026-06-30', [
      holding({ sourceRowKey: 'sh', securityId: '1', quantity: '10', putCall: null }),
      holding({ sourceRowKey: 'prn', securityId: '1', quantity: '10', quantityType: 'PRN' }),
      holding({ sourceRowKey: 'put', securityId: '1', quantity: '10', putCall: 'PUT' }),
      holding({ sourceRowKey: 'call', securityId: '1', quantity: '10', putCall: 'CALL' }),
      holding({ sourceRowKey: 'unresolved-a', securityId: null, quantity: '10', mappingStatus: 'UNRESOLVED' }),
      holding({ sourceRowKey: 'unresolved-b', securityId: null, quantity: '10', mappingStatus: 'UNRESOLVED' }),
    ]) })
    expect(result.portfolio).toMatchObject({ holdingCount: 6, sourceRowCount: 6, mappedRowCount: 4, mappingCoveragePercent: '66.66666667' })
    expect(result.portfolio.unclassifiedSector).toMatchObject({ reportedValueUsd: '600', weightPercent: '100' })
  })

  it('normalizes share quantities across a verified split and preserves the raw reported quantity', () => {
    const split: GuruSecurityIdentityEvent = {
      id: 'split-1', supersedesEventId: null, kind: 'STOCK_SPLIT', fromSecurityId: '1', toSecurityId: '1',
      effectiveOn: '2026-04-01', newSharesPerOldShare: '2', comparable: true,
    }
    const result = calculateGuruPortfolioAnalytics({
      previous: snapshot('2026-03-31', [holding({ sourceRowKey: 'before', securityId: '1', ticker: 'OLD', quantity: '100' })]),
      current: snapshot('2026-06-30', [holding({ sourceRowKey: 'after', securityId: '1', ticker: 'NEW', quantity: '200' })]),
      identityEvents: [split],
    })
    expect(result.changes[0]).toMatchObject({
      ticker: 'NEW', action: 'UNCHANGED', previousQuantity: '100', comparablePreviousQuantity: '200',
      currentQuantity: '200', quantityChange: '0', quantityChangePercent: '0', quantityAdjustmentFactor: '2',
      corporateActionEventIds: ['split-1'],
    })
    expect(result.disclosedWeightTurnoverPercent).toBe('0')
  })

  it('uses corrected share-class continuity factors and suppresses merger exits and entries', () => {
    const classChange: GuruSecurityIdentityEvent = {
      id: 'class-1', supersedesEventId: null, kind: 'SHARE_CLASS_CONTINUITY', fromSecurityId: 'old', toSecurityId: 'new',
      effectiveOn: '2026-04-01', newSharesPerOldShare: '0.5', comparable: true,
    }
    const classResult = calculateGuruPortfolioAnalytics({
      previous: snapshot('2026-03-31', [holding({ sourceRowKey: 'before', securityId: 'old', quantity: '100' })]),
      current: snapshot('2026-06-30', [holding({ sourceRowKey: 'after', securityId: 'new', quantity: '50' })]),
      identityEvents: [classChange],
    })
    expect(classResult.changes).toHaveLength(1)
    expect(classResult.changes[0]).toMatchObject({ action: 'UNCHANGED', previousQuantity: '100', comparablePreviousQuantity: '50', quantityAdjustmentFactor: '0.5', corporateActionEventIds: ['class-1'] })
    expect(classResult.disclosedWeightTurnoverPercent).toBe('0')

    const merger: GuruSecurityIdentityEvent = {
      id: 'merger-1', supersedesEventId: null, kind: 'MERGER', fromSecurityId: 'old', toSecurityId: 'new',
      effectiveOn: '2026-04-01', newSharesPerOldShare: null, comparable: false,
    }
    const mergerResult = calculateGuruPortfolioAnalytics({
      previous: snapshot('2026-03-31', [holding({ sourceRowKey: 'before', securityId: 'old', quantity: '100' })]),
      current: snapshot('2026-06-30', [holding({ sourceRowKey: 'after', securityId: 'new', quantity: '50' })]),
      identityEvents: [merger],
    })
    expect(mergerResult).toMatchObject({ comparisonStatus: 'CORPORATE_ACTION_INCOMPLETE', changes: [], disclosedWeightTurnoverPercent: null, turnoverUnavailableReason: 'CORPORATE_ACTION_INCOMPLETE' })
  })

  it('ignores superseded split factors when comparing consecutive quarters', () => {
    const original: GuruSecurityIdentityEvent = {
      id: 'split-1', supersedesEventId: null, kind: 'STOCK_SPLIT', fromSecurityId: '1', toSecurityId: '1',
      effectiveOn: '2026-04-01', newSharesPerOldShare: '2', comparable: true,
    }
    const correction: GuruSecurityIdentityEvent = {
      ...original, id: 'split-2', supersedesEventId: 'split-1', newSharesPerOldShare: '3',
    }
    const result = calculateGuruPortfolioAnalytics({
      previous: snapshot('2026-03-31', [holding({ sourceRowKey: 'before', securityId: '1', quantity: '100' })]),
      current: snapshot('2026-06-30', [holding({ sourceRowKey: 'after', securityId: '1', quantity: '300' })]),
      identityEvents: [original, correction],
    })
    expect(result.changes[0]).toMatchObject({ action: 'UNCHANGED', quantityAdjustmentFactor: '3', corporateActionEventIds: ['split-2'] })
  })

  it('applies custom server-owned thresholds and rejects invalid monetary units and invalid periods', () => {
    const result = calculateGuruPortfolioAnalytics({
      previous: snapshot('2026-03-31', [holding({ sourceRowKey: 'p', securityId: '1', quantity: '100' })]),
      current: snapshot('2026-06-30', [holding({ sourceRowKey: 'c', securityId: '1', quantity: '110' })]),
      thresholds: { strongAddPercent: '100', addPercent: '9', reducePercent: '-9', strongReducePercent: '-100' },
    })
    expect(result.changes[0]?.action).toBe('ADD')
    expect(() => calculateGuruPortfolioAnalytics({ current: snapshot('2026-06-30', [holding({ sourceRowKey: 'bad', securityId: null, quantity: '1', reportedValueUnit: 'EUR' as never })]) })).toThrow('Unsupported reported value unit')
    expect(() => calculateGuruPortfolioAnalytics({ current: snapshot('2026-06-29', []) })).toThrow('calendar quarter end')
  })
})
