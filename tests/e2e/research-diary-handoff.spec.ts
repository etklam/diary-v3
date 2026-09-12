import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, selectLocale, selectTheme, signOut, test } from '../support/e2e'

const password = 'synthetic-research-handoff-password'
const captureDate = '2026-09-12'

type Diary = {
  id: string
  date: string
  title: string
  content: string
  stockSymbols: string[]
  tags: string[]
  transactions?: Array<Record<string, unknown>>
  alerts?: Array<Record<string, unknown>>
  reviewStatus?: 'none' | 'pending' | 'reviewed' | null
  reviewedAt?: string | null
  reviewOutcome?: string | null
  reviewSummary?: string | null
  reviewLearning?: string | null
  reviewAdjustment?: string | null
  reviewDueAt?: string | null
}

type DiaryInput = {
  date: string
  title: string
  content: string
  stockSymbols?: string[]
  tags?: string[]
  thesis?: string
  risk?: string
  execution?: string
  reviewDueAt?: string
  transactions?: Array<Record<string, string>>
  alerts?: Array<Record<string, string>>
}

async function register(page: Page, email: string, accountPassword = password) {
  const response = await page.request.post('/api/auth/register', { data: { email, password: accountPassword } })
  expect(response.status()).toBe(200)
}

async function signIn(page: Page, email: string, returnPath = '/diaries/new', accountPassword = password) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnPath)}`)
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(accountPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${returnPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  await selectLocale(page, 'en')
}

async function startAccount(page: Page, returnPath = '/diaries/new') {
  const email = `research-handoff-${randomUUID()}@example.test`
  await register(page, email)
  await signIn(page, email, returnPath)
  return email
}

async function csrf(page: Page) {
  const cookie = (await page.context().cookies()).find(item => item.name === 'csrf-token')
  expect(cookie?.value).toBeTruthy()
  return { 'x-csrf-token': cookie!.value }
}

async function createDiary(page: Page, input: DiaryInput): Promise<Diary> {
  const response = await page.request.post('/api/diaries', { headers: await csrf(page), data: input })
  expect(response.status()).toBe(201)
  return await response.json() as Diary
}

async function readDiary(page: Page, id: string): Promise<Diary> {
  const response = await page.request.get(`/api/diaries/${id}`)
  expect(response.status()).toBe(200)
  return await response.json() as Diary
}

async function diaryTotal(page: Page) {
  const response = await page.request.get('/api/diaries?limit=100')
  expect(response.status()).toBe(200)
  const body = await response.json() as { pagination: { total: number } }
  return body.pagination.total
}

function quickPath(symbol = 'NVDA', date = captureDate) {
  return `/diaries/quick?symbol=${symbol}&source=company&date=${date}`
}

function newPath(symbol = 'NVDA', date = captureDate) {
  return `/diaries/new?symbol=${symbol}&source=company&date=${date}`
}

function captureNotice(page: Page) {
  return page.getByText(/NVDA.*(research|company)|(research|company).*NVDA/i).first()
}

function contextInput(page: Page) {
  return page.getByRole('textbox', { name: 'Company context', exact: true })
}

async function openCompanyAndAssertCapture(page: Page) {
  await page.goto('/stocks/NVDA')
  await expect(page.getByRole('heading', { name: 'NVDA', exact: true })).toBeVisible()
  const quick = page.getByRole('link', { name: 'Record a thought', exact: true })
  await expect(quick).toHaveAttribute('href', '/diaries/quick?symbol=NVDA&source=company')
  return quick
}

async function openQuickContext(page: Page, date = captureDate, expectNotice = true) {
  await page.goto(quickPath('NVDA', date))
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toBeVisible()
  await expect(contextInput(page)).toHaveValue('NVDA')
  if (expectNotice) await expect(captureNotice(page)).toBeVisible()
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Company to Quick Diary persists the source context at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await startAccount(page)
    const quick = await openCompanyAndAssertCapture(page)
    if (viewport.width < 768) await selectTheme(page, 'dark')
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
    await page.screenshot({ path: `docs/design/evidence/research-diary-handoff/company-cta-${viewport.width}.png`, fullPage: true })

    await quick.click()
    await expect(page).toHaveURL(/\/diaries\/quick\?symbol=NVDA&source=company$/)
    await expect(contextInput(page)).toHaveValue('NVDA')
    await expect(captureNotice(page)).toBeVisible()
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
    await page.screenshot({ path: `docs/design/evidence/research-diary-handoff/contextual-quick-${viewport.width}.png`, fullPage: true })

    const marker = `Company capture marker ${viewport.width} ${randomUUID()}`
    await page.getByLabel('Diary date', { exact: true }).fill(captureDate)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('NVDA company observation')
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill(marker)
    const totalBefore = await diaryTotal(page)
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page).toHaveURL(/\/diaries\/\d+$/)
    const id = page.url().split('/').at(-1)!
    const persisted = await readDiary(page, id)
    expect(persisted).toMatchObject({ id, title: 'NVDA company observation', content: marker, stockSymbols: ['NVDA'] })
    expect(await diaryTotal(page)).toBe(totalBefore + 1)

    await expect(page.getByRole('link', { name: 'Return to NVDA research', exact: true })).toHaveAttribute('href', '/stocks/NVDA')
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
    await page.screenshot({ path: `docs/design/evidence/research-diary-handoff/saved-return-${viewport.width}.png`, fullPage: true })
    await page.reload()
    await expect(page.getByRole('link', { name: 'Return to NVDA research', exact: true })).toHaveAttribute('href', '/stocks/NVDA')
    await page.getByRole('link', { name: 'Return to NVDA research', exact: true }).click()
    await expect(page).toHaveURL(/\/stocks\/NVDA$/)
    await expect(page.getByRole('link', { name: 'NVDA company observation', exact: true })).toBeVisible()

    await page.goto('/diaries')
    await page.getByRole('textbox', { name: 'Company symbol', exact: true }).fill('NVDA')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(page.getByRole('link', { name: 'NVDA company observation', exact: true })).toBeVisible()
  })
}

test('Company to Full Diary keeps source return separate from saved associations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startAccount(page)
  await openCompanyAndAssertCapture(page)
  await page.getByRole('link', { name: 'Write a full diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/new\?symbol=NVDA&source=company$/)
  await expect(captureNotice(page)).toBeVisible()
  await expect(contextInput(page)).toHaveValue('NVDA')

  const marker = `Full diary marker ${randomUUID()}`
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-13')
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Full NVDA observation')
  await contextInput(page).fill('MSFT')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(marker)
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  const id = page.url().split('/').at(-1)!
  expect(await readDiary(page, id)).toMatchObject({ id, title: 'Full NVDA observation', content: marker, stockSymbols: ['MSFT'] })
  await expect(page.getByRole('link', { name: 'Return to NVDA research', exact: true })).toHaveAttribute('href', '/stocks/NVDA')
})

test('Full Diary keeps existing same-date content when the contextual save conflicts', async ({ page }) => {
  await startAccount(page)
  const existing = await createDiary(page, {
    date: '2026-09-13', title: 'Existing full diary', content: 'Existing full body', stockSymbols: ['AAPL'],
  })
  await page.goto(newPath('NVDA', '2026-09-13'))
  await expect(contextInput(page)).toHaveValue('NVDA')
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Conflicting full title')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Conflicting full body')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Conflicting full title')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('Conflicting full body')
  expect(await readDiary(page, existing.id)).toMatchObject({ id: existing.id, title: 'Existing full diary', content: 'Existing full body', stockSymbols: ['AAPL'] })
})

test('Quick legacy draft wins over incoming Company context, while Discard starts a fresh seed', async ({ page }) => {
  await startAccount(page)
  const existing = await createDiary(page, {
    date: '2026-09-16', title: 'Append target', content: 'Append target body', stockSymbols: ['AAPL'],
  })
  const me = await (await page.request.get('/api/auth/me')).json() as { data: { id: string } }
  const draftKey = `diary-quick-draft:${me.data.id}`
  await page.evaluate(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value: {
      date: '2026-09-16', title: 'MSFT legacy title', content: 'MSFT legacy body', tags: 'legacy',
      stockSymbols: 'MSFT', kind: 'blank', data: {}, mode: 'append', titleTouched: true, contentTouched: true, applied: '',
    } }))
  }, { key: draftKey })
  await page.goto(quickPath('NVDA', '2026-09-16'))
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore saved draft', exact: true }).click()
  await expect(page.getByLabel('Diary date', { exact: true })).toHaveValue('2026-09-16')
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('MSFT legacy title')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('MSFT legacy body')
  await expect(contextInput(page)).toHaveValue('MSFT')
  await expect(page.getByRole('combobox', { name: 'Save mode', exact: true })).toHaveValue('append')
  await selectLocale(page, 'zh-TW')
  await selectLocale(page, 'en')
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('MSFT legacy title')
  await expect(contextInput(page)).toHaveValue('MSFT')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(page.getByLabel('Diary date', { exact: true })).toHaveValue('2026-09-16')
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('')
  await expect(contextInput(page)).toHaveValue('NVDA')
  await expect(page.getByRole('combobox', { name: 'Save mode', exact: true })).toHaveValue('append')
  const fresh = `Fresh NVDA writing ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Fresh NVDA title')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(fresh)
  await expect.poll(() => page.evaluate(key => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw).value?.content : null
  }, draftKey)).toBe(fresh)
  expect((await readDiary(page, existing.id)).content).toBe('Append target body')
})

