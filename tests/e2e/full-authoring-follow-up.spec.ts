import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, selectLocale, test } from '../support/e2e'

const password = 'synthetic-full-authoring-follow-up-password'
const evidenceDir = 'docs/design/evidence/convenience-follow-up'

type Diary = {
  id: string
  date: string
  title: string
  content: string
  tags: string[]
  thesis: string | null
  risk: string | null
  execution: string | null
  reviewDueAt: string | null
  transactions?: Array<Record<string, unknown>>
  alerts?: Array<Record<string, unknown>>
}

async function registerAndSignIn(page: Page) {
  const email = `full-authoring-follow-up-${randomUUID()}@example.test`
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
  await page.goto('/diaries/new')
  await selectLocale(page, 'en')
}

async function csrf(page: Page) {
  const token = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value
  expect(token).toBeTruthy()
  return { 'x-csrf-token': token! }
}

async function createDiary(page: Page, input: Record<string, unknown>) {
  const response = await page.request.post('/api/diaries', { headers: await csrf(page), data: input })
  expect(response.status()).toBe(201)
  return await response.json() as Diary
}

async function readDiary(page: Page, id: string) {
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

for (const width of [1440, 390]) {
  test(`full editor conflict and schedule evidence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await registerAndSignIn(page)
    const existing = await createDiary(page, { date: '2026-11-04', title: 'Visual conflict destination', content: 'Existing visual body' })
    await page.getByLabel('Diary date', { exact: true }).fill(existing.date)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Visual conflict draft')
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('The conflict state remains inspectable.')
    await page.getByRole('button', { name: 'Save diary', exact: true }).click()
    await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')
    await expect(page.getByTestId('api-error')).toContainText('A diary already exists for this date')
    await expect(page.getByTestId('api-error')).not.toContainText('Choose another date')
    await capture(page, 'full-conflict', width)

    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Visual conflict draft')
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('The conflict state remains inspectable.')
    await page.getByRole('button', { name: 'Save diary', exact: true }).click()
    await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')
    await page.getByRole('link', { name: 'Edit existing diary', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/diaries/${existing.id}/edit$`))
    await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, raw]) => {
      if (!key.startsWith('diary-editor-draft:') || !key.endsWith(':new') || !raw) return false
      return JSON.parse(raw).value?.form?.content === 'The conflict state remains inspectable.'
    }))).toBe(true)
    await page.goto('/diaries/new')
    await expect(page.getByRole('button', { name: 'Restore unsaved draft', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click()

    const schedulePath = `/diaries/${existing.id}/edit?returnTo=${encodeURIComponent(`/diaries/${existing.id}/review`)}#review-schedule`
    await page.goto(schedulePath)
    await expect(page.getByLabel('Review due at', { exact: true })).toBeFocused()
    await capture(page, 'full-schedule', width)
  })
}

