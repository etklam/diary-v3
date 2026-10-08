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

test('article management deletes selected articles after confirmation', async ({ page }) => {
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
  const first = await createDraft(`Bulk delete one ${key}`)
  const second = await createDraft(`Bulk delete two ${key}`)
  await page.goto('/admin/blog')
  await selectLocale(page, 'en')

  await page.getByRole('row').filter({ hasText: `Bulk delete one ${key}` }).getByRole('checkbox').check()
  await page.getByRole('row').filter({ hasText: `Bulk delete two ${key}` }).getByRole('checkbox').check()
  const deletion = page.waitForResponse(response => response.url().endsWith('/api/blog/admin/bulk-delete') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click()
  // Ticket 114: both deletions name their consequence in the project dialog.
  const confirmBulk = page.getByRole('dialog')
  await expect(confirmBulk).toContainText('Delete the selected articles?')
  await confirmBulk.getByRole('button', { name: 'Delete', exact: true }).click()
  expect((await deletion).status()).toBe(200)
  await expect(page.getByRole('row').filter({ hasText: `Bulk delete one ${key}` })).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: `Bulk delete two ${key}` })).toHaveCount(0)
  expect((await page.request.get(`/api/blog/admin/${first.id}`)).status()).toBe(404)
  expect((await page.request.get(`/api/blog/admin/${second.id}`)).status()).toBe(404)
})

// Ticket 114: a published row carried four full-weight controls that wrapped to
// a second line at 1440px, one of them filled, beside a status column too
// narrow for the word "Published".
test('article management rows stay quiet, single-line and confirmed', async ({ page }) => {
  const key = randomUUID()
  expect((await page.request.post('/api/auth/login', { data: { email: 'etf-admin@example.test', password: 'synthetic-etf-admin-password' } })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
  const csrfToken = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value ?? ''
  const created = await page.request.post('/api/blog', {
    headers: { 'x-csrf-token': csrfToken },
    data: { title: `Row controls ${key}`, content: `Synthetic article body ${key}`, category: 'market', status: 'DRAFT', access: 'PUBLIC', sourceLocale: 'en' },
  })
  expect(created.status(), await created.text()).toBe(200)
  const article = await created.json() as { id: string }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/blog')
  await selectLocale(page, 'en')
  const row = page.getByRole('row').filter({ hasText: `Row controls ${key}` })

  // Publish it so the row carries its widest control set: Edit, View, Archive,
  // Delete.
  await row.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Archive', exact: true })).toBeVisible()

  for (const [locale, status] of [['en', 'Published'], ['zh-TW', '已發布']] as const) {
    await selectLocale(page, locale)
    await expect(row.locator('.admin-blog-status')).toHaveText(status)
    const metrics = await row.evaluate(node => {
      const group = node.querySelector('.admin-blog-row-actions')!
      const children = [...group.children] as HTMLElement[]
      const statusCell = node.querySelector('.admin-blog-status') as HTMLElement
      // One client rect per line box, so this counts the label's lines rather
      // than the row's height.
      const range = document.createRange()
      range.selectNodeContents(statusCell)
      return {
        status: statusCell.textContent,
        statusLines: range.getClientRects().length,
        actionLines: new Set(children.map(child => Math.round(child.getBoundingClientRect().top))).size,
        filled: children.filter(child => !child.className.includes('quiet-button') && !child.className.includes('danger-button')).length,
      }
    })
    expect(metrics.status, `status label at ${locale}`).toBe(status)
    expect(metrics.statusLines, `the status label stays on one line at ${locale}`).toBe(1)
    expect(metrics.actionLines, `the row controls occupy one line at ${locale}`).toBe(1)
    expect(metrics.filled, `no row control is filled at ${locale}`).toBe(0)
  }
  await selectLocale(page, 'en')

  // New article is the page's one filled action; the bulk bar no longer carries
  // a second one. (The filter bar's submit is filled on every list page in the
  // app — a form's own commit — so it is a convention, not this page's defect.)
  const header = page.locator('.plan-header')
  await expect(header.locator('a.button:not(.secondary)')).toHaveText('New article')
  const bulkBar = page.locator('.plan-page > .actions').first()
  await expect(bulkBar.locator('button:not(.secondary):not(.quiet-button):not(.danger-button)')).toHaveCount(0)
  await expect(bulkBar.getByRole('button', { name: 'Publish selected', exact: true })).toHaveClass(/secondary/)

  // The row's last control is reachable inside the scroll region, not pushed
  // past its edge — the defect [113] fixed on the other table. The table itself
  // may scroll, which is what a named scroll region is for: how far it scrolls
  // depends on the longest title in the account, so that is not asserted.
  const table = page.locator('.admin-blog-table')
  await table.evaluate(node => { node.scrollLeft = node.scrollWidth })
  const clipped = await row.locator('.admin-blog-row-actions > :last-child').evaluate(node => {
    const region = node.closest('.admin-blog-table')!.getBoundingClientRect(), control = node.getBoundingClientRect()
    return control.right > region.right + 1 || control.left < region.left - 1
  })
  expect(clipped, 'Delete is fully inside the scroll region').toBe(false)
  await table.evaluate(node => { node.scrollLeft = 0 })
  await page.locator('.table-scroll').screenshot({ path: 'docs/design/evidence/admin-blog/rows-1440.png' })

  // Deleting one row names its consequence and can be cancelled.
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm).toContainText('Delete this article permanently?')
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(row).toHaveCount(0)
  expect((await page.request.get(`/api/blog/admin/${article.id}`)).status()).toBe(404)
})
