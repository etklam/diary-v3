import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme, signOut } from '../support/e2e';

for (const width of [1440, 390]) test(`Review queue navigation, completion and recovery at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `queue-${randomUUID()}@example.test`, password = 'synthetic-queue-password';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  const created = await page.request.post('/api/diaries', { headers, data: { title: 'Recheck demand', date: '2026-01-01', content: 'Private body', thesis: 'Original demand hypothesis', risk: 'Small sample', reviewDueAt: '2020-01-01T00:00:00Z', stockSymbols: ['AAPL', 'MSFT'] } }); expect(created.status()).toBe(201); const diary = await created.json();
  expect((await page.request.put('/api/stocks/AAPL/thesis', { headers, data: { status: 'ACTIVE', summary: 'Company hypothesis', whyIOwnIt: 'Demand', reviewDueAt: '2020-01-01T00:00:00Z' } })).status()).toBe(200);
  expect((await page.request.put('/api/stocks/MSFT/thesis', { headers, data: { status: 'ACTIVE', summary: 'Unscheduled hypothesis', whyIOwnIt: 'Demand' } })).status()).toBe(200);
  await page.goto('/reviews'); const overdue = page.getByRole('region', { name: 'Overdue', exact: true });
  await expect(overdue.getByTestId('review-queue-item')).toHaveCount(2);
  await expect(page.getByTestId('queue-count-overdue')).toContainText('2'); await expect(page.getByTestId('queue-count-today')).toContainText('0');
  const secondary = page.getByTestId('queue-secondary'); expect(await secondary.getAttribute('open')).toBeNull();
  await secondary.locator('summary').click();
  await expect(page.getByRole('region', { name: 'Unscheduled', exact: true })).toContainText('MSFT');
  await expect(page.getByTestId('review-queue-item').filter({ hasText: 'Recheck demand' })).toContainText('MSFT');
  await expect(page.locator('main')).not.toContainText('Private body');
  await overdue.getByRole('link', { name: 'Review diary: Recheck demand', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/diaries/${diary.id}/review$`));
  await page.getByRole('radio', { name: 'Partly confirmed', exact: true }).check(); await page.getByRole('textbox', { name: 'What happened', exact: true }).fill('Private reflection'); await page.getByRole('button', { name: 'Complete review', exact: true }).click(); await expect(page.getByTestId('review-status')).toHaveText('Reviewed');
  await page.goto('/reviews'); await expect(overdue.getByTestId('review-queue-item')).toHaveCount(1);
  await page.getByTestId('queue-secondary').locator('summary').click();
  await expect(page.getByRole('region', { name: 'Completed', exact: true })).toContainText('Recheck demand'); await expect(page.locator('main')).not.toContainText('Private reflection');
  await overdue.getByRole('link', { name: 'Review thesis: AAPL · Investment thesis', exact: true }).click(); await expect(page).toHaveURL(/\/stocks\/AAPL\/thesis$/);
  await page.getByRole('form', { name: 'Complete thesis review', exact: true }).getByRole('textbox', { name: 'What changed', exact: true }).fill('Private company reflection'); await page.getByRole('button', { name: 'Complete thesis review', exact: true }).click(); await expect(page.getByTestId('thesis-review')).toHaveCount(1);
  // The thesis page keeps the queue hand-off, so the completed review returns
  // to the queue directly instead of relying on browser history.
  await page.locator('main').getByRole('link', { name: 'Review queue', exact: true }).click(); await expect(page).toHaveURL(/\/reviews$/);
  await expect(overdue.getByTestId('review-queue-item')).toHaveCount(0); await expect(page.getByTestId('queue-count-overdue')).toContainText('0'); await expect(page.getByRole('region', { name: 'Completed', exact: true }).getByTestId('review-queue-item')).toHaveCount(2); await expect(page.locator('main')).not.toContainText('Private company reflection');
  const shots = [`docs/design/evidence/review-queue/${width}.png`];
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.locator('main').screenshot({ path: shots[0] });
  if (width === 1440) { await selectTheme(page, 'dark'); await page.locator('main').screenshot({ path: 'docs/design/evidence/review-queue/queue-1440-dark.png' }); await selectTheme(page, 'light'); }
  if (width === 390) { await selectTheme(page, 'light'); await page.locator('main').screenshot({ path: 'docs/design/evidence/review-queue/390-light.png' }); await selectTheme(page, 'dark'); await page.locator('main').screenshot({ path: 'docs/design/evidence/review-queue/queue-390-dark.png' }); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/api/reviews?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'queue-retry' } }) })); await page.reload(); await expect(page.getByTestId('request-id')).toHaveText('queue-retry'); await page.unroute('**/api/reviews?*'); await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(page.getByTestId('review-queue-item')).toHaveCount(3);
  for (const [locale, title] of [['zh-TW', '複盤隊列'], ['zh-CN', '复盘队列'], ['en', 'Review queue']] as const) { await selectLocale(page, locale); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); }
  await signOut(page); await expect(page.getByTestId('review-queue-item')).toHaveCount(0);
});

