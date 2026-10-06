import type { GuruAction, GuruActionThresholds, GuruPortfolioAnalytics } from './guru-portfolio-analytics'

export const GURU_ANALYSIS_CONTEXT_VERSION = 'guru-analysis-context-v1'
export const GURU_ANALYSIS_SCHEMA_VERSION = 'guru-analysis-v1'

/** Disclosures every generated analysis carries. Interpretation text can never replace them. */
export const GURU_ANALYSIS_CAVEATS = Object.freeze({
  DELAYED_QUARTER_END: 'Form 13F is a delayed disclosure and reports holdings as of the quarter end, not today.',
  TRADE_DATES_UNKNOWN: 'Exact trade dates and execution prices are not disclosed and cannot be inferred.',
  SHORT_POSITIONS_UNDISCLOSED: 'Short positions are generally not disclosed in Form 13F.',
  DERIVATIVES_MAY_BE_ABSENT: 'Some derivative and hedging exposures may be absent from the disclosure.',
  CONFIDENTIAL_TREATMENT: 'Confidential treatment can temporarily hide holdings from a filing.',
  VALUE_CHANGE_IS_NOT_A_TRADE: 'A change in reported market value does not prove that a trade happened.',
  NOT_A_COMPLETE_PORTFOLIO: 'Form 13F does not represent the manager’s complete portfolio.',
} as const)

export type GuruAnalysisCaveatKey = keyof typeof GURU_ANALYSIS_CAVEATS
export const guruAnalysisCaveatKeys = Object.freeze(Object.keys(GURU_ANALYSIS_CAVEATS) as GuruAnalysisCaveatKey[])

export type GuruAnalysisQuarterStatus = 'READY' | 'PARTIAL' | 'ERROR' | 'PENDING'

export interface GuruAnalysisProfileInput {
  name: string
  managerName: string
  slug: string
  managerType: string | null
  styleTags: readonly string[]
}

export interface GuruAnalysisQuarterInput {
  periodEnd: string
  status: GuruAnalysisQuarterStatus
  mappingCoveragePercent: string | null
  accession: string | null
  filedAt: string | null
}

export interface GuruAnalysisHistoryPoint {
  periodEnd: string
  status: GuruAnalysisQuarterStatus
  reportedValueUsd: string | null
  holdingCount: number | null
  topTenConcentrationPercent: string | null
  turnoverPercent: string | null
  turnoverBand: 'LOW' | 'MODERATE' | 'HIGH' | null
}

export interface GuruAnalysisConsensusPosition {
  positionKey: string | null
  ticker: string | null
  company: string
  currentHolderCount: number
  previousHolderCount: number
  holderCountChange: number
  newBuyerCount: number
  addCount: number
  reduceCount: number
  exitCount: number
  netBuyerCount: number
  averagePortfolioWeightPercent: string | null
  classification: 'ACCUMULATION' | 'NEUTRAL' | 'DISTRIBUTION' | null
}

export interface GuruAnalysisSectorDirection {
  dimension: 'SECTOR' | 'INDUSTRY' | 'THEME'
  name: string
  direction: 'INCREASING' | 'STABLE' | 'REDUCING' | null
  buyerCount: number
  sellerCount: number
  newPositionCount: number
  exitCount: number
  aggregateWeightPercent: string
  aggregateWeightChangePoints: string | null
  holderBreadthPercent: string
}

export interface GuruAnalysisConsensusInput {
  periodEnd: string
  consensusVersion: string
  eligibleManagerCount: number
  readyManagerCount: number
  positions: readonly GuruAnalysisConsensusPosition[]
  sectors: readonly GuruAnalysisSectorDirection[]
}

export interface GuruAnalysisContextInput {
  profile: GuruAnalysisProfileInput
  quarter: GuruAnalysisQuarterInput
  analyticsVersion: string
  analytics: GuruPortfolioAnalytics
  thresholds: GuruActionThresholds
  history: readonly GuruAnalysisHistoryPoint[]
  consensus: GuruAnalysisConsensusInput | null
}

export interface GuruAnalysisFact { id: string; label: string; value: string }

