import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect, selectLocale, selectTheme } from '../support/e2e'

const adminEmail = 'etf-admin@example.test'
const adminPassword = 'synthetic-etf-admin-password'

async function signInAdmin(page: Page) {
  expect((await page.request.post('/api/auth/login', { data: { email: adminEmail, password: adminPassword } })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
}

test('admin authors a public article end to end without weakening public or role boundaries', async ({ page, browser }) => {
  test.setTimeout(180_000)
  const title = `中文同名文章 ${randomUUID()}`
  await signInAdmin(page)
  await page.goto('/articles')
  await selectLocale(page, 'en')
  await expect(page.locator('.public-shell')).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Workspace', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'New article', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Manage articles', exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/article-publishing/list-admin-1440.png', fullPage: true })

  await page.getByRole('link', { name: 'New article', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Content', { exact: true }).fill('# Draft body\n\nA private **Markdown** paragraph.')
  await page.getByLabel('Excerpt (optional)', { exact: true }).fill('A synthetic public excerpt.')
  await page.getByLabel('Tags', { exact: true }).fill('synthetic,article')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/blog\/\d+\/edit$/)
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible()
  const id = page.url().match(/admin\/blog\/(\d+)\/edit$/)?.[1]
  expect(id).toBeTruthy()
  const draft = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string; status: string; publishedAt: string | null }
  expect(draft).toMatchObject({ status: 'DRAFT', publishedAt: null })
  await expect(page.getByRole('link', { name: 'View public article', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'docs/design/evidence/article-publishing/editor-draft-1440.png', fullPage: true })

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const guest = await guestContext.newPage()
    await guest.goto('/articles')
    await selectLocale(guest, 'en')
    await expect(guest.getByRole('heading', { name: title, exact: true })).toHaveCount(0)
    expect((await guest.request.get(`/api/blog/${encodeURIComponent(draft.slug)}`)).status()).toBe(404)

    await page.getByRole('button', { name: 'Publish publicly', exact: true }).click()
    await expect(page.getByText('Article published publicly.', { exact: true })).toBeVisible()
    const publicLink = page.getByRole('link', { name: 'View public article', exact: true })
    await expect(publicLink).toBeVisible()
    const published = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string; status: string; publishedAt: string | null }
    expect(published.status).toBe('PUBLISHED')
    expect(published.publishedAt).toBeTruthy()
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: 'docs/design/evidence/article-publishing/editor-published-1440.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await selectTheme(page, 'dark')
    await page.evaluate(() => scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'docs/design/evidence/article-publishing/editor-published-390-dark.png' })
    for (const width of [360, 768]) {
      await page.setViewportSize({ width, height: 720 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await selectTheme(page, 'light')

    await guest.goto('/articles')
    await expect(guest.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await guest.screenshot({ path: 'docs/design/evidence/article-publishing/list-guest-1440.png', fullPage: true })
    await guest.getByRole('link', { name: title, exact: true }).click()
    await expect(guest.getByText('A private Markdown paragraph.', { exact: true })).toBeVisible()
    expect(await guest.locator('meta[property="og:title"]').getAttribute('content')).toBe(title)
    expect(await guest.locator('link[rel="canonical"]').getAttribute('href')).toContain(`/articles/${encodeURIComponent(published.slug)}`)
    await selectLocale(guest, 'zh-TW')
    await guest.screenshot({ path: 'docs/design/evidence/public-content/1440.png', fullPage: true })
    await guest.setViewportSize({ width: 390, height: 844 })
    await selectTheme(guest, 'dark')
    await guest.screenshot({ path: 'docs/design/evidence/public-content/390.png', fullPage: true })
    await guest.setViewportSize({ width: 1440, height: 900 })
    await selectLocale(guest, 'en')
    await selectTheme(guest, 'light')

    await publicLink.click()
    await expect(page.locator('.public-shell')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit article', exact: true })).toHaveAttribute('href', `/admin/blog/${id}/edit`)
    await page.screenshot({ path: 'docs/design/evidence/article-publishing/detail-admin-1440.png', fullPage: true })
    await page.getByRole('link', { name: 'Edit article', exact: true }).click()
    const content = page.locator('.article-editor-fields textarea').first()
    await expect(content).toBeVisible()
    expect(await content.evaluate(element => ({ disabled: (element as HTMLTextAreaElement).disabled, fieldsetDisabled: element.closest('fieldset')?.disabled }))).toEqual({ disabled: false, fieldsetDisabled: false })
    await content.fill('# Updated body\n\nThe published content changed safely.')
    await page.locator('.article-editor-fields .title-input').press('Enter')
    await expect(page.getByText('Published article updated.', { exact: true })).toBeVisible()
    const updated = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string; status: string; content: string }
    expect(updated).toMatchObject({ status: 'PUBLISHED', content: '# Updated body\n\nThe published content changed safely.' })
    await guest.goto(`/articles/${encodeURIComponent(updated.slug)}`)
    await expect(guest.getByText('The published content changed safely.', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Archive article', exact: true }).click()
    await expect(page.getByText('Article archived and no longer public.', { exact: true })).toBeVisible()
    expect((await page.request.get(`/api/blog/admin/${id}`)).status()).toBe(200)
    const archived = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { status: string }
    expect(archived.status).toBe('ARCHIVED')
    await expect(page.getByRole('link', { name: 'View public article', exact: true })).toHaveCount(0)
    expect((await guest.goto(`/articles/${encodeURIComponent(updated.slug)}`))?.status()).toBe(404)
    await guest.goto('/articles')
    await expect(guest.getByRole('heading', { name: title, exact: true })).toHaveCount(0)

    await page.locator('.article-editor-fields textarea').first().fill('Retained after failed republish.')
    await page.route(`**/api/blog/${id}`, route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'post-publish-failure' } }) }) : route.continue())
    await page.getByRole('button', { name: 'Republish publicly', exact: true }).click()
    await expect(page.getByTestId('request-id')).toHaveText('post-publish-failure')
    await expect(page.locator('.article-editor-fields textarea').first()).toHaveValue('Retained after failed republish.')
    await expect(page.getByRole('link', { name: 'View public article', exact: true })).toHaveCount(0)

    await page.unroute(`**/api/blog/${id}`)
    await page.route(`**/api/blog/${id}`, route => route.request().method() === 'PUT' ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ data: { code: 'AUTH_UNAUTHORIZED', requestId: 'post-session-expired' } }) }) : route.continue())
    await page.getByRole('button', { name: 'Republish publicly', exact: true }).click()
    const signIn = page.getByRole('link', { name: 'Sign in', exact: true })
    await expect(signIn).toHaveAttribute('href', `/login?returnTo=${encodeURIComponent(`/admin/blog/${id}/edit`)}`)
    await signIn.click()
    await page.getByLabel('Email', { exact: true }).fill(adminEmail)
    await page.getByLabel('Password', { exact: true }).fill(adminPassword)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/blog/${id}/edit$`))
    await expect(page.getByText('Unsaved edits were restored for this article.', { exact: true })).toBeVisible()
    await expect(page.locator('.article-editor-fields textarea').first()).toHaveValue('Retained after failed republish.')
    await page.unroute(`**/api/blog/${id}`)

    page.once('dialog', dialog => dialog.accept())
    await page.goto('/articles')
    await expect(page.getByRole('link', { name: 'New article', exact: true })).toBeVisible()
    const secondTab = await page.context().newPage()
    await secondTab.goto('/')
    await secondTab.getByTestId('sign-out').click()
    await expect(page.getByRole('link', { name: 'New article', exact: true })).toHaveCount(0)
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
    await secondTab.close()
  } finally { await guestContext.close() }

  const ordinaryContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const ordinary = await ordinaryContext.newPage()
    const email = `article-ordinary-${randomUUID()}@example.test`
    expect((await ordinary.request.post('/api/auth/register', { data: { email, password: 'synthetic-ordinary-password' } })).status()).toBe(200)
    expect((await ordinary.request.post('/api/auth/login', { data: { email, password: 'synthetic-ordinary-password' } })).status()).toBe(200)
    await ordinary.goto('/articles')
    await selectLocale(ordinary, 'en')
    await selectTheme(ordinary, 'dark')
    await expect(ordinary.locator('.public-shell')).toBeVisible()
    await expect(ordinary.getByRole('banner').getByRole('link', { name: 'Workspace', exact: true })).toBeVisible()
    await expect(ordinary.getByRole('link', { name: 'New article', exact: true })).toHaveCount(0)
    await expect(ordinary.getByRole('link', { name: 'Manage articles', exact: true })).toHaveCount(0)
    await ordinary.goto('/about')
    await expect(ordinary.locator('.public-shell')).toBeVisible()
    await ordinary.goto('/guide')
    await expect(ordinary.locator('.public-shell')).toBeVisible()
    await ordinary.goto('/')
    await expect(ordinary.locator('.app-shell')).toBeVisible()
    await ordinary.goto('/tools')
    await expect(ordinary.locator('.app-shell')).toBeVisible()
    await ordinary.goto('/articles')
    expect(await ordinary.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await ordinary.screenshot({ path: 'docs/design/evidence/article-publishing/list-user-390-dark.png', fullPage: true })
  } finally { await ordinaryContext.close() }
})
