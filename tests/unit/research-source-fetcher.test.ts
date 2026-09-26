import { describe, expect, it, vi } from 'vitest'
import { createPinnedSourceTransport } from '../../apps/api/src/research-studio/source-fetcher.js'

const input = {
  url: 'https://research.example.test/source',
  allowedBaseUrls: ['https://research.example.test'],
}

describe('pinned research source transport deadlines', () => {
  it('includes a never-resolving DNS lookup in the request deadline', async () => {
    const resolveEndpoint = vi.fn(async () => new Promise<never>(() => undefined))
    const transport = createPinnedSourceTransport({ resolveEndpoint })

    await expect(transport({ ...input, timeoutMs: 10 })).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' })
    expect(resolveEndpoint).toHaveBeenCalledOnce()
  })

  it('does not start DNS or an outbound socket after pre-abort', async () => {
    const resolveEndpoint = vi.fn(async () => ({ url: new URL(input.url), address: { address: '8.8.8.8', family: 4 } }))
    const transport = createPinnedSourceTransport({ resolveEndpoint })

    await expect(transport({ ...input, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' })
    expect(resolveEndpoint).not.toHaveBeenCalled()
  })

  it('stops DNS immediately when the caller aborts during resolution', async () => {
    const controller = new AbortController()
    const resolveEndpoint = vi.fn(async (_origin: string, _allowed: readonly string[], _signal: AbortSignal) => {
      controller.abort()
      return new Promise<never>(() => undefined)
    })
    const transport = createPinnedSourceTransport({ resolveEndpoint })

    await expect(transport({ ...input, timeoutMs: 1_000, signal: controller.signal })).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' })
    expect(resolveEndpoint).toHaveBeenCalledOnce()
  })
})