test('Quick append keeps the original Diary aggregate and rejects symbol overflow atomically', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startAccount(page)
  const created = await createDiary(page, {
    date: '2026-09-14', title: 'Original aggregate title', content: 'Original aggregate body', stockSymbols: ['AAPL'],
    reviewDueAt: '2026-09-14T01:00:00.000Z',
    transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-14T02:00:00.000Z', notes: 'Keep this transaction' }],
    alerts: [{ message: 'Keep this reminder', triggerAt: '2026-09-30T02:00:00.000Z' }],
  })
  const reviewWrite = await page.request.patch(`/api/diaries/${created.id}/review`, {
    headers: await csrf(page),
    data: { reviewOutcome: 'PARTIAL', reviewSummary: 'Keep this review summary', reviewLearning: 'Keep this review learning', reviewAdjustment: 'Keep this review adjustment' },
  })
  expect(reviewWrite.status()).toBe(200)
  const original = await readDiary(page, created.id)
  const reviewBeforeResponse = await page.request.get(`/api/diaries/${original.id}/review`)
  expect(reviewBeforeResponse.status()).toBe(200)
  const reviewBefore = await reviewBeforeResponse.json() as Record<string, unknown>
  expect(reviewBefore).toMatchObject({ reviewStatus: 'reviewed', reviewOutcome: 'PARTIAL', reviewSummary: 'Keep this review summary', reviewLearning: 'Keep this review learning', reviewAdjustment: 'Keep this review adjustment' })
  const totalBefore = await diaryTotal(page)
  await openQuickContext(page, '2026-09-14')
  await expect(page.getByRole('combobox', { name: 'Save mode', exact: true })).toHaveValue('append')
  const marker = `Append marker ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Incoming title must be ignored')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(marker)
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/diaries/${original.id}$`))
  const appended = await readDiary(page, original.id)
  expect(appended.id).toBe(original.id)
  expect(appended.title).toBe('Original aggregate title')
  expect(appended.content).toBe(`Original aggregate body\n\n---\n\n${marker}`)
  expect(appended.content.split(marker)).toHaveLength(2)
  expect([...appended.stockSymbols].sort()).toEqual(['AAPL', 'NVDA'])
  expect(appended.transactions).toEqual(original.transactions)
  expect(appended.alerts).toEqual(original.alerts)
  const reviewAfterResponse = await page.request.get(`/api/diaries/${original.id}/review`)
  expect(reviewAfterResponse.status()).toBe(200)
  const reviewAfter = await reviewAfterResponse.json() as Record<string, unknown>
  expect(reviewAfter).toMatchObject({
    id: reviewBefore.id,
    reviewStatus: 'reviewed',
    reviewedAt: reviewBefore.reviewedAt,
    reviewOutcome: reviewBefore.reviewOutcome,
    reviewSummary: reviewBefore.reviewSummary,
    reviewLearning: reviewBefore.reviewLearning,
    reviewAdjustment: reviewBefore.reviewAdjustment,
  })
  expect(await diaryTotal(page)).toBe(totalBefore)

  const symbols = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'NFLX', 'ORCL', 'INTC', 'AMD']
  const overflow = await createDiary(page, { date: '2026-09-15', title: 'Ten symbol baseline', content: 'Keep this body', stockSymbols: symbols })
  await openQuickContext(page, '2026-09-15')
  const overflowMarker = `Overflow must stay local ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(overflowMarker)
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('SYS_VALIDATION_ERROR')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(overflowMarker)
  const unchanged = await readDiary(page, overflow.id)
  expect(unchanged).toMatchObject({ id: overflow.id, content: 'Keep this body' })
  expect([...unchanged.stockSymbols].sort()).toEqual([...symbols].sort())
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`old full draft wins over incoming Company seed at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await startAccount(page)
    const me = await (await page.request.get('/api/auth/me')).json() as { data: { id: string } }
    await page.evaluate(({ id }) => {
      localStorage.setItem(`diary-editor-draft:${id}:new`, JSON.stringify({ at: Date.now(), value: {
        form: { date: '2026-09-16', title: 'MSFT draft title', content: 'MSFT draft body', tags: ['old-draft'], thesis: 'Old thesis', risk: null, execution: null },
        captureContext: { source: 'company', symbol: '^GSPC' },
      } }))
    }, me.data)
    await page.goto(newPath())
    await expect(page.getByRole('button', { name: 'Restore unsaved draft', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeVisible()
    if (viewport.width < 768) await selectTheme(page, 'dark')
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
    await page.screenshot({ path: `docs/design/evidence/research-diary-handoff/draft-conflict-${viewport.width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Restore unsaved draft', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('MSFT draft title')
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('MSFT draft body')
    await expect(contextInput(page)).toHaveValue('')
    await page.getByRole('button', { name: 'Save diary', exact: true }).click()
    await expect(page).toHaveURL(/\/diaries\/\d+$/)
    const restoredId = page.url().split('/').at(-1)!
    expect((await readDiary(page, restoredId)).stockSymbols).toEqual([])
    await expect(page.getByRole('link', { name: /Return to .* research/, exact: true })).toHaveCount(0)
  })
}

test('discarding an old full draft starts the incoming Company capture and backs up new writing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startAccount(page)
  const me = await (await page.request.get('/api/auth/me')).json() as { data: { id: string } }
  await page.evaluate(({ id }) => {
    localStorage.setItem(`diary-editor-draft:${id}:new`, JSON.stringify({ at: Date.now(), value: {
      form: { date: '2026-09-22', title: 'Discarded MSFT title', content: 'Discarded MSFT body', tags: [] },
      stockSymbols: 'MSFT',
    } }))
  }, me.data)
  await page.goto(newPath('NVDA', '2026-09-22'))
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('')
  await expect(contextInput(page)).toHaveValue('NVDA')
  const content = `New writing after discard ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('NVDA after discard')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(content)
  await expect.poll(() => page.evaluate(({ id }) => {
    const raw = localStorage.getItem(`diary-editor-draft:${id}:new`)
    return raw ? JSON.parse(raw).value?.form?.content : null
  }, me.data)).toBe(content)
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  expect((await readDiary(page, page.url().split('/').at(-1)!)).stockSymbols).toEqual(['NVDA'])
})

test('guest Company capture preserves context through registration and login without writing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const email = `guest-handoff-${randomUUID()}@example.test`
  await page.goto('/stocks/NVDA')
  const guestCount = await page.getByRole('link', { name: 'Record a thought', exact: true }).count()
  expect(guestCount).toBe(1)
  await page.getByRole('link', { name: 'Record a thought', exact: true }).click()
  await expect(page).toHaveURL('/diaries/quick?symbol=NVDA&source=company')
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/diaries/quick?symbol=NVDA&source=company')
  await page.getByRole('link', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/register\?returnTo=/)
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/diaries/quick?symbol=NVDA&source=company')
  await page.getByLabel('Name', { exact: true }).fill('Synthetic researcher')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('Your account is ready', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/quick\?symbol=NVDA&source=company$/)
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('')
  expect(await diaryTotal(page)).toBe(0)

  await signOut(page)
  await page.goto('/stocks/NVDA')
  await page.getByRole('link', { name: 'Record a thought', exact: true }).click()
  await expect(page).toHaveURL('/diaries/quick?symbol=NVDA&source=company')
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/quick\?symbol=NVDA&source=company$/)
  expect(await diaryTotal(page)).toBe(0)
})

test('central 401 invalidation preserves a contextual Quick draft for re-login', async ({ page }) => {
  const email = await startAccount(page)
  // Keep this auth-boundary case runnable while the Company notice is still a
  // separate UI handoff. The contextual symbol/date controls are still
  // asserted by the helper; the full Company → Quick cases assert the notice.
  await openQuickContext(page, captureDate, false)
  const title = 'Draft through session expiry'
  const content = `401 recovery marker ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(content)
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-quick-draft:')))).toBe(true)

  // Make the first write return the same 401 that an invalidated server
  // session returns, then make the shared refresh fail. This avoids relying on
  // the API middleware's ambient refresh fallback while still exercising the
  // browser session invalidation path and its real login continuation.
  let writeAttempts = 0
  await page.route('**/api/diaries**', async route => {
    if (route.request().method() === 'POST' && writeAttempts === 0) {
      writeAttempts += 1
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ data: { code: 'AUTH_UNAUTHORIZED' } }) })
      return
    }
    await route.continue()
  })
  await page.route('**/api/auth/refresh', async route => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ data: { code: 'AUTH_UNAUTHORIZED' } }) })
  })
  await page.getByRole('button', { name: 'Create diary', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(quickPath())
  expect(writeAttempts).toBe(1)
  await page.unroute('**/api/auth/refresh')
  await page.unroute('**/api/diaries**')
  await signIn(page, email, quickPath())
  expect(await diaryTotal(page)).toBe(0)
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore saved draft', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(title)
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(content)
  await page.getByRole('button', { name: 'Create diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  expect((await readDiary(page, page.url().split('/').at(-1)!)).content).toBe(content)
})

test('explicit cross-tab logout clears the Quick draft and isolates the next account', async ({ page, context, request }) => {
  await startAccount(page)
  await openQuickContext(page)
  const oldContent = `Private draft before logout ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(oldContent)
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-quick-draft:')))).toBe(true)

  const other = await context.newPage()
  await other.goto(quickPath())
  await expect(other.getByRole('textbox', { name: 'Content', exact: true })).toBeVisible()
  await signOut(other)
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('diary-quick-draft:')).length)).toBe(0)
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await other.close()

  const nextEmail = `next-account-${randomUUID()}@example.test`
  expect((await request.post('/api/auth/register', { data: { email: nextEmail, password } })).status()).toBe(200)
  await signIn(page, nextEmail, quickPath())
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).not.toHaveValue(oldContent)
})

