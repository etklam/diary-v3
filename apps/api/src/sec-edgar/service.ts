import { createHash } from 'node:crypto'
import type {
  SecCompany,
  SecCompanySearchResult,
  SecFilingDetail,
  SecFilingDocument,
  SecFilingFilters,
  SecFilingPage,
  SecFilingSummary,
} from '@diary/contracts/sec-filings'
import { SecMemoryCache, type SecCacheResult } from './cache.js'
import { buildSecUrls, SecEdgarClient } from './client.js'
import { SecProviderError } from './errors.js'
import { canonicalizeCik, normalizeTickerQuery, parseAccession, parseDocumentBasename } from './validation.js'

export interface SecClientLike {
  getJson<T>(url: string): Promise<T>
  getText(url: string): Promise<string>
  getStream?(url: string): Promise<Response>
}

interface DirectoryPayload { fields?: unknown; data?: unknown }
interface SubmissionFile { name?: unknown; filingFrom?: unknown; filingTo?: unknown }
interface SubmissionsPayload {
  cik?: unknown
  name?: unknown
  tickers?: unknown
  exchanges?: unknown
  filings?: { recent?: unknown; files?: SubmissionFile[] }
}

type FilingColumns = Record<string, unknown>

export class SecEdgarService {
  private readonly directoryCache = new SecMemoryCache<string, SecCompany[]>({ freshMs: 86_400_000, staleMs: 7 * 86_400_000, maxEntries: 1 })
  private readonly submissionsCache = new SecMemoryCache<string, SubmissionsPayload>({ freshMs: 300_000, staleMs: 86_400_000, maxEntries: 250 })
  private readonly segmentCache = new SecMemoryCache<string, FilingColumns>({ freshMs: 86_400_000, staleMs: 30 * 86_400_000, maxEntries: 500 })
  private readonly filingIndexCache = new SecMemoryCache<string, { json: unknown; html: string }>({ freshMs: 3_600_000, staleMs: 7 * 86_400_000, maxEntries: 500 })

  constructor(private readonly client: SecClientLike) {}

