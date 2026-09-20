import { describe, expect, it } from 'vitest'
import { aiReportGenerateRequestSchema } from '@diary/contracts/ai-reports'
import { aiProviderDraftSchema } from '@diary/contracts/admin-ai'
const generation = { periodType: 'weekly', periodStart: '2026-09-14', confirmedRecipientRevision: 1, previewFingerprint: 'a'.repeat(64) }
describe('AI request trust boundary', () => {
  it.each(['userId', 'provider', 'baseUrl', 'apiKey', 'model', 'prompt', 'sourceIds', 'sql', 'auto', 'schedule'])('rejects owner-supplied privileged field %s', name => {
    expect(aiReportGenerateRequestSchema.safeParse({ ...generation, [name]: 'untrusted' }).success).toBe(false)
  })
  it('requires a preview fingerprint and recipient revision', () => {
    expect(aiReportGenerateRequestSchema.safeParse(generation).success).toBe(true)
    expect(aiReportGenerateRequestSchema.safeParse({ ...generation, previewFingerprint: undefined }).success).toBe(false)
    expect(aiReportGenerateRequestSchema.safeParse({ ...generation, confirmedRecipientRevision: undefined }).success).toBe(false)
  })
  it('does not accept a read-back masked credential as an implicit key replacement', () => {
    const draft = { displayName: 'Synthetic', providerType: 'deepseek', protocol: 'chat_completions', baseUrl: 'https://api.deepseek.com', model: 'fixture', thinking: 'disabled', maxInputTokens: 32000, maxOutputTokens: 4000, timeoutMs: 120000, monthlyBudgetCents: 1000, recipientName: 'Synthetic recipient', disclosureVersion: 'v1', pricingCurrency: 'USD', pricingVersion: null, inputPricePerMillionCents: null, outputPricePerMillionCents: null, reservationCostCents: 5, expectedRevision: 0, apiKeyAction: 'keep' }
    expect(aiProviderDraftSchema.safeParse(draft).success).toBe(true)
    expect(aiProviderDraftSchema.safeParse({ ...draft, apiKey: '********' }).success).toBe(false)
  })
})
