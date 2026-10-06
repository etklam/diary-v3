const VALUE_SCALE = 8
const WEIGHT_SCALE = 8

export type GuruAction = 'NEW' | 'STRONG_ADD' | 'ADD' | 'UNCHANGED' | 'REDUCE' | 'STRONG_REDUCE' | 'EXIT'
export type GuruQuantityType = 'SH' | 'PRN'
export type GuruPutCall = 'PUT' | 'CALL' | null
export type GuruMappingStatus = 'MATCHED' | 'MANUAL_OVERRIDE' | 'AMBIGUOUS' | 'UNRESOLVED'

export interface GuruAnalyticsHolding {
  sourceRowKey: string
  securityId: string | null
  ticker: string | null
  company: string
  sector: string | null
  industry: string | null
  quantityType: GuruQuantityType
  putCall: GuruPutCall
  quantity: string
  reportedValue: string
  reportedValueUnit: 'USD' | 'THOUSANDS_USD'
  mappingStatus: GuruMappingStatus
}

export interface GuruAnalyticsSnapshot {
  periodEnd: string
  status: 'READY' | 'PARTIAL' | 'ERROR' | 'SUPERSEDED'
  holdings: readonly GuruAnalyticsHolding[]
}

export interface GuruSecurityIdentityEvent {
  id: string
  supersedesEventId: string | null
  kind: 'TICKER_CHANGE' | 'MERGER' | 'SPIN_OFF' | 'DELISTING' | 'STOCK_SPLIT' | 'SHARE_CLASS_CONTINUITY'
  fromSecurityId: string
  toSecurityId: string | null
  effectiveOn: string
  newSharesPerOldShare: string | null
  comparable: boolean
}

export interface GuruActionThresholds {
  strongAddPercent: string
  addPercent: string
  reducePercent: string
  strongReducePercent: string
}

export const DEFAULT_GURU_ACTION_THRESHOLDS: Readonly<GuruActionThresholds> = Object.freeze({
  strongAddPercent: '50',
  addPercent: '5',
  reducePercent: '-5',
  strongReducePercent: '-50',
})

export const GURU_PORTFOLIO_ANALYTICS_VERSION = 'guru-portfolio-analytics-v1'

interface Fraction { numerator: bigint; denominator: bigint }
interface Position {
  key: string
  securityId: string | null
  ticker: string | null
  company: string
  sector: string | null
  industry: string | null
  quantityType: GuruQuantityType
  putCall: GuruPutCall
  quantity: bigint
  reportedValueUsd: bigint
  sourceRowCount: number
  rank: number
}

export interface GuruPortfolioChange {
  positionKey: string
  securityId: string | null
  ticker: string | null
  company: string
  quantityType: GuruQuantityType
  putCall: GuruPutCall
  action: GuruAction
  previousQuantity: string | null
  comparablePreviousQuantity: string | null
  currentQuantity: string | null
  quantityChange: string
  quantityChangePercent: string | null
  quantityAdjustmentFactor: string | null
  corporateActionEventIds: string[]
  previousWeightPercent: string | null
  currentWeightPercent: string | null
  weightChangePercentagePoints: string | null
  previousRank: number | null
  currentRank: number | null
  rankChange: number | null
  previousReportedValueUsd: string | null
  currentReportedValueUsd: string | null
  reportedValueChangeUsd: string | null
}

export interface GuruLargestPosition {
  positionKey: string
  securityId: string | null
  ticker: string | null
  company: string
  quantityType: GuruQuantityType
  putCall: GuruPutCall
  quantity: string
  reportedValueUsd: string
  weightPercent: string
  rank: number
}

export interface GuruPortfolioAnalytics {
  version: typeof GURU_PORTFOLIO_ANALYTICS_VERSION
  periodEnd: string
  comparisonStatus: 'BASELINE' | 'PREVIOUS_NOT_READY' | 'NON_ADJACENT_QUARTER' | 'COMPARABLE' | 'MAPPING_INCOMPLETE' | 'CORPORATE_ACTION_INCOMPLETE'
  portfolio: {
    reportedValueUsd: string
    holdingCount: number
    sourceRowCount: number
    mappedRowCount: number
    mappingCoveragePercent: string
    topOneConcentrationPercent: string
    topFiveConcentrationPercent: string
    topTenConcentrationPercent: string
    hhi: string
    largestPosition: GuruLargestPosition | null
    topHoldings: GuruLargestPosition[]
    sectorAllocation: AllocationBucket[]
    unclassifiedSector: AllocationResidual
    industryAllocation: AllocationBucket[]
    unclassifiedIndustry: AllocationResidual
  }
  changes: GuruPortfolioChange[]
  actionCounts: Record<GuruAction, number>
  largestAdds: GuruPortfolioChange[]
  largestReductions: GuruPortfolioChange[]
  disclosedWeightTurnoverPercent: string | null
  turnoverBand: 'LOW' | 'MODERATE' | 'HIGH' | null
  turnoverUnavailableReason: 'BASELINE' | 'PREVIOUS_NOT_READY' | 'NON_ADJACENT_QUARTER' | 'MAPPING_INCOMPLETE' | 'CORPORATE_ACTION_INCOMPLETE' | 'ZERO_REPORTED_VALUE' | null
}

