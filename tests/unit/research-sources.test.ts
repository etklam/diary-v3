import { describe, expect, it, vi } from 'vitest'
import { createMarketData, type CompleteDailyResearchBar, type YahooUpstream } from '../../apps/api/src/market-data/index'
import { collectOfficialResearchSources, createYahooResearchEvidenceProvider, createTavilySearchProvider, createVerifiedUsEquityCalendarProvider, type CompleteResearchMarket, type OfficialResearchMetadata, type ResearchCalendarSnapshot } from '../../apps/api/src/research-studio/sources'
import { createSourceFetcher, type SourceFetchResponse } from '../../apps/api/src/research-studio/source-fetcher'
import { assertSourceOperation, createSourcePolicy, sourceOperationDecision, sourceOperationsAreVerifiedAllowed, sourceRecordsAreVerifiedAllowed, sourcePolicyToRecord, sourceUseFromPolicy, type ResearchSourcePurpose } from '../../apps/api/src/research-studio/source-policy'

const allAllowedPolicy = (sourceId = 'YAHOO_CHART') => createSourcePolicy({
  sourceId,
  provider: 'controlled fixture',
  scope: 'Synthetic rows only',
  basisUrl: 'https://example.test/terms',
  checkedAt: '2026-09-24T17:41:21.300Z',
  conditions: ['fixture'],
  decisions: Object.fromEntries((['automated_fetch', 'evidence_storage', 'llm_inference', 'publication_of_analysis_and_excerpts', 'raw_data_redistribution'] as ResearchSourcePurpose[]).map(purpose => [purpose, 'allowed'])),
})

function rows(symbol: string): CompleteDailyResearchBar[] {
  return ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].map((date, index) => {
    return {
      symbol, date, open: 99 + index, high: 101 + index, low: 98 + index, close: 100 + index, adjustedClose: index === 2 ? null : 100 + index,
      volume: index === 3 ? null : 1_000 + index, priceSourceId: 'YAHOO_CHART', volumeSourceId: index === 3 ? null : 'YAHOO_CHART',
      adjustmentBasis: index === 2 ? 'unavailable' : 'total_return_rebased', volumeBasis: index === 3 ? 'unavailable' : 'raw', session: 'regular', dataAsOf: `${date}T21:00:00.000Z`, retrievedAt: '2026-01-10T00:00:00.000Z',
    }
  })
}

function longerRows(symbol: string, count: number, endDate: string): CompleteDailyResearchBar[] {
  const dates: string[] = []
  const cursor = new Date(`${endDate}T00:00:00.000Z`)
  while (dates.length < count) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return dates.reverse().map((date, index) => {
    const close = 100 + index * 0.05
    return { symbol, date, open: close - 0.2, high: close + 1, low: close - 1, close, adjustedClose: close, volume: 1_000_000 + index, priceSourceId: 'YAHOO_CHART', volumeSourceId: 'YAHOO_CHART', adjustmentBasis: 'total_return_rebased', volumeBasis: 'raw', session: 'regular', dataAsOf: `${date}T21:00:00.000Z`, retrievedAt: '2026-01-08T23:05:00.000Z' }
  })
}

function fixtureCalendar({ fromDate, toDate, asOf }: { fromDate: string; toDate: string; asOf: Date }): ResearchCalendarSnapshot {
  const sessions = []
  for (let date = new Date(`${fromDate}T00:00:00Z`), end = new Date(`${toDate}T00:00:00Z`); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.getUTCDay()
    if (day === 0 || day === 6) continue
    const dateKey = date.toISOString().slice(0, 10)
    const closeAt = `${dateKey}T21:00:00.000Z`
    sessions.push({ date: dateKey, closeAt, isCompleted: Date.parse(closeAt) <= asOf.getTime(), isWeekFinal: day === 5, timezone: 'America/New_York', sourceId: 'SYNTHETIC_CALENDAR' as const })
  }
  return { sourceId: 'SYNTHETIC_CALENDAR', version: 'synthetic-calendar-v1', verifiedAt: '2026-01-01T00:00:00.000Z', coverageStart: fromDate, coverageEnd: toDate, basisUrl: 'https://example.test/calendar', sessions, synthetic: true }
}

