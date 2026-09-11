import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme, signOut } from '../support/e2e';
for (const width of [1440, 390]) test(`Watchlist persistence and recovery at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `watch-${randomUUID()}@example.test`, password = 'synthetic-watchlist-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en'); await page.goto('/stocks/watchlist');
  await expect(page.getByText('No companies yet. Add a symbol to start your research.')).toBeVisible();
  const add = async (symbol: string) => { await page.getByLabel('Stock symbol', { exact: true }).fill(symbol); await page.getByRole('button', { name: 'Add company', exact: true }).click(); await expect(page.getByTestId(`watch-${symbol.trim().toUpperCase()}`)).toBeVisible(); };
  await add(' aapl '); await add('UNKNOWN'); await add('aapl');
  await expect(page.locator('.plan-list > li')).toHaveCount(2);
  const csrfToken = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')?.value;
  expect(csrfToken).toBeTruthy();
  const evidence = await page.request.post('/api/stocks/UNKNOWN/evidence', {
    headers: { 'x-csrf-token': csrfToken! },
    data: {
      summary: 'Synthetic latest watchlist record.',
      sourceType: 'ARTICLE',
      occurredAt: '2026-09-05T10:30:00Z',
      sourceTitle: 'Watchlist evidence fixture',
      sourceUrl: 'https://example.test/watchlist-record',
    },
  });
  expect(evidence.status()).toBe(200);
  await page.reload();
  const unknown = page.getByTestId('watch-UNKNOWN');
  await expect(unknown).toContainText('Research records: 1');
  await expect(unknown).toContainText('Synthetic latest watchlist record.');
  const aapl = page.getByTestId('watch-AAPL'); await expect(aapl).toBeVisible();
  await aapl.getByLabel('Sort order').fill('9'); await aapl.getByRole('button', { name: 'Save order' }).click();
  await expect(page.locator('.plan-list > li').first()).toHaveAttribute('data-testid', 'watch-UNKNOWN');
  await page.route('**/api/stocks/watchlist/*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'watch-retry' } }) }));
  await aapl.getByRole('button', { name: 'Remove', exact: true }).click(); await expect(page.getByTestId('request-id')).toHaveText('watch-retry'); await expect(aapl).toBeVisible();
  await page.unroute('**/api/stocks/watchlist/*'); await aapl.getByRole('button', { name: 'Remove', exact: true }).click(); await expect(aapl).toHaveCount(0);
  await add('AAPL'); await expect(aapl.getByLabel('Sort order')).toHaveValue('9');
  if (width === 390) await selectTheme(page, 'dark');
  await page.screenshot({ path: `docs/design/evidence/watchlist/${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const [locale, title] of [['zh-TW', '關注清單'], ['zh-CN', '关注清单'], ['en', 'Watchlist']] as const) { await selectLocale(page, locale); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); }
  await page.getByTestId('watch-UNKNOWN').getByRole('link', { name: 'UNKNOWN', exact: true }).click(); await expect(page).toHaveURL(/\/stocks\/UNKNOWN$/);
  await page.goto('/stocks/watchlist'); await expect(aapl).toBeVisible();
  await signOut(page); await expect(aapl).toHaveCount(0);
});
