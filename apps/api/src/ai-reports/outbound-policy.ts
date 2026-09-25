import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'

export class AiProviderError extends Error {
  constructor(public readonly code: string, public readonly retryAfter: number | null = null) { super(code); this.name = 'AiProviderError' }
}
export function validateHttpsAiBaseUrl(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new AiProviderError('AI_UNSAFE_ENDPOINT') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || isIP(url.hostname.replace(/^\[|\]$/g, '')) || raw.includes('\\')) throw new AiProviderError('AI_UNSAFE_ENDPOINT')
  const normalized = url.href.replace(/\/$/, '')
  return new URL(`${normalized}/`)
}
export function validateBaseUrl(raw: string, allowlist = (process.env.AI_ALLOWED_BASE_URLS ?? 'https://api.deepseek.com').split(',')): URL {
  const url = validateHttpsAiBaseUrl(raw)
  const normalized = url.href.replace(/\/$/, '')
  if (!allowlist.some(value => value.trim().replace(/\/$/, '') === normalized)) throw new AiProviderError('AI_UNSAFE_ENDPOINT')
  return url
}
export function isPublicAiAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 2 && c === 0))) || (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  if (family === 6) {
    // Only global unicast; reject mapped/translation, transition and special-use ranges.
    if (address.includes('%')) return false
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase()
    const [firstText, secondText] = canonical.split(':')
    const first = Number.parseInt(firstText || '0', 16)
    const second = Number.parseInt(secondText || '0', 16)
    if (first < 0x2000 || first > 0x3fff) return false
    return !(first === 0x2002 || first === 0x3ffe || first === 0x3fff || (first === 0x2001 && (second <= 0x1ff || second === 0xdb8)))
  }
  return false
}
export interface AiTransportRequest { baseUrl: string; path: 'models' | 'chat/completions'; apiKey: string; body?: unknown; timeoutMs: number; signal?: AbortSignal; allowedBaseUrls?: string[] }
export interface AiTransportResponse { status: number; body: string; retryAfter: string | null }
export type AiTransport = (input: AiTransportRequest) => Promise<AiTransportResponse>
export async function resolveAiEndpoint(baseUrl: string, resolver: (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string; family: number }>> = lookup, allowlist?: string[]) {
  const url = validateBaseUrl(baseUrl, allowlist)
  const addresses = await resolver(url.hostname, { all: true, verbatim: true }).catch(() => { throw new AiProviderError('AI_PROVIDER_UNAVAILABLE') })
  if (!addresses.length || addresses.some(item => !isPublicAiAddress(item.address))) throw new AiProviderError('AI_UNSAFE_ENDPOINT')
  return { url, address: addresses[0]! }
}
export const aiHttpsTransport: AiTransport = async input => {
  const signal = AbortSignal.any([AbortSignal.timeout(input.timeoutMs), ...(input.signal ? [input.signal] : [])])
  if (signal.aborted) throw new AiProviderError('AI_PROVIDER_TIMEOUT')
  const endpoint = await Promise.race([
    resolveAiEndpoint(input.baseUrl, undefined, input.allowedBaseUrls),
    new Promise<never>((_, reject) => { signal.addEventListener('abort', () => reject(new AiProviderError('AI_PROVIDER_TIMEOUT')), { once: true }) }),
  ])
  if (signal.aborted) throw new AiProviderError('AI_PROVIDER_TIMEOUT')
  const url = new URL(input.path, endpoint.url)
  let body: string | undefined
  try { body = input.body === undefined ? undefined : JSON.stringify(input.body) }
  catch { throw new AiProviderError('AI_OUTPUT_INVALID') }
  if (body && Buffer.byteLength(body) > 2_000_000) throw new AiProviderError('AI_REPORT_CONTEXT_TOO_LARGE')
  return new Promise((resolve, reject) => {
    // Pin the verified address at the socket lookup; TLS still verifies the original hostname.
    const req = request(url, {
      method: body === undefined ? 'GET' : 'POST', agent: false, signal, family: endpoint.address.family,
      lookup: (_host, _options, callback) => callback(null, endpoint.address.address, endpoint.address.family),
      headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) },
    }, response => {
      const chunks: Buffer[] = []; let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > 512_000) { req.destroy(); reject(new AiProviderError('AI_OUTPUT_INVALID')); return }
        chunks.push(chunk)
      })
      response.on('error', () => reject(new AiProviderError('AI_PROVIDER_UNAVAILABLE')))
      response.on('end', () => resolve({ status: response.statusCode ?? 502, body: Buffer.concat(chunks).toString('utf8'), retryAfter: typeof response.headers['retry-after'] === 'string' ? response.headers['retry-after'] : null }))
    })
    req.on('error', () => reject(new AiProviderError(signal.aborted ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE')))
    req.end(body)
  })
}
