import { randomUUID } from 'node:crypto'
import { test, expect } from '../support/e2e'
import { aiMutation, configureSyntheticAi, gotoAiPage, registerAiOwner } from '../support/ai-e2e'

test('synthetic browser server dispatches a persisted report once and replays the same submission', async ({ page, browser }) => {
  const admin = await configureSyntheticAi(browser)
  try {
    const owner = await registerAiOwner(page, admin)
    const capability = await (await page.request.get('/api/ai/capabilities')).json()
    expect(capability.enabled).toBe(true)
    const selection = { periodType: 'weekly', periodStart: owner.periodStart, locale: 'en' }
    const previewResponse = await aiMutation(page.context(), page.request, 'POST', '/api/ai/reports/preview', selection)
    expect(previewResponse.status()).toBe(200)
    const preview = await previewResponse.json()
    expect(preview.coverage.diaries.count).toBe(1)
    expect((await aiMutation(page.context(), page.request, 'PUT', '/api/ai/consent', {
      recipientRevision: capability.recipientRevision, disclosureVersion: capability.disclosureVersion,
    })).status()).toBe(200)
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value ?? ''
    const key = randomUUID()
    const generate = () => page.request.post('/api/ai/reports', {
      headers: { 'x-csrf-token': csrf, 'Idempotency-Key': key },
      data: { ...selection, confirmedRecipientRevision: preview.recipientRevision, previewFingerprint: preview.previewFingerprint },
    })
    const generated = await generate()
    expect(generated.status()).toBe(202)
    const report = (await generated.json()).data
    await expect.poll(async () => (await (await page.request.get(`/api/ai/reports/${report.id}`)).json()).status).toBe('succeeded')
    expect((await (await generate()).json()).data.id).toBe(report.id)
    const detail = await (await page.request.get(`/api/ai/reports/${report.id}`)).json()
    expect(detail.analysis.limitations).toContain('Synthetic browser fixture; no investment advice.')
    expect(detail.model).toBe('synthetic-review-model')
    expect(detail.locale).toBe('en')
    const after = await (await page.request.get('/api/ai/capabilities')).json()
    expect(after.remainingQuota).toBe(capability.remainingQuota - 1)
    expect((await aiMutation(page.context(), page.request, 'DELETE', `/api/ai/reports/${report.id}`)).status()).toBe(200)
    expect((await page.request.get(`/api/ai/reports/${report.id}`)).status()).toBe(404)
  } finally { await admin.close() }
})

