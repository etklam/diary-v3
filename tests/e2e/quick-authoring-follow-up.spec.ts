import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, openQuickDestination, openQuickOptions, selectAccountLocale, selectLocale, signOut, test } from '../support/e2e'

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
  await openQuickDestination(page)
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
  test(`recent Quick tags split separators and stay account-isolated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await startAccount(page)
    const firstDate = `2026-10-${width === 1440 ? '16' : '17'}`
    const secondDate = `2026-10-${width === 1440 ? '18' : '19'}`
    await page.goto(`/diaries/quick?date=${firstDate}`)
    await openQuickOptions(page)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Tag source')
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Tag source body')
    await page.getByRole('textbox', { name: 'Tags (one per line or comma)', exact: true }).fill('research, evidence\nlong horizon')
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
    const firstHref = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
    expect((await readDiary(page, firstHref!.split('/').at(-1)!)).tags).toEqual(['research', 'evidence', 'long horizon'])
    await capture(page, 'quick-recent-tags', width)

    await page.goto(`/diaries/quick?date=${secondDate}`)
    await openQuickOptions(page)
    const recent = page.getByRole('button', { name: 'research', exact: true })
    await expect(recent).toBeVisible()
    await recent.click()
    await expect(recent).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Tag reuse')
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Tag reuse body')
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
    const secondHref = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
    expect((await readDiary(page, secondHref!.split('/').at(-1)!)).tags).toEqual(['research'])

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
    await openQuickDestination(page)
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

test('a submit arriving during the destination lookup is queued, not swallowed', async ({ page }) => {
  await startAccount(page)
  const content = page.getByRole('textbox', { name: 'Content', exact: true })
  await expect(content).toBeVisible()
  // The lookup note states why save is unavailable, and clears when it resolves.
  await expect(page.getByText('Checking this date for an existing diary…', { exact: true })).toHaveCount(0)
  await page.route('**/api/diaries/by-date?*', async route => { await new Promise(resolve => setTimeout(resolve, 2000)); await route.continue() })
  await page.reload()
  await content.fill('Queued save during the date lookup.')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByText('Saving as soon as the date check finishes.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
  await page.unroute('**/api/diaries/by-date?*')
})

/**
 * Holds the account read — which is also what confirms the session — so a cold
 * document can be worked on while it is in flight, deterministically rather
 * than on a timer.
 */
async function holdAccountRead(page: Page) {
  let release = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/auth/me', async route => { await held; await route.continue() })
  return async () => { release(); await page.unroute('**/api/auth/me') }
}

test('a cold Quick load is typable before the account read and keeps what was typed', async ({ page }) => {
  const email = `quick-cold-start-${randomUUID()}@example.test`
  await register(page, email)
  await signIn(page, email)
  // A cold load with the account read held open: the writing area must be
  // present and typable while it is in flight, and keep what was typed when the
  // session confirms underneath it.
  const release = await holdAccountRead(page)
  await page.goto('/diaries/quick')
  const content = page.getByRole('textbox', { name: 'Content', exact: true })
  const marker = `Typed before the account read ${randomUUID()}`
  await content.fill(marker)
  await expect(content).toHaveValue(marker)
  // Nothing has confirmed the session yet, so this is the window the composer
  // used to withhold the writing area for.
  await expect(page.getByTestId('sign-out')).toHaveCount(0)
  await release()
  await expect(page.getByTestId('sign-out')).toBeVisible()
  await expect.poll(async () => content.inputValue(), { timeout: 10_000 }).toBe(marker)
  await expect(page.getByRole('button', { name: 'Create diary', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Create diary', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
  const href = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
  expect((await readDiary(page, href!.split('/').at(-1)!)).content).toBe(marker)
  // The date still comes from the account timezone once the read confirms.
  const settings = await (await page.request.get('/api/user/settings')).json() as { settings: { timezone: string } }
  expect(settings.settings.timezone).toBeTruthy()
})

/**
 * Writing can now begin before the account is known, so a draft stored for that
 * account and writing typed on the cold document can both exist at once. One
 * device key holds them, and neither may be dropped without the author saying so.
 */
async function seedStoredDraft(page: Page, content: string) {
  const id = (await (await page.request.get('/api/auth/me')).json() as { data: { id: string } }).data.id
  await page.evaluate(([key, body]) => localStorage.setItem(key, JSON.stringify({
    at: Date.now(),
    value: { date: '2026-10-08', title: 'Stored draft', content: body, tags: '', stockSymbols: '', kind: 'blank', data: {}, mode: 'create', titleTouched: true, contentTouched: true, applied: '' },
  })), [`diary-quick-draft:${id}`, content] as const)
}

test('restoring a stored draft over writing typed before the account confirmed asks first', async ({ page }) => {
  const email = `quick-cold-start-restore-${randomUUID()}@example.test`
  await register(page, email)
  await signIn(page, email)
  const stored = `Draft stored on this device ${randomUUID()}`
  await seedStoredDraft(page, stored)

  const release = await holdAccountRead(page)
  await page.goto('/diaries/quick')
  const content = page.getByRole('textbox', { name: 'Content', exact: true })
  const typed = `Typed on the cold document ${randomUUID()}`
  await content.fill(typed)
  await release()

  // The offer still appears, even though writing already began.
  const restore = page.getByRole('button', { name: 'Restore saved draft', exact: true })
  await expect(restore).toBeVisible()
  await expect(content).toHaveValue(typed)

  await restore.click()
  const confirm = page.locator('dialog.delete-dialog[open]')
  await expect(confirm.getByRole('heading', { name: 'Replace the current writing?', exact: true })).toBeVisible()
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(content).toHaveValue(typed)
  await expect(restore).toBeVisible()

  await restore.click()
  await confirm.getByRole('button', { name: 'Replace writing', exact: true }).click()
  await expect(content).toHaveValue(stored)
  await expect(restore).toHaveCount(0)
})

test('discarding the stored draft keeps writing typed before the account confirmed', async ({ page }) => {
  const email = `quick-cold-start-discard-${randomUUID()}@example.test`
  await register(page, email)
  await signIn(page, email)
  await seedStoredDraft(page, `Draft stored on this device ${randomUUID()}`)

  const release = await holdAccountRead(page)
  await page.goto('/diaries/quick')
  const content = page.getByRole('textbox', { name: 'Content', exact: true })
  const typed = `Kept through the discard ${randomUUID()}`
  await content.fill(typed)
  await release()

  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toHaveCount(0)
  await expect(content).toHaveValue(typed)
  // Discard drops the stored draft; what is in the writing area is now the draft.
  await expect(page.getByText('Draft saved on this device for 24 hours.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create diary', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
  const href = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
  expect((await readDiary(page, href!.split('/').at(-1)!)).content).toBe(typed)
})

test('tag suggestions follow the account to a device that never wrote a diary', async ({ page, browser }) => {
  const email = `quick-account-tags-${randomUUID()}@example.test`
  await register(page, email)
  await signIn(page, email)
  await page.goto('/diaries/quick?date=2026-10-26')
  await openQuickOptions(page)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Account tag source')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Account tag body')
  await page.getByRole('textbox', { name: 'Tags (one per line or comma)', exact: true }).fill('portfolio, conviction')
  await page.getByRole('button', { name: 'Create diary', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()

  // A second device for the same account: no local cache, same suggestions.
  const fresh = await browser.newContext()
  try {
    const second = await fresh.newPage()
    await signIn(second, email)
    await second.goto('/diaries/quick?date=2026-10-27')
    await openQuickOptions(second)
    expect(await second.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('diary-recent-tags:')).length)).toBeGreaterThanOrEqual(0)
    await expect(second.getByRole('button', { name: 'portfolio', exact: true })).toBeVisible()
    await expect(second.getByRole('button', { name: 'conviction', exact: true })).toBeVisible()
    // A failed suggestions read leaves writing and saving usable.
    await second.route('**/api/diaries/recent-tags', route => route.abort('failed'))
    await second.goto('/diaries/quick?date=2026-10-28')
    const content = second.getByRole('textbox', { name: 'Content', exact: true })
    await content.fill('Suggestions are optional.')
    await second.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(second.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
  } finally {
    await fresh.close()
  }
})

test('a shared link, title and excerpt arrive in the Quick writing area', async ({ page }) => {
  const email = `quick-share-target-${randomUUID()}@example.test`
  await register(page, email)
  // Signed out first: the share must survive the sign-in return path.
  const shared = `/diaries/quick?title=${encodeURIComponent('Filing summary')}&text=${encodeURIComponent('Revenue grew without new debt.')}&url=${encodeURIComponent('https://example.test/filing')}`
  await page.context().clearCookies()
  await page.goto(shared)
  await selectLocale(page, 'en')
  await page.getByRole('link', { name: 'Sign in', exact: true }).first().click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/quick\?/)
  await selectAccountLocale(page, 'en')
  const content = page.getByRole('textbox', { name: 'Content', exact: true })
  await expect(content).toHaveValue('Filing summary\nhttps://example.test/filing\n\nRevenue grew without new debt.')

  // The author's own reaction is what the diary is for; both are saved.
  await content.fill(`${await content.inputValue()}\n\nMy reaction: wait for the next quarter.`)
  await page.getByRole('button', { name: 'Create diary', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
  const href = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
  const saved = await readDiary(page, href!.split('/').at(-1)!)
  expect(saved.content).toContain('https://example.test/filing')
  expect(saved.content).toContain('My reaction: wait for the next quarter.')

  // A hostile or empty share degrades to an ordinary empty capture.
  await page.goto(`/diaries/quick?url=${encodeURIComponent('javascript:alert(1)')}&date=2026-10-30`)
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('')
  await openQuickDestination(page)
  await expect(page.getByLabel('Diary date', { exact: true })).toHaveValue('2026-10-30')
})
