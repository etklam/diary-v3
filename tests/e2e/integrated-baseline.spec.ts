import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect, selectLocale } from '../support/e2e';

test('integrated performance and visual acceptance', async ({ page, context }) => {
  const email = `integrated-${randomUUID()}@example.test`, password = 'synthetic-integrated-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/timeline'); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  await page.request.post('/api/diaries', { headers, data: { title: 'Synthetic decision', content: 'Synthetic original reasoning', date: '2026-09-01', transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '2', price: '100', tradeDate: '2026-09-01T10:00:00Z' }] } });
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(new URL(request.url()).pathname); });
  await page.goto('/stocks'); await expect(page.getByTestId('valuation-status')).toHaveText('All positions priced');
  await page.getByText('Risk, exposure and realized trades', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portfolio exposure', exact: true })).toContainText('Portfolio exposure');
  await expect(page.locator('.realized-results')).toContainText('No');
  expect(requests.filter(path => path === '/api/portfolio/ledger')).toHaveLength(1);
  expect(requests.filter(path => path === '/api/portfolio/overview')).toHaveLength(1);
  expect(requests.filter(path => ['/api/stocks/holdings','/api/stocks/portfolio','/api/stocks/exposure','/api/portfolio/attention','/api/stats/recent-trades'].includes(path))).toHaveLength(0);
  await page.getByText('Risk, exposure and realized trades', { exact: true }).click();
  const directory = '.scratch/trade-basic-integrated-improvements/evidence/after';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/requests.json`, JSON.stringify({ fixture: 'one synthetic holding, one transaction; cold document navigation; development browser; one sample', requests }, null, 2));
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${directory}/stocks-${width}.png`, fullPage: true });
  }
  await page.route('**/api/portfolio/overview', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'x-portfolio-ledger-revision': 'different-confirmed-ledger' } });
  });
  await page.reload();
  await expect(page.getByRole('table', { name: 'Holdings', exact: true })).toContainText('AAPL');
  await expect(page.getByText('Transactions changed during loading. Refresh to align prices and holdings.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('valuation-status')).toHaveCount(0);
});
