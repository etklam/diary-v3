import { describe, expect, it } from 'vitest'
import { generateMarketSummary } from '../../packages/domain/src/market-rotation/summary'
import type { SummaryInput } from '../../packages/domain/src/market-rotation/summary'
// Helper to build a minimal valid input with overrides
function makeInput(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    marketState: 'risk_on',
    breadthCondition: 'constructive',
    breadthConfirmation: 'confirming',
    topImproving: [],
    bottomWeakening: [],
    above50dRatio: 0.6,
    averageRsi: null,
    ...overrides,
  }
}

describe('generateMarketSummary', () => {
  describe('market state description', () => {
    it('includes Risk-on and Broad participation for risk_on + broad_participation + confirming', () => {
      const summary = generateMarketSummary(
        makeInput({
          marketState: 'risk_on',
          breadthCondition: 'broad_participation',
          breadthConfirmation: 'confirming',
          above50dRatio: 0.75,
        }),
      )
      expect(summary).toContain('Risk-on')
      expect(summary).toContain('Broad participation')
    })

    it('includes Risk-off and weak for risk_off + weak_breadth + confirming', () => {
      const summary = generateMarketSummary(
        makeInput({
          marketState: 'risk_off',
          breadthCondition: 'weak_breadth',
          breadthConfirmation: 'confirming',
          above50dRatio: 0.2,
        }),
      )
      expect(summary).toContain('Risk-off')
      expect(summary).toContain('weak')
    })

    it('includes unclear for unknown market state', () => {
      const summary = generateMarketSummary(
        makeInput({
          marketState: 'unknown',
          breadthCondition: 'unknown',
          breadthConfirmation: 'unknown',
          above50dRatio: null,
        }),
      )
      expect(summary).toContain('unclear')
    })
  })

  describe('breadth description', () => {
    it('includes insufficient for unknown breadth', () => {
      const summary = generateMarketSummary(
        makeInput({
          breadthCondition: 'unknown',
          above50dRatio: null,
        }),
      )
      expect(summary).toContain('insufficient')
    })

    it('displays 67% when above50dRatio is 0.67', () => {
      const summary = generateMarketSummary(
        makeInput({
          breadthCondition: 'constructive',
          above50dRatio: 0.67,
        }),
      )
      expect(summary).toContain('67%')
    })

    it('uses N/A when above50dRatio is null but breadth is not unknown', () => {
      const summary = generateMarketSummary(
        makeInput({
          breadthCondition: 'narrowing',
          above50dRatio: null,
        }),
      )
      expect(summary).toContain('N/A')
    })
  })

  describe('leadership description', () => {
    it('includes neutral Leaders wording and sector names when topImproving has entries', () => {
      const summary = generateMarketSummary(
        makeInput({
          topImproving: [
            { symbol: 'XLK', sectorName: 'Technology' },
            { symbol: 'XLF', sectorName: 'Financials' },
            { symbol: 'XLI', sectorName: 'Industrials' },
          ],
        }),
      )
      expect(summary).toContain('Leaders')
      expect(summary).toContain('Technology')
      expect(summary).toContain('Financials')
      expect(summary).toContain('Industrials')
    })

    it('falls back to symbol when sectorName is null', () => {
      const summary = generateMarketSummary(
        makeInput({
          topImproving: [{ symbol: 'XLK', sectorName: null }],
        }),
      )
      expect(summary).toContain('Leaders')
      expect(summary).toContain('XLK')
    })

    it('does not include Leaders when topImproving is empty', () => {
      const summary = generateMarketSummary(
        makeInput({
          topImproving: [],
        }),
      )
      expect(summary).not.toContain('Leaders')
    })
  })

  describe('weakening description', () => {
    it('includes Weakening groups when bottomWeakening has entries', () => {
      const summary = generateMarketSummary(
        makeInput({
          bottomWeakening: [
            { symbol: 'XLU', sectorName: 'Utilities' },
            { symbol: 'XLB', sectorName: 'Materials' },
          ],
        }),
      )
      expect(summary).toContain('Weakening groups')
      expect(summary).toContain('Utilities')
      expect(summary).toContain('Materials')
    })
  })

  describe('RSI description', () => {
    it('includes Average RSI when averageRsi is not null', () => {
      const summary = generateMarketSummary(
        makeInput({
          averageRsi: 58.3,
        }),
      )
      expect(summary).toContain('Average RSI')
      expect(summary).toContain('58')
    })

    it('does not include Average RSI when averageRsi is null', () => {
      const summary = generateMarketSummary(
        makeInput({
          averageRsi: null,
        }),
      )
      expect(summary).not.toContain('Average RSI')
    })
  })

  describe('confirmation description', () => {
    it('includes confirmation text for confirming', () => {
      const summary = generateMarketSummary(
        makeInput({ breadthConfirmation: 'confirming' }),
      )
      expect(summary).toContain('confirms')
    })

    it('includes mixed text for mixed confirmation', () => {
      const summary = generateMarketSummary(
        makeInput({ breadthConfirmation: 'mixed' }),
      )
      expect(summary).toContain('mixed signals')
    })

    it('includes warning text for warning confirmation', () => {
      const summary = generateMarketSummary(
        makeInput({ breadthConfirmation: 'warning' }),
      )
      expect(summary).toContain('warns')
    })

    it('omits confirmation text for unknown', () => {
      const summary = generateMarketSummary(
        makeInput({ breadthConfirmation: 'unknown' }),
      )
      expect(summary).not.toContain('confirms')
      expect(summary).not.toContain('mixed signals')
      expect(summary).not.toContain('warns')
    })
  })

  describe('full integration output', () => {
    it('produces a coherent multi-sentence summary for risk_on scenario', () => {
      const summary = generateMarketSummary({
        marketState: 'risk_on',
        breadthCondition: 'broad_participation',
        breadthConfirmation: 'confirming',
        topImproving: [
          { symbol: 'XLK', sectorName: 'Technology' },
          { symbol: 'XLF', sectorName: 'Financials' },
          { symbol: 'XLI', sectorName: 'Industrials' },
        ],
        bottomWeakening: [
          { symbol: 'XLU', sectorName: 'Utilities' },
          { symbol: 'XLB', sectorName: 'Materials' },
        ],
        above50dRatio: 0.75,
        averageRsi: 62,
          })

      // Should be multiple sentences
      const sentences = summary.split('. ').filter((s) => s.length > 0)
      expect(sentences.length).toBeGreaterThanOrEqual(3)

      // Should contain all key elements
      expect(summary).toContain('Risk-on')
      expect(summary).toContain('Broad participation')
      expect(summary).toContain('75%')
      expect(summary).toContain('confirms')
      expect(summary).toContain('Leaders')
      expect(summary).toContain('Weakening groups')
      expect(summary).toContain('Average RSI')
    })

    it('produces minimal summary for all-unknown scenario', () => {
      const summary = generateMarketSummary({
        marketState: 'unknown',
        breadthCondition: 'unknown',
        breadthConfirmation: 'unknown',
        topImproving: [],
        bottomWeakening: [],
        above50dRatio: null,
        averageRsi: null,
          })

      expect(summary).toContain('unclear')
      expect(summary).toContain('insufficient')
      expect(summary).not.toContain('Leaders')
      expect(summary).not.toContain('Weakening groups')
      expect(summary).not.toContain('Average RSI')
    })
  })
})
