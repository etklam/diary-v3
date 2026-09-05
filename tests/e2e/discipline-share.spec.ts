import { test, expect } from '../support/e2e';
import { createDisciplineShare, disciplineShareUrl } from '@diary/contracts/discipline-share';
test('public discipline share renders without JavaScript and safely exposes OG metadata', async ({ browser, request }) => {
 const share = createDisciplineShare([{ content: '原則 😀 <script>unsafe()</script> & risk', order: 0 }], { title: '公開原則 & <標題>', author: '作者'.repeat(30), description: 'Shared intentionally' }, '2026-01-01T00:00:00Z');
 const url = disciplineShareUrl(share, 'http://127.0.0.1:3200');
 const context = await browser.newContext({ javaScriptEnabled: false });
 try {
  const page = await context.newPage(); const response = await page.goto(url); expect(response?.status()).toBe(200); expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('heading', { name: share.title!, exact: true })).toBeVisible();
  await expect(page.locator('article li')).toHaveText(share.disciplines[0]!.content); await expect(page).toHaveTitle(share.title!);
  expect(await page.locator('article script').count()).toBe(0);
  const og = await page.locator('meta[property="og:image"]').getAttribute('content'); expect(og).toContain('/api/og/discipline.svg?');
  const image = await request.get(og!); expect(image.status()).toBe(200); expect(image.headers()['content-type']).toContain('image/svg+xml');
  const ogPage = await context.newPage(); await ogPage.goto(og!); await ogPage.screenshot({ path: 'docs/design/evidence/discipline/og.png' }); await ogPage.close();
  const svg = await image.text(); expect(svg).toContain('&amp;'); expect(svg).toContain('&lt;標題&gt;'); expect(svg).not.toContain('<標題>');
  const invalid = await page.goto('http://127.0.0.1:3200/discipline/share?import=bad'); expect(invalid?.status()).toBe(400);
  await expect(page.locator('article li')).toHaveCount(0);
 } finally { await context.close(); }
});

