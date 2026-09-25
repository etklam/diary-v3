import { createHash } from 'node:crypto'
import {
  calculateDirectionScore,
  calculateRelativeStrength,
  calculateResearchMetrics,
  deriveStructuralLevels,
  normalizeResearchBars,
  validateResearchInput,
  type ResearchBar as DomainResearchBar,
  type ResearchCalculationInput,
  type ResearchSession as DomainResearchSession,
  type ResearchObservedBar,
} from '@diary/domain/research-studio'
import { calendarDateInTimezone } from '@diary/domain'
import { buildUsEquityClosedDateSet, getUsEquityCalendarYear, isUsEquityCalendarYearSupported, isUsEquityWeekend, US_EQUITY_CALENDAR_SOURCE_URLS, US_EQUITY_CALENDAR_VERIFIED_AT, US_EQUITY_CALENDAR_YEARS } from '@diary/domain/us-equity-calendar'
import { deriveTradePlanCandidates } from '@diary/domain/research-studio'
import type {
  ResearchEvidenceManifest,
  ResearchInstrumentProfile,
  ResearchQaGate,
  ResearchSourceRecord,
} from '@diary/contracts'
import type { ResearchEvidencePreparation, ResearchEvidenceProvider } from './service.js'
import {
  assertSourceOperation,
  createSourcePolicy,
  sourcePermissionIsVerifiedAllowed,
  sourcePolicyToRecord,
  sourcePolicySnapshot,
  sourceUseFromPolicy,
  TAVILY_SEARCH_POLICY,
  YAHOO_RESEARCH_POLICY,
  type ResearchSourcePolicy,
} from './source-policy.js'
import { createSourceFetcher, SourceFetchError, type SourceFetcher } from './source-fetcher.js'
import type { CompleteDailyResearchBar, MarketRead } from '../market-data/index.js'

export type CompleteResearchMarket = {
  dailyResearchBars(symbol: string, range?: '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max', signal?: AbortSignal): Promise<MarketRead<readonly CompleteDailyResearchBar[]>>
}

export type ResearchCalendarProvider = (input: {
  symbol: string
  fromDate: string
  toDate: string
  exchangeTimezone: string
  asOf: Date
  signal?: AbortSignal
}) => Promise<ResearchCalendarSnapshot>

export type ResearchCalendarSnapshot = {
  sourceId: string
  version: string
  verifiedAt: string
  coverageStart: string
  coverageEnd: string
  basisUrl: string
  sessions: readonly DomainResearchSession[]
  synthetic: boolean
}

export const VERIFIED_US_EQUITY_CALENDAR_SOURCE_ID = 'US_EQUITY_TRADING_CALENDAR'
export const VERIFIED_US_EQUITY_CALENDAR_VERSION = 'us-equity-calendar-2025-2028-v1'

function addCalendarDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function calendarDateRange(fromDate: string, toDate: string): string[] {
  const result: string[] = []
  for (let day = new Date(`${fromDate}T00:00:00.000Z`), end = new Date(`${toDate}T00:00:00.000Z`); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    result.push(day.toISOString().slice(0, 10))
  }
  return result
}

function timezoneOffsetMinutes(date: Date, timezone: string): number {
  const value = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value
  const match = value?.match(/^GMT([+-])(\d{2}):(\d{2})$/u)
  if (!match) throw new ResearchSourceError('SOURCE_CALENDAR_TIMEZONE_INVALID', `Could not resolve the ${timezone} UTC offset.`)
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

function zonedCloseAt(dateKey: string, hour: 13 | 16, timezone: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const localAsUtc = Date.UTC(year!, month! - 1, day!, hour)
  let instant = localAsUtc
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = localAsUtc - timezoneOffsetMinutes(new Date(instant), timezone) * 60_000
  }
  return new Date(instant).toISOString()
}

