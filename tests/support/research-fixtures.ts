import type { ResearchLatestCompletedSession, ResearchTransport, ResearchEvidenceProvider } from '../../apps/api/src/research-studio/service'
import { createYahooResearchEvidenceProvider, type CompleteResearchMarket, type ResearchCalendarProvider } from '../../apps/api/src/research-studio/sources'
import { createSourcePolicy } from '../../apps/api/src/research-studio/source-policy'
import type { CompleteDailyResearchBar } from '../../apps/api/src/market-data'

const latestFixtureSession = '2026-09-04'
const fixtureRetrievedAt = '2026-09-05T12:00:00.000Z'

function weekdaysEnding(endDate: string, count: number): string[] {
  const dates: string[] = []
  const cursor = new Date(`${endDate}T00:00:00.000Z`)
  while (dates.length < count) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return dates.reverse()
}

function barsFor(symbol: string): CompleteDailyResearchBar[] {
  let previousClose = 100
  return weekdaysEnding(latestFixtureSession, 420).map((date, index) => {
    const drift = symbol === 'SOXX' ? 0.08 : symbol === 'QQQ' ? 0.06 : 0.04
    const close = 100 + index * drift + Math.sin(index / 8) * 1.4 + Math.cos(index / 19) * 0.6
    const open = Math.min(previousClose, close) + 0.12
    const row: CompleteDailyResearchBar = {
      symbol,
      date,
      open,
      high: Math.max(open, close) + 1.1,
      low: Math.min(open, close) - 1.1,
      close,
      adjustedClose: close,
      volume: 1_000_000 + (index * 1_933) % 250_000,
      priceSourceId: 'YAHOO_CHART',
      volumeSourceId: 'YAHOO_CHART',
      adjustmentBasis: 'total_return_rebased',
      volumeBasis: 'raw',
      session: 'regular',
      dataAsOf: `${date}T21:00:00.000Z`,
      retrievedAt: fixtureRetrievedAt,
    }
    previousClose = close
    return row
  })
}

function syntheticCalendar(): ResearchCalendarProvider {
  return async ({ fromDate, toDate, asOf }) => {
    const dates: string[] = []
    const cursor = new Date(`${fromDate}T00:00:00.000Z`)
    const end = new Date(`${toDate}T00:00:00.000Z`)
    while (cursor <= end) {
      if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) dates.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    const weekKey = (dateKey: string) => {
      const date = new Date(`${dateKey}T00:00:00.000Z`)
      const weekday = (date.getUTCDay() + 6) % 7
      date.setUTCDate(date.getUTCDate() - weekday + 3)
      const year = date.getUTCFullYear()
      const firstThursday = new Date(Date.UTC(year, 0, 4))
      firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3)
      return `${year}-W${String(1 + Math.round((date.getTime() - firstThursday.getTime()) / 604_800_000)).padStart(2, '0')}`
    }
    const finalSessionByWeek = new Map<string, string>()
    for (const date of dates) finalSessionByWeek.set(weekKey(date), date)
    const sessions = dates.map(date => {
      const [year, month, day] = date.split('-').map(Number)
      const localAsUtc = Date.UTC(year!, month! - 1, day!, 16)
      const offsetName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' }).formatToParts(new Date(localAsUtc)).find(part => part.type === 'timeZoneName')?.value
      const offset = offsetName?.match(/^GMT([+-])(\d{2}):(\d{2})$/u)
      const offsetMinutes = offset ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '-' ? -1 : 1) : 0
      const closeAt = new Date(localAsUtc - offsetMinutes * 60_000).toISOString()
      return {
        date,
        closeAt,
        isCompleted: Date.parse(closeAt) <= asOf.getTime(),
        isWeekFinal: finalSessionByWeek.get(weekKey(date)) === date,
        timezone: 'America/New_York',
        sourceId: 'SYNTHETIC_WEEKDAY_CALENDAR',
      }
    })
    return {
      sourceId: 'SYNTHETIC_WEEKDAY_CALENDAR',
      version: 'synthetic-weekday-calendar-v1',
      verifiedAt: fixtureRetrievedAt,
      coverageStart: fromDate,
      coverageEnd: toDate,
      basisUrl: 'https://fixture.example.invalid/synthetic-calendar-policy',
      sessions,
      synthetic: true,
    }
  }
}

