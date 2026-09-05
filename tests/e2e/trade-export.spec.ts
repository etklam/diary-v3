import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect } from '../support/e2e';

for (const width of [1440, 390]) test(`Closed-trade CSV download at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `export-${randomUUID()}@example.test`, password = 'synthetic-export-password';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login'); await page.getByTestId('locale-select').selectOption('en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/);
  await page.getByTestId('locale-select').selectOption('en');
  const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  expect((await page.request.post('/api/diaries', { headers: { 'x-csrf-token': csrf }, data: { title: 'CSV basis', content: 'Synthetic export', date: '2026-09-01', transactions: [
    { symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-01T10:00:00Z' },
    { symbol: 'AAPL', type: 'SELL', quantity: '1', price: '110.125', tradeDate: '2026-09-01T11:00:00Z' },
  ] } })).status()).toBe(201);
  await page.goto('/stocks'); await page.getByLabel('Symbol (optional)', { exact: true }).fill('aapl');
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const download = await downloading; expect(download.suggestedFilename()).toMatch(/^trades-AAPL-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(await readFile((await download.path())!, 'utf8')).toBe('symbol,sellDate,sellQuantity,sellPrice,avgCostBasis,realizedPnL,realizedPnLPct\nAAPL,2026-09-01,1,110.125,100,10.13,10.13');
  await page.route('**/api/stats/export-trades?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'export-retry' } }) }));
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click(); await expect(page.getByTestId('request-id')).toHaveText('export-retry');
  await expect(page.getByLabel('Symbol (optional)', { exact: true })).toHaveValue('aapl'); await page.unroute('**/api/stats/export-trades?*');
  const retry = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download CSV', exact: true }).click(); await retry;
  for (const [locale, heading] of [['zh-TW', '匯出已賣出交易'], ['zh-CN', '导出已卖出交易'], ['en', 'Export closed trades']] as const) {
    await page.getByTestId('locale-select').selectOption(locale); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  if (width === 390) await page.getByTestId('theme-select').selectOption('dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.impeccable/review/trade-export-${width}.png`, fullPage: true });
});
