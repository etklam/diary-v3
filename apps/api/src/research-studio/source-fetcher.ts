import { request } from 'node:https'
import { resolveAiEndpoint, type AiProviderError } from '../ai-reports/outbound-policy.js'

export type SourceFetchRequest = {
  url: string
  method?: 'GET' | 'POST'
  headers?: Readonly<Record<string, string>>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  allowedBaseUrls: readonly string[]
  signal?: AbortSignal
}

export type SourceFetchResponse = {
  status: number
  headers: Readonly<Record<string, string>>
  body: string
  retrievedAt: string
}

export type SourceTransport = (request: SourceFetchRequest) => Promise<SourceFetchResponse>

export class SourceFetchError extends Error {
  constructor(
    readonly code: 'SOURCE_UNSAFE_ENDPOINT' | 'SOURCE_TIMEOUT' | 'SOURCE_BODY_TOO_LARGE' | 'SOURCE_REDIRECT' | 'SOURCE_HTTP_ERROR' | 'SOURCE_INVALID_RESPONSE',
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SourceFetchError'
  }
}

function mapOutboundError(error: unknown): SourceFetchError {
  const code = error as Partial<AiProviderError>
  if (code.code === 'AI_UNSAFE_ENDPOINT') return new SourceFetchError('SOURCE_UNSAFE_ENDPOINT', 'Source endpoint is not an approved public HTTPS destination.')
  if (code.code === 'AI_PROVIDER_TIMEOUT') return new SourceFetchError('SOURCE_TIMEOUT', 'Source endpoint resolution timed out.')
  return new SourceFetchError('SOURCE_UNSAFE_ENDPOINT', 'Source endpoint could not be safely resolved.')
}

function headersOf(headers: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).flatMap(([key, value]) => value === undefined ? [] : [[key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value]]))
}

export const pinnedSourceTransport: SourceTransport = async input => {
  const timeoutMs = input.timeoutMs ?? 10_000
  const maxBytes = input.maxBytes ?? 1_000_000
  if (input.body && Buffer.byteLength(input.body, 'utf8') > maxBytes) throw new SourceFetchError('SOURCE_BODY_TOO_LARGE', 'Source request body exceeds the configured limit.')
  let url: URL
  try { url = new URL(input.url) } catch { throw new SourceFetchError('SOURCE_UNSAFE_ENDPOINT', 'Source URL is invalid.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new SourceFetchError('SOURCE_UNSAFE_ENDPOINT', 'Source URL must be HTTPS without credentials or fragments.')
  let endpoint: Awaited<ReturnType<typeof resolveAiEndpoint>>
  try {
    endpoint = await resolveAiEndpoint(url.origin, undefined, [...input.allowedBaseUrls])
  } catch (error) {
    throw mapOutboundError(error)
  }
  const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(input.signal ? [input.signal] : [])])
  if (signal.aborted) throw new SourceFetchError('SOURCE_TIMEOUT', 'Source request was cancelled or timed out.')
  return new Promise<SourceFetchResponse>((resolve, reject) => {
    const req = request(url, {
      method: input.method ?? 'GET',
      signal,
      agent: false,
      family: endpoint.address.family,
      lookup: (_hostname, _options, callback) => callback(null, endpoint.address.address, endpoint.address.family),
      headers: {
        Accept: 'application/json, text/plain;q=0.9',
        ...(input.body ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(input.body, 'utf8')) } : {}),
        ...(input.headers ?? {}),
      },
    }, response => {
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > maxBytes) {
          req.destroy()
          reject(new SourceFetchError('SOURCE_BODY_TOO_LARGE', 'Source response exceeds the configured limit.'))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', () => reject(new SourceFetchError('SOURCE_INVALID_RESPONSE', 'Source response could not be read.')))
      response.on('end', () => {
        const status = response.statusCode ?? 502
        if (status >= 300 && status < 400) {
          reject(new SourceFetchError('SOURCE_REDIRECT', 'Source redirects are not followed.', status))
          return
        }
        if (status < 200 || status >= 300) {
          reject(new SourceFetchError('SOURCE_HTTP_ERROR', `Source returned HTTP ${status}.`, status))
          return
        }
        resolve({ status, headers: headersOf(response.headers), body: Buffer.concat(chunks).toString('utf8'), retrievedAt: new Date().toISOString() })
      })
    })
    req.on('error', error => reject(new SourceFetchError(signal.aborted ? 'SOURCE_TIMEOUT' : 'SOURCE_INVALID_RESPONSE', error.message)))
    req.end(input.body)
  })
}

export type SourceFetcher = {
  request: SourceTransport
  json<T>(input: SourceFetchRequest): Promise<{ data: T; response: SourceFetchResponse }>
  text(input: SourceFetchRequest): Promise<{ text: string; response: SourceFetchResponse }>
}

export function createSourceFetcher(options: { transport?: SourceTransport } = {}): SourceFetcher {
  const transport = options.transport ?? pinnedSourceTransport
  const request: SourceTransport = async input => {
    const response = await transport(input)
    const maxBytes = input.maxBytes ?? 1_000_000
    if (Buffer.byteLength(response.body, 'utf8') > maxBytes) throw new SourceFetchError('SOURCE_BODY_TOO_LARGE', 'Source response exceeds the configured limit.')
    if (response.status >= 300 && response.status < 400) throw new SourceFetchError('SOURCE_REDIRECT', 'Source redirects are not followed.', response.status)
    if (response.status < 200 || response.status >= 300) throw new SourceFetchError('SOURCE_HTTP_ERROR', `Source returned HTTP ${response.status}.`, response.status)
    return response
  }
  return {
    request,
    async json<T>(input: SourceFetchRequest) {
      const response = await request(input)
      const contentType = response.headers['content-type'] ?? ''
      if (contentType && !/json|javascript/u.test(contentType)) throw new SourceFetchError('SOURCE_INVALID_RESPONSE', 'Source response is not JSON.')
      try { return { data: JSON.parse(response.body) as T, response } }
      catch { throw new SourceFetchError('SOURCE_INVALID_RESPONSE', 'Source response is not valid JSON.') }
    },
    async text(input: SourceFetchRequest) {
      const response = await request(input)
      return { text: response.body, response }
    },
  }
}
