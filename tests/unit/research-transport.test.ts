import { describe, expect, it, vi } from 'vitest'
import { AiProviderError, type AiTransport } from '../../apps/api/src/ai-reports/outbound-policy.js'
import { createOpenRouterResearchTransport, OPENROUTER_BASE_URL, ResearchTransportError } from '../../apps/api/src/research-studio/transport.js'

const request = {
  baseUrl: OPENROUTER_BASE_URL,
  model: 'openrouter/free' as const,
  apiKey: 'synthetic-fixture-key',
  maxInputTokens: 64_000,
  maxOutputTokens: 6_000,
  timeoutMs: 1_000,
  payload: '{"synthetic":true}',
}

function completion(input: Record<string, unknown> = {}) {
  return {
    id: 'synthetic-request-id',
    model: 'openrouter/free',
    choices: [{ finish_reason: 'stop', message: { content: '{"schemaVersion":"research-draft-v1"}', refusal: null, tool_calls: null } }],
    ...input,
  }
}

describe('Research Studio OpenRouter transport', () => {
  it('sends one minimal chat-completions request to the fixed HTTPS endpoint', async () => {
    const underlying = vi.fn<AiTransport>(async () => ({ status: 200, body: JSON.stringify(completion()), retryAfter: null }))
    const transport = createOpenRouterResearchTransport(underlying)

    const result = await transport.generate(request)

    expect(underlying).toHaveBeenCalledTimes(1)
    const sent = underlying.mock.calls[0]![0]
    expect(sent).toMatchObject({
      baseUrl: OPENROUTER_BASE_URL,
      path: 'chat/completions',
      apiKey: request.apiKey,
      timeoutMs: request.timeoutMs,
      allowedBaseUrls: [OPENROUTER_BASE_URL],
    })
    expect(sent.body).toMatchObject({ model: 'openrouter/free', stream: false, max_tokens: request.maxOutputTokens })
    expect(sent.body).not.toHaveProperty('response_format')
    expect(sent.body).not.toHaveProperty('tools')
    expect(result).toMatchObject({ inputTokens: null, outputTokens: null, reasoningTokens: null, reportedCostUsd: null })
  })

  it('accepts explicit null refusal and tool-call fields and preserves actual usage metadata', async () => {
    const transport = createOpenRouterResearchTransport(async () => ({
      status: 200,
      body: JSON.stringify(completion({
        usage: { prompt_tokens: 40, completion_tokens: 19, completion_tokens_details: { reasoning_tokens: 3 }, cost: '0.000004' },
      })),
      retryAfter: null,
    }))

    await expect(transport.generate(request)).resolves.toMatchObject({
      model: 'openrouter/free',
      requestId: 'synthetic-request-id',
      inputTokens: 40,
      outputTokens: 19,
      reasoningTokens: 3,
      reportedCostUsd: '0.000004',
    })
  })

  it.each([
    { finish_reason: 'length', message: { content: '{}' } },
    { finish_reason: 'stop', message: { content: '{}', refusal: 'synthetic refusal' } },
    { finish_reason: 'stop', message: { content: '{}', tool_calls: [{ id: 'synthetic-call' }] } },
  ])('rejects a non-final or non-plain completion as a known invalid output', async choice => {
    const transport = createOpenRouterResearchTransport(async () => ({ status: 200, body: JSON.stringify({ choices: [choice] }), retryAfter: null }))

    await expect(transport.generate(request)).rejects.toMatchObject({ code: 'RESEARCH_OUTPUT_INVALID', outcomeUnknown: false })
  })

  it('treats a response-size failure after dispatch as an unknown outcome', async () => {
    const transport = createOpenRouterResearchTransport(async () => { throw new AiProviderError('AI_OUTPUT_INVALID') })

    await expect(transport.generate(request)).rejects.toMatchObject({ code: 'RESEARCH_PROVIDER_UNAVAILABLE', outcomeUnknown: true })
  })

  it.each([429, 500])('does not retry HTTP status %i and marks only server failures unknown', async status => {
    const underlying = vi.fn<AiTransport>(async () => ({ status, body: 'do not reveal or parse upstream text', retryAfter: '10' }))
    const transport = createOpenRouterResearchTransport(underlying)

    const result = transport.generate(request)
    await expect(result).rejects.toMatchObject({
      code: 'RESEARCH_PROVIDER_UNAVAILABLE',
      outcomeUnknown: status >= 500,
    })
    await expect(result).rejects.toBeInstanceOf(ResearchTransportError)
    expect(underlying).toHaveBeenCalledTimes(1)
  })

  it('rejects an alternate endpoint before any transport call', async () => {
    const underlying = vi.fn<AiTransport>(async () => ({ status: 200, body: JSON.stringify(completion()), retryAfter: null }))
    const transport = createOpenRouterResearchTransport(underlying)

    await expect(transport.generate({ ...request, baseUrl: 'https://provider.example.invalid' })).rejects.toMatchObject({ code: 'RESEARCH_PROVIDER_ERROR', outcomeUnknown: false })
    expect(underlying).not.toHaveBeenCalled()
  })
})
