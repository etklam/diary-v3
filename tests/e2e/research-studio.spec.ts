import { expect, test, selectLocale, selectTheme } from '../support/e2e'

const adminEmail = 'etf-admin@example.test'
const adminPassword = 'synthetic-etf-admin-password'
const memberEmail = 'research-member@example.test'
const memberPassword = 'synthetic-research-member-password'

async function signIn(page: import('@playwright/test').Page, email = adminEmail, password = adminPassword) {
  const response = await page.request.post('/api/auth/login', { data: { email, password } })
  expect(response.status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)
}

async function csrfHeader(page: import('@playwright/test').Page) {
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value
  expect(csrf).toBeTruthy()
  return { 'x-csrf-token': csrf! }
}

async function configureSyntheticResearch(page: import('@playwright/test').Page) {
  const settingsResponse = await page.request.get('/api/admin/research/settings')
  expect(settingsResponse.status()).toBe(200)
  const settings = await settingsResponse.json() as {
    runtime: { revision: number }
    provider: { revision: number } | null
  }
  const providerResponse = await page.request.put('/api/admin/research/provider', {
    headers: await csrfHeader(page),
    data: {
      expectedRevision: settings.provider?.revision ?? 0,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free',
      maxInputTokens: 64000,
      maxOutputTokens: 6000,
      timeoutMs: 45000,
      apiKey: 'synthetic-browser-research-key',
    },
  })
  expect(providerResponse.status()).toBe(200)
  const runtimeResponse = await page.request.put('/api/admin/research/runtime', {
    headers: await csrfHeader(page),
    data: { expectedRevision: settings.runtime.revision, featureEnabled: true, generationEnabled: true },
  })
  expect(runtimeResponse.status()).toBe(200)
}

async function openResearch(page: import('@playwright/test').Page) {
  await page.goto('/admin/research')
  await selectLocale(page, 'en')
  await expect(page.getByRole('heading', { name: 'Research Studio', exact: true })).toBeVisible()
}

