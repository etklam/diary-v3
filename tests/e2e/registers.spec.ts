import { randomUUID } from 'node:crypto'
import { expect, test, selectAccountLocale, selectLocale } from '../support/e2e'

const password = 'synthetic-registers-password'

async function signIn(page: import('@playwright/test').Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/new$/)
  await selectAccountLocale(page, 'en')
}

/**
 * The density ruling (ticket 120). A register is a measure, a rhythm and a
 * heading step, so it is only observable against a rendered page — which is why
 * the static check guards the *assignment* and these cases guard the effect.
 */
test('every register reaches the page it was assigned to', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `registers-${randomUUID()}@example.test`)
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value }
  const created = await page.request.post('/api/diaries', { headers, data: {
    date: '2026-01-02', title: 'A recorded judgment', content: 'The original reasoning, at length.',
    transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '1', price: '100', tradeDate: '2026-01-02T00:00:00Z' }],
  } })
  expect(created.status()).toBe(201)
  const diary = await created.json() as { id: string }

  const main = page.locator('main#main')
  for (const [path, register] of [['/stocks', 'ledger'], ['/diaries/quick', 'capture'], [`/diaries/${diary.id}`, 'reading']] as const) {
    await page.goto(path)
    await expect(main).toHaveAttribute('data-register', register)
  }
})

test('the capture register gives the writing area the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `registers-capture-${randomUUID()}@example.test`)
  await page.goto('/diaries/quick')
  const writing = page.locator('#quick-content')
  await expect(writing).toBeVisible()
  const box = (await writing.boundingBox())!
  // It was 280px tall in a 900px viewport, with roughly 550px of nothing under
  // it. The field is the subject of this page, so it takes the room.
  expect(box.height).toBeGreaterThan(400)
  // And it still ends at the writing measure rather than running the full
  // content width — the column carries the measure, not the textarea.
  expect(box.width).toBeLessThan(900)
  await page.locator('.quick-page').screenshot({ path: 'docs/design/evidence/registers/capture-1440.png' })
})

test('the reading register subordinates what is attached to the record', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `registers-reading-${randomUUID()}@example.test`)
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value }
  const created = await page.request.post('/api/diaries', { headers, data: {
    date: '2026-01-03', title: 'A recorded judgment', content: 'The original reasoning, at length.',
    transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '1', price: '100', tradeDate: '2026-01-03T00:00:00Z' }],
  } })
  expect(created.status()).toBe(201)
  const diary = await created.json() as { id: string }
  await page.goto(`/diaries/${diary.id}`)

  // What is attached to the entry is one group with one heading…
  const aside = page.getByRole('complementary', { name: 'Attached to this entry', exact: true })
  await expect(aside).toBeVisible()
  const size = (locator: ReturnType<typeof page.locator>) =>
    locator.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))
  // …and every module inside it is set below the record's own sections, so an
  // optional module no longer reads at the same rank as Transactions.
  const recordHeading = page.locator('.diary-reading-body h2').first()
  const moduleHeading = aside.locator('h2:not(.diary-aside-title), h3').first()
  expect(await size(moduleHeading)).toBeLessThan(await size(recordHeading))
  expect(await size(page.locator('.diary-aside-title'))).toBeLessThanOrEqual(await size(recordHeading))
  await page.locator('.diary-record').screenshot({ path: 'docs/design/evidence/registers/reading-1440.png' })

  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(aside).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.diary-record').screenshot({ path: `docs/design/evidence/registers/reading-${width}.png` })
  }
})
