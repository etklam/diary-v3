import { randomUUID } from 'node:crypto'
import { expect, test } from '../support/e2e'

for (const width of [1440, 390]) {
  test(`position sizing calculation and Diary/Trade Plan handoffs at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const email = `position-sizing-${randomUUID()}@example.test`
    const password = 'synthetic-position-sizing-password'
    expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
    await page.goto('/login')
    await page.getByTestId('locale-select').selectOption('en')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/diaries\/new$/)
    await page.goto('/tools/position-sizing')
    await page.getByTestId('locale-select').selectOption('en')
    await expect(page.getByRole('heading', { name: 'Position sizing', exact: true })).toBeVisible()
    await page.getByTestId('position-sizing-capital').fill('10000')
    await page.getByTestId('position-sizing-price').fill('33')
    await page.getByTestId('position-sizing-symbol').fill('AAPL')
    await page.getByTestId('position-sizing-context').fill('Synthetic demand confirmation.')
    await expect(page.getByTestId('position-sizing-invested')).toHaveText('9,933')
    await expect(page.getByTestId('position-sizing-shares')).toHaveText('301')
    await expect(page.getByTestId('position-sizing-reserved')).toHaveText('0')
    await page.getByTestId('position-sizing-reserve').fill('10')
    await expect(page.getByTestId('position-sizing-reserved')).toHaveText('1,000')
    await expect(page.getByTestId('position-sizing-invested')).toHaveText('8,943')
    await expect(page.getByTestId('position-sizing-shares')).toHaveText('271')
    await page.getByTestId('position-sizing-strategy').selectOption('inverted-pyramid')
    await expect(page.getByTestId('position-sizing-ratios')).toContainText('10 / 20 / 30 / 40')
    await page.getByTestId('position-sizing-strategy').selectOption('pyramid')
    await page.getByTestId('position-sizing-rounding').selectOption('nearest')
    await expect(page.locator('.position-sizing-table-wrap')).toHaveAttribute('tabindex', '0')
    for (const [locale, heading] of [['zh-TW', '部位計算'], ['zh-CN', '仓位计算'], ['en', 'Position sizing']] as const) {
      await page.getByTestId('locale-select').selectOption(locale)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    }
    if (width === 390) await page.getByTestId('theme-select').selectOption('dark')
    await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    await page.screenshot({ path: `docs/design/evidence/position-sizing/${width}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.getByTestId('position-sizing-copy').click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('| Ratio | Planned amount | Whole shares | Actual amount |')
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: () => Promise.reject(new Error('Synthetic clipboard denial')) }) })
    await page.getByTestId('position-sizing-copy').click()
    await expect(page.getByLabel('Position sizing Markdown', { exact: true })).toBeVisible()

    const createResponse = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.request().method() === 'POST')
    await page.getByTestId('position-sizing-save-new').click()
    const created = await createResponse
    expect(created.status()).toBe(201)
    const diary = await created.json() as { id: string }
    await expect(page.getByRole('status')).toHaveText('Diary saved.')
    const appendResponse = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.request().method() === 'POST')
    await page.getByTestId('position-sizing-append').click()
    const appended = await appendResponse
    expect(appended.status()).toBe(201)
    const persisted = await (await page.request.get(`/api/diaries/${diary.id}`)).json()
    expect(persisted.content).toContain('Synthetic demand confirmation.')
    expect(persisted.content).toContain('\n\n---\n\n')

    await page.getByTestId('position-sizing-trade-plan').click()
    await expect(page).toHaveURL(/\/trade-plans\/new\?prefill=position-sizing$/)
    await expect(page.getByRole('textbox', { name: 'Symbol', exact: true })).toHaveValue('AAPL')
    await expect(page.getByRole('textbox', { name: 'Entry price', exact: true })).toHaveValue('33')
    await expect(page.getByRole('textbox', { name: 'Maximum position size', exact: true })).toHaveValue(/9009\.00/)
    await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue(/Position sizing/)

    await page.goto('/tools/position-sizing')
    await page.getByTestId('position-sizing-capital').fill('0')
    await page.getByTestId('position-sizing-price').fill('33')
    await expect(page.getByTestId('position-sizing-invalid')).toHaveText('Enter a positive capital amount and stock price to calculate.')
  })
}
