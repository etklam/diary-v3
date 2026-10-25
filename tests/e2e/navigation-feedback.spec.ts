import { randomUUID } from 'node:crypto'
import { expect, test, selectAccountLocale, selectLocale } from '../support/e2e'

const password = 'synthetic-navigation-feedback-password'

async function signIn(page: import('@playwright/test').Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectAccountLocale(page, 'en')
}

/**
 * Holds a route's loader open so the pending window is observable. Without
 * this the whole navigation resolves inside the indicator's own 120ms delay,
 * which is the behaviour the delay exists to produce.
 */
async function holdArticlesLoader(page: import('@playwright/test').Page, ms: number) {
  await page.route(/\/articles\.data/, async route => {
    await new Promise(resolve => setTimeout(resolve, ms))
    await route.continue()
  })
}

test('a route change shows an indicator that costs no layout and announces its destination', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `navigation-feedback-${randomUUID()}@example.test`)
  await holdArticlesLoader(page, 1500)

  const sidebar = page.locator('.desktop-nav')
  const destination = sidebar.getByRole('link', { name: 'Public articles', exact: true })
  const origin = sidebar.getByRole('link', { name: 'Timeline', exact: true })
  const main = page.locator('main#main')
  const before = await main.boundingBox()
  expect(before).not.toBeNull()

  await destination.click()

  const indicator = page.getByTestId('route-progress')
  await expect(indicator).toBeVisible()
  // Fixed and over the chrome: the content region must not move when the
  // indicator appears, and must not move again when it leaves.
  expect(await indicator.evaluate(element => getComputedStyle(element).position)).toBe('fixed')
  expect(await main.boundingBox()).toEqual(before)

  // The clicked destination takes the selection treatment immediately, while
  // `aria-current` stays on the route that is still on screen.
  await expect(destination).toHaveAttribute('data-nav-pending', 'true')
  await expect(destination).not.toHaveAttribute('aria-current', 'page')
  await expect(origin).toHaveAttribute('aria-current', 'page')

  await expect(page).toHaveURL(/\/articles$/)
  await expect(indicator).toHaveCount(0)

  // One polite announcement naming the destination, which a client-side route
  // change otherwise produces no event for at all.
  const heading = (await page.locator('main#main h1').first().textContent())?.trim()
  expect(heading).toBeTruthy()
  await expect(page.getByTestId('route-announcement')).toHaveText(heading!)

  // The appear-and-leave pair, measured inside one shell. The navigation above
  // crosses from the workspace chrome to the public chrome, so its own content
  // region legitimately moves; this one does not change chrome at all, and the
  // region must hold its position at both edges of the indicator's life.
  // Document-relative, not viewport-relative: a navigation resets scroll, and
  // `boundingBox()` would report that as the content region having moved.
  const box = () =>
    main.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return {
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
        width: Math.round(rect.width),
      }
    })
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
  const resting = await box()
  await page.getByRole('search').locator('input[name="search"]').fill('synthetic-no-match')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(indicator).toBeVisible()
  expect(await box()).toEqual(resting)
  await expect(indicator).toHaveCount(0)
  expect(await box()).toEqual(resting)
})

test('a fast route change never flashes the indicator', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `navigation-fast-${randomUUID()}@example.test`)

  const sidebar = page.locator('.desktop-nav')
  const seen: boolean[] = []
  await sidebar.getByRole('link', { name: 'Calendar', exact: true }).click()
  // Sample across the whole navigation rather than once: an indicator that
  // appeared for a single frame would still be a flash.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    seen.push((await page.getByTestId('route-progress').count()) > 0)
    await page.waitForTimeout(20)
  }
  await expect(page).toHaveURL(/\/calendar$/)
  expect(seen.some(Boolean)).toBe(false)
})

test('an in-flight submit keeps the control at the same width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `navigation-submit-${randomUUID()}@example.test`)
  await page.goto('/settings')

  const save = page.getByRole('button', { name: 'Save preferences', exact: true })
  await expect(save).toBeEnabled()
  // A fresh account has no investment targets, and those fields are required,
  // so the form would never reach a submit at all.
  await page.getByLabel('Expected monthly trades', { exact: true }).fill('4')
  await page.getByLabel('Expected profit amount', { exact: true }).fill('1000.00')
  await page.getByLabel('Expected average holding amount', { exact: true }).fill('5000.00')
  // Recorded from inside the page rather than polled from outside it: a submit
  // that resolves in 80ms is exactly the case this has to measure, and polling
  // can step straight over it. Every mutation of the control is sampled, so a
  // width that changed for one frame would still be caught.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.settings-actions button')
    if (!button) throw new Error('save control not found')
    const log: Array<{ busy: string | null; width: number; text: string }> = []
    const record = () =>
      log.push({
        busy: button.getAttribute('aria-busy'),
        width: button.getBoundingClientRect().width,
        text: button.textContent ?? '',
      })
    record()
    new MutationObserver(record).observe(button, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    })
    ;(window as unknown as { pendingLog: typeof log }).pendingLog = log
  })
  await save.click()
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()

  const log = await page.evaluate(
    () => (window as unknown as { pendingLog: Array<{ busy: string | null; width: number; text: string }> }).pendingLog,
  )
  expect(log.length).toBeGreaterThan(1)
  // It did go in flight…
  expect(log.some(entry => entry.busy === 'true')).toBe(true)
  // …the label was never swapped for "Working…", so the action row cannot
  // reflow at the moment the reader is watching it…
  expect(log.every(entry => entry.text.startsWith('Save preferences'))).toBe(true)
  expect(new Set(log.map(entry => entry.width)).size).toBe(1)
  // …and the pending state still reached assistive technology.
  expect(log.some(entry => entry.busy === 'true' && entry.text.includes('Working…'))).toBe(true)
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the indicator is still present and does not animate', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signIn(page, `navigation-reduced-${randomUUID()}@example.test`)
    await holdArticlesLoader(page, 1500)

    await page.locator('.desktop-nav').getByRole('link', { name: 'Public articles', exact: true }).click()
    const indicator = page.getByTestId('route-progress')
    await expect(indicator).toBeVisible()
    // A static rule across the whole width, not the absence of feedback: the
    // sweep parked off the end of its own animation would be invisible.
    const bar = await indicator.evaluate(element => {
      const style = getComputedStyle(element, '::after')
      return { animation: style.animationName, width: style.width, host: element.getBoundingClientRect().width }
    })
    expect(bar.animation).toBe('none')
    expect(Number.parseFloat(bar.width)).toBeCloseTo(bar.host, 0)
    await expect(page).toHaveURL(/\/articles$/)
  })
})