test('AI report UI requires explicit consent and generation, survives refresh, and keeps report language fixed', async ({ page, browser }) => {
  const { selectLocale, selectTheme, signOut } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  try {
    const owner = await registerAiOwner(page, admin)
    const generations: string[] = []
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'POST' && (path === '/api/ai/reports' || /^\/api\/ai\/reports\/\d+\/regenerate$/.test(path))) generations.push(request.headers()['idempotency-key'] ?? '')
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await gotoAiPage(page, '/reviews/ai-reports')
    await selectLocale(page, 'en')
    await expect(page.getByRole('heading', { name: 'AI reports', exact: true })).toBeVisible()
    await expect(page.getByTestId('ai-period-select')).toHaveValue(owner.periodStart)
    await page.getByTestId('ai-period-select').selectOption(owner.periodStart)
    await page.getByTestId('ai-preview').click()
    await expect(page.getByTestId('ai-consent-accept')).toBeVisible()
    expect(generations).toHaveLength(0)
    await expect(page.getByTestId('ai-generate')).toBeDisabled()
    await page.getByTestId('ai-consent-accept').click()
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-report')).toContainText('The saved synthetic record describes a decision', { timeout: 15_000 })
    expect(generations).toHaveLength(1)
    await expect(page.locator('.ai-quota')).toContainText('9 of 10')
    const inclusiveEnd = new Date(`${owner.periodStart}T00:00:00Z`)
    inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 6)
    await expect(page.locator('.ai-report-header h2')).toContainText(inclusiveEnd.toISOString().slice(0, 10))
    const report = page.getByTestId('ai-report')
    await expect(report.locator('a.ai-source-chip').first()).toHaveAttribute('href', /^\/diaries\/\d+$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.ai-page').screenshot({ path: 'docs/design/evidence/ai-reports/desktop-en.png' })
    await selectLocale(page, 'zh-CN')
    await expect(page.getByRole('heading', { name: 'AI 报告', exact: true })).toBeVisible()
    await expect(report).toContainText('The saved synthetic record describes a decision')
    await selectLocale(page, 'zh-TW')
    await page.setViewportSize({ width: 390, height: 844 })
    await selectTheme(page, 'dark')
    await expect(page.getByRole('heading', { name: 'AI 報告', exact: true })).toBeVisible()
    await expect(report.locator('.ai-metrics')).toContainText('已記錄日記')
    await expect(report.locator('.ai-notes').first()).toContainText('所選期間內沒有已記錄的交易。')
    await expect(report.locator('.ai-coverage-list dd')).toHaveText(['1', '0', '0', '0'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.ai-page').screenshot({ path: 'docs/design/evidence/ai-reports/mobile-zh-tw-dark.png' })
    await page.reload()
    await page.getByTestId('ai-history-item').first().click()
    await expect(report).toContainText('The saved synthetic record describes a decision')
    expect(generations).toHaveLength(1)
    const privateStorage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(privateStorage).not.toContain('The saved synthetic record describes a decision')
    await signOut(page)
    await expect(page.getByTestId('ai-report')).toHaveCount(0)
  } finally { await admin.close() }
})

for (const failure of ['connectionreset', 'server-error'] as const) test(`AI UI retries an ambiguous ${failure} submission with the same idempotency key`, async ({ page, browser }) => {
  const { selectLocale } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  try {
    const owner = await registerAiOwner(page, admin)
    await gotoAiPage(page, '/reviews/ai-reports')
    await selectLocale(page, 'en')
    await page.getByTestId('ai-period-select').selectOption(owner.periodStart)
    await page.getByTestId('ai-preview').click()
    await page.getByTestId('ai-consent-accept').click()
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    const keys: string[] = []
    let lostResponse = false
    await page.route('**/api/ai/reports', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      keys.push(route.request().headers()['idempotency-key'] ?? '')
      if (!lostResponse) {
        lostResponse = true
        const response = await route.fetch()
        expect(response.status()).toBe(202)
        if (failure === 'connectionreset') await route.abort('connectionreset')
        else await route.fulfill({ status: 503, json: { error: 'Synthetic response lost after acceptance' } })
      } else await route.continue()
    })
    await page.getByTestId('ai-generate').click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByTestId('ai-period-select')).toBeDisabled()
    await expect(page.getByTestId('ai-preview')).toBeDisabled()
    await selectLocale(page, 'zh-TW')
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-report')).toContainText('The saved synthetic record describes a decision', { timeout: 15_000 })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    const list = await (await page.request.get('/api/ai/reports')).json()
    expect(list.data).toHaveLength(1)
    expect(list.data[0].locale).toBe('en')
    const capability = await (await page.request.get('/api/ai/capabilities')).json()
    expect(capability.remainingQuota).toBe(9)
  } finally { await admin.close() }
})

