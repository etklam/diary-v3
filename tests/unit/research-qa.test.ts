import { describe, expect, it } from 'vitest'
import type { ResearchQaGate, ResearchSourceRecord } from '@diary/contracts'
import { researchQaApprovalIssue } from '../../apps/api/src/research-studio/qa'

const fixture = { synthetic: true, reviewedAt: '2026-09-24T22:00:00.000Z' } as const
function gates(): ResearchQaGate[] {
  return Array.from({ length: 10 }, (_, index) => ({
    gateId: `G${String(index + 1).padStart(2, '0')}`, severity: 'CORE', status: 'PASS', evidence: ['Synthetic reviewer inspected this gate.'], reason: null, remediation: null, reviewerId: '1', reviewedAt: fixture.reviewedAt,
  }))
}
const check = (qa: ResearchQaGate[], claims: unknown[] = [], sources: ResearchSourceRecord[] = [], frozenQa?: ResearchQaGate[]) => researchQaApprovalIssue({ qa, structured: { claims, synthetic: fixture.synthetic }, sources, frozenQa })

describe('exact-revision QA approval', () => {
  it('accepts all ten reviewed gates without treating this as live research acceptance', () => {
    expect(check(gates())).toBeNull()
  })
  it('rejects duplicate gates, optional citation checks, unchecked review and frozen failure', () => {
    const duplicate = gates(); duplicate[9]!.gateId = 'G09'
    expect(check(duplicate)).not.toBeNull()
    const optional = gates(); optional[8]!.severity = 'OPTIONAL'
    expect(check(optional)).not.toBeNull()
    const unchecked = gates(); unchecked[8]!.reviewerId = null
    expect(check(unchecked)).toContain('G09')
    const frozen = gates(); frozen[3]!.status = 'FAIL'
    expect(check(gates(), [], [], frozen)).toContain('Frozen')
  })
  it('allows a reviewed N/A only when no plan or event claim makes the gate applicable', () => {
    const qa = gates()
    for (const index of [6, 7]) Object.assign(qa[index]!, { status: 'N_A', reason: 'The synthetic report contains no applicable claims.' })
    expect(check(qa)).toBeNull()
    expect(check(qa, [{ section: 1, type: 'plan', planIds: ['P1'] }])).toContain('G07')
    expect(check(qa, [{ section: 9, type: 'inference', planIds: [] }])).toContain('G07')
    expect(check(qa, [{ section: 7, type: 'observed', sourceIds: [] }])).toContain('G08')
    qa[6]!.reason = '   '
    expect(check(qa)).toContain('G07')
  })
  it('does not permit N/A on citation or contradiction gates and requires an actual note', () => {
    const qa = gates(); qa[8]!.status = 'N_A'; qa[8]!.reason = 'No optional news.'
    expect(check(qa)).toContain('G09')
    const blank = gates(); blank[9]!.reason = ' '; blank[9]!.evidence = [' ']
    expect(check(blank)).toContain('G10')
  })
})
