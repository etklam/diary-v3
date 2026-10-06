import { describe, expect, it } from 'vitest'
import { guruAnalysisSchema, type GuruAnalysis } from '../../packages/contracts/src/guru-analysis.js'
import { guruAnalysisCaveatKeys } from '../../packages/domain/src/guru-analysis.js'
import {
  buildGuruAnalysisMessages,
  renderGuruAnalysisVariables,
  syntheticGuruAnalysisContext,
  validateGuruAnalysisOutput,
  validateGuruAnalysisTemplate,
} from '../../apps/api/src/guru-analysis/prompt.js'

const context = syntheticGuruAnalysisContext()

function statement(overrides: Partial<GuruAnalysis['executiveSummary'][number]> = {}) {
  return { text: 'Statement.', kind: 'interpretation' as const, factRefs: [], positionKeys: [], ...overrides }
}

function analysis(overrides: Partial<GuruAnalysis> = {}): GuruAnalysis {
  return {
    executiveSummary: [statement()], portfolioDirection: [], convictionPositions: [], newPositions: [],
    increasedPositions: [], reducedPositions: [], exitedPositions: [], sectorAndThemeChange: [],
    concentrationChange: [], turnoverInterpretation: [], historicalContext: [], consensusContext: [],
    risks: [statement()], takeaways: [statement()], caveatIds: [...guruAnalysisCaveatKeys], ...overrides,
  }
}

describe('Guru analysis structured context', () => {
  it('is deterministic for the same prepared input', () => {
    expect(JSON.stringify(syntheticGuruAnalysisContext())).toBe(JSON.stringify(context))
  })

  it('carries prepared facts, the disclosure identifiers and no raw filing text', () => {
    expect(context.facts.map(fact => fact.id)).toEqual(expect.arrayContaining([
      'portfolio.reportedValueUsd', 'concentration.topTen', 'turnover.band', 'actions.NEW', 'holding.rank-1',
    ]))
    expect(context.disclosureIds).toEqual([...guruAnalysisCaveatKeys])
    expect(JSON.stringify(context)).not.toMatch(/<\?xml|informationTable|sourceData/i)
  })

  it('separates the quarter facts from any interpretation field', () => {
    expect(Object.keys(context)).not.toContain('analysis')
    expect(context.quarter).toMatchObject({ periodEnd: '2026-03-31', status: 'READY' })
  })

  it('renders only registry-defined variables into the user-editable guidance', () => {
    const variables = renderGuruAnalysisVariables(context)
    expect(variables.guruName).toBe('Synthetic Guru')
    expect(variables.concentration).toContain('top ten 100.00000000%')
    const [system, user] = buildGuruAnalysisMessages({ template: 'Review {{guruName}} for {{period}}.', context })
    expect(system!.content).toContain('Review Synthetic Guru for 2026-03-31.')
    expect(system!.content).toContain('subordinate to the immutable rules')
    expect(system!.content).toContain('guru_context.disclosureIds')
    expect(user!.content).toContain('guru_context')
  })

  it('rejects an unknown prompt variable', () => {
    expect(() => validateGuruAnalysisTemplate('Review {{guruName}} and {{secretField}}.')).toThrow('AI_PROMPT_INVALID')
    expect(() => validateGuruAnalysisTemplate('Unbalanced {{guruName}}}}')).toThrow('AI_PROMPT_INVALID')
    expect(validateGuruAnalysisTemplate('Review {{guruName}}.')).toBe('Review {{guruName}}.')
  })
})

describe('Guru analysis output validation', () => {
  it('accepts a cited analysis and replaces the caveat list with the code-owned set', () => {
    const payload = analysis({
      executiveSummary: [statement({ kind: 'fact', factRefs: ['portfolio.reportedValueUsd'], positionKeys: ['synthetic-a'] })],
      caveatIds: [...guruAnalysisCaveatKeys, 'DELAYED_QUARTER_END'],
    })
    expect(validateGuruAnalysisOutput(payload, context).caveatIds).toEqual([...guruAnalysisCaveatKeys])
  })

  it('rejects malformed output, unknown citations and uncited facts', () => {
    expect(() => validateGuruAnalysisOutput({ executiveSummary: 'not an array' }, context)).toThrow('AI_OUTPUT_INVALID')
    expect(() => validateGuruAnalysisOutput(analysis({ risks: [statement({ factRefs: ['invented.metric'] })] }), context)).toThrow('AI_OUTPUT_INVALID')
    expect(() => validateGuruAnalysisOutput(analysis({ risks: [statement({ positionKeys: ['invented-position'] })] }), context)).toThrow('AI_OUTPUT_INVALID')
    expect(() => validateGuruAnalysisOutput(analysis({ takeaways: [statement({ kind: 'fact' })] }), context)).toThrow('AI_OUTPUT_INVALID')
  })

  it('rejects output that drops any required 13F disclosure', () => {
    expect(() => validateGuruAnalysisOutput(analysis({ caveatIds: ['DELAYED_QUARTER_END'] }), context)).toThrow('AI_OUTPUT_INVALID')
  })

  it('keeps the published schema strict about extra keys', () => {
    expect(guruAnalysisSchema.safeParse({ ...analysis(), extra: true }).success).toBe(false)
  })
})
