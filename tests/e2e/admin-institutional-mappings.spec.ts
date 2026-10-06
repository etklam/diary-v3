import type { Page, Route } from '@playwright/test'
import { test, expect, selectLocale } from '../support/e2e'

const adminEmail = 'etf-admin@example.test'
const adminPassword = 'synthetic-etf-admin-password'
const accession = '0000098765-26-000001'

const timestamps = {
  created: '2026-10-06T08:00:00.000Z',
  reportedPeriod: '2026-06-30',
  source: 'https://www.sec.gov/Archives/edgar/data/98765/000009876526000001/',
}

function makeSecurity(id: string, issuer: string, cusip: string) {
  return {
    id, issuer, titleOfClass: 'Common Stock', exchange: 'NASDAQ', securityType: 'EQUITY', sector: 'Technology', industry: 'Software', status: 'ACTIVE',
    sourceUrl: 'https://issuer.example.test/investors/security', sourceVerifiedBy: '42', sourceVerifiedAt: timestamps.created,
    createdAt: timestamps.created, updatedAt: timestamps.created,
    identifiers: [{ id: `${id}1`, supersedesIdentifierId: null, type: 'CUSIP', value: cusip, validFrom: '2020-01-01', validTo: null, sourceUrl: 'https://issuer.example.test/investors/security', sourceVerifiedBy: '42', sourceVerifiedAt: timestamps.created }],
  }
}

const existingSecurity = makeSecurity('7002', 'Synthetic Corrected Inc.', '222222222')

function mappingRow() {
  return {
    holding: {
      id: '5001', filingId: '4001', accession, periodEnd: timestamps.reportedPeriod, issuer: 'Synthetic Filing Issuer', titleOfClass: 'Common Stock',
      cusip: '333333333', figi: null, quantity: '1000.00000000', quantityType: 'SH', reportedValue: '25000.00000000', putCall: null,
    },
    resolution: { status: 'UNRESOLVED', securityId: null, reason: 'NO_IDENTIFIER_MATCH', candidateSecurityIds: [], algorithmVersion: 'exact-identifiers-v1', resolvedAt: timestamps.created },
    security: null,
    candidates: [],
    override: null,
    overrideHistory: [],
  }
}

type MappingFixture = Omit<ReturnType<typeof mappingRow>, 'resolution' | 'security' | 'candidates' | 'override' | 'overrideHistory'> & {
  resolution: { status: string; securityId: string | null; reason: string; candidateSecurityIds: string[]; algorithmVersion: string; resolvedAt: string }
  security: ReturnType<typeof makeSecurity> | null
  candidates: Array<Pick<ReturnType<typeof makeSecurity>, 'id' | 'issuer' | 'titleOfClass' | 'status' | 'identifiers'>>
  override: Record<string, unknown> | null
  overrideHistory: Array<Record<string, unknown>>
}

async function signInAdmin(page: Page) {
  expect((await page.request.post('/api/auth/login', { data: { email: adminEmail, password: adminPassword } })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
}

async function gotoWithPreferences(page: Page, path: string) {
  const preferences = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/api/user/settings' && response.request().method() === 'GET' && response.ok()
  })
  await page.goto(path)
  await preferences
}

