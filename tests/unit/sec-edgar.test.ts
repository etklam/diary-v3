import { describe, expect, it } from 'vitest'
import { buildSecUrls, SecEdgarClient } from '../../apps/api/src/sec-edgar/client.js'
import { SecProviderError } from '../../apps/api/src/sec-edgar/errors.js'
import { buildSingleFilingPackage } from '../../apps/api/src/sec-edgar/package.js'
import { createSecFixtureService } from '../../apps/api/src/sec-edgar/service.js'
import { canonicalizeCik, parseDocumentBasename } from '../../apps/api/src/sec-edgar/validation.js'

const accession = '0000000001-24-000001'
const directory = {
  fields: ['cik', 'name', 'ticker', 'exchange'],
  data: [['1', 'Synthetic Holdings', 'SYN', 'NYSE']],
}
const submissions = {
  cik: '0000000001', name: 'Synthetic Holdings', tickers: ['SYN'], exchanges: ['NYSE'],
  filings: { recent: {
    accessionNumber: [accession, '0000000001-24-000002'],
    filingDate: ['2024-04-01', '2024-03-01'], reportDate: ['2023-12-31', '2023-09-30'],
    acceptanceDateTime: ['2024-04-01 12:00:00', '2024-03-01 12:00:00'], form: ['10-K', '10-Q'],
    primaryDocument: ['syn-10k.htm', 'syn-10q.htm'], primaryDocDescription: ['Annual report', 'Quarterly report'],
    fileNumber: ['1', '1'], filmNumber: [null, null], items: [null, null], size: [120, 80],
  } },
}

function fixtureService() {
  return createSecFixtureService({
    async getJson<T>(url: string): Promise<T> {
      if (url === buildSecUrls.directory()) return directory as T
      if (url === buildSecUrls.submissions('1')) return submissions as T
      if (url.endsWith('/index.json')) return { directory: { item: [
        { name: 'syn-10k.htm', size: 12 },
        { name: '0000000001-24-000001.txt', size: 20 },
        { name: 'syn-data.xml', size: 10 },
      ] } } as T
      throw new Error(`unexpected fixture URL: ${url}`)
    },
    async getText(): Promise<string> { return '<table><tr><td>1</td><td>Annual report</td><td>syn-10k.htm</td><td>10-K</td></tr><tr><td>2</td><td>XBRL</td><td>syn-data.xml</td><td>EX-101</td></tr></table>' },
    async getStream(url: string): Promise<Response> { return new Response(`fixture:${url}`, { headers: { 'content-type': 'text/plain' } }) },
  })
}

describe('SEC EDGAR provider boundary', () => {
  it('canonicalizes identifiers and rejects traversal basenames', () => {
    expect(canonicalizeCik('1')).toBe('0000000001')
    expect(() => parseDocumentBasename('../secret.txt')).toThrow()
    expect(() => parseDocumentBasename('a%2Fb.txt')).toThrow()
    expect(buildSecUrls.document('1', accession, 'syn-10k.htm')).toContain('/1/000000000124000001/syn-10k.htm')
  })

  it('ranks company search and keeps cursor pagination tied to filters', async () => {
    const service = fixtureService()
    const search = await service.searchCompanies('syn', 10)
    expect(search.value[0]).toMatchObject({ cik: '0000000001', matchedBy: 'ticker' })
    const first = await service.listFilings('1', { forms: ['10-K'], limit: 1 })
    expect(first.value.filings).toHaveLength(1)
    expect(first.value.filings[0]?.acceptanceDateTime).toBe('2024-04-01 12:00:00')
    expect(first.value.nextCursor).toBeNull()
    await expect(service.listFilings('1', { forms: ['10-Q'], cursor: first.value.nextCursor ?? 'bad', limit: 1 })).rejects.toMatchObject({ code: 'SEC_VALIDATION_ERROR' })
  })

  it('builds classified document detail and a parseable stored ZIP', async () => {
    const service = fixtureService()
    const detail = await service.getFilingDetail('1', accession)
    expect(detail.value.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ basename: 'syn-10k.htm', isPrimary: true, classification: 'primary' }),
      expect.objectContaining({ basename: 'syn-data.xml', isXbrl: true, classification: 'xbrl' }),
    ]))
    const packaged = await buildSingleFilingPackage(service, '1', accession, ['primary'])
    expect(packaged.filename).toContain('SYN_10-K')
    expect(String.fromCharCode(...packaged.body.slice(0, 2))).toBe('PK')
    expect(Buffer.from(packaged.body).toString('utf8')).toContain('manifest.json')
  })

  it('keeps configuration failures explicit and fails closed', async () => {
    const service = (await import('../../apps/api/src/sec-edgar/service.js')).createUnavailableSecEdgarService()
    await expect(service.searchCompanies('syn', 10)).rejects.toBeInstanceOf(SecProviderError)
    await expect(service.searchCompanies('syn', 10)).rejects.toMatchObject({ code: 'SEC_CONFIG_MISSING', statusCode: 503 })
  })

  it('guards same-path redirects and rejects cross-host redirects', async () => {
    let calls = 0
    const client = new SecEdgarClient({
      userAgent: 'Diary synthetic sec@example.test', minIntervalMs: 0, sleep: async () => {},
      fetchFn: async (input) => {
        calls += 1
        if (calls === 1) return new Response(null, { status: 302, headers: { location: String(input) } })
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
      },
    })
    await expect(client.getJson(buildSecUrls.directory())).resolves.toEqual({ ok: true })
    expect(calls).toBe(2)
    const unsafe = new SecEdgarClient({
      userAgent: 'Diary synthetic sec@example.test', minIntervalMs: 0, sleep: async () => {},
      fetchFn: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example.test/redirect' } }),
    })
    await expect(unsafe.getJson(buildSecUrls.directory())).rejects.toMatchObject({ code: 'SEC_UNSAFE_REDIRECT' })
  })
})
