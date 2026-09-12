import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { e2eBaseURL, test, expect, selectLocale, selectTheme, signOut } from '../support/e2e';
test('two independent accounts accept, share separately and remove a partnership', async ({ page: a, browser, playwright }) => {
 const context = await browser.newContext({ viewport: { width: 390, height: 900 } }); const b = await context.newPage();
 const emailA = `partner-a-${randomUUID()}@example.test`, emailB = `partner-b-${randomUUID()}@example.test`, password = 'synthetic-partner-password';
 async function signIn(page: Page, email: string) {
  await page.goto(`${e2eBaseURL}/login?returnTo=%2Fpartners`); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/partners$/); await selectLocale(page, 'en');
 }
 async function login(page: Page, email: string) {
  await page.request.post(`${e2eBaseURL}/api/auth/register`, { data: { email, password } });
  await signIn(page, email);
 }
 try {
  await a.setViewportSize({ width: 1440, height: 900 }); await login(a, emailA); await login(b, emailB);
  await a.getByLabel('Partner email', { exact: true }).fill(emailB); await a.getByRole('button', { name: 'Invite partner', exact: true }).click();
  await expect(a.getByTestId('partner')).toContainText('Awaiting acceptance'); await expect(a.getByRole('button', { name: 'Accept invitation', exact: true })).toHaveCount(0);
  await b.getByRole('button', { name: 'Refresh partners', exact: true }).click(); await expect(b.getByTestId('partner')).toContainText('Invitation received');
  await b.getByRole('button', { name: 'Accept invitation', exact: true }).click(); await expect(b.getByTestId('partner')).toContainText('Connected');
  await a.getByRole('button', { name: 'Refresh partners', exact: true }).click(); await expect(a.getByTestId('partner-sharing')).toHaveText('Diaries: Private · Stock notes: Private');
  await a.getByRole('button', { name: 'Share my diaries', exact: true }).click(); await expect(a.getByRole('button', { name: 'Stop sharing my diaries', exact: true })).toBeVisible();
  await b.getByRole('button', { name: 'Share my stock notes', exact: true }).click(); await b.getByRole('button', { name: 'Refresh partners', exact: true }).click();
  await expect(b.getByTestId('partner-sharing')).toHaveText('Diaries: Shared · Stock notes: Private');
  await a.reload(); await expect(a.getByTestId('partner-sharing')).toHaveText('Diaries: Private · Stock notes: Shared');
  await expect(a.getByRole('button', { name: 'Stop sharing my diaries', exact: true })).toBeVisible();
  await signOut(a); await expect(a.getByTestId('sign-out')).toHaveCount(0);
  await signIn(a, emailA);
  await expect(a.getByTestId('partner-sharing')).toHaveText('Diaries: Private · Stock notes: Shared');
  await expect(a.getByRole('button', { name: 'Stop sharing my diaries', exact: true })).toBeVisible();
  await expect(a.getByRole('button', { name: 'Share my stock notes', exact: true })).toBeVisible();
  await selectTheme(b, 'dark');
  for (const [page, width] of [[a, 1440], [b, 390]] as const) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.locator('.plan-page').screenshot({ path: `docs/design/evidence/partners/${width}.png` }); }
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  expect((await b.request.post(`${e2eBaseURL}/api/diaries`, { headers, data: { date: '2026-03-08', title: 'Partner comparison entry', content: '**Shared perspective**', thesis: 'Do not expose this private thesis' } })).status()).toBe(201);
  await a.getByRole('link', { name: 'Compare diaries', exact: true }).click();
  await expect(a.getByText('Your partner has not shared diaries.', { exact: true })).toBeVisible();
  await expect(a.getByTestId('compare-day')).toHaveCount(0);
  await b.getByRole('button', { name: 'Share my diaries', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Stop sharing my diaries', exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
  await expect(a.getByTestId('partner-diary')).toContainText('Partner comparison entry');
  await expect(a.getByTestId('owner-diary')).toContainText('No diary on this day.');
  await expect(a.locator('.pair-page')).not.toContainText('Do not expose this private thesis');
  await expect(a.locator('.pair-page')).not.toContainText(emailB);
  for (const width of [1440, 390]) { await a.setViewportSize({ width, height: 900 }); expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await a.locator('.pair-page').screenshot({ path: `docs/design/evidence/partners/compare-${width}.png` }); }
  for (const [locale, title] of [['zh-TW', '日記對照'], ['zh-CN', '日记对照'], ['en', 'Pair View']] as const) { await selectLocale(a, locale); await expect(a.getByRole('heading', { name: title, exact: true })).toBeVisible(); await expect(a.getByTestId('partner-diary')).toContainText('Partner comparison entry'); }
  await a.route('**/api/partners/compare?*', route => route.abort());
  await a.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
  await expect(a.getByTestId('compare-day')).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await a.unroute('**/api/partners/compare?*');
  await a.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(a.getByTestId('partner-diary')).toContainText('Partner comparison entry');
  await b.getByRole('button', { name: 'Stop sharing my diaries', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Share my diaries', exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Refresh comparison', exact: true }).click();
  await expect(a.getByTestId('compare-day')).toHaveCount(0);
  const keyResponse = await b.request.post(`${e2eBaseURL}/api/api-keys`, { headers, data: { label: 'Partner research agent', scope: 'AGENT_WRITE' } }); expect(keyResponse.status()).toBe(200);
  const { rawKey } = await keyResponse.json();
  const external = await playwright.request.newContext({ baseURL: e2eBaseURL, extraHTTPHeaders: { 'x-api-key': rawKey } });
  try {
   expect((await external.post('/api/agent/stocks/AAPL/notes', { data: { title: 'Shared partner research', content: 'Read this without editing it.' } })).status()).toBe(200);
   expect((await external.post('/api/agent/stocks/records', { data: { records: [{ symbol: 'AAPL', summary: 'Partner private evidence stays private', sourceType: 'MANUAL', occurredAt: '2026-09-05T00:00:00Z', idempotencyKey: 'private-partner-evidence' }] } })).status()).toBe(200);
  } finally { await external.dispose(); }

  await a.goto('/stocks/AAPL');
  const notes = a.getByRole('region', { name: 'Company notes', exact: true });
  await expect(notes.getByLabel('Whose notes').locator('option')).toHaveCount(2);
  await notes.getByLabel('Whose notes').selectOption({ index: 1 });
  await expect(notes.getByTestId('stock-note')).toContainText('Shared partner research');
  await expect(notes.getByTestId('stock-note')).toContainText('Partner research agent');
  await expect(a.getByTestId('evidence-record')).toHaveCount(0);
  await expect(a.locator('main')).not.toContainText('Partner private evidence stays private');
  await expect(notes.getByRole('button', { name: 'Edit note', exact: true })).toHaveCount(0);
  await expect(notes.getByRole('button', { name: 'Delete note', exact: true })).toHaveCount(0);
  await expect(notes.getByRole('button', { name: 'New note', exact: true })).toHaveCount(0);
  await expect(notes).not.toContainText(emailB);
  await b.getByRole('button', { name: 'Stop sharing my stock notes', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Share my stock notes', exact: true })).toBeVisible();
  await notes.getByRole('button', { name: 'Refresh notes', exact: true }).click();
  await expect(notes.getByTestId('stock-note')).toHaveCount(0);
  await notes.getByLabel('Whose notes').selectOption('');
  await expect(notes.getByRole('button', { name: 'New note', exact: true })).toBeVisible();
  await a.goto('/partners');
  b.once('dialog', dialog => dialog.accept()); await b.getByRole('button', { name: 'Remove connection', exact: true }).click(); await expect(b.getByTestId('partner')).toHaveCount(0);
  await a.getByRole('button', { name: 'Refresh partners', exact: true }).click(); await expect(a.getByTestId('partner')).toHaveCount(0);
  await signOut(a); await expect(a.getByLabel('Partner email', { exact: true })).toHaveCount(0);
 } finally { await context.close(); }
});

test('comparison login preserves an explicit partner selection', async ({ page }) => {
 const email = `compare-login-${randomUUID()}@example.test`, password = 'synthetic-partner-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/partners/compare?partnerId=999999'); await selectLocale(page, 'en');
 await page.locator('.pair-page').getByRole('link', { name: 'Sign in', exact: true }).click();
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click();
 await expect(page).toHaveURL(/\/partners\/compare\?partnerId=999999$/);
 await expect(page.getByTestId('compare-day')).toHaveCount(0);
});
