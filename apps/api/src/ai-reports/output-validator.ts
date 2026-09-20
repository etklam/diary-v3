import { aiAnalysisSchema } from '@diary/contracts/ai-reports'
import { AiProviderError } from './outbound-policy.js'

export function validateAiAnalysis(payload: unknown, context: { sources: Array<{ alias: string; sourceType: string }>; metrics: Array<{ id: string }> }) {
  const parsed = aiAnalysisSchema.safeParse(payload)
  if (!parsed.success) throw new AiProviderError('AI_OUTPUT_INVALID')
  const sources = new Map(context.sources.map(source => [source.alias, source.sourceType]))
  const metrics = new Set(context.metrics.map(metric => metric.id))
  const analysis = parsed.data
  for (const item of [...analysis.summary, ...analysis.decisionReview, ...analysis.positionReview, ...analysis.marketReflection, ...analysis.nextPeriodFocus, ...analysis.disciplineChecks.map(check => check.observation)]) {
    if (item.sourceIds.some(id => !sources.has(id)) || item.metricRefs.some(id => !metrics.has(id))) throw new AiProviderError('AI_OUTPUT_INVALID')
    if (item.evidenceLevel === 'recorded' && item.sourceIds.length === 0 && item.metricRefs.length === 0) throw new AiProviderError('AI_OUTPUT_INVALID')
  }
  for (const check of analysis.disciplineChecks) {
    if (sources.get(check.ruleSourceId) !== 'discipline') throw new AiProviderError('AI_OUTPUT_INVALID')
  }
  return analysis
}
