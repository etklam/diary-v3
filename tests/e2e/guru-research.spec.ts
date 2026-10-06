import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { selectLocale } from '../support/e2e.js'

const slug = 'synthetic-guru'
const sourceQ1 = { accession: '0000000001-26-000001', sourceUrl: 'https://www.sec.gov/Archives/fixture/0000000001-26-000001' }
const sourceQ2 = { accession: '0000000001-26-000002', sourceUrl: 'https://www.sec.gov/Archives/fixture/0000000001-26-000002' }
const profile = {
  name: 'Warren Buffett', managerName: 'Berkshire Hathaway', slug,
  description: 'Synthetic browser fixture.', investmentPhilosophy: 'Long-term ownership.', styleTags: ['Value'],
  managerType: 'Public Company', website: 'https://berkshire.example.test', country: 'US', imageUrl: null, featured: true,
}
const period = (periodEnd: string, accession: string, reportedValueUsd: string, holdingCount: number, sourceUrl: string) => ({
  periodEnd, filedAt: `${periodEnd}T20:00:00.000Z`, status: 'READY', reportedValueUsd, holdingCount,
  topFiveConcentrationPercent: '80.00000000', topTenConcentrationPercent: '100.00000000', hhi: '0.50000000',
  turnoverPercent: '12.00000000', turnoverBand: 'MODERATE',
  actionCounts: { new: 1, add: 1, reduce: 0, exit: 1 },
  largestPosition: { positionKey: 'SECURITY:1:SH:NONE', securityId: '1', ticker: 'SYN', company: 'Synthetic Systems', quantityType: 'SH', putCall: null, quantity: '1200.00000000', reportedValueUsd: '700000.00000000', weightPercent: '70.00000000', rank: 1 },
  topHoldings: [], sectorAllocation: [{ name: 'Technology', reportedValueUsd: '1000000.00000000', weightPercent: '100.00000000' }],
  mappingCoveragePercent: '100.00000000', accession, form: '13F-HR', sourceUrl,
})
const q1 = period('2026-03-31', sourceQ1.accession, '800000.00000000', 2, sourceQ1.sourceUrl)
const q2 = period('2026-06-30', sourceQ2.accession, '1000000.00000000', 2, sourceQ2.sourceUrl)
const holding = (input: {
  ticker: string; company: string; positionKey: string; securityId: string; action: 'NEW' | 'STRONG_ADD' | 'EXIT';
  quantity: string | null; value: string | null; weight: string | null; rank: number | null;
  previousQuantity: string | null; change: string; changePercent: string | null; previousWeight: string | null;
  weightChange: string | null; previousRank: number | null; rankChange: number | null; sources: typeof sourceQ1[];
}) => ({
  positionKey: input.positionKey, securityId: input.securityId, ticker: input.ticker, company: input.company,
  sector: 'Technology', industry: 'Software', securityType: 'Common Stock', quantityType: 'SH', putCall: null,
  action: input.action, quantity: input.quantity, reportedValueUsd: input.value, weightPercent: input.weight, rank: input.rank,
  previousQuantity: input.previousQuantity, quantityChange: input.change, quantityChangePercent: input.changePercent,
  previousWeightPercent: input.previousWeight, weightChangePercentagePoints: input.weightChange,
  previousRank: input.previousRank, rankChange: input.rankChange, sources: input.sources,
})
const syn = holding({ ticker: 'SYN', company: 'Synthetic Systems', positionKey: 'SECURITY:1:SH:NONE', securityId: '1', action: 'STRONG_ADD', quantity: '1200.00000000', value: '700000.00000000', weight: '70.00000000', rank: 1, previousQuantity: '700.00000000', change: '500.00000000', changePercent: '71.42857143', previousWeight: '62.50000000', weightChange: '7.50000000', previousRank: 1, rankChange: 0, sources: [sourceQ1, sourceQ2] })
const fresh = holding({ ticker: 'NEW', company: 'New Synthetic Systems', positionKey: 'SECURITY:2:SH:NONE', securityId: '2', action: 'NEW', quantity: '1000.00000000', value: '300000.00000000', weight: '30.00000000', rank: 2, previousQuantity: null, change: '1000.00000000', changePercent: null, previousWeight: null, weightChange: null, previousRank: null, rankChange: null, sources: [sourceQ2] })
const exited = holding({ ticker: 'OLD', company: 'Old Synthetic Labs', positionKey: 'SECURITY:3:SH:NONE', securityId: '3', action: 'EXIT', quantity: null, value: null, weight: null, rank: null, previousQuantity: '300.00000000', change: '-300.00000000', changePercent: '-100.00000000', previousWeight: '37.50000000', weightChange: '-37.50000000', previousRank: 2, rankChange: null, sources: [sourceQ1, sourceQ2] })