describe('source policy', () => {
  it('keeps each purpose decision independent and never maps raw redistribution to publication', () => {
    const policy = createSourcePolicy({
      sourceId: 'SOURCE_A', provider: 'fixture', scope: 'test', basisUrl: 'https://example.test/policy', checkedAt: '2026-01-01T00:00:00Z', conditions: [],
      decisions: { automated_fetch: 'allowed', evidence_storage: 'allowed', llm_inference: 'restricted', publication_of_analysis_and_excerpts: 'allowed', raw_data_redistribution: 'unknown' },
    })
    expect(sourceOperationDecision(policy, 'automated_fetch')).toBe('allowed')
    expect(sourceOperationDecision(policy, 'raw_data_redistribution')).toBe('unknown')
    const use = sourceUseFromPolicy(policy)
    expect(use.publicationOfAnalysisAndExcerpts.status).toBe('allowed')
    expect(use.rawDataRedistribution.status).toBe('unknown')
    const record = sourcePolicyToRecord(policy)
    expect(record.retrievedAt).toBeNull()
    expect(record.limitations.some(value => value.includes('raw_data_redistribution: unknown'))).toBe(true)
  })

  it('requires an allowed decision to have a nonblank basis and valid check timestamp', () => {
    expect(() => assertSourceOperation({ ...allAllowedPolicy(), basisUrl: null }, 'automated_fetch')).toThrow(/missing a valid HTTPS policy basis/u)
    expect(() => assertSourceOperation({ ...allAllowedPolicy(), checkedAt: 'not-a-time' }, 'evidence_storage')).toThrow(/valid ISO check timestamp/u)
    expect(() => assertSourceOperation({ ...allAllowedPolicy(), basisUrl: 'http://example.test/terms' }, 'automated_fetch')).toThrow(/valid HTTPS policy basis/u)
    expect(() => assertSourceOperation({ ...allAllowedPolicy(), checkedAt: '2026-02-30T00:00:00Z' }, 'evidence_storage')).toThrow(/valid ISO check timestamp/u)
  })

  it('treats a status-only allowed operation as unknown in source records', () => {
    const policy = {
      ...allAllowedPolicy('STATUS_ONLY'),
      permissions: { llm_inference: { status: 'allowed' as const, conditions: [], basis: null, checkedAt: null } },
    }
    expect(sourceUseFromPolicy(policy).llmInference).toMatchObject({ status: 'unknown', basis: null, checkedAt: null })
    expect(() => assertSourceOperation(policy, 'llm_inference')).toThrow(/missing a valid HTTPS policy basis/u)
  })

  it.each([
    { basis: null, checkedAt: '2026-01-01T00:00:00.000Z' },
    { basis: 'javascript:alert(1)', checkedAt: '2026-01-01T00:00:00.000Z' },
    { basis: 'https://example.test/policy', checkedAt: '2026-02-30T00:00:00Z' },
    { basis: null, checkedAt: null },
  ])('blocks generation unless every inference operation has valid evidence', permission => {
    const use = sourceUseFromPolicy(allAllowedPolicy('GENERATION_POLICY_FIXTURE'))
    const malformedUse = { ...use, llmInference: { ...use.llmInference, status: 'allowed' as const, ...permission } }
    expect(sourceOperationsAreVerifiedAllowed(use, ['automated_fetch', 'evidence_storage', 'llm_inference'])).toBe(true)
    expect(sourceOperationsAreVerifiedAllowed(malformedUse, ['automated_fetch', 'evidence_storage', 'llm_inference'])).toBe(false)
  })

  it.each([
    ['automated_fetch', 'automatedFetch'],
    ['evidence_storage', 'evidenceStorage'],
    ['llm_inference', 'llmInference'],
  ] as const)('requires valid permission evidence for %s before generation', (_purpose, key) => {
    const use = sourceUseFromPolicy(allAllowedPolicy('GENERATION_POLICY_FIXTURE'))
    const malformedUse = { ...use, [key]: { ...use[key], checkedAt: null } }
    expect(sourceOperationsAreVerifiedAllowed(malformedUse, ['automated_fetch', 'evidence_storage', 'llm_inference'])).toBe(false)
  })

  it('keeps raw-data redistribution independent from generation and publication permissions', () => {
    const use = sourceUseFromPolicy({
      ...allAllowedPolicy('INDEPENDENT_OPERATIONS'),
      decisions: { ...allAllowedPolicy('INDEPENDENT_OPERATIONS').decisions, raw_data_redistribution: 'restricted' },
    })
    expect(sourceOperationsAreVerifiedAllowed(use, ['automated_fetch', 'evidence_storage', 'llm_inference', 'publication_of_analysis_and_excerpts'])).toBe(true)
    expect(sourceOperationsAreVerifiedAllowed(use, ['raw_data_redistribution'])).toBe(false)
  })

  it('requires nonempty source records and verified evidence for every operation', () => {
    const record = sourcePolicyToRecord(allAllowedPolicy('VERIFIED_SOURCE'))
    const statusOnly = structuredClone(record)
    statusOnly.use.llmInference = { ...statusOnly.use.llmInference, status: 'allowed', basis: null, checkedAt: null }
    const invalidTimestamp = structuredClone(record)
    invalidTimestamp.use.llmInference = { ...invalidTimestamp.use.llmInference, checkedAt: '2026-02-30T00:00:00Z' }

    expect(sourceRecordsAreVerifiedAllowed([], ['automated_fetch', 'evidence_storage', 'llm_inference'])).toBe(false)
    expect(sourceRecordsAreVerifiedAllowed([record], ['automated_fetch', 'evidence_storage', 'llm_inference'])).toBe(true)
    expect(sourceRecordsAreVerifiedAllowed([statusOnly], ['automated_fetch', 'evidence_storage', 'llm_inference'])).toBe(false)
    expect(sourceRecordsAreVerifiedAllowed([invalidTimestamp], ['automated_fetch', 'evidence_storage', 'llm_inference'])).toBe(false)

  })
})

