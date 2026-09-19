import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, openQuickOptions, selectLocale, signOut, test } from '../support/e2e'

const password = 'synthetic-quick-authoring-follow-up-password'
const evidenceDir = 'docs/design/evidence/convenience-follow-up'

type Diary = {
  id: string
  date: string
  title: string
  content: string
  tags: string[]
  stockSymbols: string[]
}

async function register(page: Page, email: string) {
  const response = await page.request.post('/api/auth/register', { data: { email, password } })
  expect(response.status()).toBe(200)
}

async function signIn(page: Page, email: string, returnPath = '/diaries/quick') {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnPath)}`)
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${returnPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  await selectLocale(page, 'en')
}

async function startAccount(page: Page, returnPath = '/diaries/quick') {
  const email = `quick-authoring-follow-up-${randomUUID()}@example.test`
  await register(page, email)
  await signIn(page, email, returnPath)
  return email
}

async function csrf(page: Page) {
  const value = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value
  expect(value).toBeTruthy()
  return { 'x-csrf-token': value! }
}

async function createDiary(page: Page, input: Record<string, unknown>): Promise<Diary> {
  const response = await page.request.post('/api/diaries', { headers: await csrf(page), data: input })
  expect(response.status()).toBe(201)
  return await response.json() as Diary
}

async function readDiary(page: Page, id: string): Promise<Diary> {
  const response = await page.request.get(`/api/diaries/${id}`)
  expect(response.status()).toBe(200)
  return await response.json() as Diary
}

async function capture(page: Page, name: string, width: number) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await page.screenshot({ path: `${evidenceDir}/${name}-${width}.png`, fullPage: true })
}

test('Quick lookup ignores a stale date response and keeps the append target authoritative', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startAccount(page)
  const oldDate = '2026-10-03'
  const newDate = '2026-10-04'
  const existing = await createDiary(page, { date: oldDate, title: 'Stale target', content: 'Target body' })
  let releaseOld!: () => void
  let oldRequested = false
  let holdFirstOld = true
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve })
  await page.route('**/api/diaries/by-date?*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date')
    if (date === oldDate && holdFirstOld) {
      holdFirstOld = false
      oldRequested = true
      await oldGate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(existing) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(date === oldDate ? existing : null),
    })
  })
  await page.goto(`/diaries/quick?date=${oldDate}`, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => oldRequested).toBe(true)
  await openQuickOptions(page)
  await page.getByLabel('Diary date', { exact: true }).fill(newDate)
  await expect(page.getByRole('combobox', { name: 'Save mode', exact: true })).toHaveValue('create')
  releaseOld()
  await expect(page.getByRole('combobox', { name: 'Save mode', exact: true })).toHaveValue('create')
  await expect(page.getByTestId('quick-existing-destination')).toHaveCount(0)

  await page.getByLabel('Diary date', { exact: true }).fill(oldDate)
  await expect(page.getByTestId('quick-existing-destination')).toContainText('Stale target')
  await expect(page.getByRole('combobox', { name: 'Save mode', exact: true })).toHaveValue('append')
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  if (await title.count()) expect(await title.isEditable()).toBe(false)
  else expect(await title.count()).toBe(0)
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Stale lookup append')
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Open diary', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/diaries/${existing.id}$`))
  expect((await readDiary(page, existing.id)).content).toContain('Stale lookup append')
  await capture(page, 'quick-stale-lookup', 390)
  await page.unroute('**/api/diaries/by-date?*')
})

test('Quick uncertain append is durable, inspectable and never replayed after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startAccount(page)
  const existing = await createDiary(page, { date: '2026-10-14', title: 'Uncertain target', content: 'Original body' })
  await page.goto(`/diaries/quick?date=${existing.date}`)
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Write once only')
  let postCount = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() === 'POST') {
      postCount += 1
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByRole('link', { name: 'Inspect saved diary', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check existing diary again', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Append to date', exact: true })).toBeDisabled()
  expect(postCount).toBe(1)
  expect((await readDiary(page, existing.id)).content).toBe('Original body')
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => {
    const raw = localStorage.getItem(key)
    return key.startsWith('diary-quick-draft:') && raw ? JSON.parse(raw).value?.uncertain === true : false
  }))).toBe(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore saved draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Append to date', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Inspect saved diary', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check existing diary again', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Check existing diary again', exact: true }).click()
  await expect(page.getByTestId('quick-existing-destination')).toContainText('Uncertain target')
  expect(postCount).toBe(1)
  await capture(page, 'quick-uncertain-recovery', 1440)
  await page.unroute('**/api/diaries')
})

test('Quick in-flight append keeps its marker across reload without replay', async ({ page }) => {
  await startAccount(page)
  const existing = await createDiary(page, { date: '2026-10-14', title: 'In-flight target', content: 'Original body' })
  await page.goto(`/diaries/quick?date=${existing.date}`)
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Reload while the append is pending')
  let postCount = 0
  let started!: () => void
  let release!: () => void
  const requestStarted = new Promise<void>(resolve => { started = resolve })
  const responseGate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    postCount += 1
    started()
    await responseGate
    try { await route.abort('failed') } catch { /* Reload may already have cancelled the request. */ }
  })
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await requestStarted
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore saved draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Append to date', exact: true })).toBeDisabled()
  expect(postCount).toBe(1)
  release()
  await page.unroute('**/api/diaries')
})

