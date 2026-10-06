import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { selectLocale } from '../support/e2e.js'

const slug = 'synthetic-guru'
const caveatIds = [
  'DELAYED_QUARTER_END', 'TRADE_DATES_UNKNOWN', 'SHORT_POSITIONS_UNDISCLOSED', 'DERIVATIVES_MAY_BE_ABSENT',
  'CONFIDENTIAL_TREATMENT', 'VALUE_CHANGE_IS_NOT_A_TRADE', 'NOT_A_COMPLETE_PORTFOLIO',
]
const caveatText: Record<string, string> = {
  DELAYED_QUARTER_END: 'Form 13F is a delayed disclosure and reports holdings as of the quarter end, not today.',
  TRADE_DATES_UNKNOWN: 'Exact trade dates and execution prices are not disclosed and cannot be inferred.',
  SHORT_POSITIONS_UNDISCLOSED: 'Short positions are generally not disclosed in Form 13F.',
  DERIVATIVES_MAY_BE_ABSENT: 'Some derivative and hedging exposures may be absent from the disclosure.',
  CONFIDENTIAL_TREATMENT: 'Confidential treatment can temporarily hide holdings from a filing.',
  VALUE_CHANGE_IS_NOT_A_TRADE: 'A change in reported market value does not prove that a trade happened.',
  NOT_A_COMPLETE_PORTFOLIO: 'Form 13F does not represent the manager’s complete portfolio.',
}
const facts = [
  { id: 'portfolio.reportedValueUsd', label: 'Reported portfolio value (USD)', value: '1000000.00000000' },
  { id: 'concentration.topTen', label: 'Top ten concentration (%)', value: '100.00000000' },
  { id: 'turnover.band', label: 'Turnover band', value: 'MODERATE' },
]
const statement = (text: string, kind: 'fact' | 'interpretation', factRefs: string[] = []) => ({ text, kind, factRefs, positionKeys: [] })
const analysis = {
  executiveSummary: [statement('Reported value held at 1,000,000 USD for the quarter.', 'fact', ['portfolio.reportedValueUsd'])],
  portfolioDirection: [statement('The disclosed book stayed concentrated in its largest names.', 'interpretation')],
  convictionPositions: [], newPositions: [], increasedPositions: [], reducedPositions: [], exitedPositions: [],
  sectorAndThemeChange: [], concentrationChange: [statement('Top ten weight remained at 100%.', 'fact', ['concentration.topTen'])],
  turnoverInterpretation: [], historicalContext: [], consensusContext: [],
  risks: [statement('The quarter cannot show intra-quarter trading.', 'interpretation')],
  takeaways: [statement('Read the holdings table for the exact disclosed positions.', 'interpretation')],
  caveatIds,
}
const provenance = {
  runId: '41', periodEnd: '2026-06-30', status: 'succeeded', sourceState: 'current', reason: 'INITIAL',
  schemaVersion: 'guru-analysis-v1', contextVersion: 'guru-analysis-context-v1', analyticsVersion: 'guru-portfolio-analytics-v1',
  consensusVersion: 'guru-consensus-v1', inputHash: 'a'.repeat(64), promptKey: 'guru.analysis', promptSource: 'system-default',
  promptSystemVersion: 'guru-analysis-system-v1', promptOverrideVersionId: null, provider: 'Synthetic', model: 'fixture-model',
  inputTokens: 420, outputTokens: 90, latencyMs: 1200, errorCode: null,
  queuedAt: '2026-08-15T12:00:00.000Z', generatedAt: '2026-08-15T12:00:05.000Z',
}
const payload = (overrides: Record<string, unknown> = {}) => ({
  data: {
    profile: { name: 'Warren Buffett', managerName: 'Berkshire Hathaway', slug },
    periodEnd: '2026-06-30', state: 'READY',
    coverage: { quarterStatus: 'READY', mappingCoveragePercent: '100.00000000', comparisonStatus: 'COMPARABLE', consensusAvailable: true, historyQuarterCount: 1, notes: [] },
    facts, analysis, caveats: caveatIds.map(id => ({ id, text: caveatText[id]! })), provenance, history: [provenance],
    source: { accession: '0000000001-26-000002', periodEnd: '2026-06-30', filedAt: '2026-08-14T20:00:00.000Z', sourceUrl: 'https://www.sec.gov/Archives/fixture/0000000001-26-000002' },
    ...overrides,
  },
})

