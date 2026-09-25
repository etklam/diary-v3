import { describe, expect, it } from 'vitest'
import { researchEvidenceManifestSchema, researchSourceRecordSchema, type ResearchDraft, type ResearchSourceRecord } from '@diary/contracts'
import { escapeResearchMarkdownCell, formatResearchDecimal, renderResearchReport, researchReportCitationSources } from '../../apps/api/src/research-studio/render.js'

function permission(status: 'allowed' | 'restricted' | 'unknown', basis: string | null = 'https://policy.example.test/terms', checkedAt: string | null = '2026-09-25T12:00:00.000Z') {
  return { status, conditions: [], basis, checkedAt }
}

function source(input: Partial<Pick<ResearchSourceRecord, 'sourceId' | 'purpose' | 'requestedUrl' | 'resolvedUrl' | 'publisher' | 'title' | 'retrievedAt'>> & {
  publication?: ReturnType<typeof permission>
  evidenceLocator?: string | null
} = {}): ResearchSourceRecord {
  const allowed = permission('allowed')
  return researchSourceRecordSchema.parse({
    sourceId: input.sourceId ?? 'OFFICIAL_REPORT',
    purpose: input.purpose ?? 'research_evidence',
    requestedUrl: input.requestedUrl === undefined ? 'https://source.example.test/report' : input.requestedUrl,
    resolvedUrl: input.resolvedUrl === undefined ? 'https://source.example.test/report' : input.resolvedUrl,
    publisher: input.publisher === undefined ? 'Example Publisher' : input.publisher,
    title: input.title === undefined ? 'Official report' : input.title,
    retrievedAt: input.retrievedAt === undefined ? '2026-09-25T12:00:00.000Z' : input.retrievedAt,
    dataAsOf: null,
    readRange: 'not rendered',
    evidenceLocator: input.evidenceLocator === undefined ? 'not rendered' : input.evidenceLocator,
    contentHash: null,
    use: {
      automatedFetch: allowed,
      evidenceStorage: allowed,
      llmInference: allowed,
      publicationOfAnalysisAndExcerpts: input.publication ?? allowed,
      rawDataRedistribution: permission('unknown'),
    },
    limitations: ['not rendered'],
  })
}

function plan(planId: 'breakout' | 'pullback', input: { status?: 'WATCH' | 'N_A'; mid?: unknown; conservative?: unknown } = {}) {
  return {
    planId,
    setupType: planId,
    status: input.status ?? 'WATCH',
    trigger: 'Wait for a completed close.',
    triggerPrice: 104.5,
    confirmation: 'Review event risk before any action.',
    entry: { zoneId: `${planId}-entry`, lower: 100, upper: 102, anchors: ['pivot-high-2026-09-01'], basis: 'confirmed pivot' },
    structuralStop: { zoneId: `${planId}-stop`, lower: 90, upper: 92, anchors: ['pivot-low-2026-08-21'], basis: 'confirmed pivot', rule: 'next_lower_support_zone', stopPrice: null },
    target1: { zoneId: `${planId}-target-1`, lower: 110, upper: 112, anchors: ['pivot-high-2026-09-10'], basis: 'confirmed resistance' },
    target2: null,
    midRewardRisk: { target1: input.mid ?? 1.005, target2: null },
    conservativeRewardRisk: { target1: input.conservative ?? 0.995, target2: null },
    eventStatus: 'UNVERIFIED',
    invalidation: 'A completed close below the structural support invalidates this candidate.',
    validUntilSession: '2026-09-30',
    positionSize: null,
    selectedZoneIds: [`${planId}-entry`, `${planId}-stop`, `${planId}-target-1`],
    availableZoneIds: [],
    requiresHumanReview: true,
    reason: input.status === 'N_A' ? 'No support zone is present in the frozen snapshot.' : 'Retest and event review remain outstanding.',
  }
}

function draft(overrides: Partial<ResearchDraft> = {}): ResearchDraft {
  return {
    schemaVersion: 'research-draft-v1',
    title: 'Synthetic report',
    sections: Array.from({ length: 10 }, (_, index) => ({
      section: index + 1,
      title: `Section ${index + 1}`,
      content: `Narrative ${index + 1}.`,
      claimIds: [],
    })),
    claims: [],
    finalAnswers: Array.from({ length: 8 }, (_, index) => ({ question: `Question ${index + 1}?`, answer: `Answer ${index + 1}.`, claimIds: [] })),
    limitations: ['Offline fixture only.'],
    ...overrides,
  }
}

