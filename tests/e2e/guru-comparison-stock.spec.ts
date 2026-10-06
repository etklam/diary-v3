import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { selectLocale } from '../support/e2e.js'

const investors = [
  ['alpha', 'Alpha Investor', 'Alpha Capital'],
  ['beta', 'Beta Investor', 'Beta Partners'],
  ['gamma', 'Gamma Investor', 'Gamma Management'],
  ['delta', 'Delta Investor', 'Delta Fund'],
  ['epsilon', 'Epsilon Investor', 'Epsilon Capital'],
] as const

function profile(slug: string, name: string, managerName: string) {
  return { slug, name, managerName, description: null, investmentPhilosophy: null, styleTags: ['Value'], managerType: 'Hedge Fund', website: null, country: 'US', imageUrl: null, featured: false }
}

const directoryItem = (investor: typeof investors[number], index: number) => ({
  profile: profile(investor[0], investor[1], investor[2]), cik: String(100000 + index).padStart(10, '0'), directoryOrder: index,
  followerCount: index, followedByMe: false,
  latest: {
    periodEnd: '2026-06-30', filedAt: '2026-08-14T12:00:00.000Z', status: 'READY', reportedValueUsd: '1000000', holdingCount: 20,
    topFiveConcentrationPercent: '42', topTenConcentrationPercent: '60', hhi: '1210', turnoverPercent: '14', turnoverBand: 'LOW',
    actionCounts: { new: 1, add: 2, reduce: 1, exit: 0 }, largestPosition: null, topHoldings: [], sectorAllocation: [],
  },
})

const manager = (investor: typeof investors[number], _action: string) => ({
  profile: profile(investor[0], investor[1], investor[2]), status: 'READY', reportedValueUsd: '1000000', holdingCount: 20,
  topTenConcentrationPercent: '60', turnoverPercent: '14', sectorAllocation: [{ name: 'Technology', weightPercent: '32' }],
  actionCounts: { new: 1, add: 2, reduce: 1, exit: 0 },
  source: { form: '13F-HR', accession: '0000000001-26-000001', filedAt: '2026-08-14T12:00:00.000Z', sourceUrl: 'https://www.sec.gov/Archives/edgar/data/fixture' },
})

function member(investor: typeof investors[number], action: string, weight = '4.2') {
  return {
    guruSlug: investor[0], guruName: investor[1], action, currentQuantity: '1200000', previousQuantity: '800000',
    reportedValueUsd: '42000', weightPercent: weight, previousWeightPercent: '3.2', currentRank: 7,
  }
}

function comparison(slugs: string[]) {
  const selected = investors.filter(investor => slugs.includes(investor[0]))
  const actions = selected.map((investor, index) => member(investor, index === 0 ? 'STRONG_ADD' : index === 1 ? 'REDUCE' : 'UNCHANGED'))
  const commonPosition = {
    positionKey: 'SECURITY:1001:SH:NONE', securityId: '1001', ticker: 'T09', company: 'Synthetic Systems', securityType: 'EQUITY',
    quantityType: 'SH', putCall: null, heldByCount: selected.length, readyGuruCount: selected.length, selectedGuruCount: selected.length,
    commonOrUnique: selected.length > 1 ? 'COMMON' : 'UNIQUE', members: actions,
  }
  const uniquePosition = {
    ...commonPosition, positionKey: 'SECURITY:2002:SH:NONE', securityId: '2002', ticker: 'ONE', company: 'Single Position Co',
    heldByCount: 1, commonOrUnique: 'UNIQUE', members: selected.length ? [member(selected[0]!, 'NEW', '2.5')] : [],
  }
  const noRows = selected.length === 2 && selected.every(investor => investor[0] === 'delta' || investor[0] === 'epsilon')
  const positions = noRows ? [] : [commonPosition, uniquePosition]
  const exitMember = selected[1] ? {
    ...member(selected[1], 'EXIT', '0'), currentQuantity: null, reportedValueUsd: null, weightPercent: null, previousWeightPercent: '2.5',
  } : null
  const quarterMoves = noRows ? [] : [
    {
      positionKey: commonPosition.positionKey, securityId: commonPosition.securityId, ticker: commonPosition.ticker,
      company: commonPosition.company, quantityType: commonPosition.quantityType, putCall: null,
      members: actions.filter(item => item.action !== 'UNCHANGED'),
    },
    ...(exitMember ? [{ positionKey: 'SECURITY:3003:SH:NONE', securityId: '3003', ticker: 'OLD', company: 'Old Systems', quantityType: 'SH', putCall: null, members: [exitMember] }] : []),
  ]
  return {
    data: {
      periodEnd: '2026-06-30', source: 'SEC Form 13F', selectedGuruCount: selected.length, readyGuruCount: selected.length,
      managers: selected.map((investor, index) => manager(investor, index === 0 ? 'STRONG_ADD' : index === 1 ? 'REDUCE' : 'UNCHANGED')),
      positions, commonHoldings: noRows ? [] : [commonPosition], uniqueHoldings: noRows ? [] : [uniquePosition], quarterMoves,
      opposingActions: noRows ? [] : [{ positionKey: commonPosition.positionKey, securityId: commonPosition.securityId, ticker: commonPosition.ticker, company: commonPosition.company, members: actions }],
      periods: ['2026-06-30', '2026-03-31'],
    },
  }
}

