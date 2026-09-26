import { expect, test, selectTheme } from '../support/e2e'

const syntheticToken = 'synthetic-token-abcdefghijklmnopqrstuvwxyz123456'

test('email registration keeps the request generic and supports a synthetic resend', async ({ page }) => {
  let requests = 0
  await page.addInitScript(() => localStorage.setItem('diary-locale', 'en'))
  await page.route('**/api/auth/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ registrationMode: 'email', passwordRecoveryAvailable: true }) }))
  await page.route('**/api/auth/registration/request', async route => {
    requests += 1
    const body = route.request().postDataJSON() as { email?: string; locale?: string }
    expect(body.email).toBe('synthetic-registration@example.test')
    expect(body.locale).toBe('en')
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'retry-after': '1' }, body: JSON.stringify({ success: true }) })
  })
  await page.goto('/register')
  await expect(page.getByRole('heading', { level: 1, name: 'Start your investment diary', exact: true })).toBeVisible()
  await page.getByLabel('Email', { exact: true }).fill('synthetic-registration@example.test')
  await page.getByRole('button', { name: 'Send verification email', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('If this email can be registered')
  expect(requests).toBe(1)
  await expect(page.getByRole('button', { name: 'Send verification email again', exact: true })).toBeDisabled()
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: 'Send verification email again', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Send verification email again', exact: true })).toBeDisabled()
  expect(requests).toBe(2)
})

test('verification and reset completion scrub tokens and consume only on submit', async ({ page }) => {
  let registrationComplete = 0
  let passwordResetComplete = 0
  await page.addInitScript(() => localStorage.setItem('diary-locale', 'en'))
  await page.route('**/api/auth/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ registrationMode: 'direct', passwordRecoveryAvailable: true }) }))
  await page.route('**/api/auth/registration/complete', async route => {
    registrationComplete += 1
    expect((route.request().postDataJSON() as { token: string }).token).toBe(syntheticToken)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
  await page.route('**/api/auth/password-reset/complete', async route => {
    passwordResetComplete += 1
    expect((route.request().postDataJSON() as { token: string }).token).toBe(syntheticToken)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
  await page.goto(`/register/complete?token=${syntheticToken}`)
  await expect(page).toHaveURL('/register/complete')
  await page.getByLabel('Name (optional)', { exact: true }).fill('Synthetic registration user')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-registration-password')
  await page.getByLabel('Confirm password', { exact: true }).fill('synthetic-registration-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your account is ready')
  expect(registrationComplete).toBe(1)

  await page.goto(`/reset-password?token=${syntheticToken}`)
  await expect(page).toHaveURL('/reset-password')
  await page.getByLabel('New password', { exact: true }).fill('synthetic-reset-password')
  await page.getByLabel('Confirm new password', { exact: true }).fill('synthetic-reset-password')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your password changed')
  expect(passwordResetComplete).toBe(1)
})

test('admin can test and enable a synthetic SMTP configuration with explicit state changes', async ({ page }) => {
  let enabled = false
  let revision = 7
  let testedRevision: number | null = null
  const settings = () => ({ enabled, host: 'smtp.synthetic.test', port: 2525, security: 'starttls', authEnabled: false, username: null, passwordConfigured: false, fromName: 'Synthetic Diary', fromEmail: 'noreply@example.test', replyTo: null, revision, testedRevision, lastTestAt: testedRevision ? '2026-09-26T03:00:00.000Z' : null, lastTestStatus: testedRevision ? 'passed' : null })
  const response = () => ({ settings: settings(), deliveries: [] })
  await page.addInitScript(() => localStorage.setItem('diary-locale', 'en'))
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 'synthetic-admin', email: 'synthetic-admin@example.test', role: 'ADMIN' } }) }))
  await page.route('**/api/user/settings', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { locale: 'en', name: 'Synthetic admin', timezone: 'UTC', defaultWorkspacePage: 'timeline', expectedMonthlyTrades: 0, expectedProfit: '0', expectedAvgHolding: '0', excludeHolidaysInStats: false } }) }))
  await page.route('**/api/alerts*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/api/stocks/alerts*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/api/admin/email-settings', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) }); return }
    revision += 1
    testedRevision = null
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) })
  })
  await page.route('**/api/admin/email-settings/test', async route => {
    expect((route.request().postDataJSON() as { recipient: string }).recipient).toBe('synthetic-recipient@example.test')
    testedRevision = revision
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision, status: 'passed', testedAt: '2026-09-26T03:00:00.000Z', errorCode: null }) })
  })
  await page.route('**/api/admin/email-settings/enable', async route => {
    enabled = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) })
  })
  await page.route('**/api/admin/email-settings/disable', async route => {
    enabled = false
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) })
  })
  await page.goto('/admin/email-settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Mail settings', exact: true })).toBeVisible()
  const serviceState = page.getByRole('region', { name: 'Service state' })
  await expect(serviceState.getByText('Disabled', { exact: true })).toBeVisible()
  await page.getByLabel('Recipient', { exact: true }).fill('synthetic-recipient@example.test')
  await page.getByRole('button', { name: 'Send test email', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Test passed.')
  await page.getByRole('button', { name: 'Enable mail', exact: true }).click()
  await expect(serviceState.getByText('Enabled', { exact: true })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Disable mail', exact: true }).click()
  await expect(serviceState.getByText('Disabled', { exact: true })).toBeVisible()
  await selectTheme(page, 'dark')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