function isoWeekKey(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00.000Z`)
  const dayNumber = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - dayNumber + 3)
  const year = day.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(year, 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3)
  return `${year}-W${String(1 + Math.round((day.getTime() - firstThursday.getTime()) / 604_800_000)).padStart(2, '0')}`
}

/** Build the bounded, source-versioned NYSE schedule from the curated official closure set. */
export function createVerifiedUsEquityCalendarProvider(): ResearchCalendarProvider {
  return async ({ fromDate, toDate, exchangeTimezone, asOf }) => {
    const coverageStart = `${US_EQUITY_CALENDAR_YEARS[0]}-01-01`
    const coverageEnd = `${US_EQUITY_CALENDAR_YEARS.at(-1)}-12-31`
    const scheduleThrough = addCalendarDays(toDate, 7)
    if (fromDate < coverageStart || scheduleThrough > coverageEnd || !isUsEquityCalendarYearSupported(Number(fromDate.slice(0, 4))) || !isUsEquityCalendarYearSupported(Number(scheduleThrough.slice(0, 4)))) {
      throw new ResearchSourceError('SOURCE_CALENDAR_COVERAGE_GAP', 'The requested sessions exceed the verified calendar coverage.')
    }
    const byYear = new Map<number, ReturnType<typeof buildUsEquityClosedDateSet>>()
    const dates = calendarDateRange(fromDate, scheduleThrough)
    const scheduled = dates.flatMap(date => {
      const year = Number(date.slice(0, 4))
      let closed = byYear.get(year)
      if (closed === undefined) {
        closed = buildUsEquityClosedDateSet(year)
        byYear.set(year, closed)
      }
      const calendar = getUsEquityCalendarYear(year)
      if (!closed || !calendar || isUsEquityWeekend(date) || closed.has(date)) return []
      const halfDay = calendar.halfDayDates.includes(date)
      return [{
        date,
        closeAt: zonedCloseAt(date, halfDay ? 13 : 16, exchangeTimezone),
        isCompleted: zonedCloseAt(date, halfDay ? 13 : 16, exchangeTimezone) <= asOf.toISOString(),
        isWeekFinal: false,
        timezone: exchangeTimezone,
        sourceId: VERIFIED_US_EQUITY_CALENDAR_SOURCE_ID,
      } satisfies DomainResearchSession]
    })
    const finalSessionByWeek = new Map<string, string>()
    for (const session of scheduled) finalSessionByWeek.set(isoWeekKey(session.date), session.date)
    const sessions = scheduled.map(session => ({ ...session, isWeekFinal: finalSessionByWeek.get(isoWeekKey(session.date)) === session.date }))
    return {
      sourceId: VERIFIED_US_EQUITY_CALENDAR_SOURCE_ID,
      version: VERIFIED_US_EQUITY_CALENDAR_VERSION,
      verifiedAt: `${US_EQUITY_CALENDAR_VERIFIED_AT}T00:00:00.000Z`,
      coverageStart,
      coverageEnd,
      basisUrl: US_EQUITY_CALENDAR_SOURCE_URLS[0] ?? 'https://www.nyse.com/trade/hours-calendars',
      sessions,
      synthetic: false,
    }
  }
}

export type ResearchSourceFactoryOptions = {
  market: CompleteResearchMarket
  /** Offline fixture reader used for synthetic runs; live market is never used for them. */
  syntheticMarket?: CompleteResearchMarket
  calendar?: ResearchCalendarProvider
  /** Offline fixture calendar; never substituted with weekday approximations. */
  syntheticCalendar?: ResearchCalendarProvider
  calendarFromDate?: string
  now?: () => Date
  policy?: ResearchSourcePolicy
  sourcePolicyForSymbol?: (symbol: string) => ResearchSourcePolicy
  range?: '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max'
  calendarPolicy?: ResearchSourcePolicy
  sourceFetcher?: SourceFetcher
  officialSources?: readonly OfficialResearchSourceInput[]
  search?: ResearchSearchConfiguration
}

export type OfficialResearchSourceRole = 'issuer_ir' | 'event_calendar' | 'fund_holdings' | 'official_release'

export type OfficialResearchMetadata = {
  title?: string | null
  publishedAt?: string | null
  eventAt?: string | null
  holdingsAsOf?: string | null
  facts?: Readonly<Record<string, string | number | boolean | null>>
}

/** A source-specific extractor is explicit and bounded; no generic page parser is assumed. */
export type OfficialResearchSourceInput = {
  sourceId: string
  role: OfficialResearchSourceRole
  publisher: string
  url: string
  /** Owner email included in the User-Agent; required for BLS-hosted automated retrieval. */
  contact?: string
  policy: ResearchSourcePolicy
  extractMetadata: (document: string, input: { symbol: string; asOf: Date }) => OfficialResearchMetadata
  maxBytes?: number
  timeoutMs?: number
}

export type ResearchSearchConfiguration = {
  provider: TavilySearchProvider
  policy: ResearchSourcePolicy
  query: (instrument: Pick<ResearchInstrumentProfile, 'symbol' | 'name' | 'exchange'>, asOf: Date) => string
}

export class ResearchSourceError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message)
    this.name = 'ResearchSourceError'
  }
}

const maxOfficialSourceContactLength = 254
const officialSourceContactPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/iu

function officialSourceContact(value: string | undefined): string | null {
  if (value === undefined) return null
  const hasControlCharacter = [...value].some(character => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || (code >= 127 && code <= 159)
  })
  if (value.length > maxOfficialSourceContactLength || hasControlCharacter) {
    throw new ResearchSourceError('SOURCE_CONTACT_INVALID', 'Official source contact must be a single email address no longer than 254 characters.')
  }
  const contact = value.trim()
  if (!contact) return null
  if (!officialSourceContactPattern.test(contact)) {
    throw new ResearchSourceError('SOURCE_CONTACT_INVALID', 'Official source contact must be a valid email address without header control characters.')
  }
  return contact
}

function isBlsHost(hostname: string): boolean {
  return hostname === 'bls.gov' || hostname.endsWith('.bls.gov')
}

function sourceIdFor(symbol: string): string {
  void symbol
  return 'YAHOO_CHART'
}

function policyForSymbol(options: ResearchSourceFactoryOptions, symbol: string): ResearchSourcePolicy {
  const configured = options.sourcePolicyForSymbol?.(symbol) ?? options.policy ?? YAHOO_RESEARCH_POLICY
  return configured.sourceId === sourceIdFor(symbol) ? configured : { ...configured, sourceId: sourceIdFor(symbol) }
}

function asObservedBar(row: CompleteDailyResearchBar, sourceId: string, session: DomainResearchSession | undefined): ResearchObservedBar {
  const regular = row.session === 'regular'
  return {
    symbol: row.symbol,
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    adjClose: row.adjustedClose,
    volume: row.volume,
    priceSourceId: sourceId,
    volumeSourceId: row.volumeSourceId === null ? null : sourceId,
    adjustmentBasis: row.adjustmentBasis,
    volumeBasis: row.volumeBasis,
    session: !regular ? row.session : session?.isCompleted ? 'regular_close' : 'regular_intraday',
    dataAsOf: row.dataAsOf,
    retrievedAt: row.retrievedAt,
    isComplete: session?.isCompleted === true && regular,
    isWeekFinal: session?.isWeekFinal === true,
  }
}

function asDomainBar(bar: ResearchObservedBar): DomainResearchBar | null {
  if (bar.close === null || !Number.isFinite(bar.close) || bar.session !== 'regular_close' || bar.priceSourceId === null) return null
  return { ...bar, close: bar.close, priceSourceId: bar.priceSourceId }
}

function toEvidenceBar(row: CompleteDailyResearchBar, sourceId: string): Record<string, unknown> {
  return {
    symbol: row.symbol, date: row.date,
    open: row.open === null ? null : String(row.open), high: row.high === null ? null : String(row.high), low: row.low === null ? null : String(row.low), close: row.close === null ? null : String(row.close), adjustedClose: row.adjustedClose === null ? null : String(row.adjustedClose), volume: row.volume === null ? null : String(row.volume),
    priceSourceId: row.priceSourceId === null ? null : sourceId, volumeSourceId: row.volumeSourceId === null ? null : sourceId, adjustmentBasis: row.adjustmentBasis, volumeBasis: row.volumeBasis, session: row.session, dataAsOf: row.dataAsOf, retrievedAt: row.retrievedAt,
  }
}

function sourceRecord(policy: ResearchSourcePolicy, symbol: string, read: MarketRead<readonly CompleteDailyResearchBar[]>, usedRows: readonly CompleteDailyResearchBar[]): ResearchSourceRecord {
  const fetchedRows = read.data
  const latest = usedRows.at(-1)
  const fetched = `${fetchedRows[0]?.date ?? 'unknown'}..${fetchedRows.at(-1)?.date ?? 'unknown'} (${fetchedRows.length} rows)`
  const used = `${usedRows[0]?.date ?? 'unknown'}..${latest?.date ?? 'unknown'} (${usedRows.length} rows)`
  const record = sourcePolicyToRecord(policy, {
    requestedUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history`,
    resolvedUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history`,
    title: `${symbol} complete daily research bars`,
    publisher: policy.provider,
    retrievedAt: read.fetchedAt,
    dataAsOf: latest?.dataAsOf ?? null,
    readRange: `fetched=${fetched}; used=${used}; truncated=${Math.max(0, fetchedRows.length - usedRows.length)}`,
    evidenceLocator: `dailyResearchBars:${symbol}`,
  })
  return { ...record, limitations: [...record.limitations, `Fetched scope: ${fetched}.`, `Used scope: ${used}.`, `Truncated fetched rows outside the last 400 verified completed sessions: ${Math.max(0, fetchedRows.length - usedRows.length)}.`] }
}

function optionalText(value: unknown, max = 1_000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

function isSourceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isSourceInstant(value: string): boolean {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|([+-])(\d{2}):?(\d{2}))$/u)
  if (!match || !isSourceDate(match[1]!)) return false
  const [, , hour, minute, second = '0', , , offsetHour = '0', offsetMinute = '0'] = match
  return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 && Number(offsetHour) <= 23 && Number(offsetMinute) <= 59 && Number.isFinite(Date.parse(value))
}

function optionalSourceDate(value: unknown): string | null {
  const candidate = optionalText(value, 100)
  return candidate && (isSourceDate(candidate) || isSourceInstant(candidate)) ? candidate : null
}

type PublicationAvailability = 'AVAILABLE_AS_OF' | 'AFTER_AS_OF' | 'UNKNOWN'

function publicationAvailability(value: string | null, asOf: Date): PublicationAvailability {
  if (!value) return 'UNKNOWN'
  if (isSourceDate(value)) return 'UNKNOWN'
  const publishedAt = Date.parse(value)
  return publishedAt <= asOf.getTime() ? 'AVAILABLE_AS_OF' : 'AFTER_AS_OF'
}

function eventWindow(eventAt: string | null, asOf: Date): { timing: 'PAST_BACKGROUND' | 'UPCOMING_WITHIN_28D' | 'UPCOMING_AFTER_28D' | 'EVENT_TIME_UNKNOWN'; inside28dWindow: boolean | null } {
  if (!eventAt || isSourceDate(eventAt) || !isSourceInstant(eventAt)) return { timing: 'EVENT_TIME_UNKNOWN', inside28dWindow: null }
  const eventTime = Date.parse(eventAt)
  if (eventTime < asOf.getTime()) return { timing: 'PAST_BACKGROUND', inside28dWindow: false }
  const end = new Date(asOf.getTime())
  end.setUTCDate(end.getUTCDate() + 28)
  const inside28dWindow = eventTime <= end.getTime()
  return { timing: inside28dWindow ? 'UPCOMING_WITHIN_28D' : 'UPCOMING_AFTER_28D', inside28dWindow }
}

function normalizeOfficialMetadata(value: OfficialResearchMetadata): OfficialResearchMetadata {
  const facts: Record<string, string | number | boolean | null> = {}
  for (const [key, raw] of Object.entries(value.facts ?? {}).slice(0, 25)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(key)) continue
    if (typeof raw === 'string') facts[key] = raw.slice(0, 1_000)
    else if (typeof raw === 'number' && Number.isFinite(raw)) facts[key] = raw
    else if (typeof raw === 'boolean' || raw === null) facts[key] = raw
  }
  return {
    title: optionalText(value.title, 500),
    publishedAt: optionalSourceDate(value.publishedAt),
    eventAt: optionalSourceDate(value.eventAt),
    holdingsAsOf: optionalSourceDate(value.holdingsAsOf),
    facts,
  }
}

const officialSourceRoles: readonly OfficialResearchSourceRole[] = ['issuer_ir', 'event_calendar', 'fund_holdings', 'official_release']

function withUnconfiguredOfficialSourceRoles(evidence: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const configuredRoles = new Set(evidence.map(item => item.role).filter((role): role is OfficialResearchSourceRole => officialSourceRoles.includes(role as OfficialResearchSourceRole)))
  return [
    ...evidence,
    ...officialSourceRoles.filter(role => !configuredRoles.has(role)).map(role => ({
      sourceId: null,
      role,
      status: 'N_A',
      title: null,
      publicationAt: null,
      eventAt: null,
      holdingsAsOf: null,
      metadata: null,
      reviewRequired: true,
      note: 'No approved direct-source URL and role-specific extractor are configured; this evidence remains unavailable.',
    })),
  ]
}

export async function collectOfficialResearchSources(input: {
  symbol: string
  asOf: Date
  sources: readonly OfficialResearchSourceInput[]
  fetcher: SourceFetcher
}): Promise<{ evidence: Record<string, unknown>[]; sources: ResearchSourceRecord[]; warnings: string[] }> {
  const evidence: Record<string, unknown>[] = []
  const sources: ResearchSourceRecord[] = []
  const warnings: string[] = []
  for (const configured of input.sources.slice(0, 10)) {
    if (configured.policy.sourceId !== configured.sourceId) throw new ResearchSourceError('SOURCE_POLICY_ID_MISMATCH', 'An official source policy must match its configured source ID.')
    const url = new URL(configured.url)
    if (url.protocol !== 'https:') throw new ResearchSourceError('SOURCE_UNSAFE_ENDPOINT', 'Configured official research sources must use HTTPS.')
    const contact = officialSourceContact(configured.contact)
    if (isBlsHost(url.hostname) && !contact) {
      const note = 'BLS-hosted automated retrieval was skipped; configure the source owner contact email before enabling this request.'
      sources.push(sourcePolicyToRecord(configured.policy, { requestedUrl: configured.url, resolvedUrl: null, publisher: configured.publisher, evidenceLocator: 'not_attempted:bls_owner_contact' }))
      evidence.push({ sourceId: configured.sourceId, role: configured.role, status: 'BLOCKED_BY_POLICY', requestedUrl: configured.url, title: null, publicationAt: null, eventAt: null, holdingsAsOf: null, metadata: null, reviewRequired: true, note })
      warnings.push(`${configured.sourceId}: ${note}`)
      continue
    }
    try {
      assertSourceOperation(configured.policy, 'automated_fetch')
      assertSourceOperation(configured.policy, 'evidence_storage')
    } catch {
      const record = sourcePolicyToRecord(configured.policy, { requestedUrl: configured.url, resolvedUrl: null, title: null, retrievedAt: null, dataAsOf: null, evidenceLocator: 'not_attempted:source_policy' })
      sources.push(record)
      evidence.push({ sourceId: configured.sourceId, role: configured.role, status: 'BLOCKED_BY_POLICY', title: null, publicationAt: null, eventAt: null, holdingsAsOf: null, metadata: null, reviewRequired: true })
      warnings.push(`${configured.sourceId} was not fetched because an operation-specific source permission is unresolved or restricted.`)
      continue
    }
    try {
      const { text, response } = await input.fetcher.text({ url: configured.url, allowedBaseUrls: [url.origin], timeoutMs: configured.timeoutMs ?? 10_000, maxBytes: configured.maxBytes ?? 1_000_000, headers: { Accept: 'text/html, text/plain;q=0.9, application/json;q=0.8', 'User-Agent': contact ? `ResearchStudio/1.0 (+mailto:${contact})` : 'ResearchStudio/1.0' } })
      const contentType = response.headers['content-type'] ?? response.headers['Content-Type'] ?? ''
      if (contentType && !/^(?:text\/|application\/(?:json|xml))/iu.test(contentType)) throw new ResearchSourceError('SOURCE_INVALID_RESPONSE', 'The official source returned an unsupported content type.')
      const metadata = normalizeOfficialMetadata(configured.extractMetadata(text, { symbol: input.symbol, asOf: input.asOf }))
      const hash = createHash('sha256').update(text).digest('hex')
      const publicationStatus = publicationAvailability(metadata.publishedAt ?? null, input.asOf)
      const publicationAvailable = publicationStatus === 'AVAILABLE_AS_OF'
      const inferenceAllowed = sourcePermissionIsVerifiedAllowed(sourceUseFromPolicy(configured.policy).llmInference)
      const metadataAllowedForModel = publicationAvailable && inferenceAllowed
      const event = metadataAllowedForModel ? eventWindow(metadata.eventAt ?? null, input.asOf) : { timing: 'EVENT_TIME_UNKNOWN' as const, inside28dWindow: null }
      const withheldReason = publicationStatus === 'AFTER_AS_OF'
        ? 'The source publication is after the requested as-of; its title and facts are excluded from the historical model evidence.'
        : publicationStatus === 'UNKNOWN'
          ? 'Publication time is missing or not precise enough to establish availability at the requested as-of; source facts are excluded.'
          : !metadataAllowedForModel
            ? 'Source metadata is withheld because llm_inference permission is not verified as allowed.'
            : event.timing === 'EVENT_TIME_UNKNOWN'
              ? 'The event date is date-only or timezone-unknown, so no exact 28-day window claim is available.'
              : 'Publication time, event time, and holdings-as-of are separate fields; extraction is not human-verified.'
      const sourceRecord = sourcePolicyToRecord(configured.policy, {
        requestedUrl: configured.url,
        resolvedUrl: configured.url,
        publisher: configured.publisher,
        title: metadataAllowedForModel ? metadata.title : null,
        retrievedAt: response.retrievedAt,
        dataAsOf: metadataAllowedForModel ? metadata.publishedAt ?? null : null,
        readRange: `${configured.role}; bounded document retrieval`,
        evidenceLocator: `sha256:${hash}`,
        contentHash: hash,
      })
      sources.push(sourceRecord)
      evidence.push({
        sourceId: configured.sourceId,
        role: configured.role,
        status: publicationStatus === 'AFTER_AS_OF' ? 'FUTURE_PUBLICATION' : publicationStatus === 'UNKNOWN' ? 'PUBLICATION_TIME_UNKNOWN' : inferenceAllowed ? 'REVIEW_REQUIRED' : 'WITHHELD_BY_POLICY',
        requestedUrl: configured.url,
        resolvedUrl: configured.url,
        publisher: configured.publisher,
        title: metadataAllowedForModel ? metadata.title : null,
        retrievedAt: response.retrievedAt,
        contentHash: hash,
        publicationAt: metadataAllowedForModel ? metadata.publishedAt : null,
        eventAt: metadataAllowedForModel ? metadata.eventAt : null,
        holdingsAsOf: metadataAllowedForModel ? metadata.holdingsAsOf : null,
        eventTiming: event.timing,
        inside28dWindow: event.inside28dWindow,
        publicationAvailability: publicationStatus,
        metadata: metadataAllowedForModel ? metadata.facts : null,
        reviewRequired: true,
        note: withheldReason,
      })
      if (!publicationAvailable) warnings.push(`${configured.sourceId} source content was excluded because publication availability at the requested as-of is ${publicationStatus.toLowerCase()}.`)
      else if (!metadataAllowedForModel) warnings.push(`${configured.sourceId} metadata was withheld from model evidence because llm_inference permission is not allowed.`)
    } catch (error) {
      const code = error instanceof SourceFetchError || error instanceof ResearchSourceError ? error.code : 'SOURCE_EXTRACTION_FAILED'
      const record = sourcePolicyToRecord(configured.policy, { requestedUrl: configured.url, resolvedUrl: null, publisher: configured.publisher, title: null, retrievedAt: null, dataAsOf: null, evidenceLocator: `failed:${code}` })
      sources.push(record)
      evidence.push({ sourceId: configured.sourceId, role: configured.role, status: 'FAILED', requestedUrl: configured.url, title: null, publicationAt: null, eventAt: null, holdingsAsOf: null, metadata: null, reviewRequired: true, failureCode: code })
      warnings.push(`${configured.sourceId} direct retrieval or extraction failed (${code}).`)
    }
  }
  if (input.sources.length > 10) warnings.push('Official source input limit is 10 per evidence preparation; excess entries were not attempted.')
  return { evidence, sources, warnings }
}

function pendingGateReason(gateId: ReturnType<typeof validateResearchInput>['gates'][number]['gateId'], fallback: string | null): string | null {
  switch (gateId) {
    case 'G07': return 'Trade-plan candidates are conditional WATCH plans; trigger, event, benchmark, and execution details still require human review.'
    case 'G08': return 'Event claims require source review; missing event evidence remains N/A and is not inferred.'
    case 'G09': return 'Citation support has not been reviewed against the original configured sources.'
    case 'G10': return 'Cross-section consistency has not been checked against a finalized report revision.'
    default: return fallback
  }
}

function qaFromValidation(validation: ReturnType<typeof validateResearchInput>, synthetic: boolean): ResearchQaGate[] {
  return validation.gates.map(gate => ({
    gateId: gate.gateId,
    severity: 'CORE',
    status: synthetic || gate.status === 'N/A' ? 'NOT_CHECKED' : gate.status,
    evidence: [...gate.evidence],
    reason: synthetic
      ? 'Synthetic evidence is for offline engineering tests only; QA is not completed for a real report.'
      : gate.status === 'FAIL'
      ? validation.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.code}${issue.date ? `(${issue.date})` : ''}: ${issue.message}`).join(' ').slice(0, 1_900)
      : gate.status === 'N/A' ? pendingGateReason(gate.gateId, gate.fixOrLimitation) : null,
    remediation: gate.fixOrLimitation,
    reviewerId: null,
    reviewedAt: null,
  }))
}

