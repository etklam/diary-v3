import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect, selectLocale, signOut } from '../support/e2e'

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('article access protects SSR, login returns, logout, editor transitions, and mobile reading', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  expect((await page.request.post('/api/auth/login', { data: { email: 'etf-admin@example.test', password: 'synthetic-etf-admin-password' } })).status()).toBe(200)
  await page.goto('/articles')
  await selectLocale(page, 'en')
  const key = randomUUID()
  const sentinel = `PROTECTED_BODY_${key}`
  const created: Record<string, { id: string; slug: string; title: string }> = {}
  for (const access of ['PUBLIC', 'MEMBER']) {
    await page.goto('/admin/blog/new')
    await expect(page.locator('#article-access')).toHaveValue('MEMBER')
    await page.getByLabel('Title', { exact: true }).fill(`${access} synthetic research ${key}`)
    await page.getByLabel('Content', { exact: true }).fill(access === 'MEMBER' ? sentinel : `Public research ${key}`)
    if (access === 'PUBLIC') await page.getByLabel('Public teaser (optional)', { exact: true }).fill('An intentionally public research introduction.')
    await page.locator('#article-access').selectOption(access)
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/blog\/\d+\/edit$/)
    const id = page.url().match(/\/blog\/(\d+)\/edit$/)![1]!
    const draft = await (await page.request.get(`/api/blog/admin/${id}`)).json()
    expect(draft).toMatchObject({ status: 'DRAFT', access })
    await page.locator('footer').getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.getByRole('heading', { name: draft.title })).toBeVisible()
    await page.getByRole('button', { name: 'Return to editing' }).click()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByText('Article published.', { exact: true })).toBeVisible()
    created[access] = { id, slug: draft.slug, title: draft.title }
  }
  const adminCsrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value ?? ''
  const translatedPublicTitle = `English ${created.PUBLIC!.title}`
  const translationPath = `/api/blog/admin/${created.PUBLIC!.id}/translations/en`
  const translationEdit = await page.request.put(translationPath, {
    headers: { 'x-csrf-token': adminCsrf },
    data: { title: translatedPublicTitle, excerpt: 'English translation teaser.', content: `Public research ${key}` },
  })
  expect(translationEdit.status(), await translationEdit.text()).toBe(200)
  expect((await page.request.post(`${translationPath}/review`, { headers: { 'x-csrf-token': adminCsrf }, data: {} })).status()).toBe(200)
  expect((await page.request.post(`${translationPath}/publish`, { headers: { 'x-csrf-token': adminCsrf }, data: {} })).status()).toBe(200)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await fits(page)
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `.impeccable/review/article-access-editor-${width}.png`, fullPage: true })
    if (width === 390) {
      await page.screenshot({ path: '.impeccable/review/article-access-editor-mobile-top.png' })
      await page.locator('#article-access').scrollIntoViewIfNeeded()
      await page.locator('#article-access').focus()
      await page.screenshot({ path: '.impeccable/review/article-access-editor-mobile-controls.png' })
    }
  }
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const reader = await guestContext.newPage()
  try {
    expect((await reader.goto('/articles'))?.status()).toBe(200)
    await expect(reader.getByRole('heading', { name: created.PUBLIC!.title, exact: true })).toBeVisible()
    await selectLocale(reader, 'en')
    await expect(reader.getByRole('heading', { name: translatedPublicTitle, exact: true })).toBeVisible()
    await reader.goto('/articles?lang=zh-TW')
    await expect(reader.getByRole('heading', { name: created.PUBLIC!.title, exact: true })).toBeVisible()
    await selectLocale(reader, 'zh-TW')
    await selectLocale(reader, 'en')
    await expect(reader.getByRole('heading', { name: created.PUBLIC!.title, exact: true })).toBeVisible()
    await expect(reader.getByRole('link', { name: created.PUBLIC!.title, exact: true }).first()).toHaveAttribute('href', `/articles/${created.PUBLIC!.slug}?lang=zh-TW`)
    await reader.goto('/articles')
    await expect(reader.getByRole('heading', { name: translatedPublicTitle, exact: true })).toBeVisible()
    await expect(reader.getByRole('heading', { name: created.MEMBER!.title, exact: true })).toBeVisible()
    await reader.goto(`/articles?search=absent${key.replaceAll('-', '')}`)
    await expect(reader.getByText('No published articles match these filters.', { exact: true })).toBeVisible()
    const publicPath = `/articles/${created.PUBLIC!.slug}`
    const memberPath = `/articles/${created.MEMBER!.slug}`
    const memberReaderPath = `${memberPath}?lang=en`
    const firstPublic = await reader.goto(publicPath)
    expect(firstPublic?.headers()['cache-control']).toContain('no-store')
    await expect(reader.locator('.safe-markdown')).toContainText(`Public research ${key}`)
    await reader.reload()
    await expect(reader.locator('.safe-markdown')).toContainText(`Public research ${key}`)
    let releaseRefresh: (() => void) | undefined
    const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve })
    let refreshStarted = false
    let refreshCompleted = false
    let delayNextRefresh = true
    const publicApiRoute = `**/api/blog/${created.PUBLIC!.slug}`
    await reader.route(publicApiRoute, async route => {
      if (!delayNextRefresh) { await route.continue(); return }
      delayNextRefresh = false
      refreshStarted = true
      const response = await route.fetch()
      await refreshGate
      await route.fulfill({ response })
      refreshCompleted = true
    })
    await reader.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect.poll(() => refreshStarted).toBe(true)
    await expect(reader.locator('.safe-markdown')).toContainText(`Public research ${key}`)
    releaseRefresh!()
    await expect.poll(() => refreshCompleted).toBe(true)
    await reader.unroute(publicApiRoute)
    await expect(reader.locator('.safe-markdown')).toContainText(`Public research ${key}`)
    await reader.route(publicApiRoute, route => route.fulfill({ status: 503, body: 'Synthetic outage' }))
    await reader.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(reader.getByRole('alert')).toContainText('The article could not be updated')
    await expect(reader.locator('.safe-markdown')).toContainText(`Public research ${key}`)
    await reader.unroute(publicApiRoute)
    const locked = await reader.goto(memberReaderPath)
    expect(locked?.status()).toBe(200)
    expect(await locked!.text()).not.toContain(sentinel)
    await expect(reader.getByRole('heading', { name: /Members only|僅限會員|仅限会员/, exact: true })).toBeVisible()
    await expect.poll(() => reader.content()).not.toContain(sentinel)
    const expectedReturnTo = encodeURIComponent(memberReaderPath)
    const signInLink = reader.locator('.article-lock').getByRole('link', { name: 'Sign in', exact: true })
    const registerLink = reader.locator('.article-lock').getByRole('link', { name: 'Create account', exact: true })
    await expect(signInLink).toHaveAttribute('href', `/login?returnTo=${expectedReturnTo}`)
    await expect(registerLink).toHaveAttribute('href', `/register?returnTo=${expectedReturnTo}`)
    for (const width of [1440, 390]) {
      await reader.setViewportSize({ width, height: 900 })
      await fits(reader)
      await reader.screenshot({ path: `.impeccable/review/article-access-reader-${width}.png`, fullPage: true })
    }
    await registerLink.click()
    await expect(reader).toHaveURL(`/register?returnTo=${expectedReturnTo}`)
    const email = `article-reader-${key}@example.test`, password = 'synthetic-reader-password'
    await reader.getByLabel('Email', { exact: true }).fill(email)
    await reader.getByLabel('Password', { exact: true }).fill(password)
    await reader.getByRole('button', { name: 'Create account', exact: true }).click()
    const registrationSignIn = reader.locator('.form-page').getByRole('link', { name: 'Sign in', exact: true })
    await expect(registrationSignIn).toHaveAttribute('href', `/login?returnTo=${expectedReturnTo}`)
    await registrationSignIn.click()
    await expect(reader).toHaveURL(`/login?returnTo=${expectedReturnTo}`)
    await reader.getByLabel('Email', { exact: true }).fill(email)
    await reader.getByLabel('Password', { exact: true }).fill(password)
    const loginResponsePromise = reader.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login')
    await reader.getByRole('button', { name: 'Sign in', exact: true }).click()
    const loginResponse = await loginResponsePromise
    expect(loginResponse.status(), await loginResponse.text()).toBe(200)
    await expect(reader).toHaveURL(url => `${url.pathname}${url.search}` === memberReaderPath)
    await expect(reader.locator('.safe-markdown')).toContainText(sentinel)
    const authenticated = await reader.reload()
    expect(await authenticated!.text()).toContain(sentinel)
    expect(authenticated?.headers()['cache-control']).toContain('no-store')
    await expect(reader.locator('.safe-markdown')).toContainText(sentinel)

    await expect(reader.locator('header .lede')).toContainText(sentinel.replaceAll('_', ''))
    let releaseMetadata: (() => void) | undefined
    const metadataGate = new Promise<void>(resolve => { releaseMetadata = resolve })
    let metadataRequested = false
    const memberDetailRoute = `**/api/blog/${created.MEMBER!.slug}*`
    const memberMetadataRoute = `**/api/blog/${created.MEMBER!.slug}/metadata*`
    await reader.route(memberDetailRoute, route => route.fulfill({ status: 401, body: 'Synthetic revoked access' }))
    await reader.route(memberMetadataRoute, async route => {
      metadataRequested = true
      await metadataGate
      await route.fulfill({ status: 503, body: 'Synthetic metadata outage' })
    })
    await reader.getByRole('button', { name: /Refresh|重新整理|刷新/, exact: true }).click()
    await expect.poll(() => metadataRequested).toBe(true)
    await expect(reader.locator('.safe-markdown')).toHaveCount(0)
    await expect(reader.locator('header .lede')).toHaveCount(0)
    await expect(reader.getByText(sentinel, { exact: false })).toHaveCount(0)
    releaseMetadata!()
    await expect(reader.getByRole('alert')).toContainText(/This article is no longer available|這篇文章目前無法使用|这篇文章目前无法使用/)
    await reader.unroute(memberDetailRoute)
    await reader.unroute(memberMetadataRoute)
    await reader.getByRole('button', { name: /Refresh|重新整理|刷新/, exact: true }).click()
    await expect(reader.locator('.safe-markdown')).toContainText(sentinel)

    const departedReader = await guestContext.newPage()
    await departedReader.goto(memberPath)
    await departedReader.getByRole('link', { name: /All articles|全部文章/, exact: true }).click()
    await expect(departedReader).toHaveURL(/\/articles$/)
    expect(await departedReader.content()).toContain(sentinel)
    const otherTab = await guestContext.newPage()
    await otherTab.goto('/timeline')
    await selectLocale(otherTab, 'en')
    let finishLogout: (() => void) | undefined
    const pendingLogout = new Promise<void>(resolve => { finishLogout = resolve })
    await otherTab.route('**/api/auth/logout', async route => { await pendingLogout; await route.continue() })
    await signOut(otherTab)
    await expect(reader.getByRole('heading', { name: /Members only|僅限會員|仅限会员/, exact: true })).toBeVisible()
    await expect(reader.locator('.safe-markdown')).toHaveCount(0)
    finishLogout!()
    await expect.poll(async () => (await reader.request.get(`/api/blog/${created.MEMBER!.slug}`)).status()).toBe(401)
    await expect.poll(() => reader.content()).not.toContain(sentinel)
    await expect.poll(() => departedReader.content()).not.toContain(sentinel)
    await departedReader.close()
    await reader.reload()
    expect(await reader.content()).not.toContain(sentinel)
    await expect(reader.getByRole('heading', { name: /Members only|僅限會員|仅限会员/, exact: true })).toBeVisible()
    await reader.goto(publicPath)
    await expect(reader.locator('.safe-markdown')).toContainText(`Public research ${key}`)
    await otherTab.close()

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/admin/blog/${created.PUBLIC!.id}/edit`)
    await page.locator('#article-access').selectOption('MEMBER')
    await page.getByRole('button', { name: 'Update article', exact: true }).click()
    await expect(page.getByText('Published article updated.', { exact: true })).toBeVisible()
    expect((await reader.request.get(`/api/blog/${created.PUBLIC!.slug}`)).status()).toBe(401)
    await reader.reload()
    await expect(reader.getByRole('heading', { name: /Members only|僅限會員|仅限会员/, exact: true })).toBeVisible()
    expect(await reader.content()).not.toContain(`Public research ${key}`)
    await page.locator('#article-access').selectOption('PUBLIC')
    await page.getByRole('button', { name: 'Update article', exact: true }).click()
    await expect(page.getByText('Published article updated.', { exact: true })).toBeVisible()
    await reader.reload()
    await expect(reader.locator('.safe-markdown')).toContainText(`Public research ${key}`)
    await page.getByRole('button', { name: 'Archive article', exact: true }).click()
    await expect(page.getByText('Article archived and no longer public.', { exact: true })).toBeVisible()
    expect((await reader.goto(publicPath))?.status()).toBe(404)
    await reader.goto('/articles')
    await expect(reader.getByRole('heading', { name: created.PUBLIC!.title, exact: true })).toHaveCount(0)
    expect(await (await reader.request.get('/sitemap.xml')).text()).not.toContain(created.PUBLIC!.slug)
    await reader.goto('/articles/nonexistent-synthetic-article')
    await expect(reader.locator('body')).toContainText(/could not be found|找不到|不存在/i)
  } finally { await guestContext.close() }
})