function evidence(input: {
  synthetic?: boolean
  sources?: ResearchSourceRecord[]
  metrics?: Record<string, unknown>
  candidates?: Record<string, unknown>
  missingSessions?: string[]
  warnings?: string[]
} = {}) {
  return {
    manifest: researchEvidenceManifestSchema.parse({
      referenceSession: '2026-09-24',
      asOf: '2026-09-25T12:00:00.000Z',
      displayTimezone: 'Asia/Taipei',
      exchangeTimezone: 'America/New_York',
      calendarVersion: 'fixture-calendar-v1',
      normalizationVersion: 'split_only',
      targetSessions: 400,
      rowCount: 400,
      completeOhlcRows: 390,
      closeRows: 400,
      volumeRows: 21,
      missingSessions: input.missingSessions ?? ['2026-09-02', '2026-09-03'],
      warnings: input.warnings ?? ['Split adjustment | is incomplete.'],
      sourceIds: input.sources?.map(item => item.sourceId) ?? [],
      synthetic: input.synthetic ?? true,
    }),
    metrics: input.metrics ?? {},
    candidates: input.candidates ?? {},
    sources: input.sources ?? [],
    quality: 'LIMITED' as const,
  }
}

describe('Research Studio report rendering', () => {
  it('renders the exact frozen header, whitelisted metrics and both conditional plans', () => {
    const rendered = renderResearchReport(draft({ sections: Array.from({ length: 10 }, (_, index) => ({
      section: index + 1,
      title: `Section ${index + 1}`,
      content: index === 0 ? 'The model omits the latest close.' : `Narrative ${index + 1}.`,
      claimIds: [],
    })) }), evidence({
      metrics: {
        symbol: 'SOXX',
        calculatorVersion: 'ts-research-calculator-1.0.0',
        latest: { close: 123.456, ema10: null, macdHistogram: -0.12345, rsi14: 58.25, atrPct: 2.345, secret: 'PRIVATE_SETTINGS_SENTINEL' },
        settings: { apiKey: 'PRIVATE_API_KEY_SENTINEL' },
        bars: [{ close: 'RAW_BAR_SENTINEL' }],
        relativeStrength: [{ benchmark: 'SPY', window: '20_session', startDate: '2026-08-26', endDate: '2026-09-24', targetReturnPct: 3.456, benchmarkReturnPct: 1.2, outperformancePp: 2.256 }],
      },
      candidates: {
        tradePlans: [plan('breakout'), plan('pullback', { status: 'N_A', mid: -1.005, conservative: null })],
        search: { results: [{ snippet: 'DO_NOT_RENDER_SNIPPET_SENTINEL' }] },
      },
    }))

    expect(rendered).toContain('**Reference session：** 2026-09-24 · **As of (UTC)：** 2026-09-25T12:00:00.000Z')
    expect(rendered).toContain('**資料口徑：** split\\_only')
    expect(rendered).toContain('**Synthetic evidence：** YES — offline fixture; not publishable.')
    expect(rendered).not.toContain('BLS.gov cannot vouch')
    expect(rendered).toContain('**調整限制：** Adjusted close is incomplete; cash-dividend adjustment is unavailable.')
    expect(rendered).toContain('**Evidence warnings:**')
    expect(rendered).toContain('**Missing sessions：** 2026-09-02, 2026-09-03。')
    expect(rendered).toContain('- Split adjustment \\| is incomplete.')
    expect(rendered).toContain('| 正規收市 | `latest.close` | 123.46 |')
    expect(rendered).toContain('| EMA10 | `latest.ema10` | N/A |')
    expect(rendered).toContain('| MACD Histogram | `latest.macdHistogram` | -0.1235 |')
    expect(rendered).toContain('| ATR% | `latest.atrPct` | 2.35% |')
    expect(rendered).toContain('| SPY | 20\\_session | 2026-08-26 | 2026-09-24 | 3.46% | 1.20% | 2.26 pp | `relativeStrength[0]` |')
    expect(rendered).toContain('#### breakout')
    expect(rendered).toContain('#### pullback')
    expect(rendered).toContain('| Mid R/R (T1 / T2) | 1.01 R / N/A |')
    expect(rendered).toContain('| Conservative R/R (T1 / T2) | 1.00 R / N/A |')
    expect(rendered).toContain('| 狀態 | N/A — 凍結快照沒有可用候選 |')
    expect(rendered).toContain('| Mid R/R (T1 / T2) | -1.01 R / N/A |')
    expect(rendered).toContain('## 10. Section 10')
    expect(rendered).toContain('## Final answers')
    expect(rendered).toContain('8. Question 8?')
    expect(rendered.match(/^## \d+\./gmu)).toHaveLength(10)
    const narrativeSection = rendered.split('## 1. Section 1')[1]?.split('## 2. Section 2')[0]
    expect(narrativeSection).toContain('The model omits the latest close.')
    expect(narrativeSection).not.toContain('123.46')
    expect(rendered).toContain('| 正規收市 | `latest.close` | 123.46 |')
    expect(rendered).not.toContain('PRIVATE_SETTINGS_SENTINEL')
    expect(rendered).not.toContain('PRIVATE_API_KEY_SENTINEL')
    expect(rendered).not.toContain('RAW_BAR_SENTINEL')
    expect(rendered).not.toContain('DO_NOT_RENDER_SNIPPET_SENTINEL')

    const bounded = renderResearchReport(draft(), evidence({
      missingSessions: Array.from({ length: 12 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`),
      warnings: Array.from({ length: 6 }, (_, index) => `Warning ${index + 1}`),
    }))
    expect(bounded).toContain('2026-09-10')
    expect(bounded).not.toContain('2026-09-11')
    expect(bounded).toContain('additional warnings omitted')
    expect(bounded).not.toContain('- Warning 6')
  })

  it('rounds exact decimal strings deterministically and preserves negative and missing values', () => {
    expect(formatResearchDecimal('9999999.995', 2)).toBe('10,000,000.00')
    expect(formatResearchDecimal('-1.005', 2)).toBe('-1.01')
    expect(formatResearchDecimal(null, 2)).toBe('N/A')
    expect(formatResearchDecimal(Number.NaN, 2)).toBe('N/A')
    expect(formatResearchDecimal('1e2', 2)).toBe('100.00')
  })

  it('escapes table labels and only emits verified HTTPS public citations', () => {
    const allowed = source({
      sourceId: 'OFFICIAL_REPORT',
      requestedUrl: 'https://source.example.test/requested',
      resolvedUrl: 'https://source.example.test/final?q=a%26b',
      publisher: 'Issuer | Group',
      title: '<script>alert(1)</script>\n[Injected](https://evil.example.test)',
    })
    const unknownRights = source({ sourceId: 'UNKNOWN_RIGHTS', publication: permission('unknown') })
    const missingBasis = source({ sourceId: 'MISSING_BASIS', publication: permission('allowed', null) })
    const textBasis = source({ sourceId: 'TEXT_BASIS', publication: permission('allowed', 'license allows publication') })
    const missingCheck = source({ sourceId: 'MISSING_CHECK', publication: permission('allowed', 'https://policy.example.test/terms', null) })
    const httpOnly = source({ sourceId: 'HTTP_ONLY', requestedUrl: 'http://source.example.test/report', resolvedUrl: 'http://source.example.test/report' })
    const credentialUrl = source({ sourceId: 'CREDENTIAL_URL', requestedUrl: 'https://user:secret@source.example.test/report', resolvedUrl: 'https://user:secret@source.example.test/report' })
    const tavily = source({ sourceId: 'TAVILY_SEARCH', requestedUrl: 'https://api.tavily.com/search', resolvedUrl: 'https://api.tavily.com/search' })
    const discoveryOnly = source({ sourceId: 'DISCOVERY_LEAD', purpose: 'discovery', evidenceLocator: 'discovery_only' })
    const bls = source({ sourceId: 'BLS_SERIES', requestedUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data', resolvedUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data' })
    const missingRetrieval = source({ sourceId: 'MISSING_RETRIEVAL', retrievedAt: null })
    const inputs = [allowed, unknownRights, missingBasis, textBasis, missingCheck, httpOnly, credentialUrl, tavily, discoveryOnly, bls, missingRetrieval]
    const rendered = renderResearchReport(draft(), evidence({ sources: inputs }))
    const projected = researchReportCitationSources(inputs)

    expect(rendered).toContain('[Issuer \\| Group — &lt;script&gt;alert\\(1\\)&lt;/script&gt; \\[Injected\\]\\(https://evil.example.test\\)](<https://source.example.test/final?q=a%26b>)')
    expect(rendered).toContain('UNKNOWN\\_RIGHTS | N/A — public link withheld')
    expect(rendered).toContain('MISSING\\_BASIS | N/A — public link withheld')
    expect(rendered).toContain('TEXT\\_BASIS | N/A — public link withheld')
    expect(rendered).toContain('MISSING\\_CHECK | N/A — public link withheld')
    expect(rendered).toContain('HTTP\\_ONLY | N/A — public link withheld')
    expect(rendered).toContain('CREDENTIAL\\_URL | N/A — public link withheld')
    expect(rendered).toContain('TAVILY\\_SEARCH | N/A — discovery metadata is not a reviewed evidence citation.')
    expect(rendered).toContain('DISCOVERY\\_LEAD | N/A — discovery metadata is not a reviewed evidence citation.')
    expect(rendered).toContain('MISSING\\_RETRIEVAL | N/A — public link withheld')
    expect(rendered).toContain('retrieved 2026-09-25T12:00:00.000Z; publication-use policy checked 2026-09-25T12:00:00.000Z')
    expect(rendered).toContain('BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.')
    expect(rendered).not.toContain('](<http://')
    expect(rendered).not.toContain('](<https://api.tavily.com')
    expect(projected.map(item => item.requestedUrl)).toEqual([
      'https://source.example.test/final?q=a%26b', null, null, null, null, null, null, null, null,
      'https://api.bls.gov/publicAPI/v2/timeseries/data',
      null,
    ])
    const failedBls = source({ sourceId: 'BLS_FAILED', requestedUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data', resolvedUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data', retrievedAt: null })
    const failedBlsReport = renderResearchReport(draft(), evidence({ sources: [failedBls] }))
    expect(failedBlsReport).toContain('BLS\\_FAILED | N/A — public link withheld')
    expect(failedBlsReport).not.toContain('BLS.gov cannot vouch')
    expect(failedBlsReport).not.toContain('](<https://api.bls.gov')
    expect(escapeResearchMarkdownCell('x | y\n| forged row')).toBe('x \\| y \\| forged row')
  })
})