  async searchCompanies(query: string, limit: number): Promise<SecCacheResult<SecCompanySearchResult[]>> {
    const normalized = normalizeTickerQuery(query)
    const cached = await this.directoryCache.getOrLoad('directory', async () => this.loadDirectory())
    const numeric = /^\d+$/.test(normalized) ? canonicalizeCik(normalized) : null
    const tokens = normalized.split(/\s+/).filter(Boolean)
    const ranked = cached.value.flatMap(company => {
      const exactCik = numeric === company.cik
      const cikPrefix = numeric ? company.cik.replace(/^0+/, '').startsWith(normalized.replace(/^0+/, '')) : false
      const exactTicker = company.tickers.includes(normalized)
      const tickerPrefix = company.tickers.some(ticker => ticker.startsWith(normalized))
      const upperName = company.name.toUpperCase()
      const nameMatch = tokens.every(token => upperName.includes(token))
      if (!exactCik && !cikPrefix && !exactTicker && !tickerPrefix && !nameMatch) return []
      const matchedBy = exactCik || cikPrefix ? 'cik' : exactTicker || tickerPrefix ? 'ticker' : 'name'
      const score = exactCik ? 0 : exactTicker ? 1 : cikPrefix ? 2 : tickerPrefix ? 3 : 4
      return [{ ...company, matchedBy, score }]
    }).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, limit)
      .map(({ score: _score, ...company }) => company as SecCompanySearchResult)
    return { ...cached, value: ranked }
  }

  async listFilings(cikInput: string, input: Partial<SecFilingFilters>): Promise<SecCacheResult<SecFilingPage>> {
    const cik = canonicalizeCik(cikInput)
    const filters: SecFilingFilters = {
      forms: (input.forms ?? []).map(form => form.trim().toUpperCase()).filter(Boolean),
      amendments: input.amendments ?? 'include',
      limit: input.limit ?? 50,
      filedFrom: input.filedFrom,
      filedTo: input.filedTo,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      cursor: input.cursor,
    }
    const submissions = await this.loadSubmissions(cik)
    const company = this.companyFromSubmissions(cik, submissions.value)
    const rows = this.normalizeColumns(cik, submissions.value.filings?.recent)
    let stale = submissions.stale
    let cacheStatus = submissions.cacheStatus
    let fetchedAt = submissions.fetchedAt

    for (const file of submissions.value.filings?.files ?? []) {
      if (typeof file.name !== 'string') continue
      const segment = await this.segmentCache.getOrLoad(file.name, () => this.client.getJson<FilingColumns>(buildSecUrls.historicalSegment(file.name as string)))
      rows.push(...this.normalizeColumns(cik, segment.value))
      if (segment.stale) stale = true
      if (segment.cacheStatus === 'miss') cacheStatus = 'miss'
      fetchedAt = fetchedAt > segment.fetchedAt ? fetchedAt : segment.fetchedAt
    }

    const filtered = rows.filter(row => this.matchesFilters(row, filters)).sort(this.compareFilings)
    const fingerprint = this.filterFingerprint(cik, filters)
    const offset = filters.cursor ? this.decodeCursor(filters.cursor, fingerprint) : 0
    const filings = filtered.slice(offset, offset + filters.limit)
    const nextOffset = offset + filings.length
    const nextCursor = nextOffset < filtered.length ? this.encodeCursor(nextOffset, fingerprint) : null
    return { value: { company, filings, nextCursor }, stale, cacheStatus, fetchedAt }
  }

  async getFilingDetail(cikInput: string, accessionInput: string): Promise<SecCacheResult<SecFilingDetail>> {
    const cik = canonicalizeCik(cikInput)
    const accession = parseAccession(accessionInput).accession
    const listing = await this.listFilings(cik, { limit: 100 })
    let filing = listing.value.filings.find(row => row.accession === accession)
    if (!filing) {
      const all = await this.allFilings(cik)
      filing = all.find(row => row.accession === accession)
    }
    if (!filing) throw new SecProviderError('SEC_FILING_NOT_FOUND', 'SEC filing not found for company', 404)

    const key = `${cik}:${accession}`
    const index = await this.filingIndexCache.getOrLoad(key, async () => {
      const [json, html] = await Promise.all([
        this.client.getJson<unknown>(buildSecUrls.filingIndexJson(cik, accession)),
        this.client.getText(buildSecUrls.filingIndexHtml(cik, accession)),
      ])
      return { json, html }
    })
    const documents = this.buildDocuments(index.value.json, index.value.html, filing)
    if (!documents.some(document => document.isPrimary)) {
      throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'Primary filing document is absent from SEC directory', 502)
    }
    return {
      value: { company: listing.value.company, filing, documents, hasPdf: documents.some(document => document.isPdf) },
      stale: listing.stale || index.stale,
      cacheStatus: index.cacheStatus,
      fetchedAt: index.fetchedAt,
    }
  }

  async getDocument(cik: string, accession: string, basename: string): Promise<{ detail: SecFilingDetail; document: SecFilingDocument; url: string }> {
    const safeBasename = parseDocumentBasename(basename)
    const detail = await this.getFilingDetail(cik, accession)
    const document = detail.value.documents.find(item => item.basename === safeBasename)
    if (!document) throw new SecProviderError('SEC_DOCUMENT_NOT_FOUND', 'SEC filing document not found', 404)
    return { detail: detail.value, document, url: buildSecUrls.document(cik, accession, safeBasename) }
  }

  async openDocument(cik: string, accession: string, basename: string): Promise<{ detail: SecFilingDetail; document: SecFilingDocument; response: Response }> {
    if (!this.client.getStream) throw new SecProviderError('SEC_UPSTREAM_UNAVAILABLE', 'SEC streaming client unavailable', 503, true)
    const resolved = await this.getDocument(cik, accession, basename)
    const response = await this.client.getStream(resolved.url)
    return { detail: resolved.detail, document: resolved.document, response }
  }

  private async loadDirectory(): Promise<SecCompany[]> {
    const raw = await this.client.getJson<DirectoryPayload>(buildSecUrls.directory())
    if (!Array.isArray(raw.fields) || !Array.isArray(raw.data)) throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'Invalid SEC company directory', 502)
    const fields = raw.fields.map(String)
    const positions = Object.fromEntries(fields.map((field, index) => [field.toLowerCase(), index]))
    const cikIndex = positions.cik
    const nameIndex = positions.name
    const tickerIndex = positions.ticker
    const exchangeIndex = positions.exchange
    if ([cikIndex, nameIndex, tickerIndex, exchangeIndex].some(value => typeof value !== 'number')) throw new SecProviderError('SEC_UPSTREAM_INVALID_RESPONSE', 'Invalid SEC company directory fields', 502)
    const companies = new Map<string, SecCompany>()
    for (const row of raw.data) {
      if (!Array.isArray(row)) continue
      try {
        const cik = canonicalizeCik(String(row[cikIndex as number] ?? ''))
        const name = String(row[nameIndex as number] ?? '').trim()
        const ticker = String(row[tickerIndex as number] ?? '').trim().toUpperCase()
        const exchange = String(row[exchangeIndex as number] ?? '').trim()
        if (!name || !ticker) continue
        const company = companies.get(cik) ?? { cik, name, tickers: [], exchanges: [] }
        if (!company.tickers.includes(ticker)) company.tickers.push(ticker)
        if (exchange && !company.exchanges.includes(exchange)) company.exchanges.push(exchange)
        companies.set(cik, company)
      } catch { /* skip malformed provider row */ }
    }
    return [...companies.values()]
  }

  private loadSubmissions(cik: string) {
    return this.submissionsCache.getOrLoad(cik, () => this.client.getJson<SubmissionsPayload>(buildSecUrls.submissions(cik)))
  }

  private companyFromSubmissions(cik: string, raw: SubmissionsPayload): SecCompany {
    const name = typeof raw.name === 'string' ? raw.name : ''
    if (!name) throw new SecProviderError('SEC_COMPANY_NOT_FOUND', 'SEC company not found', 404)
    return {
      cik,
      name,
      tickers: Array.isArray(raw.tickers) ? raw.tickers.map(String) : [],
      exchanges: Array.isArray(raw.exchanges) ? raw.exchanges.map(String) : [],
    }
  }

  private normalizeColumns(cik: string, raw: unknown): SecFilingSummary[] {
    if (!raw || typeof raw !== 'object') return []
    const columns = raw as Record<string, unknown>
    const accessions = Array.isArray(columns.accessionNumber) ? columns.accessionNumber : []
    const required = ['filingDate', 'form', 'primaryDocument']
    return accessions.flatMap((accessionValue, index) => {
      if (typeof accessionValue !== 'string' || required.some(key => !Array.isArray(columns[key]) || typeof (columns[key] as unknown[])[index] !== 'string')) return []
      try {
        const accession = parseAccession(accessionValue).accession
        const value = (key: string): unknown => Array.isArray(columns[key]) ? (columns[key] as unknown[])[index] : undefined
        const text = (key: string): string | null => typeof value(key) === 'string' && value(key) !== '' ? value(key) as string : null
        const form = String(value('form')).toUpperCase()
        return [{
          cik,
          accession,
          filingDate: String(value('filingDate')),
          reportDate: text('reportDate'),
          acceptanceDateTime: text('acceptanceDateTime'),
          form,
          isAmendment: form.endsWith('/A'),
          primaryDocument: parseDocumentBasename(String(value('primaryDocument'))),
          primaryDocumentDescription: text('primaryDocDescription'),
          fileNumber: text('fileNumber'),
          filmNumber: text('filmNumber'),
          items: text('items'),
          size: typeof value('size') === 'number' ? value('size') as number : null,
        } satisfies SecFilingSummary]
      } catch { return [] }
    })
  }

  private async allFilings(cik: string): Promise<SecFilingSummary[]> {
    const submissions = await this.loadSubmissions(cik)
    const rows = this.normalizeColumns(cik, submissions.value.filings?.recent)
    for (const file of submissions.value.filings?.files ?? []) {
      if (typeof file.name !== 'string') continue
      const segment = await this.segmentCache.getOrLoad(file.name, () => this.client.getJson<FilingColumns>(buildSecUrls.historicalSegment(file.name as string)))
      rows.push(...this.normalizeColumns(cik, segment.value))
    }
    return rows
  }

  private matchesFilters(row: SecFilingSummary, filters: SecFilingFilters): boolean {
    if (filters.forms.length && !filters.forms.some(form => form.endsWith('/A') ? row.form === form : row.form === form || row.form === `${form}/A`)) return false
    if (filters.amendments === 'exclude' && row.isAmendment) return false
    if (filters.amendments === 'only' && !row.isAmendment) return false
    if (filters.filedFrom && row.filingDate < filters.filedFrom) return false
    if (filters.filedTo && row.filingDate > filters.filedTo) return false
    if (filters.periodFrom && (!row.reportDate || row.reportDate < filters.periodFrom)) return false
    if (filters.periodTo && (!row.reportDate || row.reportDate > filters.periodTo)) return false
    return true
  }

  private compareFilings(a: SecFilingSummary, b: SecFilingSummary): number {
    return b.filingDate.localeCompare(a.filingDate) || (b.acceptanceDateTime ?? '').localeCompare(a.acceptanceDateTime ?? '') || b.accession.localeCompare(a.accession)
  }

  private filterFingerprint(cik: string, filters: SecFilingFilters): string {
    return createHash('sha256').update(JSON.stringify({ cik, forms: filters.forms, amendments: filters.amendments, filedFrom: filters.filedFrom, filedTo: filters.filedTo, periodFrom: filters.periodFrom, periodTo: filters.periodTo })).digest('base64url').slice(0, 16)
  }

  private encodeCursor(offset: number, fingerprint: string): string {
    return Buffer.from(JSON.stringify({ v: 1, offset, fingerprint })).toString('base64url')
  }

  private decodeCursor(cursor: string, fingerprint: string): number {
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { v?: unknown; offset?: unknown; fingerprint?: unknown }
      if (value.v !== 1 || value.fingerprint !== fingerprint || !Number.isInteger(value.offset) || Number(value.offset) < 0) throw new Error('bad cursor')
      return Number(value.offset)
    } catch { throw new SecProviderError('SEC_VALIDATION_ERROR', 'Invalid filing cursor', 400) }
  }

  private buildDocuments(rawJson: unknown, html: string, filing: SecFilingSummary): SecFilingDocument[] {
    const directory = rawJson && typeof rawJson === 'object' ? (rawJson as { directory?: { item?: unknown } }).directory : undefined
    const items = Array.isArray(directory?.item) ? directory.item : []
    const htmlMetadata = this.parseIndexHtml(html)
    return items.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      try {
        const basename = parseDocumentBasename(String(record.name ?? ''))
        if (basename.endsWith('-index.html') || basename === 'index.json') return []
        const size = Number(record.size)
        if (!Number.isFinite(size) || size < 0) return []
        const metadata = htmlMetadata.get(basename)
        const type = metadata?.type ?? null
        const isPrimary = basename === filing.primaryDocument
        const isPdf = basename.toLowerCase().endsWith('.pdf')
        const isXbrl = this.isXbrl(basename, type, metadata?.description ?? null)
        const isExhibit = Boolean(type?.toUpperCase().startsWith('EX-'))
        const complete = basename === `${filing.accession}.txt`
        const classification = isPrimary ? 'primary' : complete ? 'complete-submission' : isXbrl ? 'xbrl' : isPdf ? 'pdf' : isExhibit ? 'exhibit' : 'other'
        return [{ basename, description: metadata?.description ?? null, type, sequence: metadata?.sequence ?? null, size, classification, isPrimary, isPdf, isXbrl, isExhibit } satisfies SecFilingDocument]
      } catch { return [] }
    })
  }

  private parseIndexHtml(html: string): Map<string, { sequence: number | null; description: string | null; type: string | null }> {
    const result = new Map<string, { sequence: number | null; description: string | null; type: string | null }>()
    for (const row of html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => this.stripHtml(match[1] ?? ''))
      if (cells.length < 4) continue
      try {
        const basename = parseDocumentBasename(cells[2] ?? '')
        result.set(basename, { sequence: /^\d+$/.test(cells[0] ?? '') ? Number(cells[0]) : null, description: cells[1] || null, type: cells[3] || null })
      } catch { /* skip unsafe provider row */ }
    }
    return result
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').trim()
  }

  private isXbrl(name: string, type: string | null, description: string | null): boolean {
    const lower = name.toLowerCase()
    return /\.(xsd|xml)$/.test(lower) || /_(cal|def|lab|pre)\.xml$/.test(lower) || Boolean(type?.toUpperCase().startsWith('EX-101')) || Boolean(description?.toUpperCase().includes('XBRL'))
  }
}

export function createSecEdgarService(userAgent: string, fetchFn?: typeof fetch): SecEdgarService {
  if (!userAgent.trim() || !userAgent.includes('@')) return createUnavailableSecEdgarService()
  return new SecEdgarService(new SecEdgarClient({ userAgent, fetchFn }))
}

export function createSecFixtureService(client: SecClientLike): SecEdgarService {
  return new SecEdgarService(client)
}

export function createUnavailableSecEdgarService(): SecEdgarService {
  const unavailable = async () => {
    throw new SecProviderError('SEC_CONFIG_MISSING', 'SEC_USER_AGENT must contain application name and contact email', 503)
  }
  return new SecEdgarService({ getJson: unavailable, getText: unavailable, getStream: unavailable })
}