export interface AllocationBucket {
  name: string
  reportedValueUsd: string
  weightPercent: string
}

export interface AllocationResidual {
  reportedValueUsd: string
  weightPercent: string
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) [a, b] = [b, a % b]
  return a || 1n
}

function fraction(numerator: bigint, denominator = 1n): Fraction {
  if (denominator === 0n) throw new Error('Division by zero')
  const sign = denominator < 0n ? -1n : 1n
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor * sign, denominator: denominator / divisor * sign }
}

function addFraction(left: Fraction, right: Fraction): Fraction {
  return fraction(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator)
}

function subtractFraction(left: Fraction, right: Fraction): Fraction {
  return addFraction(left, fraction(-right.numerator, right.denominator))
}

function multiplyFraction(left: Fraction, right: Fraction): Fraction {
  return fraction(left.numerator * right.numerator, left.denominator * right.denominator)
}

function divideFraction(left: Fraction, right: Fraction): Fraction {
  return fraction(left.numerator * right.denominator, left.denominator * right.numerator)
}

function parseDecimal(value: string, scale = VALUE_SCALE): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match || (match[3]?.length ?? 0) > scale) throw new Error(`Invalid decimal value: ${value}`)
  const magnitude = BigInt(match[2]!) * (10n ** BigInt(scale)) + BigInt((match[3] ?? '').padEnd(scale, '0') || '0')
  return match[1] ? -magnitude : magnitude
}

function formatDecimal(value: bigint, scale = VALUE_SCALE): string {
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const factor = 10n ** BigInt(scale)
  const whole = magnitude / factor
  const decimal = (magnitude % factor).toString().padStart(scale, '0').replace(/0+$/, '')
  return `${negative && magnitude !== 0n ? '-' : ''}${whole}${decimal ? `.${decimal}` : ''}`
}

function roundRatio(numerator: bigint, denominator: bigint, scale = VALUE_SCALE): string {
  if (denominator === 0n) throw new Error('Division by zero')
  const negative = (numerator < 0n) !== (denominator < 0n)
  const top = (numerator < 0n ? -numerator : numerator) * (10n ** BigInt(scale))
  const bottom = denominator < 0n ? -denominator : denominator
  const quotient = top / bottom
  const remainder = top % bottom
  return formatDecimal((negative ? -1n : 1n) * (quotient + (remainder * 2n >= bottom ? 1n : 0n)), scale)
}

function percent(value: Fraction, scale = WEIGHT_SCALE): string {
  return roundRatio(value.numerator * 100n, value.denominator, scale)
}

function scaledFractionDecimal(value: Fraction): string {
  return roundRatio(value.numerator, value.denominator * 10n ** BigInt(VALUE_SCALE), VALUE_SCALE)
}

function compareFractions(left: Fraction, right: Fraction): number {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator
  return delta < 0n ? -1 : delta > 0n ? 1 : 0
}

