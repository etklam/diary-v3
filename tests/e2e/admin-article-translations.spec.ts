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

test('admin batch-translates selected articles from article management', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  expect((await page.request.post('/api/auth/login', {
    data: { email: 'etf-admin@example.test', password: 'synthetic-etf-admin-password' },
  })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value
  const marker = randomUUID().slice(0, 8)
  const articles = []
  for (const access of ['PUBLIC', 'MEMBER'] as const) {
    const response = await page.request.post('/api/blog', {
      headers: { 'x-csrf-token': csrf },
      data: { title: `Batch ${access} ${marker}`, content: '# 標題\n\n內文段落。', category: 'market', status: 'DRAFT', access },
    })
    expect(response.status()).toBe(200)
    articles.push(await response.json() as { id: string; title: string })
  }

  await page.goto('/admin/blog')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Article management', exact: true })).toBeVisible()
  await page.getByLabel('Search title or author').fill(marker)
  // The filtered list clears the selection when it lands, so wait for it first.
  const filtered = page.waitForResponse(response => response.url().includes('/api/blog/admin?') && response.ok())
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await filtered
  const batch = page.getByRole('region', { name: 'Translations for the selected articles', exact: true })
  // Nothing appears until articles are selected, and selecting never dispatches.
  await expect(batch).toHaveCount(0)
  let dispatches = 0
  page.on('request', request => { if (request.url().includes('/api/admin/article-translations/jobs')) dispatches += 1 })
  for (const article of articles) await page.getByRole('row', { name: new RegExp(article.title) }).getByRole('checkbox').check()
  await expect(batch).toBeVisible()
  await expect(batch.getByRole('cell', { name: 'None' }).first()).toBeVisible()
  expect(dispatches).toBe(0)

  await batch.getByRole('group', { name: 'Target languages', exact: true }).getByRole('checkbox', { name: 'en', exact: true }).check()
  await batch.getByRole('button', { name: 'Request translation', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Queue translation jobs?', exact: true })
  await expect(confirm).toContainText('Microsoft Edge Translate')
  await confirm.getByRole('button', { name: 'Queue jobs', exact: true }).click()
  const results = batch.getByRole('status')
  // Mixed outcomes: the PUBLIC article queues, the MEMBER article is refused.
  await expect(results).toContainText('Queued')
  await expect(results).toContainText('Not allowed for this article')
  expect(dispatches).toBe(1)
  await page.screenshot({ path: 'docs/design/evidence/article-publishing/translation-batch-1440.png', fullPage: true })

  for (const article of articles) {
    expect((await page.request.delete(`/api/blog/${article.id}`, { headers: { 'x-csrf-token': csrf } })).status()).toBe(200)
  }
})
