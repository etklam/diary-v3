import { randomUUID } from 'node:crypto'
import { test, expect, selectLocale } from '../support/e2e'

test('admin can configure and switch translation providers on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  expect((await page.request.post('/api/auth/login', {
    data: { email: 'etf-admin@example.test', password: 'synthetic-etf-admin-password' },
  })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
  await page.goto('/admin/article-translations')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Article translation providers', exact: true })).toBeVisible()

  const suffix = randomUUID().slice(0, 8)
  const providers = [
    { name: `Provider A ${suffix}`, endpoint: 'https://provider-a.example.test/v1', key: `synthetic-a-${suffix}` },
    { name: `Provider B ${suffix}`, endpoint: 'https://provider-b.example.test/v1', key: `synthetic-b-${suffix}` },
  ]
  for (const provider of providers) {
    await page.getByRole('button', { name: 'Add provider', exact: true }).click()
    await page.getByLabel('Provider name').fill(provider.name)
    await page.getByLabel('OpenAI-compatible HTTPS base URL').fill(provider.endpoint)
    await page.getByLabel('Model', { exact: true }).fill('synthetic-translation-model')
    await page.locator('.article-translation-settings-grid input[type="password"]').fill(provider.key)
    await page.getByLabel('Enable this provider').check()
    await page.getByRole('button', { name: 'Save provider', exact: true }).click()
    await expect(page.getByText('Provider saved.', { exact: true })).toBeVisible()
  }

  const defaultSelect = page.getByLabel('Current default')
  await defaultSelect.selectOption({ label: `${providers[1]!.name} — synthetic-translation-model` })
  await page.getByRole('button', { name: 'Apply provider', exact: true }).click()
  await expect(page.getByText('Default provider updated. No provider call was made.', { exact: true })).toBeVisible()

  const configured = await (await page.request.get('/api/admin/article-translations/ai-providers')).json() as {
    providers: { id: string; name: string }[]
    defaultProviderId: string | null
  }
  expect(configured.providers.map(provider => provider.name)).toEqual(expect.arrayContaining(providers.map(provider => provider.name)))
  expect(configured.providers.find(provider => provider.id === configured.defaultProviderId)?.name).toBe(providers[1]!.name)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.setViewportSize({ width: 360, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
