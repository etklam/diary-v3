import { describe, expect, it } from 'vitest'
import cases from '../fixtures/ai-reports/quality-cases.json'
describe('synthetic AI quality rubric', () => {
  it('covers twelve distinct cases with explicit facts, prohibitions, references and gaps', () => {
    expect(cases).toHaveLength(12)
    expect(new Set(cases.map(item => item.id)).size).toBe(12)
    for (const item of cases) {
      expect(item.records.length).toBeGreaterThan(0)
      expect(item.expectedFacts.length).toBeGreaterThan(0)
      expect(item.forbiddenInferences.length).toBeGreaterThan(0)
      expect(item.requiredLimitations.length).toBeGreaterThan(0)
      for (const id of item.sourceIds) expect(item.records.some(record => record.startsWith(`${id}:`))).toBe(true)
    }
  })
})
