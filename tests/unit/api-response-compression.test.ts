import { gunzipSync, inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { Database } from '@diary/db'
import { createApp } from '../../apps/api/src/app.js'
import { COMPRESSION_THRESHOLD_BYTES } from '../../apps/api/src/response-compression.js'
import { createFixtureUpstream } from '../../apps/api/src/market-data/fixture.js'
import { createMarketData } from '../../apps/api/src/market-data/index.js'
import { buildSecUrls } from '../../apps/api/src/sec-edgar/client.js'
import { createSecFixtureService } from '../../apps/api/src/sec-edgar/service.js'

const config = {
  jwtSecret: 'synthetic-compression-secret-with-over-32-characters',
  nodeEnv: 'test' as const,
  trustProxy: false,
  webOrigin: 'https://example.test',
}

// A year of daily closes: the smallest real response that clears the threshold,
// served from the sanctioned fixture upstream so no database is involved.
const HISTORICAL = 'https://example.test/api/market/historical?symbol=AAPL&range=1y'

const accession = '0000000001-24-000001'
// Past the threshold on purpose: a document under it would be passed through by
// the size rule, and this asserts that `no-transform` is what excludes it.
const documentBody = '<p>Synthetic filing paragraph.</p>\n'.repeat(200)

const secFilings = createSecFixtureService({
  async getJson<T>(url: string): Promise<T> {
    if (url === buildSecUrls.directory())
      return { fields: ['cik', 'name', 'ticker', 'exchange'], data: [['1', 'Synthetic Holdings', 'SYN', 'NYSE']] } as T
    if (url === buildSecUrls.submissions('1'))
      return {
        cik: '0000000001',
        name: 'Synthetic Holdings',
        tickers: ['SYN'],
        exchanges: ['NYSE'],
        filings: {
          recent: {
            accessionNumber: [accession],
            filingDate: ['2024-04-01'],
            reportDate: ['2023-12-31'],
            acceptanceDateTime: ['2024-04-01 12:00:00'],
            form: ['10-K'],
            primaryDocument: ['syn-10k.htm'],
            primaryDocDescription: ['Annual report'],
            fileNumber: ['1'],
            filmNumber: [null],
            items: [null],
            size: [documentBody.length],
          },
        },
      } as T
    if (url.endsWith('/index.json'))
      return {
        directory: {
          item: [
            { name: 'syn-10k.htm', size: documentBody.length },
            { name: `${accession}.txt`, size: 12 },
          ],
        },
      } as T
    throw new Error(`unexpected fixture URL: ${url}`)
  },
  async getText(): Promise<string> {
    return '<table><tr><td>1</td><td>Annual report</td><td>syn-10k.htm</td><td>10-K</td></tr></table>'
  },
  async getStream(): Promise<Response> {
    return new Response(documentBody, { headers: { 'content-type': 'text/html' } })
  },
})

function createCompressionApp() {
  return createApp({
    db: {} as Database,
    config,
    marketData: createMarketData({ upstream: createFixtureUpstream(), now: () => new Date('2026-10-25T00:00:00Z') }),
    secFilings,
  })
}

async function read(url: string, acceptEncoding?: string) {
  const app = createCompressionApp()
  const response = await app.fetch(
    new Request(url, acceptEncoding === undefined ? {} : { headers: { 'accept-encoding': acceptEncoding } }),
  )
  return { response, bytes: Buffer.from(await response.arrayBuffer()) }
}

describe('API response compression', () => {
  it('encodes a negotiated JSON response without changing the payload', async () => {
    const negotiated = await read(HISTORICAL, 'gzip, deflate, br')
    const plain = await read(HISTORICAL)

    expect(negotiated.response.headers.get('content-encoding')).toBe('gzip')
    expect(negotiated.response.headers.get('vary')).toContain('Accept-Encoding')
    // An encoded body's length is only known once the stream ends.
    expect(negotiated.response.headers.get('content-length')).toBeNull()
    expect(negotiated.bytes.length).toBeLessThan(plain.bytes.length / 2)
    expect(gunzipSync(negotiated.bytes).equals(plain.bytes)).toBe(true)
    expect(JSON.parse(gunzipSync(negotiated.bytes).toString())).toEqual(JSON.parse(plain.bytes.toString()))
  })

  it('leaves a client that negotiates no encoding exactly as before', async () => {
    const absent = await read(HISTORICAL)
    const identity = await read(HISTORICAL, 'identity')

    for (const result of [absent, identity]) {
      expect(result.response.status).toBe(200)
      expect(result.response.headers.get('content-encoding')).toBeNull()
    }
    expect(identity.bytes.equals(absent.bytes)).toBe(true)
    // The variant still has to be advertised, or a shared cache could serve an
    // encoded body to a client that cannot read one.
    expect(absent.response.headers.get('vary')).toContain('Accept-Encoding')
  })

  it('honours a client that will only take deflate', async () => {
    const { response, bytes } = await read(HISTORICAL, 'deflate')

    expect(response.headers.get('content-encoding')).toBe('deflate')
    expect(JSON.parse(inflateSync(bytes).toString())).toHaveLength(
      JSON.parse((await read(HISTORICAL)).bytes.toString()).length,
    )
  })

  it('does not encode a body below the threshold, where encoding only adds bytes', async () => {
    const health = await read('https://example.test/healthz', 'gzip, deflate, br')
    const missing = await read('https://example.test/api/nope', 'gzip, deflate, br')

    expect(health.response.headers.get('content-encoding')).toBeNull()
    expect(health.bytes.toString()).toBe('{"status":"ok"}')
    expect(health.bytes.length).toBeLessThan(COMPRESSION_THRESHOLD_BYTES)

    expect(missing.response.status).toBe(404)
    expect(missing.response.headers.get('content-encoding')).toBeNull()
    expect(JSON.parse(missing.bytes.toString())).toMatchObject({ statusCode: 404, data: { code: 'SYS_NOT_FOUND' } })
  })

  it('keeps the request id and error contract on an encoded-capable request', async () => {
    const { response } = await read(HISTORICAL, 'gzip')
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('never re-encodes a byte-exact SEC download', async () => {
    const { response, bytes } = await read(
      `https://example.test/api/tools/sec-filings/companies/1/filings/${accession}/documents/syn-10k.htm`,
      'gzip, deflate, br',
    )

    expect(response.status).toBe(200)
    expect(bytes.length).toBeGreaterThan(COMPRESSION_THRESHOLD_BYTES)
    // `text/html` is a compressible type, so the size rule and the type rule
    // both say yes here. Only `no-transform` keeps the bytes intact.
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('cache-control')).toContain('no-transform')
    expect(response.headers.get('content-encoding')).toBeNull()
    expect(response.headers.get('content-length')).toBe(String(bytes.length))
    expect(bytes.toString()).toBe(documentBody)
  })

  it('leaves SEC metadata eligible for encoding', async () => {
    const { response } = await read('https://example.test/api/tools/sec-filings/companies?q=SYN', 'gzip, deflate, br')

    expect(response.status).toBe(200)
    // The existing HTTP boundary test pins this exact value; metadata is JSON a
    // reader waits for, so it must not opt out of encoding.
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
