import { researchQaGateSchema, type ResearchSourceRecord } from '@diary/contracts'

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Shared approval semantics; optional missing facts do not make citation or contradiction checks optional. */
export function researchQaApprovalIssue(input: {
  qa: unknown
  structured: unknown
  sources: readonly ResearchSourceRecord[]
  frozenQa?: unknown
}): string | null {
  const parsed = researchQaGateSchema.array().length(10).safeParse(input.qa)
  if (!parsed.success || new Set(parsed.data.map(gate => gate.gateId)).size !== 10 || parsed.data.some(gate => gate.severity !== 'CORE')) {
    return 'All ten distinct server-owned CORE gates are required'
  }
  if (input.frozenQa !== undefined) {
    const frozen = researchQaGateSchema.array().length(10).safeParse(input.frozenQa)
    if (!frozen.success || new Set(frozen.data.map(gate => gate.gateId)).size !== 10 || frozen.data.some(gate => gate.status === 'FAIL')) {
      return 'Frozen evidence contains an unresolved core failure'
    }
  }
  const structured = object(input.structured)
  const claims = Array.isArray(structured.claims) ? structured.claims.map(object) : []
  const eventSources = new Set(input.sources.filter(source => /(?:^|[_.-])(?:events?|calendar|earnings|economic|ir)(?:$|[_.-])/i.test(source.purpose)).map(source => source.sourceId))
  const applicablePlan = claims.some(claim => claim.type === 'plan' || claim.section === 9 || (Array.isArray(claim.planIds) && claim.planIds.length > 0))
  // Section 7 mixes volatility and events. Ambiguity requires PASS review rather than an automatic N/A.
  const applicableEvent = claims.some(claim => claim.section === 7 || (Array.isArray(claim.sourceIds) && claim.sourceIds.some(id => typeof id === 'string' && eventSources.has(id))))
  for (const gate of parsed.data) {
    const reviewed = Boolean(gate.reviewerId && gate.reviewedAt)
    const hasNote = Boolean(gate.reason?.trim() || gate.evidence.some(note => note.trim()))
    if (gate.status === 'PASS') {
      if ((gate.gateId === 'G09' || gate.gateId === 'G10') && (!reviewed || !hasNote)) return `${gate.gateId} requires explicit human review`
      continue
    }
    const notApplicable = gate.status === 'N_A' && reviewed && Boolean(gate.reason?.trim()) && (
      (gate.gateId === 'G07' && !applicablePlan) || (gate.gateId === 'G08' && !applicableEvent)
    )
    if (!notApplicable) return `${gate.gateId} must pass review for this revision`
  }
  return null
}
