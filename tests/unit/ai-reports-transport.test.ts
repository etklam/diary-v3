import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ dnsCalls: 0, requestCalls: 0, status: 200, body: '{}', pinned: '', hostname: '', family: 0 }))
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => {
  state.dnsCalls++
  // A second resolution would model rebinding to a private address.
  return [{ address: state.dnsCalls === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }]
}) }))
vi.mock('node:https', () => ({ request: (url: URL, options: { family: number; lookup: (host: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => void }, onResponse: (response: EventEmitter & { statusCode: number; headers: object }) => void) => {
  state.requestCalls++
  state.hostname = url.hostname
  state.family = options.family
  options.lookup(url.hostname, {}, (_error, address) => { state.pinned = address })
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn(), end: () => {
    const response = Object.assign(new EventEmitter(), { statusCode: state.status, headers: { location: 'http://127.0.0.1/secret' } })
    onResponse(response)
    response.emit('data', Buffer.from(state.body))
    response.emit('end')
  } })
  return req
} }))
import { aiHttpsTransport } from '../../apps/api/src/ai-reports/outbound-policy.js'
describe('AI socket DNS pinning', () => {
  it('uses one verified lookup, preserves TLS hostname and never follows a redirect', async () => {
    state.status = 302
    const response = await aiHttpsTransport({ baseUrl: 'https://api.deepseek.com', path: 'models', apiKey: 'synthetic', timeoutMs: 1000 })
    expect(response.status).toBe(302)
    expect(state.dnsCalls).toBe(1)
    expect(state.requestCalls).toBe(1)
    expect(state.pinned).toBe('8.8.8.8')
    expect(state.hostname).toBe('api.deepseek.com')
    expect(state.family).toBe(4)
  })
  it('rejects a mixed or rebound address before a second socket can open', async () => {
    await expect(aiHttpsTransport({ baseUrl: 'https://api.deepseek.com', path: 'models', apiKey: 'synthetic', timeoutMs: 1000 })).rejects.toThrow('AI_UNSAFE_ENDPOINT')
    expect(state.requestCalls).toBe(1)
  })
})