test('AI admin UI saves, tests and publishes current revisions without reading back keys', async ({ page, browser }) => {
  const { selectLocale, selectTheme } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  try {
    const owner = await registerAiOwner(page, admin)
    expect((await page.request.post('/api/auth/login', { data: { email: 'ai-admin@example.test', password: 'synthetic-ai-admin-password' } })).status()).toBe(200)
    await page.request.get('/api/auth/me')
    await gotoAiPage(page, '/admin/ai')
    await selectLocale(page, 'en')
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Synthetic browser provider')
    await page.getByLabel('Replace key', { exact: true }).check()
    await page.getByLabel('New key', { exact: true }).fill('synthetic-replacement-key')
    await page.getByTestId('admin-ai-provider-save').click()
    await expect(page.getByLabel('Keep current key', { exact: true })).toBeChecked()
    await expect(page.getByLabel('New key', { exact: true })).toHaveCount(0)
    await page.getByLabel('Display name', { exact: true }).fill('Updated synthetic provider')
    await page.getByLabel('Currency (ISO code)', { exact: true }).fill('usd')
    await page.getByLabel('Base URL', { exact: true }).fill('https://api.deepseek.com/')
    await expect(page.getByTestId('admin-ai-provider-test')).toBeDisabled()
    await page.getByTestId('admin-ai-provider-save').click()
    await expect(page.getByLabel('Currency (ISO code)', { exact: true })).toHaveValue('USD')
    await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue('https://api.deepseek.com')
    await expect(page.getByTestId('admin-ai-provider-test')).toBeEnabled()
    page.once('dialog', dialog => dialog.accept())
    await page.getByTestId('admin-ai-provider-test').click()
    await expect(page.locator('.admin-ai-provider-meta')).toContainText('passed')
    await page.getByLabel('Model ID', { exact: true }).fill('unsaved-model')
    await expect(page.getByTestId('admin-ai-provider-publish')).toBeDisabled()
    await page.getByLabel('Model ID', { exact: true }).fill('synthetic-review-model')
    await expect(page.getByTestId('admin-ai-provider-publish')).toBeEnabled()
    page.once('dialog', dialog => dialog.accept())
    await page.getByTestId('admin-ai-provider-publish').click()
    await expect(page.locator('.admin-ai-provider-meta')).toContainText('Published')
    const prompt = page.getByTestId('admin-ai-prompt-weekly')
    const editor = page.getByTestId('admin-ai-prompt-draft-weekly')
    const original = await editor.inputValue()
    await editor.fill(`${original}\nKeep questions specific to the saved records.`)
    await expect(prompt.getByRole('button', { name: 'Paid test (synthetic data)', exact: true })).toBeDisabled()
    await prompt.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(prompt.getByRole('heading', { level: 3 })).toContainText('Draft')
    page.once('dialog', dialog => dialog.accept())
    await prompt.getByRole('button', { name: 'Paid test (synthetic data)', exact: true }).click()
    await expect(page.getByTestId('admin-ai-prompt-test-weekly')).toContainText('summary')
    page.once('dialog', dialog => dialog.accept())
    await prompt.getByRole('button', { name: 'Publish new version', exact: true }).click()
    await expect(prompt.getByRole('heading', { level: 3 })).toContainText('Published')
    page.once('dialog', dialog => dialog.accept())
    await prompt.getByRole('button', { name: 'Restore default template', exact: true }).click()
    await expect(editor).toHaveValue(original)
    await page.getByLabel('Search email or name', { exact: true }).fill(owner.email)
    await page.locator('.admin-ai-search').getByRole('button', { name: 'Search', exact: true }).click()
    const row = page.getByTestId('admin-ai-access-table').locator('tr').filter({ hasText: owner.email })
    await row.getByRole('spinbutton').fill('7')
    await row.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await expect(page.getByTestId('admin-ai-usage-table')).toContainText('USD')
    await page.setViewportSize({ width: 1440, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.admin-ai-page').screenshot({ path: 'docs/design/evidence/ai-reports/admin-desktop-en.png' })
    await selectLocale(page, 'zh-CN')
    await expect(page.getByRole('heading', { name: 'AI 报告管理', exact: true })).toBeVisible()
    await selectLocale(page, 'zh-TW')
    await selectTheme(page, 'dark')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.admin-ai-page').screenshot({ path: 'docs/design/evidence/ai-reports/admin-mobile-zh-tw-dark.png' })
    expect(await page.locator('body').textContent()).not.toContain('synthetic-replacement-key')
  } finally { await admin.close() }
})

test('changing interface locale discards a late preview before generation', async ({ page, browser }) => {
  const { selectLocale } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  let release = () => {}
  try {
    const owner = await registerAiOwner(page, admin)
    await gotoAiPage(page, '/reviews/ai-reports')
    await selectLocale(page, 'en')
    await page.getByTestId('ai-period-select').selectOption(owner.periodStart)
    let signalStarted = () => {}
    const started = new Promise<void>(resolve => { signalStarted = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    let signalDone = () => {}
    const done = new Promise<void>(resolve => { signalDone = resolve })
    await page.route('**/api/ai/reports/preview', async route => {
      if (route.request().postDataJSON().locale !== 'en') return route.continue()
      const response = await route.fetch()
      signalStarted()
      await gate
      await route.fulfill({ response }).catch(() => undefined)
      signalDone()
    })
    await page.getByTestId('ai-preview').click()
    await started
    await selectLocale(page, 'zh-TW')
    await expect(page.getByTestId('ai-preview')).toBeEnabled()
    await page.getByTestId('ai-preview').click()
    await expect(page.locator('.ai-coverage')).toBeVisible()
    release()
    await done
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await page.getByTestId('ai-consent-accept').click()
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    const submitted = page.waitForRequest(request => new URL(request.url()).pathname === '/api/ai/reports' && request.method() === 'POST')
    await page.getByTestId('ai-generate').click()
    expect((await submitted).postDataJSON().locale).toBe('zh-TW')
    await expect(page.getByTestId('ai-report')).toContainText('The saved synthetic record describes a decision', { timeout: 15_000 })
  } finally { release(); await admin.close() }
})

test('monthly reports remain readable after consent withdrawal and can be deleted without refunding quota', async ({ page, browser }) => {
  const { selectLocale } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  try {
    const owner = await registerAiOwner(page, admin)
    await gotoAiPage(page, '/reviews/ai-reports')
    await selectLocale(page, 'en')
    await page.getByRole('radio', { name: 'Monthly', exact: true }).check()
    const monthStart = `${owner.periodStart.slice(0, 7)}-01`
    await page.getByTestId('ai-period-select').selectOption(monthStart)
    await page.getByTestId('ai-preview').click()
    await expect(page.locator('.ai-coverage')).toBeVisible()
    await page.getByTestId('ai-consent-accept').click()
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-report')).toContainText('The saved synthetic record describes a decision', { timeout: 15_000 })
    await expect(page.locator('.ai-report-header h2')).toContainText(`${monthStart.slice(0, 7)} · Monthly`)
    const reports = await (await page.request.get('/api/ai/reports')).json()
    expect(reports.data).toHaveLength(1)
    expect(reports.data[0].period.periodType).toBe('monthly')
    await page.reload()
    await expect(page.locator('.ai-coverage')).toHaveCount(0)
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Withdraw consent', exact: true }).click()
    await expect(page.getByTestId('ai-consent-accept')).toBeVisible()
    await page.getByTestId('ai-history-item').first().click()
    await expect(page.getByTestId('ai-report')).toContainText('The saved synthetic record describes a decision')
    await expect(page.getByTestId('ai-generate')).toBeDisabled()
    page.once('dialog', dialog => dialog.accept())
    await page.getByTestId('ai-delete').click()
    await expect(page.getByTestId('ai-report')).toHaveCount(0)
    await expect(page.getByTestId('ai-history-item')).toHaveCount(0)
    expect((await page.request.get(`/api/ai/reports/${reports.data[0].id}`)).status()).toBe(404)
    expect((await (await page.request.get('/api/ai/capabilities')).json()).remainingQuota).toBe(9)
  } finally { await admin.close() }
})

test('a late audit page cannot hide a fresh management action', async ({ page, browser }) => {
  const { selectLocale } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  let release = () => {}
  try {
    await registerAiOwner(page, admin)
    expect((await page.request.post('/api/auth/login', { data: { email: 'ai-admin@example.test', password: 'synthetic-ai-admin-password' } })).status()).toBe(200)
    await page.request.get('/api/auth/me')
    let fresh = false
    let started = () => {}
    const waiting = new Promise<void>(resolve => { started = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    let complete = () => {}
    const done = new Promise<void>(resolve => { complete = resolve })
    const event = (id: string, summary: string) => ({ id, actorUserId: null, action: 'synthetic.audit', targetType: 'runtime', targetId: null, summary, createdAt: '2026-09-20T00:00:00.000Z' })
    await page.route('**/api/admin/ai/audit?*', async route => {
      if (new URL(route.request().url()).searchParams.has('cursor')) {
        started()
        await gate
        await route.fulfill({ json: { data: [event('900001', 'Old synthetic audit page')], nextCursor: null } }).catch(() => undefined)
        complete()
      } else {
        await route.fulfill({ json: { data: [event(fresh ? '900003' : '900002', fresh ? 'Fresh synthetic audit action' : 'Initial synthetic audit action')], nextCursor: fresh ? null : 'held-page' } })
      }
    })
    await gotoAiPage(page, '/admin/ai')
    await selectLocale(page, 'en')
    const table = page.getByTestId('admin-ai-audit-table')
    await expect(table).toContainText('Initial synthetic audit action')
    await page.locator('.admin-ai-section').filter({ has: table }).getByRole('button', { name: 'Load more', exact: true }).click()
    await waiting
    fresh = true
    await page.locator('.admin-ai-runtime input[type="checkbox"]').click()
    await expect(page.locator('.admin-ai-runtime input[type="checkbox"]')).not.toBeChecked()
    await expect(table).toContainText('Fresh synthetic audit action')
    release()
    await done
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(table).toContainText('Fresh synthetic audit action')
    await expect(table).not.toContainText('Old synthetic audit page')
  } finally { release(); await admin.close() }
})

test('a preview for a newly published recipient requires its current disclosure before generation', async ({ page, browser }) => {
  const { selectLocale } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  try {
    const owner = await registerAiOwner(page, admin)
    await gotoAiPage(page, '/reviews/ai-reports')
    await selectLocale(page, 'en')
    await page.getByTestId('ai-period-select').selectOption(owner.periodStart)
    await page.getByTestId('ai-preview').click()
    await page.getByTestId('ai-consent-accept').click()
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    const revised = await configureSyntheticAi(browser, { recipientName: 'New synthetic recipient', disclosureVersion: 'browser-v2' })
    await revised.close()
    await page.getByTestId('ai-preview').click()
    await expect(page.locator('.ai-consent')).toContainText('New synthetic recipient')
    await expect(page.getByTestId('ai-generate')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Withdraw consent', exact: true })).toBeVisible()
    await page.getByTestId('ai-consent-accept').click()
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-report')).toContainText('The saved synthetic record describes a decision', { timeout: 15_000 })
  } finally { await admin.close() }
})

test('deleting a report last observed as running clears its active-job controls', async ({ page, browser }) => {
  const { selectLocale } = await import('../support/e2e')
  const admin = await configureSyntheticAi(browser)
  try {
    await registerAiOwner(page, admin)
    // Model delayed job-status visibility while keeping deletion on the real API.
    await page.route(url => /^\/api\/ai\/reports\/\d+$/.test(url.pathname), async route => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      if (!response.ok()) return route.fulfill({ response })
      await route.fulfill({ response, json: { ...await response.json(), status: 'running', analysis: null } })
    })
    await gotoAiPage(page, '/reviews/ai-reports')
    await selectLocale(page, 'en')
    await page.getByTestId('ai-preview').click()
    await page.getByTestId('ai-consent-accept').click()
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-active')).toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    await page.getByTestId('ai-delete').click()
    await expect(page.getByTestId('ai-active')).toHaveCount(0)
    await expect(page.getByTestId('ai-history-item')).toHaveCount(0)
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
  } finally { await admin.close() }
})
