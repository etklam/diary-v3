import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { expect, selectLocale, test } from '../support/e2e'

const accountPassword = 'synthetic-guru-workflow-password'

function event(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    eventType: 'STRONG_ADD',
    guru: { slug: 'synthetic-guru', name: 'Synthetic Guru' },
    symbol: 'MSFT', company: 'Microsoft', periodEnd: '2026-06-30',
    detail: {
      action: 'STRONG_ADD', quantityChangePercent: '71.42857143', weightPercent: '5.25000000',
      holderCount: null, previousHolderCount: null, classification: null, previousClassification: null,
      accession: null, sourceUrl: null,
    },
    createdAt: '2026-08-15T12:00:00.000Z', readAt: null,
    ...overrides,
  }
}

for (const width of [1440, 390]) {
  test(`Guru alerts, stock watch and decision snapshot at ${width}px`, async ({ page, context }) => {
    await mkdir('docs/design/evidence/guru-follow-notify', { recursive: true })
    await page.setViewportSize({ width, height: 900 })
    const email = `guru-workflow-${randomUUID()}@example.test`
    expect((await page.request.post('/api/auth/register', { data: { email, password: accountPassword } })).status()).toBe(200)
    await page.goto('/login?returnTo=%2Fgurus%2Fnotifications')
    await selectLocale(page, 'en')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(accountPassword)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/gurus\/notifications$/)
    await selectLocale(page, 'en')

    let preferences = {
      newFiling: true, newPosition: true, exitedPosition: true, strongAdd: true, strongReduce: false,
      newStockHolder: true, consensusChange: true, minWeightPercent: null as string | null, minQuantityChangePercent: null as string | null,
    }
    let savedPreferences: typeof preferences | null = null
    await page.route('**/api/gurus/notifications/preferences', route => {
      if (route.request().method() === 'PUT') preferences = route.request().postDataJSON() as typeof preferences
      if (route.request().method() === 'PUT') savedPreferences = preferences
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { preferences, followedGurus: [], watchedStocks: [] } }) })
    })
    await page.route('**/api/gurus/notifications?*', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: [event('501'), event('502', {
        eventType: 'CONSENSUS_CHANGE', guru: null,
        detail: { action: null, quantityChangePercent: null, weightPercent: '0.00000000', holderCount: 4, previousHolderCount: 3, classification: 'ACCUMULATION', previousClassification: 'NEUTRAL', accession: null, sourceUrl: null },
      })], unreadCount: 2 }),
    }))
    await page.route('**/api/gurus/notifications/read', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: { updated: 2, unreadCount: 0 } }),
    }))

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Guru alerts' })).toBeVisible()
    await expect(page.getByText('71.43%')).toBeVisible()
    await expect(page.getByText('5.25%')).toBeVisible()
    await expect(page.locator('.guru-notifications-detail').nth(1)).toContainText('0.00%')
    const recentEvents = page.getByRole('link', { name: 'Recent events', exact: true })
    await expect(recentEvents).toHaveAttribute('href', '#guru-notifications-inbox')
    await recentEvents.click()
    await expect(page).toHaveURL(/#guru-notifications-inbox$/)
    await page.getByLabel('New position', { exact: true }).uncheck()
    await page.getByLabel('Minimum portfolio weight (%)', { exact: true }).fill('5')
    await page.getByLabel('Minimum reported quantity change (%)', { exact: true }).fill('10')
    await page.getByRole('button', { name: 'Save alert settings' }).click()
    await expect(page.getByRole('status')).toContainText('Alert settings saved.')
    expect(savedPreferences).toMatchObject({ newPosition: false, minWeightPercent: '5', minQuantityChangePercent: '10' })
    await page.screenshot({ path: `docs/design/evidence/guru-follow-notify/alerts-${width}.png`, fullPage: true })

    const stockResponse = { data: { summary: {
      symbol: 'MSFT', mappingStatus: 'MATCHED', securityId: '2', company: 'Microsoft', sector: 'Technology', industry: 'Software',
      periodEnd: '2026-06-30', dataStatus: 'READY', calculatedAt: '2026-08-15T12:00:00.000Z', contextHash: 'a'.repeat(64),
      activeGuruCount: 4, readyGuruCount: 4, quarterCoveragePercent: '100', mappingCoveragePercent: '100', currentHolderCount: 1,
      averagePortfolioWeightPercent: '5.25', weightBreadthPercent: '5.25', newBuyerCount: 1, addCount: 0, reduceCount: 0,
      exitCount: 0, netBuyerCount: 1, classification: 'ACCUMULATION', source: 'SEC Form 13F',
    }, currentHolders: [], latestMoves: [], history: [{
      periodEnd: '2026-06-30', status: 'READY', activeGuruCount: 4, readyGuruCount: 4, quarterCoveragePercent: '100',
      mappingCoveragePercent: '100', holderCount: 1, weightBreadthPercent: '5.25', averagePortfolioWeightPercent: '5.25',
      netBuyerCount: 1, classification: 'ACCUMULATION',
    }] } }
    let watching = false
    const watchCalls: string[] = []
    await page.route('**/api/stocks/MSFT/gurus*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stockResponse) }))
    await page.route('**/api/stocks/MSFT/guru-watch', route => {
      const method = route.request().method()
      watchCalls.push(method)
      if (method === 'PUT') watching = true
      if (method === 'DELETE') watching = false
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { watching, symbol: 'MSFT', securityId: '2' } }) })
    })
    await page.goto('/stocks/MSFT/gurus')
    await expect(page.getByRole('button', { name: 'Watch Guru activity' })).toBeVisible()
    await page.getByRole('button', { name: 'Watch Guru activity' }).click()
    await expect(page.getByRole('button', { name: 'Watching' })).toBeVisible()
    await page.screenshot({ path: `docs/design/evidence/guru-follow-notify/stock-watch-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Watching' }).click()
    await expect(page.getByRole('button', { name: 'Watch Guru activity' })).toBeVisible()
    expect(watchCalls).toEqual(['GET', 'PUT', 'DELETE'])

    const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')?.value
    expect(csrf).toBeTruthy()
    const created = await page.request.post('/api/diaries', {
      headers: { 'x-csrf-token': csrf! },
      data: { date: width === 1440 ? '2025-01-01' : '2025-01-02', title: `Guru snapshot decision ${width}`, content: 'Synthetic decision-time context.', stockSymbols: ['MSFT'] },
    })
    expect(created.status()).toBe(201)
    const diary = await created.json() as { id: string }
    let attached: Record<string, unknown> | null = null
    const snapshot = {
      id: '801', diaryId: diary.id, symbol: 'MSFT', periodEnd: '2026-06-30', holderCount: 2,
      contextVersion: 'guru-decision-context-v1', consensusVersion: 'guru-consensus-v1', capturedAt: '2026-08-15T12:00:00.000Z',
      context: {
        contextVersion: 'guru-decision-context-v1', source: 'prepared-institutional-analytics', symbol: 'MSFT', company: 'Microsoft', periodEnd: '2026-06-30',
        consensus: { holderCount: 2, previousHolderCount: 1, newBuyerCount: 1, addCount: 1, reduceCount: 0, exitCount: 0, netBuyerCount: 2, averagePortfolioWeightPercent: '4.75000000', aggregateWeightPercent: '9.50000000', classification: 'ACCUMULATION', quarterTrend: 'RISING', eligibleManagerCount: 4, readyManagerCount: 4 },
        holders: [], sectors: [],
      },
    }
    await page.route(`**/api/diaries/${diary.id}/guru-snapshots`, route => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ symbol: 'MSFT' })
        attached = snapshot
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: snapshot, reused: false }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: attached ? [snapshot] : [] }) })
    })
    await page.goto(`/diaries/${diary.id}`)
    await expect(page.getByRole('heading', { name: 'Guru context at decision time' })).toBeVisible()
    await page.getByRole('button', { name: 'Attach Guru snapshot' }).click()
    const snapshotList = page.locator('.diary-guru-snapshot-list')
    await expect(snapshotList).toContainText('2026-06-30')
    await expect(snapshotList).toContainText('4.75%')
    await page.screenshot({ path: `docs/design/evidence/guru-follow-notify/diary-snapshot-${width}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
