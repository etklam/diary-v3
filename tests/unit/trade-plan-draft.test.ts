import { describe, expect, it } from 'vitest'
import { formFromTradePlan, normalizeTradePlanForm, sameTradePlanForm, tradePlanDraftKey, type TradePlanForm } from '../../apps/web/app/trade-plan-draft'

function form(patch: Partial<TradePlanForm> = {}): TradePlanForm {
  return { ...formFromTradePlan(), symbol: 'ABC', ...patch }
}

describe('trade plan draft identity and dirty normalization', () => {
  it('isolates new and edit drafts by account and plan', () => {
    expect(tradePlanDraftKey('7', undefined)).toBe('trade-plan-draft:7:new')
    expect(tradePlanDraftKey('7', '12')).toBe('trade-plan-draft:7:12')
    expect(tradePlanDraftKey('8', '12')).not.toBe(tradePlanDraftKey('7', '12'))
    expect(tradePlanDraftKey(null, '12')).toBeNull()
  })

  it('treats trim and equivalent decimal values as clean after canonicalization', () => {
    const server = form({ entryPrice: '10' })
    const edited = form({ symbol: ' ABC ', entryPrice: '010.000000' })
    expect(normalizeTradePlanForm(edited).valid).toBe(true)
    expect(sameTradePlanForm(server, edited)).toBe(true)
  })

  it('keeps incomplete or invalid values dirty instead of normalizing them away', () => {
    const server = form({ entryPrice: '10' })
    expect(sameTradePlanForm(server, form({ entryPrice: '10.0000001' }))).toBe(false)
    expect(sameTradePlanForm(server, form({ entryPrice: '10', symbol: '' }))).toBe(false)
    expect(normalizeTradePlanForm(form({ symbol: '' })).valid).toBe(false)
  })
})
