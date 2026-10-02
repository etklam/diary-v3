import { randomUUID } from 'node:crypto'
import { expect, test, selectLocale } from '../support/e2e'

const password = 'synthetic-command-palette-password'

async function signIn(page: import('@playwright/test').Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectLocale(page, 'en')
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
  await page.goto('/stocks')
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
