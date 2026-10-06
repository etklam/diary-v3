import { describe, expect, it } from 'vitest'
import {
  calculateGuruConsensusSnapshot,
  type GuruConsensusHolding,
  type GuruConsensusManager,
} from '@diary/domain/guru-consensus'

const THEME_HASH = 'a'.repeat(64)

function holding(overrides: Partial<GuruConsensusHolding> & Pick<GuruConsensusHolding, 'securityId' | 'reportedValue'>): GuruConsensusHolding {
  return {
    ticker: overrides.securityId,
    company: overrides.securityId,
    securityType: 'Common Stock',
    sector: 'Technology',
    industry: 'Software',
    quantityType: 'SH',
    putCall: null,
    quantity: '100',
    reportedValueUnit: 'USD',
    themes: [{ key: 'ai-infrastructure', name: 'AI Infrastructure' }],
    ...overrides,
  }
}

function manager(overrides: Partial<GuruConsensusManager> & Pick<GuruConsensusManager, 'managerId' | 'status'>): GuruConsensusManager {
  return {
    sourceRowCount: 1,
    mappedRowCount: 1,
    comparisonStatus: 'COMPARABLE',
    reportedPortfolioValueUsd: '1000',
    previousReportedPortfolioValueUsd: '1000',
    holdings: [],
    previousReady: false,
    previousHoldings: [],
    changes: [],
    ...overrides,
  }
}

