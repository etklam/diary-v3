import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect, selectLocale, selectTheme } from '../support/e2e'

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

test('admin account inventory preserves current-account guard and manages a synthetic account', async ({ page, browser }) => {
  const targetEmail = `admin-users-${randomUUID()}@example.test`
  const targetPassword = 'synthetic-admin-users-password'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.screenshot({ path: 'docs/design/evidence/public-pages/1440.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/design/evidence/public-pages/390.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  const targetContext = await browser.newContext()
  try {
    const target = await targetContext.newPage()
    expect((await target.request.post('/api/auth/register', { data: { email: targetEmail, password: targetPassword, name: 'Synthetic account' } })).status()).toBe(200)
    expect((await target.request.post('/api/auth/login', { data: { email: targetEmail, password: targetPassword } })).status()).toBe(200)
    await target.request.get('/api/auth/me')
    const csrfToken = (await targetContext.cookies()).find(cookie => cookie.name === 'csrf-token')?.value
    const diaryResponse = await target.request.post('/api/diaries', { headers: { 'x-csrf-token': csrfToken ?? '' }, data: { date: '2026-09-05', title: 'Synthetic admin diary', content: 'A reviewable synthetic decision.' } })
    expect(diaryResponse.status()).toBe(201)
  } finally {
    await targetContext.close()
  }

  await signInAdmin(page)
  await gotoWithPreferences(page, '/admin/users')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Admin accounts', exact: true })).toBeVisible()
  const targetRow = page.locator('tr').filter({ hasText: targetEmail })
  const adminRow = page.locator('tr').filter({ hasText: adminEmail })
  await expect(targetRow).toContainText('Synthetic account')
  await expect(targetRow).toContainText('1')
  await expect(page.locator('main')).toContainText('Synthetic admin diary')
  await expect(adminRow.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0)

  const role = targetRow.getByRole('combobox', { name: `Role: ${targetEmail}`, exact: true })
  await role.selectOption('ADMIN')
  await targetRow.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Role updated.')
  await role.selectOption('USER')
  await targetRow.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Role updated.')

  await page.setViewportSize({ width: 1440, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.admin-users-page').screenshot({ path: 'docs/design/evidence/admin-users/1440.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await selectTheme(page, 'dark')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.admin-users-page').screenshot({ path: 'docs/design/evidence/admin-users/390.png' })

  await page.setViewportSize({ width: 1440, height: 900 })
  page.once('dialog', dialog => dialog.accept())
  await targetRow.getByRole('button', { name: 'Delete account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Account deleted.')
  await expect(page.locator('tr').filter({ hasText: targetEmail })).toHaveCount(0)
})

test('ordinary account sees the protected admin route without admin controls', async ({ page }) => {
  const email = `admin-users-ordinary-${randomUUID()}@example.test`
  const password = 'synthetic-admin-users-ordinary-password'
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
  await gotoWithPreferences(page, '/admin/users')
  await selectLocale(page, 'en')
  await expect(page.getByRole('alert')).toContainText('permission')
  await expect(page.getByRole('heading', { name: 'Admin accounts', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0)
})