test('reads the Guru AI analysis with separated facts, disclosures and generation provenance', async ({ page }) => {
  await mkdir('docs/design/evidence/guru-analysis', { recursive: true })
  let state: 'READY' | 'STALE' | 'QUEUED' | 'BLOCKED_BY_COVERAGE' = 'READY'
  await page.route(`**/api/gurus/${slug}/analysis*`, async route => {
    const overrides: Record<string, unknown> = { state }
    if (state === 'QUEUED') Object.assign(overrides, { analysis: null, provenance: null, history: [] })
    if (state === 'BLOCKED_BY_COVERAGE') Object.assign(overrides, {
      analysis: null, provenance: null, history: [], facts: [],
      coverage: { quarterStatus: 'PARTIAL', mappingCoveragePercent: null, comparisonStatus: null, consensusAvailable: false, historyQuarterCount: 0, notes: ['QUARTER_NOT_READY'] },
    })
    if (state === 'STALE') Object.assign(overrides, { provenance: { ...provenance, sourceState: 'invalidated' } })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload(overrides)) })
  })

  await page.goto('/')
  await selectLocale(page, 'en')
  await page.goto(`/gurus/${slug}/analysis`)
  await expect(page.getByRole('heading', { name: 'Warren Buffett' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('delayed quarter-end disclosures')
  await expect(page.getByRole('heading', { name: 'Prepared facts' })).toBeVisible()
  await expect(page.getByText('Reported portfolio value (USD)')).toBeVisible()
  await expect(page.locator('.guru-analysis-facts')).toContainText('1,000,000')
  await expect(page.locator('.guru-analysis-facts')).toContainText('100%')
  await expect(page.locator('.guru-analysis-facts')).not.toContainText('100.00000000')
  await expect(page.getByRole('heading', { name: 'Executive summary' })).toBeVisible()
  await expect(page.locator('.guru-analysis-statements > li.is-fact').first()).toContainText('Reported value held at 1,000,000 USD')
  await expect(page.locator('.guru-analysis-statements .guru-analysis-kind.is-fact').first()).toHaveText('Prepared fact')
  await expect(page.getByText('Cites: portfolio.reportedValueUsd')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What 13F cannot tell you' })).toBeVisible()
  for (const id of caveatIds) await expect(page.locator('.guru-analysis-caveats')).toContainText(caveatText[id]!)
  await expect(page.getByRole('heading', { name: 'Generation record' })).toBeVisible()
  await expect(page.locator('.guru-analysis-provenance')).toContainText('guru.analysis')
  await expect(page.locator('.guru-analysis-provenance')).toContainText('fixture-model')
  await expect(page.locator('.guru-analysis-provenance code')).toContainText('aaaaaaaaaaaaaaaa')
  await page.screenshot({ path: 'docs/design/evidence/guru-analysis/analysis-desktop.png', fullPage: true })

  state = 'STALE'
  await page.reload()
  await expect(page.getByTestId('guru-analysis-state')).toContainText('no longer current')
  await expect(page.locator('.guru-analysis-provenance')).toContainText('invalidated')

  state = 'QUEUED'
  await page.reload()
  await expect(page.getByTestId('guru-analysis-state')).toContainText('queued')
  await expect(page.locator('.guru-analysis-sections')).toHaveCount(0)
  await expect(page.getByText('Reported portfolio value (USD)')).toBeVisible()

  state = 'BLOCKED_BY_COVERAGE'
  await page.reload()
  await expect(page.getByTestId('guru-analysis-state')).toContainText('not prepared yet')
  await expect(page.getByText('No prepared facts are available for this quarter yet.')).toBeVisible()

  state = 'READY'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Executive summary' })).toBeVisible()
  await expect(page.locator('.guru-analysis-caveats li').first()).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/guru-analysis/analysis-mobile.png', fullPage: true })
})
