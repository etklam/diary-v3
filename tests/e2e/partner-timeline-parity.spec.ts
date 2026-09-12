import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, selectLocale, selectTheme, signOut, test } from '../support/e2e'

const password = 'synthetic-timeline-parity-password'

type Csrf = { 'x-csrf-token': string }

async function registerAndLogin(page: Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
}

async function csrf(page: Page): Promise<Csrf> {
  // An SSR-authenticated page never issues a client-side /api GET, so the CSRF
  // cookie may not exist yet; one bounded read establishes it.
  let cookies = await page.context().cookies()
  if (!cookies.some(item => item.name === 'csrf-token')) {
    await page.request.get('/api/auth/me')
    cookies = await page.context().cookies()
  }
  const cookie = cookies.find(item => item.name === 'csrf-token')
  expect(cookie?.value, JSON.stringify(cookies.map(c => c.name))).toBeTruthy()
  return { 'x-csrf-token': cookie!.value }
}

async function startSession(page: Page) {
  const email = `parity-a-${randomUUID()}@example.test`
  await registerAndLogin(page, email)
  await page.goto('/timeline')
  await selectLocale(page, 'en')
  return email
}

/** Invite the already signed-in `second` account, accept, and let the partner share diaries. */
async function connect(page: Page, second: Page, emailB: string) {
  const invited = await page.request.post('/api/partners', { headers: await csrf(page), data: { partnerEmail: emailB } })
  expect(invited.status(), await invited.text()).toBe(200)
  const { link } = await invited.json() as { link: { id: string; partner: { id: string } } }
  expect((await second.request.post(`/api/partners/${link.id}/accept`, { headers: await csrf(second) })).status()).toBe(200)
  expect((await second.request.put(`/api/partners/${link.id}/sharing`, { headers: await csrf(second), data: { shareDiaries: true } })).status()).toBe(200)
  return { partnerId: link.partner.id, linkId: link.id }
}

async function createDiary(page: Page, input: { date: string; title: string; content: string; tags?: string[] }) {
  const response = await page.request.post('/api/diaries', { headers: await csrf(page), data: input })
  expect(response.status()).toBe(201)
  return await response.json() as { id: string }
}

const longContent = `${'Long observation. '.repeat(160)}\n\n| Column A | Column B | Column C | Column D | Column E |\n| --- | --- | --- | --- | --- |\n| wide | table | stays | inside | container |\n\nFinal marker for expanded reading.`