test('compares two, three, and five Gurus; reports shared holdings, opposing actions, and empty quarters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.route('**/api/gurus/compare*', async route => {
    const slugs = new URL(route.request().url()).searchParams.get('slugs')?.split(',') ?? []
    await route.fulfill({ json: comparison(slugs) })
  })
  await page.route(/\/api\/gurus(?:\?.*)?$/, async route => {
    const url = new URL(route.request().url())
    const search = (url.searchParams.get('search') ?? '').toLocaleLowerCase()
    const data = investors.map(directoryItem).filter(item => `${item.profile.name} ${item.profile.managerName}`.toLocaleLowerCase().includes(search))
    await route.fulfill({ json: { data, pagination: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0 }, facets: { styles: ['Value'], managerTypes: ['Hedge Fund'], sectors: ['Technology'] } } })
  })

  await mkdir('docs/design/evidence/guru-comparison', { recursive: true })
  await page.goto('/gurus/compare')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Compare investors' })).toBeVisible()
  await expect(page.getByText('Choose two to five investors to start a comparison.')).toBeVisible()
  const searchInput = page.getByLabel('Search Guru or fund')
  const searchBounds = await searchInput.boundingBox()
  expect(searchBounds?.height ?? 1000).toBeLessThan(60)

  async function addInvestor(query: string, name: string, expectedCount: number) {
    await searchInput.fill(query)
    const row = page.locator('.guru-comparison-results li').filter({ hasText: name })
    await expect(row).toBeVisible()
    const request = expectedCount >= 2 ? page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/api/gurus/compare' && (url.searchParams.get('slugs')?.split(',').length ?? 0) === expectedCount
    }) : null
    await row.getByRole('button', { name: 'Add to comparison' }).click()
    if (request) await request
    await expect(page.getByRole('heading', { name: `Selected Gurus ${expectedCount}/5` })).toBeVisible()
  }

  await addInvestor('Alpha', 'Alpha Investor', 1)
  await addInvestor('Beta', 'Beta Investor', 2)
  await expect(page.getByRole('heading', { name: 'Common holdings' })).toBeVisible()
  await expect(page.locator('.guru-comparison-position-list').first()).toContainText('T09 · Synthetic Systems')
  await expect(page.locator('.guru-comparison-position-list').first()).toContainText('Held by 2/2')
  await expect(page.getByRole('heading', { name: 'Quarter moves' })).toBeVisible()
  await expect(page.locator('.guru-comparison-positions').filter({ has: page.getByRole('heading', { name: 'Quarter moves' }) })).toContainText('EXIT')
  await expect(page.locator('.guru-comparison-positions').last()).toContainText('STRONG ADD')
  await expect(page.locator('.guru-comparison-positions').last()).toContainText('REDUCE')
  await addInvestor('Gamma', 'Gamma Investor', 3)
  await expect(page.locator('.guru-comparison-position-list').first()).toContainText('Held by 3/3')
  await addInvestor('Delta', 'Delta Investor', 4)
  await addInvestor('Epsilon', 'Epsilon Investor', 5)
  await expect(page.getByRole('heading', { name: 'Selected Gurus 5/5' })).toBeVisible()
  await expect(page.locator('.guru-comparison-position-list').first()).toContainText('Held by 5/5')
  await page.screenshot({ path: 'docs/design/evidence/guru-comparison/compare-desktop.png', fullPage: true })

  await page.goto('/gurus/compare')
  await expect(page.getByText('Choose two to five investors to start a comparison.')).toBeVisible()
  await addInvestor('Delta', 'Delta Investor', 1)
  await addInvestor('Epsilon', 'Epsilon Investor', 2)
  await expect(page.getByText('No mapped positions are available for comparison in this quarter.').first()).toBeVisible()
  await expect(page.getByText('No opposing reported actions were found for this quarter.')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gurus/compare?gurus=alpha,beta')
  await expect(page.locator('.guru-comparison-position-list').first()).toContainText('Held by 2/2')
  await page.screenshot({ path: 'docs/design/evidence/guru-comparison/compare-mobile.png', fullPage: true })
})

