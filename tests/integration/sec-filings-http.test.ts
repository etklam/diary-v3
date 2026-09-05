import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { serve } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import { createApp } from '../../apps/api/src/app.js'
import { buildSecUrls } from '../../apps/api/src/sec-edgar/client.js'
import { createSecFixtureService } from '../../apps/api/src/sec-edgar/service.js'
import { provisionTestDatabase } from '../support/database.js'

const accession = '0000000001-24-000001'
const service = createSecFixtureService({
  async getJson<T>(url: string): Promise<T> {
    if (url === buildSecUrls.directory()) return ({ fields: ['cik', 'name', 'ticker', 'exchange'], data: [['1', 'Synthetic Holdings', 'SYN', 'NYSE']] } as T)
    if (url === buildSecUrls.submissions('1')) return ({ cik: '0000000001', name: 'Synthetic Holdings', tickers: ['SYN'], exchanges: ['NYSE'], filings: { recent: {
      accessionNumber: [accession], filingDate: ['2024-04-01'], reportDate: ['2023-12-31'], acceptanceDateTime: ['2024-04-01 12:00:00'], form: ['10-K'], primaryDocument: ['syn-10k.htm'], primaryDocDescription: ['Annual report'], fileNumber: ['1'], filmNumber: [null], items: [null], size: [12],
    } } } as T)
    if (url.endsWith('/index.json')) return ({ directory: { item: [{ name: 'syn-10k.htm', size: 12 }, { name: `${accession}.txt`, size: 12 }] } } as T)
    throw new Error(`unexpected fixture URL: ${url}`)
  },
  async getText(): Promise<string> { return '<table><tr><td>1</td><td>Annual report</td><td>syn-10k.htm</td><td>10-K</td></tr></table>' },
  async getStream(url: string): Promise<Response> { return new Response(`fixture:${url}`, { headers: { 'content-type': 'text/plain' } }) },
})

let database: Awaited<ReturnType<typeof provisionTestDatabase>>
let server: ReturnType<typeof serve>
let baseUrl = ''

beforeAll(async () => {
  database = await provisionTestDatabase('sec_filings_http')
  const app = createApp({
    db: database.db,
    config: { jwtSecret: 'synthetic-sec-filings-key-with-at-least-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1' },
    secFilings: service,
    marketData: { quote: async () => { throw new Error('not used') }, historical: async () => { throw new Error('not used') }, intraday: async () => { throw new Error('not used') }, monthly: async () => { throw new Error('not used') }, dailyPrices: async () => { throw new Error('not used') }, dailyResearch: async () => { throw new Error('not used') }, fundValuation: async () => { throw new Error('not used') }, quotes: async () => ({ quotes: new Map(), errors: [] }) },
  })
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server?.close()
  if (server) await once(server, 'close')
  await database?.dispose()
})

describe('SEC filing HTTP boundary', () => {
  it('serves guest metadata, document and bounded packages through fixture provider', async () => {
    const companies = await fetch(`${baseUrl}/api/tools/sec-filings/companies?q=SYN`)
    expect(companies.status).toBe(200)
    expect(companies.headers.get('cache-control')).toBe('no-store')
    expect((await companies.json()).data[0]).toMatchObject({ cik: '0000000001', matchedBy: 'ticker' })

    const filings = await fetch(`${baseUrl}/api/tools/sec-filings/companies/1/filings?forms=10-K&limit=1`)
    expect(filings.status).toBe(200)
    expect((await filings.json()).data.filings[0].accession).toBe(accession)

    const detail = await fetch(`${baseUrl}/api/tools/sec-filings/companies/1/filings/${accession}`)
    expect(detail.status).toBe(200)
    expect((await detail.json()).data.hasPdf).toBe(false)

    const document = await fetch(`${baseUrl}/api/tools/sec-filings/companies/1/filings/${accession}/documents/syn-10k.htm`)
    expect(document.status).toBe(200)
    expect(document.headers.get('content-disposition')).toContain('syn-10k.htm')
    expect(await document.text()).toContain('fixture:')

    const packageResponse = await fetch(`${baseUrl}/api/tools/sec-filings/companies/1/filings/${accession}/package?include=primary`)
    expect(packageResponse.status).toBe(200)
    expect((await packageResponse.arrayBuffer()).byteLength).toBeGreaterThan(30)
    expect(packageResponse.headers.get('content-type')).toBe('application/zip')

    const batch = await fetch(`${baseUrl}/api/tools/sec-filings/batch?cik=1&mode=primary&accessions=${accession}`)
    expect(batch.status).toBe(200)
    expect(batch.headers.get('content-type')).toBe('application/zip')
  })

  it('rejects malformed filters and unsafe document names before provider access', async () => {
    const invalid = await fetch(`${baseUrl}/api/tools/sec-filings/companies/1/filings?filedFrom=2024-02-31`)
    expect(invalid.status).toBe(400)
    expect(invalid.headers.get('cache-control')).toBe('no-store')
    const unsafe = await fetch(`${baseUrl}/api/tools/sec-filings/companies/1/filings/${accession}/documents/a%2Fb.txt`)
    expect(unsafe.status).toBe(400)
    const invalidBearer = await fetch(`${baseUrl}/api/tools/sec-filings/companies?q=SYN`, { headers: { authorization: 'Bearer malformed' } })
    expect(invalidBearer.status).toBe(401)
  })
})
