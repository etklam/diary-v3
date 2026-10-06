import { randomUUID } from 'node:crypto'
import { expect, test, selectAccountLocale, selectLocale } from '../support/e2e'

const password = 'synthetic-command-palette-password'

async function signIn(page: import('@playwright/test').Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectAccountLocale(page, 'en')
}

/** The diary library's full-text search, reachable from any route. */
test('command palette searches diary text, reaches sidebar-less routes and opens a ticker', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const email = `palette-${randomUUID()}@example.test`
  await signIn(page, email)
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value

  for (const [date, title, content] of [
    ['2026-09-01', 'Waiting on the demand data', 'The margin story depends on a recovery I have not seen confirmed.'],
    ['2026-09-02', 'Trimmed the position', 'Took some risk off while the thesis stays open.'],
  ] as const) {
    expect((await page.request.post('/api/diaries', {
      headers: { 'x-csrf-token': csrf }, data: { date, title, content },
    })).status()).toBe(201)
  }

  // Opened from a route that is not the diary library: that is the point.
  const authenticatedSession = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/auth/me' && response.status() === 200,
  )
  await page.goto('/stocks')
  await authenticatedSession
  await expect(page.getByTestId('sign-out')).toBeAttached()
  await expect(page.getByTestId('command-palette-trigger')).toBeVisible()
  await expect(page.locator('dialog.palette-dialog')).toBeAttached()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Search', exact: true })
  await expect(palette).toBeVisible()
  const field = palette.getByRole('combobox')
  await expect(field).toBeFocused()

  // With no query it offers recent diaries rather than searching on one letter.
  await expect(palette.getByRole('option').first()).toContainText('Trimmed the position')

  // Full-text match on body content, with the server-built snippet marking the hit.
  await field.fill('margin story')
  const match = palette.getByRole('option').filter({ hasText: 'Waiting on the demand data' })
  await expect(match).toBeVisible()
  await expect(match.locator('mark')).toHaveText('margin story')

  // Enter opens the keyboard-active option.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Waiting on the demand data', exact: true })).toBeVisible()
  await expect(palette).toBeHidden()

  // A route with no sidebar slot is reachable by name.
  await page.keyboard.press('ControlOrMeta+k')
  await palette.getByRole('combobox').fill('strategy performance')
  await palette.getByRole('option').filter({ hasText: 'Strategy performance' }).click()
  await expect(page).toHaveURL(/\/strategy-performance$/)

  // A bare ticker opens the company page directly.
  await page.keyboard.press('ControlOrMeta+k')
  await palette.getByRole('combobox').fill('nvda')
  await expect(palette.getByRole('option').first()).toContainText('NVDA')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/stocks\/NVDA$/)

  // Escape restores focus to whatever opened it, and the trigger is discoverable.
  const trigger = page.getByTestId('command-palette-trigger')
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(palette).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
  await expect(trigger).toBeFocused()

  // The palette belongs to the signed-in shell only.
  await page.request.post('/api/auth/logout', { headers: { 'x-csrf-token': csrf } })
  await page.goto('/tools')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Search', exact: true })).toHaveCount(0)
})

/** The badge counts work waiting now — overdue plus due today, never a backlog. */
test('review badge counts overdue and due-today reviews in both shells', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const email = `badge-${randomUUID()}@example.test`
  await signIn(page, email)
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value

  const bar = page.getByTestId('mobile-diary-navigation')
  const reviews = bar.locator('a[href="/reviews"]')
  // Nothing is scheduled yet, so the slot carries no count.
  await expect(reviews).toBeVisible()
  await expect(reviews.locator('.mobile-diary-badge')).toHaveCount(0)

  const overdue = await (await page.request.post('/api/diaries', {
    headers: { 'x-csrf-token': csrf },
    data: { date: '2026-09-01', title: 'Needs a second look', content: 'Open question.' },
  })).json()
  expect((await page.request.patch(`/api/diaries/${overdue.id}/review-schedule`, {
    headers: { 'x-csrf-token': csrf },
    data: { reviewDueAt: '2020-01-02T00:00:00Z', expectedRevision: overdue.revision },
  })).status()).toBe(200)

  // An upcoming review is deliberately excluded: the badge is work waiting.
  const upcoming = await (await page.request.post('/api/diaries', {
    headers: { 'x-csrf-token': csrf },
    data: { date: '2026-09-02', title: 'Review much later', content: 'Not yet due.' },
  })).json()
  expect((await page.request.patch(`/api/diaries/${upcoming.id}/review-schedule`, {
    headers: { 'x-csrf-token': csrf },
    data: { reviewDueAt: '2099-01-01T00:00:00Z', expectedRevision: upcoming.revision },
  })).status()).toBe(200)

  await page.reload()
  await expect(reviews.locator('.mobile-diary-badge')).toHaveText('1')
  await expect(reviews).toHaveAccessibleName(/1 waiting for review/)

  // The same count reaches the desktop sidebar.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const sidebarReviews = page.locator('.desktop-nav a[href="/reviews"]')
  await expect(sidebarReviews.locator('.nav-badge')).toHaveText('1')
  await expect(sidebarReviews).toHaveAccessibleName(/1 waiting for review/)
})

