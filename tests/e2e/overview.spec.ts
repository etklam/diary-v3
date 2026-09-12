import { randomUUID } from 'node:crypto'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect, selectLocale, selectTheme, signOut } from '../support/e2e'

async function signInAndSeed(page: Page, context: BrowserContext) {
  const email = `overview-${randomUUID()}@example.test`
  const password = 'synthetic-overview-password'
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectLocale(page, 'en')

  const csrf = (await context.cookies()).find((cookie: { name: string; value: string }) => cookie.name === 'csrf-token')?.value
  expect(csrf).toBeTruthy()
  const headers = { 'x-csrf-token': csrf! }
  const diaryResult = await page.request.post('/api/diaries', { headers, data: {
    date: '2026-09-05', title: 'Overview synthetic decision', content: 'The original demand thesis still needs confirmation.',
    thesis: 'Demand should recover after the next report.', risk: 'The evidence may invalidate the thesis.', reviewDueAt: '2020-01-01T00:00:00Z',
    transactions: [
      { symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-05T00:00:00Z' },
      { symbol: 'UNKNOWN', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-05T00:00:00Z' },
    ],
  } })
  expect(diaryResult.status()).toBe(201)
  const diary = await diaryResult.json()
  expect((await page.request.put('/api/stocks/AAPL/thesis', { headers, data: {
    status: 'ACTIVE', summary: 'A durable demand thesis.', whyIOwnIt: 'Demand remains the key variable.', reviewDueAt: '2020-01-01T00:00:00Z',
  } })).status()).toBe(200)
  expect((await page.request.post('/api/trade-plans', { headers, data: {
    diaryId: diary.id, symbol: 'AAPL', setupType: 'Evidence follow-up', status: 'active', notes: 'Recheck after the next report.',
  } })).status()).toBe(200)
  expect((await page.request.post('/api/stocks/watchlist', { headers, data: { symbol: 'AAPL' } })).status()).toBe(200)
  expect((await page.request.post('/api/stocks/AAPL/evidence', { headers, data: {
    summary: 'Synthetic latest research record.', sourceType: 'ARTICLE', sourceTitle: 'Synthetic report', sourceUrl: 'https://example.test/report', occurredAt: '2026-09-05T10:30:00Z',
  } })).status()).toBe(200)
  return { diary }
}

for (const width of [1440, 390]) test(`Overview composes bounded decision projections at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 })
  const { diary } = await signInAndSeed(page, context)
  await page.goto('/')
  const overview = page.locator('.overview-page')
  await expect(page.getByRole('heading', { name: "Today's workspace", exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Needs your attention', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent decisions', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Portfolio context', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tracked companies', exact: true })).toBeVisible()
  await expect(page.getByTestId('overview-recent-item')).toContainText('Overview synthetic decision')
  await expect(page.getByTestId('overview-watch-item')).toContainText('Synthetic latest research record.')
  await expect(page.getByTestId('overview-quote-coverage')).toHaveText('50%')
  await expect(page.getByTestId('overview-unpriced-cost')).toHaveText('200')
  await expect(page.getByText('Some quotes are missing; concentration uses priced positions while reminders still include active holdings.')).toBeVisible()
  await expect(overview.getByRole('link', { name: 'Review queue', exact: true })).toHaveAttribute('href', '/reviews')
  await expect(overview.getByRole('link', { name: 'Trade plans', exact: true })).toHaveAttribute('href', '/trade-plans')
  await expect(overview.getByRole('link', { name: 'Research', exact: true })).toHaveAttribute('href', '/stocks/watchlist')
  await expect(overview.getByRole('link', { name: 'Tools', exact: true })).toHaveAttribute('href', '/tools')
  expect(await page.getByTestId('overview-attention-item').count()).toBeLessThanOrEqual(5)

  const attention = page.getByRole('region', { name: 'Needs your attention', exact: true })
  await attention.getByTestId('overview-attention-item').first().getByRole('link', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/stocks/AAPL/thesis$|/diaries/${diary.id}/review$`))
  await page.goBack()
  await expect(page.getByRole('heading', { name: "Today's workspace", exact: true })).toBeVisible()

  await selectTheme(page, width === 390 ? 'dark' : 'light')
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await page.screenshot({ path: width === 1440 ? 'docs/design/evidence/daily-workspace/overview-1440-light.png' : 'docs/design/evidence/daily-workspace/overview-390-dark.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const [locale, title] of [['zh-TW', '今日工作區'], ['zh-CN', '今日工作区'], ['en', "Today's workspace"]] as const) {
    await selectLocale(page, locale)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
  await signOut(page)
  await expect(page.getByRole('heading', { name: "Today's workspace", exact: true })).toHaveCount(0)
})

test('Overview keeps other sections readable when attention needs retry', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAndSeed(page, context)
  await page.route('**/api/portfolio/attention', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'overview-attention-retry' } }) }))
  await page.goto('/')
  const attention = page.getByRole('region', { name: 'Needs your attention', exact: true })
  await expect(attention.getByTestId('request-id')).toHaveText('overview-attention-retry')
  await expect(page.getByTestId('overview-recent-item')).toContainText('Overview synthetic decision')
  await expect(page.locator('.overview-page').getByRole('link', { name: 'Trade plans', exact: true })).toHaveAttribute('href', '/trade-plans')
  await page.unroute('**/api/portfolio/attention')
  await attention.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(attention.getByTestId('overview-attention-item').first()).toBeVisible()

  let authMeCalls = 0
  await page.route('**/api/auth/me', async route => {
    if (authMeCalls++ === 0) return route.continue()
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'overview-timezone-retry' } }) })
  })
  await page.reload()
  await expect(page.getByText('Account timezone could not load.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await page.unroute('**/api/auth/me')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.locator('.overview-date')).not.toHaveText('Account timezone could not load.')
})

test('Overview empty state keeps first-diary and research paths available', async ({ page }) => {
  await page.goto('/login')
  await selectLocale(page, 'en')
  const email = `overview-empty-${randomUUID()}@example.test`, password = 'synthetic-overview-empty-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectLocale(page, 'en')
  await page.goto('/')
  await expect(page.getByTestId('overview-first-use')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Record a judgment you may want to revisit.', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start recording', exact: true })).toHaveAttribute('href', '/diaries/quick')
  await expect(page.getByRole('link', { name: 'Explore tools', exact: true })).toHaveAttribute('href', '/tools')
  await expect(page.getByTestId('overview-no-current-actions')).toHaveCount(0)
})