function metricsPayload(metrics: ReturnType<typeof calculateResearchMetrics>, levels: ReturnType<typeof deriveStructuralLevels>, score: ReturnType<typeof calculateDirectionScore>, relativeStrength: unknown) {
  return {
    calculatorVersion: metrics.calculatorVersion,
    symbol: metrics.symbol,
    referenceSession: metrics.referenceSession,
    adjustmentMode: metrics.adjustmentMode,
    latest: metrics.latest,
    series: {
      ema10: metrics.ema10, ema20: metrics.ema20, sma50: metrics.sma50, sma200: metrics.sma200,
      rsi14: metrics.rsi14, macd: metrics.macd, macdSignal: metrics.macdSignal, macdHistogram: metrics.macdHistogram,
      atr14: metrics.atr14, plusDi14: metrics.plusDi14, minusDi14: metrics.minusDi14, adx14: metrics.adx14,
      bollingerMid: metrics.bollingerMid, bollingerUpper: metrics.bollingerUpper, bollingerLower: metrics.bollingerLower,
      bollingerWidthPct: metrics.bollingerWidthPct, priorVolumeMean20: metrics.priorVolumeMean20, rvol20: metrics.rvol20,
    },
    completedWeeks: metrics.completedWeeks,
    weekSma30: metrics.weekSma30,
    pivots: metrics.pivots,
    gaps: metrics.gaps,
    levels,
    directionScore: score,
    relativeStrength,
    warnings: metrics.warnings,
  }
}