test('Quick definite append validation clears the lock without retrying the write', async ({ page }) => {
  await startAccount(page)
  const existing = await createDiary(page, { date: '2026-10-15', title: 'Validation target', content: 'Original body' })
  await page.goto(`/diaries/quick?date=${existing.date}`)
  const marker = 'A rejected append remains editable'
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(marker)
  let postCount = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() === 'POST') {
      postCount += 1
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_VALIDATION_ERROR', requestId: 'quick-definite-4xx' } }) })
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await expect(page.getByTestId('request-id')).toHaveText('quick-definite-4xx')
  await expect(page.getByRole('button', { name: 'Append to date', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(marker)
  expect(postCount).toBe(1)
  await page.unroute('**/api/diaries')
})

test('Quick refuses append when the device cannot persist its uncertainty marker', async ({ page }) => {
  await startAccount(page)
  const existing = await createDiary(page, { date: '2026-10-15', title: 'Storage target', content: 'Original body' })
  await page.goto(`/diaries/quick?date=${existing.date}`)
  const marker = 'Keep this writing in the form'
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(marker)
  let postCount = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() === 'POST') postCount += 1
    await route.continue()
  })
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key.startsWith('diary-quick-draft:')) throw new Error('storage disabled for recovery marker')
      return original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('SYS_INTERNAL_ERROR')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(marker)
  await expect(page.getByRole('button', { name: 'Append to date', exact: true })).toBeEnabled()
  expect(postCount).toBe(0)
  expect((await readDiary(page, existing.id)).content).toBe('Original body')
  await page.unroute('**/api/diaries')
})

for (const width of [1440, 390]) {
  test(`recent Quick tags preserve whole comma values and account isolation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await startAccount(page)
    const firstDate = `2026-10-${width === 1440 ? '16' : '17'}`
    const secondDate = `2026-10-${width === 1440 ? '18' : '19'}`
    await page.goto(`/diaries/quick?date=${firstDate}`)
    await openQuickOptions(page)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Tag source')
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Tag source body')
    await page.getByRole('textbox', { name: 'Tags (one per line)', exact: true }).fill('research, evidence\nlong horizon')
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
    const firstHref = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
    expect((await readDiary(page, firstHref!.split('/').at(-1)!)).tags).toEqual(['research, evidence', 'long horizon'])
    await capture(page, 'quick-recent-tags', width)

    await page.goto(`/diaries/quick?date=${secondDate}`)
    await openQuickOptions(page)
    const recent = page.getByRole('button', { name: 'research, evidence', exact: true })
    await expect(recent).toBeVisible()
    await recent.click()
    await expect(recent).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Tag reuse')
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Tag reuse body')
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
    const secondHref = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
    expect((await readDiary(page, secondHref!.split('/').at(-1)!)).tags).toEqual(['research, evidence'])

    await signOut(page)
    const otherEmail = `quick-authoring-other-${randomUUID()}@example.test`
    await register(page, otherEmail)
    await signIn(page, otherEmail)
    await page.goto(`/diaries/quick?date=${secondDate}`)
    await openQuickOptions(page)
    await expect(page.locator('.recent-tags')).toHaveCount(0)
  })
}

for (const width of [1440, 390]) {
  test(`Quick saved actions preserve source context and a fresh note at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await startAccount(page)
    const sourceDate = '2026-10-20'
    const nextDate = '2026-10-21'
    await page.goto(`/diaries/quick?symbol=NVDA&source=company&date=${sourceDate}`)
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Company handoff note')
    await openQuickOptions(page)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Company handoff')
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
    const saved = page.getByRole('status', { name: 'Saved diary', exact: true })
    const firstHref = await saved.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
    expect(firstHref).toMatch(/^\/diaries\/\d+$/)
    await expect(saved.getByRole('link', { name: 'Edit details', exact: true })).toHaveAttribute('href', `${firstHref}/edit`)
    await expect(saved.getByRole('link', { name: 'Return to company research', exact: true })).toHaveAttribute('href', '/stocks/NVDA')
    await capture(page, 'quick-saved-actions', width)

    await saved.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('')
    await page.getByLabel('Diary date', { exact: true }).fill(nextDate)
    await openQuickOptions(page)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Second handoff')
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Second company note')
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Open diary', exact: true }).click()
    await expect(page).toHaveURL(/\/diaries\/\d+$/)
    await expect(page.getByRole('link', { name: 'Return to NVDA research', exact: true })).toHaveAttribute('href', '/stocks/NVDA')
    await expect(page.getByRole('link', { name: 'Edit diary', exact: true })).toBeVisible()
  })
}