test('browses Guru portfolio research, history, activity and exports across desktop and mobile', async ({ page }) => {
  await page.route('**/api/gurus/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/portfolio.csv') || path.endsWith('/changes.csv') || path.endsWith('/position-history.csv')) {
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="synthetic.csv"' }, body: '"ticker","action"\r\n"SYN","STRONG_ADD"\r\n' })
      return
    }
    if (path === `/api/gurus/${slug}/portfolio`) {
      const selected = url.searchParams.get('period') === '2026-03-31' ? q1 : q2
      const all = selected.periodEnd === q1.periodEnd ? [
        holding({ ticker: 'SYN', company: 'Synthetic Systems', positionKey: 'SECURITY:1:SH:NONE', securityId: '1', action: 'NEW', quantity: '700.00000000', value: '500000.00000000', weight: '62.50000000', rank: 1, previousQuantity: null, change: '700.00000000', changePercent: null, previousWeight: null, weightChange: null, previousRank: null, rankChange: null, sources: [sourceQ1] }),
      ] : [syn, fresh]
      const search = url.searchParams.get('search')?.toLowerCase()
      const sector = url.searchParams.get('sector')
      const increased = url.searchParams.get('increasedOnly') === 'true'
      const newOnly = url.searchParams.get('newOnly') === 'true'
      const holdings = all.filter(row => (!search || `${row.ticker} ${row.company}`.toLowerCase().includes(search))
        && (!sector || row.sector === sector)
        && (!increased || ['ADD', 'STRONG_ADD'].includes(row.action))
        && (!newOnly || row.action === 'NEW'))
      await route.fulfill({ json: { data: { profile, quarter: selected, periods: [q2, q1], holdings } } })
      return
    }
    if (path === `/api/gurus/${slug}/changes`) {
      await route.fulfill({ json: { data: { profile, quarter: q2, periods: [q2, q1], newPositions: [fresh], increasedPositions: [syn], reducedPositions: [], exitedPositions: [exited], largestWeightChanges: [exited, syn], largestRankChanges: [syn] } } })
      return
    }
    if (path === `/api/gurus/${slug}/history`) {
      await route.fulfill({ json: { data: { profile, periods: [q2, q1] } } })
      return
    }
    if (path === `/api/gurus/${slug}/position-history`) {
      await route.fulfill({ json: { data: { profile, positionKey: 'SECURITY:1:SH:NONE', ticker: 'SYN', company: 'Synthetic Systems', history: [
        { periodEnd: '2026-06-30', action: 'STRONG_ADD', quantity: '1200.00000000', reportedValueUsd: '700000.00000000', weightPercent: '70.00000000', rank: 1, source: [sourceQ2] },
        { periodEnd: '2026-03-31', action: 'NEW', quantity: '700.00000000', reportedValueUsd: '500000.00000000', weightPercent: '62.50000000', rank: 1, source: [sourceQ1] },
      ] } } })
      return
    }
    if (path === `/api/gurus/${slug}/filings`) {
      await route.fulfill({ json: { data: { profile, filings: [{ accession: sourceQ2.accession, periodEnd: '2026-06-30', form: '13F-HR', filingDate: '2026-08-14', filedAt: '2026-08-14T20:00:00.000Z', status: 'READY', amendmentNumber: null, amendmentType: null, parserVersion: 'synthetic-parser-v1', mappingCoveragePercent: '100.00000000', sourceUrl: sourceQ2.sourceUrl, documents: [{ basename: 'information-table.xml', documentType: '13F Information Table', description: 'Synthetic filing source', sourceUrl: `${sourceQ2.sourceUrl}/information-table.xml` }], effectiveOperations: [{ operation: 'ORIGINAL', parserVersion: 'synthetic-parser-v1' }] }] } } })
      return
    }
    if (path === '/api/gurus/activity') {
      await route.fulfill({ json: { data: { items: [{ guru: profile, periodEnd: '2026-06-30', ticker: 'SYN', company: 'Synthetic Systems', sector: 'Technology', action: 'STRONG_ADD', quantityChangePercent: '71.42857143', currentWeightPercent: '70.00000000', previousWeightPercent: '62.50000000', source: [sourceQ2] }], pagination: { page: 1, limit: 30, total: 1, totalPages: 1 } } } })
      return
    }
    await route.fulfill({ status: 404, json: { error: 'unhandled guru fixture route' } })
  })

  await mkdir('docs/design/evidence/guru-research', { recursive: true })
  await page.goto('/')
  await selectLocale(page, 'en')
  await page.goto(`/gurus/${slug}/portfolio`)
  await expect(page.getByRole('heading', { name: 'Warren Buffett' })).toBeVisible()
  await expect(page.getByText('Synthetic Systems').first()).toBeVisible()
  await expect(page.getByRole('note')).toContainText('13F holdings are delayed')
  await expect(page.locator('.guru-research-table thead')).toContainText('QoQ share change')
  await expect(page.locator('.guru-research-table thead')).toContainText('QoQ weight change (pp)')
  await expect(page.locator('.guru-research-table thead')).toContainText('Put / call')
  await expect(page.locator('.guru-research-table thead')).toContainText('Previous rank')
  await expect(page.getByRole('row', { name: /SYN Synthetic Systems/ })).toContainText('1,200')
  await expect(page.getByRole('row', { name: /SYN Synthetic Systems/ })).not.toContainText('1,200.')
  const q1Portfolio = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === `/api/gurus/${slug}/portfolio` && url.searchParams.get('period') === '2026-03-31'
  })
  await page.getByLabel('Reported quarter').selectOption('2026-03-31')
  await q1Portfolio
  await expect(page).toHaveURL(/period=2026-03-31/)
  await expect(page.locator('.guru-research-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('row', { name: /SYN Synthetic Systems/ })).toContainText('700')
  const q2Portfolio = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === `/api/gurus/${slug}/portfolio` && url.searchParams.get('period') === '2026-06-30'
  })
  await page.goto(`/gurus/${slug}/portfolio?period=2026-06-30`)
  await q2Portfolio
  const searchedPortfolio = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === `/api/gurus/${slug}/portfolio` && url.searchParams.get('search') === 'NEW'
  })
  await page.getByLabel('Search ticker or company').fill('NEW')
  await searchedPortfolio
  await expect(page.locator('.guru-research-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('row', { name: /NEW New Synthetic Systems/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /SYN Synthetic Systems/ })).toHaveCount(0)
  await page.getByLabel('Search ticker or company').fill('')
  const increasedPortfolio = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === `/api/gurus/${slug}/portfolio` && url.searchParams.get('increasedOnly') === 'true'
  })
  await page.getByLabel('Action filter').selectOption('__increased__')
  await increasedPortfolio
  await expect(page.locator('.guru-research-table tbody tr')).toHaveCount(1)
  await expect(page.getByRole('row', { name: /SYN Synthetic Systems/ })).toBeVisible()
  await page.getByLabel('Action filter').selectOption('')
  const downloadWait = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Export CSV' }).click()
  const download = await downloadWait
  expect(download.suggestedFilename()).toBe('synthetic.csv')
  await page.screenshot({ path: 'docs/design/evidence/guru-research/portfolio-desktop.png', fullPage: true })

  await page.goto(`/gurus/${slug}/changes`)
  await expect(page.getByRole('heading', { name: 'New positions' })).toBeVisible()
  await expect(page.getByText('NEW', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('STRONG ADD', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('EXIT', { exact: true }).first()).toBeVisible()

  await page.goto(`/gurus/${slug}/history`)
  await expect(page.getByRole('link', { name: '2026-06-30' }).first()).toBeVisible()
  await expect(page.getByText('Mapping coverage').first()).toBeVisible()
  await page.goto(`/gurus/${slug}/filings`)
  await expect(page.getByText(sourceQ2.accession)).toBeVisible()
  await page.locator('.guru-filing-list details summary').click()
  await expect(page.getByRole('link', { name: 'information-table.xml' })).toBeVisible()

  await page.goto('/gurus/activity')
  await expect(page.getByRole('heading', { name: 'Latest Guru moves' })).toBeVisible()
  await page.getByLabel('Ticker', { exact: true }).fill('SYN')
  await expect(page.getByText('Warren Buffett')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/gurus/${slug}/portfolio`)
  await expect(page.locator('.guru-research-cards')).toBeVisible()
  await expect(page.locator('.guru-research-cards .guru-research-card').first()).toContainText('Synthetic Systems')
  await page.locator('.guru-research-cards .guru-research-card').first().getByText('Position history').click()
  await expect(page.locator('.guru-research-cards')).toContainText(sourceQ2.accession)
  await page.screenshot({ path: 'docs/design/evidence/guru-research/portfolio-mobile.png', fullPage: true })
  const historyDownloadWait = page.waitForEvent('download')
  await page.locator('.guru-research-cards').getByRole('link', { name: 'Export CSV' }).click()
  expect((await historyDownloadWait).suggestedFilename()).toBe('synthetic.csv')
})