/**
 * Build the ResearchEvidenceProvider expected by ResearchStudioService. The
 * market reader is injected so tests and deployments can share the existing
 * queue/cache without making a second Yahoo client.
 */
export function createYahooResearchEvidenceProvider(options: ResearchSourceFactoryOptions): ResearchEvidenceProvider {
  const now = options.now ?? (() => new Date())
  const range = options.range ?? '5y'
  return async ({ instrument, asOf, synthetic, displayTimezone }): Promise<ResearchEvidencePreparation> => {
    const sourceMarket = synthetic ? options.syntheticMarket : options.market
    if (!sourceMarket) throw new ResearchSourceError('SOURCE_SYNTHETIC_PROVIDER_NOT_CONFIGURED', 'Synthetic evidence requires an injected offline market reader.')
    const calendarProvider = synthetic ? options.syntheticCalendar : (options.calendar ?? createVerifiedUsEquityCalendarProvider())
    if (!calendarProvider) throw new ResearchSourceError('SOURCE_CALENDAR_NOT_CONFIGURED', 'Synthetic evidence requires an injected offline calendar reader.')
    const symbols = [...new Set([instrument.symbol, ...instrument.benchmarks])]
    const policyBySymbol = new Map(symbols.map(symbol => [symbol, policyForSymbol(options, symbol)]))
    for (const policy of policyBySymbol.values()) {
      assertSourceOperation(policy, 'automated_fetch')
      assertSourceOperation(policy, 'evidence_storage')
    }
    const reads = await Promise.all(symbols.map(async symbol => ({ symbol, read: await sourceMarket.dailyResearchBars(symbol, range) })))
    const fetchedBySymbol = new Map(reads.map(item => [item.symbol, [...item.read.data].sort((a, b) => a.date.localeCompare(b.date))]))
    const fetchedPrimary = fetchedBySymbol.get(instrument.symbol) ?? []
    if (!fetchedPrimary.length) throw new ResearchSourceError('SOURCE_MARKET_DATA_UNAVAILABLE', `No daily rows were returned for ${instrument.symbol}.`, true)
    const exchangeDate = calendarDateInTimezone(asOf, 'America/New_York')
    const calendarFromDate = options.calendarFromDate ?? (synthetic ? fetchedPrimary[0]!.date : `${US_EQUITY_CALENDAR_YEARS[0]}-01-01`)
    const requestedCalendarEnd = addCalendarDays(exchangeDate, 7)
    const calendar = await calendarProvider({ symbol: instrument.symbol, fromDate: calendarFromDate, toDate: requestedCalendarEnd, exchangeTimezone: 'America/New_York', asOf })
    if (calendar.synthetic !== synthetic || calendar.coverageStart > calendarFromDate || calendar.coverageEnd < requestedCalendarEnd) {
      throw new ResearchSourceError('SOURCE_CALENDAR_COVERAGE_GAP', 'The supplied calendar does not verify the complete requested range.')
    }
    if (!calendar.sourceId || !Number.isFinite(Date.parse(calendar.verifiedAt))) {
      throw new ResearchSourceError('SOURCE_CALENDAR_INVALID', 'The calendar source identifier or verification timestamp is invalid.')
    }
    const sessions = [...calendar.sessions].sort((a, b) => a.date.localeCompare(b.date))
    const referenceSession = sessions.filter(session => session.isCompleted && Date.parse(session.closeAt) <= asOf.getTime()).map(session => session.date).at(-1)
    if (!referenceSession) throw new ResearchSourceError('SOURCE_CALENDAR_NO_COMPLETED_SESSION', 'No verified completed session exists at the requested as-of.')
    const targetSessions = sessions.filter(session => session.isCompleted && session.date <= referenceSession).slice(-400)
    const selectedStart = targetSessions[0]?.date
    if (!selectedStart) throw new ResearchSourceError('SOURCE_CALENDAR_NO_TARGET_SESSIONS', 'The verified calendar contains no target sessions.')
    const rowsBySymbol = new Map(reads.map(item => [item.symbol, (fetchedBySymbol.get(item.symbol) ?? []).filter(row => row.date >= selectedStart && row.date <= referenceSession)]))
    const primaryRows = rowsBySymbol.get(instrument.symbol) ?? []
    const primarySourceId = sourceIdFor(instrument.symbol)
    const sessionsByDate = new Map(sessions.map(session => [session.date, session]))
    const observedPrimary = primaryRows.map(row => asObservedBar(row, primarySourceId, sessionsByDate.get(row.date)))
    const completePrimary = observedPrimary.map(asDomainBar).filter((row): row is DomainResearchBar => row !== null)
    const normalizationMode = primaryRows.length > 0 && primaryRows.every(row => row.adjustedClose !== null) ? 'total_return_rebased' : 'split_only'
    const instrumentDomain: ResearchCalculationInput['instrument'] = { symbol: instrument.symbol, name: instrument.name, exchange: instrument.exchange, currency: instrument.currency, assetType: instrument.assetType.toLowerCase() }
    const calculationSessions = sessions.filter(session => session.date >= selectedStart)
    const calculationInput: ResearchCalculationInput = {
      instrument: instrumentDomain,
      bars: completePrimary,
      observedBars: observedPrimary,
      sessions: calculationSessions,
      referenceSession,
      asOf: asOf.toISOString(),
      adjustmentMode: normalizationMode,
      sourceIds: [...new Set(observedPrimary.flatMap(row => [row.priceSourceId, ...(row.volumeSourceId ? [row.volumeSourceId] : [])]).filter((value): value is string => value !== null))],
    }
    const validation = validateResearchInput(calculationInput)
    let metrics: ReturnType<typeof calculateResearchMetrics> | null = null
    let levels: ReturnType<typeof deriveStructuralLevels> = []
    let relativeStrength: ReturnType<typeof calculateRelativeStrength> = []
    let score: ReturnType<typeof calculateDirectionScore> | null = null
    if (validation.valid) {
      const normalized = normalizationMode === 'total_return_rebased' ? [...normalizeResearchBars(calculationInput).bars] : completePrimary
      metrics = calculateResearchMetrics({ ...calculationInput, bars: normalized, adjustmentMode: normalizationMode })
      levels = deriveStructuralLevels(metrics)
      relativeStrength = symbols.slice(1).flatMap(symbol => calculateRelativeStrength(completePrimary, (rowsBySymbol.get(symbol) ?? []).map(row => asDomainBar(asObservedBar(row, sourceIdFor(symbol), sessionsByDate.get(row.date)))).filter((row): row is DomainResearchBar => row !== null), symbol, referenceSession))
      const configuredComparisons = instrument.benchmarks.length === 3 ? instrument.benchmarks : undefined
      score = calculateDirectionScore(metrics, relativeStrength, configuredComparisons ? { relativeBenchmarks: configuredComparisons, threeMonthBenchmark: instrument.benchmarks[0] } : {})
    }
    const nextThreeFutureSessions = !calendar.synthetic
      ? sessions.filter(session => session.date > referenceSession && !session.isCompleted && Date.parse(session.closeAt) > asOf.getTime()).slice(0, 3)
      : []
    const validUntilSession = nextThreeFutureSessions.length === 3 ? nextThreeFutureSessions.at(-1)?.date ?? null : null
    const sourceRows = symbols.map(symbol => sourceRecord(policyBySymbol.get(symbol)!, symbol, reads.find(item => item.symbol === symbol)!.read, rowsBySymbol.get(symbol) ?? []))
    const calendarPolicy = synthetic
      ? createSourcePolicy({
        sourceId: calendar.sourceId,
        provider: `Offline synthetic calendar fixture (${calendar.sourceId})`,
        scope: 'Synthetic calendar rows used only for offline engineering tests.',
        basisUrl: calendar.basisUrl,
        checkedAt: calendar.verifiedAt,
        conditions: ['This fixture is not an official market calendar.', 'Synthetic evidence cannot be used for a real report or publication.'],
      })
      : options.calendarPolicy ?? VERIFIED_US_EQUITY_CALENDAR_POLICY
    const calendarSource = sourcePolicyToRecord(calendarPolicy, { requestedUrl: calendar.basisUrl, resolvedUrl: calendar.basisUrl, title: `${calendar.version} ${synthetic ? 'synthetic' : 'verified US equity'} session schedule`, publisher: synthetic ? calendarPolicy.provider : 'NYSE / Nasdaq official calendars', retrievedAt: now().toISOString(), dataAsOf: calendar.verifiedAt, readRange: `${calendar.coverageStart}..${calendar.coverageEnd}`, evidenceLocator: calendar.sourceId })
    const official = synthetic || !options.officialSources?.length ? { evidence: [], sources: [], warnings: synthetic && options.officialSources?.length ? ['Live official-source retrieval is disabled for synthetic evidence.'] : [] } : await collectOfficialResearchSources({ symbol: instrument.symbol, asOf, sources: options.officialSources, fetcher: options.sourceFetcher ?? createSourceFetcher() })
    let search = { status: 'SEARCH_NOT_CONFIGURED' as TavilySearchResponse['status'] }
    let searchSource: ResearchSourceRecord | null = null
    if (options.search && !synthetic) {
      const query = options.search.query({ symbol: instrument.symbol, name: instrument.name, exchange: instrument.exchange }, asOf)
      const result = await options.search.provider.search(query)
      search = { ...result, discoveryOnly: true } as typeof search
      if (result.status === 'READY') {
        searchSource = sourcePolicyToRecord(options.search.policy, { requestedUrl: 'https://api.tavily.com/search', resolvedUrl: 'https://api.tavily.com/search', title: `Discovery results for ${instrument.symbol}`, publisher: options.search.policy.provider, retrievedAt: result.retrievedAt, dataAsOf: null, readRange: `bounded query: ${result.query}`, evidenceLocator: 'discovery_only; original pages require direct retrieval' })
      }
    }
    const allSourceRows = [...sourceRows, calendarSource, ...official.sources, ...(searchSource ? [searchSource] : [])]
    const usedRowCount = primaryRows.length
    const fetchedRowCount = fetchedPrimary.length
    const missingSessions = validation.issues.filter(issue => issue.code === 'MISSING_EXPECTED_SESSION').flatMap(issue => {
      const dates = issue.message.match(/\d{4}-\d{2}-\d{2}/gu) ?? []
      return dates
    })
    const allCompleteOhlc = observedPrimary.filter(row => row.open !== null && row.high !== null && row.low !== null && row.close !== null).length
    const recentVolumeRows = observedPrimary.slice(-21)
    const recentVolumeBasis = new Set(recentVolumeRows.filter(row => row.volume !== null && row.volumeSourceId !== null).map(row => `${row.volumeSourceId}:${row.volumeBasis}`))
    const manifest: ResearchEvidenceManifest = {
      referenceSession,
      asOf: asOf.toISOString(),
      displayTimezone,
      exchangeTimezone: 'America/New_York',
      calendarVersion: calendar.version,
      normalizationVersion: normalizationMode,
      targetSessions: 400,
      rowCount: usedRowCount,
      completeOhlcRows: allCompleteOhlc,
      closeRows: observedPrimary.filter(row => row.close !== null).length,
      volumeRows: recentVolumeBasis.size === 1 ? recentVolumeRows.filter(row => row.volume !== null && row.volumeSourceId !== null).length : 0,
      missingSessions,
      warnings: [
        ...(synthetic ? ['Synthetic evidence is for offline engineering tests only.'] : []),
        ...(normalizationMode === 'split_only' ? ['Adjusted close is incomplete; cash-dividend adjustment is unavailable.'] : []),
        ...(targetSessions.length < 400 ? [`Only ${targetSessions.length} verified completed sessions were available; target is 400.`] : []),
        ...(fetchedRowCount > usedRowCount ? [`Fetched ${fetchedRowCount} rows; used ${usedRowCount} rows within the last ${targetSessions.length} verified completed sessions; truncated ${fetchedRowCount - usedRowCount} rows.`] : []),
        ...official.warnings,
        ...validation.issues.map(issue => issue.message),
      ],
      sourceIds: [...new Set(allSourceRows.map(source => source.sourceId))],
      synthetic,
    }
    return {
      manifest,
      bars: primaryRows.map(row => toEvidenceBar(row, primarySourceId)) as ResearchEvidencePreparation['bars'],
      sources: allSourceRows,
      metrics: metrics ? { ...metricsPayload(metrics, levels, score!, relativeStrength), validation: { valid: validation.valid, quality: validation.quality, issues: validation.issues, counts: validation.counts, gates: validation.gates } } : { calculatorVersion: 'ts-research-calculator-1.0.0', validation: { valid: validation.valid, quality: validation.quality, issues: validation.issues, counts: validation.counts, gates: validation.gates }, unavailable: 'Evidence validation failed; calculations are withheld.' },
      candidates: {
        levels,
        directionScore: score,
        tradePlans: deriveTradePlanCandidates(levels, metrics ? { referenceSession, currentClose: metrics.latest.close, atr14: metrics.latest.atr14, validUntilSession } : undefined),
        search,
        officialEvidence: withUnconfiguredOfficialSourceRoles(official.evidence),
        marketData: { fetched: { rows: fetchedRowCount, firstDate: fetchedPrimary[0]?.date ?? null, lastDate: fetchedPrimary.at(-1)?.date ?? null }, used: { rows: usedRowCount, firstDate: primaryRows[0]?.date ?? null, lastDate: primaryRows.at(-1)?.date ?? null, targetSessions: targetSessions.length }, truncatedRows: Math.max(0, fetchedRowCount - usedRowCount) },
        sourcePolicies: [...symbols.map(symbol => sourcePolicySnapshot(policyBySymbol.get(symbol)!)), sourcePolicySnapshot(calendarPolicy), ...(options.officialSources ?? []).map(source => sourcePolicySnapshot(source.policy)), ...(options.search ? [sourcePolicySnapshot(options.search.policy)] : [])],
      },
      qa: qaFromValidation(validation, synthetic),
    }
  }
}

