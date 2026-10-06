export const GURU_CONSENSUS_VERSION = 'guru-consensus-v1'

export type GuruConsensusAction = 'NEW' | 'STRONG_ADD' | 'ADD' | 'UNCHANGED' | 'REDUCE' | 'STRONG_REDUCE' | 'EXIT'
export type GuruConsensusStatus = 'READY' | 'PARTIAL' | 'ERROR' | 'SUPERSEDED' | 'PENDING' | 'NO_FILING'
export type GuruConsensusDimension = 'SECTOR' | 'INDUSTRY' | 'THEME'

export interface GuruConsensusTheme {
  key: string
  name: string
}

export interface GuruConsensusHolding {
  securityId: string
  ticker: string | null
  company: string
  securityType: string
  sector: string | null
  industry: string | null
  quantityType: 'SH' | 'PRN'
  putCall: 'PUT' | 'CALL' | null
  quantity: string
  reportedValue: string
  reportedValueUnit: 'USD' | 'THOUSANDS_USD'
  themes: readonly GuruConsensusTheme[]
}

export interface GuruConsensusChange {
  securityId: string
  action: GuruConsensusAction
  quantityType: 'SH' | 'PRN'
  putCall: 'PUT' | 'CALL' | null
  quantityChangePercent: string | null
  sector: string | null
  industry: string | null
  themes: readonly GuruConsensusTheme[]
}

export interface GuruConsensusManager {
  managerId: string
  status: GuruConsensusStatus
  sourceRowCount: number
  mappedRowCount: number
  comparisonStatus: string | null
  reportedPortfolioValueUsd: string | null
  previousReportedPortfolioValueUsd: string | null
  holdings: readonly GuruConsensusHolding[]
  previousReady: boolean
  previousHoldings: readonly GuruConsensusHolding[]
  changes: readonly GuruConsensusChange[]
}

export interface GuruConsensusStock {
  securityId: string
  ticker: string | null
  company: string
  sector: string | null
  industry: string | null
  currentHolderCount: number
  comparableCurrentHolderCount: number
  previousHolderCount: number
  holderCountChange: number
  newBuyerCount: number
  addCount: number
  unchangedCount: number
  reduceCount: number
  exitCount: number
  netBuyerCount: number
  actionManagerCount: number
  quantityChangeSampleCount: number
  averageQuantityChangePercent: string | null
  medianQuantityChangePercent: string | null
  aggregateWeightPercent: string
  averagePortfolioWeightPercent: string | null
  weightBreadthPercent: string
  classification: 'ACCUMULATION' | 'NEUTRAL' | 'DISTRIBUTION' | null
  quarterTrend: 'RISING' | 'STABLE' | 'FALLING' | 'UNAVAILABLE'
}

export interface GuruConsensusGroup {
  dimension: GuruConsensusDimension
  dimensionKey: string
  name: string
  currentHolderCount: number
  buyerCount: number
  sellerCount: number
  newPositionCount: number
  exitCount: number
  addCount: number
  reduceCount: number
  allocationManagerCount: number
  aggregateWeightPercent: string
  comparableCurrentAggregateWeightPercent: string
  previousAggregateWeightPercent: string | null
  aggregateWeightChangePoints: string | null
  holderBreadthPercent: string
  allocationCoveragePercent: string
  direction: 'INCREASING' | 'STABLE' | 'REDUCING' | null
}

export interface GuruConsensusSnapshot {
  version: typeof GURU_CONSENSUS_VERSION
  periodEnd: string
  themeMappingHash: string
  cohort: {
    activeManagerCount: number
    readyManagerCount: number
    partialManagerCount: number
    errorManagerCount: number
    supersededManagerCount: number
    pendingManagerCount: number
    noFilingManagerCount: number
    comparableManagerCount: number
    sourceRowCount: number
    mappedRowCount: number
    mappingCoveragePercent: string | null
  }
  stocks: GuruConsensusStock[]
  groups: GuruConsensusGroup[]
}

const SCALE = 100_000_000n
const SCALE_TEXT = 8

function decimalToScaled(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(value)
  if (!match) throw new Error('GURU_CONSENSUS_INVALID_DECIMAL')
  const fraction = (match[3] ?? '').padEnd(SCALE_TEXT, '0')
  const magnitude = BigInt(match[2]!) * SCALE + BigInt(fraction || '0')
  return match[1] === '-' ? -magnitude : magnitude
}

