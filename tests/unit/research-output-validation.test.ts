import { describe, expect, it } from 'vitest'
import type { ResearchDraft, ResearchSourceRecord } from '@diary/contracts'
import { researchOutputEvidenceIssue } from '../../apps/api/src/research-studio/output-validation'
import { createSourcePolicy, sourcePolicyToRecord } from '../../apps/api/src/research-studio/source-policy'

const synthetic = true
const source: ResearchSourceRecord = sourcePolicyToRecord(createSourcePolicy({ sourceId: 'SYNTHETIC_SOURCE', provider: 'Synthetic fixture', scope: 'Offline validation fixture only.', basisUrl: 'https://fixture.example.invalid/terms', checkedAt: '2026-09-25T00:00:00.000Z', conditions: ['Synthetic; never publish.'] }), { requestedUrl: 'https://fixture.example.invalid/evidence', resolvedUrl: 'https://fixture.example.invalid/evidence' })
function fixture(text = 'EMA20 is 123.46 and RSI14 is 58.2.'): { draft: ResearchDraft; evidence: { sources: ResearchSourceRecord[]; metrics: Record<string, unknown>; candidates: Record<string, unknown> } } {
  const draft: ResearchDraft = { schemaVersion: 'research-draft-v1', title: 'Synthetic validation', sections: [{ section: 1, title: 'Evidence', content: '[Evidence](https://fixture.example.invalid/evidence)', claimIds: ['VALUE_1'] }], claims: [{ claimId: 'VALUE_1', section: 1, type: 'computed', text, sourceIds: [source.sourceId], metricPaths: ['latest.ema20', 'latest.rsi14'], zoneIds: [], planIds: [], status: 'SUPPORTED' }], finalAnswers: [], limitations: ['Synthetic fixture only.'] }
  return { draft, evidence: { sources: [source], metrics: { synthetic, latest: { ema20: 123.456, rsi14: 58.2 } }, candidates: {} } }
}

describe('mechanical generated-output evidence checks', () => {
  it('accepts known source URLs and normal display rounding without treating it as factual QA', () => {
    const data = fixture()
    expect(researchOutputEvidenceIssue(data.draft, data.evidence)).toBeNull()
  })
  it('rejects invented URLs in any authored section, including query changes', () => {
    const data = fixture(); data.draft.sections[0]!.content = '[Invented source](https://fixture.example.invalid/evidence?invented=true)'
    expect(researchOutputEvidenceIssue(data.draft, data.evidence)).toContain('URL')
  })
  it('rejects invented computed numbers even when the metric path exists', () => {
    const data = fixture('EMA20 is 9999.99.')
    expect(researchOutputEvidenceIssue(data.draft, data.evidence)).toContain('number absent')
  })
  it('does not allow a valid number from an unrelated metric or prototype property', () => {
    const data = fixture('The cited result is 777.')
    data.evidence.metrics.unrelated = 777
    data.draft.claims[0]!.metricPaths = ['latest.ema20', 'constructor']
    expect(researchOutputEvidenceIssue(data.draft, data.evidence)).toContain('number absent')
  })
  it('resolves preserved series indices and selected plan values without recalculating', () => {
    const data = fixture('The conservative ratio is 1.43R and signal is -0.2.')
    data.evidence.metrics.series = { signal: { 399: -0.2 } }
    data.evidence.candidates.tradePlans = [{ planId: 'pullback', conservativeRewardRisk: 1.428571428 }]
    data.draft.claims[0]!.metricPaths = ['series.signal[399]']
    data.draft.claims[0]!.planIds = ['pullback']
    expect(researchOutputEvidenceIssue(data.draft, data.evidence)).toBeNull()
    data.draft.claims[0]!.text = 'The conservative ratio is 99.9R.'
    expect(researchOutputEvidenceIssue(data.draft, data.evidence)).toContain('number absent')
  })
})
