import { randomUUID } from 'node:crypto'
import { expect, test, selectLocale } from '../support/e2e'

const password = 'synthetic-workspace-navigation-password'

async function signIn(page: import('@playwright/test').Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await selectLocale(page, 'en')
}

test('desktop workspace navigation keeps capture direct, keyboard capture independent and routes ordinary', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `workspace-desktop-${randomUUID()}@example.test`)

  const primary = page.locator('.desktop-nav')
  for (const [name, href] of [
    ['Overview', '/'], ['Diary', '/diaries'], ['Review queue', '/reviews'], ['Trade plans', '/trade-plans'],
    ['Holdings', '/stocks'], ['Watchlist', '/stocks/watchlist'], ['Market research', '/stocks/SPY'], ['Tools', '/tools'],
  ] as const) {
    await expect(primary.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }
  await expect(primary.getByRole('link', { name: 'Public articles', exact: true })).toHaveAttribute('href', '/articles')
  await expect(primary.locator('.nav-group > h2')).toHaveText(['Diary & review', 'Investing & trading', 'Markets & tools', 'Account'])
  await expect(primary.getByText('Daily work', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('quick-entry')).toHaveAttribute('href', '/diaries/quick')

  const disclosure = page.locator('.desktop-quick-entry .quick-capture-disclosure')
  await expect(disclosure.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveCount(0)
  await disclosure.locator('summary').click()
  await expect(disclosure.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveAttribute('href', '/diaries/new')

  await page.getByTestId('quick-entry').focus()
  await expect(disclosure.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveCount(0)
  await page.keyboard.press('Control+j')
  const captureDialog = page.getByRole('dialog')
  await expect(captureDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(captureDialog).toBeHidden()
  await expect(page.getByTestId('quick-entry')).toBeFocused()

  await page.getByRole('link', { name: 'Diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries$/)
  const diaryNav = page.getByTestId('diary-navigation')
  await expect(diaryNav.getByRole('link', { name: 'Diary library', exact: true })).toHaveAttribute('aria-current', 'page')
  await diaryNav.getByRole('link', { name: 'Timeline', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await expect(page.getByTestId('diary-navigation').getByRole('link', { name: 'Timeline', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByTestId('diary-navigation').getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/calendar$/)
  await expect(page.getByTestId('diary-navigation').getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Diary')

  const diaryManagement = page.locator('.desktop-nav .nav-more').filter({ hasText: 'Diary management' })
  await diaryManagement.locator('summary').click()
  await expect(diaryManagement.getByRole('link', { name: 'Partner management', exact: true })).toBeVisible()
  await expect(diaryManagement.getByRole('link', { name: 'Diary reminders', exact: true })).toHaveAttribute('href', '/alerts')

  await page.goto('/partners/compare')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Diary')
  await page.goto('/stocks/alerts')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Price reminders')
  await expect(page.locator('.desktop-nav .nav-more').filter({ hasText: 'Trade management' })).toHaveAttribute('open', '')
  await page.goto('/reviews')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Review queue')
  await page.screenshot({ path: 'docs/design/evidence/navigation/user-sidebar-1440.png', fullPage: true })

  await page.setViewportSize({ width: 768, height: 900 })
  await expect(page.getByTestId('quick-entry')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('mobile menu exposes the same capture and workspace destinations with keyboard focus return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, `workspace-mobile-${randomUUID()}@example.test`)

  const trigger = page.getByTestId('mobile-menu')
  await trigger.focus()
  await trigger.press('Enter')
  const dialog = page.getByTestId('mobile-menu-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('mobile-quick-entry')).toHaveAttribute('href', '/diaries/quick')
  await dialog.locator('.quick-capture-disclosure summary').click()
  await expect(dialog.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveAttribute('href', '/diaries/new')
  await expect(dialog.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('href', '/')
  await expect(dialog.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings')
  await expect(dialog.getByRole('link', { name: 'Public articles', exact: true })).toHaveAttribute('href', '/articles')
  await dialog.getByTestId('mobile-quick-entry').focus()
  await expect(dialog.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveCount(0)
  await dialog.locator('.quick-capture-disclosure summary').click()

  await page.keyboard.press('Escape')
  await expect(dialog.locator('.quick-capture-disclosure > summary')).toBeFocused()
  await expect(dialog.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.press('Enter')
  await expect(dialog).toBeVisible()
  await dialog.locator('.nav-more > summary').filter({ hasText: 'Diary management' }).click()
  await dialog.getByRole('link', { name: 'Partner management', exact: true }).click()
  await expect(page).toHaveURL(/\/partners$/)
  await expect(dialog).toBeHidden()

  await page.goto('/')
  await trigger.press('Enter')
  await dialog.getByRole('link', { name: 'Diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries$/)
  await page.getByTestId('diary-navigation').getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/calendar$/)

  await page.goto('/')
  await trigger.press('Enter')
  await dialog.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)

  await page.goto('/')
  await trigger.press('Enter')
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/navigation/mobile-drawer-390.png', fullPage: true })
  await dialog.getByRole('link', { name: 'Tools', exact: true }).click()
  await expect(page).toHaveURL(/\/tools$/)
  await expect(dialog).toBeHidden()
})

test('admin navigation is role-gated and ordered with article management first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  expect((await page.request.post('/api/auth/login', { data: { email: 'etf-admin@example.test', password: 'synthetic-etf-admin-password' } })).status()).toBe(200)
  await page.goto('/admin/blog/new')
  await selectLocale(page, 'en')
  const admin = page.locator('.desktop-nav .nav-group').filter({ has: page.getByRole('heading', { name: 'Administration', exact: true }) })
  await expect(admin.getByRole('link')).toHaveText(['Article management', 'User management', 'ETF catalog'])
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Article management')
  await page.screenshot({ path: 'docs/design/evidence/navigation/admin-sidebar-1440.png', fullPage: true })

  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 720 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