export const VERIFIED_US_EQUITY_CALENDAR_POLICY = createSourcePolicy({
  sourceId: VERIFIED_US_EQUITY_CALENDAR_SOURCE_ID,
  provider: 'NYSE and Nasdaq official trading calendars',
  scope: 'Verified full-closure and early-close dates, interpreted with IANA America/New_York timezone rules.',
  basisUrl: US_EQUITY_CALENDAR_SOURCE_URLS[0] ?? null,
  checkedAt: `${US_EQUITY_CALENDAR_VERIFIED_AT}T00:00:00.000Z`,
  conditions: ['Calendar dates and schedule are bounded to the explicitly verified 2025–2028 coverage.', 'Unknown rights do not imply permission to redistribute source documents.'],
})

export function createLatestCompletedUsEquitySessionResolver(calendar: ResearchCalendarProvider = createVerifiedUsEquityCalendarProvider()) {
  return async (input: { symbol: string; exchangeTimezone: 'America/New_York'; asOf: Date; referenceSession?: string | null }) => {
    const exchangeDate = calendarDateInTimezone(input.asOf, input.exchangeTimezone)
    const fromDate = addCalendarDays(exchangeDate, -14)
    const toDate = addCalendarDays(exchangeDate, 7)
    let snapshot: ResearchCalendarSnapshot
    try { snapshot = await calendar({ symbol: input.symbol, fromDate, toDate, exchangeTimezone: input.exchangeTimezone, asOf: input.asOf }) }
    catch { return null }
    if (snapshot.synthetic || snapshot.coverageStart > fromDate || snapshot.coverageEnd < toDate) return null
    const session = [...snapshot.sessions].filter(row => row.isCompleted && Date.parse(row.closeAt) <= input.asOf.getTime() && row.date <= exchangeDate).sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    return session ? { session: session.date, calendarVersion: snapshot.version, verifiedSourceId: snapshot.sourceId } : null
  }
}

