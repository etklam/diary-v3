import { z } from 'zod'
import { aiHttpsTransport, AiProviderError, type AiTransport } from './outbound-policy.js'
export { AiProviderError } from './outbound-policy.js'
export interface AiMessage { role: 'system' | 'user'; content: string }
export interface AiProviderConfig { baseUrl: string; apiKey: string; model: string; timeoutMs: number; maxOutputTokens: number; thinking?: 'enabled' | 'disabled'; signal?: AbortSignal }
const tokenCount = z.number().int().nonnegative().max(2_147_483_647)
const usageSchema = z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount, prompt_cache_hit_tokens: tokenCount.optional(), prompt_cache_miss_tokens: tokenCount.optional() })
const responseSchema = z.object({
  id: z.string().max(200).optional(),
  choices: z.array(z.object({ finish_reason: z.literal('stop'), message: z.object({ content: z.string().min(1).max(200_000), tool_calls: z.never().optional(), refusal: z.null().optional() }) })).length(1),
  usage: usageSchema.nullish(),
})
function checkHttp(status: number, retryAfter: string | null) {
  if (status >= 200 && status < 300) return
  if (status === 429) throw new AiProviderError('AI_PROVIDER_RATE_LIMITED', retryAfter && /^\d+$/.test(retryAfter) ? Math.min(Number(retryAfter), 86_400) : null)
  if (status === 401 || status === 403 || status === 402) throw new AiProviderError('AI_NOT_CONFIGURED')
  throw new AiProviderError('AI_PROVIDER_UNAVAILABLE')
}
export async function generateAiAnalysis(config: AiProviderConfig & { messages: AiMessage[] }, transport: AiTransport = aiHttpsTransport) {
  const started = Date.now()
  const response = await transport({ ...config, path: 'chat/completions', body: {
    model: config.model, messages: config.messages, stream: false, response_format: { type: 'json_object' }, max_tokens: config.maxOutputTokens,
    ...(config.thinking ? { thinking: { type: config.thinking } } : {}),
  } })
  checkHttp(response.status, response.retryAfter)
  if (Buffer.byteLength(response.body) > 512_000) throw new AiProviderError('AI_OUTPUT_INVALID')
  try {
    const parsed = responseSchema.parse(JSON.parse(response.body))
    const analysis: unknown = JSON.parse(parsed.choices[0]!.message.content)
    return { analysis, usage: parsed.usage ? { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens, cacheHitTokens: parsed.usage.prompt_cache_hit_tokens ?? null, cacheMissTokens: parsed.usage.prompt_cache_miss_tokens ?? null } : null, requestId: parsed.id ?? null, latencyMs: Date.now() - started }
  } catch { throw new AiProviderError('AI_OUTPUT_INVALID') }
}
export async function listAiModels(config: Pick<AiProviderConfig, 'baseUrl' | 'apiKey' | 'timeoutMs' | 'signal'>, transport: AiTransport = aiHttpsTransport) {
  const response = await transport({ ...config, path: 'models' })
  checkHttp(response.status, response.retryAfter)
  if (Buffer.byteLength(response.body) > 512_000) throw new AiProviderError('AI_OUTPUT_INVALID')
  try { return z.object({ data: z.array(z.object({ id: z.string().min(1).max(200) })).max(1000) }).parse(JSON.parse(response.body)).data.map(item => item.id) }
  catch { throw new AiProviderError('AI_OUTPUT_INVALID') }
}