describe('Tavily search adapter', () => {
  it('returns SEARCH_NOT_CONFIGURED without invoking transport when the key is absent', async () => {
    const transport = vi.fn()
    const provider = createTavilySearchProvider({ fetcher: createSourceFetcher({ transport }) })
    await expect(provider.search('semiconductor')).resolves.toMatchObject({ status: 'SEARCH_NOT_CONFIGURED', results: [] })
    expect(transport).not.toHaveBeenCalled()
  })

  it('returns SEARCH_BUDGET_NOT_CONFIGURED before reservation when the durable budget is absent', async () => {
    const transport = vi.fn()
    const reserve = vi.fn(() => true)
    const provider = createTavilySearchProvider({ apiKey: 'fixture-key', fetcher: createSourceFetcher({ transport }), budget: { isConfigured: () => false, reserve } })
    await expect(provider.search('SOXX events')).resolves.toMatchObject({ status: 'SEARCH_BUDGET_NOT_CONFIGURED', results: [] })
    expect(reserve).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  })

  it('sends the bounded basic search request with bearer auth and preserves discovery snippets', async () => {
    let requestBody = ''
    let requestHeaders: Readonly<Record<string, string>> = {}
    const reserve = vi.fn(() => 'reservation-1')
    const settle = vi.fn()
    const transport = vi.fn(async request => {
      requestBody = request.body ?? ''
      requestHeaders = request.headers ?? {}
      const response: SourceFetchResponse = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ results: [{ title: 'Example', url: 'https://example.test/story', content: 'lead only', score: 0.8, published_date: '2026-01-01' }], usage: { credits: 1 } }), retrievedAt: '2026-01-01T00:00:00.000Z' }
      return response
    })
    const provider = createTavilySearchProvider({ apiKey: 'fixture-key', policy: createSourcePolicy({ ...allAllowedPolicy('TAVILY_SEARCH') }), fetcher: createSourceFetcher({ transport }), budget: { isConfigured: () => true, reserve, settle } })
    const result = await provider.search('  SOXX catalyst  ')
    expect(result.status).toBe('READY')
    expect(result.results[0]).toMatchObject({ title: 'Example', snippet: 'lead only' })
    expect(requestHeaders.Authorization).toBe('Bearer fixture-key')
    expect(JSON.parse(requestBody)).toMatchObject({ search_depth: 'basic', max_results: 5, auto_parameters: false, include_answer: false, include_raw_content: false, include_images: false, include_usage: true })
    expect(reserve).toHaveBeenCalledWith({ provider: 'tavily', query: 'SOXX catalyst', maxCallsPerRun: 3, maxCreditsPerCall: 1, maxResults: 5 })
    expect(settle).toHaveBeenCalledWith({ provider: 'tavily', query: 'SOXX catalyst', success: true, returnedResults: 1, billedCredits: 1, reservationId: 'reservation-1' })
  })

  it('allows discovery on fetch/storage rights while leaving unknown model permission for generation admission', async () => {
    const transport = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ results: [] }), retrievedAt: '2026-01-01T00:00:00.000Z' }))
    const policy = createSourcePolicy({
      sourceId: 'TAVILY_SEARCH', provider: 'fixture search', scope: 'Discovery metadata only', basisUrl: 'https://example.test/policy', checkedAt: '2026-01-01T00:00:00.000Z', conditions: [],
      decisions: { automated_fetch: 'allowed', evidence_storage: 'allowed', llm_inference: 'unknown', publication_of_analysis_and_excerpts: 'unknown', raw_data_redistribution: 'unknown' },
    })
    const provider = createTavilySearchProvider({ apiKey: 'fixture-key', policy, fetcher: createSourceFetcher({ transport }), budget: { isConfigured: () => true, reserve: () => true } })
    await expect(provider.search('SOXX events')).resolves.toMatchObject({ status: 'READY' })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(sourceUseFromPolicy(policy).llmInference.status).toBe('unknown')
    expect(() => assertSourceOperation(policy, 'llm_inference')).toThrow(/no verified permission/u)
  })

  it('stops before transport after the explicit call cap', async () => {
    const transport = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ results: [] }), retrievedAt: '2026-01-01T00:00:00.000Z' }))
    const provider = createTavilySearchProvider({ apiKey: 'fixture-key', maxCalls: 1, policy: allAllowedPolicy('TAVILY_SEARCH'), fetcher: createSourceFetcher({ transport }), budget: { reserve: () => true } })
    await provider.search('one')
    await expect(provider.search('two')).resolves.toMatchObject({ status: 'SEARCH_QUOTA_EXCEEDED' })
    expect(transport).toHaveBeenCalledTimes(1)
  })
})

