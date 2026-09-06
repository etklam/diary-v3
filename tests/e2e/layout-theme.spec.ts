import { randomUUID } from 'node:crypto'
import { expect, selectLocale, selectTheme, test } from '../support/e2e'

const gutters = new Map([
  [1440, '32px'],
  [768, '24px'],
  [390, '16px'],
  [320, '16px'],
])

test('public direct routes load their stylesheet and share the responsive gutter', async ({ page }) => {
  const stylesheetResponses: Array<{ url: string; status: number }> = []
  page.on('response', response => {
    const url = response.url()
    const isStylesheet = response.request().resourceType() === 'stylesheet' || /\.css(?:[?#]|$)/i.test(url)
    if (isStylesheet) stylesheetResponses.push({ url, status: response.status() })
  })

  for (const width of gutters.keys()) {
    const expectedGutter = gutters.get(width)!
    await page.setViewportSize({ width, height: 844 })
    const response = await page.goto('/login')
    expect(response?.status(), `login at ${width}px`).toBe(200)
    await expect(page.locator('.public-header')).toBeVisible()
    await expect(page.locator('.form-page')).toBeVisible()
    await expect.poll(
      () => page.locator('.public-header').evaluate(element => getComputedStyle(element).paddingLeft),
      { message: `public CSS is applied at ${width}px` },
    ).toBe(expectedGutter)

    const values = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const header = document.querySelector('.public-header')
      const main = document.querySelector('.public-shell > main')
      const form = document.querySelector('.public-shell > main > .form-page')
      return {
        gutter: root.getPropertyValue('--page-gutter').trim(),
        headerPadding: header ? getComputedStyle(header).paddingLeft : null,
        mainPadding: main ? getComputedStyle(main).paddingLeft : null,
        formPadding: form ? getComputedStyle(form).paddingLeft : null,
      }
    })

    expect(values.gutter).toBe(expectedGutter)
    expect(values.headerPadding).toBe(expectedGutter)
    expect(values.formPadding).toBe(expectedGutter)
    expect(values.mainPadding).toBe('0px')
  }

  expect(stylesheetResponses.length).toBeGreaterThan(0)
  expect(stylesheetResponses.every(({ status }) => status === 200), stylesheetResponses.map(({ status, url }) => `${status} ${url}`).join('\n')).toBe(true)
})

test('workspace page header and section cards share one alignment line', async ({ page }) => {
  const email = `align-${randomUUID()}@example.test`
  const password = 'synthetic-align-password'
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/new$/)
  await selectLocale(page, 'en')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(300)
    const edges = await page.evaluate(() => {
      const left = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().left ?? null
      return { header: left('.overview-header'), card: left('.overview-section'), main: left('.app-shell > main') }
    })
    expect(edges.header).not.toBeNull()
    expect(edges.card).toBeCloseTo(edges.header ?? 0, 0)
  }
})

test('mobile preferences stay in Menu while keyboard quick diary remains available', async ({ page }) => {
  const email = `layout-${randomUUID()}@example.test`
  const password = 'synthetic-layout-password'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.request.post('/api/auth/register', { data: { email, password } })
  await page.goto('/login')
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/new$/)
  await selectLocale(page, 'en')

  await expect(page.getByTestId('locale-select')).toBeHidden()
  await expect(page.getByTestId('theme-select')).toBeHidden()
  await expect(page.getByTestId('quick-entry')).toBeHidden()

  const menu = page.getByTestId('mobile-menu-dialog')
  await page.getByTestId('mobile-menu').click()
  await expect(menu).toBeVisible()
  await expect(menu.getByTestId('mobile-locale-select')).toBeVisible()
  await expect(menu.getByTestId('mobile-theme-select')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  await selectTheme(page, 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#17191d')

  await page.keyboard.press('Control+j')
  const quickDialog = page.locator('dialog.capture-dialog')
  await expect(quickDialog).toBeVisible()
  await quickDialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(quickDialog).toBeHidden()
})
