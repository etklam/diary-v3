import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, test, selectAccountLocale, selectLocale } from '../support/e2e'

const password = 'shell-confirmation-synthetic-password'

/**
 * Confirming the session is a chrome change, not a tree replacement. Each
 * scenario holds the confirming account read so the page can be worked on while
 * the session is still unresolved, then releases it and checks that nothing the
 * reader owns was rebuilt: before this behaviour existed, the swap unmounted
 * everything under `main` and handed back an empty surface.
 */
async function holdSessionConfirmation(page: Page) {
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/auth/me', async route => { await held; await route.continue() })
  return release
}

async function register(page: Page) {
  const email = `shell-${randomUUID()}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  return email
}

async function signIn(page: Page, email: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/\//g, '\\/')}$`))
  await selectAccountLocale(page, 'en')
}

test('a session confirming under a private page keeps its filters, disclosures and focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, await register(page), '/diaries')

  const release = await holdSessionConfirmation(page)
  await page.goto('/diaries')
  // Sign-out only renders for a session the shell has confirmed, so its absence
  // marks the window this ticket is about.
  await expect(page.getByTestId('sign-out')).toHaveCount(0)
  const advanced = page.locator('details[data-testid="diary-advanced"]')
  await advanced.locator(':scope > summary').click()
  await expect(advanced).toHaveJSProperty('open', true)
  const search = page.getByRole('searchbox', { name: 'Search title or content', exact: true })
  await search.fill('typed before the session confirmed')

  release()
  await expect(page.getByTestId('sign-out')).toBeVisible()

  await expect(search).toHaveValue('typed before the session confirmed')
  await expect(advanced).toHaveJSProperty('open', true)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('name'))).toBe('search')
  // The list still reads its own data for the confirmed session.
  await expect(page.getByRole('heading', { name: 'Matching diaries', exact: true })).toBeVisible()
})

test('a session confirming under a public tool swaps the chrome without discarding the calculation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, await register(page), '/diaries')

  const release = await holdSessionConfirmation(page)
  await page.goto('/tools/relative-value')
  // A tool address wears the public chrome until the session resolves.
  await expect(page.locator('.public-shell')).toBeVisible()
  await page.getByLabel('Primary Current price', { exact: true }).fill('4321.5')
  await page.getByLabel('Comparison Current price', { exact: true }).fill('432.15')
  const ratio = page.locator('dl.market-ratio-read')
  await expect(ratio).toBeVisible()
  const calculated = await ratio.innerText()

  release()
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(page.locator('.public-shell')).toHaveCount(0)

  await expect(page.getByLabel('Primary Current price', { exact: true })).toHaveValue('4321.5')
  await expect(page.getByLabel('Comparison Current price', { exact: true })).toHaveValue('432.15')
  expect(await ratio.innerText()).toBe(calculated)
})
