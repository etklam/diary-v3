import { z } from 'zod'
import { aiAnalysisSchema } from '@diary/contracts/ai-reports'
import { sharedPromptDefaultSchema, type SharedPromptKey } from '@diary/contracts/shared-prompts'
import type { AiMessage } from '../ai-reports/deepseek-provider.js'
import { buildAiMessages, defaultAiPrompts, immutableAiRules, validateAiTemplate } from '../ai-reports/prompt-renderer.js'
import { runSyntheticTest, syntheticContext } from '../ai-reports/admin-routes.js'
import { guruAnalysisSchema } from '@diary/contracts/guru-analysis'
import {
  buildGuruAnalysisMessages,
  defaultGuruAnalysisTemplate,
  guruAnalysisVariables,
  GURU_ANALYSIS_SYSTEM_VERSION,
  immutableGuruAnalysisRules,
  renderGuruAnalysisVariables,
  syntheticGuruAnalysisContext,
  validateGuruAnalysisTemplate,
} from '../guru-analysis/prompt.js'
import { runSyntheticGuruAnalysisTest } from '../guru-analysis/synthetic-test.js'

type Provider = Parameters<typeof runSyntheticTest>[0]
type Transport = Parameters<typeof runSyntheticTest>[3]
export interface PromptDriver {
  definition: z.infer<typeof sharedPromptDefaultSchema>
  legacyReportType?: 'weekly' | 'monthly'
  validateTemplate: (template: string) => void
  render: (template: string) => { variables: Record<string, string>; messages: AiMessage[] }
  test: (provider: Provider, template: string, transport: Transport) => Promise<{ result: Awaited<ReturnType<typeof runSyntheticTest>>['result']; analysis: unknown }>
}

function reportDriver(key: SharedPromptKey, reportType: 'weekly' | 'monthly'): PromptDriver {
  const sampleInput = syntheticContext(reportType)
  const definition = {
    key, systemVersion: 'ai-report-system-v1', template: defaultAiPrompts[reportType], guardrails: immutableAiRules,
    allowedVariables: ['locale', 'period_label', 'period_start', 'period_end'], outputSchema: z.toJSONSchema(aiAnalysisSchema),
    modelSettings: { thinking: 'disabled' as const, maxOutputTokens: 4_000 }, sampleInput,
  }
  return {
    definition, legacyReportType: reportType, validateTemplate: validateAiTemplate,
    render(template) {
      validateAiTemplate(template)
      const variables = { locale: 'en', period_label: 'Synthetic capability test', period_start: sampleInput.period.periodStart, period_end: sampleInput.period.periodEndExclusive }
      return { variables, messages: buildAiMessages({ template, locale: variables.locale, periodLabel: variables.period_label, periodStart: variables.period_start, periodEnd: variables.period_end, context: sampleInput }) }
    },
    test: (provider, template, transport) => runSyntheticTest(provider, template, reportType, transport),
  }
}

function guruAnalysisDriver(): PromptDriver {
  const sampleInput = syntheticGuruAnalysisContext()
  const definition = {
    key: 'guru.analysis' as SharedPromptKey, systemVersion: GURU_ANALYSIS_SYSTEM_VERSION, template: defaultGuruAnalysisTemplate,
    guardrails: immutableGuruAnalysisRules, allowedVariables: [...guruAnalysisVariables], outputSchema: z.toJSONSchema(guruAnalysisSchema),
    modelSettings: { thinking: 'disabled' as const, maxOutputTokens: 6_000 }, sampleInput: sampleInput as unknown as Record<string, unknown>,
  }
  return {
    definition, validateTemplate: validateGuruAnalysisTemplate,
    render: template => ({ variables: renderGuruAnalysisVariables(sampleInput), messages: buildGuruAnalysisMessages({ template, context: sampleInput }) }),
    test: (provider, template, transport) => runSyntheticGuruAnalysisTest(provider, template, transport),
  }
}

/** Each new module registers its own immutable contract, renderer, and synthetic driver. */
export const sharedPromptDrivers: Record<SharedPromptKey, PromptDriver> = {
  'ai-report.weekly': reportDriver('ai-report.weekly', 'weekly'),
  'ai-report.monthly': reportDriver('ai-report.monthly', 'monthly'),
  'guru.analysis': guruAnalysisDriver(),
}
export const legacyReportTypeFor = (key: SharedPromptKey) => sharedPromptDrivers[key].legacyReportType ?? null
export const promptDefinition = (key: SharedPromptKey) => sharedPromptDrivers[key].definition
export const validateRegisteredPromptTemplate = (key: SharedPromptKey, template: string) => sharedPromptDrivers[key].validateTemplate(template)
export const renderPrompt = (key: SharedPromptKey, template: string) => sharedPromptDrivers[key].render(template)
export const runRegisteredPromptTest = (key: SharedPromptKey, provider: Provider, template: string, transport: Transport) => sharedPromptDrivers[key].test(provider, template, transport)