describe('source fetcher and complete Yahoo daily reader', () => {
  it('rejects redirects and malformed JSON through the injected transport boundary', async () => {
    const redirect = createSourceFetcher({ transport: async () => ({ status: 302, headers: { location: 'https://elsewhere.test' }, body: '', retrievedAt: '2026-01-01T00:00:00.000Z' }) })
    await expect(redirect.json({ url: 'https://api.tavily.com/search', allowedBaseUrls: ['https://api.tavily.com'] })).rejects.toMatchObject({ code: 'SOURCE_REDIRECT' })
    const malformed = createSourceFetcher({ transport: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: '{', retrievedAt: '2026-01-01T00:00:00.000Z' }) })
    await expect(malformed.json({ url: 'https://api.tavily.com/search', allowedBaseUrls: ['https://api.tavily.com'] })).rejects.toMatchObject({ code: 'SOURCE_INVALID_RESPONSE' })
  })

  it('maps Yahoo chart rows into the complete contract and preserves null fields', async () => {
    const upstream: YahooUpstream = {
      quote: vi.fn(async () => ({ symbol: 'SOXX', regularMarketPrice: 100 })),
      chart: vi.fn(async () => ({ quotes: [
        { date: new Date('2026-01-02T21:00:00Z'), open: 99, high: 101, low: 98, close: 100, adjclose: 100, volume: 1_000 },
        { date: new Date('2026-01-05T21:00:00Z'), open: null, high: 102, low: 99, close: 101, adjclose: null, volume: null },
      ] })),
    }
    const market = createMarketData({ upstream, now: () => new Date('2026-01-06T00:00:00Z') })
    const result = await market.dailyResearchBars('SOXX', '1mo')
    expect(result.data).toHaveLength(2)
    expect(result.data[1]).toMatchObject({ open: null, adjustedClose: null, volume: null, session: 'regular', priceSourceId: 'YAHOO_CHART', volumeSourceId: null })
    await market.close()
  })

  it('builds verified close instants with DST and official holiday/early-close rules', async () => {
    const provider = createVerifiedUsEquityCalendarProvider()
    const beforeDst = await provider({ symbol: 'SOXX', fromDate: '2025-03-07', toDate: '2025-03-07', exchangeTimezone: 'America/New_York', asOf: new Date('2025-03-08T00:00:00Z') })
    const afterDst = await provider({ symbol: 'SOXX', fromDate: '2025-03-10', toDate: '2025-03-10', exchangeTimezone: 'America/New_York', asOf: new Date('2025-03-11T00:00:00Z') })
    const carter = await provider({ symbol: 'SOXX', fromDate: '2025-01-08', toDate: '2025-01-08', exchangeTimezone: 'America/New_York', asOf: new Date('2025-01-11T00:00:00Z') })
    const independence = await provider({ symbol: 'SOXX', fromDate: '2026-07-02', toDate: '2026-07-02', exchangeTimezone: 'America/New_York', asOf: new Date('2026-07-03T00:00:00Z') })
    const thanksgiving = await provider({ symbol: 'SOXX', fromDate: '2026-11-27', toDate: '2026-11-27', exchangeTimezone: 'America/New_York', asOf: new Date('2026-11-28T00:00:00Z') })
    expect(beforeDst.sessions.find(row => row.date === '2025-03-07')?.closeAt).toBe('2025-03-07T21:00:00.000Z')
    expect(afterDst.sessions.find(row => row.date === '2025-03-10')?.closeAt).toBe('2025-03-10T20:00:00.000Z')
    expect(carter.sessions.some(row => row.date === '2025-01-09')).toBe(false)
    expect(carter.sessions.find(row => row.date === '2025-01-10')?.isWeekFinal).toBe(true)
    expect(independence.sessions.some(row => row.date === '2026-07-03')).toBe(false)
    expect(independence.sessions.find(row => row.date === '2026-07-02')?.isWeekFinal).toBe(true)
    expect(thanksgiving.sessions.find(row => row.date === '2026-11-27')?.closeAt).toBe('2026-11-27T18:00:00.000Z')
    await expect(provider({ symbol: 'SOXX', fromDate: '2029-01-01', toDate: '2029-01-01', exchangeTimezone: 'America/New_York', asOf: new Date('2029-01-02T00:00:00Z') })).rejects.toMatchObject({ code: 'SOURCE_CALENDAR_COVERAGE_GAP' })
  })
})

