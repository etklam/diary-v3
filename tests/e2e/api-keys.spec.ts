import { randomUUID } from 'node:crypto';
import { test, expect } from '../support/e2e';
for (const width of [1440, 390]) test(`API key external diary and revocation at ${width}px`, async ({ page, playwright }) => {
 await page.setViewportSize({ width, height: 900 });
 const email = `keys-${randomUUID()}@example.test`, password = 'synthetic-keys-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fsettings%2Fapi-keys'); await page.getByTestId('locale-select').selectOption('en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/settings\/api-keys$/); await page.getByTestId('locale-select').selectOption('en');
 await page.getByRole('combobox', { name: 'Access scope', exact: true }).selectOption('AGENT_WRITE'); await page.getByLabel('Key label', { exact: true }).fill('External research writer'); await page.getByRole('button', { name: 'Create key', exact: true }).click();
 const secret = page.getByRole('textbox', { name: 'New API key', exact: true });
 const rawKey = await page.locator('textarea[readonly]').inputValue(); expect(rawKey).toMatch(/^dva_[0-9a-f]{48}$/);
 await page.context().grantPermissions([]);
 await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }));
 await page.getByRole('button', { name: 'Copy key', exact: true }).click(); await expect(page.getByText('Copy was unavailable. Select the key and copy it manually.')).toBeVisible();
 await expect(secret).toBeVisible();
 await page.getByRole('button', { name: 'I have saved this key', exact: true }).click(); await expect(page.locator('textarea[readonly]')).toHaveCount(0);
 const client = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3200', extraHTTPHeaders: { 'x-api-key': rawKey } });
 try {
  const result = await client.post('/api/agent/diaries', { data: { date: '2026-09-05', title: 'Published externally', content: 'Research from a standard HTTP client.' } }); expect(result.status()).toBe(201); const diary = await result.json();
  await page.goto(`/diaries/${diary.id}`); await expect(page.getByRole('heading', { name: 'Published externally', exact: true })).toBeVisible(); await expect(page.getByText('Research from a standard HTTP client.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('diary-source')).toHaveText('Created via API key · External research writer');
  expect((await client.post('/api/agent/stocks/AAPL/notes', { data: { title: 'External company view', content: 'Agent-authored company research.' } })).status()).toBe(200);
  const records = [{ symbol: 'AAPL', summary: 'Immutable external evidence', sourceType: 'ARTICLE', sourceTitle: 'Synthetic external source', idempotencyKey: 'external-evidence', occurredAt: '2026-09-05T00:00:00Z' }];
  expect((await (await client.post('/api/agent/stocks/records', { data: { records } })).json()).created).toHaveLength(1);
  expect((await (await client.post('/api/agent/stocks/records', { data: { records: [{ ...records[0], summary: 'Must not replace the evidence' }] } })).json()).skipped).toEqual([{ symbol: 'AAPL', reason: 'ALREADY_EXISTS' }]);
  await page.goto('/stocks/AAPL'); await expect(page.getByTestId('stock-note')).toContainText('External company view'); await expect(page.getByTestId('stock-note')).toContainText('External research writer');
  await expect(page.getByTestId('evidence-record')).toHaveCount(1); await expect(page.getByTestId('evidence-record')).toContainText('Immutable external evidence'); await expect(page.getByTestId('evidence-record')).not.toContainText('Must not replace');
  await expect(page.getByRole('region', { name: 'Company notes', exact: true }).getByRole('button', { name: 'Edit note', exact: true })).toHaveCount(0);
  await page.goto('/settings/api-keys'); await expect(page.getByTestId('api-key')).toContainText('Last used'); await expect(page.locator('textarea[readonly]')).toHaveCount(0); await expect(page.locator('.plan-page')).not.toContainText(rawKey);
  if (width === 390) await page.getByTestId('theme-select').selectOption('dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.locator('.plan-page').screenshot({ path: `docs/design/evidence/api-keys/${width}.png` });
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Revoke key', exact: true }).click(); await expect(page.getByTestId('api-key')).toContainText('Revoked');
  expect((await client.post('/api/agent/diaries', { data: { date: '2026-09-06', title: 'Denied', content: 'Synthetic' } })).status()).toBe(401);
 } finally { await client.dispose(); }
});
