import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { selectLocale } from '../support/e2e.js'

const period = {
  periodEnd: '2026-06-30', activeManagerCount: 5, readyManagerCount: 4, partialManagerCount: 1,
  errorManagerCount: 0, supersededManagerCount: 0, pendingManagerCount: 0, noFilingManagerCount: 0,
  comparableManagerCount: 3, previousReadyManagerCount: 3, sourceRowCount: 12, mappedRowCount: 12,
  mappingCoveragePercent: '100.00000000', quarterCoveragePercent: '80.00000000', source: 'SEC Form 13F',
}
const previousPeriod = { ...period, periodEnd: '2026-03-31', readyManagerCount: 3, partialManagerCount: 0, comparableManagerCount: 0, quarterCoveragePercent: '60.00000000' }
const periods = [period, previousPeriod]

const stock = {
  securityId: '1001', ticker: 'SYN', company: 'Synthetic Systems', sector: 'Technology', industry: 'Software',
  currentHolderCount: 4, comparableCurrentHolderCount: 3, previousHolderCount: 3, holderCountChange: 1,
  newBuyerCount: 1, addCount: 2, unchangedCount: 1, reduceCount: 0, exitCount: 0, netBuyerCount: 3,
  actionManagerCount: 4, quantityChangeSampleCount: 3, averageQuantityChangePercent: '12.50000000',
  medianQuantityChangePercent: '5.00000000', aggregateWeightPercent: '48.00000000',
  averagePortfolioWeightPercent: '12.00000000', weightBreadthPercent: '100.00000000',
  classification: 'ACCUMULATION', quarterTrend: 'RISING',
}
const sector = {
  dimension: 'THEME', dimensionKey: 'ai-infrastructure', name: 'AI Infrastructure', currentHolderCount: 4,
  buyerCount: 3, sellerCount: 1, newPositionCount: 1, exitCount: 0, addCount: 2, reduceCount: 1,
  allocationManagerCount: 3, aggregateWeightPercent: '44.00000000',
  comparableCurrentAggregateWeightPercent: '40.00000000', previousAggregateWeightPercent: '30.00000000',
  aggregateWeightChangePoints: '10.00000000', holderBreadthPercent: '100.00000000',
  allocationCoveragePercent: '75.00000000', direction: 'INCREASING',
}

