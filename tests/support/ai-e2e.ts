import { randomUUID } from 'node:crypto'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { e2eBaseURL } from './e2e-origin'

export async function aiMutation(context: BrowserContext, request: APIRequestContext, method: 'POST' | 'PUT' | 'DELETE', path: string, data?: unknown) {
  const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')?.value ?? ''
  return request.fetch(path, { method, headers: { 'x-csrf-token': csrf }, data })
}

/** Wait for saved preferences before selecting the test's interface language. */
export async function gotoAiPage(page: Page, path: '/reviews/ai-reports' | '/admin/ai') {
  const preferences = page.waitForResponse(response => new URL(response.url()).pathname === '/api/user/settings' && response.request().method() === 'GET' && response.ok())
  await page.goto(path)
  await preferences
}

/** Configure the disposable browser server through the real admin API. */
export async function configureSyntheticAi(browser: Browser, recipient: { recipientName?: string; disclosureVersion?: string } = {}) {
  const context = await browser.newContext({ baseURL: e2eBaseURL, extraHTTPHeaders: { 'x-e2e-test-id': randomUUID() } })
  const request = context.request
  expect((await request.post('/api/auth/login', { data: { email: 'ai-admin@example.test', password: 'synthetic-ai-admin-password' } })).status()).toBe(200)
  expect((await request.get('/api/auth/me')).status()).toBe(200)
  const settings = await (await request.get('/api/admin/ai/settings')).json()
  const draft = await aiMutation(context, request, 'PUT', '/api/admin/ai/settings/draft', {
    expectedRevision: settings.provider?.revision ?? 0,
    displayName: 'Synthetic browser provider', providerType: 'deepseek', protocol: 'chat_completions',
    baseUrl: 'https://api.deepseek.com', model: 'synthetic-review-model', thinking: 'disabled',
    maxInputTokens: 64_000, maxOutputTokens: 4_000, timeoutMs: 30_000, monthlyBudgetCents: 100_000,
    recipientName: 'Synthetic browser recipient', disclosureVersion: 'browser-v1',
    disclosureText: 'Only synthetic browser records are used in this test environment.',
    pricingCurrency: 'USD', pricingVersion: 'synthetic-v1', inputPricePerMillionCents: 100,
    outputPricePerMillionCents: 200, reservationCostCents: 10,
    ...recipient,
    apiKeyAction: 'replace', apiKey: 'synthetic-browser-secret',
  })
  expect(draft.status()).toBe(200)
  const { revision } = await draft.json()
  expect((await aiMutation(context, request, 'POST', '/api/admin/ai/settings/test', { expectedRevision: revision })).status()).toBe(200)
  expect((await aiMutation(context, request, 'POST', '/api/admin/ai/settings/publish', { expectedRevision: revision })).status()).toBe(200)
  const prompts = await (await request.get('/api/admin/ai/prompts')).json()
  for (const type of ['weekly', 'monthly']) {
    let prompt = prompts.data.filter((item: { reportType: string }) => item.reportType === type).sort((a: { revision: number }, b: { revision: number }) => b.revision - a.revision)[0]
    const originalDefault = prompts.data.find((item: { reportType: string; isDefault: boolean }) => item.reportType === type && item.isDefault)
    if (originalDefault && prompt.template !== originalDefault.template) {
      const restored = await aiMutation(context, request, 'POST', `/api/admin/ai/prompts/${type}/restore-default`, { expectedRevision: prompt.revision })
      expect(restored.status()).toBe(200)
      prompt = await restored.json()
    }
    if (prompt.status === 'published') continue
    expect((await aiMutation(context, request, 'POST', `/api/admin/ai/prompts/${type}/test`, { expectedRevision: prompt.revision })).status()).toBe(200)
    expect((await aiMutation(context, request, 'POST', `/api/admin/ai/prompts/${type}/publish`, { expectedRevision: prompt.revision })).status()).toBe(200)
  }
  expect((await aiMutation(context, request, 'PUT', '/api/admin/ai/runtime', { generationEnabled: true })).status()).toBe(200)
  return context
}

export async function registerAiOwner(page: Page, admin: BrowserContext) {
  const email = `ai-browser-${randomUUID()}@example.test`
  const password = 'synthetic-ai-owner-password'
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200)
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).status()).toBe(200)
  const me = await (await page.request.get('/api/auth/me')).json()
  const userId = me.data.id
  expect((await aiMutation(admin, admin.request, 'PUT', `/api/admin/ai/access/${userId}`, { enabled: true, monthlyQuota: 10 })).status()).toBe(200)
  // Choose the last completed owner-local week as the calendar advances.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: me.data.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => Number(parts.find(value => value.type === type)!.value)
  const monday = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 7)
  const periodStart = monday.toISOString().slice(0, 10)
  const diary = await aiMutation(page.context(), page.request, 'POST', '/api/diaries', {
    date: periodStart, title: 'Synthetic report source', content: 'A saved synthetic decision for private review.',
  })
  expect(diary.status()).toBe(201)
  return { email, password, userId: String(userId), periodStart, diary: (await diary.json()).data }
}
