import { randomUUID } from 'node:crypto';
import { test, expect, selectAccountLocale, selectLocale, selectTheme, signOut } from '../support/e2e';
/** Deleting is guarded: the row control opens the confirmation, the dialog confirms it. */
async function deleteFirst(page: import('@playwright/test').Page) {
 await page.getByTestId('principle').first().getByRole('button', { name: 'Delete principle', exact: true }).click();
 const dialog = page.getByRole('dialog', { name: 'Delete this principle?', exact: true });
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button', { name: 'Delete principle', exact: true }).click();
}
for (const width of [1440, 390]) test(`principles CRUD, keyboard reorder and random at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 const email = `principles-${randomUUID()}@example.test`, password = 'synthetic-principles-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/);
 await selectAccountLocale(page, 'en');
 await page.getByRole('button', { name: 'Read a random principle', exact: true }).click(); await expect(page.getByText('A reminder to keep writing', { exact: true })).toBeVisible();
 for (const content of ['Define the risk before placing a trade.', 'Review the original thesis before adding to a position.']) {
  await page.getByLabel('Principle', { exact: true }).fill(content); await page.getByRole('button', { name: 'Add principle', exact: true }).click();
  await expect(page.getByTestId('principle').filter({ hasText: content })).toBeVisible();
 }
 await expect(page.getByText('Principle added.', { exact: true })).toBeVisible();
 await expect(page.getByText('2 principles', { exact: true })).toBeVisible();
 const rows = page.getByTestId('principle');
 await rows.nth(1).getByRole('button', { name: 'Move up', exact: true }).focus(); await page.keyboard.press('Enter');
 await expect(rows.first()).toContainText('Review the original thesis');
 await expect(rows.first().locator('p').first()).toBeFocused();
 await expect(page.getByText('Order updated.', { exact: true })).toBeVisible();
 await page.reload(); await expect(rows.first()).toContainText('Review the original thesis');
 // Editing happens in the row: the row editor holds the current text and the Add form keeps its own empty field.
 await rows.first().getByRole('button', { name: 'Edit', exact: true }).click();
 const rowEditor = rows.first().getByRole('textbox', { name: 'Edit principle 01', exact: true });
 await expect(rowEditor).toBeFocused(); await expect(rowEditor).toHaveValue('Review the original thesis before adding to a position.');
 await expect(page.getByLabel('Principle', { exact: true })).toHaveValue('');
 await expect(rows.nth(1).getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
 await expect(page.getByText('The other rows stay locked until you save or cancel this edit.', { exact: true })).toBeVisible();
 await rowEditor.fill('Review the original thesis. Record what changed before increasing risk.');
 await rows.first().getByRole('button', { name: 'Save changes', exact: true }).click();
 await expect(rows.first()).toContainText('Record what changed');
 await expect(page.getByText('Principle updated.', { exact: true })).toBeVisible();
 await expect(rows.first().locator('p').first()).toBeFocused();
 await page.getByRole('button', { name: 'Read a random principle', exact: true }).click(); await expect(page.getByText('From your principles', { exact: true })).toBeVisible();
 await expect(page.locator('.discipline-draw-number')).toHaveCount(1);
 if (width === 390) await selectTheme(page, 'dark');
 await page.locator('.plan-page').screenshot({ path: `docs/design/evidence/discipline/${width}.png` });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 for (const [locale, title] of [['zh-TW', '交易紀律'], ['zh-CN', '交易纪律'], ['en', 'Trading principles']]) {
  await selectLocale(page, locale!); await expect(page.getByRole('heading', { name: title!, exact: true })).toBeVisible();
 }
 // Cancelling the confirmation keeps the principle; only the danger confirm removes it.
 await rows.first().getByRole('button', { name: 'Delete principle', exact: true }).click();
 const confirm = page.getByRole('dialog', { name: 'Delete this principle?', exact: true });
 await expect(confirm).toContainText('It cannot be undone.');
 await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
 await expect(rows).toHaveCount(2);
 await deleteFirst(page); await expect(rows).toHaveCount(1);
 await expect(page.getByText('Principle deleted.', { exact: true })).toBeVisible();
 await deleteFirst(page); await expect(rows).toHaveCount(0);
 await expect(page.getByText('No principles yet', { exact: true })).toBeVisible();
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
 await selectAccountLocale(page, 'en');
 await expect(page.getByTestId('api-error')).toBeVisible(); failRead = false;
 await page.getByRole('button', { name: 'Try again', exact: true }).click();
 const input = page.getByLabel('Principle', { exact: true });
 await input.fill('Preserve this unfinished principle.');
 await page.getByRole('button', { name: 'Add principle', exact: true }).click();
 await expect(page.getByTestId('api-error')).toBeFocused(); await expect(input).toHaveValue('Preserve this unfinished principle.');
 await expect(page.getByRole('button', { name: 'Add principle', exact: true })).toBeEnabled();
 const discard = page.getByRole('dialog', { name: 'Discard your unsaved principle?', exact: true });
 await page.getByRole('link', { name: 'Diary library', exact: true }).click();
 await expect(discard).toBeVisible(); await discard.getByRole('button', { name: 'Keep writing', exact: true }).click();
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
 await deleteFirst(page); await expect(page.getByTestId('api-error')).toBeVisible(); await expect(rows).toHaveCount(2);
 await deleteFirst(page); await expect(rows).toHaveCount(1);
 await input.fill('Discard only when confirmed.');
 await page.getByRole('link', { name: 'Diary library', exact: true }).click();
 await expect(discard).toBeVisible(); await discard.getByRole('button', { name: 'Discard and leave', exact: true }).click();
 await expect(page).toHaveURL(/\/diaries$/);
 await page.goto('/discipline'); await expect(input).toHaveValue(''); await expect(rows).toHaveCount(1);
});

test('a lost create response reconciles the committed row without retrying the POST', async ({ page }) => {
 const email = `principles-create-recovery-${randomUUID()}@example.test`, password = 'synthetic-principles-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/);
 await selectAccountLocale(page, 'en');
 let postCount = 0;
 await page.route('**/api/discipline', async route => {
  if (route.request().method() !== 'POST') { await route.continue(); return; }
  postCount += 1;
  if (postCount === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); return; }
  await route.continue();
 });
 const input = page.getByLabel('Principle', { exact: true }); await input.fill('Commit before the response arrives.');
 await page.getByRole('button', { name: 'Add principle', exact: true }).click();
 await expect(page.getByText('Principle added.', { exact: true })).toBeVisible();
 await expect(page.getByTestId('principle')).toHaveCount(1); await expect(input).toHaveValue(''); expect(postCount).toBe(1);
 const persisted = await (await page.request.get('/api/discipline')).json(); expect(persisted).toHaveLength(1);
});

test('long principle collections remain reachable on a narrow viewport', async ({ page, context }) => {
 await page.setViewportSize({ width: 390, height: 900 });
 const email = `principles-long-${randomUUID()}@example.test`, password = 'synthetic-principles-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiscipline'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/discipline$/); await selectAccountLocale(page, 'en');
 const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
 const disciplines = Array.from({ length: 120 }, (_, order) => ({ content: `Long collection principle ${order}`, order }));
 const imported = await page.request.post('/api/discipline/import', { headers, data: { json: JSON.stringify({ version: '1.0', type: 'trading-disciplines', disciplines, exportedAt: new Date().toISOString(), count: disciplines.length }), replaceExisting: true } });
 expect(imported.status()).toBe(200);
 expect(await imported.json()).toMatchObject({ success: true, imported: 120 });
 await page.reload();
 const rows = page.getByTestId('principle'); await expect(rows).toHaveCount(120, { timeout: 15_000 });
 await rows.last().scrollIntoViewIfNeeded(); await expect(rows.last()).toContainText('Long collection principle 119');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
