import { archiveCik, canonicalizeCik, parseAccession, parseDocumentBasename } from './validation.js'
import { SecProviderError } from './errors.js'
import { SecRequestQueue } from './queue.js'

const ALLOWED_HOSTS = new Set(['www.sec.gov', 'data.sec.gov'])
const MAX_METADATA_BYTES = 5 * 1024 * 1024

export const buildSecUrls = {
  directory: () => 'https://www.sec.gov/files/company_tickers_exchange.json',
  submissions: (cik: string) => `https://data.sec.gov/submissions/CIK${canonicalizeCik(cik)}.json`,
  historicalSegment: (name: string) => {
    if (!/^CIK\d{10}-submissions-\d{3}\.json$/.test(name)) throw new SecProviderError('SEC_VALIDATION_ERROR', 'Invalid historical segment name', 400)
    return `https://data.sec.gov/submissions/${name}`
  },
  filingDirectory: (cik: string, accession: string) => {
    const parsed = parseAccession(accession)
    return `https://www.sec.gov/Archives/edgar/data/${archiveCik(cik)}/${parsed.directory}`
  },
  filingIndexJson(cik: string, accession: string) {
    return `${this.filingDirectory(cik, accession)}/index.json`
  },
  filingIndexHtml(cik: string, accession: string) {
    return `${this.filingDirectory(cik, accession)}/${parseAccession(accession).accession}-index.html`
  },
  document(cik: string, accession: string, basename: string) {
    return `${this.filingDirectory(cik, accession)}/${encodeURIComponent(parseDocumentBasename(basename))}`
  },
}

interface ClientOptions {
  userAgent: string
  fetchFn?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  minIntervalMs?: number
}

export class SecEdgarClient {
  private readonly fetchFn: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly queue: SecRequestQueue
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(private readonly options: ClientOptions) {
    if (!options.userAgent.trim() || !options.userAgent.includes('@')) {
      throw new SecProviderError('SEC_CONFIG_MISSING', 'SEC_USER_AGENT must contain application name and contact email', 503)
    }
    this.fetchFn = options.fetchFn ?? fetch
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.queue = new SecRequestQueue({ minIntervalMs: options.minIntervalMs, sleep: this.sleep })
  }

  async getJson<T>(url: string): Promise<T> {
    const existing = this.inflight.get(url) as Promise<T> | undefined
    if (existing) return existing
    const request = this.request(url, 'application/json').then(async response => {
      const length = Number(response.headers.get('content-length') ?? 0)
      if (length > MAX_METADATA_BYTES) throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'SEC metadata response is too large', 502)
      const text = await this.readMetadataText(response)
      try { return JSON.parse(text) as T } catch { throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'SEC returned invalid JSON', 502) }
    }).finally(() => this.inflight.delete(url))
    this.inflight.set(url, request)
    return request
  }

  async getText(url: string): Promise<string> {
    const response = await this.request(url, 'text/html')
    return this.readMetadataText(response)
  }

  getStream(url: string): Promise<Response> {
    return this.request(url, '*/*', 60_000, false)
  }

  private assertUrl(url: string): URL {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) {
      throw new SecProviderError('SEC_VALIDATION_ERROR', 'SEC URL is not allowed', 400)
    }
    const allowedPath = parsed.hostname === 'data.sec.gov'
      ? /^\/submissions\/CIK\d{10}(?:-submissions-\d{3})?\.json$/.test(parsed.pathname)
      : parsed.pathname === '/files/company_tickers_exchange.json' || /^\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9._-]+$/.test(parsed.pathname)
    if (!allowedPath || parsed.search || parsed.hash) throw new SecProviderError('SEC_VALIDATION_ERROR', 'SEC path is not allowed', 400)
    return parsed
  }

  private async request(url: string, accept: string, timeoutMs = 15_000, retry = true): Promise<Response> {
    const expected = this.assertUrl(url)
    const attempts = retry ? 3 : 1
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        // The deadline belongs to the whole response, including body reads. A
        // fetch-only timer otherwise leaves a stalled SEC stream unbounded.
        const response = await this.queue.run(() => this.fetchFn(expected, {
          headers: { 'User-Agent': this.options.userAgent, Accept: accept, 'Accept-Encoding': 'gzip, deflate' },
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        }))

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (!location) throw new SecProviderError('SEC_UNSAFE_REDIRECT', 'SEC redirect has no location', 502)
          const destination = new URL(location, expected)
          if (destination.protocol !== 'https:' || destination.hostname !== expected.hostname || destination.pathname !== expected.pathname) {
            throw new SecProviderError('SEC_UNSAFE_REDIRECT', 'SEC returned an unsafe redirect', 502)
          }
          // Re-enter the queue and request policy for the one allowed
          // same-path redirect. A second redirect is rejected by retry=false.
          if (!retry) throw new SecProviderError('SEC_UNSAFE_REDIRECT', 'SEC returned too many redirects', 502)
          return await this.request(destination.href, accept, timeoutMs, false)
        }
        if (response.ok) return response
        if (response.status === 404) throw new SecProviderError('SEC_DOCUMENT_NOT_FOUND', 'SEC resource not found', 404)
        const retryableStatus = response.status === 429 || [502, 503, 504].includes(response.status)
        if (!retryableStatus) throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', `SEC returned HTTP ${response.status}`, 502)
        const delay = this.retryDelay(response.headers.get('retry-after'), attempt)
        lastError = new SecProviderError(response.status === 429 ? 'SEC_UPSTREAM_RATE_LIMITED' : 'SEC_UPSTREAM_UNAVAILABLE', 'SEC is temporarily unavailable', 503, true, Math.ceil(delay / 1000))
        if (attempt < attempts - 1) await this.sleep(delay)
      } catch (error) {
        if (error instanceof SecProviderError && !error.retryable) throw error
        lastError = error instanceof SecProviderError ? error : new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC request failed', 503, true)
        if (attempt < attempts - 1) await this.sleep(Math.min(30_000, 250 * 2 ** attempt))
      }
    }
    throw lastError
  }

  private retryDelay(header: string | null, attempt: number): number {
    if (header) {
      const seconds = Number(header)
      if (Number.isFinite(seconds)) return Math.min(30_000, Math.max(0, seconds * 1000))
      const date = Date.parse(header)
      if (!Number.isNaN(date)) return Math.min(30_000, Math.max(0, date - Date.now()))
    }
    return Math.min(30_000, 250 * 2 ** attempt)
  }

  private async readMetadataText(response: Response): Promise<string> {
    if (!response.body) return ''
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_METADATA_BYTES) {
        await reader.cancel()
        throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'SEC metadata response is too large', 502)
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')
  }
}
