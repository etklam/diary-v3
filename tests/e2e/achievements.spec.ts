import { randomUUID } from 'node:crypto'
import { test, expect, selectLocale, selectTheme } from '../support/e2e'

for (const width of [1440, 390]) test(`personal achievements CRUD and responsive layout at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const email = `achievements-${randomUUID()}@example.test`
  const password = 'synthetic-achievement-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/login?returnTo=%2Fachievements')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/achievements$/)
  await selectLocale(page, 'en')

  await expect(page.getByRole('heading', { name: 'Achievements and goals', exact: true })).toBeVisible()
  await expect(page.getByText('No achievements recorded yet.', { exact: true })).toBeVisible()
  if (width === 390) await selectTheme(page, 'dark')
  await page.getByRole('button', { name: 'Add achievement', exact: true }).click()
  await page.getByLabel('Date', { exact: true }).fill('2026-09-22')
  await page.getByTestId('achievement-input').fill('First reached USD 100,000 in the account')
  await page.getByRole('button', { name: 'Save achievement', exact: true }).click()
  await expect(page.getByTestId('achievement')).toContainText('First reached USD 100,000 in the account')
  await expect(page.getByRole('button', { name: 'Add achievement', exact: true })).toBeFocused()
  await page.reload()
  await expect(page.getByTestId('achievement')).toContainText('First reached USD 100,000 in the account')
  await page.screenshot({ path: `docs/design/evidence/achievements/list-${width}.png`, fullPage: true })

  const row = page.getByTestId('achievement').first()
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByTestId('achievement-input').fill('Updated account milestone')
  await page.getByTestId('achievement-date').fill('2026-09-23')
  await page.screenshot({ path: `docs/design/evidence/achievements/editor-${width}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Save achievement', exact: true }).click()
  await expect(page.getByTestId('achievement')).toContainText('Updated account milestone')

  page.once('dialog', dialog => dialog.accept())
  await page.getByTestId('achievement').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('No achievements recorded yet.', { exact: true })).toBeVisible()
  await expect(page.getByText('Achievement deleted.', { exact: true })).toBeVisible()

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const [locale, title] of [['zh-TW', '個人成就與目標'], ['zh-CN', '个人成就与目标'], ['en', 'Achievements and goals']] as const) {
    await selectLocale(page, locale)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  }
})

const civilDate = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

for (const width of [1440, 390]) test(`personal goals CRUD and achievement handoff at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const email = `goals-${randomUUID()}@example.test`
  const password = 'synthetic-goal-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/login?returnTo=%2Fachievements')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/achievements$/)
  await selectLocale(page, 'en')

  await expect(page.getByRole('heading', { name: 'Goals', exact: true })).toBeVisible()
  await expect(page.getByText('No goals set yet.', { exact: true })).toBeVisible()
  if (width === 390) await selectTheme(page, 'dark')

  await page.getByRole('button', { name: 'Add goal', exact: true }).click()
  await page.getByTestId('goal-input').fill('Reach 15% YTD this year')
  await page.getByTestId('goal-date').fill(civilDate(90))
  await page.getByRole('button', { name: 'Save goal', exact: true }).click()
  const dated = page.getByTestId('goal').filter({ hasText: 'Reach 15% YTD this year' })
  await expect(dated).toContainText('In progress')
  await expect(dated).toContainText('90 days left')
  await expect(page.getByRole('button', { name: 'Add goal', exact: true })).toBeFocused()

  // An open-ended goal carries no deadline and sorts after the dated ones.
  await page.getByRole('button', { name: 'Add goal', exact: true }).click()
  await page.getByTestId('goal-input').fill('Write a diary entry every trading day')
  await page.getByTestId('goal-open-ended').check()
  await expect(page.getByTestId('goal-date')).toBeDisabled()
  await page.getByRole('button', { name: 'Save goal', exact: true }).click()
  await expect(page.getByTestId('goal')).toHaveCount(2)
  await expect(page.getByTestId('goal').last()).toContainText('No deadline')
  await page.reload()
  await expect(page.getByTestId('goal')).toHaveCount(2)
  await page.screenshot({ path: `docs/design/evidence/achievements/goals-${width}.png`, fullPage: true })

  await dated.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByTestId('goal-input').fill('Reach 20% YTD this year')
  await page.getByTestId('goal-date').fill(civilDate(-5))
  await page.screenshot({ path: `docs/design/evidence/achievements/goal-editor-${width}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Save goal', exact: true }).click()
  // Overdue is derived at read time, so a past deadline reads as overdue immediately.
  const overdue = page.getByTestId('goal').filter({ hasText: 'Reach 20% YTD this year' })
  await expect(overdue).toContainText('Overdue')
  await expect(overdue).toContainText('5 days overdue')

  await overdue.getByRole('button', { name: 'Mark achieved', exact: true }).click()
  await expect(overdue).toContainText('Achieved')
  await expect(page.getByText('Goal marked achieved. Review the wording, then save it as an achievement.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('achievement-input')).toHaveValue('Reach 20% YTD this year')
  await expect(page.getByTestId('achievement-date')).toHaveValue(civilDate(0))
  await page.getByRole('button', { name: 'Save achievement', exact: true }).click()
  await expect(page.getByTestId('achievement')).toContainText('Reach 20% YTD this year')

  // Resuming an achieved goal restores the derived overdue reading.
  await overdue.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(overdue).toContainText('Overdue')

  page.once('dialog', dialog => dialog.accept())
  await overdue.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByTestId('goal')).toHaveCount(1)
  await expect(page.getByText('Goal deleted.', { exact: true })).toBeVisible()

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('personal achievements guest view offers a safe sign-in return', async ({ page }) => {
  await page.goto('/achievements')
  await selectLocale(page, 'en')
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login?returnTo=%2Fachievements')
})

test('failed achievement save preserves the draft and can be retried', async ({ page }) => {
  const email = `achievements-recovery-${randomUUID()}@example.test`
  const password = 'synthetic-achievement-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/login?returnTo=%2Fachievements')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/achievements$/)
  await selectLocale(page, 'en')
  await page.getByRole('button', { name: 'Add achievement', exact: true }).click()
  const date = '2026-09-22'
  const draft = 'Preserve this unfinished milestone while the service is unavailable.'
  await page.getByTestId('achievement-date').fill(date)
  await page.getByTestId('achievement-input').fill(draft)
  let fail = true
  await page.route('**/api/achievements', async route => {
    if (route.request().method() === 'POST' && fail) {
      fail = false
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Save achievement', exact: true }).click()
  await expect(page.getByTestId('api-error')).toBeVisible()
  await expect(page.getByTestId('achievement-date')).toHaveValue(date)
  await expect(page.getByTestId('achievement-input')).toHaveValue(draft)
  await page.getByRole('button', { name: 'Save achievement', exact: true }).click()
  await expect(page.getByTestId('achievement')).toContainText(draft)
})

test('long achievement text wraps on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const email = `achievements-long-${randomUUID()}@example.test`
  const password = 'synthetic-achievement-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/login?returnTo=%2Fachievements')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/achievements$/)
  await selectLocale(page, 'en')
  await page.getByRole('button', { name: 'Add achievement', exact: true }).click()
  const content = 'A long personal milestone that should remain readable on a phone. '.repeat(14).trim()
  await page.getByTestId('achievement-date').fill('2026-09-22')
  await page.getByTestId('achievement-input').fill(content)
  await page.getByRole('button', { name: 'Save achievement', exact: true }).click()
  await expect(page.getByTestId('achievement')).toContainText(content)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
