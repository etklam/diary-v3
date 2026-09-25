import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ResearchQaGate } from '@diary/contracts'
import { researchPublicationEvidenceIssue, researchPublicationFreshnessIssue } from '../../apps/api/src/research-studio/publication'
import { createSourcePolicy, sourcePolicyToRecord } from '../../apps/api/src/research-studio/source-policy'

const now = new Date('2026-09-24T22:00:00.000Z')
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}
function fixture() {
  const qa: ResearchQaGate[] = Array.from({ length: 10 }, (_, index) => ({ gateId: `G${String(index + 1).padStart(2, '0')}`, severity: 'CORE', status: 'PASS', evidence: ['Synthetic human review note.'], reason: null, remediation: null, reviewerId: '1', reviewedAt: now.toISOString() }))
  const source = sourcePolicyToRecord(createSourcePolicy({ sourceId: 'SYNTHETIC_SOURCE', provider: 'Offline fixture', scope: 'Synthetic policy tests only.', basisUrl: 'https://fixture.example.invalid/terms', checkedAt: now.toISOString(), conditions: ['Synthetic fixture; never publish.'], decisions: { publication_of_analysis_and_excerpts: 'allowed', raw_data_redistribution: 'restricted' } }))
  const evidence = {
    manifest: { synthetic: true, referenceSession: '2026-09-24', asOf: now.toISOString(), displayTimezone: 'Asia/Hong_Kong', exchangeTimezone: 'America/New_York', calendarVersion: 'SYNTHETIC_CALENDAR', normalizationVersion: 'synthetic-v1', targetSessions: 400, rowCount: 400, closeRows: 400, completeOhlcRows: 150, volumeRows: 21, missingSessions: [], warnings: ['Synthetic fixture; never publish.'], sourceIds: [source.sourceId] },
    bars: [], sources: [source], metrics: {}, candidates: {}, qa: structuredClone(qa), quality: 'FULL' as const,
  }
  const snapshot = () => ({ manifestJson: JSON.stringify(evidence.manifest), barsJson: JSON.stringify(evidence.bars), sourcesJson: JSON.stringify(evidence.sources), metricsJson: JSON.stringify(evidence.metrics), candidatesJson: JSON.stringify(evidence.candidates), qaJson: JSON.stringify(evidence.qa), quality: evidence.quality, contentHash: createHash('sha256').update(stableJson(evidence)).digest('hex') })
  return { evidence, snapshot, structured: { synthetic: true, claims: [], qa } }
}

describe('publication evidence checks independent of mandatory synthetic rejection', () => {
  it('permits analysis policy without requiring raw-data redistribution', () => {
    const data = fixture()
    expect(researchPublicationEvidenceIssue({ snapshot: data.snapshot(), structured: data.structured })).toBeNull()
  })
  it('rejects tampering before trusting stored policy or review', () => {
    const data = fixture()
    expect(researchPublicationEvidenceIssue({ snapshot: { ...data.snapshot(), metricsJson: '{"tampered":true}' }, structured: data.structured })?.code).toBe('RESEARCH_ARTICLE_PROVENANCE')
  })
  it.each(['unknown', 'restricted'] as const)('rejects %s publication permission even with an intact hash', status => {
    const data = fixture(); data.evidence.sources[0]!.use.publicationOfAnalysisAndExcerpts.status = status
    expect(researchPublicationEvidenceIssue({ snapshot: data.snapshot(), structured: data.structured })?.code).toBe('RESEARCH_ARTICLE_PROVENANCE')
  })
  it.each([
    { basis: null, checkedAt: now.toISOString() },
    { basis: 'javascript:alert(1)', checkedAt: now.toISOString() },
    { basis: 'https://fixture.example.invalid/terms', checkedAt: '2026-02-30T00:00:00Z' },
    { basis: null, checkedAt: null },
  ])('rejects allowed publication evidence without a valid basis URL and check timestamp', permission => {
    const data = fixture()
    Object.assign(data.evidence.sources[0]!.use.publicationOfAnalysisAndExcerpts, permission)
    expect(researchPublicationEvidenceIssue({ snapshot: data.snapshot(), structured: data.structured })?.code).toBe('RESEARCH_ARTICLE_PROVENANCE')
  })
  it('rejects a failed frozen gate and missing exact-revision human review', () => {
    const data = fixture(); data.evidence.qa[0]!.status = 'FAIL'
    expect(researchPublicationEvidenceIssue({ snapshot: data.snapshot(), structured: data.structured })?.code).toBe('RESEARCH_QA_FAILED')
    const unreviewed = fixture(); unreviewed.structured.qa[8]!.reviewerId = null
    expect(researchPublicationEvidenceIssue({ snapshot: unreviewed.snapshot(), structured: unreviewed.structured })?.code).toBe('RESEARCH_QA_FAILED')
  })
})

it('requires current verified calendar coverage and fails closed on absence, staleness or failure', async () => {
  const input = { symbol: 'SOXX', referenceSession: '2026-09-24', now }
  const verified = { session: input.referenceSession, calendarVersion: 'SYNTHETIC_CALENDAR', verifiedSourceId: 'SYNTHETIC_CALENDAR' }
  expect(await researchPublicationFreshnessIssue({ ...input, latestCompletedSession: async () => verified })).toBeNull()
  for (const current of [null, { ...verified, session: '2026-09-25' }, { ...verified, verifiedSourceId: '' }]) {
    expect((await researchPublicationFreshnessIssue({ ...input, latestCompletedSession: async () => current }))?.code).toBe('RESEARCH_ARTICLE_FRESHNESS')
  }
  expect((await researchPublicationFreshnessIssue(input))?.code).toBe('RESEARCH_ARTICLE_FRESHNESS')
  expect((await researchPublicationFreshnessIssue({ ...input, latestCompletedSession: async () => { throw new Error('Synthetic calendar failure') } }))?.code).toBe('RESEARCH_ARTICLE_FRESHNESS')
})