function validatePeriodEnd(value: string): { year: number; quarter: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid Guru portfolio period: ${value}`)
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (![3, 6, 9, 12].includes(month) || day !== lastDay) throw new Error(`Guru portfolio period must be a calendar quarter end: ${value}`)
  return { year, quarter: (month - 1) / 3 }
}

function adjacentQuarter(previous: string, current: string): boolean {
  const before = validatePeriodEnd(previous), after = validatePeriodEnd(current)
  return after.year * 4 + after.quarter === before.year * 4 + before.quarter + 1
}

interface IdentityMatch { factor: Fraction; eventIds: string[] }

function activeCorporateEvents(events: readonly GuruSecurityIdentityEvent[], previousPeriod: string, currentPeriod: string) {
  const superseded = new Set(events.flatMap(event => event.supersedesEventId ? [event.supersedesEventId] : []))
  return events.filter(event => !superseded.has(event.id) && previousPeriod < event.effectiveOn && event.effectiveOn <= currentPeriod)
    .sort((left, right) => left.effectiveOn.localeCompare(right.effectiveOn) || left.id.localeCompare(right.id))
}

function shareFactor(value: string): Fraction {
  const parsed = parseDecimal(value, 12)
  if (parsed <= 0n) throw new Error('Corporate-action share conversion factor must be positive')
  return fraction(parsed, 10n ** 12n)
}

function identityMatch(
  fromSecurityId: string,
  toSecurityId: string,
  previousPeriod: string,
  currentPeriod: string,
  events: readonly GuruSecurityIdentityEvent[],
): IdentityMatch | null {
  const active = activeCorporateEvents(events, previousPeriod, currentPeriod)
  if (fromSecurityId === toSecurityId) {
    const splits = active.filter(event => event.kind === 'STOCK_SPLIT' && event.fromSecurityId === fromSecurityId && event.comparable && event.newSharesPerOldShare !== null)
    return { factor: splits.reduce((value, event) => multiplyFraction(value, shareFactor(event.newSharesPerOldShare!)), fraction(1n)), eventIds: splits.map(event => event.id) }
  }
  const edges = active.filter(event => event.kind === 'SHARE_CLASS_CONTINUITY' && event.comparable && event.toSecurityId && event.newSharesPerOldShare)
  const queue: Array<{ securityId: string; factor: Fraction; eventIds: string[]; visited: Set<string> }> = [{ securityId: fromSecurityId, factor: fraction(1n), eventIds: [], visited: new Set([fromSecurityId]) }]
  while (queue.length) {
    const current = queue.shift()!
    for (const event of edges) {
      if (event.fromSecurityId !== current.securityId || !event.toSecurityId || current.visited.has(event.toSecurityId)) continue
      const factor = multiplyFraction(current.factor, shareFactor(event.newSharesPerOldShare!))
      const eventIds = [...current.eventIds, event.id]
      if (event.toSecurityId === toSecurityId) return { factor, eventIds }
      queue.push({ securityId: event.toSecurityId, factor, eventIds, visited: new Set([...current.visited, event.toSecurityId]) })
    }
  }
  return null
}

function nonComparableTransition(fromSecurityId: string, toSecurityId: string, previousPeriod: string, currentPeriod: string, events: readonly GuruSecurityIdentityEvent[]): boolean {
  return activeCorporateEvents(events, previousPeriod, currentPeriod).some(event =>
    (event.kind === 'MERGER' || event.kind === 'SPIN_OFF') && !event.comparable
    && event.fromSecurityId === fromSecurityId && event.toSecurityId === toSecurityId)
}

function delistedDuring(fromSecurityId: string, previousPeriod: string, currentPeriod: string, events: readonly GuruSecurityIdentityEvent[]): boolean {
  return activeCorporateEvents(events, previousPeriod, currentPeriod).some(event => event.kind === 'DELISTING'
    && !event.comparable && event.fromSecurityId === fromSecurityId && event.toSecurityId === null)
}

function positionKey(holding: GuruAnalyticsHolding): string {
  if (holding.securityId === null) return `UNRESOLVED:${holding.sourceRowKey}`
  return `SECURITY:${holding.securityId}:${holding.quantityType}:${holding.putCall ?? 'NONE'}`
}

function metadataValue(current: string | null, next: string | null): string | null {
  if (current === null) return next
  if (next === null) return current
  return current.localeCompare(next) <= 0 ? current : next
}

function aggregate(snapshot: GuruAnalyticsSnapshot): { positions: Position[]; sourceRowCount: number; mappedRowCount: number; totalValue: bigint } {
  const buckets = new Map<string, Position>()
  const sourceKeys = new Set<string>()
  let mappedRowCount = 0
  for (const holding of snapshot.holdings) {
    if (!holding.sourceRowKey || sourceKeys.has(holding.sourceRowKey)) throw new Error('Guru portfolio source row keys must be unique and non-empty')
    sourceKeys.add(holding.sourceRowKey)
    if (holding.quantityType !== 'SH' && holding.quantityType !== 'PRN') throw new Error(`Invalid quantity type: ${holding.quantityType}`)
    if (holding.putCall !== null && holding.putCall !== 'PUT' && holding.putCall !== 'CALL') throw new Error(`Invalid Put/Call exposure: ${holding.putCall}`)
    if (holding.mappingStatus === 'MATCHED' || holding.mappingStatus === 'MANUAL_OVERRIDE') {
      if (holding.securityId === null) throw new Error('Resolved Guru portfolio holding must include a security ID')
      mappedRowCount += 1
    } else if (holding.securityId !== null) throw new Error('Unresolved Guru portfolio holding cannot include a security ID')
    const quantity = parseDecimal(holding.quantity)
    const rawValue = parseDecimal(holding.reportedValue)
    if (quantity < 0n || rawValue < 0n) throw new Error('Guru portfolio quantities and reported values cannot be negative')
    const value = holding.reportedValueUnit === 'USD' ? rawValue
      : holding.reportedValueUnit === 'THOUSANDS_USD' ? rawValue * 1000n
        : (() => { throw new Error(`Unsupported reported value unit: ${holding.reportedValueUnit}`) })()
    const key = positionKey(holding)
    const existing = buckets.get(key)
    if (!existing) {
      buckets.set(key, {
        key, securityId: holding.securityId, ticker: holding.ticker, company: holding.company,
        sector: holding.sector, industry: holding.industry, quantityType: holding.quantityType,
        putCall: holding.putCall, quantity, reportedValueUsd: value, sourceRowCount: 1, rank: 0,
      })
    } else {
      existing.quantity += quantity
      existing.reportedValueUsd += value
      existing.sourceRowCount += 1
      existing.ticker = metadataValue(existing.ticker, holding.ticker)
      existing.company = metadataValue(existing.company, holding.company) ?? ''
      existing.sector = metadataValue(existing.sector, holding.sector)
      existing.industry = metadataValue(existing.industry, holding.industry)
    }
  }
  const positions = [...buckets.values()].sort((left, right) => {
    if (left.reportedValueUsd !== right.reportedValueUsd) return left.reportedValueUsd > right.reportedValueUsd ? -1 : 1
    return left.key.localeCompare(right.key)
  })
  positions.forEach((position, index) => { position.rank = index + 1 })
  return { positions, sourceRowCount: snapshot.holdings.length, mappedRowCount, totalValue: positions.reduce((sum, position) => sum + position.reportedValueUsd, 0n) }
}

function allocation(positions: readonly Position[], field: 'sector' | 'industry', total: bigint): { buckets: AllocationBucket[]; residual: AllocationResidual } {
  const values = new Map<string, bigint>()
  let unclassified = 0n
  for (const position of positions) {
    const label = position[field]?.trim()
    if (!label) unclassified += position.reportedValueUsd
    else values.set(label, (values.get(label) ?? 0n) + position.reportedValueUsd)
  }
  const buckets = [...values].sort((left, right) => left[0].localeCompare(right[0])).map(([name, value]) => ({ name, value }))
    .sort((left, right) => left.value === right.value ? left.name.localeCompare(right.name) : left.value > right.value ? -1 : 1)
    .map(({ name, value }) => ({ name, reportedValueUsd: formatDecimal(value), weightPercent: total > 0n ? percent(fraction(value, total)) : '0' }))
  return {
    buckets,
    residual: { reportedValueUsd: formatDecimal(unclassified), weightPercent: total > 0n ? percent(fraction(unclassified, total)) : '0' },
  }
}

function actionFor(delta: Fraction, previous: Fraction, thresholds: GuruActionThresholds): GuruAction {
  if (previous.numerator === 0n) return delta.numerator > 0n ? 'NEW' : delta.numerator < 0n ? 'EXIT' : 'UNCHANGED'
  const change = divideFraction(delta, previous)
  const threshold = (value: string) => fraction(parseDecimal(value), 10n ** BigInt(VALUE_SCALE))
  const strongAdd = threshold(thresholds.strongAddPercent)
  const add = threshold(thresholds.addPercent)
  const reduce = threshold(thresholds.reducePercent)
  const strongReduce = threshold(thresholds.strongReducePercent)
  const changePercent = multiplyFraction(change, fraction(100n))
  if (compareFractions(changePercent, strongAdd) >= 0) return 'STRONG_ADD'
  if (compareFractions(changePercent, add) > 0) return 'ADD'
  if (compareFractions(changePercent, strongReduce) <= 0) return 'STRONG_REDUCE'
  if (compareFractions(changePercent, reduce) < 0) return 'REDUCE'
  return 'UNCHANGED'
}

function weights(positions: readonly Position[], total: bigint): Map<string, Fraction> {
  return new Map(positions.map(position => [position.key, total > 0n ? fraction(position.reportedValueUsd, total) : fraction(0n)]))
}

function emptyActionCounts(): Record<GuruAction, number> {
  return { NEW: 0, STRONG_ADD: 0, ADD: 0, UNCHANGED: 0, REDUCE: 0, STRONG_REDUCE: 0, EXIT: 0 }
}

function comparePositions(current: Position, previous: Position | undefined, identity: IdentityMatch | undefined, currentWeight: Fraction, previousWeight: Fraction | undefined, thresholds: GuruActionThresholds): GuruPortfolioChange {
  const rawPreviousQuantity = previous ? fraction(previous.quantity) : fraction(0n)
  const comparablePreviousQuantity = previous ? multiplyFraction(rawPreviousQuantity, identity?.factor ?? fraction(1n)) : fraction(0n)
  const delta = subtractFraction(fraction(current.quantity), comparablePreviousQuantity)
  const action = previous ? actionFor(delta, comparablePreviousQuantity, thresholds) : 'NEW'
  return {
    positionKey: current.key, securityId: current.securityId, ticker: current.ticker, company: current.company,
    quantityType: current.quantityType, putCall: current.putCall, action,
    previousQuantity: previous ? formatDecimal(previous.quantity) : null,
    comparablePreviousQuantity: previous ? scaledFractionDecimal(comparablePreviousQuantity) : null,
    currentQuantity: formatDecimal(current.quantity), quantityChange: scaledFractionDecimal(delta),
    quantityChangePercent: previous && comparablePreviousQuantity.numerator !== 0n
      ? percent(divideFraction(delta, comparablePreviousQuantity)) : null,
    quantityAdjustmentFactor: previous ? roundRatio((identity?.factor ?? fraction(1n)).numerator, (identity?.factor ?? fraction(1n)).denominator, 12) : null,
    corporateActionEventIds: identity?.eventIds ?? [],
    previousWeightPercent: previous && previousWeight ? percent(previousWeight) : null,
    currentWeightPercent: percent(currentWeight),
    weightChangePercentagePoints: previous && previousWeight ? percent(subtractFraction(currentWeight, previousWeight)) : null,
    previousRank: previous?.rank ?? null, currentRank: current.rank,
    rankChange: previous ? previous.rank - current.rank : null,
    previousReportedValueUsd: previous ? formatDecimal(previous.reportedValueUsd) : null,
    currentReportedValueUsd: formatDecimal(current.reportedValueUsd),
    reportedValueChangeUsd: previous ? formatDecimal(current.reportedValueUsd - previous.reportedValueUsd) : null,
  }
}

function exposureKey(position: Position): string { return `${position.quantityType}:${position.putCall ?? 'NONE'}` }

interface PositionPairing {
  pairsByCurrent: Map<string, { previous: Position; identity: IdentityMatch }>
  candidateCurrentKeys: Set<string>
  candidatePreviousKeys: Set<string>
  blockedCurrentKeys: Set<string>
  blockedPreviousKeys: Set<string>
  hasAmbiguousCandidates: boolean
  hasNonComparableEvents: boolean
}

function pairPositions(currentPositions: readonly Position[], previousPositions: readonly Position[], identityEvents: readonly GuruSecurityIdentityEvent[], previousPeriod: string, currentPeriod: string): PositionPairing {
  const activeEvents = activeCorporateEvents(identityEvents, previousPeriod, currentPeriod)
  const previousByExposure = new Map<string, Position[]>()
  const currentByExposure = new Map<string, Position[]>()
  for (const position of previousPositions) if (position.securityId) previousByExposure.set(exposureKey(position), [...(previousByExposure.get(exposureKey(position)) ?? []), position])
  for (const position of currentPositions) if (position.securityId) currentByExposure.set(exposureKey(position), [...(currentByExposure.get(exposureKey(position)) ?? []), position])
  const candidatesByCurrent = new Map<string, Array<{ previous: Position; identity: IdentityMatch }>>()
  const candidatesByPrevious = new Map<string, string[]>()
  const currentByExposureId = new Map<string, Position>()
  for (const [exposure, positions] of currentByExposure) for (const position of positions) currentByExposureId.set(`${exposure}:${position.securityId}`, position)

  for (const [exposure, priorPositions] of previousByExposure) {
    const currentPositionsForExposure = currentByExposure.get(exposure) ?? []
    const currentIds = new Set(currentPositionsForExposure.flatMap(position => position.securityId ? [position.securityId] : []))
    const eventsBySource = new Map<string, GuruSecurityIdentityEvent[]>()
    for (const event of activeEvents) if (event.kind === 'SHARE_CLASS_CONTINUITY' && event.comparable && event.toSecurityId && event.newSharesPerOldShare) {
      eventsBySource.set(event.fromSecurityId, [...(eventsBySource.get(event.fromSecurityId) ?? []), event])
    }
    for (const previous of priorPositions) {
      const reachable = new Map<string, IdentityMatch[]>()
      const exact = currentByExposureId.get(`${exposure}:${previous.securityId}`)
      if (exact && previous.securityId) {
        const identity = identityMatch(previous.securityId, exact.securityId!, previousPeriod, currentPeriod, identityEvents)
        if (identity) reachable.set(exact.securityId!, [identity])
      }
      const queue: Array<{ securityId: string; factor: Fraction; eventIds: string[]; visited: Set<string> }> = [
        { securityId: previous.securityId!, factor: fraction(1n), eventIds: [], visited: new Set([previous.securityId!]) },
      ]
      while (queue.length) {
        const node = queue.shift()!
        for (const event of eventsBySource.get(node.securityId) ?? []) {
          if (!event.toSecurityId || node.visited.has(event.toSecurityId)) continue
          const factor = multiplyFraction(node.factor, shareFactor(event.newSharesPerOldShare!))
          const eventIds = [...node.eventIds, event.id]
          if (currentIds.has(event.toSecurityId)) reachable.set(event.toSecurityId, [...(reachable.get(event.toSecurityId) ?? []), { factor, eventIds }])
          queue.push({ securityId: event.toSecurityId, factor, eventIds, visited: new Set([...node.visited, event.toSecurityId]) })
        }
      }
      for (const [securityId, identities] of reachable) {
        const current = currentByExposureId.get(`${exposure}:${securityId}`)
        if (!current) continue
        for (const identity of identities) {
          candidatesByCurrent.set(current.key, [...(candidatesByCurrent.get(current.key) ?? []), { previous, identity }])
          candidatesByPrevious.set(previous.key, [...(candidatesByPrevious.get(previous.key) ?? []), current.key])
        }
      }
    }
  }

  const blockedCurrent = new Set<string>()
  const blockedPrevious = new Set<string>()
  for (const event of activeEvents) {
    if ((event.kind === 'MERGER' || event.kind === 'SPIN_OFF') && !event.comparable && event.toSecurityId) {
      for (const previous of previousPositions) for (const current of currentPositions) {
        if (previous.securityId === event.fromSecurityId && current.securityId === event.toSecurityId
          && exposureKey(previous) === exposureKey(current)) {
          blockedPrevious.add(previous.key)
          blockedCurrent.add(current.key)
        }
      }
    }
  }
  const pairsByCurrent = new Map<string, { previous: Position; identity: IdentityMatch }>()
  for (const [key, candidates] of candidatesByCurrent) {
    if (candidates.length !== 1 || candidatesByPrevious.get(candidates[0]!.previous.key)?.length !== 1) continue
    pairsByCurrent.set(key, candidates[0]!)
  }
  const hasNonComparableEvents = activeEvents.some(event => {
    if (event.kind === 'DELISTING' && !event.comparable) return previousPositions.some(position => position.securityId === event.fromSecurityId)
    if ((event.kind === 'MERGER' || event.kind === 'SPIN_OFF') && !event.comparable && event.toSecurityId) return previousPositions.some(previous =>
      previous.securityId === event.fromSecurityId && currentPositions.some(current => current.securityId === event.toSecurityId && exposureKey(current) === exposureKey(previous)))
    return false
  })
  return {
    pairsByCurrent,
    candidateCurrentKeys: new Set(candidatesByCurrent.keys()),
    candidatePreviousKeys: new Set(candidatesByPrevious.keys()),
    blockedCurrentKeys: blockedCurrent,
    blockedPreviousKeys: blockedPrevious,
    hasAmbiguousCandidates: [...candidatesByCurrent.values()].some(candidates => candidates.length !== 1)
      || [...candidatesByPrevious.values()].some(candidates => candidates.length !== 1),
    hasNonComparableEvents,
  }
}

function buildChanges(currentPositions: readonly Position[], previousPositions: readonly Position[], currentTotal: bigint, previousTotal: bigint, completeMappings: boolean, thresholds: GuruActionThresholds, identityEvents: readonly GuruSecurityIdentityEvent[], previousPeriod: string, currentPeriod: string): { changes: GuruPortfolioChange[]; pairing: PositionPairing } {
  const currentWeights = weights(currentPositions, currentTotal)
  const previousWeights = weights(previousPositions, previousTotal)
  const changes: GuruPortfolioChange[] = []
  const pairing = pairPositions(currentPositions, previousPositions, identityEvents, previousPeriod, currentPeriod)
  const pairedPrevious = new Set<string>()
  for (const current of currentPositions) {
    if (!current.securityId) continue
    const pair = pairing.pairsByCurrent.get(current.key)
    if (pair) {
      pairedPrevious.add(pair.previous.key)
      changes.push(comparePositions(current, pair.previous, pair.identity, currentWeights.get(current.key) ?? fraction(0n), previousWeights.get(pair.previous.key), thresholds))
    }
  }
  for (const current of currentPositions) {
    if (!current.securityId || pairing.pairsByCurrent.has(current.key) || pairing.candidateCurrentKeys.has(current.key)
      || pairing.blockedCurrentKeys.has(current.key) || !completeMappings) continue
    const transformed = previousPositions.some(previous => previous.securityId && exposureKey(previous) === exposureKey(current)
      && nonComparableTransition(previous.securityId, current.securityId!, previousPeriod, currentPeriod, identityEvents))
    if (!transformed) changes.push(comparePositions(current, undefined, undefined, currentWeights.get(current.key) ?? fraction(0n), undefined, thresholds))
  }
  if (completeMappings) {
    for (const previous of previousPositions) {
      if (!previous.securityId || pairedPrevious.has(previous.key) || pairing.candidatePreviousKeys.has(previous.key) || pairing.blockedPreviousKeys.has(previous.key)
        || delistedDuring(previous.securityId, previousPeriod, currentPeriod, identityEvents)) continue
      const transformed = currentPositions.some(current => current.securityId && exposureKey(current) === exposureKey(previous)
        && nonComparableTransition(previous.securityId!, current.securityId, previousPeriod, currentPeriod, identityEvents))
      if (transformed) continue
      changes.push({
        positionKey: previous.key, securityId: previous.securityId, ticker: previous.ticker, company: previous.company,
        quantityType: previous.quantityType, putCall: previous.putCall, action: 'EXIT',
        previousQuantity: formatDecimal(previous.quantity), currentQuantity: null,
        comparablePreviousQuantity: formatDecimal(previous.quantity),
        quantityChange: formatDecimal(-previous.quantity), quantityChangePercent: previous.quantity > 0n ? '-100' : null,
        quantityAdjustmentFactor: null, corporateActionEventIds: [],
        previousWeightPercent: previousTotal > 0n ? percent(fraction(previous.reportedValueUsd, previousTotal)) : '0',
        currentWeightPercent: null, weightChangePercentagePoints: previousTotal > 0n ? percent(fraction(-previous.reportedValueUsd, previousTotal)) : '0',
        previousRank: previous.rank, currentRank: null, rankChange: null,
        previousReportedValueUsd: formatDecimal(previous.reportedValueUsd), currentReportedValueUsd: null,
        reportedValueChangeUsd: formatDecimal(-previous.reportedValueUsd),
      })
    }
  }
  return { changes: changes.sort((left, right) => left.action.localeCompare(right.action) || left.positionKey.localeCompare(right.positionKey)), pairing }
}

function disclosedWeightTurnover(current: readonly Position[], previous: readonly Position[], currentTotal: bigint, previousTotal: bigint, pairing: PositionPairing): string | null {
  if (currentTotal === 0n || previousTotal === 0n) return null
  const pairedPrevious = new Set<string>()
  const currentByKey = new Map<string, Position>()
  const previousByKey = new Map<string, Position>()
  for (const position of current) currentByKey.set(position.key, position)
  for (const position of previous) previousByKey.set(position.key, position)
  for (const [currentKey, pair] of pairing.pairsByCurrent) {
    currentByKey.set(currentKey, current.find(position => position.key === currentKey)!)
    previousByKey.set(currentKey, pair.previous)
    if (pair.previous.key !== currentKey) pairedPrevious.add(pair.previous.key)
  }
  for (const key of pairedPrevious) previousByKey.delete(key)
  const keys = new Set([...currentByKey.keys(), ...previousByKey.keys()])
  let distance = fraction(0n)
  for (const key of keys) {
    const currentValue = currentByKey.get(key)?.reportedValueUsd ?? 0n
    const previousValue = previousByKey.get(key)?.reportedValueUsd ?? 0n
    distance = addFraction(distance, fraction(
      currentValue * previousTotal - previousValue * currentTotal < 0n
        ? -(currentValue * previousTotal - previousValue * currentTotal)
        : currentValue * previousTotal - previousValue * currentTotal,
      currentTotal * previousTotal,
    ))
  }
  return percent(fraction(distance.numerator, distance.denominator * 2n))
}

function turnoverBand(value: string | null): 'LOW' | 'MODERATE' | 'HIGH' | null {
  if (value === null) return null
  const decimal = parseDecimal(value)
  if (decimal < 10n * 10n ** BigInt(VALUE_SCALE)) return 'LOW'
  if (decimal < 30n * 10n ** BigInt(VALUE_SCALE)) return 'MODERATE'
  return 'HIGH'
}

export function calculateGuruPortfolioAnalytics(input: {
  current: GuruAnalyticsSnapshot
  previous?: GuruAnalyticsSnapshot
  thresholds?: GuruActionThresholds
  identityEvents?: readonly GuruSecurityIdentityEvent[]
}): GuruPortfolioAnalytics {
  const { current, previous } = input
  validatePeriodEnd(current.periodEnd)
  if (current.status !== 'READY') throw new Error('Current Guru portfolio snapshot must be READY')
  const thresholds = input.thresholds ?? DEFAULT_GURU_ACTION_THRESHOLDS
  const currentData = aggregate(current)
  const previousData = previous ? aggregate(previous) : undefined
  const completeCurrent = currentData.sourceRowCount === currentData.mappedRowCount
  const completePrevious = previousData ? previousData.sourceRowCount === previousData.mappedRowCount : false
  const adjacent = previous?.status === 'READY' && adjacentQuarter(previous.periodEnd, current.periodEnd)
  const pairing = adjacent && previousData ? pairPositions(currentData.positions, previousData.positions, input.identityEvents ?? [], previous.periodEnd, current.periodEnd) : undefined
  const comparisonStatus: GuruPortfolioAnalytics['comparisonStatus'] = !previous ? 'BASELINE'
    : previous.status !== 'READY' ? 'PREVIOUS_NOT_READY'
      : !adjacentQuarter(previous.periodEnd, current.periodEnd) ? 'NON_ADJACENT_QUARTER'
        : !completeCurrent || !completePrevious ? 'MAPPING_INCOMPLETE'
          : pairing?.hasAmbiguousCandidates || pairing?.hasNonComparableEvents ? 'CORPORATE_ACTION_INCOMPLETE' : 'COMPARABLE'
  const canCompare = comparisonStatus === 'COMPARABLE' || comparisonStatus === 'MAPPING_INCOMPLETE' || comparisonStatus === 'CORPORATE_ACTION_INCOMPLETE'
  const changeResult = canCompare ? buildChanges(currentData.positions, previousData!.positions, currentData.totalValue, previousData!.totalValue, completeCurrent && completePrevious, thresholds, input.identityEvents ?? [], previous!.periodEnd, current.periodEnd) : undefined
  const changes = changeResult?.changes ?? []
  const counts = emptyActionCounts()
  changes.forEach(change => { counts[change.action] += 1 })
  const sectors = allocation(currentData.positions, 'sector', currentData.totalValue)
  const industries = allocation(currentData.positions, 'industry', currentData.totalValue)
  const sortedPositions = currentData.positions
  const topSum = (count: number) => sortedPositions.slice(0, count).reduce((sum, position) => sum + position.reportedValueUsd, 0n)
  const concentration = (count: number) => currentData.totalValue > 0n ? percent(fraction(topSum(count), currentData.totalValue)) : '0'
  let hhi = fraction(0n)
  if (currentData.totalValue > 0n) for (const position of sortedPositions) {
    const weight = fraction(position.reportedValueUsd, currentData.totalValue)
    hhi = addFraction(hhi, multiplyFraction(weight, weight))
  }
  const topHoldings = sortedPositions.slice(0, 5).map(position => ({
    positionKey: position.key, securityId: position.securityId, ticker: position.ticker, company: position.company,
    quantityType: position.quantityType, putCall: position.putCall, quantity: formatDecimal(position.quantity),
    reportedValueUsd: formatDecimal(position.reportedValueUsd),
    weightPercent: currentData.totalValue > 0n ? percent(fraction(position.reportedValueUsd, currentData.totalValue)) : '0',
    rank: position.rank,
  }))
  let turnoverReason: GuruPortfolioAnalytics['turnoverUnavailableReason'] = null
  if (!previous) turnoverReason = 'BASELINE'
  else if (previous.status !== 'READY') turnoverReason = 'PREVIOUS_NOT_READY'
  else if (!adjacentQuarter(previous.periodEnd, current.periodEnd)) turnoverReason = 'NON_ADJACENT_QUARTER'
  else if (!completeCurrent || !completePrevious) turnoverReason = 'MAPPING_INCOMPLETE'
  else if (changeResult?.pairing.hasAmbiguousCandidates || changeResult?.pairing.hasNonComparableEvents) turnoverReason = 'CORPORATE_ACTION_INCOMPLETE'
  else if (currentData.totalValue === 0n || previousData!.totalValue === 0n) turnoverReason = 'ZERO_REPORTED_VALUE'
  const turnover = turnoverReason === null ? disclosedWeightTurnover(currentData.positions, previousData!.positions, currentData.totalValue, previousData!.totalValue, changeResult!.pairing) : null
  const addActions = changes.filter(change => change.action === 'NEW' || change.action === 'ADD' || change.action === 'STRONG_ADD')
    .sort((left, right) => {
      const leftWeight = parseDecimal(left.currentWeightPercent ?? '0')
      const rightWeight = parseDecimal(right.currentWeightPercent ?? '0')
      return leftWeight === rightWeight ? left.positionKey.localeCompare(right.positionKey) : rightWeight > leftWeight ? 1 : -1
    })
  const reduceActions = changes.filter(change => change.action === 'REDUCE' || change.action === 'STRONG_REDUCE' || change.action === 'EXIT')
    .sort((left, right) => {
      const leftWeight = parseDecimal(left.previousWeightPercent ?? '0')
      const rightWeight = parseDecimal(right.previousWeightPercent ?? '0')
      return leftWeight === rightWeight ? left.positionKey.localeCompare(right.positionKey) : rightWeight > leftWeight ? 1 : -1
    })
  return {
    version: GURU_PORTFOLIO_ANALYTICS_VERSION,
    periodEnd: current.periodEnd,
    comparisonStatus,
    portfolio: {
      reportedValueUsd: formatDecimal(currentData.totalValue),
      holdingCount: currentData.positions.length,
      sourceRowCount: currentData.sourceRowCount,
      mappedRowCount: currentData.mappedRowCount,
      mappingCoveragePercent: currentData.sourceRowCount === 0 ? '100' : roundRatio(BigInt(currentData.mappedRowCount) * 100n, BigInt(currentData.sourceRowCount)),
      topOneConcentrationPercent: concentration(1), topFiveConcentrationPercent: concentration(5),
      topTenConcentrationPercent: concentration(10), hhi: roundRatio(hhi.numerator * 10_000n, hhi.denominator, 4),
      largestPosition: topHoldings[0] ?? null,
      topHoldings,
      sectorAllocation: sectors.buckets, unclassifiedSector: sectors.residual,
      industryAllocation: industries.buckets, unclassifiedIndustry: industries.residual,
    },
    changes, actionCounts: counts, largestAdds: addActions.slice(0, 5), largestReductions: reduceActions.slice(0, 5),
    disclosedWeightTurnoverPercent: turnover, turnoverBand: turnoverBand(turnover), turnoverUnavailableReason: turnoverReason,
  }
}