test('context initialization preserves valid date and manual association across locale refresh', async ({ page }) => {
  await startAccount(page)
  await page.goto('/diaries/quick?symbol=nvda&source=company&date=2026-09-17')
  await expect(page.getByLabel('Diary date', { exact: true })).toHaveValue('2026-09-17')
  await contextInput(page).fill('MSFT')
  const content = `Manual association stays changed ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(content)
  await selectLocale(page, 'zh-TW')
  await selectLocale(page, 'en')
  await expect(contextInput(page)).toHaveValue('MSFT')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(content)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore saved draft', exact: true }).click()
  await expect(contextInput(page)).toHaveValue('MSFT')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(content)
})

test('pristine contextual Quick navigation adopts the new source and date', async ({ page }) => {
  await startAccount(page)
  await page.goto(quickPath('NVDA', '2026-09-17'))
  await expect(contextInput(page)).toHaveValue('NVDA')
  await page.evaluate(path => {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, quickPath('MSFT', '2026-09-21'))
  await expect(page).toHaveURL(/symbol=MSFT&source=company&date=2026-09-21$/)
  await expect(page.getByLabel('Diary date', { exact: true })).toHaveValue('2026-09-21')
  await expect(contextInput(page)).toHaveValue('MSFT')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('')
})

test('unsupported Company capture context stays visible as a validation notice', async ({ page }) => {
  await startAccount(page)
  await page.goto('/diaries/quick?symbol=SPX&source=company&date=2026-09-21')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toBeVisible()
  await expect(contextInput(page)).toHaveValue('')
  await expect(page.getByText(/unsupported|invalid.*(?:company|symbol)|(?:company|symbol).*supported/i).first()).toBeVisible()
})

test('Quick append blocks double submit, retains failed input, and never replays uncertain writes', async ({ page }) => {
  await startAccount(page)
  const existing = await createDiary(page, { date: '2026-09-18', title: 'Safety baseline', content: 'Safety baseline body', stockSymbols: ['AAPL'] })
  await openQuickContext(page, '2026-09-18', false)
  const marker = `Delayed append marker ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(marker)

  let postCount = 0
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const requestStarted = new Promise<void>(resolve => { started = resolve })
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    postCount += 1
    const response = await route.fetch()
    started()
    await gate
    await route.fulfill({ response })
  })
  const appendForm = page.locator('.quick-composer form')
  const submit = appendForm.locator('button[type="submit"]')
  await submit.click()
  await requestStarted
  await expect(submit).toBeDisabled()
  await appendForm.evaluate(form => (form as HTMLFormElement).requestSubmit())
  expect(postCount).toBe(1)
  release()
  await expect(page).toHaveURL(new RegExp(`/diaries/${existing.id}$`))
  expect((await readDiary(page, existing.id)).content.split(marker)).toHaveLength(2)
  await page.unroute('**/api/diaries')

  const failed = await createDiary(page, { date: '2026-09-19', title: 'Failed baseline', content: 'Failed baseline body', stockSymbols: ['AAPL'] })
  await openQuickContext(page, '2026-09-19', false)
  const failedMarker = `Failed append remains ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Failed append title')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(failedMarker)
  await page.route('**/api/diaries', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'handoff-failed' } }) })
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Append to date', exact: true }).click()
  await expect(page.getByTestId('request-id')).toHaveText('handoff-failed')
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Failed append title')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(failedMarker)
  expect((await readDiary(page, failed.id)).content).toBe('Failed baseline body')
  await page.unroute('**/api/diaries')
  await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('diary-quick-draft:')).forEach(key => localStorage.removeItem(key)))
  await page.reload()

  const uncertain = await createDiary(page, { date: '2026-09-20', title: 'Uncertain baseline', content: 'Uncertain baseline body', stockSymbols: ['AAPL'] })
  await openQuickContext(page, '2026-09-20', false)
  const uncertainMarker = `Committed once ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(uncertainMarker)
  let uncertainCalls = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    uncertainCalls += 1
    const response = await route.fetch()
    await route.abort('failed')
    void response
  })
  const uncertainSubmit = page.getByRole('button', { name: 'Append to date', exact: true })
  await uncertainSubmit.click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(uncertainMarker)
  await expect(uncertainSubmit).toBeDisabled()
  expect(uncertainCalls).toBe(1)
  expect((await readDiary(page, uncertain.id)).content.split(uncertainMarker)).toHaveLength(2)
  await selectLocale(page, 'zh-TW')
  await selectLocale(page, 'en')
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(localStorage).find(value => value.startsWith('diary-quick-draft:'))
    const raw = key ? localStorage.getItem(key) : null
    return raw ? JSON.parse(raw).value?.uncertain === true : false
  })).toBe(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore saved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore saved draft', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(uncertainMarker)
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByText(/append result could not be confirmed/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Append to date', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Append to date', exact: true }).evaluate(button => (button as HTMLButtonElement).form?.requestSubmit())
  expect(uncertainCalls).toBe(1)
  expect((await readDiary(page, uncertain.id)).content.split(uncertainMarker)).toHaveLength(2)
  await page.unroute('**/api/diaries')
})