test('admin reviews, corrects, and traces a synthetic mapping on desktop and mobile', async ({ page }) => {
  let row: MappingFixture = mappingRow()
  let createdSecurity: ReturnType<typeof makeSecurity> | null = null
  let overrideVersion = 0
  let currentOverride: Record<string, unknown> | null = null
  let currentSecurity: ReturnType<typeof makeSecurity> | null = null
  const events: Record<string, Array<Record<string, unknown>>> = {}

  await page.setViewportSize({ width: 1440, height: 960 })
  await signInAdmin(page)
  await page.route('**/api/admin/institutional/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/admin/institutional/mappings' && request.method() === 'GET') {
      const search = url.searchParams.get('search') ?? ''
      const status = url.searchParams.get('status')
      const isManual = row.override !== null
      const include = status === 'MANUAL_OVERRIDE' ? isManual : !isManual
      const matches = include && (!search || search === accession || row.holding.issuer.includes(search) || row.holding.cusip === search)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        data: matches ? [row] : [],
        pagination: { limit: 20, offset: Number(url.searchParams.get('offset') ?? 0), total: matches ? 1 : 0 },
        filing: search === accession ? { id: '4001', accession, periodEnd: timestamps.reportedPeriod, status: 'PARSED', mappingCoverage: isManual ? '100.00' : '0.00', parsedRowCount: 1 } : null,
      }) })
      return
    }
    if (path === '/api/admin/institutional/securities' && request.method() === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      const data = q.toLowerCase().includes('corrected') || q === '222222222' ? [existingSecurity] : []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { limit: 20, offset: 0, total: data.length } }) })
      return
    }
    if (path === '/api/admin/institutional/securities' && request.method() === 'POST') {
      const body = request.postDataJSON() as { issuer: string; titleOfClass: string; identifiers: Array<{ value: string }> }
      createdSecurity = makeSecurity('7001', body.issuer, body.identifiers[0]?.value ?? '333333333')
      currentSecurity = createdSecurity
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        data: createdSecurity,
        mappingRefreshJob: {
          id: '8201', securityId: createdSecurity.id, status: 'PENDING', lastFilingId: null,
          processedFilingCount: 0, lastBatchProcessed: 0, lastError: null,
          updatedAt: timestamps.created, completedAt: null,
        },
      }) })
      return
    }
    const eventMatch = /^\/api\/admin\/institutional\/securities\/(\d+)\/identity-events$/.exec(path)
    if (eventMatch && request.method() === 'GET') {
      const data = events[eventMatch[1]!] ?? []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { limit: 50, offset: 0, total: data.length } }) })
      return
    }
    if (eventMatch && request.method() === 'POST') {
      const body = request.postDataJSON() as { kind: string; effectiveOn: string; newTicker?: string; reason: string; evidenceUrl: string; supersedesEventId?: string }
      const item = {
        id: '8101', kind: body.kind, fromSecurityId: eventMatch[1], toSecurityId: eventMatch[1], effectiveOn: body.effectiveOn,
        newTicker: body.newTicker ?? null, newSharesPerOldShare: null, comparable: true, reason: body.reason,
        evidenceUrl: body.evidenceUrl, actorUserId: '42', verifiedAt: timestamps.created, createdAt: timestamps.created, supersedesEventId: body.supersedesEventId ?? null,
      }
      events[eventMatch[1]!] = [item]
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: item }) })
      return
    }
    const overrideMatch = /^\/api\/admin\/institutional\/mappings\/(\d+)\/override$/.exec(path)
    if (overrideMatch && request.method() === 'POST') {
      const body = request.postDataJSON() as { securityId: string; reason: string; evidenceUrl: string }
      overrideVersion += 1
      const priorId = currentOverride?.id as string | undefined
      currentSecurity = body.securityId === existingSecurity.id ? existingSecurity : createdSecurity
      const savedOverride = {
        id: String(9000 + overrideVersion), version: overrideVersion, actorUserId: '42', createdAt: timestamps.created,
        evidenceUrl: body.evidenceUrl, reason: body.reason, supersedesOverrideId: priorId ?? null,
      }
      currentOverride = savedOverride
      row = {
        ...row,
        resolution: { ...row.resolution, status: 'MANUAL_OVERRIDE', securityId: body.securityId, reason: 'ADMIN_OVERRIDE', candidateSecurityIds: [body.securityId] },
        security: currentSecurity,
        candidates: currentSecurity ? [{ id: currentSecurity.id, issuer: currentSecurity.issuer, titleOfClass: currentSecurity.titleOfClass, status: currentSecurity.status, identifiers: currentSecurity.identifiers }] : [],
        override: savedOverride,
        overrideHistory: [savedOverride, ...row.overrideHistory],
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { holdingId: overrideMatch[1], status: 'MANUAL_OVERRIDE', security: currentSecurity, override: savedOverride } }) })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_NOT_FOUND' } }) })
  })

  await gotoWithPreferences(page, '/admin/institutional/mappings')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Institutional mappings' })).toBeVisible()
  await page.getByLabel('Search issuer, CUSIP, FIGI, or accession').fill(accession)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText('Filing mapping coverage: 0.00%')).toBeVisible()
  const queueRow = page.getByTestId('admin-mapping-row').filter({ hasText: 'Synthetic Filing Issuer' })
  await expect(queueRow).toContainText(accession)
  await expect(queueRow.getByRole('link', { name: 'SEC filing' })).toHaveAttribute('href', timestamps.source)
  await page.screenshot({ path: 'docs/design/evidence/admin-institutional-mappings/1440.png', fullPage: true })
  await queueRow.getByRole('button', { name: 'Review mapping' }).click()
  await expect(page.getByTestId('admin-mapping-detail')).toBeVisible()

  await page.getByRole('button', { name: 'Create verified security' }).click()
  const createForm = page.locator('.admin-mapping-create-form')
  await createForm.getByLabel('Issuer or SEC source URL').fill('https://issuer.example.test/investors/synthetic-filing-issuer')
  await createForm.getByLabel('I checked this issuer or SEC source. A ticker is added only from an explicitly entered, verified identifier.').check()
  await createForm.getByRole('button', { name: 'Save security record' }).click()
  await expect(page.getByText('Security created. Review the selected record before saving the mapping.')).toBeVisible()
  await expect(page.getByText('No identity events are recorded.')).toBeVisible()

  await page.getByText('Add identity event').click()
  await page.getByLabel('Effective date').fill('2026-09-01')
  await page.getByLabel('New ticker (verified)').fill('SYN2')
  await page.getByLabel('Event details').fill('Synthetic issuer notice confirms this ticker change.')
  await page.getByLabel('Issuer or SEC source URL').fill('https://issuer.example.test/investors/ticker-notice')
  await page.getByLabel('I checked the issuer or SEC primary source.').check()
  await page.getByRole('button', { name: 'Record event' }).click()
  await expect(page.getByText('SYN2', { exact: true })).toBeVisible()
  await expect(page.getByText('Admin-verified source').first()).toBeVisible()

  const overrideForm = page.locator('.admin-mapping-override-form')
  await overrideForm.getByLabel('Review reason').fill('CUSIP and issuer primary source confirm the holding identity.')
  await overrideForm.getByLabel('Issuer or SEC evidence URL').fill('https://issuer.example.test/investors/security')
  await overrideForm.getByLabel('I checked this primary source and confirm it supports this security mapping.').check()
  await overrideForm.getByRole('button', { name: 'Save manual mapping' }).click()
  await expect(page.locator('.admin-mappings-page > .admin-mapping-success')).toHaveText('Mapping saved with its audit record.')
  await page.getByLabel('Mapping status').selectOption('MANUAL_OVERRIDE')
  const manualRow = page.getByTestId('admin-mapping-row').filter({ hasText: 'Synthetic Filing Issuer' })
  await manualRow.getByRole('button', { name: 'Review mapping' }).click()
  const detail = page.getByTestId('admin-mapping-detail')
  await expect(detail).toContainText('Manual override history')
  await expect(detail).toContainText('CUSIP and issuer primary source confirm the holding identity.')
  const auditHistory = detail.locator('.admin-mapping-override-history')
  await expect(auditHistory).toContainText('Current version · Version 1')
  await expect(auditHistory.locator('li').first()).toContainText('Admin ID')
  await expect(auditHistory.locator('li').first().locator('time')).toHaveAttribute('datetime', timestamps.created)
  await expect(auditHistory.getByRole('link', { name: 'Admin-verified source' })).toHaveAttribute('href', 'https://issuer.example.test/investors/security')

  await detail.getByLabel('Search existing securities').fill('Synthetic Corrected')
  await detail.getByRole('button', { name: 'Search securities' }).click()
  await detail.getByRole('button', { name: /Select security: Synthetic Corrected Inc\./ }).click()
  await expect(detail.getByText('Synthetic Corrected Inc.')).toBeVisible()
  await detail.getByLabel('Review reason').fill('Correction: the original source points to the successor class.')
  await detail.getByLabel('Issuer or SEC evidence URL').fill('https://issuer.example.test/investors/class-correction')
  await detail.getByLabel('I checked this primary source and confirm it supports this security mapping.').check()
  await detail.getByRole('button', { name: 'Save manual mapping' }).click()
  await expect(page.locator('.admin-mappings-page > .admin-mapping-success')).toHaveText('Mapping saved with its audit record.')
  const correctedDetail = page.getByTestId('admin-mapping-detail')
  const correctedHistory = correctedDetail.locator('.admin-mapping-override-history')
  await expect(correctedHistory.locator('li')).toHaveCount(2)
  await expect(correctedHistory).toContainText('Current version · Version 2')
  await expect(correctedHistory).toContainText('Prior version · Version 1')
  await expect(correctedHistory).toContainText('Correction: the original source points to the successor class.')
  await expect(correctedHistory).toContainText('CUSIP and issuer primary source confirm the holding identity.')
  await expect(correctedHistory).toContainText('9001')
  await expect(correctedHistory.getByRole('link', { name: 'Admin-verified source' }).nth(0)).toHaveAttribute('href', 'https://issuer.example.test/investors/class-correction')
  await expect(correctedHistory.getByRole('link', { name: 'Admin-verified source' }).nth(1)).toHaveAttribute('href', 'https://issuer.example.test/investors/security')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const mobileRecord = page.getByTestId('admin-mapping-mobile-row').filter({ hasText: 'Synthetic Filing Issuer' })
  await expect(mobileRecord).toBeVisible()
  await expect(mobileRecord.getByRole('button', { name: 'Collapse' })).toBeVisible()
  await expect(mobileRecord.locator('.admin-mapping-override-history')).toContainText('Prior version · Version 1')
  await expect(mobileRecord).toContainText('Admin-verified source')
  await page.screenshot({ path: 'docs/design/evidence/admin-institutional-mappings/390.png', fullPage: true })
  await mobileRecord.getByRole('button', { name: 'Collapse' }).click()
  await expect(mobileRecord.getByRole('button', { name: 'Review mapping' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
