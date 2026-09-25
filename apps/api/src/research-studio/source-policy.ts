/**
 * Operation-specific source rights for Research Studio.
 *
 * Availability of an endpoint does not establish permission to use its data.
 * Each operation is evaluated independently so an unknown redistribution
 * decision does not silently disable a permitted analysis workflow.
 */

export const researchSourcePurposes = [
  'automated_fetch',
  'evidence_storage',
  'llm_inference',
  'publication_of_analysis_and_excerpts',
  'raw_data_redistribution',
] as const

export type ResearchSourcePurpose = typeof researchSourcePurposes[number]
export type ResearchSourceDecision = 'allowed' | 'restricted' | 'unknown'

export type ResearchSourcePolicy = {
  sourceId: string
  provider: string
  scope: string
  decisions: Readonly<Record<ResearchSourcePurpose, ResearchSourceDecision>>
  permissions?: Readonly<Partial<Record<ResearchSourcePurpose, ResearchSourcePermission>>>
  conditions: readonly string[]
  basisUrl: string | null
  checkedAt: string
}

export type ResearchSourceUse = {
  automatedFetch: ResearchSourcePermission
  evidenceStorage: ResearchSourcePermission
  llmInference: ResearchSourcePermission
  publicationOfAnalysisAndExcerpts: ResearchSourcePermission
  rawDataRedistribution: ResearchSourcePermission
}

export type ResearchSourcePermission = {
  status: ResearchSourceDecision
  conditions: string[]
  basis: string | null
  checkedAt: string | null
}

export class SourcePolicyError extends Error {
  constructor(
    readonly code: 'SOURCE_POLICY_UNKNOWN' | 'SOURCE_POLICY_RESTRICTED',
    readonly sourceId: string,
    readonly purpose: ResearchSourcePurpose,
    message: string,
  ) {
    super(message)
    this.name = 'SourcePolicyError'
  }
}

const purposeToUseKey: Readonly<Partial<Record<ResearchSourcePurpose, keyof ResearchSourceUse>>> = {
  automated_fetch: 'automatedFetch',
  evidence_storage: 'evidenceStorage',
  llm_inference: 'llmInference',
  publication_of_analysis_and_excerpts: 'publicationOfAnalysisAndExcerpts',
}

export function sourceUseFromPolicy(policy: ResearchSourcePolicy): ResearchSourceUse {
  const permission = (purpose: ResearchSourcePurpose): ResearchSourcePermission => {
    const configured = policy.permissions?.[purpose]
    return configured ? { ...configured, conditions: [...configured.conditions] } : {
      status: policy.decisions[purpose],
      conditions: [...policy.conditions],
      basis: policy.basisUrl,
      checkedAt: policy.checkedAt,
    }
  }
  return {
    automatedFetch: permission('automated_fetch'),
    evidenceStorage: permission('evidence_storage'),
    llmInference: permission('llm_inference'),
    publicationOfAnalysisAndExcerpts: permission('publication_of_analysis_and_excerpts'),
    rawDataRedistribution: permission('raw_data_redistribution'),
  }
}

export function sourceOperationDecision(policy: ResearchSourcePolicy, purpose: ResearchSourcePurpose): ResearchSourceDecision {
  return policy.permissions?.[purpose]?.status ?? policy.decisions[purpose]
}

export function assertSourceOperation(policy: ResearchSourcePolicy, purpose: ResearchSourcePurpose): void {
  const decision = sourceOperationDecision(policy, purpose)
  if (decision === 'allowed') {
    const configured = policy.permissions?.[purpose]
    const basis = configured?.basis ?? policy.basisUrl
    const checkedAt = configured?.checkedAt ?? policy.checkedAt
    const hasBasis = typeof basis === 'string' && basis.trim().length > 0
    const hasCheckedAt = typeof checkedAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/u.test(checkedAt)
      && Number.isFinite(Date.parse(checkedAt))
    if (hasBasis && hasCheckedAt) return
    throw new SourcePolicyError('SOURCE_POLICY_UNKNOWN', policy.sourceId, purpose, `${policy.sourceId} permission for ${purpose} is missing a policy basis or valid check timestamp.`)
  }
  if (decision === 'restricted') {
    throw new SourcePolicyError('SOURCE_POLICY_RESTRICTED', policy.sourceId, purpose, `${policy.sourceId} is restricted for ${purpose}.`)
  }
  throw new SourcePolicyError('SOURCE_POLICY_UNKNOWN', policy.sourceId, purpose, `${policy.sourceId} has no verified permission for ${purpose}.`)
}