function serverOwnedQa() {
  return Array.from({ length: 10 }, (_, index) => {
    const gateNumber = index + 1
    const gateId = `G${String(gateNumber).padStart(2, '0')}`
    const needsHumanReview = gateNumber > 6
    return {
      gateId,
      severity: 'CORE' as const,
      status: needsHumanReview ? 'NOT_CHECKED' as const : 'PASS' as const,
      evidence: needsHumanReview ? [] : [`${gateId} evaluated against the deterministic synthetic evidence fixture.`],
      reason: needsHumanReview ? 'This gate requires explicit administrator review.' : null,
      remediation: needsHumanReview ? 'Review the corresponding citations or cross-section consistency before approving.' : null,
      reviewerId: null,
      reviewedAt: null,
    }
  })
}

function syntheticDraft() {
  const claims = Array.from({ length: 10 }, (_, index) => ({
    claimId: `SYNTHETIC_SECTION_${index + 1}`,
    section: index + 1,
    text: `Section ${index + 1} is an offline synthetic placeholder with no current market assertion.`,
    type: 'inference' as const,
    sourceIds: [],
    metricPaths: [],
    zoneIds: [],
    planIds: [],
    status: 'LIMITED' as const,
  }))
  return {
    schemaVersion: 'research-draft-v1',
    title: 'Synthetic SOXX research review',
    sections: Array.from({ length: 10 }, (_, index) => ({
      section: index + 1,
      title: `Synthetic section ${index + 1}`,
      content: 'Offline synthetic fixture content. No current market claim is made.',
      claimIds: [claims[index]!.claimId],
    })),
    claims,
    finalAnswers: Array.from({ length: 8 }, (_, index) => ({
      question: `Synthetic acceptance question ${index + 1}`,
      answer: 'This answer is supplied by the offline browser fixture.',
      claimIds: [claims[index]!.claimId],
    })),
    limitations: ['Synthetic fixture only; this is not current investment research.'],
  }
}

export function createSyntheticResearchFixture() {
  const market: CompleteResearchMarket = {
    async dailyResearchBars(symbol) {
      return { data: barsFor(symbol), source: 'upstream', fetchedAt: fixtureRetrievedAt }
    },
  }
  const evidenceProviderBase = createYahooResearchEvidenceProvider({
    market,
    syntheticMarket: market,
    syntheticCalendar: syntheticCalendar(),
    range: '5y',
    now: () => new Date(fixtureRetrievedAt),
    sourcePolicyForSymbol(symbol) {
      return createSourcePolicy({
        sourceId: `YAHOO_${symbol.replaceAll(/[^A-Z0-9]/g, '_')}_CHART`,
        provider: 'Synthetic offline market fixture',
        scope: 'Deterministic generated OHLCV rows used only by isolated tests.',
        basisUrl: 'https://fixture.example.invalid/research-source-policy',
        checkedAt: fixtureRetrievedAt,
        conditions: ['Synthetic fixture only; no live source request was made.'],
        decisions: {
          automated_fetch: 'allowed',
          evidence_storage: 'allowed',
          llm_inference: 'allowed',
          publication_of_analysis_and_excerpts: 'allowed',
          raw_data_redistribution: 'restricted',
        },
      })
    },
  })
  const evidenceProvider: ResearchEvidenceProvider = async input => {
    const prepared = await evidenceProviderBase(input)
    return {
      ...prepared,
      candidates: { ...prepared.candidates, search: { status: 'SEARCH_NOT_CONFIGURED' } },
      qa: serverOwnedQa(),
    }
  }
  let transportCalls = 0
  const transport: ResearchTransport = {
    async generate() {
      transportCalls += 1
      return {
        content: JSON.stringify(syntheticDraft()),
        model: 'synthetic-research-writer',
        requestId: `synthetic-research-${transportCalls}`,
        inputTokens: 120,
        outputTokens: 90,
        reasoningTokens: 0,
        reportedCostUsd: '0',
      }
    },
  }
  const latestCompletedSession: ResearchLatestCompletedSession = async () => ({
    session: latestFixtureSession,
    calendarVersion: 'SYNTHETIC_CALENDAR',
    verifiedSourceId: 'SYNTHETIC_CALENDAR',
  })
  return {
    evidenceProvider,
    latestCompletedSession,
    market,
    transport,
    get transportCalls() { return transportCalls },
  }
}
