import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme, signOut } from '../support/e2e';
for (const width of [1440, 390]) test(`Thesis activation review and snapshot at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const email = `thesis-${randomUUID()}@example.test`, password = 'synthetic-thesis-password';
  await page.request.post('/api/auth/register', { data: { email, password } }); await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  await page.goto('/stocks/AAPL/thesis'); const current = page.getByRole('form', { name: 'Current thesis', exact: true });
  await current.getByRole('textbox', { name: 'Summary', exact: true }).fill('Original investment view'); await current.getByRole('button', { name: 'Save thesis', exact: true }).click(); await expect(page.getByTestId('thesis-health')).toHaveText('Draft');
  await current.getByRole('textbox', { name: 'Why I own it', exact: true }).fill('Durable demand'); await current.getByRole('combobox', { name: 'Status', exact: true }).selectOption('ACTIVE'); await current.getByLabel('Review due at (UTC)').fill('2026-09-05T10:30'); await current.getByRole('button', { name: 'Save thesis', exact: true }).click();
  const review = page.getByRole('form', { name: 'Complete thesis review', exact: true }); await expect(review).toBeVisible();
  await review.getByLabel('Review outcome').selectOption('PARTIAL'); await review.getByLabel('Portfolio decision').selectOption('REDUCE'); await review.getByRole('textbox', { name: 'What changed', exact: true }).fill('Competition increased');
  await review.getByRole('button', { name: 'Complete thesis review', exact: true }).click(); await expect(page.getByTestId('thesis-review')).toHaveCount(1);
  await current.getByRole('textbox', { name: 'Summary', exact: true }).fill('Revised investment view'); await expect(review.getByRole('button', { name: 'Complete thesis review', exact: true })).toBeDisabled(); await current.getByRole('button', { name: 'Save thesis', exact: true }).click();
  await page.getByTestId('thesis-review').getByText('Thesis at review time', { exact: true }).click(); await expect(page.getByTestId('thesis-review')).toContainText('Original investment view'); await expect(page.getByTestId('thesis-review')).not.toContainText('Revised investment view');
  if (width === 390) await selectTheme(page, 'dark'); await page.getByTestId('thesis-review').screenshot({ path: `docs/design/evidence/thesis/review-${width}.png` }); await current.screenshot({ path: `docs/design/evidence/thesis/editor-${width}.png` }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await current.getByRole('combobox', { name: 'Status', exact: true }).selectOption('ARCHIVED'); await current.getByRole('button', { name: 'Save thesis', exact: true }).click(); await expect(page.getByTestId('thesis-health')).toHaveText('Archived'); await expect(review).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId('thesis-review')).toHaveCount(1); await expect(current.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue('Revised investment view');
  for (const [locale, title] of [['zh-TW', 'AAPL · 投資論點'], ['zh-CN', 'AAPL · 投资论点'], ['en', 'AAPL · Investment thesis']] as const) { await selectLocale(page, locale); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); }
  await signOut(page); await expect(page.getByTestId('thesis-review')).toHaveCount(0);
});

test('Thesis failed save preserves both edits and unsaved reflection', async ({ page, context }) => {
  const email = `thesis-retry-${randomUUID()}@example.test`, password = 'synthetic-thesis-password';
  await page.request.post('/api/auth/register', { data: { email, password } }); await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  expect((await page.request.put('/api/stocks/AAPL/thesis', { headers, data: { status: 'ACTIVE', summary: 'Original', whyIOwnIt: 'Reason', reviewDueAt: '2026-09-05T10:30:45.123Z' } })).status()).toBe(200);
  await page.goto('/stocks/AAPL/thesis'); const current = page.getByRole('form', { name: 'Current thesis', exact: true }), review = page.getByRole('form', { name: 'Complete thesis review', exact: true });
  await review.getByRole('textbox', { name: 'What changed', exact: true }).fill('Keep this unsaved reflection'); await current.getByRole('textbox', { name: 'Summary', exact: true }).fill('Updated thesis');
  await page.route('**/api/stocks/AAPL/thesis', async route => { if (route.request().method() === 'PUT') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'thesis-retry' } }) }); else await route.continue(); });
  await current.getByRole('button', { name: 'Save thesis', exact: true }).click(); await expect(page.getByTestId('request-id')).toHaveText('thesis-retry'); await expect(current.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue('Updated thesis');
  await page.unroute('**/api/stocks/AAPL/thesis'); await current.getByRole('button', { name: 'Save thesis', exact: true }).click(); await expect(page.getByText('Thesis saved.', { exact: true })).toBeVisible();
  await expect(review.getByRole('textbox', { name: 'What changed', exact: true })).toHaveValue('Keep this unsaved reflection');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('link', { name: 'Back to company', exact: true }).click(); await expect(page).toHaveURL(/\/stocks\/AAPL\/thesis$/);
  const state = await (await page.request.get('/api/stocks/AAPL/thesis')).json(); expect(state.thesis.reviewDueAt).toBe('2026-09-05T10:30:45.123Z'); expect(state.reviews).toEqual([]);
  await review.getByRole('button', { name: 'Complete thesis review', exact: true }).click(); await expect(page.getByTestId('thesis-review')).toContainText('Keep this unsaved reflection');
  await page.getByRole('link', { name: 'Back to company', exact: true }).click(); await expect(page).toHaveURL(/\/stocks\/AAPL$/);
});
