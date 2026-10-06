import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { selectLocale } from '../support/e2e.js'

const timestamp = '2026-08-14T20:00:00.000Z'
const periodEnd = '2026-06-30'

const profile = {
  name: 'Warren Buffett', managerName: 'Berkshire Hathaway', slug: 'warren-buffett',
  description: 'A synthetic profile for browser acceptance.', investmentPhilosophy: 'Patient ownership of durable businesses.',
  styleTags: ['Value', 'Quality'], managerType: 'Public Company', website: 'https://berkshire.example.test',
  country: 'US', imageUrl: null, featured: true,
}

const portfolio = {
  periodEnd, filedAt: timestamp, status: 'READY', reportedValueUsd: '1000000000', holdingCount: 2,
  topFiveConcentrationPercent: '45', topTenConcentrationPercent: '70', hhi: '0.2750', turnoverPercent: '12', turnoverBand: 'MODERATE',
  actionCounts: { new: 1, add: 2, reduce: 1, exit: 0 },
  largestPosition: { positionKey: 'sec:1:SH', securityId: '1', ticker: 'SYN', company: 'Synthetic Systems', quantityType: 'SH', putCall: null, quantity: '1000', reportedValueUsd: '300000000', weightPercent: '30', rank: 1 },
  topHoldings: [{ positionKey: 'sec:1:SH', securityId: '1', ticker: 'SYN', company: 'Synthetic Systems', quantityType: 'SH', putCall: null, quantity: '1000', reportedValueUsd: '300000000', weightPercent: '30', rank: 1 }],
  sectorAllocation: [{ name: 'Technology', reportedValueUsd: '550000000', weightPercent: '55' }],
}

test('discovers and opens a prepared Guru overview in all supported locales', async ({ page }) => {
  let directoryState: 'ready' | 'empty' | 'error' = 'ready'
  let directoryDelayMs = 0
  let overviewState: 'ready' | 'partial' = 'ready'
  await page.route('**/api/gurus**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/gurus') {
      if (directoryDelayMs) await new Promise(resolve => setTimeout(resolve, directoryDelayMs))
      if (directoryState === 'error') {
        await route.fulfill({ status: 503, json: { data: { code: 'SYS_EXTERNAL_SERVICE_ERROR', message: 'Synthetic failure', requestId: 'guru-browser-fixture' } } })
        return
      }
      if (directoryState === 'empty') {
        await route.fulfill({ json: {
          data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
          facets: { styles: [], managerTypes: [], sectors: [] },
        } })
        return
      }
      await route.fulfill({ json: {
        data: [{ profile, cik: '0001067983', directoryOrder: 0, followerCount: 42, followedByMe: false, latest: portfolio }],
        pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
        facets: { styles: ['Quality', 'Value'], managerTypes: ['Public Company'], sectors: ['Technology'] },
      } })
      return
    }
    const overviewPortfolio = overviewState === 'ready' ? portfolio : {
      ...portfolio, status: 'PARTIAL', reportedValueUsd: null, holdingCount: null,
      topFiveConcentrationPercent: null, topTenConcentrationPercent: null, hhi: null,
      turnoverPercent: null, turnoverBand: null, actionCounts: { new: 0, add: 0, reduce: 0, exit: 0 },
      largestPosition: null, topHoldings: [], sectorAllocation: [],
    }
    await route.fulfill({ json: { data: {
      profile, cik: '0001067983', followerCount: 42, followedByMe: false,
      latest: overviewPortfolio,
      latestMoves: overviewState === 'ready' ? [{
        positionKey: 'sec:1:SH', securityId: '1', ticker: 'SYN', company: 'Synthetic Systems', action: 'ADD',
        previousQuantity: '700', currentQuantity: '1000', quantityChange: '300', quantityChangePercent: '42.85714286',
        previousWeightPercent: '22', currentWeightPercent: '30', previousRank: 2, currentRank: 1,
      }] : [],
      history: [portfolio, { ...portfolio, periodEnd: '2026-03-31', reportedValueUsd: '900000000', filedAt: '2026-05-14T20:00:00.000Z' }],
      source: { accession: '0001067983-26-000001', form: '13F-HR', periodEnd, filedAt: timestamp, sourceUrl: 'https://www.sec.gov/Archives/fixture/0001067983-26-000001' },
      aiSummaryState: 'NOT_GENERATED',
    } } })
  })

  await mkdir('docs/design/evidence/guru-discovery', { recursive: true })
  await page.goto('/')
  await selectLocale(page, 'en')
  directoryDelayMs = 250
  await page.goto('/gurus')
  await expect(page.getByRole('status')).toContainText('Loading tracked investors…')
  await expect(page.getByTestId('guru-card')).toBeVisible()
  directoryDelayMs = 0
  for (const [locale, title] of [
    ['zh-TW', '發掘投資大師'],
    ['zh-CN', '发现投资大师'],
    ['en', 'Discover great investors'],
  ] as const) {
    await page.goto('/gurus')
    await selectLocale(page, locale)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('note')).toContainText('13F')
    await expect(page.getByTestId('guru-card')).toContainText('Warren Buffett')
    if (locale === 'zh-TW') await page.screenshot({ path: 'docs/design/evidence/guru-discovery/directory-desktop.png', fullPage: true })
    await page.getByTestId('guru-card').getByRole('link', { name: 'Warren Buffett', exact: true }).click()
    await expect(page).toHaveURL(/\/gurus\/warren-buffett$/)
    await expect(page.getByRole('heading', { name: 'Warren Buffett', exact: true })).toBeVisible()
    await expect(page.getByText('0001067983')).toBeVisible()
    await expect(page.getByText('Synthetic Systems').first()).toBeVisible()
    if (locale === 'zh-TW') await page.screenshot({ path: 'docs/design/evidence/guru-discovery/overview-desktop.png', fullPage: true })
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gurus')
  await expect(page.getByRole('heading', { name: 'Discover great investors', exact: true })).toBeVisible()
  await expect(page.getByTestId('guru-card')).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/guru-discovery/directory-mobile.png', fullPage: true })

  directoryState = 'empty'
  await page.reload()
  await expect(page.getByText('No investors have been added yet.', { exact: true })).toBeVisible()
  directoryState = 'error'
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Investor data is temporarily unavailable.')
  directoryState = 'ready'
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByTestId('guru-card')).toBeVisible()
  overviewState = 'partial'
  await page.getByTestId('guru-card').getByRole('link', { name: 'Warren Buffett', exact: true }).click()
  await expect(page.getByText('The latest quarter is not ready. Metrics and moves stay hidden until prepared data is ready.')).toBeVisible()
  await expect(page.getByText('US$1B', { exact: true })).toHaveCount(0)
})