describe('Yahoo research evidence provider', () => {
  it('blocks Yahoo collection before the injected market reader while rights remain unknown', async () => {
    const market: CompleteResearchMarket = { dailyResearchBars: vi.fn(async () => ({ data: rows('SOXX'), source: 'upstream' as const, fetchedAt: '2026-01-08T23:05:00.000Z' })) }
    const provider = createYahooResearchEvidenceProvider({ market })
    await expect(provider({
      method: { id: '1', key: 'us-equity-swing-report', version: '1.0.0', title: 'fixture', status: 'COMPLETE', sourceUri: null, bundleHash: null, requirements: {}, coverageManifest: {}, createdAt: '2026-01-01T00:00:00Z' },
      instrument: { id: '1', methodProfileId: '1', symbol: 'SOXX', name: 'Synthetic ETF', exchange: 'NASDAQ', currency: 'USD', assetType: 'ETF', benchmarks: [], peers: [], enabled: true, configHash: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      asOf: new Date('2026-01-08T23:00:00Z'), displayTimezone: 'Asia/Hong_Kong', synthetic: false,
    })).rejects.toMatchObject({ code: 'SOURCE_POLICY_UNKNOWN' })
    expect(market.dailyResearchBars).not.toHaveBeenCalled()
  })

  it('uses injected market/calendar data and returns calculator provenance without a network call', async () => {
    const primary = rows('SOXX')
    const benchmark = rows('SPY').map((row, index) => ({ ...row, close: 100 + index * 0.5, adjustedClose: 100 + index * 0.5 }))
    const market: CompleteResearchMarket = { dailyResearchBars: vi.fn(async () => { throw new Error('live source must not be called for synthetic evidence') }) }
    const syntheticMarket: CompleteResearchMarket = { dailyResearchBars: vi.fn(async symbol => ({ data: symbol === 'SOXX' ? primary : benchmark, source: 'upstream' as const, fetchedAt: '2026-01-08T23:05:00.000Z' })) }
    const provider = createYahooResearchEvidenceProvider({ market, syntheticMarket, syntheticCalendar: async input => fixtureCalendar(input), policy: allAllowedPolicy(), now: () => new Date('2026-01-08T23:05:00Z'), range: '1mo' })
    const prepared = await provider({
      method: { id: '1', key: 'us-equity-swing-report', version: '1.0.0', title: 'fixture', status: 'COMPLETE', sourceUri: null, bundleHash: null, requirements: {}, coverageManifest: {}, createdAt: '2026-01-01T00:00:00Z' },
      instrument: { id: '1', methodProfileId: '1', symbol: 'SOXX', name: 'Synthetic ETF', exchange: 'NASDAQ', currency: 'USD', assetType: 'ETF', benchmarks: ['SPY'], peers: [], enabled: true, configHash: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      asOf: new Date('2026-01-08T23:00:00Z'), displayTimezone: 'Asia/Hong_Kong', synthetic: true,
    })
    expect(prepared.manifest.synthetic).toBe(true)
    expect(prepared.manifest.normalizationVersion).toBe('split_only')
    expect(prepared.metrics?.calculatorVersion).toBe('ts-research-calculator-1.0.0')
    expect(prepared.sources?.[0]?.use.automatedFetch.status).toBe('allowed')
    expect(syntheticMarket.dailyResearchBars).toHaveBeenCalledTimes(2)
    expect(market.dailyResearchBars).not.toHaveBeenCalled()
    expect(prepared.manifest.referenceSession).toBe('2026-01-08')
    expect(prepared.sources?.find(source => source.sourceId === 'SYNTHETIC_CALENDAR')).toMatchObject({ use: { automatedFetch: { status: 'unknown' }, evidenceStorage: { status: 'unknown' } }, retrievedAt: '2026-01-08T23:05:00.000Z', dataAsOf: '2026-01-01T00:00:00.000Z' })
    expect(prepared.sources?.some(source => source.sourceId === 'US_EQUITY_TRADING_CALENDAR')).toBe(false)
    expect(prepared.bars?.[2]).toMatchObject({ adjustedClose: null, dataAsOf: '2026-01-06T21:00:00.000Z' })
    expect(prepared.candidates?.tradePlans).toEqual(expect.arrayContaining([expect.objectContaining({ setupType: 'breakout', status: 'N_A', structuralStop: null, target1: null, eventStatus: 'UNVERIFIED' }), expect.objectContaining({ setupType: 'pullback', status: 'N_A' })]))
    expect(prepared.candidates?.officialEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'issuer_ir', status: 'N_A', sourceId: null, publicationAt: null }),
      expect.objectContaining({ role: 'event_calendar', status: 'N_A', sourceId: null, eventAt: null }),
      expect.objectContaining({ role: 'fund_holdings', status: 'N_A', sourceId: null, holdingsAsOf: null }),
      expect.objectContaining({ role: 'official_release', status: 'N_A', sourceId: null, publicationAt: null }),
    ]))
    expect(prepared.candidates?.search).toEqual({ status: 'SEARCH_NOT_CONFIGURED' })
    expect(prepared.qa).toHaveLength(10)
    expect(prepared.qa?.every(gate => gate.severity === 'CORE')).toBe(true)
    expect(prepared.qa?.every(gate => gate.status === 'NOT_CHECKED' && gate.reviewerId === null && gate.reviewedAt === null)).toBe(true)
  })

  it('trims synthetic fixture data to the last 400 fixture sessions while retaining fetched and used ranges', async () => {
    const primary = longerRows('SOXX', 410, '2026-01-08')
    const benchmark = longerRows('SPY', 410, '2026-01-08')
    const market: CompleteResearchMarket = { dailyResearchBars: vi.fn(async () => { throw new Error('real market adapter must not be used by a synthetic fixture') }) }
    const syntheticMarket: CompleteResearchMarket = { dailyResearchBars: vi.fn(async symbol => ({ data: symbol === 'SOXX' ? primary : benchmark, source: 'upstream' as const, fetchedAt: '2026-01-08T23:05:00.000Z' })) }
    const provider = createYahooResearchEvidenceProvider({ market, syntheticMarket, calendarFromDate: primary[0]!.date, syntheticCalendar: async input => fixtureCalendar(input), policy: allAllowedPolicy() })
    const prepared = await provider({
      method: { id: '1', key: 'us-equity-swing-report', version: '1.0.0', title: 'fixture', status: 'COMPLETE', sourceUri: null, bundleHash: null, requirements: {}, coverageManifest: {}, createdAt: '2026-01-01T00:00:00Z' },
      instrument: { id: '1', methodProfileId: '1', symbol: 'SOXX', name: 'Synthetic ETF', exchange: 'NASDAQ', currency: 'USD', assetType: 'ETF', benchmarks: ['SPY'], peers: [], enabled: true, configHash: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      asOf: new Date('2026-01-08T23:00:00Z'), displayTimezone: 'Asia/Hong_Kong', synthetic: true,
    })
    expect(prepared.manifest).toMatchObject({ synthetic: true, rowCount: 400, targetSessions: 400, closeRows: 400, completeOhlcRows: 400, missingSessions: [] })
    expect(prepared.candidates?.marketData).toMatchObject({ fetched: { rows: 410, firstDate: primary[0]!.date, lastDate: '2026-01-08' }, used: { rows: 400, firstDate: primary[10]!.date, lastDate: '2026-01-08', targetSessions: 400 }, truncatedRows: 10 })
    expect(prepared.manifest.warnings).toEqual(expect.arrayContaining([expect.stringContaining('truncated 10 rows')]))
  })

  it('keeps official direct-source reads bounded and separates publication, event, and holdings dates', async () => {
    const transport = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html><title>Issuer release</title><p>bounded</p></html>', retrievedAt: '2026-01-08T23:06:00.000Z' }))
    const source = {
      sourceId: 'ISSUER_IR', role: 'event_calendar' as const, publisher: 'Issuer', url: 'https://example.test/investor/calendar', policy: allAllowedPolicy('ISSUER_IR'),
      extractMetadata: () => ({ title: 'Investor events', publishedAt: '2026-01-07T14:00:00Z', eventAt: '2026-02-05T23:00:00Z', holdingsAsOf: null, facts: { eventType: 'earnings_call' } }),
    }
    const result = await collectOfficialResearchSources({ symbol: 'NVDA', asOf: new Date('2026-01-08T23:00:00Z'), sources: [source], fetcher: createSourceFetcher({ transport }) })
    const evidence = result.evidence[0]
    expect(transport).toHaveBeenCalledTimes(1)
    expect(evidence).toMatchObject({ sourceId: 'ISSUER_IR', status: 'REVIEW_REQUIRED', publicationAt: '2026-01-07T14:00:00Z', eventAt: '2026-02-05T23:00:00Z', holdingsAsOf: null, eventTiming: 'UPCOMING_WITHIN_28D', inside28dWindow: true, reviewRequired: true })
    expect(evidence).not.toHaveProperty('body')
    expect(result.sources[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.sources[0]?.dataAsOf).toBe('2026-01-07T14:00:00Z')
  })

  it('includes a configured owner contact in the BLS User-Agent', async () => {
    let headers: Readonly<Record<string, string>> = {}
    const transport = vi.fn(async request => {
      headers = request.headers ?? {}
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html>bounded</html>', retrievedAt: '2026-01-08T23:06:00.000Z' }
    })
    const source = {
      sourceId: 'BLS_EVENTS', role: 'event_calendar' as const, publisher: 'BLS', url: 'https://data.bls.gov/events', contact: 'research@example.org', policy: allAllowedPolicy('BLS_EVENTS'),
      extractMetadata: () => ({ title: 'BLS events', publishedAt: '2026-01-07T12:00:00Z' }),
    }
    await collectOfficialResearchSources({ symbol: 'SOXX', asOf: new Date('2026-01-08T23:00:00Z'), sources: [source], fetcher: createSourceFetcher({ transport }) })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(headers['User-Agent']).toBe('ResearchStudio/1.0 (+mailto:research@example.org)')
  })

  it('blocks BLS-hosted retrieval before transport when owner contact is missing', async () => {
    const transport = vi.fn()
    const result = await collectOfficialResearchSources({
      symbol: 'SOXX', asOf: new Date('2026-01-08T23:00:00Z'),
      sources: [{ sourceId: 'BLS_EVENTS', role: 'event_calendar', publisher: 'BLS', url: 'https://www.bls.gov/events', policy: allAllowedPolicy('BLS_EVENTS'), extractMetadata: () => ({}) }],
      fetcher: createSourceFetcher({ transport }),
    })
    expect(transport).not.toHaveBeenCalled()
    expect(result.evidence[0]).toMatchObject({ status: 'BLOCKED_BY_POLICY', note: expect.stringContaining('configure the source owner contact email') })
    expect(result.warnings[0]).toContain('BLS-hosted automated retrieval was skipped')
  })

  it.each([
    ['overlong', `${'a'.repeat(245)}@example.org`],
    ['header injection', 'research@example.org\r\nX-Injected: true'],
  ])('rejects %s official-source contact before transport', async (_case, contact) => {
    const transport = vi.fn()
    await expect(collectOfficialResearchSources({
      symbol: 'SOXX', asOf: new Date('2026-01-08T23:00:00Z'),
      sources: [{ sourceId: 'ISSUER_IR', role: 'issuer_ir', publisher: 'Issuer', url: 'https://example.test/ir', contact, policy: allAllowedPolicy('ISSUER_IR'), extractMetadata: () => ({}) }],
      fetcher: createSourceFetcher({ transport }),
    })).rejects.toMatchObject({ code: 'SOURCE_CONTACT_INVALID' })
    expect(transport).not.toHaveBeenCalled()
  })

  it('keeps direct-source policy denials before transport or extraction', async () => {
    const transport = vi.fn()
    const extractMetadata = vi.fn(() => ({ title: 'Should not be reached' }))
    const blockedPolicy = createSourcePolicy({ sourceId: 'FED_FOMC', provider: 'Federal Reserve', scope: 'Official meeting dates', basisUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', checkedAt: '2026-01-01T00:00:00.000Z', conditions: ['Rights have not been reviewed.'] })
    const result = await collectOfficialResearchSources({
      symbol: 'NVDA', asOf: new Date('2026-01-08T23:00:00Z'),
      sources: [{ sourceId: 'FED_FOMC', role: 'event_calendar', publisher: 'Federal Reserve', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', policy: blockedPolicy, extractMetadata }],
      fetcher: createSourceFetcher({ transport }),
    })
    expect(transport).not.toHaveBeenCalled()
    expect(extractMetadata).not.toHaveBeenCalled()
    expect(result.evidence[0]).toMatchObject({ sourceId: 'FED_FOMC', role: 'event_calendar', status: 'BLOCKED_BY_POLICY', publicationAt: null, eventAt: null, holdingsAsOf: null })
  })

  it.each([
    { basis: null, checkedAt: '2026-01-01T00:00:00.000Z' },
    { basis: 'javascript:alert(1)', checkedAt: '2026-01-01T00:00:00.000Z' },
    { basis: 'https://example.test/policy', checkedAt: '2026-02-30T00:00:00Z' },
    { basis: null, checkedAt: null },
  ])('does not transport a direct source with malformed allowed-fetch evidence', async permission => {
    const transport = vi.fn()
    const policy = {
      ...allAllowedPolicy('DIRECT_POLICY_FIXTURE'),
      permissions: { automated_fetch: { status: 'allowed' as const, conditions: [], ...permission } },
    }
    const result = await collectOfficialResearchSources({
      symbol: 'NVDA', asOf: new Date('2026-01-08T23:00:00Z'),
      sources: [{ sourceId: policy.sourceId, role: 'official_release', publisher: 'Fixture', url: 'https://example.test/release', policy, extractMetadata: () => ({}) }],
      fetcher: createSourceFetcher({ transport }),
    })
    expect(transport).not.toHaveBeenCalled()
    expect(result.evidence[0]?.status).toBe('BLOCKED_BY_POLICY')
    expect(result.sources[0]?.use.automatedFetch.status).toBe('unknown')
  })

  it('allows approved direct retrieval/storage while withholding metadata when inference permission is unknown', async () => {
    const transport = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>bounded</html>', retrievedAt: '2026-01-08T23:06:00.000Z' }))
    const policy = createSourcePolicy({
      sourceId: 'ISSUER_UNRESOLVED_LLM', provider: 'Issuer', scope: 'Official event page', basisUrl: 'https://example.test/policy', checkedAt: '2026-01-01T00:00:00.000Z', conditions: [],
      decisions: { automated_fetch: 'allowed', evidence_storage: 'allowed', llm_inference: 'unknown', publication_of_analysis_and_excerpts: 'unknown', raw_data_redistribution: 'unknown' },
    })
    const result = await collectOfficialResearchSources({
      symbol: 'NVDA', asOf: new Date('2026-01-08T23:00:00Z'),
      sources: [{ sourceId: policy.sourceId, role: 'event_calendar', publisher: 'Issuer', url: 'https://example.test/events', policy, extractMetadata: () => ({ title: 'Event page', publishedAt: '2026-01-07T12:00:00Z', eventAt: '2026-02-01T18:00:00Z', facts: { eventType: 'earnings_call' } }) }],
      fetcher: createSourceFetcher({ transport }),
    })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(result.sources[0]?.use).toMatchObject({ automatedFetch: { status: 'allowed' }, evidenceStorage: { status: 'allowed' }, llmInference: { status: 'unknown' } })
    expect(result.evidence[0]).toMatchObject({ status: 'WITHHELD_BY_POLICY', title: null, eventAt: null, metadata: null, note: expect.stringContaining('llm_inference') })
  })

  it('withholds metadata when llm permission says allowed without its own basis and check timestamp', async () => {
    const transport = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>bounded</html>', retrievedAt: '2026-01-08T23:06:00.000Z' }))
    const policy = {
      ...allAllowedPolicy('ISSUER_STATUS_ONLY_LLM'),
      permissions: { llm_inference: { status: 'allowed' as const, conditions: [], basis: null, checkedAt: null } },
    }
    const result = await collectOfficialResearchSources({
      symbol: 'NVDA', asOf: new Date('2026-01-08T23:00:00Z'),
      sources: [{ sourceId: policy.sourceId, role: 'official_release', publisher: 'Issuer', url: 'https://example.test/release', policy, extractMetadata: () => ({ title: 'Protected facts', publishedAt: '2026-01-07T12:00:00Z', facts: { value: 10 } }) }],
      fetcher: createSourceFetcher({ transport }),
    })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(result.sources[0]?.use.llmInference).toMatchObject({ status: 'unknown', basis: null, checkedAt: null })
    expect(result.evidence[0]).toMatchObject({ status: 'WITHHELD_BY_POLICY', title: null, metadata: null, note: expect.stringContaining('not verified as allowed') })
  })

  it('withholds future or publication-time-unknown metadata from historical model candidates', async () => {
    const transport = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>bounded</html>', retrievedAt: '2026-01-08T23:06:00.000Z' }))
    const sources = [
      { sourceId: 'FUTURE_RELEASE', role: 'official_release' as const, publisher: 'Issuer', url: 'https://example.test/future', policy: allAllowedPolicy('FUTURE_RELEASE'), extractMetadata: () => ({ title: 'Future facts', publishedAt: '2026-01-09T00:00:00Z', eventAt: '2026-02-01T18:00:00Z', holdingsAsOf: '2026-01-08', facts: { earnings: 10 } }) },
      { sourceId: 'UNKNOWN_RELEASE', role: 'official_release' as const, publisher: 'Issuer', url: 'https://example.test/unknown', policy: allAllowedPolicy('UNKNOWN_RELEASE'), extractMetadata: () => ({ title: 'Unknown timing', publishedAt: null, eventAt: '2026-02-01T18:00:00Z', holdingsAsOf: null, facts: { earnings: 11 } }) },
      { sourceId: 'SAME_DAY_DATE_ONLY', role: 'event_calendar' as const, publisher: 'Issuer', url: 'https://example.test/same-day', policy: allAllowedPolicy('SAME_DAY_DATE_ONLY'), extractMetadata: () => ({ title: 'Date only', publishedAt: '2026-01-08', eventAt: '2026-02-01', facts: { eventType: 'earnings_call' } }) },
      { sourceId: 'PRIOR_LOCAL_DATE_ONLY', role: 'official_release' as const, publisher: 'Issuer', url: 'https://example.test/prior-date-only', policy: allAllowedPolicy('PRIOR_LOCAL_DATE_ONLY'), extractMetadata: () => ({ title: 'Prior local date', publishedAt: '2026-01-07', facts: { earnings: 12 } }) },
    ]
    const result = await collectOfficialResearchSources({ symbol: 'NVDA', asOf: new Date('2026-01-08T00:30:00Z'), sources, fetcher: createSourceFetcher({ transport }) })
    expect(result.evidence[0]).toMatchObject({ status: 'FUTURE_PUBLICATION', title: null, publicationAt: null, eventAt: null, holdingsAsOf: null, metadata: null, publicationAvailability: 'AFTER_AS_OF' })
    expect(result.evidence[1]).toMatchObject({ status: 'PUBLICATION_TIME_UNKNOWN', title: null, publicationAt: null, eventAt: null, holdingsAsOf: null, metadata: null, publicationAvailability: 'UNKNOWN' })
    expect(result.evidence[2]).toMatchObject({ status: 'PUBLICATION_TIME_UNKNOWN', eventTiming: 'EVENT_TIME_UNKNOWN', inside28dWindow: null })
    expect(result.evidence[3]).toMatchObject({ status: 'PUBLICATION_TIME_UNKNOWN', title: null, publicationAt: null, metadata: null, publicationAvailability: 'UNKNOWN' })
    expect(result.sources[0]).toMatchObject({ title: null, dataAsOf: null, evidenceLocator: expect.stringMatching(/^sha256:/u) })
  })

  it('distinguishes prior event background, events beyond 28 days, and events without exact timezone', async () => {
    const metadata: Readonly<Record<string, OfficialResearchMetadata>> = {
      PAST: { title: 'Past', publishedAt: '2026-01-07T00:00:00Z', eventAt: '2026-01-01T10:00:00Z' },
      LATER: { title: 'Later', publishedAt: '2026-01-07T00:00:00Z', eventAt: '2026-02-06T00:00:00Z' },
      DATE_ONLY: { title: 'Date-only', publishedAt: '2026-01-07T00:00:00Z', eventAt: '2026-02-01' },
      TIMEZONELESS: { title: 'Timezone-less', publishedAt: '2026-01-07T00:00:00Z', eventAt: '2026-02-01T18:00:00' },
    }
    const sources = Object.entries(metadata).map(([sourceId, value]) => ({ sourceId, role: 'event_calendar' as const, publisher: 'Issuer', url: `https://example.test/${sourceId.toLowerCase()}`, policy: allAllowedPolicy(sourceId), extractMetadata: () => value }))
    const result = await collectOfficialResearchSources({
      symbol: 'NVDA', asOf: new Date('2026-01-08T23:00:00Z'), sources,
      fetcher: createSourceFetcher({ transport: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>bounded</html>', retrievedAt: '2026-01-08T23:06:00.000Z' }) }),
    })
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'PAST', eventTiming: 'PAST_BACKGROUND', inside28dWindow: false }),
      expect.objectContaining({ sourceId: 'LATER', eventTiming: 'UPCOMING_AFTER_28D', inside28dWindow: false }),
      expect.objectContaining({ sourceId: 'DATE_ONLY', eventAt: '2026-02-01', eventTiming: 'EVENT_TIME_UNKNOWN', inside28dWindow: null }),
      expect.objectContaining({ sourceId: 'TIMEZONELESS', eventAt: null, eventTiming: 'EVENT_TIME_UNKNOWN', inside28dWindow: null }),
    ]))
  })
})
