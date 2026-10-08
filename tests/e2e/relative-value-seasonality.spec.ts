import { expect, test, selectLocale } from '../support/e2e'

test('relative value and seasonality preserve scoped history and real capture destinations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill('rotation-admin@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-rotation-admin-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/new$/)
  await expect(page.getByTestId('locale-select')).toBeEnabled()
  await selectLocale(page, 'en')

  await page.goto('/tools/relative-value')
  // The history region renders a chart when the ratio moves and says so when it
  // does not (ticket 113); either way it renders exactly one answer.
  const historyRegion = page.locator('section[aria-labelledby="relative-history-title"]')
  await expect(historyRegion.locator('.market-history-chart, .market-empty')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: 'Relative value', exact: true })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Primary price' }).first()).toBeVisible()
  // The ratio read states the formula with the symbols in it, which is where
  // the abstract "Primary ÷ comparison" line went (ticket 113).
  await expect(page.locator('.market-ratio-read')).toContainText('÷')
  // Ticket 113: the scenario action read "Use this ro" at 1440px — the column
  // was pushed out of its own scroll region. Measured, not screenshotted.
  const scenario = page.locator('.market-scenario-table')
  const firstAction = scenario.getByRole('button').first()
  await expect(firstAction).toBeVisible()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const fits = await scenario.evaluate(node => node.scrollWidth <= node.clientWidth + 1)
    if (width === 1440) expect(fits, 'the scenario table fits its column at 1440px').toBe(true)
    await scenario.evaluate(node => { node.scrollLeft = node.scrollWidth })
    const clipped = await firstAction.evaluate(node => {
      const region = node.closest('.market-scenario-table')!.getBoundingClientRect(), button = node.getBoundingClientRect()
      return button.right > region.right + 1 || button.left < region.left - 1
    })
    expect(clipped, `the scenario action is fully inside its region at ${width}px`).toBe(false)
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // Each quote control names what it fetches.
  await expect(page.getByRole('button', { name: 'Fetch primary quote', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fetch comparison quote', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fetch both quotes and history', exact: true })).toBeVisible()
  // The ratio and its inverse are stated once, in their own read. The history
  // table's column header is a different use of the word and stays.
  await expect(page.locator('.market-ratio-read').getByText('Current ratio', { exact: true })).toHaveCount(1)
  await expect(page.locator('section[aria-labelledby="relative-scenario-title"]').getByText('Current ratio', { exact: true })).toHaveCount(0)

  await page.screenshot({ path: 'docs/design/evidence/relative-value/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(historyRegion.locator('.market-history-chart, .market-empty')).toHaveCount(1)
  await page.screenshot({ path: 'docs/design/evidence/relative-value/mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  const capture = page.getByRole('region', { name: 'Research capture', exact: true })
  await capture.getByRole('button', { name: 'Capture this read', exact: true }).click()
  await expect(capture.getByRole('textbox', { name: 'Editable observation', exact: true })).toHaveValue(/# Relative value/)
  const evidenceSave = page.waitForResponse(response => response.url().includes('/api/stocks/GSPC/evidence') && response.request().method() === 'POST')
  await capture.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('evidence')
  await capture.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await evidenceSave).status()).toBe(200)
  await expect(capture.getByRole('status')).toHaveText('Saved.')

  await capture.getByRole('button', { name: 'Capture this read', exact: true }).click()
  await capture.getByRole('button', { name: 'Capture this read', exact: true }).click()
  await capture.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('diary-append')
  const diarySave = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.request().method() === 'POST')
  await capture.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await diarySave).status()).toBe(201)

  await page.goto('/tools/seasonality')
  await expect(page.getByRole('table')).toHaveCount(1)
  await page.clock.install({ time: new Date('2026-12-31T12:00:00.000Z') })
  await selectLocale(page, 'zh-TW')
  await expect(page.getByRole('region', { name: '目前月份' }).getByRole('heading', { name: '目前月份: 十二月', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '下個月份' }).getByRole('heading', { name: '下個月份: 一月', exact: true })).toBeVisible()
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { level: 1, name: 'Seasonality', exact: true })).toBeVisible()
  await expect(page.getByText('S&P 500 · monthly averages · 1950+', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Current month' }).getByRole('heading', { name: 'Current month: December', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Next month' }).getByRole('heading', { name: 'Next month: January', exact: true })).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(13)

  // Ticket 113: the region heading names the table, so "Monthly reference" is
  // printed once; the regions are panels, so the only bordered box left on the
  // page is the capture form.
  await expect(page.getByText('Monthly reference', { exact: true })).toHaveCount(1)
  const boxed = await page.locator('.market-research-page .market-research-section').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).borderTopWidth !== '0px').length)
  expect(boxed, 'no content region on this page is a card').toBe(0)

  // Value labels sit outside their bar and away from the zero line. The chart
  // has a fixed viewBox, so this geometry holds at every width.
  const labelFaults = await page.locator('.seasonality-chart svg').evaluate(svg => {
    const faults: string[] = []
    svg.querySelectorAll('g').forEach(group => {
      const bar = group.querySelector('rect'), labels = group.querySelectorAll('text')
      const value = labels[labels.length - 1]
      if (!bar || !value) return
      const box = (value as SVGGraphicsElement).getBBox()
      const negative = Number(bar.getAttribute('x')) < 420
      if (negative && box.x + box.width > 421) faults.push(`${value.textContent} crosses the zero line`)
      if (!negative && box.x < 419) faults.push(`${value.textContent} crosses the zero line`)
      if (box.x < 0 || box.x + box.width > 840) faults.push(`${value.textContent} leaves the plot`)
    })
    return faults
  })
  expect(labelFaults).toEqual([])
  await page.screenshot({ path: 'docs/design/evidence/seasonality/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/design/evidence/seasonality/mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  const seasonalityCapture = page.getByRole('region', { name: 'Research capture', exact: true })
  await seasonalityCapture.getByRole('button', { name: 'Capture this read', exact: true }).click()
  await expect(seasonalityCapture.getByRole('combobox', { name: 'Destination', exact: true })).toHaveValue('diary-append')
  const seasonalitySave = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.request().method() === 'POST')
  await seasonalityCapture.getByRole('button', { name: 'Save', exact: true }).click()
  expect((await seasonalitySave).status()).toBe(201)
  await selectLocale(page, 'zh-TW')
})


// Ticket 113: a flat line across a 680px frame is the same low-information
// chart presentation [105] removed from the performance page. A ratio that does
// not move is a fact, so it is stated; one that moves is still drawn.
test('a ratio that does not move is stated rather than drawn flat', async ({ page }) => {
  const series = (step: number) => Array.from({ length: 40 }, (_, index) => ({ timestamp: Date.UTC(2026, 0, index + 1) / 1000, close: 100 + index * step }))
  await page.route('**/api/market/historical**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(series(1)) }))
  await page.goto('/tools/relative-value')
  await selectLocale(page, 'en')
  const historyRegion = page.locator('section[aria-labelledby="relative-history-title"]')
  await expect(historyRegion).toContainText('The ratio did not change over this range')
  await expect(historyRegion.locator('.market-history-chart')).toHaveCount(0)
  // The dates are still reachable; only the drawing is withheld.
  await expect(historyRegion.getByText('History data', { exact: false }).first()).toBeVisible()

  await page.unroute('**/api/market/historical**')
  let call = 0
  await page.route('**/api/market/historical**', route => { call += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(series(call === 1 ? 2 : 1)) }) })
  await page.reload()
  await expect(historyRegion.locator('.market-history-chart')).toBeVisible()
  await expect(historyRegion).not.toContainText('The ratio did not change over this range')
})
