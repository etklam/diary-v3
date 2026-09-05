import { describe, expect, it } from 'vitest'
import { decideBetaAllocation } from '../packages/domain/src/beta-allocation'
import type { BetaAllocationInput } from '../packages/domain/src/beta-allocation'

function makeInput(overrides: Partial<BetaAllocationInput> = {}): BetaAllocationInput {
  return {
    marketState: 'risk_on',
    breadthConfirmation: 'confirming',
    above50dRatio: 0.6,
    averageRsi: 55,
    leadership: {
      topImproving: ['XLK', 'XLF'],
      bottomWeakening: ['XLU', 'XLB'],
    },
    ...overrides,
  }
}

describe('decideBetaAllocation', () => {
  describe('decision table — 20 cells', () => {
    describe('risk_on', () => {
      it('risk_on + confirming => aggressive 60/30/10', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'confirming' }))
        expect(r.suggestedMode).toBe('aggressive')
        expect(r.highBetaTargetPct).toBe(60)
        expect(r.coreIndexTargetPct).toBe(30)
        expect(r.cashTargetPct).toBe(10)
      })

      it('risk_on + mixed => balanced 45/45/10', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'mixed' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(45)
        expect(r.coreIndexTargetPct).toBe(45)
        expect(r.cashTargetPct).toBe(10)
      })

      it('risk_on + warning => balanced 40/45/15', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'warning' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(40)
        expect(r.coreIndexTargetPct).toBe(45)
        expect(r.cashTargetPct).toBe(15)
      })

      it('risk_on + unknown => balanced 45/45/10', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'unknown' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(45)
        expect(r.coreIndexTargetPct).toBe(45)
        expect(r.cashTargetPct).toBe(10)
      })
    })

    describe('neutral', () => {
      it('neutral + confirming => balanced 40/50/10', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'neutral', breadthConfirmation: 'confirming' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(40)
        expect(r.coreIndexTargetPct).toBe(50)
        expect(r.cashTargetPct).toBe(10)
      })

      it('neutral + mixed => balanced 30/60/10', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'neutral', breadthConfirmation: 'mixed' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(30)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(10)
      })

      it('neutral + warning => defensive 20/60/20', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'neutral', breadthConfirmation: 'warning' }))
        expect(r.suggestedMode).toBe('defensive')
        expect(r.highBetaTargetPct).toBe(20)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(20)
      })

      it('neutral + unknown => balanced 30/60/10', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'neutral', breadthConfirmation: 'unknown' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(30)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(10)
      })
    })

    describe('defensive', () => {
      it('defensive + confirming => balanced 25/55/20', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'defensive', breadthConfirmation: 'confirming' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(25)
        expect(r.coreIndexTargetPct).toBe(55)
        expect(r.cashTargetPct).toBe(20)
      })

      it('defensive + mixed => defensive 10/60/30', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'defensive', breadthConfirmation: 'mixed' }))
        expect(r.suggestedMode).toBe('defensive')
        expect(r.highBetaTargetPct).toBe(10)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(30)
      })

      it('defensive + warning => defensive 10/50/40', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'defensive', breadthConfirmation: 'warning' }))
        expect(r.suggestedMode).toBe('defensive')
        expect(r.highBetaTargetPct).toBe(10)
        expect(r.coreIndexTargetPct).toBe(50)
        expect(r.cashTargetPct).toBe(40)
      })

      it('defensive + unknown => defensive 10/60/30', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'defensive', breadthConfirmation: 'unknown' }))
        expect(r.suggestedMode).toBe('defensive')
        expect(r.highBetaTargetPct).toBe(10)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(30)
      })
    })

    describe('risk_off', () => {
      it('risk_off + confirming => capital_preservation 0/40/60', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_off', breadthConfirmation: 'confirming' }))
        expect(r.suggestedMode).toBe('capital_preservation')
        expect(r.highBetaTargetPct).toBe(0)
        expect(r.coreIndexTargetPct).toBe(40)
        expect(r.cashTargetPct).toBe(60)
      })

      it('risk_off + mixed => capital_preservation 0/40/60', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_off', breadthConfirmation: 'mixed' }))
        expect(r.suggestedMode).toBe('capital_preservation')
        expect(r.highBetaTargetPct).toBe(0)
        expect(r.coreIndexTargetPct).toBe(40)
        expect(r.cashTargetPct).toBe(60)
      })

      it('risk_off + warning => capital_preservation 0/30/70', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_off', breadthConfirmation: 'warning' }))
        expect(r.suggestedMode).toBe('capital_preservation')
        expect(r.highBetaTargetPct).toBe(0)
        expect(r.coreIndexTargetPct).toBe(30)
        expect(r.cashTargetPct).toBe(70)
      })

      it('risk_off + unknown => capital_preservation 0/40/60', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'risk_off', breadthConfirmation: 'unknown' }))
        expect(r.suggestedMode).toBe('capital_preservation')
        expect(r.highBetaTargetPct).toBe(0)
        expect(r.coreIndexTargetPct).toBe(40)
        expect(r.cashTargetPct).toBe(60)
      })
    })

    describe('unknown', () => {
      it('unknown + confirming => balanced 30/60/10', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'unknown', breadthConfirmation: 'confirming' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(30)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(10)
      })

      it('unknown + mixed => balanced 25/60/15', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'unknown', breadthConfirmation: 'mixed' }))
        expect(r.suggestedMode).toBe('balanced')
        expect(r.highBetaTargetPct).toBe(25)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(15)
      })

      it('unknown + warning => defensive 10/60/30', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'unknown', breadthConfirmation: 'warning' }))
        expect(r.suggestedMode).toBe('defensive')
        expect(r.highBetaTargetPct).toBe(10)
        expect(r.coreIndexTargetPct).toBe(60)
        expect(r.cashTargetPct).toBe(30)
      })

      it('unknown + unknown => unknown 0/50/50', () => {
        const r = decideBetaAllocation(makeInput({ marketState: 'unknown', breadthConfirmation: 'unknown' }))
        expect(r.suggestedMode).toBe('unknown')
        expect(r.highBetaTargetPct).toBe(0)
        expect(r.coreIndexTargetPct).toBe(50)
        expect(r.cashTargetPct).toBe(50)
      })
    })
  })

  describe('suggestedBetaLevel formula', () => {
    it('aggressive => 1.30', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'confirming' }))
      expect(r.suggestedBetaLevel).toBe(1.3)
    })

    it('balanced => 1.00', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'mixed' }))
      expect(r.suggestedBetaLevel).toBe(1.0)
    })

    it('defensive => 0.50', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'neutral', breadthConfirmation: 'warning' }))
      expect(r.suggestedBetaLevel).toBe(0.5)
    })

    it('capital_preservation => 0.00', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'risk_off', breadthConfirmation: 'confirming' }))
      expect(r.suggestedBetaLevel).toBe(0)
    })

    it('unknown => null', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'unknown', breadthConfirmation: 'unknown' }))
      expect(r.suggestedBetaLevel).toBeNull()
    })
  })

  describe('warning rules', () => {
    it('warns when above50dRatio < 0.35', () => {
      const r = decideBetaAllocation(makeInput({ above50dRatio: 0.2 }))
      expect(r.warnings.some((w) => w.includes('breadth ratio'))).toBe(true)
    })

    it('warns when averageRsi > 70', () => {
      const r = decideBetaAllocation(makeInput({ averageRsi: 75 }))
      expect(r.warnings.some((w) => w.includes('overbought'))).toBe(true)
    })

    it('warns on risk_on + warning breadth contradiction', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'warning' }))
      expect(r.warnings.some((w) => w.includes('contradiction') || w.includes('conflicting'))).toBe(true)
    })

    it('warns when topImproving is empty', () => {
      const r = decideBetaAllocation(makeInput({ leadership: { topImproving: [], bottomWeakening: [] } }))
      expect(r.warnings.some((w) => w.includes('leadership') || w.includes('No leading'))).toBe(true)
    })

    it('warns when bottomWeakening contains leadership ETF (QQQ)', () => {
      const r = decideBetaAllocation(
        makeInput({ leadership: { topImproving: ['XLK'], bottomWeakening: ['QQQ'] } }),
      )
      expect(r.warnings.some((w) => w.includes('QQQ') || w.includes('leadership ETF'))).toBe(true)
    })

    it('warns when bottomWeakening contains SOXX', () => {
      const r = decideBetaAllocation(
        makeInput({ leadership: { topImproving: ['XLK'], bottomWeakening: ['SOXX'] } }),
      )
      expect(r.warnings.some((w) => w.includes('SOXX') || w.includes('leadership ETF'))).toBe(true)
    })

    it('warns when bottomWeakening contains SMH, XLK, IGV, QQQM', () => {
      for (const sym of ['SMH', 'XLK', 'IGV', 'QQQM']) {
        const r = decideBetaAllocation(
          makeInput({ leadership: { topImproving: ['XLF'], bottomWeakening: [sym] } }),
        )
        expect(r.warnings.some((w) => w.includes(sym))).toBe(true)
      }
    })

    it('does NOT warn on leadership ETF when bottomWeakening is clean', () => {
      const r = decideBetaAllocation(
        makeInput({ leadership: { topImproving: ['XLK'], bottomWeakening: ['XLU', 'XLB'] } }),
      )
      expect(r.warnings.some((w) => w.includes('leadership ETF'))).toBe(false)
    })
  })

  describe('explanation output', () => {
    it('includes risk-on explanation for risk_on + confirming', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'risk_on', breadthConfirmation: 'confirming' }))
      expect(r.explanation.length).toBeGreaterThan(10)
      expect(r.explanation.toLowerCase()).toContain('risk-on')
    })

    it('includes capital preservation explanation for risk_off', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'risk_off', breadthConfirmation: 'confirming' }))
      expect(r.explanation.toLowerCase()).toContain('risk-off')
    })

    it('includes unclear explanation for unknown + unknown', () => {
      const r = decideBetaAllocation(makeInput({ marketState: 'unknown', breadthConfirmation: 'unknown' }))
      expect(r.explanation.toLowerCase()).toContain('unclear')
    })

    it('explanation is non-empty for every table cell', () => {
      const states: BetaAllocationInput['marketState'][] = ['risk_on', 'neutral', 'defensive', 'risk_off', 'unknown']
      const breadths: BetaAllocationInput['breadthConfirmation'][] = ['confirming', 'mixed', 'warning', 'unknown']
      for (const ms of states) {
        for (const br of breadths) {
          const r = decideBetaAllocation(makeInput({ marketState: ms, breadthConfirmation: br }))
          expect(r.explanation.length).toBeGreaterThan(10)
        }
      }
    })
  })

  describe('determinism', () => {
    it('returns identical output for identical input', () => {
      const input = makeInput({ marketState: 'neutral', breadthConfirmation: 'mixed' })
      const a = decideBetaAllocation(input)
      const b = decideBetaAllocation(input)
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    })

    it('normalizes 70.0 RSI boundary — not overbought at exactly 70', () => {
      const r = decideBetaAllocation(makeInput({ averageRsi: 70 }))
      expect(r.warnings.some((w) => w.includes('overbought'))).toBe(false)
    })

    it('normalizes 0.35 ratio boundary — not weak at exactly 0.35', () => {
      const r = decideBetaAllocation(makeInput({ above50dRatio: 0.35 }))
      expect(r.warnings.some((w) => w.includes('breadth ratio'))).toBe(false)
    })

    it('null above50dRatio does not trigger ratio warning', () => {
      const r = decideBetaAllocation(makeInput({ above50dRatio: null }))
      expect(r.warnings.some((w) => w.includes('breadth ratio'))).toBe(false)
    })

    it('null averageRsi does not trigger overbought warning', () => {
      const r = decideBetaAllocation(makeInput({ averageRsi: null }))
      expect(r.warnings.some((w) => w.includes('overbought'))).toBe(false)
    })
  })

  describe('fallback', () => {
    it('falls back when market state combination is unmapped', () => {
      const bogus = makeInput({ marketState: 'bogus_state' as never, breadthConfirmation: 'confirming' })
      const r = decideBetaAllocation(bogus)
      expect(r.suggestedMode).toBe('unknown')
      expect(r.warnings.some((w) => w.includes('fallback') || w.includes('Unmapped'))).toBe(true)
    })
  })
})
