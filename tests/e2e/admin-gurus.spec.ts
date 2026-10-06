import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect, selectLocale } from '../support/e2e'

const adminEmail = 'etf-admin@example.test'
const adminPassword = 'synthetic-etf-admin-password'

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

test('admin creates, edits, filters, and inspects a synthetic Guru profile at desktop and mobile widths', async ({ page }) => {
  const token = randomUUID().replaceAll('-', '')
  const slug = `synthetic-guru-${token.slice(0, 12)}`
  const cik = `9${token.replace(/\D/g, '').slice(0, 9).padEnd(9, '1')}`
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAdmin(page)
  await gotoWithPreferences(page, '/admin/gurus')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Guru profiles', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Add Guru', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Add a Guru profile' })).toBeVisible()
  await page.locator('.admin-guru-dialog').screenshot({ path: 'docs/design/evidence/admin-gurus/create-1440.png' })
  await dialog.getByRole('button', { name: 'Add Guru', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Check the highlighted fields')
  await expect(dialog.getByLabel('Public name')).toHaveAttribute('aria-invalid', 'true')

  await dialog.getByLabel('Public name').fill('Synthetic Guru North')
  await dialog.getByLabel('Manager or fund name').fill('Synthetic Research Fund')
  await dialog.getByLabel('URL slug').fill(slug)
  await dialog.getByLabel('Manager type').fill('Long-only fund')
  await dialog.getByLabel('Description').fill('Synthetic profile for browser acceptance evidence.')
  await dialog.getByLabel('Investment philosophy').fill('Evidence-led, long-horizon research.')
  await dialog.getByLabel('Investment style tags').fill('Value, Quality')
  await dialog.getByLabel('Country code').fill('us')
  await dialog.getByLabel('SEC Central Index Key (CIK)').fill(cik)
  await dialog.getByLabel('Featured in discovery').check()
  await dialog.getByRole('button', { name: 'Add Guru', exact: true }).click()

  await expect(page).toHaveURL(/\/admin\/gurus\/[1-9]\d*$/)
  await expect(page.getByRole('heading', { name: 'Synthetic Guru North', exact: true })).toBeVisible()
  await expect(page.getByLabel('Country code')).toHaveValue('US')
  await expect(page.getByLabel('SEC Central Index Key (CIK)')).toHaveValue(cik)
  await page.getByLabel('Description').fill('Updated synthetic profile with reviewable history.')
  await page.getByLabel('Profile active').uncheck()
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Guru profile saved.')

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/design/evidence/admin-gurus/detail-1440.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'docs/design/evidence/admin-gurus/detail-390.png' })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/gurus')
  await expect(page.getByRole('heading', { name: 'Guru profiles', exact: true })).toBeVisible()
  await page.getByLabel('Search name, manager, slug, or CIK').fill(slug)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByLabel('Active status').selectOption('false')
  await page.getByLabel('Featured status').selectOption('true')
  const row = page.getByTestId('admin-guru-row').filter({ hasText: slug })
  await expect(row).toContainText('Synthetic Guru North')
  await expect(row).toContainText(cik)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/design/evidence/admin-gurus/1440.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'docs/design/evidence/admin-gurus/390.png' })
  const mobileCard = page.getByTestId('admin-guru-mobile-row').filter({ hasText: slug })
  await expect(mobileCard).toBeVisible()
  await mobileCard.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'docs/design/evidence/admin-gurus/390-result.png' })
  await page.getByRole('button', { name: 'Add Guru', exact: true }).click()
  const mobileDialog = page.getByRole('dialog')
  await expect(mobileDialog).toBeVisible()
  await expect(mobileDialog).toHaveCSS('opacity', '1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/design/evidence/admin-gurus/create-390.png' })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
})

test('ordinary accounts cannot read the Guru administration API or edit route', async ({ page }) => {
  const email = `admin-gurus-ordinary-${randomUUID()}@example.test`
  const password = 'synthetic-admin-gurus-ordinary-password'
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
  await gotoWithPreferences(page, '/admin/gurus')
  await selectLocale(page, 'en')
  await expect(page).toHaveURL(/\/$/)
  expect((await page.request.get('/api/admin/gurus')).status()).toBe(403)
  await page.goto('/admin/gurus/1')
  await expect(page).toHaveURL(/\/$/)
})
