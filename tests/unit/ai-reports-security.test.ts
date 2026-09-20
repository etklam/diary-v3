import { describe, expect, it } from 'vitest'
import { encryptAiSecret, decryptAiSecret } from '../../apps/api/src/ai-reports/secrets.js'
import { aiHttpsTransport, isPublicAiAddress, resolveAiEndpoint, validateBaseUrl, type AiTransport } from '../../apps/api/src/ai-reports/outbound-policy.js'
import { generateAiAnalysis } from '../../apps/api/src/ai-reports/deepseek-provider.js'

const keyring = { activeVersion: 'k1', keys: { k1: Buffer.alloc(32, 19).toString('base64'), k2: Buffer.alloc(32, 23).toString('base64') } }
describe('AI authenticated encryption', () => {
  it('uses unique nonces and binds ciphertext to purpose and key version', () => {
    const first = encryptAiSecret('synthetic secret', 'provider:1', keyring)
    expect(first).not.toBe(encryptAiSecret('synthetic secret', 'provider:1', keyring))
    expect(decryptAiSecret(first, 'provider:1', { ...keyring, activeVersion: 'k2' })).toBe('synthetic secret')
    expect(() => decryptAiSecret(first, 'snapshot:1', keyring)).toThrow('AI encrypted data unavailable')
    expect(() => decryptAiSecret(first.replace('.k1.', '.k2.'), 'provider:1', keyring)).toThrow()
    expect(() => decryptAiSecret(first, 'provider:1', { activeVersion: 'k2', keys: { k2: keyring.keys.k2 } })).toThrow()
  })
})
describe('AI outbound boundary', () => {
  it.each(['http://api.deepseek.com', 'https://api.deepseek.com@localhost', 'https://api.deepseek.com/?key=x', 'https://api.deepseek.com/#x', 'https://api.deepseek.com/evil', 'https://127.0.0.1', 'https://[::1]', 'https://api.deepseek.com:444'])('rejects %s', url => expect(() => validateBaseUrl(url)).toThrow())
  it.each(['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.169.254', '172.31.0.1', '192.168.1.1', '100.64.0.1', '198.18.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.1.1.1', '255.255.255.255', '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', '2001:db8::1', '2001::', '2001::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2002:808:808::1', '64:ff9b::a00:1'])('blocks non-public %s', address => expect(isPublicAiAddress(address)).toBe(false))
  it('accepts public unicast and rejects a mixed public/private DNS result', async () => {
    expect(isPublicAiAddress('8.8.8.8')).toBe(true)
    expect(isPublicAiAddress('2001:4860::1')).toBe(true)
    expect(isPublicAiAddress('2606:4700:4700::1111')).toBe(true)
    const resolver = async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]
    await expect(resolveAiEndpoint('https://api.deepseek.com', resolver)).rejects.toThrow('AI_UNSAFE_ENDPOINT')
  })
})
const config = { baseUrl: 'https://api.deepseek.com', apiKey: 'synthetic', model: 'fixture-model', timeoutMs: 1000, maxOutputTokens: 4000, messages: [{ role: 'user' as const, content: 'synthetic' }] }
describe('single-call DeepSeek adapter', () => {
  it('short-circuits an already cancelled request before DNS', async () => {
    await expect(aiHttpsTransport({ ...config, baseUrl: 'https://must-not-resolve.invalid', path: 'models', signal: AbortSignal.abort() })).rejects.toThrow('AI_PROVIDER_TIMEOUT')
  })
  it.each([429, 500, 401, 302])('does not retry or follow status %s', async status => {
    let calls = 0
    const transport: AiTransport = async () => { calls++; return { status, body: 'secret upstream error', retryAfter: '30' } }
    await expect(generateAiAnalysis(config, transport)).rejects.not.toThrow('secret upstream error')
    expect(calls).toBe(1)
  })
  it.each([
    { finish_reason: 'length', message: { content: '{}' } },
    { finish_reason: 'stop', message: { content: '' } },
    { finish_reason: 'stop', message: { content: 'not json' } },
    { finish_reason: 'stop', message: { content: '{}', tool_calls: [] } },
  ])('rejects invalid completion %#', async choice => {
    const transport: AiTransport = async () => ({ status: 200, body: JSON.stringify({ choices: [choice] }), retryAfter: null })
    await expect(generateAiAnalysis(config, transport)).rejects.toThrow('AI_OUTPUT_INVALID')
  })
  it('keeps missing usage unknown and omits unverified model parameters', async () => {
    const transport: AiTransport = async input => {
      expect(input.body).not.toHaveProperty('thinking')
      expect(input.body).toMatchObject({ stream: false, response_format: { type: 'json_object' } })
      return { status: 200, body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"summary":[]}' } }] }), retryAfter: null }
    }
    expect((await generateAiAnalysis(config, transport)).usage).toBeNull()
  })
  it.each([{ id: 'x'.repeat(201) }, { usage: { prompt_tokens: 2_147_483_648, completion_tokens: 1 } }])('rejects provider metadata that cannot fit durable accounting %#', async metadata => {
    const transport: AiTransport = async () => ({ status: 200, body: JSON.stringify({ ...metadata, choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }), retryAfter: null })
    await expect(generateAiAnalysis(config, transport)).rejects.toThrow('AI_OUTPUT_INVALID')
  })
})