test('late Quick append response cannot recreate a draft after cross-tab logout', async ({ page, context }) => {
  await startAccount(page)
  await createDiary(page, { date: '2026-09-24', title: 'Logout race baseline', content: 'Logout race body', stockSymbols: ['AAPL'] })
  await openQuickContext(page, '2026-09-24', false)
  const marker = `Late response after logout ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(marker)
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-quick-draft:')))).toBe(true)

  let postCount = 0
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const requestStarted = new Promise<void>(resolve => { started = resolve })
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    postCount += 1
    await route.fetch()
    started()
    await gate
    await route.abort('failed')
  })
  const appendForm = page.locator('.quick-composer form')
  void appendForm.locator('button[type="submit"]').click()
  await requestStarted
  const other = await context.newPage()
  await other.goto(quickPath('NVDA', '2026-09-24'))
  await expect(other.getByRole('textbox', { name: 'Content', exact: true })).toBeVisible()
  await signOut(other)
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('diary-quick-draft:')))).toEqual([])
  release()
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('diary-quick-draft:')))).toEqual([])
  expect(postCount).toBe(1)
  await other.close()
  await page.unroute('**/api/diaries')
})

test('same-route context replacement cannot discard dirty Quick writing', async ({ page }) => {
  await startAccount(page)
  await openQuickContext(page)
  const content = `Dirty route replacement marker ${randomUUID()}`
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(content)
  let dialogSeen = false
  page.once('dialog', async dialog => { dialogSeen = true; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss() })
  await page.goto('/diaries/quick?symbol=MSFT&source=company&date=2026-09-21').catch(() => undefined)
  expect(dialogSeen).toBe(true)
  await expect(page).toHaveURL(/symbol=NVDA&source=company/)
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(content)
})