function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('GURU_CONSENSUS_INVALID_DENOMINATOR')
  const sign = numerator < 0n ? -1n : 1n
  const absolute = numerator < 0n ? -numerator : numerator
  return sign * ((absolute + denominator / 2n) / denominator)
}

function scaledToDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const whole = absolute / SCALE
  const fraction = (absolute % SCALE).toString().padStart(SCALE_TEXT, '0').replace(/0+$/, '')
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`
}

function normalizeReportedValue(value: string, unit: 'USD' | 'THOUSANDS_USD'): bigint {
  const scaled = decimalToScaled(value)
  return unit === 'THOUSANDS_USD' ? scaled * 1_000n : scaled
}

function percentage(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) return 0n
  return roundRatio(numerator * 100n * SCALE, denominator)
}

function ratioPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0'
  return scaledToDecimal(roundRatio(BigInt(numerator) * 100n * SCALE, BigInt(denominator)))
}

function mean(values: readonly bigint[]): string | null {
  return values.length ? scaledToDecimal(roundRatio(values.reduce((sum, value) => sum + value, 0n), BigInt(values.length))) : null
}

function median(values: readonly bigint[]): string | null {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  const middle = Math.floor(sorted.length / 2)
  return scaledToDecimal(sorted.length % 2 ? sorted[middle]! : roundRatio(sorted[middle - 1]! + sorted[middle]!, 2n))
}

function isStockShare(holding: Pick<GuruConsensusHolding, 'quantityType' | 'putCall'>): boolean {
  return holding.quantityType === 'SH' && holding.putCall === null
}

interface AggregatedPosition {
  securityId: string
  ticker: string | null
  company: string
  sector: string | null
  industry: string | null
  valueUsd: bigint
  weightPercent: bigint
  themes: GuruConsensusTheme[]
}

function aggregatePositions(holdings: readonly GuruConsensusHolding[], portfolioValue: string | null): Map<string, AggregatedPosition> {
  const values = new Map<string, AggregatedPosition>()
  const denominator = portfolioValue === null ? 0n : decimalToScaled(portfolioValue)
  for (const holding of holdings) {
    if (!isStockShare(holding)) continue
    const value = normalizeReportedValue(holding.reportedValue, holding.reportedValueUnit)
    const existing = values.get(holding.securityId)
    if (existing) {
      existing.valueUsd += value
      existing.themes = [...new Map([...existing.themes, ...holding.themes].map(theme => [theme.key, theme])).values()]
      if (!existing.ticker && holding.ticker) existing.ticker = holding.ticker
      if (!existing.sector && holding.sector) existing.sector = holding.sector
      if (!existing.industry && holding.industry) existing.industry = holding.industry
      continue
    }
    values.set(holding.securityId, {
      securityId: holding.securityId,
      ticker: holding.ticker,
      company: holding.company,
      sector: holding.sector?.trim() || null,
      industry: holding.industry?.trim() || null,
      valueUsd: value,
      weightPercent: denominator > 0n ? percentage(value, denominator) : 0n,
      themes: [...new Map(holding.themes.map(theme => [theme.key, theme])).values()].sort((a, b) => a.key.localeCompare(b.key)),
    })
  }
  if (denominator > 0n) for (const position of values.values()) position.weightPercent = percentage(position.valueUsd, denominator)
  return values
}

const BUY_ACTIONS = new Set<GuruConsensusAction>(['NEW', 'ADD', 'STRONG_ADD'])
const SELL_ACTIONS = new Set<GuruConsensusAction>(['REDUCE', 'STRONG_REDUCE', 'EXIT'])
const COMPARABLE_STATUSES = new Set(['COMPARABLE', 'MAPPING_INCOMPLETE', 'CORPORATE_ACTION_INCOMPLETE'])

interface ActionAggregate {
  newBuyerCount: number
  addCount: number
  unchangedCount: number
  reduceCount: number
  exitCount: number
  managerIds: Set<string>
  buyerManagerIds: Set<string>
  sellerManagerIds: Set<string>
  percentages: bigint[]
}

function emptyActionAggregate(): ActionAggregate {
  return { newBuyerCount: 0, addCount: 0, unchangedCount: 0, reduceCount: 0, exitCount: 0, managerIds: new Set(), buyerManagerIds: new Set(), sellerManagerIds: new Set(), percentages: [] }
}

export function calculateGuruConsensusSnapshot(input: {
  periodEnd: string
  themeMappingHash: string
  managers: readonly GuruConsensusManager[]
}): GuruConsensusSnapshot {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) throw new Error('GURU_CONSENSUS_INVALID_PERIOD')
  if (!/^[a-f0-9]{64}$/.test(input.themeMappingHash)) throw new Error('GURU_CONSENSUS_INVALID_THEME_HASH')
  const managerIds = new Set(input.managers.map(manager => manager.managerId))
  if (managerIds.size !== input.managers.length) throw new Error('GURU_CONSENSUS_DUPLICATE_MANAGER')
  const managers = [...input.managers].sort((a, b) => a.managerId.localeCompare(b.managerId))
  const ready = managers.filter(manager => manager.status === 'READY')
  const comparable = ready.filter(manager => manager.previousReady && manager.comparisonStatus !== null && COMPARABLE_STATUSES.has(manager.comparisonStatus))
  const totalSourceRows = ready.reduce((sum, manager) => sum + manager.sourceRowCount, 0)
  const totalMappedRows = ready.reduce((sum, manager) => sum + manager.mappedRowCount, 0)

  const currentByManager = new Map<string, Map<string, AggregatedPosition>>()
  const previousByManager = new Map<string, Map<string, AggregatedPosition>>()
  const stockKeys = new Set<string>()
  const stockMeta = new Map<string, AggregatedPosition>()
  for (const manager of ready) {
    const current = aggregatePositions(manager.holdings, manager.reportedPortfolioValueUsd)
    currentByManager.set(manager.managerId, current)
    if (manager.previousReady) previousByManager.set(manager.managerId, aggregatePositions(manager.previousHoldings, manager.previousReportedPortfolioValueUsd))
    for (const [securityId, position] of current) {
      stockKeys.add(securityId)
      stockMeta.set(securityId, stockMeta.get(securityId) ?? position)
    }
  }

  const stockActions = new Map<string, ActionAggregate>()
  const groupedActions = new Map<string, Map<string, GuruConsensusChange>>()
  const sectorActions = new Map<string, Map<string, ActionAggregate>>()
  const groups = new Map<string, {
    dimension: GuruConsensusDimension
    key: string
    name: string
    holderIds: Set<string>
    buyerIds: Set<string>
    sellerIds: Set<string>
    currentWeight: bigint
    comparableCurrentWeight: bigint
    previousWeight: bigint
    hasPrevious: boolean
    allocationManagerIds: Set<string>
    newPositionCount: number
    exitCount: number
    addCount: number
    reduceCount: number
  }>()

  const ensureGroup = (dimension: GuruConsensusDimension, key: string, name: string) => {
    const id = `${dimension}:${key}`
    let group = groups.get(id)
    if (!group) {
      group = { dimension, key, name, holderIds: new Set(), buyerIds: new Set(), sellerIds: new Set(), currentWeight: 0n, comparableCurrentWeight: 0n, previousWeight: 0n, hasPrevious: false, allocationManagerIds: new Set(), newPositionCount: 0, exitCount: 0, addCount: 0, reduceCount: 0 }
      groups.set(id, group)
    }
    return group
  }

  function categoryKeys(position: AggregatedPosition) {
    const dimensions: Array<{ dimension: GuruConsensusDimension; key: string; name: string }> = [
      { dimension: 'SECTOR', key: position.sector ?? 'unclassified', name: position.sector ?? 'Unclassified' },
      { dimension: 'INDUSTRY', key: position.industry ?? 'unclassified', name: position.industry ?? 'Unclassified' },
      ...position.themes.map(theme => ({ dimension: 'THEME' as const, key: theme.key, name: theme.name })),
    ]
    return dimensions
  }

  for (const manager of ready) {
    const current = currentByManager.get(manager.managerId)!
    const previous = previousByManager.get(manager.managerId)
    for (const position of current.values()) {
      for (const entry of categoryKeys(position)) {
        const group = ensureGroup(entry.dimension, entry.key, entry.name)
        group.holderIds.add(manager.managerId)
        group.currentWeight += position.weightPercent
        if (previous && manager.comparisonStatus !== null && COMPARABLE_STATUSES.has(manager.comparisonStatus)) {
          group.comparableCurrentWeight += position.weightPercent
          group.allocationManagerIds.add(manager.managerId)
          group.hasPrevious = true
        }
      }
    }
    if (previous && manager.comparisonStatus !== null && COMPARABLE_STATUSES.has(manager.comparisonStatus)) {
      for (const position of previous.values()) for (const entry of categoryKeys(position)) {
        const group = ensureGroup(entry.dimension, entry.key, entry.name)
        group.previousWeight += position.weightPercent
        group.allocationManagerIds.add(manager.managerId)
        group.hasPrevious = true
      }
    }
    const perSecurity = new Map<string, GuruConsensusChange>()
    for (const change of manager.changes) {
      if (change.quantityType !== 'SH' || change.putCall !== null) continue
      const existing = perSecurity.get(change.securityId)
      if (existing && existing.action !== change.action) throw new Error('GURU_CONSENSUS_DUPLICATE_STOCK_ACTION')
      if (!existing) perSecurity.set(change.securityId, change)
    }
    groupedActions.set(manager.managerId, perSecurity)
    for (const [securityId, change] of perSecurity) {
      stockKeys.add(securityId)
      const actionAggregate = stockActions.get(securityId) ?? emptyActionAggregate()
      actionAggregate.managerIds.add(manager.managerId)
      if (change.quantityChangePercent !== null) actionAggregate.percentages.push(decimalToScaled(change.quantityChangePercent))
      if (change.action === 'NEW') actionAggregate.newBuyerCount += 1
      else if (change.action === 'ADD' || change.action === 'STRONG_ADD') actionAggregate.addCount += 1
      else if (change.action === 'UNCHANGED') actionAggregate.unchangedCount += 1
      else if (change.action === 'REDUCE' || change.action === 'STRONG_REDUCE') actionAggregate.reduceCount += 1
      else actionAggregate.exitCount += 1
      if (BUY_ACTIONS.has(change.action)) actionAggregate.buyerManagerIds.add(manager.managerId)
      if (SELL_ACTIONS.has(change.action)) actionAggregate.sellerManagerIds.add(manager.managerId)
      stockActions.set(securityId, actionAggregate)

      const meta = stockMeta.get(securityId)
      const positionForGroup: AggregatedPosition = meta ?? {
        securityId, ticker: null, company: securityId, sector: change.sector?.trim() || null,
        industry: change.industry?.trim() || null, valueUsd: 0n, weightPercent: 0n,
        themes: [...change.themes].sort((a, b) => a.key.localeCompare(b.key)),
      }
      stockMeta.set(securityId, positionForGroup)
      for (const entry of categoryKeys(positionForGroup)) {
        const group = ensureGroup(entry.dimension, entry.key, entry.name)
        const actionByManager = sectorActions.get(`${entry.dimension}:${entry.key}`) ?? new Map<string, ActionAggregate>()
        const aggregate = actionByManager.get(manager.managerId) ?? emptyActionAggregate()
        if (BUY_ACTIONS.has(change.action)) aggregate.buyerManagerIds.add(manager.managerId)
        if (SELL_ACTIONS.has(change.action)) aggregate.sellerManagerIds.add(manager.managerId)
        if (change.action === 'NEW') { aggregate.newBuyerCount += 1; group.newPositionCount += 1 }
        else if (change.action === 'ADD' || change.action === 'STRONG_ADD') { aggregate.addCount += 1; group.addCount += 1 }
        else if (change.action === 'REDUCE' || change.action === 'STRONG_REDUCE') { aggregate.reduceCount += 1; group.reduceCount += 1 }
        else if (change.action === 'EXIT') { aggregate.exitCount += 1; group.exitCount += 1 }
        actionByManager.set(manager.managerId, aggregate)
        sectorActions.set(`${entry.dimension}:${entry.key}`, actionByManager)
      }
    }
  }

  const stockRows = [...stockKeys].map(securityId => {
    const meta = stockMeta.get(securityId)!
    const actions = stockActions.get(securityId) ?? emptyActionAggregate()
    const currentHolderCount = ready.filter(manager => currentByManager.get(manager.managerId)!.has(securityId)).length
    const comparableCurrentHolderCount = comparable.filter(manager => currentByManager.get(manager.managerId)!.has(securityId)).length
    const previousHolderCount = comparable.filter(manager => previousByManager.get(manager.managerId)?.has(securityId) ?? false).length
    const holderCountChange = comparableCurrentHolderCount - previousHolderCount
    const weights = ready.flatMap(manager => {
      const position = currentByManager.get(manager.managerId)!.get(securityId)
      return position ? [position.weightPercent] : []
    })
    const aggregateWeight = weights.reduce((sum, weight) => sum + weight, 0n)
    const netBuyerCount = actions.newBuyerCount + actions.addCount - actions.reduceCount - actions.exitCount
    const classification: GuruConsensusStock['classification'] = actions.managerIds.size === 0 ? null : netBuyerCount > 0 ? 'ACCUMULATION' : netBuyerCount < 0 ? 'DISTRIBUTION' : 'NEUTRAL'
    const quarterTrend: GuruConsensusStock['quarterTrend'] = comparable.length === 0 ? 'UNAVAILABLE' : holderCountChange > 0 ? 'RISING' : holderCountChange < 0 ? 'FALLING' : 'STABLE'
    return {
      securityId,
      ticker: meta.ticker,
      company: meta.company,
      sector: meta.sector,
      industry: meta.industry,
      currentHolderCount,
      comparableCurrentHolderCount,
      previousHolderCount,
      holderCountChange,
      newBuyerCount: actions.newBuyerCount,
      addCount: actions.addCount,
      unchangedCount: actions.unchangedCount,
      reduceCount: actions.reduceCount,
      exitCount: actions.exitCount,
      netBuyerCount,
      actionManagerCount: actions.managerIds.size,
      quantityChangeSampleCount: actions.percentages.length,
      averageQuantityChangePercent: mean(actions.percentages),
      medianQuantityChangePercent: median(actions.percentages),
      aggregateWeightPercent: scaledToDecimal(aggregateWeight),
      averagePortfolioWeightPercent: weights.length ? scaledToDecimal(roundRatio(aggregateWeight, BigInt(weights.length))) : null,
      weightBreadthPercent: ratioPercent(currentHolderCount, ready.length),
      classification,
      quarterTrend,
    }
  }).sort((a, b) => b.currentHolderCount - a.currentHolderCount || a.securityId.localeCompare(b.securityId))

  const groupRows: GuruConsensusGroup[] = [...groups.values()].map(group => {
    const actionManagers = sectorActions.get(`${group.dimension}:${group.key}`) ?? new Map<string, ActionAggregate>()
    const buyerIds = new Set([...actionManagers.values()].flatMap(action => [...action.buyerManagerIds]))
    const sellerIds = new Set([...actionManagers.values()].flatMap(action => [...action.sellerManagerIds]))
    const previousWeight = comparable.length ? group.previousWeight : 0n
    const hasComparison = comparable.length > 0
    const direction: GuruConsensusGroup['direction'] = actionManagers.size === 0 ? null : buyerIds.size > sellerIds.size ? 'INCREASING' : buyerIds.size < sellerIds.size ? 'REDUCING' : 'STABLE'
    return {
      dimension: group.dimension,
      dimensionKey: group.key,
      name: group.name,
      currentHolderCount: group.holderIds.size,
      buyerCount: buyerIds.size,
      sellerCount: sellerIds.size,
      newPositionCount: group.newPositionCount,
      exitCount: group.exitCount,
      addCount: group.addCount,
      reduceCount: group.reduceCount,
      allocationManagerCount: group.allocationManagerIds.size,
      aggregateWeightPercent: scaledToDecimal(group.currentWeight),
      comparableCurrentAggregateWeightPercent: scaledToDecimal(group.comparableCurrentWeight),
      previousAggregateWeightPercent: hasComparison ? scaledToDecimal(previousWeight) : null,
      aggregateWeightChangePoints: hasComparison ? scaledToDecimal(group.comparableCurrentWeight - previousWeight) : null,
      holderBreadthPercent: ratioPercent(group.holderIds.size, ready.length),
      allocationCoveragePercent: ratioPercent(group.allocationManagerIds.size, managers.length),
      direction,
    }
  }).sort((a, b) => a.dimension.localeCompare(b.dimension) || a.name.localeCompare(b.name) || a.dimensionKey.localeCompare(b.dimensionKey))

  const sourceRowCount = totalSourceRows
  const mappedRowCount = totalMappedRows
  return {
    version: GURU_CONSENSUS_VERSION,
    periodEnd: input.periodEnd,
    themeMappingHash: input.themeMappingHash,
    cohort: {
      activeManagerCount: managers.length,
      readyManagerCount: managers.filter(manager => manager.status === 'READY').length,
      partialManagerCount: managers.filter(manager => manager.status === 'PARTIAL').length,
      errorManagerCount: managers.filter(manager => manager.status === 'ERROR').length,
      supersededManagerCount: managers.filter(manager => manager.status === 'SUPERSEDED').length,
      pendingManagerCount: managers.filter(manager => manager.status === 'PENDING').length,
      noFilingManagerCount: managers.filter(manager => manager.status === 'NO_FILING').length,
      comparableManagerCount: comparable.length,
      sourceRowCount,
      mappedRowCount,
    mappingCoveragePercent: sourceRowCount === 0 ? null : ratioPercent(mappedRowCount, sourceRowCount),
    },
    stocks: stockRows,
    groups: groupRows,
  }
}
