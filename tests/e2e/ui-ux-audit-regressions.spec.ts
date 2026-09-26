import { randomUUID } from 'node:crypto'
import { expect, selectLocale, test } from '../support/e2e'

test('password recovery stays discoverable with a configured support route when SMTP is off', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('initial-locale-set')) {
      localStorage.setItem('diary-locale', 'en')
      sessionStorage.setItem('initial-locale-set', 'true')
    }
  })
  await page.route('**/api/auth/capabilities', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ registrationMode: 'direct', passwordRecoveryAvailable: false }),
  }))

  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Email password recovery is not enabled')
  await expect(page.getByRole('link', { name: 'Get sign-in help', exact: true })).toHaveAttribute('href', 'https://support.example.test/account-recovery')
  await expect(page.getByRole('link', { name: 'Back to sign in', exact: true })).toBeVisible()

  await page.route('**/api/auth/password-reset/complete', route => route.fulfill({
    status: 410,
    contentType: 'application/json',
    body: JSON.stringify({ data: { code: 'AUTH_EMAIL_TOKEN_EXPIRED', requestId: 'synthetic-expired-reset' } }),
  }))
  await page.goto('/reset-password?token=synthetic-reset-token-abcdefghijklmnopqrstuvwxyz123456')
  await page.getByLabel('New password', { exact: true }).fill('synthetic-reset-password-123')
  await page.getByLabel('Confirm new password', { exact: true }).fill('synthetic-reset-password-123')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Email password recovery is not enabled')
  await expect(page.getByRole('link', { name: 'Get sign-in help', exact: true })).toHaveAttribute('href', 'https://support.example.test/account-recovery')
})

test('browser titles follow locale, preserve public article titles, and keep private diary titles out of the tab', async ({ page, context, browser }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('initial-locale-set')) {
      localStorage.setItem('diary-locale', 'zh-TW')
      sessionStorage.setItem('initial-locale-set', 'true')
    }
  })
  await page.goto('/tools')
  await expect.poll(() => page.title()).toBe('工具 — Trade basic')
  await page.getByTestId('locale-select').selectOption('en')
  await expect.poll(() => page.title()).toBe('Tools — Trade basic')

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('etf-admin@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-etf-admin-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectLocale(page, 'en')

  const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')?.value
  expect(csrf).toBeTruthy()

  const publicArticleTitle = `Public title ${randomUUID()}`
  const draftResponse = await page.request.post('/api/blog', {
    headers: { 'x-csrf-token': csrf ?? '' },
    data: { title: publicArticleTitle, content: 'Synthetic public article body.', category: 'market', status: 'DRAFT', access: 'PUBLIC', sourceLocale: 'en' },
  })
  expect(draftResponse.status(), await draftResponse.text()).toBe(200)
  const draft = await draftResponse.json() as { id: string }
  const articleResponse = await page.request.get(`/api/blog/admin/${draft.id}`)
  const article = await articleResponse.json() as { slug: string }
  expect(articleResponse.status()).toBe(200)
  const publishResponse = await page.request.post(`/api/blog/admin/${draft.id}/publish`, { headers: { 'x-csrf-token': csrf ?? '' }, data: {} })
  expect(publishResponse.status(), await publishResponse.text()).toBe(200)

  const guestContext = await browser.newContext()
  try {
    const guest = await guestContext.newPage()
    await guest.goto(`/articles/${encodeURIComponent(article.slug)}`)
    await expect(guest.getByRole('heading', { name: publicArticleTitle, exact: true })).toBeVisible()
    await expect.poll(() => guest.title()).toBe(`${publicArticleTitle} — Trade basic`)
  } finally {
    await guestContext.close()
  }

  const privateTitle = 'Synthetic private tab title'
  const created = await page.request.post('/api/diaries', {
    headers: { 'x-csrf-token': csrf ?? '' },
    data: { date: '2026-09-26', title: privateTitle, content: 'Synthetic private reasoning.' },
  })
  expect(created.status()).toBe(201)
  const diary = await created.json() as { id: string }
  await page.goto(`/diaries/${diary.id}`)
  await expect(page.getByRole('heading', { name: privateTitle, exact: true })).toBeVisible()
  await expect.poll(() => page.title()).toBe('Diary — Trade basic')

  await page.goto('/login')
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('sign-out')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Return to your diary', exact: true })).toHaveCount(0)
})
