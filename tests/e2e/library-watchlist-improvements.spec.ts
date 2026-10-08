import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect, selectLocale } from '../support/e2e'

async function signIn(page: Page, path: string, prefix: string) {
  const email = `${prefix}-${randomUUID()}@example.test`
  const password = 'synthetic-library-watchlist-password'
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto(`/login?returnTo=${encodeURIComponent(path)}`)
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`))
  await selectLocale(page, 'en')
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value
  if (!csrf) throw new Error('Missing CSRF cookie after sign-in')
  return { csrf }
}

test('diary library saved views and snippets retain confirmed results during stale auth', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { csrf } = await signIn(page, '/diaries', 'library-improvement')
  for (const [title, date] of [['Decision with evidence', '2026-09-01'], ['Unrelated observation', '2026-09-02']] as const) {
    const response = await page.request.post('/api/diaries', {
      headers: { 'x-csrf-token': csrf },
      data: { title, content: title === 'Decision with evidence' ? 'The demand needle <img src=x onerror="window.snippetExecuted=true"> **投資 😀** needle remains visible in the evidence.' : 'Synthetic unrelated content.', date },
    })
    expect(response.status()).toBe(201)
  }

  await page.goto('/diaries')
  await expect(page.locator('.diary-records > li')).toHaveCount(2)
  const search = page.getByRole('searchbox', { name: 'Search title or content', exact: true })
  await search.fill('needle')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(page.locator('.diary-records > li')).toHaveCount(1)
  await expect(page.locator('.diary-search-snippet')).toContainText('Content match')
  await expect(page.locator('.diary-search-snippet mark')).toHaveText('needle')
  await expect(page.locator('.diary-search-snippet')).toContainText('<img src=x')
  await expect(page.locator('.diary-search-snippet img')).toHaveCount(0)

  await page.getByRole('button', { name: 'Save current filters', exact: true }).click()
  await page.getByRole('textbox', { name: 'View name', exact: true }).fill('Needle evidence')
  await page.getByRole('button', { name: 'Save view', exact: true }).click()
  await expect(page.locator('.diary-library-view-notice')).toHaveText('Saved view created.')
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(search).toHaveValue('')

  const savedView = page.getByRole('combobox', { name: 'Choose a saved view', exact: true })
  await savedView.selectOption('')
  await savedView.selectOption({ label: 'Needle evidence' })
  await expect(search).toHaveValue('needle')
  await expect(page.locator('.diary-records > li')).toHaveCount(1)
  await page.locator('.diary-filter-chip button').first().click()
  await expect(search).toHaveValue('')

  await search.fill('needle')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(page.locator('.diary-records > li')).toHaveCount(1)
  await page.route('**/api/diaries/summary*', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ data: { code: 'AUTH_UNAUTHORIZED', requestId: 'library-stale-auth' } }),
  }))
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('AUTH_UNAUTHORIZED')
  await expect(page.locator('.diary-records > li')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await page.unroute('**/api/diaries/summary*')
})

test('watchlist filter, reorder and undo update rows without a list reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const { csrf } = await signIn(page, '/stocks/watchlist', 'watchlist-improvement')
  for (const symbol of ['AAPL', 'MSFT', 'NVDA']) {
    const response = await page.request.post('/api/stocks/watchlist', { headers: { 'x-csrf-token': csrf }, data: { symbol } })
    expect(response.status()).toBe(200)
  }
  const evidence = await page.request.post('/api/stocks/AAPL/evidence', {
    headers: { 'x-csrf-token': csrf },
    data: { summary: 'Synthetic research record.', sourceType: 'ARTICLE', occurredAt: '2026-09-05T10:30:00Z', sourceTitle: 'Synthetic watchlist evidence' },
  })
  expect(evidence.status()).toBe(200)

  await page.goto('/stocks/watchlist')
  await expect(page.locator('.plan-list > li')).toHaveCount(3)
  await page.getByRole('combobox', { name: 'Research filter', exact: true }).selectOption('researched')
  await expect(page.locator('.plan-list > li')).toHaveCount(1)
  await expect(page.getByTestId('watch-AAPL')).toBeVisible()
  await page.getByRole('combobox', { name: 'Research filter', exact: true }).selectOption('all')

  const watchlistGets: string[] = []
  page.on('request', request => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/stocks/watchlist') watchlistGets.push(request.url())
  })
  const beforeMove = watchlistGets.length
  await page.getByRole('button', { name: 'Arrange order', exact: true }).click()
  await page.getByTestId('watch-MSFT').getByRole('button', { name: 'Move up · MSFT', exact: true }).click()
  await expect(page.locator('.plan-list > li').first()).toHaveAttribute('data-testid', 'watch-MSFT')
  expect(watchlistGets.length).toBe(beforeMove)
  await page.getByRole('button', { name: 'Done arranging', exact: true }).click()

  const aapl = page.getByTestId('watch-AAPL')
  await aapl.getByRole('button', { name: 'Remove · AAPL', exact: true }).click()
  await expect(aapl).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo remove', exact: true })).toBeVisible()
  const beforeUndo = watchlistGets.length
  await page.getByRole('button', { name: 'Undo remove', exact: true }).click()
  await expect(page.getByTestId('watch-AAPL')).toBeVisible()
  expect(watchlistGets.length).toBe(beforeUndo)

  let releaseRefresh!: () => void
  let refreshReadStarted!: () => void
  const refreshReadStartedPromise = new Promise<void>(resolve => { refreshReadStarted = resolve })
  const refreshReleasePromise = new Promise<void>(resolve => { releaseRefresh = resolve })
  await page.route('**/api/stocks/watchlist', async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const staleResponse = await route.fetch()
    refreshReadStarted()
    await refreshReleasePromise
    await route.fulfill({ response: staleResponse })
  })
  await page.getByRole('button', { name: 'Refresh watchlist', exact: true }).click()
  await refreshReadStartedPromise
  const staleRefreshAapl = page.getByTestId('watch-AAPL')
  await staleRefreshAapl.getByRole('button', { name: 'Remove · AAPL', exact: true }).click()
  await expect(staleRefreshAapl).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo remove', exact: true })).toBeVisible()
  releaseRefresh()
  await expect(page.getByRole('button', { name: 'Refresh watchlist', exact: true })).toBeEnabled()
  await expect(staleRefreshAapl).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo remove', exact: true })).toBeVisible()
  await page.unroute('**/api/stocks/watchlist')
  await page.getByRole('button', { name: 'Undo remove', exact: true }).click()
  await expect(page.getByTestId('watch-AAPL')).toBeVisible()

  await page.route('**/api/stocks/watchlist', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ data: { code: 'AUTH_UNAUTHORIZED', requestId: 'watchlist-stale-auth' } }),
  }))
  await page.getByRole('button', { name: 'Refresh watchlist', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('AUTH_UNAUTHORIZED')
  await expect(page.getByTestId('watch-AAPL')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await page.unroute('**/api/stocks/watchlist')
})
