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
  await expect(page.getByText('No companies match this view. Add a symbol to start your research.')).toBeVisible();
  const add = async (symbol: string) => { await page.getByLabel('Stock symbol', { exact: true }).fill(symbol); await page.getByRole('button', { name: 'Add company', exact: true }).click(); await expect(page.getByTestId(`watch-${symbol.trim().toUpperCase()}`)).toBeVisible(); };
  const readWatchlist = async () => {
    const response = await page.request.get('/api/stocks/watchlist', { headers: { 'x-watchlist-features': 'management-v1' } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    return body.items as Array<{ id: string; stock: { symbol: string }; sortOrder: number; pinned: boolean }>;
  };
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
  // An unresearched row states the fallback once, and the counts read as one
  // sentence rather than a bordered strip of three figures.
  await expect(aapl.getByText('No research records yet.')).toHaveCount(1);
  await expect(page.locator('.watch-counts')).toHaveText('2 tracked · 1 with research · 1 not yet researched');
  // The old orphaned helper line is gone with the condition that needed it.
  await expect(page.getByText('Move up and down is available in custom order.')).toHaveCount(0);
  // Quick add is the only bordered region before the list, and the list card is the other.
  await expect(page.locator('.watch-page .card')).toHaveCount(2);
  const initialItems = await readWatchlist();
  const initialAapl = initialItems.find(item => item.stock.symbol === 'AAPL');
  expect(initialAapl).toBeDefined();
  const initialAaplId = initialAapl!.id;
  // Reading rows carry at most four controls and no reorder: arranging is a mode.
  await expect(aapl.locator('.watch-actions a, .watch-actions button')).toHaveCount(3);
  await expect(aapl.getByRole('button', { name: 'Move down · AAPL', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Arrange order', exact: true }).click();
  await expect(aapl.locator('.watch-actions a, .watch-actions button')).toHaveCount(3);
  await aapl.getByRole('button', { name: 'Move down · AAPL', exact: true }).click();
  await expect(page.locator('.plan-list > li').first()).toHaveAttribute('data-testid', 'watch-UNKNOWN');
  // Reorder stays operable from the keyboard, and a move that disables the pressed
  // control hands focus back to the company instead of dropping it to the document.
  await aapl.getByRole('button', { name: 'Move up · AAPL', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.plan-list > li').first()).toHaveAttribute('data-testid', 'watch-AAPL');
  await expect(aapl.getByRole('button', { name: 'Move up · AAPL', exact: true })).toBeDisabled();
  await expect(aapl.locator('.watch-identity h3')).toBeFocused();
  // Pinning stays available while arranging and its state is readable once the
  // control is gone from the reading row.
  await aapl.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect(aapl.locator('.watch-pinned')).toHaveText('Pinned');
  await page.getByRole('button', { name: 'Done arranging', exact: true }).click();
  await expect(aapl.locator('.watch-pinned')).toHaveText('Pinned');
  await expect(aapl.getByRole('button', { name: 'Move up · AAPL', exact: true })).toHaveCount(0);
  await page.route('**/api/stocks/watchlist/*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'watch-retry' } }) }));
  await aapl.getByRole('button', { name: 'Remove · AAPL', exact: true }).click(); await expect(page.getByTestId('request-id')).toHaveText('watch-retry'); await expect(aapl).toBeVisible();
  await page.unroute('**/api/stocks/watchlist/*'); await aapl.getByRole('button', { name: 'Remove · AAPL', exact: true }).click(); await expect(aapl).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo remove', exact: true }).click(); await expect(aapl).toBeVisible();
  const restoredItems = await readWatchlist();
  const restoredAapl = restoredItems.find(item => item.stock.symbol === 'AAPL');
  expect(restoredAapl).toBeDefined();
  expect(restoredAapl!.id).toBe(initialAaplId);
  expect(restoredAapl!.sortOrder).toBeGreaterThanOrEqual(0);
  expect(restoredAapl!.sortOrder).toBeLessThan(restoredItems.length);
  if (width === 390) {
    // A company's controls must not outweigh the company: the stacked block stays
    // the smaller half of its own row.
    const row = page.getByTestId('watch-AAPL');
    const rowBox = await row.boundingBox();
    const actionsBox = await row.locator('.watch-actions').boundingBox();
    expect(rowBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(actionsBox!.height).toBeLessThanOrEqual(rowBox!.height - actionsBox!.height);
    await selectTheme(page, 'dark');
  }
  await page.screenshot({ path: `docs/design/evidence/watchlist/${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const [locale, title] of [['zh-TW', '關注清單'], ['zh-CN', '关注清单'], ['en', 'Watchlist']] as const) { await selectLocale(page, locale); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); }
  await page.getByTestId('watch-UNKNOWN').getByRole('link', { name: 'UNKNOWN', exact: true }).click(); await expect(page).toHaveURL(/\/stocks\/UNKNOWN$/);
  await page.goto('/stocks/watchlist'); await expect(aapl).toBeVisible();
  await signOut(page); await expect(aapl).toHaveCount(0);
});
