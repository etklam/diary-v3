import { randomUUID } from 'node:crypto'
import { test, expect, selectLocale } from '../support/e2e'

test('Diary create can retry when the write fails before commit', async ({ page }) => {
  const email = `diary-precommit-loss-${randomUUID()}@example.test`
  const password = 'synthetic-diary-precommit-loss-password'
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
  await page.goto('/diaries/new')
  await selectLocale(page, 'en')
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-09')
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Precommit retry')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('The first write never reaches the API.')
  await page.route('**/api/diaries', async route => {
    if (route.request().method() === 'POST') await route.abort('failed')
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByRole('button', { name: 'Save diary', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('The first write never reaches the API.')
  await page.unroute('**/api/diaries')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
})

test('Diary create and explicit reminder replacement reconcile a committed response loss', async ({ page }) => {
  const email = `diary-response-loss-${randomUUID()}@example.test`
  const password = 'synthetic-diary-response-loss-password'
  const createDate = '2026-09-10'
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.get('/api/auth/me')).status()).toBe(200)

  await page.goto('/diaries/new')
  await selectLocale(page, 'en')
  await page.getByLabel('Diary date', { exact: true }).fill(createDate)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('  Response loss create  ')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('The committed create must be reconciled.')
  await page.getByLabel('Tag 1', { exact: true }).fill('response-loss')
  await page.getByRole('button', { name: 'Add tag', exact: true }).click()
  await page.getByLabel('Tag 2', { exact: true }).fill('response-loss')

  let createCalls = 0
  await page.route('**/api/diaries', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return }
    createCalls += 1
    if (createCalls === 1) {
      const response = await route.fetch()
      expect(response.status()).toBe(201)
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/\d+$/)
  expect(createCalls).toBe(1)
  const created = await (await page.request.get(`/api/diaries/by-date?date=${createDate}`)).json() as { id: string; title: string }
  expect(created.title).toBe('Response loss create')

  await page.goto('/diaries/new')
  await page.getByLabel('Diary date', { exact: true }).fill(createDate)
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Response loss create')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('The committed create must be reconciled.')
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS')
  expect(createCalls).toBe(2)
  const afterDuplicate = await (await page.request.get(`/api/diaries/by-date?date=${createDate}`)).json() as { id: string }
  expect(afterDuplicate.id).toBe(created.id)
  await page.unroute('**/api/diaries')

  const csrfToken = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')?.value ?? ''
  const sourceResponse = await page.request.post('/api/diaries', {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      date: '2026-09-11', title: 'Reminder source', content: 'Original reminder decision.',
      alerts: [{ message: 'Initial reminder', triggerAt: '2026-09-12T09:00:00.000Z' }],
    },
  })
  expect(sourceResponse.status()).toBe(201)
  const source = await sourceResponse.json() as { id: string; alerts: Array<{ triggerAt: string }> }
  await page.goto(`/diaries/${source.id}/edit`)
  await expect(page.getByLabel('Reminder message', { exact: true })).toHaveValue('Initial reminder')
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Browser reminder update')
  await page.getByLabel('Reminder message', { exact: true }).fill('Browser reminder update')

  let putCalls = 0
  let concurrentApplied = false
  await page.route(`**/api/diaries/${source.id}`, async route => {
    const method = route.request().method()
    if (method === 'PUT' && putCalls === 0) {
      putCalls += 1
      const response = await route.fetch()
      expect(response.status()).toBe(200)
      await route.abort('failed')
      return
    }
    if (method === 'GET' && putCalls === 1 && !concurrentApplied) {
      concurrentApplied = true
      const current = await (await page.request.get(`/api/diaries/${source.id}`)).json() as { alerts: Array<{ triggerAt: string }> }
      const concurrent = await page.request.put(`/api/diaries/${source.id}`, {
        headers: { 'x-csrf-token': csrfToken },
        data: { title: 'Concurrent decision', content: 'Concurrent decision body.', alerts: [{ message: 'Concurrent reminder', triggerAt: current.alerts[0]!.triggerAt }] },
      })
      expect(concurrent.status()).toBe(200)
    }
    await route.continue()
  })
  await page.getByRole('button', { name: 'Save diary', exact: true }).click()
  await expect(page.getByTestId('error-code')).toHaveText('DIARY_WRITE_UNCERTAIN')
  await expect(page.getByText('The save result could not be confirmed.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save diary', exact: true })).toBeDisabled()
  expect(putCalls).toBe(1)
  const concurrent = await (await page.request.get(`/api/diaries/${source.id}`)).json() as { title: string; alerts: Array<{ message: string }> }
  expect(concurrent.title).toBe('Concurrent decision')
  expect(concurrent.alerts[0]!.message).toBe('Concurrent reminder')

  await page.getByRole('button', { name: 'Load latest version', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Concurrent decision')
  await expect(page.getByLabel('Reminder message', { exact: true })).toHaveValue('Concurrent reminder')
  await page.unroute(`**/api/diaries/${source.id}`)
})
