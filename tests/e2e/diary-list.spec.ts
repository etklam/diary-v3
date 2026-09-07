import { randomUUID } from 'node:crypto'
import { test, expect, clickNav, selectLocale, selectTheme } from '../support/e2e'

for (const width of [1440, 390]) {
  test(`Diary library filtering, pagination and recovery at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 1000 })
    const email = `library-${randomUUID()}@example.test`, password = 'synthetic-library-password'
    expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
    await page.goto('/login')
    await selectLocale(page, 'en')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/diaries\/new$/)
    await selectLocale(page, 'en')
    await clickNav(page, 'Diary library')
    await expect(page.getByText('Your diary library is empty.', { exact: true })).toBeVisible()
    const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value
    for (let day = 1; day <= 11; day++) {
      expect((await page.request.post('/api/diaries', {
        headers: { 'x-csrf-token': csrf },
        data: {
          title: day <= 3 ? `投資 decision ${day}` : `Observation ${day}`,
          content: 'Demand is improving, but the next report still needs to confirm the original reasoning. Position size remains unchanged.',
          date: `2026-08-${String(day).padStart(2, '0')}`, tags: day <= 3 ? ['research, evidence', '長期'] : [],
        },
      })).status()).toBe(201)
    }
    await page.reload()
    await expect(page.getByRole('status')).toContainText('11 diaries')
    await page.getByTestId('diary-advanced').locator('summary').click()
    await page.getByRole('combobox', { name: 'Diaries per page', exact: true }).selectOption('10')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(page.locator('.diary-records > li')).toHaveCount(10)
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(page.locator('.diary-records > li')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Matching diaries', exact: true })).toBeFocused()
    await page.goBack()
    await expect(page.locator('.diary-records > li')).toHaveCount(10)
    await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('投資')
    await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).press('Enter')
    await expect(page.locator('.diary-records > li')).toHaveCount(3)
    await expect(page).not.toHaveURL(/page=2/)
    for (const [locale, title] of [['zh-TW', '日記資料庫'], ['zh-CN', '日记资料库'], ['en', 'Diary library']] as const) {
      await selectLocale(page, locale)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
    if (width === 390) await selectTheme(page, 'dark')
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `docs/design/evidence/diary-list/${width}.png`, fullPage: true })
    // The advanced section is already open because limit=10 is an active filter.
    await page.getByLabel('From date', { exact: true }).fill('2026-08-02')
    await page.getByLabel('Through date', { exact: true }).fill('2026-08-02')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(page.locator('.diary-records > li')).toHaveCount(1)
    await expect(page.locator('.diary-records')).toContainText('投資 decision 2')
    await page.route('**/api/diaries?*', async route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'library-retry' } }) }))
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(page.getByTestId('request-id')).toHaveText('library-retry')
    await expect(page.getByRole('searchbox')).toHaveValue('投資')
    await page.unroute('**/api/diaries?*')
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.locator('.diary-records > li')).toHaveCount(1)
    await page.getByRole('link', { name: '投資 decision 2', exact: true }).click()
    await expect(page.getByRole('heading', { name: '投資 decision 2', exact: true })).toBeVisible()
    await page.goBack()
    await page.getByRole('searchbox').fill('not-found-text')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(page.getByText('No diaries match these filters.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expect(page.locator('.diary-records > li')).toHaveCount(11)
  })
}