test('full append keeps omitted structured values and applies explicit judgment, schedule, ledger and reminder changes', async ({ page }) => {
  await registerAndSignIn(page)
  const existing = await createDiary(page, {
    date: '2026-11-05',
    title: 'Structured destination title',
    content: 'Structured destination body',
    tags: ['existing-tag'],
    stockSymbols: ['AAPL'],
    thesis: 'Existing thesis',
    risk: 'Existing risk',
    execution: 'Existing execution',
    reviewDueAt: '2026-11-20T09:00:00.000Z',
    transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-11-05T02:00:00.000Z', notes: 'Existing ledger row' }],
    alerts: [{ message: 'Existing reminder', triggerAt: '2026-11-10T09:00:00.000Z' }],
  })
  await page.getByLabel('Diary date', { exact: true }).fill(existing.date)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Append title is destination-owned')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Structured append body')
  await page.getByRole('textbox', { name: 'Company context', exact: true }).fill('MSFT')
  await page.getByRole('textbox', { name: 'Tag 1', exact: true }).fill('new-tag')
  await page.getByRole('textbox', { name: 'Original thesis', exact: true }).fill('Explicit appended thesis')
  await page.getByRole('textbox', { name: 'Original risk assessment', exact: true }).fill('Explicit appended risk')
  await page.getByRole('textbox', { name: 'Original execution plan', exact: true }).fill('Explicit appended execution')
  await page.getByLabel('Review due at', { exact: true }).fill('2026-11-21T09:00')

  await page.getByRole('button', { name: 'Add purchase', exact: true }).click()
  const transaction = page.locator('.buy-row').last()
  await transaction.getByRole('textbox', { name: 'Symbol', exact: true }).fill('MSFT')
  await transaction.getByRole('textbox', { name: 'Quantity', exact: true }).fill('1')
  await transaction.getByRole('textbox', { name: 'Price per share', exact: true }).fill('110')
  await transaction.getByLabel('Trade date and time (device time)', { exact: true }).fill('2026-11-05T10:00')

  await page.getByRole('button', { name: 'Add reminder', exact: true }).click()
  await page.getByLabel('Reminder message', { exact: true }).last().fill('Explicit appended reminder')
  await page.getByLabel('Reminder time', { exact: true }).last().fill('2026-11-11T09:00')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')
  await page.getByRole('button', { name: 'Append this writing', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/diaries/${existing.id}$`))

  const appended = await readDiary(page, existing.id)
  expect(appended.title).toBe(existing.title)
  expect(appended.content).toContain('Structured append body')
  expect(appended.tags).toEqual(['existing-tag', 'new-tag'])
  expect(appended.thesis).toBe('Explicit appended thesis')
  expect(appended.risk).toBe('Explicit appended risk')
  expect(appended.execution).toBe('Explicit appended execution')
  expect(appended.reviewDueAt).not.toBe(existing.reviewDueAt)
  expect(appended.transactions).toHaveLength(2)
  expect(appended.transactions?.some(row => row.symbol === 'MSFT')).toBe(true)
  expect(appended.alerts?.some(row => row.message === 'Explicit appended reminder')).toBe(true)
})

test('full append writes a durable in-flight marker before a lost response and never replays after restore', async ({ page }) => {
  await registerAndSignIn(page)
  const existing = await createDiary(page, {
    date: '2026-11-01',
    title: 'Authoritative existing title',
    content: 'Original body',
    thesis: 'Existing thesis',
    risk: 'Existing risk',
    execution: 'Existing execution',
    reviewDueAt: '2026-12-01T09:00:00.000Z',
  })

  await page.getByLabel('Diary date', { exact: true }).fill(existing.date)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Draft title is ignored on append')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Append committed before the response was lost.')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')
  await expect(page.getByRole('button', { name: 'Append this writing', exact: true })).toBeVisible()

  let appendCalls = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    appendCalls += 1
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    await response.body()
    await route.abort('failed')
  })

  await page.getByRole('button', { name: 'Append this writing', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByRole('button', { name: 'Load latest version', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Append this writing', exact: true })).toBeDisabled()
  expect(appendCalls).toBe(1)

  await expect.poll(async () => page.evaluate(() => Object.entries(localStorage).some(([key, raw]) => {
    if (!key.startsWith('diary-editor-draft:') || !key.endsWith(':new') || !raw) return false
    return JSON.parse(raw).value?.uncertainAppend === true
  }))).toBe(true)
  const committed = await readDiary(page, existing.id)
  expect(committed.content).toContain('Append committed before the response was lost.')
  expect(committed.title).toBe(existing.title)
  expect(committed.thesis).toBe(existing.thesis)
  expect(committed.risk).toBe(existing.risk)
  expect(committed.execution).toBe(existing.execution)
  expect(committed.reviewDueAt).toBe(existing.reviewDueAt)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Restore unsaved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore unsaved draft', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByRole('button', { name: 'Append this writing', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Load latest version', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discard draft', exact: true })).toBeVisible()
  expect(appendCalls).toBe(1)

  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-editor-draft:') && key.endsWith(':new')))).toBe(false)
  expect(appendCalls).toBe(1)
  await page.unroute('**/api/diaries')
})

test('full append refuses to send when the device cannot persist its uncertainty marker', async ({ page }) => {
  await registerAndSignIn(page)
  const existing = await createDiary(page, { date: '2026-11-02', title: 'Storage target', content: 'Original body' })
  await page.getByLabel('Diary date', { exact: true }).fill(existing.date)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Storage failure draft')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('This writing must stay in the form.')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')

  let appendCalls = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() === 'POST') appendCalls += 1
    await route.continue()
  })
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key.startsWith('diary-editor-draft:')) throw new Error('storage disabled for recovery marker')
      return original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Append this writing', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('SYS_INTERNAL_ERROR')
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('This writing must stay in the form.')
  await expect(page.getByRole('button', { name: 'Append this writing', exact: true })).toBeEnabled()
  expect(appendCalls).toBe(0)
  expect((await readDiary(page, existing.id)).content).toBe('Original body')
  await page.unroute('**/api/diaries')
})

test('full append keeps an uncertain lock for an unknown 408 response', async ({ page }) => {
  await registerAndSignIn(page)
  const existing = await createDiary(page, { date: '2026-11-07', title: 'Unknown response destination', content: 'Original body' })
  await page.getByLabel('Diary date', { exact: true }).fill(existing.date)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Unknown response draft')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('The proxy response must keep recovery locked.')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')

  let appendCalls = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    appendCalls += 1
    await route.fulfill({
      status: 408,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 408, statusMessage: 'Request Timeout', data: { code: 'SYS_INTERNAL_ERROR', details: null, requestId: 'unknown-408' } }),
    })
  })

  await page.getByRole('button', { name: 'Append this writing', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByRole('button', { name: 'Load latest version', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Append this writing', exact: true })).toBeDisabled()
  await expect.poll(async () => page.evaluate(() => Object.entries(localStorage).some(([key, raw]) => {
    if (!key.startsWith('diary-editor-draft:') || !key.endsWith(':new') || !raw) return false
    return JSON.parse(raw).value?.uncertainAppend === true
  }))).toBe(true)
  expect(appendCalls).toBe(1)
  expect((await readDiary(page, existing.id)).content).toBe(existing.content)
  await page.unroute('**/api/diaries')
})

test('full append preserves its lock when the page reloads while the request is pending', async ({ page }) => {
  await registerAndSignIn(page)
  const existing = await createDiary(page, { date: '2026-11-08', title: 'Pending response destination', content: 'Original body' })
  await page.getByLabel('Diary date', { exact: true }).fill(existing.date)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Pending response draft')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('The marker must survive an immediate reload.')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')

  let appendCalls = 0
  let releaseResponse!: () => void
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve })
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    appendCalls += 1
    try {
      await responseGate
      await route.fulfill({
        status: 408,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 408, statusMessage: 'Request Timeout', data: { code: 'SYS_INTERNAL_ERROR', details: null, requestId: 'pending-408' } }),
      })
    } catch {
      // Navigation may abort the request before the gated response is sent.
    }
  })

  await page.getByRole('button', { name: 'Append this writing', exact: true }).click()
  await expect.poll(() => appendCalls).toBe(1)
  await expect.poll(async () => page.evaluate(() => Object.entries(localStorage).some(([key, raw]) => {
    if (!key.startsWith('diary-editor-draft:') || !key.endsWith(':new') || !raw) return false
    return JSON.parse(raw).value?.uncertainAppend === true
  }))).toBe(true)
  page.once('dialog', dialog => void dialog.accept())
  await page.reload()
  releaseResponse()
  await expect(page.getByRole('button', { name: 'Restore unsaved draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore unsaved draft', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByRole('button', { name: 'Append this writing', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Append this writing', exact: true })).toBeDisabled()
  expect(appendCalls).toBe(1)
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-editor-draft:') && key.endsWith(':new')))).toBe(false)
  await page.unroute('**/api/diaries')
})

test('review schedule keeps guest continuation, cancel return, and completed review state when cleared', async ({ page, browser }) => {
  await registerAndSignIn(page)
  const existing = await createDiary(page, { date: '2026-11-09', title: 'Completed schedule destination', content: 'Reviewed body', reviewDueAt: '2026-12-01T09:00:00.000Z' })
  const headers = await csrf(page)
  expect((await page.request.patch(`/api/diaries/${existing.id}/review`, { headers, data: { reviewOutcome: 'INTACT', reviewSummary: 'The original judgment held.' } })).status()).toBe(200)

  const origin = new URL(page.url()).origin
  const guestContext = await browser.newContext({ baseURL: origin })
  const guest = await guestContext.newPage()
  const password = 'synthetic-full-authoring-follow-up-password'
  const email = `full-schedule-guest-${randomUUID()}@example.test`
  try {
    expect((await guest.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
    // The account used to create the diary must be the one that signs in after
    // the continuation assertion; register a separate guest account only to
    // exercise the safe link without exposing the private diary.
    const schedulePath = `/diaries/${existing.id}/edit?returnTo=${encodeURIComponent(`/diaries/${existing.id}/review`)}#review-schedule`
    await guest.goto(schedulePath)
    await selectLocale(guest, 'en')
    const signIn = guest.getByRole('link', { name: 'Sign in', exact: true }).last()
    await expect(signIn).toHaveAttribute('href', `/login?returnTo=${encodeURIComponent(schedulePath)}`)
    await signIn.click()
    await guest.getByLabel('Email', { exact: true }).fill(email)
    await guest.getByLabel('Password', { exact: true }).fill(password)
    await guest.getByRole('button', { name: 'Sign in', exact: true }).click()
    // The guest account cannot access the diary, but the exact editor
    // continuation remains in the URL after authentication.
    await expect(guest).toHaveURL(new RegExp(`/diaries/${existing.id}/edit\\?returnTo=${encodeURIComponent(`/diaries/${existing.id}/review`)}#review-schedule$`))
    await expect(guest.getByTestId('error-code')).toHaveText('DIARY_NOT_FOUND')
  } finally {
    await guestContext.close()
  }

  // Continue with the owning account to cover cancel and clearing schedule on
  // an already completed review without coupling this case to guest data.
  await page.goto(`/diaries/${existing.id}/review`)
  await expect(page.getByRole('heading', { name: 'Review completed', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Change review schedule', exact: true }).click()
  await expect(page.getByLabel('Review due at', { exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/diaries/${existing.id}/review$`))
  await expect(page.getByRole('heading', { name: 'Review completed', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Change review schedule', exact: true }).click()
  await page.getByLabel('Review due at', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/diaries/${existing.id}/review$`))
  await expect(page.getByRole('heading', { name: 'Review completed', exact: true })).toBeVisible()
  await expect(page.getByTestId('review-status')).toHaveText('Reviewed')
  await expect(page.getByText('Review due: Not scheduled', { exact: true })).toBeVisible()
  const cleared = await page.request.get(`/api/diaries/${existing.id}/review`)
  expect(cleared.status()).toBe(200)
  const clearedData = await cleared.json()
  expect(clearedData.reviewDueAt).toBeNull()
  expect(clearedData.reviewedAt).toBeTruthy()
  expect(clearedData.reviewStatus).toBe('reviewed')
  expect(clearedData.reviewOutcome).toBe('INTACT')
  expect(clearedData.reviewSummary).toBe('The original judgment held.')
})

test('successful full save removes its draft before lifecycle cleanup can restore it', async ({ page }) => {
  await registerAndSignIn(page)
  const date = '2026-11-03'
  await page.getByLabel('Diary date', { exact: true }).fill(date)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Confirmed lifecycle save')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('The confirmed save is clean.')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-editor-draft:') && key.endsWith(':new')))).toBe(false)

  await page.goto(`/diaries/new?date=${date}`)
  await expect(page.getByRole('button', { name: 'Restore unsaved draft', exact: true })).toHaveCount(0)
})