async function expectRunRevision(page: import('@playwright/test').Page, runId: string, revision: number) {
  let latestResponse: unknown
  try {
    await expect.poll(async () => {
    const response = await page.request.get(`/api/admin/research/runs/${encodeURIComponent(runId)}`)
      const body = await response.json().catch(() => null)
      latestResponse = { status: response.status(), body }
      if (!response.ok()) return -1
      return (body as { currentRevision: number }).currentRevision
    }, { timeout: 15_000 }).toBe(revision)
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nPage URL: ${page.url()}\nRun ID: ${runId}\nLast run detail response: ${JSON.stringify(latestResponse)}`, { cause: error })
  }
}

async function completeSyntheticQaReview(page: import('@playwright/test').Page, runId: string, revision: number) {
  await page.getByRole('tab', { name: 'QA', exact: true }).click()
  await page.getByLabel('G07 Review result', { exact: true }).selectOption('PASS')
  await page.getByLabel('G07 Evidence note', { exact: true }).fill('Reviewed the synthetic section 9 claim; no current trade-plan conclusion is asserted.')
  await page.getByLabel('G08 Review result', { exact: true }).selectOption('PASS')
  await page.getByLabel('G08 Evidence note', { exact: true }).fill('Reviewed the synthetic section 7 claim; no current event date or time is asserted.')
  await page.getByLabel('G09 Review result', { exact: true }).selectOption('PASS')
  await page.getByLabel('G09 Evidence note', { exact: true }).fill('All claims are explicitly synthetic and contain no unsupported source citations.')
  await page.getByLabel('G10 Review result', { exact: true }).selectOption('PASS')
  await page.getByLabel('G10 Evidence note', { exact: true }).fill('The ten synthetic sections and eight answers remain consistent and make no current-market claim.')
  await page.getByRole('button', { name: 'Save QA review revision', exact: true }).click()
  await expectRunRevision(page, runId, revision)
  await expect(page.getByText('QA review saved as a new immutable revision.', { exact: true })).toBeVisible()
  await expect(page.getByText('Pass', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Reviewer:', { exact: false }).first()).toBeVisible()
}

test('admin completes the synthetic research review and creates a protected member draft', async ({ page }) => {
  test.setTimeout(120_000)
  const trackingRequests: string[] = []
  page.on('request', request => {
    if (request.url().startsWith('https://tracking.example.invalid/')) trackingRequests.push(request.url())
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page)
  await configureSyntheticResearch(page)
  await openResearch(page)
  await expect(page.getByRole('link', { name: 'New research run', exact: true })).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/research-studio/list-1440.png', fullPage: true })

  await page.getByRole('link', { name: 'New research run', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'New research run', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Research profile', exact: true })).toContainText('Complete')
  await expect(page.getByRole('combobox', { name: 'Configured instrument', exact: true })).toContainText('SOXX')
  await expect(page.getByLabel('Use controlled synthetic evidence', { exact: true })).toBeChecked()
  await page.getByRole('textbox', { name: /^As of/ }).fill('2026-09-05T23:30')
  await page.getByRole('button', { name: 'Prepare evidence', exact: true }).click()
  // Wait for the server-created numeric run ID; `/admin/research/new` is also a route.
  await expect(page).toHaveURL(/\/admin\/research\/[1-9]\d*$/)
  const runId = new URL(page.url()).pathname.split('/').at(-1)!
  await expect(page.getByRole('heading', { name: /SOXX/ })).toBeVisible()
  await expect(page.getByText('Synthetic evidence is for offline engineering checks.', { exact: false })).toBeVisible()

  await page.getByRole('tab', { name: 'Evidence', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Coverage', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Source', exact: true })).toBeVisible()
  await expect(page.getByText('Search is not configured. No search request was made, and no results are available.')).toBeVisible()
  await expect(page.getByText('Raw-data redistribution', { exact: true }).first()).toBeVisible()
  const evidenceRights = page.locator('.research-source-details').first()
  await expect(evidenceRights).not.toHaveAttribute('open', '')
  await evidenceRights.locator('summary').click()
  await expect(evidenceRights.getByText('Conditions:', { exact: false }).first()).toBeVisible()
  await expect(evidenceRights.getByText('Basis:', { exact: false }).first()).toBeVisible()
  await expect(evidenceRights.getByText('Checked on:', { exact: false }).first()).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/research-studio/evidence-1440.png', fullPage: true })

  await page.getByRole('tab', { name: 'QA', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'QA', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /SOXX/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Generate draft', exact: true }).click()
  await expectRunRevision(page, runId, 1)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Approve exact revision', exact: true })).toBeDisabled()
  const editor = page.getByRole('textbox', { name: 'Markdown revision', exact: true })
  const originalContent = await editor.inputValue()
  const reviewedContent = `${originalContent}\n\nReviewed by the synthetic browser acceptance flow.\n\n![tracking fixture](https://tracking.example.invalid/pixel.png)`
  await editor.fill(reviewedContent)
  await page.getByRole('button', { name: 'Save revision', exact: true }).click()
  await expectRunRevision(page, runId, 2)
  await expect(page.getByText('Image hidden until review.', { exact: true })).toBeVisible()
  await expect(page.locator('img[src*="tracking.example.invalid"]')).toHaveCount(0)
  expect(trackingRequests).toEqual([])
  await completeSyntheticQaReview(page, runId, 3)
  await page.getByRole('button', { name: 'Approve exact revision', exact: true }).click()
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Create article draft', exact: true }).click()
  await expect(page.getByText('Linked article:', { exact: false })).toBeVisible()
  await expect(page.getByText('Draft · Members only', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update article draft', exact: true })).toBeEnabled()

  await page.getByRole('link', { name: 'Open article draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edit article', exact: true })).toBeVisible()
  await expect(page.locator('#article-access')).toHaveValue('MEMBER')
  await expect(page.getByLabel('Public teaser (optional)', { exact: true })).toHaveValue('')
  const linkedEditor = page.getByRole('textbox', { name: 'Content', exact: true })
  const linkedBody = await linkedEditor.inputValue()
  const editedBody = `${linkedBody}\n\nADMIN LINKED DRAFT EDIT: reviewed wording.`
  await linkedEditor.fill(editedBody)
  await page.getByLabel('Title', { exact: true }).fill('Reviewed linked SOXX draft')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible()
  await expect(page.locator('#article-access')).toHaveValue('MEMBER')

  await page.goto(`/admin/research/${encodeURIComponent(runId)}`)
  await expect(page.getByRole('button', { name: 'Import edited draft for review', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Import edited draft for review', exact: true }).click()
  await expectRunRevision(page, runId, 4)
  await completeSyntheticQaReview(page, runId, 5)
  await page.getByRole('button', { name: 'Approve exact revision', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Update article draft', exact: true })).toBeEnabled()
  await expect(page.locator('.research-next-action')).toContainText('Update article draft')
  await expect(page.locator('.research-actions-panel')).not.toContainText('A provider dispatch has already been used for this run.')
  await expect(page.locator('.research-actions-panel').getByRole('button', { name: 'Approve exact revision', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Update article draft', exact: true }).click()

  await page.getByRole('link', { name: 'Open article draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Edit article', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Reviewed linked SOXX draft')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(editedBody)
  await expect(page.locator('#article-access')).toHaveValue('MEMBER')
  await expect(page.getByLabel('Public teaser (optional)', { exact: true })).toHaveValue('')
  const articleId = new URL(page.url()).pathname.split('/').at(-2)!
  const publishResponse = await page.request.post(`/api/blog/admin/${encodeURIComponent(articleId)}/publish`, {
    headers: await csrfHeader(page),
    data: {},
  })
  expect(publishResponse.status()).toBe(409)
  expect(await publishResponse.json()).toMatchObject({ data: { code: 'RESEARCH_ARTICLE_PROVENANCE' } })
  const postAfterRejection = await (await page.request.get(`/api/blog/admin/${encodeURIComponent(articleId)}`)).json() as {
    title: string; content: string; excerpt: string | null; excerptAuthored: boolean; status: string; access: string
  }
  expect(postAfterRejection).toMatchObject({ title: 'Reviewed linked SOXX draft', content: editedBody, excerpt: null, excerptAuthored: false, status: 'DRAFT', access: 'MEMBER' })
  expect(trackingRequests).toEqual([])

  await page.goto(`/admin/research/${encodeURIComponent(runId)}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await selectTheme(page, 'dark')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/design/evidence/research-studio/detail-390-dark.png', fullPage: true })
  await page.getByRole('tab', { name: 'Evidence', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'docs/design/evidence/research-studio/evidence-390-dark.png', fullPage: true })
})

test('settings mask the provider key, expose read-only source policy, and recover from role and conflict errors', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page)
  await configureSyntheticResearch(page)
  await openResearch(page)

  const memberResponse = await page.request.post('/api/auth/login', { data: { email: memberEmail, password: memberPassword } })
  expect(memberResponse.status()).toBe(200)
  expect((await page.request.get('/api/admin/research/settings')).status()).toBe(403)
  await signIn(page)

  await page.route('**/api/admin/research/runs?*', async route => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, statusMessage: 'Synthetic list outage', data: { code: 'SYS_INTERNAL_ERROR', details: null, requestId: 'synthetic-list-outage' } }) })
  })
  await page.reload()
  await expect(page.getByText('The service could not complete this action. Your entries are preserved. Try again.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('error-code')).toHaveText('SYS_INTERNAL_ERROR')
  await page.unroute('**/api/admin/research/runs?*')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Research settings', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Research settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Research settings', exact: true })).toBeVisible()
  await expect(page.locator('input[readonly][value="openrouter/free"]')).toBeVisible()
  await expect(page.getByText('Masked', { exact: false })).toBeVisible()
  await expect(page.getByLabel(/Credential/)).toHaveValue('')
  await expect(page.getByTestId('research-source-availability')).toBeVisible()
  await expect(page.getByTestId('research-search-availability')).toBeVisible()
  await expect(page.getByText('Search credential: Yes', { exact: true })).toBeVisible()
  await expect(page.getByText('Search budget is not configured. No search request was made.', { exact: true })).toBeVisible()
  for (const purpose of ['Automated fetch', 'Evidence storage', 'LLM inference', 'Publication of analysis and excerpts', 'Raw-data redistribution']) {
    await expect(page.getByText(purpose, { exact: true }).first()).toBeVisible()
  }
  const settingsRights = page.locator('.research-settings-source-row details').first()
  await expect(settingsRights).not.toHaveAttribute('open', '')
  await settingsRights.locator('summary').click()
  await expect(settingsRights.getByText('Conditions:', { exact: false }).first()).toBeVisible()
  await expect(page.getByLabel('Research Studio enabled', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Generation enabled', { exact: true })).toBeChecked()

  const settingsResponse = await page.request.get('/api/admin/research/settings')
  const settings = await settingsResponse.json() as { runtime: { revision: number } }
  const concurrentUpdate = await page.request.put('/api/admin/research/runtime', {
    headers: await csrfHeader(page),
    data: { expectedRevision: settings.runtime.revision, generationEnabled: false },
  })
  expect(concurrentUpdate.status()).toBe(200)
  await page.getByLabel('Generation enabled', { exact: true }).click()
  await expect(page.getByLabel('Generation enabled', { exact: true })).not.toBeChecked()
  const afterRefresh = await (await page.request.get('/api/admin/research/settings')).json() as { runtime: { revision: number; generationEnabled: boolean } }
  expect(afterRefresh.runtime.generationEnabled).toBe(false)
  expect(afterRefresh.runtime.revision).toBeGreaterThan(settings.runtime.revision)
  await page.getByLabel('Generation enabled', { exact: true }).click()
  await expect(page.getByLabel('Generation enabled', { exact: true })).toBeChecked()
  const restored = await (await page.request.get('/api/admin/research/settings')).json() as { runtime: { revision: number; generationEnabled: boolean } }
  expect(restored.runtime.generationEnabled).toBe(true)
  expect(restored.runtime.revision).toBeGreaterThan(afterRefresh.runtime.revision)
  await page.screenshot({ path: 'docs/design/evidence/research-studio/settings-1440.png', fullPage: true })
})
