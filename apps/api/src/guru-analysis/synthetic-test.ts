import type { aiProviderConfigVersions } from '@diary/db'
import { generateAiAnalysis } from '../ai-reports/deepseek-provider.js'
import { AiProviderError, type AiTransport } from '../ai-reports/outbound-policy.js'
import { decryptAiSecret } from '../ai-reports/secrets.js'
import { buildGuruAnalysisMessages, syntheticGuruAnalysisContext, validateGuruAnalysisOutput } from './prompt.js'

/** Admin capability test. It uses the synthetic fixture, never a tracked manager. */
export async function runSyntheticGuruAnalysisTest(
  provider: typeof aiProviderConfigVersions.$inferSelect,
  template: string,
  transport: AiTransport | undefined,
) {
  if (!provider.encryptedApiKey) throw new AiProviderError('AI_NOT_CONFIGURED')
  const context = syntheticGuruAnalysisContext()
  const result = await generateAiAnalysis({
    baseUrl: provider.baseUrl,
    apiKey: decryptAiSecret(provider.encryptedApiKey, 'provider-api-key'),
    model: provider.model,
    timeoutMs: provider.timeoutMs,
    maxOutputTokens: provider.maxOutputTokens,
    ...(provider.thinking === 'enabled' ? { thinking: 'enabled' as const } : {}),
    messages: buildGuruAnalysisMessages({ template, context }),
  }, transport)
  return { result, analysis: validateGuruAnalysisOutput(result.analysis, context) as unknown }
}