export const createResearchEvidenceProvider = createYahooResearchEvidenceProvider

export type TavilySearchResult = {
  title: string
  url: string
  snippet: string
  score: number | null
  publishedDate: string | null
}

export type TavilySearchResponse = {
  status: 'READY' | 'SEARCH_NOT_CONFIGURED' | 'SEARCH_QUOTA_EXCEEDED' | 'SEARCH_BUDGET_NOT_CONFIGURED'
  query: string
  results: readonly TavilySearchResult[]
  retrievedAt: string
  usage: { calls: number; returnedResults: number; billedCredits: number | null }
}

export class TavilySearchError extends Error {
  constructor(readonly code: 'SEARCH_PROVIDER_UNAVAILABLE' | 'SEARCH_INVALID_RESPONSE' | 'SEARCH_POLICY_BLOCKED' | 'SEARCH_BUDGET_UNAVAILABLE', message: string) {
    super(message)
    this.name = 'TavilySearchError'
  }
}

export type TavilySearchProvider = {
  search(query: string, signal?: AbortSignal): Promise<TavilySearchResponse>
}

/**
 * The API/worker supplies this reservation boundary from durable usage state.
 * The adapter deliberately refuses a configured key without it so a process
 * restart cannot reset the search allowance.
 */
export type TavilySearchBudget = {
  isConfigured?(): boolean | Promise<boolean>
  reserve(input: { provider: 'tavily'; query: string; maxCallsPerRun: number; maxCreditsPerCall: number; maxResults: number }): boolean | string | null | Promise<boolean | string | null>
  settle?(input: { provider: 'tavily'; query: string; success: boolean; returnedResults: number; billedCredits: number | null; reservationId?: string }): void | Promise<void>
}

