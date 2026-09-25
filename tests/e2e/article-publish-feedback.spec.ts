import { randomUUID } from 'node:crypto'
import { test, expect, selectLocale } from '../support/e2e'

test('article management reports automatic translation admission warnings', async ({ page }) => {
  const key = randomUUID()
  expect((await page.request.post('/api/auth/login', { data: { email: 'etf-admin@example.test', password: 'synthetic-etf-admin-password' } })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
  const csrfToken = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value ?? ''
  const createDraft = async (title: string) => {
    const response = await page.request.post('/api/blog', {
      headers: { 'x-csrf-token': csrfToken },
      data: { title, content: `Synthetic article body ${key}`, category: 'market', status: 'DRAFT', access: 'PUBLIC', sourceLocale: 'en' },
    })
    expect(response.status(), await response.text()).toBe(200)
    return await response.json() as { id: string }
  }
  const single = await createDraft(`Single publish ${key}`)
  const bulk = await createDraft(`Bulk publish ${key}`)
  await page.goto('/admin/blog')
  await selectLocale(page, 'en')

  await page.route(`**/api/blog/admin/${single.id}/publish`, async route => {
    const response = await route.fetch()
    const body = await response.json() as Record<string, unknown>
    await route.fulfill({
      status: response.status(),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, automaticTranslationAdmission: { status: 'not_queued', reason: 'settings_unavailable', resumeAt: null } }),
    })
  })
  const singleRow = page.getByRole('row').filter({ hasText: `Single publish ${key}` })
  await singleRow.getByRole('button', { name: 'Publish', exact: true }).click()
  const singleFeedback = page.getByRole('status').filter({ hasText: '1 article published.' })
  await expect(singleFeedback).toContainText('translation work skipped')
  await expect(singleFeedback.getByRole('link', { name: `Single publish ${key}`, exact: true })).toHaveAttribute('href', `/admin/blog/${single.id}/edit`)
  await page.unroute(`**/api/blog/admin/${single.id}/publish`)

  await page.route('**/api/blog/admin/bulk-publish', async route => {
    const response = await route.fetch()
    const body = await response.json() as Record<string, unknown>
    await route.fulfill({
      status: response.status(),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, automaticTranslationWarningCount: 1, automaticTranslationResumeAt: '2099-01-01T00:00:00.000Z' }),
    })
  })
  const bulkRow = page.getByRole('row').filter({ hasText: `Bulk publish ${key}` })
  await bulkRow.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Publish selected', exact: true }).click()
  const bulkFeedback = page.getByRole('status').filter({ hasText: '1 article published.' })
  await expect(bulkFeedback).toContainText('translation work skipped')
  await expect(bulkFeedback).toContainText('Skipped translations are not queued automatically')
  await expect(bulkFeedback.getByRole('link', { name: `Bulk publish ${key}`, exact: true })).toHaveAttribute('href', `/admin/blog/${bulk.id}/edit`)
})
