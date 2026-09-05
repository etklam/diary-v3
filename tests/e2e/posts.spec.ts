import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect } from '../support/e2e'

const adminEmail = 'etf-admin@example.test'
const adminPassword = 'synthetic-etf-admin-password'

async function signInAdmin(page: Page) {
  expect((await page.request.post('/api/auth/login', { data: { email: adminEmail, password: adminPassword } })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
}

test('admin draft publishes to SSR public article, archives, republishes, and keeps permission boundary', async ({ page, browser }) => {
  const title = `Synthetic article ${randomUUID()}`
  await signInAdmin(page)
  await page.goto('/admin/blog/new')
  await page.getByTestId('locale-select').selectOption('en')
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Content', { exact: true }).fill('# Published body\n\nA source-safe **Markdown** paragraph.')
  await page.getByLabel('Excerpt (optional)', { exact: true }).fill('A published synthetic excerpt.')
  await page.getByLabel('Tags', { exact: true }).fill('synthetic,article')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/blog\/\d+\/edit$/)
  await expect(page.getByRole('heading', { name: 'Edit article', exact: true })).toBeVisible()
  const id = page.url().match(/admin\/blog\/(\d+)\/edit$/)?.[1]
  expect(id).toBeTruthy()
  const detail = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string; publishedAt: string | null }
  expect(detail.publishedAt).toBeNull()

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  const published = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string; publishedAt: string | null }
  expect(published.publishedAt).toBeTruthy()

  const guestContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } })
  try {
    const guest = await guestContext.newPage()
    const response = await guest.goto(`/articles/${encodeURIComponent(published.slug)}`)
    expect(response?.status()).toBe(200)
    await expect(guest.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(guest.getByText('A source-safe Markdown paragraph.', { exact: true })).toBeVisible()
    expect(await guest.locator('meta[property="og:title"]').getAttribute('content')).toBe(title)
    expect(await guest.locator('link[rel="canonical"]').getAttribute('href')).toContain(`/articles/${encodeURIComponent(published.slug)}`)
    await guest.screenshot({ path: 'docs/design/evidence/public-content/1440.png', fullPage: true })

    await page.goto('/admin/blog')
    await page.getByTestId('locale-select').selectOption('en')
    const row = page.locator('tr').filter({ hasText: title })
    await row.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(row.getByText('ARCHIVED', { exact: true })).toBeVisible()
    const hidden = await guest.goto(`/articles/${encodeURIComponent(published.slug)}`)
    expect(hidden?.status()).toBe(404)

    await row.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(row.getByText('PUBLISHED', { exact: true })).toBeVisible()
    await guest.goto(`/articles/${encodeURIComponent(published.slug)}`)
    await expect(guest.getByRole('heading', { name: title, exact: true })).toBeVisible()
  } finally { await guestContext.close() }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const mobilePage = await mobile.newPage()
    await mobilePage.goto(`/articles/${encodeURIComponent(published.slug)}`)
    await mobilePage.getByTestId('theme-select').selectOption('dark')
    await expect(mobilePage.getByRole('heading', { name: title, exact: true })).toBeVisible()
    expect(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await mobilePage.screenshot({ path: 'docs/design/evidence/public-content/390.png', fullPage: true })
  } finally { await mobile.close() }

  const ordinaryContext = await browser.newContext()
  try {
    const ordinary = await ordinaryContext.newPage()
    const email = `article-ordinary-${randomUUID()}@example.test`
    expect((await ordinary.request.post('/api/auth/register', { data: { email, password: 'synthetic-ordinary-password' } })).status()).toBe(200)
    expect((await ordinary.request.post('/api/auth/login', { data: { email, password: 'synthetic-ordinary-password' } })).status()).toBe(200)
    await ordinary.goto('/admin/blog')
    await ordinary.getByTestId('locale-select').selectOption('en')
    await expect(ordinary.getByRole('alert')).toContainText('permission')
  } finally { await ordinaryContext.close() }
})