test('file preview imports and exported download roundtrips into public sharing', async ({ page }) => {
 const email = `transfer-${Date.now()}@example.test`, password = 'synthetic-transfer-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await page.getByTestId('locale-select').selectOption('en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/); await page.getByTestId('locale-select').selectOption('en');
 const source = createDisciplineShare([{ content: '紀律 😀 & risk', order: 0 }, { content: 'Second principle', order: 1 }], {}, '2026-01-01T00:00:00Z');
 await page.getByLabel('Choose JSON file').setInputFiles({ name: 'principles.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
 await expect(page.getByRole('heading', { name: 'Principles to import: 2', exact: true })).toBeVisible();
 await expect(page.getByTestId('principle')).toHaveCount(0);
 await page.getByRole('button', { name: 'Import principles', exact: true }).click(); await expect(page.getByTestId('principle')).toHaveCount(2);
 await page.getByLabel('Share title', { exact: true }).fill('Shared risk rules');
 await page.getByRole('button', { name: 'Prepare export', exact: true }).click(); await expect(page.getByLabel('Public share link', { exact: true })).toBeVisible();
 const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download JSON', exact: true }).click(); const file = await download;
 expect(file.suggestedFilename()).toBe('trading-disciplines.json');
 const stream = await file.createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(chunk); const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
 expect(exported.disciplines.map((row: { content: string }) => row.content)).toEqual(source.disciplines.map(row => row.content)); expect(exported.author).toBe('Anonymous');
 await page.getByTestId('principle').first().getByRole('button', { name: 'Edit', exact: true }).click();
 await page.getByLabel('Principle', { exact: true }).fill('Updated after first export'); await page.getByRole('button', { name: 'Save changes', exact: true }).click();
 await expect(page.getByTestId('principle').first()).toContainText('Updated after first export');
 await expect(page.getByLabel('Public share link', { exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: 'Prepare export', exact: true }).click(); await expect(page.getByLabel('Public share link', { exact: true })).toBeVisible();
 const link = await page.getByLabel('Public share link', { exact: true }).inputValue(); await page.goto(link); await expect(page.getByRole('heading', { name: 'Shared risk rules', exact: true })).toBeVisible(); await expect(page.locator('article li').first()).toHaveText('Updated after first export');
 await page.getByRole('link', { name: 'Preview import', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Principles to import: 2', exact: true })).toBeVisible();
 await page.getByRole('combobox', { name: 'Import and share', exact: true }).selectOption('replace');
 page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Import principles', exact: true }).click(); await expect(page.getByTestId('principle')).toHaveCount(2); await expect(page).toHaveURL(/\/discipline$/);
});

test('a lost import response reconciles committed rows without duplicating a retry', async ({ page }) => {
 const email = `uncertain-import-${Date.now()}@example.test`, password = 'synthetic-transfer-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await page.getByTestId('locale-select').selectOption('en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/); await page.getByTestId('locale-select').selectOption('en');
 const source = createDisciplineShare([{ content: 'Commit before the response arrives', order: 0 }, { content: 'Keep the recovery path explicit', order: 1 }], {}, '2026-01-01T00:00:00Z');
 await page.getByLabel('Choose JSON file').setInputFiles({ name: 'uncertain.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
 await expect(page.getByRole('heading', { name: 'Principles to import: 2', exact: true })).toBeVisible();
 let dropped = false;
 await page.route('**/api/discipline/import', async route => {
  if (dropped) return route.continue();
  dropped = true; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed');
 });
 await page.getByRole('button', { name: 'Import principles', exact: true }).click();
 await expect(page.getByText('Import completed.', { exact: true })).toBeVisible();
 await expect(page.getByTestId('principle')).toHaveCount(2);
 await expect(page.getByRole('heading', { name: 'Principles to import: 2', exact: true })).toHaveCount(0);
 const persisted = await (await page.request.get('/api/discipline')).json(); expect(persisted).toHaveLength(2);
});

test('guest import survives sign-in and changing locale preserves edited preview text', async ({ page }) => {
 const email = `guest-share-${Date.now()}@example.test`, password = 'synthetic-transfer-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 const source = createDisciplineShare([{ content: 'Original shared rule', order: 0 }], {}, '2026-01-01T00:00:00Z');
 await page.goto(disciplineShareUrl(source, 'http://127.0.0.1:3200'));
 await page.getByTestId('locale-select').selectOption('en'); await page.getByRole('link', { name: 'Preview import', exact: true }).click();
 await page.getByRole('link', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/login\?returnTo=/);
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline\?import=/);
 await page.getByTestId('locale-select').selectOption('en'); await expect(page.getByRole('heading', { name: 'Principles to import: 1', exact: true })).toBeVisible();
 const changed = JSON.stringify({ ...source, disciplines: [{ content: 'Edited before import', order: 0 }] });
 await page.getByLabel('Share JSON', { exact: true }).fill(changed);
 page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('link', { name: 'Diary library', exact: true }).click(); await expect(page).toHaveURL(/\/discipline\?import=/); await expect(page.getByLabel('Share JSON', { exact: true })).toHaveValue(changed);
 await page.getByTestId('locale-select').selectOption('zh-TW'); await expect(page.getByLabel('分享 JSON', { exact: true })).toHaveValue(changed);
 await page.getByRole('button', { name: '預覽匯入', exact: true }).click(); await page.getByRole('button', { name: '匯入紀律', exact: true }).click();
 await expect(page.getByTestId('principle')).toHaveText(/Edited before import/); await expect(page).toHaveURL(/\/discipline$/);
});

test('new account registration preserves the shared import destination through sign-in', async ({ page }) => {
 const source = createDisciplineShare([{ content: 'A new account can import this rule', order: 0 }], {}, '2026-01-01T00:00:00Z');
 await page.goto(disciplineShareUrl(source, 'http://127.0.0.1:3200'));
 await page.getByTestId('locale-select').selectOption('en'); await page.getByRole('link', { name: 'Preview import', exact: true }).click();
 await page.getByRole('link', { name: 'Sign in', exact: true }).click();
 await page.getByRole('link', { name: 'Create account', exact: true }).click(); await expect(page).toHaveURL(/\/register\?returnTo=/);
 const email = `new-share-${Date.now()}@example.test`, password = 'synthetic-transfer-password';
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(page.locator('.form-page [role="status"]')).toBeVisible();
 await page.getByRole('link', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/login\?returnTo=/);
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline\?import=/);
 await page.getByTestId('locale-select').selectOption('en');
 await expect(page.getByRole('heading', { name: 'Principles to import: 1', exact: true })).toBeVisible();
 await expect(page.getByRole('region', { name: 'Import and share', exact: true })).toContainText('A new account can import this rule');
 await expect(page.getByTestId('principle')).toHaveCount(0);
});

for (const width of [1440, 390]) test(`sharing remains readable and clipboard denial recovers at ${width}px`, async ({ page, context }) => {
 await page.setViewportSize({ width, height: 900 });
 const email = `share-layout-${width}-${Date.now()}@example.test`, password = 'synthetic-transfer-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await page.getByTestId('locale-select').selectOption('en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/); await page.getByTestId('locale-select').selectOption('en');
 const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
 await page.request.post('/api/discipline', { headers, data: { content: 'Review the original evidence before increasing risk. 原則與理由。' } });
 await page.reload();
 if (width === 390) await page.getByTestId('theme-select').selectOption('dark');
 await page.getByLabel('Share title', { exact: true }).fill('Principles for the next decision'); await page.getByRole('button', { name: 'Prepare export', exact: true }).click();
 const link = page.getByLabel('Public share link', { exact: true }); await expect(link).toBeVisible(); const url = await link.inputValue();
 await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Synthetic denial', 'NotAllowedError'); } } }); });
 await page.getByRole('button', { name: 'Copy link', exact: true }).click(); await expect(page.getByText('Copy was blocked. Select the link and copy it manually.', { exact: true })).toBeVisible();
 await expect(link).toHaveValue(url); await link.focus(); await link.selectText();
 expect(await link.evaluate(element => { const input = element as HTMLTextAreaElement; return input.selectionEnd - input.selectionStart; })).toBe(url.length);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.getByRole('region', { name: 'Import and share', exact: true }).screenshot({ path: `docs/design/evidence/discipline/transfer-${width}.png` });
 await page.goto(url); await expect(page.locator('article li')).toContainText('原則與理由');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.locator('article').screenshot({ path: `docs/design/evidence/discipline/public-${width}.png` });
});
