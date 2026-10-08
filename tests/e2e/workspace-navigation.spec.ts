import { randomUUID } from 'node:crypto'
import { expect, test, selectAccountLocale, selectLocale, selectTheme } from '../support/e2e'

const password = 'synthetic-workspace-navigation-password'

async function signIn(page: import('@playwright/test').Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectAccountLocale(page, 'en')
}

test('desktop workspace navigation keeps capture direct, keyboard capture independent and routes ordinary', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `workspace-desktop-${randomUUID()}@example.test`)

  const primary = page.locator('.desktop-nav')
  for (const [name, href] of [
    ['Overview', '/'], ['Diary library', '/diaries'], ['Timeline', '/timeline'], ['Calendar', '/calendar'], ['Review queue', '/reviews'], ['AI reports', '/reviews/ai-reports'], ['Trade plans', '/trade-plans'],
    ['Holdings', '/stocks'], ['Watchlist', '/stocks/watchlist'], ['Tools', '/tools'],
    ['Diary reminders', '/alerts'], ['Partner management', '/partners'],
  ] as const) {
    await expect(primary.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  }
  expect(await primary.locator('.nav-diary-view').evaluateAll(links => links.every(link => Math.round(link.getBoundingClientRect().height) >= 44))).toBe(true)
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
    const box = await page.locator(selector).evaluate(element => { const rect = element.getBoundingClientRect(); return { right: window.innerWidth - rect.right, left: rect.left, width: rect.width } })
    if (width === 1440) {
      expect(box.right).toBeGreaterThanOrEqual(30)
      expect(box.right).toBeLessThanOrEqual(34)
    } else {
      // Past the 1280px data cap the page stops widening and stays aligned to
      // the sidebar rather than centring in the remaining space.
      expect(box.width).toBeLessThanOrEqual(1281)
      expect(box.left).toBeGreaterThanOrEqual(240)
      expect(box.left).toBeLessThanOrEqual(260)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width === 1440) await page.screenshot({ path: `docs/design/evidence/navigation/${selector.slice(1)}-1440.png`, fullPage: true })
  }

  // Diary reminders and partner sharing are diary functions, so they are in the
  // open list rather than behind a "Diary management" disclosure.
  await expect(page.locator('.desktop-nav .nav-more').filter({ hasText: 'Diary management' })).toHaveCount(0)
  await expect(page.locator('.desktop-nav').getByRole('link', { name: 'Partner management', exact: true })).toBeVisible()
  await expect(page.locator('.desktop-nav').getByRole('link', { name: 'Diary reminders', exact: true })).toBeVisible()

  // Market research opens on a company, so the group leads with a lookup field;
  // an empty submit keeps the former fixed default reachable.
  const lookup = page.locator('.desktop-nav').getByTestId('nav-lookup-form')
  await expect(lookup.getByRole('textbox')).toHaveAttribute('placeholder', 'SPY')
  await lookup.getByRole('textbox').fill('nvda')
  await lookup.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(/\/stocks\/NVDA$/)
  await expect(lookup).toHaveAttribute('aria-current', 'page')
  await page.goto('/')
  await lookup.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(/\/stocks\/SPY$/)

  // Every tool the public header discloses is reachable from the workspace too.
  const toolShortcuts = page.locator('.desktop-nav .nav-more').filter({ hasText: 'Tools' })
  await toolShortcuts.locator('summary').click()
  await expect(toolShortcuts.getByRole('link', { name: 'SEC filings', exact: true })).toHaveAttribute('href', '/tools/sec-filings')
  await expect(toolShortcuts.getByRole('link')).toHaveCount(7)

  await page.goto('/partners/compare')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Timeline')
  await page.goto('/stocks/alerts')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Price reminders')
  await expect(page.locator('.desktop-nav .nav-more').filter({ hasText: 'Trade management' })).toHaveAttribute('open', '')
  await page.goto('/reviews')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText('Review queue')

  await page.goto('/')
  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.screenshot({ path: 'docs/design/evidence/navigation/user-sidebar-1440.png', fullPage: true })

  await page.setViewportSize({ width: 768, height: 900 })
  await expect(page.getByTestId('quick-entry')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('desktop workspace navigation marks the active route exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page, `workspace-desktop-active-${randomUUID()}@example.test`)

  for (const [path, active] of [
    ['/diaries/123/edit', 'Diary library'], ['/diaries/123/review', 'Review queue'], ['/reviews/ai-reports', 'AI reports'], ['/timeline', 'Timeline'], ['/calendar', 'Calendar'], ['/partners/compare', 'Timeline'],
    ['/partners', 'Partner management'], ['/stocks/watchlist', 'Watchlist'], ['/stocks/alerts', 'Price reminders'],
    ['/trade-plans/123', 'Trade plans'], ['/settings/security', 'Settings'],
  ] as const) {
    await page.goto(path)
    const marked = page.locator('.desktop-nav a[aria-current="page"], .desktop-preferences a[aria-current="page"]')
    await expect(marked).toHaveText(active)
    await expect(marked).toHaveCount(1)
  }

  await page.goto('/stocks/NVDA')
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveCount(0)
  await expect(page.locator('.desktop-nav').getByTestId('nav-lookup-form')).toHaveAttribute('aria-current', 'page')
})

