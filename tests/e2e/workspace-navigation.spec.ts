import { randomUUID } from 'node:crypto'
import { expect, test, selectLocale, selectTheme } from '../support/e2e'

const password = 'synthetic-workspace-navigation-password'

async function signIn(page: import('@playwright/test').Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectLocale(page, 'en')
}

test('desktop workspace navigation keeps capture direct, keyboard capture independent and routes ordinary', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `workspace-desktop-${randomUUID()}@example.test`)

  const primary = page.locator('.desktop-nav')
  for (const [name, href] of [
    ['Overview', '/'], ['Diary library', '/diaries'], ['Timeline', '/timeline'], ['Calendar', '/calendar'], ['Review queue', '/reviews'], ['AI reports', '/reviews/ai-reports'], ['Trade plans', '/trade-plans'],
    ['Holdings', '/stocks'], ['Watchlist', '/stocks/watchlist'], ['Market research', '/stocks/SPY'], ['Tools', '/tools'],
  ] as const) {
    await expect(primary.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }
  expect(await primary.locator('.nav-diary-view').evaluateAll(links => links.every(link => link.getBoundingClientRect().height >= 44))).toBe(true)
  await expect(primary.getByRole('link', { name: 'Public articles', exact: true })).toHaveAttribute('href', '/articles')
  await expect(primary.locator('.nav-group > h2')).toHaveText(['Diary & review', 'Investing & trading', 'Markets & tools', 'Account'])
  await expect(primary.getByText('Daily work', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('quick-entry')).toHaveAttribute('href', '/diaries/quick')

  const disclosure = page.locator('.desktop-quick-entry .quick-capture-disclosure')
  await expect(disclosure.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveCount(0)
  await disclosure.locator('summary').click()
  await expect(disclosure.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveAttribute('href', '/diaries/new')

  await page.getByTestId('quick-entry').focus()
  await expect(disclosure.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveCount(0)
  await page.keyboard.press('Control+j')
  const captureDialog = page.getByRole('dialog')
  await expect(captureDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(captureDialog).toBeHidden()
  await expect(page.getByTestId('quick-entry')).toBeFocused()

  await primary.getByRole('link', { name: 'Diary library', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries$/)
  await expect(primary.getByRole('link', { name: 'Diary library', exact: true })).toHaveAttribute('aria-current', 'page')
  await primary.getByRole('link', { name: 'Timeline', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await expect(primary.getByRole('link', { name: 'Timeline', exact: true })).toHaveAttribute('aria-current', 'page')
  await primary.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/\/calendar$/)
  await expect(primary.getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Calendar')

  await page.goto('/stocks')
  for (const [name, href] of [['Diary library', '/diaries'], ['Timeline', '/timeline'], ['Calendar', '/calendar']] as const) {
    await primary.getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${href.replaceAll('/', '\\/')}$`))
    await expect(primary.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page')
    await page.goto('/stocks')
  }

  for (const [width, path, selector] of [
    [1440, '/diaries', '.diary-library'], [1440, '/timeline', '.diary-timeline'], [1440, '/calendar', '.diary-calendar'],
    [1920, '/diaries', '.diary-library'], [1920, '/timeline', '.diary-timeline'], [1920, '/calendar', '.diary-calendar'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(path)
    const rightGap = await page.locator(selector).evaluate(element => window.innerWidth - element.getBoundingClientRect().right)
    expect(rightGap).toBeGreaterThanOrEqual(30)
    expect(rightGap).toBeLessThanOrEqual(34)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width === 1440) await page.screenshot({ path: `docs/design/evidence/navigation/${selector.slice(1)}-1440.png`, fullPage: true })
  }

  const diaryManagement = page.locator('.desktop-nav .nav-more').filter({ hasText: 'Diary management' })
  await diaryManagement.locator('summary').click()
  await expect(diaryManagement.getByRole('link', { name: 'Partner management', exact: true })).toBeVisible()
  await expect(diaryManagement.getByRole('link', { name: 'Diary reminders', exact: true })).toHaveAttribute('href', '/alerts')

  await page.goto('/partners/compare')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Timeline')
  await page.goto('/stocks/alerts')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Price reminders')
  await expect(page.locator('.desktop-nav .nav-more').filter({ hasText: 'Trade management' })).toHaveAttribute('open', '')
  await page.goto('/reviews')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Review queue')

  for (const [path, active] of [
    ['/diaries/123/edit', 'Diary library'], ['/diaries/123/review', 'Review queue'], ['/reviews/ai-reports', 'AI reports'], ['/timeline', 'Timeline'], ['/calendar', 'Calendar'], ['/partners/compare', 'Timeline'],
    ['/partners', 'Partner management'], ['/stocks/watchlist', 'Watchlist'], ['/stocks/alerts', 'Price reminders'],
    ['/stocks/NVDA', 'Market research'], ['/trade-plans/123', 'Trade plans'], ['/settings/security', 'Settings'],
  ] as const) {
    await page.goto(path)
    await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText(active)
    await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveCount(1)
  }
  await page.goto('/')
  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.screenshot({ path: 'docs/design/evidence/navigation/user-sidebar-1440.png', fullPage: true })

  await page.setViewportSize({ width: 768, height: 900 })
  await expect(page.getByTestId('quick-entry')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('mobile bottom navigation keeps diary views and writing reachable without covering content @webkit-critical', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, `workspace-mobile-${randomUUID()}@example.test`)

  const diaryNavigation = page.getByTestId('mobile-diary-navigation')
  await expect(diaryNavigation).toBeVisible()
  await expect(diaryNavigation.getByRole('link')).toHaveText(['Diary library', 'Timeline', 'Calendar', 'Write diary'])
  expect(await diaryNavigation.getByRole('link').evaluateAll(links => links.every(link => link.getBoundingClientRect().height >= 44))).toBe(true)

  await expect(diaryNavigation.getByRole('link', { name: 'Write diary', exact: true })).toHaveAttribute('href', '/diaries/new')
  expect(await diaryNavigation.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - window.innerHeight))).toBeLessThanOrEqual(1)
  await expect(page.locator('.sidebar .mobile-diary-navigation')).toHaveCount(0)

  const trigger = page.getByTestId('mobile-menu')
  await trigger.focus()
  await trigger.press('Enter')
  const dialog = page.getByTestId('mobile-menu-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Timeline', exact: true })).toHaveCount(0)
  await expect(dialog.getByTestId('mobile-quick-entry')).toHaveAttribute('href', '/diaries/quick')
  await expect(dialog.getByRole('link', { name: 'Write a full diary', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('href', '/')
  await expect(dialog.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings')
  await expect(dialog.getByRole('link', { name: 'Public articles', exact: true })).toHaveAttribute('href', '/articles')
  expect(await dialog.locator('nav a').evaluateAll(links => links.every(link => link.getBoundingClientRect().height >= 44))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.press('Enter')
  await expect(dialog).toBeVisible()
  await dialog.locator('.nav-more > summary').filter({ hasText: 'Diary management' }).click()
  await dialog.getByRole('link', { name: 'Partner management', exact: true }).click()
  await expect(page).toHaveURL(/\/partners$/)
  await expect(dialog).toBeHidden()

  await page.goto('/stocks')
  for (const [name, href] of [['Diary library', /\/diaries$/], ['Timeline', /\/timeline$/], ['Calendar', /\/calendar$/], ['Write diary', /\/diaries\/new$/]] as const) {
    await diaryNavigation.getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(href)
    await expect(diaryNavigation.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page')
    await page.goto('/stocks')
  }
  await diaryNavigation.getByRole('link', { name: 'Write diary', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible()
  await expect(diaryNavigation.locator('[aria-current="page"]')).toHaveText('Write diary')
  const save = page.getByRole('button', { name: 'Save diary', exact: true })
  await save.scrollIntoViewIfNeeded()
  expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual((await diaryNavigation.boundingBox())!.y)
  expect(await diaryNavigation.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - window.innerHeight))).toBeLessThanOrEqual(1)
  await page.goto('/diaries/quick')
  await expect(diaryNavigation.locator('[aria-current="page"]')).toHaveText('Write diary')
  const quickSave = page.getByRole('button', { name: 'Create diary', exact: true })
  await expect(quickSave).toBeVisible()
  await quickSave.scrollIntoViewIfNeeded()
  expect((await quickSave.boundingBox())!.y + (await quickSave.boundingBox())!.height).toBeLessThanOrEqual((await diaryNavigation.boundingBox())!.y)
  await page.goto('/calendar')
  await expect(page.locator('[data-heatdate]')).toHaveCount(371)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(await diaryNavigation.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - window.innerHeight))).toBeLessThanOrEqual(1)
  expect(await page.locator('.calendar-legend').evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual((await diaryNavigation.boundingBox())!.y)
  for (const [locale, labels] of [
    ['zh-TW', ['日記庫', '時間軸', '日曆', '寫日記']],
    ['zh-CN', ['日记库', '时间轴', '日历', '写日记']],
    ['en', ['Diary library', 'Timeline', 'Calendar', 'Write diary']],
  ] as const) {
    await page.setViewportSize({ width: 320, height: 640 })
    await selectLocale(page, locale)
    await expect(diaryNavigation.getByRole('link')).toHaveText([...labels])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/diaries')
  await page.screenshot({ path: 'docs/design/evidence/navigation/mobile-diary-shortcuts-390.png', fullPage: false })
  await selectTheme(page, 'dark')
  await page.screenshot({ path: 'docs/design/evidence/navigation/mobile-bottom-nav-dark-390.png', fullPage: false })
  await selectTheme(page, 'light')

  await page.goto('/')
  await trigger.press('Enter')
  await dialog.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)

  await page.goto('/')
  await trigger.press('Enter')
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: 'docs/design/evidence/navigation/mobile-drawer-390.png', fullPage: true })
  await dialog.getByRole('link', { name: 'Tools', exact: true }).click()
  await expect(page).toHaveURL(/\/tools$/)
  await expect(dialog).toBeHidden()
})

test('admin navigation is role-gated and ordered with article management first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  expect((await page.request.post('/api/auth/login', { data: { email: 'etf-admin@example.test', password: 'synthetic-etf-admin-password' } })).status()).toBe(200)
  await page.goto('/admin/blog/new')
  await selectLocale(page, 'en')
  const admin = page.locator('.desktop-nav .nav-group').filter({ has: page.getByRole('heading', { name: 'Administration', exact: true }) })
  await expect(page.locator('.desktop-nav .nav-group > h2')).toHaveText(['Diary & review', 'Investing & trading', 'Markets & tools', 'Account', 'Administration'])
  await expect(admin.getByRole('link')).toHaveText(['Article management', 'User management', 'AI administration', 'Research Studio', 'ETF catalog'])
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Article management')
  await page.goto('/admin/blog/123/edit')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Article management')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveCount(1)
  await page.goto('/admin/blog/new')
  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.screenshot({ path: 'docs/design/evidence/navigation/admin-sidebar-1440.png', fullPage: true })

  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 720 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