describe('calculateGuruConsensusSnapshot', () => {
  it('counts only active READY managers and exposes both the full and comparable holder cohorts', () => {
    const snapshot = calculateGuruConsensusSnapshot({
      periodEnd: '2026-06-30', themeMappingHash: THEME_HASH,
      managers: [
        manager({
          managerId: '1', status: 'READY', previousReady: true,
          holdings: [holding({ securityId: '10', reportedValue: '200' })],
          previousHoldings: [holding({ securityId: '10', reportedValue: '100' })],
          changes: [{ securityId: '10', action: 'STRONG_ADD', quantityType: 'SH', putCall: null, quantityChangePercent: '100', sector: 'Technology', industry: 'Software', themes: [{ key: 'ai-infrastructure', name: 'AI Infrastructure' }] }],
        }),
        manager({
          managerId: '2', status: 'READY', previousReady: true,
          holdings: [holding({ securityId: '10', reportedValue: '100' })],
          previousHoldings: [holding({ securityId: '10', reportedValue: '100' })],
          changes: [{ securityId: '10', action: 'UNCHANGED', quantityType: 'SH', putCall: null, quantityChangePercent: '0', sector: 'Technology', industry: 'Software', themes: [{ key: 'ai-infrastructure', name: 'AI Infrastructure' }] }],
        }),
        manager({ managerId: '3', status: 'PARTIAL', holdings: [holding({ securityId: '10', reportedValue: '900' })] }),
        manager({ managerId: '4', status: 'NO_FILING' }),
      ],
    })

    const stock = snapshot.stocks.find(row => row.securityId === '10')!
    expect(snapshot.cohort).toMatchObject({ activeManagerCount: 4, readyManagerCount: 2, partialManagerCount: 1, noFilingManagerCount: 1, comparableManagerCount: 2 })
    expect(stock).toMatchObject({
      currentHolderCount: 2,
      comparableCurrentHolderCount: 2,
      previousHolderCount: 2,
      holderCountChange: 0,
      addCount: 1,
      unchangedCount: 1,
      netBuyerCount: 1,
      averageQuantityChangePercent: '50',
      medianQuantityChangePercent: '50',
      aggregateWeightPercent: '30',
      averagePortfolioWeightPercent: '15',
      weightBreadthPercent: '100',
      classification: 'ACCUMULATION',
      quarterTrend: 'STABLE',
    })
    expect(snapshot.groups.find(row => row.dimension === 'SECTOR' && row.dimensionKey === 'Technology')).toMatchObject({
      buyerCount: 1, sellerCount: 0, aggregateWeightPercent: '30', comparableCurrentAggregateWeightPercent: '30',
      previousAggregateWeightPercent: '20', aggregateWeightChangePoints: '10', allocationManagerCount: 2,
      direction: 'INCREASING',
    })
  })

  it('keeps exits and previous-only allocation changes visible, and supports zero current holders', () => {
    const snapshot = calculateGuruConsensusSnapshot({
      periodEnd: '2026-06-30', themeMappingHash: THEME_HASH,
      managers: [manager({
        managerId: '1', status: 'READY', previousReady: true,
        previousHoldings: [holding({ securityId: '20', reportedValue: '50', sector: 'Energy', industry: 'Oil & Gas', themes: [] })],
        changes: [{ securityId: '20', action: 'EXIT', quantityType: 'SH', putCall: null, quantityChangePercent: '-100', sector: 'Energy', industry: 'Oil & Gas', themes: [] }],
      })],
    })
    const stock = snapshot.stocks.find(row => row.securityId === '20')!
    const energy = snapshot.groups.find(row => row.dimension === 'SECTOR' && row.dimensionKey === 'Energy')!
    expect(stock).toMatchObject({ currentHolderCount: 0, comparableCurrentHolderCount: 0, previousHolderCount: 1, holderCountChange: -1, exitCount: 1, netBuyerCount: -1, classification: 'DISTRIBUTION', quarterTrend: 'FALLING' })
    expect(energy).toMatchObject({ currentHolderCount: 0, sellerCount: 1, exitCount: 1, aggregateWeightPercent: '0', comparableCurrentAggregateWeightPercent: '0', previousAggregateWeightPercent: '5', aggregateWeightChangePoints: '-5', direction: 'REDUCING' })
  })

  it('excludes PRN and put/call exposures from common-share stock breadth and actions', () => {
    const snapshot = calculateGuruConsensusSnapshot({
      periodEnd: '2026-06-30', themeMappingHash: THEME_HASH,
      managers: [manager({ managerId: '1', status: 'READY', holdings: [
        holding({ securityId: 'ordinary', reportedValue: '10' }),
        holding({ securityId: 'prn', reportedValue: '20', quantityType: 'PRN' }),
        holding({ securityId: 'call', reportedValue: '30', putCall: 'CALL' }),
      ], changes: [
        { securityId: 'prn', action: 'NEW', quantityType: 'PRN', putCall: null, quantityChangePercent: null, sector: 'Technology', industry: 'Software', themes: [] },
        { securityId: 'call', action: 'NEW', quantityType: 'SH', putCall: 'CALL', quantityChangePercent: null, sector: 'Technology', industry: 'Software', themes: [] },
      ] })],
    })
    expect(snapshot.stocks.map(row => row.securityId)).toEqual(['ordinary'])
  })

  it('keeps unresolved classifications explicit and reports unavailable comparisons without a READY prior quarter', () => {
    const snapshot = calculateGuruConsensusSnapshot({
      periodEnd: '2026-06-30', themeMappingHash: THEME_HASH,
      managers: [manager({ managerId: '1', status: 'READY', comparisonStatus: 'PREVIOUS_NOT_READY', holdings: [
        holding({ securityId: '10', reportedValue: '100', sector: null, industry: null, themes: [] }),
      ] })],
    })
    expect(snapshot.stocks[0]).toMatchObject({ currentHolderCount: 1, quarterTrend: 'UNAVAILABLE', classification: null })
    expect(snapshot.groups.find(row => row.dimension === 'SECTOR')).toMatchObject({ name: 'Unclassified', aggregateWeightPercent: '10', direction: null })
    expect(snapshot.cohort.mappingCoveragePercent).toBe('100')
  })

  it('does not infer zero-holder stocks that are absent from both holdings and changes', () => {
    const snapshot = calculateGuruConsensusSnapshot({ periodEnd: '2026-06-30', themeMappingHash: THEME_HASH, managers: [manager({ managerId: '1', status: 'READY' })] })
    expect(snapshot.stocks).toEqual([])
    expect(snapshot.cohort.readyManagerCount).toBe(1)
  })

  it('rejects duplicate active managers and malformed version inputs', () => {
    const ready = manager({ managerId: '1', status: 'READY' })
    expect(() => calculateGuruConsensusSnapshot({ periodEnd: '2026-06-30', themeMappingHash: THEME_HASH, managers: [ready, ready] })).toThrow('GURU_CONSENSUS_DUPLICATE_MANAGER')
    expect(() => calculateGuruConsensusSnapshot({ periodEnd: '2026-06-30', themeMappingHash: 'bad', managers: [] })).toThrow('GURU_CONSENSUS_INVALID_THEME_HASH')
  })
})