test('timeline switches into a date-paired partner comparison and back @webkit-critical', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startSession(page)
  const otherContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const other = await otherContext.newPage()
  const emailB = `parity-b-${randomUUID()}@example.test`
  await registerAndLogin(other, emailB)
  await connect(page, other, emailB)
  const bHeaders = await csrf(other)
  await createDiary(page, { date: '2026-09-10', title: 'Mine on the tenth', content: 'My tenth observation', tags: ['planning'] })
  await other.request.post('/api/diaries', { headers: bHeaders, data: { date: '2026-09-10', title: 'Partner on the tenth', content: longContent } })
  await other.request.post('/api/diaries', { headers: bHeaders, data: { date: '2026-09-09', title: 'Partner only day', content: 'Only the partner wrote here.' } })
  await createDiary(page, { date: '2026-09-08', title: 'Mine alone on the eighth', content: 'Only I wrote here.' })

  await page.goto('/timeline?dateFrom=2026-09-01')
  await expect(page.getByTestId('timeline-entry').first()).toBeVisible()
  await page.getByTestId('timeline-modes').getByRole('link', { name: 'Partner comparison', exact: true }).click()
  await expect(page).toHaveURL(/\/partners\/compare$/)
  // The comparison reads as the timeline context: diary navigation stays present,
  // the switch marks the current mode, and exactly one sidebar destination is current.
  await expect(page.locator('.desktop-nav').getByRole('link', { name: 'Timeline', exact: true })).toBeVisible()
  await expect(page.getByTestId('timeline-modes').getByRole('link', { name: 'Partner comparison', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('timeline-modes').getByRole('link', { name: 'My timeline', exact: true })).not.toHaveAttribute('aria-current')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Timeline')

  const days = page.getByTestId('compare-day')
  await expect(days).toHaveCount(3)
  await expect(days.nth(0).locator('time')).toHaveText('2026-09-10')
  await expect(days.nth(1).locator('time')).toHaveText('2026-09-09')
  await expect(days.nth(2).locator('time')).toHaveText('2026-09-08')
  // Both sides of a date share the group; neither side is a separate ordered stream.
  await expect(days.nth(0).getByTestId('owner-diary')).toContainText('My tenth observation')
  await expect(days.nth(0).getByTestId('partner-diary')).toContainText('Partner on the tenth')
  await expect(days.nth(1).getByTestId('owner-diary')).toContainText('No diary on this day.')
  await expect(days.nth(2).getByTestId('partner-diary')).toContainText('No diary on this day.')
  // Own side keeps the ordinary reading and editing entrances; partner content stays read only.
  await expect(days.nth(0).getByTestId('owner-diary').getByRole('link', { name: 'Read diary', exact: true })).toHaveAttribute('href', /\/diaries\/\d+$/)
  await expect(days.nth(0).getByTestId('owner-diary').getByRole('link', { name: 'Edit diary', exact: true })).toBeVisible()
  await expect(days.nth(0).getByTestId('partner-diary').getByRole('link')).toHaveCount(0)
  await expect(page.locator('.pair-page')).not.toContainText(emailB)

  // Long shared content stays collapsed with a keyboard-operable expansion; wide tables never stretch the page.
  const partnerBody = days.nth(0).getByTestId('partner-diary')
  const expand = partnerBody.getByRole('button', { name: 'Show all of this entry', exact: true })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(partnerBody.locator('.safe-markdown')).not.toContainText('Final marker for expanded reading.')
  await expand.click()
  await expect(partnerBody.locator('.safe-markdown')).toContainText('Final marker for expanded reading.')
  await expect(partnerBody.getByRole('button', { name: 'Show less', exact: true })).toHaveAttribute('aria-expanded', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.locator('.pair-page').screenshot({ path: 'docs/design/evidence/partner-timeline-parity/compare-1440.png' })
  await days.nth(2).screenshot({ path: 'docs/design/evidence/partner-timeline-parity/compare-1440-missing-partner.png' })

  // Switching back keeps the reader's filters, and browser back re-opens the comparison.
  await page.getByTestId('timeline-modes').getByRole('link', { name: 'My timeline', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline\?dateFrom=2026-09-01$/)
  await expect(page.getByTestId('timeline-entry').first()).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/partners\/compare$/)
  await expect(days.nth(0)).toBeVisible()
  await otherContext.close()
})

test('mobile comparison stacks both sides inside each date @webkit-critical', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startSession(page)
  const otherContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const other = await otherContext.newPage()
  const emailB = `parity-b-${randomUUID()}@example.test`
  await registerAndLogin(other, emailB)
  await connect(page, other, emailB)
  const bHeaders = await csrf(other)
  await createDiary(page, { date: '2026-09-10', title: 'Mobile mine', content: 'My mobile observation' })
  await other.request.post('/api/diaries', { headers: bHeaders, data: { date: '2026-09-10', title: 'Mobile partner', content: 'Partner mobile observation' } })
  await page.goto('/partners/compare')
  const day = page.getByTestId('compare-day').first()
  await expect(day.getByTestId('owner-diary')).toContainText('My mobile observation')
  const mine = await day.getByTestId('owner-diary').boundingBox()
  const theirs = await day.getByTestId('partner-diary').boundingBox()
  expect(mine).toBeTruthy()
  expect(theirs!.y).toBeGreaterThanOrEqual(mine!.y + mine!.height - 1)
  expect(Math.abs(theirs!.x - mine!.x)).toBeLessThan(8)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await selectTheme(page, 'dark')
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await page.locator('.pair-page').screenshot({ path: 'docs/design/evidence/partner-timeline-parity/compare-390-dark.png' })
  await otherContext.close()
})

test('a late response from the previous partner never overrides the current selection', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startSession(page)
  const bContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } }), cContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const b = await bContext.newPage(), cPage = await cContext.newPage()
  const emailB = `parity-b-${randomUUID()}@example.test`, emailC = `parity-c-${randomUUID()}@example.test`
  await registerAndLogin(b, emailB)
  await registerAndLogin(cPage, emailC)
  const { partnerId: bId } = await connect(page, b, emailB)
  const { partnerId: cId } = await connect(page, cPage, emailC)
  const bHeaders = await csrf(b), cHeaders = await csrf(cPage)
  await b.request.post('/api/diaries', { headers: bHeaders, data: { date: '2026-09-10', title: 'B diary', content: 'Written by partner B' } })
  await cPage.request.post('/api/diaries', { headers: cHeaders, data: { date: '2026-09-11', title: 'C diary', content: 'Written by partner C' } })
  await page.goto(`/partners/compare?partnerId=${bId}`)
  await selectLocale(page, 'en')
  await expect(page.getByTestId('partner-diary')).toContainText('Written by partner B')

  let releaseB: () => void = () => {}
  const gate = new Promise<void>(resolve => { releaseB = resolve })
  await page.route(`**/api/partners/compare?*partnerId=${bId}*`, async route => {
    const response = await route.fetch()
    await gate
    await route.fulfill({ response }).catch(() => {})
  })
  await page.getByRole('combobox', { name: 'Partner', exact: true }).selectOption(cId)
  await expect(page.getByTestId('partner-diary')).toContainText('Written by partner C')
  releaseB()
  await page.waitForTimeout(300)
  await expect(page.getByTestId('partner-diary')).toContainText('Written by partner C')
  await expect(page.getByTestId('partner-diary')).not.toContainText('Written by partner B')
  await expect(page.getByTestId('partner-diary')).not.toContainText('B diary')
  await page.unroute(`**/api/partners/compare?*partnerId=${bId}*`)
  await bContext.close()
  await cContext.close()
})