test('mobile bottom navigation carries the whole diary loop without covering content @webkit-critical', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, `workspace-mobile-${randomUUID()}@example.test`)

  const diaryNavigation = page.getByTestId('mobile-diary-navigation')
  await expect(diaryNavigation).toBeVisible()
  // Five slots: capture, read (library, timeline, calendar) and review. The
  // label text is read from its own span so a review badge cannot join it.
  await expect(diaryNavigation.locator('a > span:last-child')).toHaveText(['Capture', 'Library', 'Timeline', 'Calendar', 'Reviews'])
  expect(await diaryNavigation.getByRole('link').evaluateAll(links => links.every(link => Math.round(link.getBoundingClientRect().height) >= 44))).toBe(true)

  // Capture goes to the low-friction path, not the full editor.
  await expect(diaryNavigation.locator('a').first()).toHaveAttribute('href', '/diaries/quick')
  await expect(diaryNavigation.locator('a').last()).toHaveAttribute('href', '/reviews')
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
  // Rounded: a fractional layout height is a sub-pixel artifact, not a target
  // smaller than the 44px minimum.
  expect(await dialog.locator('nav a').evaluateAll(links => links.every(link => Math.round(link.getBoundingClientRect().height) >= 44))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.press('Enter')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('link', { name: 'Partner management', exact: true }).click()
  await expect(page).toHaveURL(/\/partners$/)
  await expect(dialog).toBeHidden()

  await page.goto('/stocks')
  for (const [path, href] of [
    ['/diaries/quick', /\/diaries\/quick$/], ['/diaries', /\/diaries$/],
    ['/timeline', /\/timeline$/], ['/calendar', /\/calendar$/], ['/reviews', /\/reviews$/],
  ] as const) {
    await diaryNavigation.locator(`a[href="${path}"]`).click()
    await expect(page).toHaveURL(href)
    await expect(diaryNavigation.locator(`a[href="${path}"]`)).toHaveAttribute('aria-current', 'page')
    await page.goto('/stocks')
  }
  // The full editor keeps the capture slot marked, because that is the slot the
  // reader used to start writing.
  await page.goto('/diaries/new')
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible()
  await expect(diaryNavigation.locator('[aria-current="page"] > span:last-child')).toHaveText('Capture')
  const save = page.getByRole('button', { name: 'Save diary', exact: true })
  await save.scrollIntoViewIfNeeded()
  expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual((await diaryNavigation.boundingBox())!.y)
  expect(await diaryNavigation.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - window.innerHeight))).toBeLessThanOrEqual(1)
  await page.goto('/diaries/quick')
  await expect(diaryNavigation.locator('[aria-current="page"] > span:last-child')).toHaveText('Capture')
  const quickSave = page.getByRole('button', { name: 'Create diary', exact: true })
  await expect(quickSave).toBeVisible()
  await quickSave.scrollIntoViewIfNeeded()
  expect((await quickSave.boundingBox())!.y + (await quickSave.boundingBox())!.height).toBeLessThanOrEqual((await diaryNavigation.boundingBox())!.y)
  await page.goto('/calendar')
  await expect(page.locator('[data-heatdate]')).toHaveCount(371)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(await diaryNavigation.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - window.innerHeight))).toBeLessThanOrEqual(1)
  expect(await page.locator('.calendar-legend').last().evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual((await diaryNavigation.boundingBox())!.y)
  for (const [locale, labels] of [
    ['zh-TW', ['記錄', '日記庫', '時間軸', '日曆', '複盤']],
    ['zh-CN', ['记录', '日记库', '时间轴', '日历', '复盘']],
    ['en', ['Capture', 'Library', 'Timeline', 'Calendar', 'Reviews']],
  ] as const) {
    await page.setViewportSize({ width: 320, height: 640 })
    await selectAccountLocale(page, locale)
    await expect(diaryNavigation.locator('a > span:last-child')).toHaveText([...labels])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/diaries')
  await page.screenshot({ path: 'docs/design/evidence/navigation/mobile-diary-shortcuts-390.png', fullPage: false })
  await selectTheme(page, 'dark')
  await page.screenshot({ path: 'docs/design/evidence/navigation/mobile-bottom-nav-dark-390.png', fullPage: false })
  await selectTheme(page, 'light')

  await page.goto('/')
  await expect(diaryNavigation).toBeVisible()
  await trigger.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)

  await page.goto('/')
  await expect(diaryNavigation).toBeVisible()
  await trigger.click()
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
  await selectAccountLocale(page, 'en')
  const admin = page.locator('.desktop-nav .nav-group').filter({ has: page.getByRole('heading', { name: 'Administration', exact: true }) })
  await expect(page.locator('.desktop-nav .nav-group > h2')).toHaveText(['Diary & review', 'Investing & trading', 'Markets & tools', 'Account', 'Administration'])
  await expect(admin.getByRole('link')).toHaveText(['Article management', 'User management', 'Guru management', 'Institutional mappings', 'AI administration', 'Research Studio', 'ETF catalog', 'Mail settings'])
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

// Ticket 115: the sidebar's Quick diary is the global capture shortcut and is
// the one that stays filled. A page-level copy of the same link, to the same
// address, put two identical filled buttons on screen at once.
test('capture is filled once on a workspace page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const email = `capture-weight-${randomUUID()}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login?returnTo=%2Fdiaries')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries$/)
  await selectLocale(page, 'en')

  for (const path of ['/diaries', '/timeline']) {
    await page.goto(path)
    // Poll rather than count once: confirming the session swaps the chrome
    // around `main`, and a one-shot resolve can land mid-swap with nothing
    // matched at all.
    const capture = page.getByRole('link', { name: 'Quick diary', exact: true })
    await expect.poll(async () => capture.evaluateAll(links => links.filter(link => !link.className.includes('secondary')).length),
      { message: `one filled capture action on ${path}` }).toBe(1)
    await expect(page.getByTestId('quick-entry')).not.toHaveClass(/secondary/)
    await expect.poll(async () => page.locator('main').getByRole('link', { name: 'Quick diary', exact: true }).evaluateAll(links => links.filter(link => !link.className.includes('secondary')).length),
      { message: `no filled capture action inside main on ${path}` }).toBe(0)
  }
})