test('command palette resolves Guru and company names to institutional research', async ({ page }) => {
  test.setTimeout(60_000)
  const investorProfile = {
    name: 'Warren Buffett', managerName: 'Berkshire Hathaway', slug: 'warren-buffett', description: null,
    investmentPhilosophy: null, styleTags: ['Value'], managerType: 'Public Company', website: null, country: 'US', imageUrl: null, featured: true,
  }
  const latest = {
    periodEnd: '2026-06-30', filedAt: '2026-08-14T12:00:00.000Z', status: 'READY', reportedValueUsd: '1000000000',
    holdingCount: 25, topFiveConcentrationPercent: '45', topTenConcentrationPercent: '70', hhi: '1250', turnoverPercent: '12',
    turnoverBand: 'LOW', actionCounts: { new: 1, add: 2, reduce: 1, exit: 0 }, largestPosition: null, topHoldings: [], sectorAllocation: [],
  }
  const stock = {
    securityId: '9001', ticker: 'SYN', company: 'Synthetic Systems', sector: 'Technology', industry: 'Software',
    currentHolderCount: 4, comparableCurrentHolderCount: 3, previousHolderCount: 3, holderCountChange: 1,
    newBuyerCount: 1, addCount: 2, unchangedCount: 1, reduceCount: 0, exitCount: 0, netBuyerCount: 3,
    actionManagerCount: 4, quantityChangeSampleCount: 3, averageQuantityChangePercent: '12.5', medianQuantityChangePercent: '5',
    aggregateWeightPercent: '48', averagePortfolioWeightPercent: '12', weightBreadthPercent: '100', classification: 'ACCUMULATION', quarterTrend: 'RISING',
  }
  await page.route(/\/api\/gurus(?:\?.*)?$/, async route => {
    const search = new URL(route.request().url()).searchParams.get('search')?.toLowerCase() ?? ''
    const data = `${investorProfile.name} ${investorProfile.managerName}`.toLowerCase().includes(search)
      ? [{ profile: investorProfile, cik: '0001067983', directoryOrder: 1, followerCount: 0, followedByMe: false, latest }]
      : []
    await route.fulfill({ json: { data, pagination: { page: 1, limit: 6, total: data.length, totalPages: data.length ? 1 : 0 }, facets: { styles: ['Value'], managerTypes: ['Public Company'], sectors: ['Technology'] } } })
  })
  await page.route(/\/api\/gurus\/stocks(?:\?.*)?$/, async route => {
    const search = new URL(route.request().url()).searchParams.get('search')?.toLowerCase() ?? ''
    const items = stock.company.toLowerCase().includes(search) || stock.ticker.toLowerCase().includes(search) ? [stock] : []
    await route.fulfill({ json: { data: {
      period: {
        periodEnd: '2026-06-30', activeManagerCount: 5, readyManagerCount: 4, partialManagerCount: 1, errorManagerCount: 0,
        supersededManagerCount: 0, pendingManagerCount: 0, noFilingManagerCount: 0, comparableManagerCount: 3,
        previousReadyManagerCount: 3, sourceRowCount: 12, mappedRowCount: 12, mappingCoveragePercent: '100', quarterCoveragePercent: '80', source: 'SEC Form 13F',
      }, periods: [], ranking: 'most-held', items, pagination: { page: 1, limit: 6, total: items.length, totalPages: items.length ? 1 : 0 },
    } } })
  })
  await page.route('**/api/stocks/SYN/gurus*', async route => route.fulfill({ json: { data: {
    summary: {
      symbol: 'SYN', mappingStatus: 'MATCHED', securityId: '9001', company: 'Synthetic Systems', sector: 'Technology', industry: 'Software',
      periodEnd: '2026-06-30', dataStatus: 'READY', calculatedAt: '2026-07-02T12:00:00.000Z', contextHash: 'a'.repeat(64),
      activeGuruCount: 5, readyGuruCount: 4, quarterCoveragePercent: '80', mappingCoveragePercent: '100', currentHolderCount: 4,
      averagePortfolioWeightPercent: '12', weightBreadthPercent: '100', newBuyerCount: 1, addCount: 2, reduceCount: 0, exitCount: 0,
      netBuyerCount: 3, classification: 'ACCUMULATION', source: 'SEC Form 13F',
    }, currentHolders: [], latestMoves: [], history: [],
  } } }))

  const email = `palette-guru-${randomUUID()}@example.test`
  await signIn(page, email)
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Search', exact: true })
  const field = palette.getByRole('combobox')
  await field.fill('Warren Buffett')
  const namedGuru = palette.getByRole('option').filter({ hasText: 'Warren Buffett' })
  await expect(namedGuru).toBeVisible()
  await palette.getByRole('button', { name: 'Close' }).click()
  await expect(palette).toBeHidden()

  await page.getByTestId('command-palette-trigger').click()
  await field.fill('Berkshire')
  const guru = palette.getByRole('option').filter({ hasText: 'Warren Buffett' })
  await expect(guru).toBeVisible()
  await guru.click()
  await expect(page).toHaveURL(/\/gurus\/warren-buffett$/)

  await page.goto('/timeline')
  await page.getByTestId('command-palette-trigger').click()
  await palette.getByRole('combobox').fill('Synthetic Systems')
  const company = palette.getByRole('option').filter({ hasText: 'Synthetic Systems' })
  await expect(company).toBeVisible()
  await company.click()
  await expect(page).toHaveURL(/\/stocks\/SYN\/gurus$/)
  await expect(page.getByRole('heading', { name: 'SYN · Guru ownership' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('13F holdings are delayed')
})
