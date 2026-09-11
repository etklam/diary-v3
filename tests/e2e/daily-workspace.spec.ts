import { randomUUID } from 'node:crypto'
import type { BrowserContext, Page } from '@playwright/test'
import { expect, selectLocale, selectTheme, test } from '../support/e2e'

type CsrfHeaders = { 'x-csrf-token': string }

async function registerAndSignIn(page: Page, context: BrowserContext, prefix: string) {
  const email = `${prefix}-${randomUUID()}@example.test`
  const password = `synthetic-${prefix}-password`
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await selectLocale(page, 'en')
  const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')?.value
  expect(csrf).toBeTruthy()
  return { headers: { 'x-csrf-token': csrf! } satisfies CsrfHeaders }
}

async function createDiary(page: Page, headers: CsrfHeaders, data: Record<string, unknown>) {
  const result = await page.request.post('/api/diaries', { headers, data })
  expect(result.status()).toBe(201)
  return result.json() as Promise<{ id: string }>
}

test('new users can capture, save, refind and review a first workspace record', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { headers } = await registerAndSignIn(page, context, 'daily-workspace-first-use')
  const firstUse = page.getByTestId('overview-first-use')
  await expect(firstUse).toBeVisible()
  await expect(firstUse.getByRole('link', { name: 'Start recording', exact: true })).toHaveAttribute('href', '/diaries/quick')
  await expect(firstUse.getByRole('link', { name: 'Explore tools', exact: true })).toHaveAttribute('href', '/tools')
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await selectTheme(page, 'light')
  await page.screenshot({ path: 'docs/design/evidence/daily-workspace/first-use-1440.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await selectTheme(page, 'dark')
  await expect(page.getByTestId('overview-first-use')).toBeVisible()
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await page.screenshot({ path: 'docs/design/evidence/daily-workspace/first-use-390.png', fullPage: true })

  await page.getByRole('link', { name: 'Start recording', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Quick diary', exact: true })).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill('A first judgment to revisit')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Synthetic evidence is still incomplete; revisit the decision after the next report.')
  await page.getByRole('button', { name: 'Create diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  await expect(page.getByRole('heading', { name: 'A first judgment to revisit', exact: true })).toBeVisible()

  await page.goto('/')
  await expect(page.getByTestId('overview-first-use')).toHaveCount(0)
  await expect(page.getByTestId('overview-recent-item')).toContainText('A first judgment to revisit')
  await expect(page.getByTestId('overview-single-record-prompt')).toContainText('Keep this record easy to revisit.')
  await page.getByTestId('overview-recent-item').getByRole('link', { name: 'A first judgment to revisit', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  await page.goto('/')

  await page.setViewportSize({ width: 1440, height: 900 })
  await selectTheme(page, 'light')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const diary = await page.request.get('/api/diaries/summary?page=1&limit=3&sortBy=date-desc')
  expect(diary.ok()).toBe(true)
  expect((await diary.json()).data[0].title).toBe('A first judgment to revisit')
  expect(headers['x-csrf-token']).toBeTruthy()
})

test('many reminders stay bounded and do not duplicate review obligations', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { headers } = await registerAndSignIn(page, context, 'daily-workspace-reminders')
  for (let index = 1; index <= 7; index += 1) {
    await createDiary(page, headers, {
      date: `2026-01-${String(index).padStart(2, '0')}`,
      title: `Reminder ${index}`,
      content: 'Synthetic reminder content.',
      reviewDueAt: '2020-01-01T00:00:00Z',
    })
  }
  await page.goto('/')
  const rows = page.getByTestId('overview-attention-item')
  await expect(rows).toHaveCount(5)
  expect(new Set(await rows.allTextContents()).size).toBe(5)
  await expect(page.getByTestId('overview-first-use')).toHaveCount(0)
})

test('failed workspace resources remain scoped until each retry succeeds', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerAndSignIn(page, context, 'daily-workspace-retry')
  await page.route('**/api/portfolio/attention', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'daily-attention-retry' } }),
  }))
  let releasePlans!: () => void
  let markPlansSeen!: () => void
  const plansHeld = new Promise<void>(resolve => { releasePlans = resolve })
  const plansSeen = new Promise<void>(resolve => { markPlansSeen = resolve })
  await page.route('**/api/trade-plans*', async route => {
    markPlansSeen()
    await plansHeld
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'daily-plans-retry' } }),
    })
  })
  await page.goto('/')
  await plansSeen
  await expect(page.getByRole('navigation', { name: 'Continue elsewhere', exact: true })).toContainText('Loading…')
  await expect(page.getByTestId('overview-first-use')).toHaveCount(0)
  await expect(page.getByTestId('overview-no-current-actions')).toHaveCount(0)
  releasePlans()
  await expect(page.locator('#overview-attention-error')).toContainText('daily-attention-retry')
  await expect(page.locator('#overview-plans-error')).toContainText('daily-plans-retry')

  await page.unroute('**/api/portfolio/attention')
  await page.locator('#overview-attention-error').getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByTestId('overview-no-current-actions')).toBeVisible()
  await expect(page.getByTestId('overview-first-use')).toHaveCount(0)

  await page.unroute('**/api/trade-plans*')
  await page.locator('#overview-plans-error').getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByTestId('overview-first-use')).toBeVisible()
})

test('completing an overview review removes the row and preserves the back path', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { headers } = await registerAndSignIn(page, context, 'daily-workspace-review')
  const diary = await createDiary(page, headers, {
    date: '2026-02-01',
    title: 'Review this decision',
    content: 'Synthetic original reasoning.',
    thesis: 'Demand should recover.',
    risk: 'The evidence may change.',
    reviewDueAt: '2020-01-01T00:00:00Z',
  })
  await page.goto('/')
  const row = page.getByTestId('overview-attention-item').filter({ hasText: 'Review this decision' })
  await expect(row).toBeVisible()
  await row.getByRole('link', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/diaries/${diary.id}/review$`))
  await page.getByRole('radio', { name: 'Partly confirmed', exact: true }).check()
  await page.getByRole('textbox', { name: 'What happened', exact: true }).fill('Synthetic later evidence.')
  await page.getByRole('button', { name: 'Complete review', exact: true }).click()
  await expect(page.getByTestId('review-status')).toHaveText('Reviewed')
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('overview-attention-item').filter({ hasText: 'Review this decision' })).toHaveCount(0)
  await expect(page.getByTestId('overview-no-current-actions')).toBeVisible()
  await expect(page.getByTestId('overview-recent-item')).toContainText('Review this decision')
  await expect(page.getByTestId('overview-recent-item')).toContainText('Reviewed')
  await expect(page.getByTestId('overview-recent-item')).toContainText('Partially confirmed')
})
