import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme, signOut } from '../support/e2e';
for (const width of [1440, 390]) test(`principles CRUD, keyboard reorder and random at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 const email = `principles-${randomUUID()}@example.test`, password = 'synthetic-principles-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/);
 await selectLocale(page, 'en');
 await page.getByRole('button', { name: 'Read a random principle', exact: true }).click(); await expect(page.getByText('A reminder to keep writing', { exact: true })).toBeVisible();
 for (const content of ['Define the risk before placing a trade.', 'Review the original thesis before adding to a position.']) {
  await page.getByLabel('Principle', { exact: true }).fill(content); await page.getByRole('button', { name: 'Add principle', exact: true }).click();
  await expect(page.getByTestId('principle').filter({ hasText: content })).toBeVisible();
 }
 const rows = page.getByTestId('principle');
 await rows.nth(1).getByRole('button', { name: 'Move up', exact: true }).focus(); await page.keyboard.press('Enter');
 await expect(rows.first()).toContainText('Review the original thesis');
 await expect(rows.first().locator('p').first()).toBeFocused();
 await page.reload(); await expect(rows.first()).toContainText('Review the original thesis');
 await rows.first().getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.getByLabel('Principle', { exact: true })).toBeFocused();
 await page.getByLabel('Principle', { exact: true }).fill('Review the original thesis. Record what changed before increasing risk.');
 await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(rows.first()).toContainText('Record what changed');
 await page.getByRole('button', { name: 'Read a random principle', exact: true }).click(); await expect(page.getByText('From your principles', { exact: true })).toBeVisible();
 if (width === 390) await selectTheme(page, 'dark');
 await page.locator('.plan-page').screenshot({ path: `docs/design/evidence/discipline/${width}.png` });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 for (const [locale, title] of [['zh-TW', '交易紀律'], ['zh-CN', '交易纪律'], ['en', 'Trading principles']]) {
  await selectLocale(page, locale!); await expect(page.getByRole('heading', { name: title!, exact: true })).toBeVisible();
 }
 await rows.first().getByRole('button', { name: 'Delete principle', exact: true }).click(); await expect(rows).toHaveCount(1);
 await rows.first().getByRole('button', { name: 'Delete principle', exact: true }).click(); await expect(rows).toHaveCount(0);
 await signOut(page); await expect(page.getByLabel('Principle', { exact: true })).toHaveCount(0);
});

test('failed principle reads and writes recover without losing a dirty draft or optimistic order', async ({ page }) => {
 const email = `principles-recovery-${randomUUID()}@example.test`, password = 'synthetic-principles-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await selectLocale(page, 'en');
 let failRead = true, failWrite = true, failReorder = true;
 await page.route('**/api/discipline', async route => {
  const method = route.request().method();
  if ((method === 'GET' && failRead) || (method === 'POST' && failWrite)) { await route.abort('failed'); return; }
  await route.continue();
 });
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/);
 await selectLocale(page, 'en');
 await expect(page.getByTestId('api-error')).toBeVisible(); failRead = false;
 await page.getByRole('button', { name: 'Try again', exact: true }).click();
 const input = page.getByLabel('Principle', { exact: true });
 await input.fill('Preserve this unfinished principle.');
 await page.getByRole('button', { name: 'Add principle', exact: true }).click();
 await expect(page.getByTestId('api-error')).toBeFocused(); await expect(input).toHaveValue('Preserve this unfinished principle.');
 await expect(page.getByRole('button', { name: 'Add principle', exact: true })).toBeEnabled();
 page.once('dialog', dialog => dialog.dismiss());
 await page.getByRole('link', { name: 'Diary library', exact: true }).click();
 await expect(page).toHaveURL(/\/discipline$/); await expect(input).toHaveValue('Preserve this unfinished principle.');
 failWrite = false; await page.getByRole('button', { name: 'Add principle', exact: true }).click();
 const rows = page.getByTestId('principle'); await expect(rows).toHaveCount(1);
 await input.fill('Second principle.'); await page.getByRole('button', { name: 'Add principle', exact: true }).click(); await expect(rows).toHaveCount(2);
 await page.route('**/api/discipline/reorder', async route => { if (failReorder) await route.abort('failed'); else await route.continue(); });
 await rows.last().getByRole('button', { name: 'Move up', exact: true }).click(); await expect(page.getByTestId('api-error')).toBeVisible();
 await expect(rows.first()).toContainText('Preserve this unfinished principle.');
 failReorder = false; await rows.last().getByRole('button', { name: 'Move up', exact: true }).click(); await expect(rows.first()).toContainText('Second principle.');
 let loseDeleteResponse = true;
 await page.route('**/api/discipline/*', async route => {
  if (route.request().method() === 'DELETE' && loseDeleteResponse) { loseDeleteResponse = false; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }
  else await route.continue();
 });
 await rows.first().getByRole('button', { name: 'Delete principle', exact: true }).click(); await expect(page.getByTestId('api-error')).toBeVisible(); await expect(rows).toHaveCount(2);
 await rows.first().getByRole('button', { name: 'Delete principle', exact: true }).click(); await expect(rows).toHaveCount(1);
 await input.fill('Discard only when confirmed.'); page.once('dialog', dialog => dialog.accept());
 await page.getByRole('link', { name: 'Diary library', exact: true }).click(); await expect(page).toHaveURL(/\/diaries$/);
 await page.goto('/discipline'); await expect(input).toHaveValue(''); await expect(rows).toHaveCount(1);
});

test('a lost create response reconciles the committed row without retrying the POST', async ({ page }) => {
 const email = `principles-create-recovery-${randomUUID()}@example.test`, password = 'synthetic-principles-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/);
 await selectLocale(page, 'en');
 let postCount = 0;
 await page.route('**/api/discipline', async route => {
  if (route.request().method() !== 'POST') { await route.continue(); return; }
  postCount += 1;
  if (postCount === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); return; }
  await route.continue();
 });
 const input = page.getByLabel('Principle', { exact: true }); await input.fill('Commit before the response arrives.');
 await page.getByRole('button', { name: 'Add principle', exact: true }).click();
 await expect(page.getByText('Principles updated.', { exact: true })).toBeVisible();
 await expect(page.getByTestId('principle')).toHaveCount(1); await expect(input).toHaveValue(''); expect(postCount).toBe(1);
 const persisted = await (await page.request.get('/api/discipline')).json(); expect(persisted).toHaveLength(1);
});

test('long principle collections remain reachable on a narrow viewport', async ({ page, context }) => {
 await page.setViewportSize({ width: 390, height: 900 });
 const email = `principles-long-${randomUUID()}@example.test`, password = 'synthetic-principles-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/); await selectLocale(page, 'en');
 const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
 for (let index = 0; index < 120; index++) {
  const response = await page.request.post('/api/discipline', { headers, data: { content: `Long collection principle ${index}` } });
  expect(response.status()).toBe(200);
 }
 await page.reload();
 const rows = page.getByTestId('principle'); await expect(rows).toHaveCount(120, { timeout: 15_000 });
 await rows.last().scrollIntoViewIfNeeded(); await expect(rows.last()).toContainText('Long collection principle 119');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