export function createTavilySearchProvider(options: {
  apiKey?: string | null
  fetcher?: SourceFetcher
  policy?: ResearchSourcePolicy
  now?: () => Date
  maxCalls?: number
  maxResults?: number
  timeoutMs?: number
  budget?: TavilySearchBudget
} = {}): TavilySearchProvider {
  const now = options.now ?? (() => new Date())
  const apiKey = options.apiKey?.trim() || null
  const fetcher = options.fetcher ?? createSourceFetcher()
  const maxCalls = Math.max(0, Math.min(10, Math.floor(options.maxCalls ?? 3)))
  const maxResults = Math.max(1, Math.min(10, Math.floor(options.maxResults ?? 5)))
  let calls = 0
  let returnedResults = 0
  let billedCredits = 0
  return {
    async search(rawQuery, signal) {
      const query = rawQuery.trim().slice(0, 500)
      if (!apiKey) return { status: 'SEARCH_NOT_CONFIGURED', query, results: [], retrievedAt: now().toISOString(), usage: { calls, returnedResults, billedCredits: null } }
      if (!options.budget) return { status: 'SEARCH_BUDGET_NOT_CONFIGURED', query, results: [], retrievedAt: now().toISOString(), usage: { calls, returnedResults, billedCredits: null } }
      if (options.budget.isConfigured) {
        let budgetConfigured: boolean
        try { budgetConfigured = await options.budget.isConfigured() }
        catch (error) { throw new TavilySearchError('SEARCH_BUDGET_UNAVAILABLE', error instanceof Error ? error.message : 'Search budget is unavailable.') }
        if (!budgetConfigured) return { status: 'SEARCH_BUDGET_NOT_CONFIGURED', query, results: [], retrievedAt: now().toISOString(), usage: { calls, returnedResults, billedCredits: null } }
      }
      if (!query) throw new TavilySearchError('SEARCH_INVALID_RESPONSE', 'Search query is required.')
      if (calls >= maxCalls) return { status: 'SEARCH_QUOTA_EXCEEDED', query, results: [], retrievedAt: now().toISOString(), usage: { calls, returnedResults, billedCredits } }
      const policy = options.policy ?? TAVILY_SEARCH_POLICY
      try {
        assertSourceOperation(policy, 'automated_fetch')
        assertSourceOperation(policy, 'evidence_storage')
      }
      catch (error) { throw new TavilySearchError('SEARCH_POLICY_BLOCKED', error instanceof Error ? error.message : 'Search policy is not approved.') }
      let reservation: boolean | string | null
      try { reservation = await options.budget.reserve({ provider: 'tavily', query, maxCallsPerRun: maxCalls, maxCreditsPerCall: 1, maxResults }) }
      catch (error) { throw new TavilySearchError('SEARCH_BUDGET_UNAVAILABLE', error instanceof Error ? error.message : 'Search budget is unavailable.') }
      if (reservation === false || reservation === null) return { status: 'SEARCH_QUOTA_EXCEEDED', query, results: [], retrievedAt: now().toISOString(), usage: { calls, returnedResults, billedCredits } }
      const reservationId = typeof reservation === 'string' ? reservation : undefined
      calls += 1
      let success = false
      let requestResults = 0
      let requestCredits: number | null = null
      let result: TavilySearchResponse | null = null
      let requestError: unknown = null
      try {
        const { data, response } = await fetcher.json<{
          results?: Array<{ title?: unknown; url?: unknown; content?: unknown; score?: unknown; published_date?: unknown }>
          usage?: { credits?: unknown }
        }>({
          url: 'https://api.tavily.com/search', method: 'POST', allowedBaseUrls: ['https://api.tavily.com'], timeoutMs: options.timeoutMs ?? 10_000, maxBytes: 512_000, signal,
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          body: JSON.stringify({ query, search_depth: 'basic', max_results: maxResults, auto_parameters: false, include_answer: false, include_raw_content: false, include_images: false, include_usage: true }),
        })
        if (!Array.isArray(data.results)) throw new TavilySearchError('SEARCH_INVALID_RESPONSE', 'Tavily response did not contain results.')
        const results = data.results.flatMap(item => {
          if (typeof item.title !== 'string' || typeof item.url !== 'string' || !/^https:\/\//u.test(item.url)) return []
          const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null
          return [{ title: item.title.slice(0, 500), url: item.url, snippet: typeof item.content === 'string' ? item.content.slice(0, 2_000) : '', score, publishedDate: typeof item.published_date === 'string' ? item.published_date : null }]
        })
        returnedResults += results.length
        requestResults = results.length
        if (typeof data.usage?.credits === 'number' && Number.isFinite(data.usage.credits)) {
          requestCredits = data.usage.credits
          billedCredits += data.usage.credits
        }
        success = true
        result = { status: 'READY', query, results, retrievedAt: response.retrievedAt, usage: { calls, returnedResults, billedCredits } }
      } catch (error) {
        requestError = error instanceof TavilySearchError ? error : new TavilySearchError('SEARCH_PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'Tavily request failed.')
      }
      let settlementError: unknown = null
      try { await options.budget.settle?.({ provider: 'tavily', query, success, returnedResults: requestResults, billedCredits: requestCredits, ...(reservationId ? { reservationId } : {}) }) }
      catch (error) { if (success) settlementError = error }
      if (requestError) throw requestError
      if (settlementError) throw new TavilySearchError('SEARCH_BUDGET_UNAVAILABLE', settlementError instanceof Error ? settlementError.message : 'Search budget settlement failed.')
      if (!result) throw new TavilySearchError('SEARCH_PROVIDER_UNAVAILABLE', 'Tavily request completed without a result.')
      return result
    },
  }
}
