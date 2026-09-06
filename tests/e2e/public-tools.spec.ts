import { expect, test } from '../support/e2e'

test('guests can use public Tools and private endpoints stay protected', async ({ page }) => {
  const privateRequests: string[] = []
  page.on('request', request => {
    if (request.method() !== 'GET' && /\/api\/(diaries|trade-plans|stocks\/watchlist|etf\/watchlist)/.test(request.url())) privateRequests.push(request.url())
  })

  await page.goto('/tools')
  await expect(page.getByRole('heading', { name: '工具', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '部位計算', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '工具', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.goto('/tools/position-sizing')
  await page.getByTestId('position-sizing-capital').fill('10000')
  await page.getByTestId('position-sizing-price').fill('33')
  await expect(page.getByTestId('position-sizing-invested')).toHaveText('9,933')
  await page.getByTestId('position-sizing-save-new').click()
  await expect(page.getByRole('alert')).toContainText('Sign in')
  expect(privateRequests).toEqual([])

  await page.goto('/tools/financial-freedom')
  await expect(page.getByRole('heading', { name: '財務自由', exact: true })).toBeVisible()
  await expect(page.getByTestId('fire-target')).toBeVisible()

  await page.goto('/tools/seasonality')
  await expect(page.getByRole('heading', { name: '季節性', exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(1)

  for (const path of ['/api/diaries', '/api/stocks/watchlist', '/api/etf/watchlist', '/api/admin/users']) {
    expect((await page.request.get(path)).status()).toBe(401)
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tools')
  await page.screenshot({ path: 'docs/design/evidence/public-tools/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/design/evidence/public-tools/mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