// Ticket 116: the sidebar's content measures ~1,720px against a 900px
// viewport, and it used to take Settings, Sign out and Preferences below the
// fold of a column that does not look like it scrolls.
test('the account controls stay in view however far the navigation scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const email = `sidebar-depth-${randomUUID()}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  await page.goto('/login?returnTo=%2Ftimeline')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await selectLocale(page, 'en')

  const sidebar = page.locator('.sidebar')
  const visible = async () => sidebar.evaluate((aside, height) => {
    const block = aside.querySelector('.desktop-preferences')!
    const inside = (node: Element | null) => { if (!node) return false; const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= height + 1 }
    return {
      settings: inside(block.querySelector('a[href="/settings"]')),
      signOut: inside(block.querySelector('[data-testid="sign-out"]')),
      preferences: inside(block.querySelector('summary')),
      scrolls: aside.scrollHeight > aside.clientHeight,
    }
  }, 900)

  // The list is longer than the viewport — that is the condition, not the bug.
  expect((await visible()).scrolls).toBe(true)
  expect(await visible()).toMatchObject({ settings: true, signOut: true, preferences: true })
  await sidebar.evaluate(aside => { aside.scrollTop = aside.scrollHeight })
  expect(await visible()).toMatchObject({ settings: true, signOut: true, preferences: true })

  // The diary loop stays at the top of the list and never behind a disclosure.
  const library = page.locator('.desktop-nav').getByRole('link', { name: 'Diary library', exact: true })
  await expect(library).toBeVisible()
  expect(await library.evaluate(node => node.closest('details') === null)).toBe(true)
})