test('comparison states separate no partner, pending invitation and login return with selection', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const email = `parity-state-${randomUUID()}@example.test`
  await registerAndLogin(page, email)
  await page.goto('/partners/compare')
  await selectLocale(page, 'en')
  await expect(page.getByText('Connect with a partner to compare diaries.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Manage partners', exact: true })).toBeVisible()
  await expect(page.getByTestId('timeline-modes')).toBeVisible()
  await page.locator('.pair-page').screenshot({ path: 'docs/design/evidence/partner-timeline-parity/compare-no-partner.png' })

  const otherContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const other = await otherContext.newPage()
  const otherEmail = `parity-invited-${randomUUID()}@example.test`
  await registerAndLogin(other, otherEmail)
  const invited = await page.request.post('/api/partners', { headers: await csrf(page), data: { partnerEmail: otherEmail } })
  const { link } = await invited.json() as { link: { id: string } }
  await page.goto('/partners/compare')
  await expect(page.getByTestId('compare-pending')).toBeVisible()
  await other.request.post(`/api/partners/${link.id}/accept`, { headers: await csrf(other) })
  await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click()
  await expect(page.getByText('Your partner has not shared diaries.', { exact: true })).toBeVisible()

  await signOut(page)
  await page.goto('/partners/compare?partnerId=42&limit=40')
  await page.locator('.pair-page').getByRole('link', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/partners\/compare\?partnerId=42&limit=40$/)
  await otherContext.close()
})

test('sharing withdrawal and unlinking remove partner content on revalidation', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startSession(page)
  const otherContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const other = await otherContext.newPage()
  const emailB = `parity-b-${randomUUID()}@example.test`
  await registerAndLogin(other, emailB)
  const { partnerId: bId } = await connect(page, other, emailB)
  const bHeaders = await csrf(other)
  await other.request.post('/api/diaries', { headers: bHeaders, data: { date: '2026-09-10', title: 'Shared before withdrawal', content: 'Partner visible marker' } })
  await createDiary(page, { date: '2026-09-10', title: 'Mine on the same day', content: 'My own entry stays readable' })
  await other.goto('/partners')
  await selectLocale(other, 'en')
  await page.goto(`/partners/compare?partnerId=${bId}`)
  await selectLocale(page, 'en')
  await expect(page.getByTestId('partner-diary')).toContainText('Partner visible marker')

  // The partner turns sharing off; a revalidation must drop every rendered trace.
  await other.getByRole('button', { name: 'Stop sharing my diaries', exact: true }).click()
  await expect(other.getByRole('button', { name: 'Share my diaries', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click()
  await expect(page.getByText('Your partner has not shared diaries.', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('owner-diary')).toContainText('My own entry stays readable')
  await expect(page.getByTestId('partner-diary')).toContainText('Your partner has not shared diaries.')
  await expect(page.locator('.pair-page')).not.toContainText('Partner visible marker')
  await expect(page.locator('.pair-page')).not.toContainText('Shared before withdrawal')

  // Removing the connection entirely moves an explicit selection to the removed state.
  other.once('dialog', dialog => dialog.accept())
  await other.getByRole('button', { name: 'Remove connection', exact: true }).click()
  await expect(other.getByTestId('partner')).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click()
  await expect(page.getByText('This partner connection is no longer available.')).toBeVisible()
  await expect(page.locator('.pair-page')).not.toContainText(emailB)
  await otherContext.close()
})

test('explicit sign-out clears rendered comparison content in the tab', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startSession(page)
  const otherContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const other = await otherContext.newPage()
  const emailB = `parity-b-${randomUUID()}@example.test`
  await registerAndLogin(other, emailB)
  await connect(page, other, emailB)
  await other.request.post('/api/diaries', { headers: await csrf(other), data: { date: '2026-09-10', title: 'Before logout', content: 'Content that must not survive logout' } })
  await page.goto('/partners/compare')
  await selectLocale(page, 'en')
  await expect(page.getByTestId('partner-diary')).toContainText('Content that must not survive logout')
  await signOut(page)
  // The revision bump remounts the route: rendered partner content is dropped immediately.
  await expect(page.getByTestId('compare-day')).toHaveCount(0)
  await expect(page.getByText('Content that must not survive logout')).toHaveCount(0)
  await otherContext.close()
})

test('comparison labels spot-check across the three locales', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startSession(page)
  const otherContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const other = await otherContext.newPage()
  const emailB = `parity-b-${randomUUID()}@example.test`
  await registerAndLogin(other, emailB)
  await connect(page, other, emailB)
  await other.request.post('/api/diaries', { headers: await csrf(other), data: { date: '2026-09-10', title: 'Locale partner entry', content: 'Shared body' } })
  await page.goto('/partners/compare')
  for (const [locale, heading, mine, mode] of [
    ['zh-TW', '日記對照', '我的日記', '伙伴對照'],
    ['zh-CN', '日记对照', '我的日记', '伙伴对照'],
    ['en', 'Pair View', 'My diary', 'Partner comparison'],
  ] as const) {
    await selectLocale(page, locale)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.getByTestId('timeline-modes').getByRole('link', { name: mode, exact: true })).toBeVisible()
    await expect(page.getByTestId('owner-diary').getByText(mine, { exact: true })).toBeVisible()
  }
  await otherContext.close()
})
