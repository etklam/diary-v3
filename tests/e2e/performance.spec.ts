import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme, signOut } from '../support/e2e';
for (const width of [1440, 390]) test(`Performance filters, tables and charts at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 }); const email = `performance-${randomUUID()}@example.test`, password = 'synthetic-performance-password';
  await page.request.post('/api/auth/register', { data: { email, password } }); await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  await page.goto('/stocks'); await page.getByRole('link', { name: 'Strategy performance', exact: true }).click(); await expect(page).toHaveURL(/\/strategy-performance$/); await expect(page.locator('main')).toContainText('No closed trades for this selection.');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  expect((await page.request.post('/api/diaries', { headers, data: { title: 'Private source diary', content: 'Private source text', date: '2026-01-01', transactions: [
    { symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-01-01T00:00:00Z', strategy: 'Growth', emotion: 'Calm' },
    { symbol: 'AAPL', type: 'SELL', quantity: '1', price: '120', tradeDate: '2026-01-31T23:59:59Z' },
    { symbol: 'AAPL', type: 'SELL', quantity: '1', price: '90', tradeDate: '2026-04-01T00:00:00Z', strategy: 'Exit' },
    { symbol: 'MSFT', type: 'BUY', quantity: '1', price: '50', tradeDate: '2026-01-01T00:00:00Z' },
    { symbol: 'MSFT', type: 'SELL', quantity: '1', price: '50', tradeDate: '2026-02-01T00:00:00Z' },
  ] } })).status()).toBe(201);
  await page.reload(); await expect(page.getByTestId('performance-totalRealizedPnL')).toHaveText('+10.00'); await expect(page.getByTestId('performance-totalRealizedPnL')).toHaveClass(/market-up/); await expect(page.getByTestId('performance-winRate')).toHaveText('33.33%'); await expect(page.getByTestId('performance-maxDrawdownPct')).toHaveText('4%'); await expect(page.getByTestId('performance-maxDrawdownPct')).toHaveClass(/market-down/); await expect(page.getByRole('table', { name: 'By strategy', exact: true })).toContainText('Growth'); await expect(page.getByRole('table', { name: 'By emotion', exact: true })).toContainText('Calm'); await expect(page.getByRole('img', { name: 'Cumulative realized P&L', exact: true })).toBeVisible();
  await page.getByText('Read chart data', { exact: true }).click(); await expect(page.getByRole('table', { name: 'Cumulative realized P&L', exact: true }).getByRole('row')).toHaveCount(4); await expect(page.locator('main')).not.toContainText('Private source text');
  if (width === 390) {
    await selectTheme(page, 'dark');
    const strategyTable = page.getByRole('table', { name: 'By strategy', exact: true }); const strategyViewport = strategyTable.locator('..');
    await expect(strategyViewport).toHaveCSS('overflow-x', 'auto'); await expect(strategyTable.getByRole('row').nth(1)).toContainText('Growth');
    expect(await strategyViewport.evaluate(element => { const rect = element.getBoundingClientRect(); return element.scrollWidth >= element.clientWidth && rect.width <= window.innerWidth; })).toBe(true);
  }
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }); await page.locator('main').screenshot({ path: `docs/design/evidence/performance/${width}.png` }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Group by', exact: true }).selectOption('quarter'); await page.getByRole('textbox', { name: 'Symbol filter', exact: true }).fill(' aapl '); await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await expect(page).toHaveURL(/period=quarter&symbol=AAPL$/); await expect(page.getByTestId('performance-totalClosedTrades')).toHaveText('2'); await expect(page.getByRole('table', { name: 'Results by period', exact: true })).toContainText('2026-Q2'); await page.reload(); await expect(page.getByRole('textbox', { name: 'Symbol filter', exact: true })).toHaveValue('AAPL');
  await page.getByRole('combobox', { name: 'Group by', exact: true }).selectOption('year'); await page.getByRole('textbox', { name: 'Symbol filter', exact: true }).fill(''); await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await expect(page.getByTestId('performance-totalClosedTrades')).toHaveText('3'); await expect(page.getByRole('table', { name: 'Results by period', exact: true }).getByRole('row')).toHaveCount(2);
  await page.route('**/api/stats/performance?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'performance-retry' } }) })); await page.reload(); await expect(page.getByTestId('request-id')).toHaveText('performance-retry'); await page.unroute('**/api/stats/performance?*'); await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(page.getByTestId('performance-totalClosedTrades')).toHaveText('3');
  for (const [locale, name] of [['zh-TW', '策略績效'], ['zh-CN', '策略绩效'], ['en', 'Strategy performance']] as const) { await selectLocale(page, locale); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible(); }
  await signOut(page); await expect(page.getByTestId('performance-totalClosedTrades')).toHaveCount(0);
});

test('Performance keeps long names, large values and paged data readable on mobile', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 900 }); const email = `performance-large-${randomUUID()}@example.test`, password = 'synthetic-performance-password';
  await page.request.post('/api/auth/register', { data: { email, password } }); await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  const transactions = [{ symbol: 'AAPL', type: 'BUY', quantity: '51', price: '100', tradeDate: '2026-01-01T00:00:00Z', strategy: '長策略名稱'.repeat(15) }, ...Array.from({ length: 51 }, (_, index) => ({ symbol: 'AAPL', type: 'SELL', quantity: '1', price: '99999999999.9999', tradeDate: new Date(Date.UTC(2026,0,index+2)).toISOString(), strategy: `策略${index}・`+'長'.repeat(75) }))];
  expect((await page.request.post('/api/diaries', { headers, data: { date: '2026-01-01', title: 'Large synthetic performance', content: 'Synthetic', transactions } })).status()).toBe(201);
  await page.goto('/strategy-performance'); await expect(page.getByTestId('performance-totalClosedTrades')).toHaveText('51'); await expect(page.getByTestId('performance-sharpe')).toHaveText('—');
  const strategies = page.getByRole('table', { name: 'By strategy', exact: true }); await expect(strategies.getByRole('row')).toHaveCount(51);
  const pages = page.getByRole('navigation', { name: 'By strategy', exact: true }); await pages.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(strategies.getByRole('row')).toHaveCount(2); await expect(pages.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled(); await pages.getByRole('button', { name: 'Previous page', exact: true }).click(); await expect(strategies.getByRole('row')).toHaveCount(51);
  await page.getByText('Read chart data', { exact: true }).click(); const curve = page.getByRole('table', { name: 'Cumulative realized P&L', exact: true }); await expect(curve.getByRole('row')).toHaveCount(51); await page.getByRole('navigation', { name: 'Cumulative realized P&L', exact: true }).getByRole('button', { name: 'Next page', exact: true }).click(); await expect(curve.getByRole('row')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.locator('.performance-summary').screenshot({ path: 'docs/design/evidence/performance/long-summary-390.png' });
});

test('Keyboard skip link reveals on focus and moves into main content', async ({ page }) => {
  await page.goto('/login'); await page.keyboard.press('Tab'); await expect(page.locator('.skip')).toBeFocused(); await expect(page.locator('.skip')).toBeInViewport(); await page.keyboard.press('Enter'); await expect(page.locator('main')).toBeFocused();
});