test('Review queue keeps all open diaries reachable across pages', async ({ page, context }) => {
  const email = `queue-pages-${randomUUID()}@example.test`, password = 'synthetic-queue-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  for (let day = 1; day <= 25; day++) expect((await page.request.post('/api/diaries', { headers, data: { title: `Queue entry ${day}`, date: `2026-01-${String(day).padStart(2, '0')}`, content: 'Synthetic', reviewDueAt: '2020-01-01T00:00:00Z' } })).status()).toBe(201);
  await page.goto('/reviews'); await expect(page.getByTestId('review-queue-item')).toHaveCount(20); await expect(page.getByTestId('queue-count-overdue')).toContainText('25'); await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.locator('main').screenshot({ path: 'docs/design/evidence/review-queue/1440-populated.png' });
  await page.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(page).toHaveURL(/\/reviews\?page=2$/); await expect(page.getByTestId('review-queue-item')).toHaveCount(5); await expect(page.getByTestId('review-queue-item').filter({ hasText: 'Queue entry 21' })).toHaveCount(1); await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled(); await expect(page.getByTestId('queue-count-overdue')).toContainText('25');
  await page.reload(); await expect(page.getByTestId('review-queue-item').filter({ hasText: 'Queue entry 21' })).toHaveCount(1); await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await expect(page.getByTestId('review-queue-item')).toHaveCount(20);
});

test('Review queue filters by type and keeps its context across a completed review', async ({ page, context }) => {
  const email = `queue-filter-${randomUUID()}@example.test`, password = 'synthetic-queue-password';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  const created = await page.request.post('/api/diaries', { headers, data: { title: 'Filter diary one', date: '2026-01-02', content: 'Synthetic', reviewDueAt: '2020-01-01T00:00:00Z' } }); expect(created.status()).toBe(201); const diary = await created.json();
  expect((await page.request.post('/api/diaries', { headers, data: { title: 'Filter diary two', date: '2026-01-03', content: 'Synthetic', reviewDueAt: '2020-01-01T00:00:00Z' } })).status()).toBe(201);
  expect((await page.request.put('/api/stocks/NVDA/thesis', { headers, data: { status: 'ACTIVE', summary: 'Filter thesis', whyIOwnIt: 'Demand', reviewDueAt: '2020-01-01T00:00:00Z' } })).status()).toBe(200);
  await page.goto('/reviews');
  const filter = page.getByRole('navigation', { name: 'Filter by type', exact: true });
  await expect(page.getByTestId('review-queue-item')).toHaveCount(3);
  await filter.getByRole('link', { name: 'Diaries', exact: true }).click();
  await expect(page).toHaveURL(/\/reviews\?target=diary$/);
  await expect(page.getByTestId('review-queue-item')).toHaveCount(2);
  await expect(page.getByTestId('review-queue-item').filter({ hasText: 'Investment thesis' })).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId('review-queue-item')).toHaveCount(2);
  await filter.getByRole('link', { name: 'Investment theses', exact: true }).click();
  await expect(page).toHaveURL(/\/reviews\?target=thesis$/);
  await expect(page.getByTestId('review-queue-item')).toHaveCount(1);
  await expect(page.getByTestId('review-queue-item').filter({ hasText: 'NVDA' })).toHaveCount(1);
  await filter.getByRole('link', { name: 'Diaries', exact: true }).click();
  await expect(page.getByTestId('review-queue-item')).toHaveCount(2);
  await page.getByRole('link', { name: 'Review diary: Filter diary one', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${diary.id}/review$`));
  expect((await page.request.patch(`/api/diaries/${diary.id}/review`, { headers, data: { reviewOutcome: 'INTACT', reviewLearning: 'Filter continuity reflection' } })).status()).toBe(200);
  await page.reload(); await expect(page.getByTestId('review-status')).toHaveText('Reviewed');
  await page.locator('.review-complete-actions').getByRole('link', { name: 'Review queue', exact: true }).click();
  await expect(page).toHaveURL(/\/reviews\?target=diary$/);
  await page.getByTestId('queue-secondary').locator('summary').click();
  await expect(page.getByRole('region', { name: 'Completed', exact: true })).toContainText('Filter diary one');
  await expect(page.getByRole('region', { name: 'Overdue', exact: true }).getByTestId('review-queue-item')).toHaveCount(1);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.locator('main').screenshot({ path: 'docs/design/evidence/review-queue/return-from-review.png' });
});

test('Review queue welcomes a fresh account with an entry point', async ({ page }) => {
  const email = `queue-empty-${randomUUID()}@example.test`, password = 'synthetic-queue-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  await page.goto('/reviews');
  const emptyBlock = page.getByTestId('queue-empty');
  await expect(emptyBlock).toContainText('Nothing waiting for review right now.');
  await expect(emptyBlock.getByRole('link', { name: 'Write a diary', exact: true })).toHaveAttribute('href', '/diaries/new');
  await expect(emptyBlock.getByRole('link', { name: 'Diary library', exact: true })).toHaveAttribute('href', '/diaries');
  await expect(page.getByRole('region', { name: 'Today', exact: true })).toContainText('Nothing due today.');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.locator('main').screenshot({ path: 'docs/design/evidence/review-queue/1440-empty.png' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