const guruProfile = profile('synthetic-manager', 'Synthetic Manager', 'Synthetic Fund')
const holder = {
  profile: guruProfile, action: 'ADD', quantity: '100000', quantityChangePercent: '20', weightPercent: '10', previousWeightPercent: '8',
  source: { accession: '0000000001-26-000001', form: '13F-HR', filedAt: '2026-08-14T12:00:00.000Z', sourceUrl: 'https://www.sec.gov/Archives/edgar/data/fixture' },
}

function stockResearch(symbol: string, period: string | null) {
  const unresolved = symbol === 'ZZZ'
  const selectedPeriod = period ?? '2026-06-30'
  const pending = selectedPeriod === '2026-06-30'
  return { data: {
    summary: {
      symbol, mappingStatus: unresolved ? 'UNRESOLVED' : 'MATCHED', securityId: unresolved ? null : '1001', company: unresolved ? null : 'Synthetic Systems',
      sector: unresolved ? null : 'Technology', industry: unresolved ? null : 'Software', periodEnd: selectedPeriod,
      dataStatus: unresolved ? 'UNAVAILABLE' : pending ? 'PENDING' : 'READY', calculatedAt: pending || unresolved ? null : '2026-07-02T12:00:00.000Z',
      contextHash: pending || unresolved ? null : 'a'.repeat(64), activeGuruCount: pending || unresolved ? null : 5, readyGuruCount: pending || unresolved ? null : 3,
      quarterCoveragePercent: pending || unresolved ? null : '60', mappingCoveragePercent: pending || unresolved ? null : '92',
      currentHolderCount: pending || unresolved ? null : 1, averagePortfolioWeightPercent: pending || unresolved ? null : '10', weightBreadthPercent: pending || unresolved ? null : '33.3',
      newBuyerCount: pending || unresolved ? null : 1, addCount: pending || unresolved ? null : 2, reduceCount: pending || unresolved ? null : 1, exitCount: pending || unresolved ? null : 0,
      netBuyerCount: pending || unresolved ? null : 2, classification: pending || unresolved ? null : 'ACCUMULATION', source: 'SEC Form 13F',
    },
    currentHolders: unresolved || pending ? [] : [holder], latestMoves: unresolved || pending ? [] : [holder],
    history: unresolved ? [] : [
      { periodEnd: '2026-03-31', status: 'READY', activeGuruCount: 5, readyGuruCount: 4, quarterCoveragePercent: '80', mappingCoveragePercent: '95', holderCount: 1, weightBreadthPercent: '25', averagePortfolioWeightPercent: '8', netBuyerCount: 1, classification: 'ACCUMULATION' },
      { periodEnd: '2026-06-30', status: 'PENDING', activeGuruCount: null, readyGuruCount: null, quarterCoveragePercent: null, mappingCoveragePercent: null, holderCount: null, weightBreadthPercent: null, averagePortfolioWeightPercent: null, netBuyerCount: null, classification: null },
    ],
  } }
}

test('shows prepared stock Guru holders and history, and hides partial or unmapped data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.route('**/api/stocks/*/gurus*', async route => {
    const url = new URL(route.request().url())
    const symbol = url.pathname.split('/')[3] ?? ''
    const period = url.searchParams.get('period')
    await route.fulfill({ json: stockResearch(symbol, period) })
  })
  await mkdir('docs/design/evidence/guru-comparison', { recursive: true })
  await page.goto('/stocks/SYN/gurus')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'SYN · Guru ownership' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('13F holdings are delayed')
  await expect(page.getByText('This quarter is being rebuilt. Previous metrics are hidden until the rebuild completes.')).toBeVisible()
  await expect(page.locator('.stock-guru-metrics')).toHaveCount(0)

  const readyResponse = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/api/stocks/SYN/gurus' && url.searchParams.get('period') === '2026-03-31'
  })
  await page.getByRole('combobox', { name: 'Reported quarter' }).selectOption('2026-03-31')
  await readyResponse
  await expect(page.locator('.stock-guru-metrics')).toContainText('60%')
  await expect(page.getByRole('row', { name: /Synthetic Manager/ })).toContainText('ADD')
  await expect(page.getByRole('group', { name: /Guru holders/ })).toContainText('2026-03-31')
  await page.screenshot({ path: 'docs/design/evidence/guru-comparison/stock-gurus-desktop.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/design/evidence/guru-comparison/stock-gurus-mobile.png', fullPage: true })
  await page.goto('/stocks/ZZZ/gurus')
  await expect(page.getByText('No verified security mapping is available for this symbol yet.')).toBeVisible()
  await expect(page.locator('.stock-guru-metrics')).toHaveCount(0)
})
