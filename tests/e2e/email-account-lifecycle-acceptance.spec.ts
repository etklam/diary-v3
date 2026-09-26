import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from '../support/e2e'

const evidenceDir = resolve(process.cwd(), 'docs/design/evidence/email-account-lifecycle')
const syntheticToken = 'synthetic-acceptance-token-abcdefghijklmnopqrstuvwxyz123456'

async function preferences(page: Page, locale: 'zh-TW' | 'zh-CN' | 'en', theme: 'light' | 'dark') {
  await page.addInitScript(({ savedLocale, savedTheme }: { savedLocale: string; savedTheme: string }) => {
    localStorage.setItem('diary-locale', savedLocale)
    localStorage.setItem('diary-theme', savedTheme)
  }, { savedLocale: locale, savedTheme: theme })
}

async function capture(page: Page, name: string) {
  const path = resolve(evidenceDir, name)
  await mkdir(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
}

function capabilityRoute(page: Page, passwordRecoveryAvailable = true) {
  return page.route('**/api/auth/capabilities', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ registrationMode: 'email', passwordRecoveryAvailable }),
  }))
}

test('acceptance capture: admin SMTP settings on desktop and mobile', async ({ page }) => {
  let adminLocale: 'zh-TW' | 'en' = 'en'
  await preferences(page, 'en', 'light')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 'synthetic-admin', email: 'admin@example.test', role: 'ADMIN' } }) }))
  await page.route('**/api/user/settings', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { locale: adminLocale, name: 'Synthetic admin', timezone: 'UTC', defaultWorkspacePage: 'timeline', expectedMonthlyTrades: 0, expectedProfit: '0', expectedAvgHolding: '0', excludeHolidaysInStats: false } }) }))
  await page.route('**/api/alerts*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/api/stocks/alerts*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/api/admin/email-settings', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      settings: { enabled: false, host: 'smtp.synthetic.test', port: 587, security: 'starttls', authEnabled: false, username: null, passwordConfigured: false, fromName: 'Trade basic', fromEmail: 'noreply@example.test', replyTo: null, revision: 2, testedRevision: null, lastTestAt: null, lastTestStatus: null },
      deliveries: [{ id: 'synthetic-delivery-1', kind: 'password_reset', recipientMasked: 'u***@e***.test', status: 'failed', attemptCount: 3, lastErrorCode: 'SMTP_TRANSIENT', createdAt: '2026-09-26T03:00:00.000Z' }],
    }),
  }))
  await page.goto('/admin/email-settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Mail settings', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Service state' })).toContainText('Disabled')
  await capture(page, 'admin-settings-en-light-desktop.png')

  await page.setViewportSize({ width: 390, height: 844 })
  adminLocale = 'zh-TW'
  await page.addInitScript(() => {
    localStorage.setItem('diary-locale', 'zh-TW')
    localStorage.setItem('diary-theme', 'dark')
  })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '電郵設定', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, 'admin-settings-zh-TW-dark-mobile.png')
})

test('acceptance capture: registration request and verification completion', async ({ page }) => {
  await preferences(page, 'zh-CN', 'light')
  await page.setViewportSize({ width: 390, height: 844 })
  await capabilityRoute(page)
  await page.route('**/api/auth/registration/request', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'retry-after': '60' }, body: JSON.stringify({ success: true }) }))
  await page.goto('/register')
  await expect(page.getByRole('heading', { level: 1, name: '开始你的投资日记', exact: true })).toBeVisible()
  await page.getByLabel('邮箱', { exact: true }).fill('new-user@example.test')
  await page.getByRole('button', { name: '发送验证邮件', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('如果这个邮箱可以注册')
  await capture(page, 'registration-request-zh-CN-light-mobile.png')

  await preferences(page, 'en', 'dark')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/api/auth/registration/complete', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }))
  await page.goto(`/register/complete?token=${syntheticToken}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Finish creating your account', exact: true })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-123')
  await page.getByLabel('Confirm password', { exact: true }).fill('synthetic-password-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your account is ready')
  await capture(page, 'registration-complete-en-dark-desktop.png')
  expect(new URL(page.url()).search).toBe('')
})

test('acceptance capture: recovery unavailable and failed request states', async ({ page }) => {
  await preferences(page, 'zh-TW', 'light')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await capabilityRoute(page, false)
  await page.goto('/forgot-password')
  await expect(page.getByRole('status')).toContainText('電郵密碼復原目前未啟用')
  await capture(page, 'recovery-unavailable-zh-TW-light-desktop.png')

  await preferences(page, 'zh-CN', 'dark')
  await page.setViewportSize({ width: 390, height: 844 })
  await capabilityRoute(page, true)
  await page.route('**/api/auth/password-reset/request', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ data: { code: 'AUTH_EMAIL_SERVICE_DISABLED', requestId: 'synthetic-disabled' } }) }))
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { level: 1, name: '重置密码', exact: true })).toBeVisible()
  await page.getByLabel('邮箱', { exact: true }).fill('user@example.test')
  await page.getByRole('button', { name: '发送重置邮件', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('邮箱密码恢复目前未启用')
  await expect(page.getByRole('button', { name: '发送重置邮件', exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await capture(page, 'recovery-failed-zh-CN-dark-mobile.png')
})

test('acceptance capture: expired reset link and successful password reset', async ({ page }) => {
  let tokenExpired = true
  let recoveryAvailable = true
  await preferences(page, 'en', 'light')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/auth/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ registrationMode: 'email', passwordRecoveryAvailable: recoveryAvailable }) }))
  await page.route('**/api/auth/password-reset/complete', route => tokenExpired
    ? route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ data: { code: 'AUTH_EMAIL_TOKEN_EXPIRED', requestId: 'synthetic-expired' } }) })
    : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }))
  await page.goto(`/reset-password?token=${syntheticToken}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Set a new password', exact: true })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('synthetic-new-password-123')
  await page.getByLabel('Confirm new password', { exact: true }).fill('synthetic-new-password-123')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This email link has expired')
  await expect(page.getByRole('link', { name: 'Request a new reset email', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toHaveCount(0)
  await capture(page, 'reset-expired-en-light-mobile.png')
  expect(new URL(page.url()).search).toBe('')

  recoveryAvailable = false
  await page.goto(`/reset-password?token=${syntheticToken}`)
  await page.getByLabel('New password', { exact: true }).fill('synthetic-new-password-123')
  await page.getByLabel('Confirm new password', { exact: true }).fill('synthetic-new-password-123')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Email password recovery is not enabled')
  await expect(page.getByRole('link', { name: 'Request a new reset email', exact: true })).toHaveCount(0)

  tokenExpired = false
  recoveryAvailable = true
  await preferences(page, 'zh-TW', 'dark')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/reset-password?token=${syntheticToken}`)
  await expect(page.getByRole('heading', { level: 1, name: '設定新密碼', exact: true })).toBeVisible()
  await page.getByLabel('新密碼', { exact: true }).fill('synthetic-new-password-456')
  await page.getByLabel('確認新密碼', { exact: true }).fill('synthetic-new-password-456')
  await page.getByRole('button', { name: '重設密碼', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('密碼已更改')
  await capture(page, 'reset-complete-zh-TW-dark-desktop.png')
  expect(new URL(page.url()).search).toBe('')
})

test('acceptance capture: keyboard focus is visible on recovery form', async ({ page }) => {
  await preferences(page, 'en', 'light')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await capabilityRoute(page, true)
  await page.goto('/forgot-password')
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).focus()
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused()
  await capture(page, 'recovery-keyboard-focus-en-light-desktop.png')
})