test('the real React lifecycle keeps key-bound values across account-key changes and save suppression', async ({ page }) => {
  await registerAndSignIn(page)
  const result = await page.evaluate(async () => {
    type Controls = { flushDraft: () => boolean; suppressDraft: () => void }
    const browserWindow = window as typeof window & { __draftControls?: Controls; IS_REACT_ACT_ENVIRONMENT?: boolean }
    const reactModule = '/@id/react'
    const reactDomModule = '/@id/react-dom/client'
    const lifecycleModule = '/app/draft-lifecycle.ts'
    const reactNamespace = await import(/* @vite-ignore */ reactModule)
    const reactDomNamespace = await import(/* @vite-ignore */ reactDomModule)
    const React = (reactNamespace.default ?? reactNamespace) as typeof import('react')
    const ReactDOM = (reactDomNamespace.default ?? reactDomNamespace) as typeof import('react-dom/client')
    const lifecycle = await import(/* @vite-ignore */ lifecycleModule)
    const previousActEnvironment = browserWindow.IS_REACT_ACT_ENVIRONMENT
    browserWindow.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = ReactDOM.createRoot(host)
    function Harness(props: { draftKey: string; value: { content: string }; dirty: boolean }) {
      browserWindow.__draftControls = lifecycle.useDraftLifecycle({ key: props.draftKey, value: props.value, dirty: props.dirty, paused: false })
      return React.createElement('span')
    }
    const act = React.act
    const keyA = 'draft-lifecycle-e2e-A'
    const keyB = 'draft-lifecycle-e2e-B'
    const keyC = 'draft-lifecycle-e2e-C'
    const keyD = 'draft-lifecycle-e2e-D'
    const read = (key: string) => {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw).value : null
    }
    const render = async (props: { draftKey: string; value: { content: string }; dirty: boolean }) => {
      await act(async () => { root.render(React.createElement(Harness, props)) })
    }
    try {
      localStorage.removeItem(keyA); localStorage.removeItem(keyB); localStorage.removeItem(keyC); localStorage.removeItem(keyD)
      await render({ draftKey: keyA, value: { content: 'A' }, dirty: true })
      await render({ draftKey: keyB, value: { content: 'B' }, dirty: true })
      await new Promise(resolve => setTimeout(resolve, 700))
      if (read(keyA)?.content !== 'A' || read(keyB)?.content !== 'B') throw new Error('key change leaked a value')

      await render({ draftKey: keyB, value: { content: 'B2' }, dirty: true })
      await act(async () => { root.unmount() })
      if (read(keyB)?.content !== 'B2') throw new Error('unmount cleanup lost the committed value')

      const secondRoot = ReactDOM.createRoot(host)
      const renderSecond = async (props: { draftKey: string; value: { content: string }; dirty: boolean }) => {
        await act(async () => { secondRoot.render(React.createElement(Harness, props)) })
      }
      await renderSecond({ draftKey: keyC, value: { content: 'C1' }, dirty: true })
      await act(async () => { browserWindow.__draftControls?.suppressDraft() })
      if (read(keyC) !== null) throw new Error('suppression did not clear the draft')
      await renderSecond({ draftKey: keyC, value: { content: 'C baseline' }, dirty: false })
      await renderSecond({ draftKey: keyC, value: { content: 'C2' }, dirty: true })
      await new Promise(resolve => setTimeout(resolve, 700))
      if (read(keyC)?.content !== 'C2') throw new Error('suppression did not re-arm after new writing')

      await renderSecond({ draftKey: keyD, value: { content: 'D' }, dirty: true })
      let flushed = false
      await act(async () => { flushed = browserWindow.__draftControls?.flushDraft() ?? false })
      if (!flushed || read(keyD)?.content !== 'D') throw new Error('explicit flush did not preserve its captured value')
      await act(async () => { secondRoot.unmount() })
      return { keyA: read(keyA), keyB: read(keyB), keyC: read(keyC), keyD: read(keyD) }
    } finally {
      localStorage.removeItem(keyA); localStorage.removeItem(keyB); localStorage.removeItem(keyC); localStorage.removeItem(keyD)
      if (previousActEnvironment === undefined) delete browserWindow.IS_REACT_ACT_ENVIRONMENT
      else browserWindow.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
      host.remove()
    }
  })
  expect(result).toEqual({ keyA: { content: 'A' }, keyB: { content: 'B2' }, keyC: { content: 'C2' }, keyD: { content: 'D' } })
})