export function sourcePolicyToRecord(policy: ResearchSourcePolicy, input: {
  requestedUrl?: string | null
  resolvedUrl?: string | null
  title?: string | null
  publisher?: string | null
  retrievedAt?: string | null
  dataAsOf?: string | null
  readRange?: string | null
  evidenceLocator?: string | null
  contentHash?: string | null
} = {}) {
  return {
    sourceId: policy.sourceId,
    purpose: 'research_evidence',
    requestedUrl: input.requestedUrl ?? null,
    resolvedUrl: input.resolvedUrl ?? null,
    publisher: input.publisher ?? policy.provider,
    title: input.title ?? null,
    retrievedAt: input.retrievedAt ?? null,
    dataAsOf: input.dataAsOf ?? null,
    readRange: input.readRange ?? policy.scope,
    evidenceLocator: input.evidenceLocator ?? null,
    contentHash: input.contentHash ?? null,
    use: sourceUseFromPolicy(policy),
    limitations: [
      ...policy.conditions,
      ...researchSourcePurposes.map(purpose => {
        const permission = sourceUseFromPolicy(policy)[purpose === 'automated_fetch' ? 'automatedFetch' : purpose === 'evidence_storage' ? 'evidenceStorage' : purpose === 'llm_inference' ? 'llmInference' : purpose === 'publication_of_analysis_and_excerpts' ? 'publicationOfAnalysisAndExcerpts' : 'rawDataRedistribution']
        return `${purpose}: ${permission.status}; conditions=${permission.conditions.join(' | ')}; basis=${permission.basis ?? 'none'}; checkedAt=${permission.checkedAt ?? 'none'}`
      }),
    ],
  }
}

export function createSourcePolicy(input: Omit<ResearchSourcePolicy, 'decisions'> & {
  decisions?: Partial<Record<ResearchSourcePurpose, ResearchSourceDecision>>
}): ResearchSourcePolicy {
  const decisions = Object.fromEntries(researchSourcePurposes.map(purpose => [purpose, input.decisions?.[purpose] ?? 'unknown'])) as Record<ResearchSourcePurpose, ResearchSourceDecision>
  return { ...input, decisions }
}

/**
 * The method's source review intentionally keeps unresolved providers blocked.
 * Fixtures may provide an explicit policy, but synthetic evidence is never
 * publishable through the article workflow.
 */
export const YAHOO_RESEARCH_POLICY = createSourcePolicy({
  sourceId: 'YAHOO_CHART',
  provider: 'Yahoo Finance chart endpoint',
  scope: 'Complete daily OHLCV research bars requested by symbol and bounded range.',
  basisUrl: 'https://legal.yahoo.com/ca/en/yahoo/terms/otos/',
  checkedAt: '2026-09-24T17:41:21.300Z',
  conditions: ['Automated collection and downstream rights require an applicable verified entitlement.', 'Do not redistribute raw rows.'],
})

export const TAVILY_SEARCH_POLICY = createSourcePolicy({
  sourceId: 'TAVILY_SEARCH',
  provider: 'Tavily Search API',
  scope: 'Search result metadata used as discovery leads; snippets are not full-text evidence.',
  basisUrl: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
  checkedAt: '2026-09-24T17:41:21.300Z',
  conditions: ['A configured key and plan entitlement are required.', 'Search results do not prove that a discovered page was read.'],
})

export const purposeUseKey = purposeToUseKey

export function sourcePolicySnapshot(policy: ResearchSourcePolicy) {
  return {
    sourceId: policy.sourceId,
    provider: policy.provider,
    scope: policy.scope,
    decisions: { ...policy.decisions },
    permissions: Object.fromEntries(Object.entries(policy.permissions ?? {}).map(([purpose, permission]) => [purpose, permission ? { ...permission, conditions: [...permission.conditions] } : permission])),
    conditions: [...policy.conditions],
    basisUrl: policy.basisUrl,
    checkedAt: policy.checkedAt,
  }
}
