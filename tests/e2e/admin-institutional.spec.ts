import { mkdir } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { test, expect, selectLocale } from '../support/e2e'

const adminEmail = 'etf-admin@example.test'
const adminPassword = 'synthetic-etf-admin-password'

async function signInAdmin(page: Page) {
  expect((await page.request.post('/api/auth/login', { data: { email: adminEmail, password: adminPassword } })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
}

const versions = {
  parser: '13f-xml-v1', resolver: '13f-amendments-v1', securityMapping: 'exact-identifiers-v1',
  analytics: 'guru-portfolio-analytics-v1', consensus: 'guru-consensus-v1',
  analysisContext: 'guru-analysis-context-v1', analysisSchema: 'guru-analysis-v1',
}
const queues = {
  filingsPending: 1, filingsPartial: 1, filingsError: 2, snapshotRebuildsPending: 0, analyticsEventsPending: 1,
  analyticsEventsFailed: 1, consensusRebuildsPending: 0, mappingRefreshJobsPending: 0, unresolvedMappings: 3,
  ambiguousMappings: 1, partialQuarters: 1, errorQuarters: 0, analysisQueued: 1, analysisRunning: 0,
  analysisFailed: 1, analysisInvalidated: 2,
}
const manager = {
  guruId: '7', managerId: '9', slug: 'synthetic-guru', name: 'Warren Buffett', managerName: 'Berkshire Hathaway',
  cik: '0001067983', active: true,
  discovery: {
    status: 'ERROR', lastCheckAt: '2026-08-20T08:00:00.000Z', lastSuccessAt: '2026-08-13T08:00:00.000Z',
    nextCheckAt: '2026-08-21T08:00:00.000Z', lastErrorCode: 'SEC_UPSTREAM_RATE_LIMITED', leaseHeld: false,
  },
  filings: { total: 4, pending: 1, downloaded: 0, parsed: 0, partial: 1, ready: 1, error: 1, superseded: 0 },
  latestFiling: { id: '21', accession: '0001067983-26-000002', form: '13F-HR/A', periodEnd: '2026-06-30', filedAt: '2026-08-14T20:00:00.000Z', status: 'PARTIAL', errorCode: 'SEC_13F_INFORMATION_TABLE_MISSING' },
  quarters: { ready: 2, partial: 1, error: 0 },
  mappingCoveragePercent: '96.50000000',
  analysis: { queued: 1, running: 0, succeeded: 3, failed: 1, invalidated: 2 },
}
const filing = {
  id: '21', managerId: '9', guruId: '7', guruSlug: 'synthetic-guru', guruName: 'Warren Buffett', cik: '0001067983',
  accession: '0001067983-26-000002', form: '13F-HR/A', filingDate: '2026-08-14', filedAt: '2026-08-14T20:00:00.000Z',
  periodEnd: '2026-06-30', status: 'PARTIAL', isAmendment: true, amendmentNumber: 1, amendmentType: 'RESTATEMENT',
  parserVersion: '13f-xml-v1', parsedRowCount: 2, rejectedRowCount: 1, mappingCoverage: '96.50',
  errorCode: 'SEC_13F_INFORMATION_TABLE_MISSING', sourceUrl: 'https://www.sec.gov/Archives/fixture/0001067983-26-000002',
  discoveredAt: '2026-08-14T21:00:00.000Z', ingestedAt: '2026-08-14T21:05:00.000Z', updatedAt: '2026-08-14T21:05:00.000Z',
}
const detail = {
  filing,
  documents: [{
    id: '31', basename: 'information-table.xml', documentType: 'INFORMATION TABLE', description: null, isPrimary: true,
    sourceUrl: 'https://www.sec.gov/Archives/fixture/information-table.xml', contentLength: '2048', downloadedAt: '2026-08-14T21:01:00.000Z',
    artifacts: [{
      id: '41', artifactRef: 'sec-edgar://13f/0001067983-26-000002/information-table.xml/abc',
      contentSha256: 'b'.repeat(64), contentLength: '2048', fetchedAt: '2026-08-14T21:01:00.000Z',
      fetchedReason: 'initial', retainUntil: null, rawContentRetained: true, supersedesArtifactId: null,
    }],
  }],
  parsedRows: {
    total: 2,
    sample: [{
      id: '51', rowNumber: 1, issuer: 'Synthetic Systems', titleOfClass: 'Common Stock', cusip: '123456789', figi: null,
      quantity: '1200.00000000', quantityType: 'SH', putCall: null, reportedValue: '700000.00000000',
      reportedValueUnit: 'USD', valueUnitSource: 'form-13f-2023-dollars', warnings: ['ROW_VALUE_UNIT_ASSUMED'],
      parserVersion: '13f-xml-v1', mappingStatus: 'UNRESOLVED', securityId: null,
    }],
  },
  effective: {
    snapshot: {
      id: '61', periodEnd: '2026-06-30', snapshotHash: 'c'.repeat(64), replayKey: 'd'.repeat(64),
      sourceManifestHash: 'e'.repeat(64), resolverVersion: '13f-amendments-v1', holdingCount: 2, createdAt: '2026-08-14T21:10:00.000Z',
    },
    publication: { status: 'READY', active: true, updatedAt: '2026-08-14T21:10:00.000Z' },
    periodState: { status: 'PARTIAL', reason: 'MAPPING_INCOMPLETE', checkedAt: '2026-08-14T21:10:00.000Z' },
    sources: [
      { ordinal: 0, filingId: '20', accession: '0001067983-26-000001', operation: 'ORIGINAL', amendmentNumber: null, parserVersion: '13f-xml-v1' },
      { ordinal: 1, filingId: '21', accession: '0001067983-26-000002', operation: 'RESTATEMENT', amendmentNumber: 1, parserVersion: '13f-xml-v1' },
    ],
  },
  amendments: [
    { id: '20', accession: '0001067983-26-000001', form: '13F-HR', isAmendment: false, amendmentNumber: null, amendmentType: null, filedAt: '2026-08-10T20:00:00.000Z', status: 'READY', operation: 'ORIGINAL', sourceUrl: 'https://www.sec.gov/Archives/fixture/0001067983-26-000001' },
    { id: '21', accession: '0001067983-26-000002', form: '13F-HR/A', isAmendment: true, amendmentNumber: 1, amendmentType: 'RESTATEMENT', filedAt: '2026-08-14T20:00:00.000Z', status: 'PARTIAL', operation: 'RESTATEMENT', sourceUrl: filing.sourceUrl },
  ],
  analytics: {
    status: 'PARTIAL', analyticsVersion: 'guru-portfolio-analytics-v1', mappingCoveragePercent: '96.50000000',
    holdingCount: 2, comparisonStatus: 'MAPPING_INCOMPLETE', calculatedAt: '2026-08-14T21:11:00.000Z',
  },
}

test('runs institutional operations: overview, filing lineage, and guarded non-duplicating actions', async ({ page }) => {
  await mkdir('docs/design/evidence/admin-institutional', { recursive: true })
  let reprocessCalls = 0
  let releaseOverview!: () => void
  let releaseFilings!: () => void
  const overviewGate = new Promise<void>(resolve => { releaseOverview = resolve })
  const filingsGate = new Promise<void>(resolve => { releaseFilings = resolve })
  await page.route('**/api/admin/institutional/overview', async route => {
    await overviewGate
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { scheduler: { nextAllowedAt: '2026-08-20T09:00:01.000Z', lastRequestAt: '2026-08-20T08:59:59.000Z', requestCount: '4821', failureCount: '3' }, queues, versions, managers: [manager] } }),
    })
  })
  await page.route('**/api/admin/institutional/filings?*', async route => {
    await filingsGate
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status')
    const data = status && status !== filing.status ? [] : [filing]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { limit: 20, offset: 0, total: data.length } }) })
  })
  await page.route('**/api/admin/institutional/filings/21', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: detail }),
  }))
  await page.route('**/api/admin/institutional/filings/21/reprocess', route => {
    reprocessCalls += 1
    const queued = reprocessCalls === 1
    return route.fulfill({
      status: queued ? 202 : 200, contentType: 'application/json',
      body: JSON.stringify({ data: {
        jobType: 'FILING_REPROCESS', jobId: 'filing:21', status: queued ? 'QUEUED' : 'ALREADY_QUEUED', managerId: '9',
        filingId: '21', periodEnd: '2026-06-30', revision: null, requestedAt: '2026-08-20T09:00:00.000Z',
        detail: queued ? 'Filing 0001067983-26-000002 returned to the ingestion queue; preserved artifacts are reused' : 'Filing 0001067983-26-000002 is already waiting for ingestion',
      } }),
    })
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAdmin(page)
  await page.goto('/admin/institutional')
  await expect(page.locator('.skeleton-list').first()).toBeVisible()
  releaseOverview()
  releaseFilings()
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Institutional operations', exact: true })).toBeVisible()
  await expect(page.getByText('Shared SEC scheduler')).toBeVisible()
  await expect(page.getByText('4821')).toBeVisible()
  await expect(page.getByText('Unresolved holdings')).toBeVisible()
  await expect(page.getByText('guru-portfolio-analytics-v1').first()).toBeVisible()
  await expect(page.getByRole('row', { name: /Warren Buffett/ }).first()).toContainText('SEC_UPSTREAM_RATE_LIMITED')
  await expect(page.locator('.admin-institutional-state').first()).toHaveCSS('display', 'inline-block')
  await expect(page.getByRole('link', { name: /0001067983-26-000002/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download diagnostics' })).toHaveAttribute('href', '/api/admin/institutional/diagnostics')
  await page.screenshot({ path: 'docs/design/evidence/admin-institutional/overview-1440.png', fullPage: true })

  await page.getByLabel('State').selectOption('ERROR')
  await expect(page.getByText('No filings match these filters.')).toBeVisible()
  await page.getByLabel('State').selectOption('PARTIAL')
  await expect(page.getByRole('cell', { name: 'SEC_13F_INFORMATION_TABLE_MISSING' })).toBeVisible()

  await page.goto('/admin/institutional/filings/21')
  await expect(page.getByRole('heading', { name: 'Filing inspector' })).toBeVisible()
  await expect(page.getByText('RESTATEMENT #1').first()).toBeVisible()
  await expect(page.getByText('MAPPING_INCOMPLETE').first()).toBeVisible()
  await expect(page.getByText('Showing 1 of 2 parsed rows')).toBeVisible()
  await expect(page.getByRole('cell', { name: /UNRESOLVED/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'ROW_VALUE_UNIT_ASSUMED' })).toBeVisible()
  await expect(page.getByRole('cell', { name: /1,200 SH/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: '700,000' })).toBeVisible()
  await expect(page.getByRole('link', { name: /0001067983-26-000001/ }).first()).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/admin-institutional/inspector-1440.png', fullPage: true })

  await page.getByRole('button', { name: 'Reprocess filing' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Return this filing to the ingestion queue?')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(reprocessCalls).toBe(0)
  await page.getByRole('button', { name: 'Reprocess filing' }).click()
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('status')).toContainText('Queued.')
  await page.getByRole('button', { name: 'Reprocess filing' }).click()
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('status')).toContainText('Already queued; nothing was duplicated.')
  expect(reprocessCalls).toBe(2)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Filing inspector' })).toBeVisible()
  const parsedRowsTable = page.locator('.admin-institutional-table.is-parsed-rows')
  const parsedRowsScroll = parsedRowsTable.locator('xpath=..')
  await expect(parsedRowsScroll).toHaveCSS('border-radius', '8px')
  expect(await parsedRowsScroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  const pageOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    overflowing: Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .filter(element => element.scrollWidth > element.clientWidth + 1)
      .map(element => ({ tag: element.tagName, className: element.className, width: element.scrollWidth, client: element.clientWidth, right: Math.round(element.getBoundingClientRect().right) }))
      .slice(0, 12),
  }))
  expect(pageOverflow.documentWidth <= pageOverflow.viewportWidth, JSON.stringify(pageOverflow)).toBe(true)
  await page.screenshot({ path: 'docs/design/evidence/admin-institutional/inspector-390.png', fullPage: true })
})