const SECTION_LIMIT = 10
const HISTORY_LIMIT = 8
const SECTOR_LIMIT = 12

function stable(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function keyFor(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unclassified'
}

function positionLine(change: GuruPortfolioAnalytics['changes'][number]) {
  return {
    positionKey: change.positionKey,
    ticker: change.ticker,
    company: change.company,
    action: change.action,
    quantityType: change.quantityType,
    putCall: change.putCall,
    previousQuantity: change.previousQuantity,
    currentQuantity: change.currentQuantity,
    quantityChange: change.quantityChange,
    quantityChangePercent: change.quantityChangePercent,
    previousWeightPercent: change.previousWeightPercent,
    currentWeightPercent: change.currentWeightPercent,
    previousRank: change.previousRank,
    currentRank: change.currentRank,
  }
}

function byAbsoluteWeight(left: GuruPortfolioAnalytics['changes'][number], right: GuruPortfolioAnalytics['changes'][number]) {
  const magnitude = (value: string | null) => Math.abs(Number(value ?? '0'))
  const difference = magnitude(right.currentWeightPercent ?? right.previousWeightPercent) - magnitude(left.currentWeightPercent ?? left.previousWeightPercent)
  return difference !== 0 ? difference : left.positionKey.localeCompare(right.positionKey)
}

function group(changes: GuruPortfolioAnalytics['changes'], actions: readonly GuruAction[]) {
  return changes.filter(change => actions.includes(change.action)).sort(byAbsoluteWeight).slice(0, SECTION_LIMIT).map(positionLine)
}

/**
 * Build the only structured input a Guru analysis may see. It contains prepared
 * application facts, never raw SEC documents, and is deterministic for a given
 * snapshot of prepared analytics and consensus.
 */
export function buildGuruAnalysisContext(input: GuruAnalysisContextInput) {
  const { analytics, profile, quarter } = input
  const portfolio = analytics.portfolio
  const facts: GuruAnalysisFact[] = []
  const fact = (id: string, label: string, value: string | number | null) => {
    if (value === null || value === '') return
    facts.push({ id, label, value: String(value) })
  }

  fact('portfolio.reportedValueUsd', 'Reported portfolio value (USD)', portfolio.reportedValueUsd)
  fact('portfolio.holdingCount', 'Reported positions', portfolio.holdingCount)
  fact('coverage.mappingPercent', 'Mapped holding coverage (%)', portfolio.mappingCoveragePercent)
  fact('concentration.topOne', 'Largest position weight (%)', portfolio.topOneConcentrationPercent)
  fact('concentration.topFive', 'Top five concentration (%)', portfolio.topFiveConcentrationPercent)
  fact('concentration.topTen', 'Top ten concentration (%)', portfolio.topTenConcentrationPercent)
  fact('concentration.hhi', 'Herfindahl-Hirschman index', portfolio.hhi)
  fact('turnover.percent', 'Disclosed weight turnover (%)', analytics.disclosedWeightTurnoverPercent)
  fact('turnover.band', 'Turnover band', analytics.turnoverBand)
  fact('turnover.unavailableReason', 'Turnover unavailable because', analytics.turnoverUnavailableReason)
  fact('comparison.status', 'Quarter comparison status', analytics.comparisonStatus)
  for (const [action, count] of Object.entries(analytics.actionCounts)) fact(`actions.${action}`, `${action} positions`, count)

  const topHoldings = portfolio.topHoldings.slice(0, SECTION_LIMIT)
  for (const holding of topHoldings) fact(`holding.rank-${holding.rank}`, `Rank ${holding.rank}: ${holding.ticker ?? holding.company}`, `${holding.weightPercent}% of reported value`)
  const sectorAllocation = portfolio.sectorAllocation.slice(0, SECTOR_LIMIT)
  for (const bucket of sectorAllocation) fact(`sector.${keyFor(bucket.name)}`, `Sector weight: ${bucket.name}`, `${bucket.weightPercent}%`)

  const newPositions = group(analytics.changes, ['NEW'])
  const increased = group(analytics.changes, ['ADD', 'STRONG_ADD'])
  const reduced = group(analytics.changes, ['REDUCE', 'STRONG_REDUCE'])
  const exited = group(analytics.changes, ['EXIT'])
  for (const move of [...newPositions, ...increased, ...reduced, ...exited]) {
    fact(`change.${move.positionKey}`, `${move.action}: ${move.ticker ?? move.company}`, `${move.quantityChangePercent ?? 'n/a'}% reported quantity change`)
  }

  const history = [...input.history].sort((left, right) => right.periodEnd.localeCompare(left.periodEnd)).slice(0, HISTORY_LIMIT)
  for (const point of history) fact(`history.${point.periodEnd}.reportedValueUsd`, `Reported value at ${point.periodEnd}`, point.reportedValueUsd)

  const consensus = input.consensus
  if (consensus) {
    for (const position of consensus.positions.slice(0, SECTION_LIMIT)) {
      fact(`consensus.${keyFor(position.ticker ?? position.company)}.holders`, `Tracked holders of ${position.ticker ?? position.company}`, `${position.currentHolderCount} of ${consensus.eligibleManagerCount} eligible`)
    }
    for (const sector of consensus.sectors.slice(0, SECTOR_LIMIT)) {
      fact(`consensusSector.${sector.dimension.toLowerCase()}.${keyFor(sector.name)}`, `${sector.dimension} direction: ${sector.name}`, sector.direction ?? 'UNAVAILABLE')
    }
  }

  const context = {
    contextVersion: GURU_ANALYSIS_CONTEXT_VERSION,
    schemaVersion: GURU_ANALYSIS_SCHEMA_VERSION,
    disclosureIds: guruAnalysisCaveatKeys,
    guru: {
      name: profile.name,
      managerName: profile.managerName,
      slug: profile.slug,
      managerType: profile.managerType,
      styleTags: [...profile.styleTags],
    },
    quarter: {
      periodEnd: quarter.periodEnd,
      status: quarter.status,
      mappingCoveragePercent: quarter.mappingCoveragePercent,
      comparisonStatus: analytics.comparisonStatus,
      source: { accession: quarter.accession, filedAt: quarter.filedAt },
    },
    rules: {
      analyticsVersion: input.analyticsVersion,
      actionThresholds: {
        strongAddPercent: input.thresholds.strongAddPercent,
        addPercent: input.thresholds.addPercent,
        reducePercent: input.thresholds.reducePercent,
        strongReducePercent: input.thresholds.strongReducePercent,
      },
    },
    portfolio: {
      reportedValueUsd: portfolio.reportedValueUsd,
      holdingCount: portfolio.holdingCount,
      sourceRowCount: portfolio.sourceRowCount,
      mappedRowCount: portfolio.mappedRowCount,
      largestPosition: portfolio.largestPosition,
      topHoldings,
      sectorAllocation,
      unclassifiedSector: portfolio.unclassifiedSector,
    },
    concentration: {
      topOneConcentrationPercent: portfolio.topOneConcentrationPercent,
      topFiveConcentrationPercent: portfolio.topFiveConcentrationPercent,
      topTenConcentrationPercent: portfolio.topTenConcentrationPercent,
      hhi: portfolio.hhi,
    },
    turnover: {
      disclosedWeightTurnoverPercent: analytics.disclosedWeightTurnoverPercent,
      band: analytics.turnoverBand,
      unavailableReason: analytics.turnoverUnavailableReason,
    },
    changes: {
      actionCounts: analytics.actionCounts,
      newPositions,
      increasedPositions: increased,
      reducedPositions: reduced,
      exitedPositions: exited,
    },
    history,
    consensus: consensus
      ? {
        periodEnd: consensus.periodEnd,
        consensusVersion: consensus.consensusVersion,
        eligibleManagerCount: consensus.eligibleManagerCount,
        readyManagerCount: consensus.readyManagerCount,
        positions: consensus.positions.slice(0, SECTION_LIMIT),
        sectors: consensus.sectors.slice(0, SECTOR_LIMIT),
      }
      : null,
    facts,
  }
  return { contextVersion: GURU_ANALYSIS_CONTEXT_VERSION, context, facts, canonicalJson: stable(context) }
}

export type GuruAnalysisContext = ReturnType<typeof buildGuruAnalysisContext>['context']