test('explores prepared Guru consensus, rankings, sectors, and mobile cards', async ({ page }) => {
  const requests: URL[] = []
  await page.route('**/api/gurus/**', async route => {
    const url = new URL(route.request().url())
    requests.push(url)
    if (url.pathname === '/api/gurus/stocks.csv') {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="guru-consensus-2026-06-30.csv"' },
        body: '"ticker","current_holder_count"\r\n"SYN","4"\r\n',
      })
      return
    }
    const selectedPeriod = url.searchParams.get('period') === '2026-03-31' ? previousPeriod : period
    const pagination = { page: Number(url.searchParams.get('page') ?? '1'), limit: 25, total: 26, totalPages: 2 }
    if (url.pathname === '/api/gurus/consensus') {
      await route.fulfill({ json: { data: { period: selectedPeriod, periods, items: [stock], pagination } } })
      return
    }
    if (url.pathname === '/api/gurus/stocks') {
      await route.fulfill({ json: { data: { period: selectedPeriod, periods, ranking: url.searchParams.get('ranking') ?? 'most-held', items: [stock], pagination } } })
      return
    }
    if (url.pathname === '/api/gurus/sectors') {
      await route.fulfill({ json: { data: { period: selectedPeriod, periods, dimension: url.searchParams.get('dimension') ?? 'SECTOR', items: [sector], pagination } } })
      return
    }
    await route.fulfill({ status: 404, json: { error: 'unhandled synthetic Guru intelligence route' } })
  })

  await mkdir('docs/design/evidence/guru-intelligence', { recursive: true })
  await page.goto('/')
  await selectLocale(page, 'en')
  await page.goto('/gurus/consensus')
  await expect(page.getByRole('heading', { name: 'Guru consensus', exact: true })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('13F holdings are delayed')
  await expect(page.getByRole('row', { name: /SYN Synthetic Systems/ })).toContainText('4 / 4')
  await expect(page.locator('.guru-intelligence-cards')).toContainText('Accumulation')

  const previousQuarterResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/api/gurus/consensus' && url.searchParams.get('period') === '2026-03-31'
  })
  await page.getByLabel('Reported quarter').selectOption('2026-03-31')
  await previousQuarterResponse
  await expect(page.getByText('3 / 5', { exact: true })).toBeVisible()
  const latestQuarterResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/api/gurus/consensus' && url.searchParams.get('period') === '2026-06-30'
  })
  await page.getByLabel('Reported quarter').selectOption('2026-06-30')
  await latestQuarterResponse

  await page.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('ACCUMULATION')
  await expect.poll(() => requests.some(url => url.pathname === '/api/gurus/consensus' && url.searchParams.get('classification') === 'ACCUMULATION')).toBe(true)
  await page.getByLabel('Search ticker or company').fill('Synthetic')
  const searchResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/api/gurus/consensus' && url.searchParams.get('search') === 'Synthetic'
  })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await searchResponse
  await page.screenshot({ path: 'docs/design/evidence/guru-intelligence/consensus-desktop.png', fullPage: true })

  const pageTwoResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/api/gurus/consensus' && url.searchParams.get('page') === '2'
  })
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await pageTwoResponse
  await expect(page.getByText('Page 2 of 2')).toBeVisible()

  await page.getByRole('link', { name: 'Stocks', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Most-owned stocks', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Rank by', exact: true }).selectOption('most-added')
  await expect.poll(() => requests.some(url => url.pathname === '/api/gurus/stocks' && url.searchParams.get('ranking') === 'most-added')).toBe(true)
  const csvDownload = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Export CSV' }).click()
  expect((await csvDownload).suggestedFilename()).toBe('guru-consensus-2026-06-30.csv')

  await page.getByRole('link', { name: 'Sectors', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sector direction', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Group by', exact: true }).selectOption('THEME')
  await expect.poll(() => requests.some(url => url.pathname === '/api/gurus/sectors' && url.searchParams.get('dimension') === 'THEME')).toBe(true)
  await page.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('INCREASING')
  await expect.poll(() => requests.some(url => url.pathname === '/api/gurus/sectors' && url.searchParams.get('direction') === 'INCREASING')).toBe(true)
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('buyers')
  await expect.poll(() => requests.some(url => url.pathname === '/api/gurus/sectors' && url.searchParams.get('sort') === 'buyers')).toBe(true)
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('direction')
  const themeRow = page.getByRole('row', { name: /AI Infrastructure/ })
  await expect(themeRow).toContainText('Increasing')
  await expect(themeRow.getByRole('cell').nth(2)).toHaveText('3')
  await expect(themeRow.getByRole('cell').nth(3)).toHaveText('1')
  await expect(themeRow.getByRole('cell').nth(4)).toHaveText('1 · 2 · 1 · 0')
  await expect(themeRow).toContainText('+10%')
  await page.screenshot({ path: 'docs/design/evidence/guru-intelligence/sectors-desktop.png', fullPage: true })

  await selectLocale(page, 'zh-TW')
  await expect(page.getByRole('heading', { name: '板塊資金方向', exact: true })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('13F')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gurus/consensus')
  await expect(page.getByRole('heading', { name: '大師持倉共識', exact: true })).toBeVisible()
  await expect(page.locator('.guru-intelligence-cards .guru-intelligence-card').first()).toContainText('Synthetic Systems')
  await expect(page.locator('.guru-intelligence-table-wrap')).toBeHidden()
  await page.screenshot({ path: 'docs/design/evidence/guru-intelligence/consensus-mobile.png', fullPage: true })

  await page.goto('/gurus/sectors')
  await expect(page.getByRole('heading', { name: '板塊資金方向', exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: '分組方式', exact: true }).selectOption('THEME')
  const themeCard = page.locator('.guru-intelligence-cards .guru-intelligence-card').first()
  await expect(themeCard).toContainText('AI Infrastructure')
  await expect(themeCard).toContainText('3 · 1')
  await expect(themeCard).toContainText('+10%')
  await expect(themeCard).toContainText('75%')
  await page.screenshot({ path: 'docs/design/evidence/guru-intelligence/sectors-mobile.png', fullPage: true })
})
