import { randomUUID } from 'node:crypto'
import { expect, test, selectLocale } from '../support/e2e'

test('installs static shell metadata without caching private API responses', async ({ page, context }) => {
  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  expect(manifest.headers()['content-type']).toContain('application/manifest+json')
  expect(await manifest.json()).toMatchObject({ start_url: '/', scope: '/', display: 'standalone' })

  await page.setViewportSize({ width: 1440, height: 900 })
  for (const path of ['/', '/about', '/guide']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(200)
  }
  const cdp = await context.newCDPSession(page)
  const appManifest = await cdp.send('Page.getAppManifest') as { errors?: unknown[]; data?: string }
  expect(appManifest.errors ?? []).toEqual([])
  expect(appManifest.data ?? '').toContain('standalone')
  const installability = await cdp.send('Page.getInstallabilityErrors') as { errors?: unknown[] }
  expect(installability.errors ?? []).toEqual([])

  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  const cacheState = await page.evaluate(async () => {
    const keys = await caches.keys()
    const requests = (await Promise.all(keys.map(async key => (await caches.open(key)).keys()))).flat()
    return { keys, privateApiRequests: requests.filter(request => new URL(request.url).pathname.startsWith('/api/')).map(request => request.url) }
  })
  expect(cacheState.keys).toContain('diary-static-v1')
  expect(cacheState.privateApiRequests).toEqual([])

  await context.setOffline(true)
  const offline = await page.evaluate(async () => {
    const staticResponse = await fetch('/favicon.svg')
    let apiStatus: number | null = null
    let apiFailed = false
    try { apiStatus = (await fetch('/api/auth/me')).status } catch { apiFailed = true }
    return { staticStatus: staticResponse.status, apiStatus, apiFailed }
  })
  expect(offline.staticStatus).toBe(200)
  expect(offline.apiFailed || offline.apiStatus === null).toBe(true)
})

test('mobile menu keeps every route reachable and returns focus on close', async ({ page }) => {
  const email = `pwa-menu-${randomUUID()}@example.test`
  const password = 'synthetic-pwa-menu-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/new$/)
  await selectLocale(page, 'en')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: 'docs/design/evidence/pwa/1440.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })

  const trigger = page.getByTestId('mobile-menu')
  await trigger.click()
  const dialog = page.getByTestId('mobile-menu-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Daily work', exact: true })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'SEC filings', exact: true })).toBeVisible()
  await dialog.getByRole('link', { name: 'SEC filings', exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/sec-filings$/)
  await expect(dialog).toBeHidden()

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('mobile-locale-select').selectOption('zh-CN')
  await expect(dialog.getByRole('heading', { name: '日常工作', exact: true })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/design/evidence/pwa/390.png', fullPage: true })
})

test('applies a waiting worker update without losing an unsaved editor', async ({ page }) => {
  const email = `pwa-update-${randomUUID()}@example.test`
  const password = 'synthetic-pwa-update-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/new$/)
  await selectLocale(page, 'en')
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await title.fill('Unsaved title survives update')
  const controllerBefore = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
  expect(controllerBefore).toContain('/sw.js')

  const waiting = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw-update-v2.js', { scope: '/', updateViaCache: 'none' })
    await registration.update()
    const deadline = Date.now() + 8_000
    while (!registration.waiting && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
    return Boolean(registration.waiting)
  })
  expect(waiting).toBe(true)
  await expect(page.getByTestId('pwa-update')).toBeVisible()
  await page.getByTestId('pwa-update').click()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toContain('/sw-update-v2.js')
  await expect(title).toHaveValue('Unsaved title survives update')
  await expect(page.getByText(/Update ready|更新已準備|更新已准备/)).toHaveCount(0)
})
