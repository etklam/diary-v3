import { randomUUID } from 'node:crypto';
import { test,expect } from '../support/e2e';

const focusedPortfolioFixture = {
 holdings: [
  { symbol: 'LONGSYMBOL1234567890', quantity: 1.25, avgCost: 12.34, totalCost: 15.425, price: 12.3456, quoteAsOf: '2026-08-01T10:00:00.000Z' },
  { symbol: 'MEGA_VALUE', quantity: 1000000.5, avgCost: 98765.4321, totalCost: 987654321, price: 123456.789, quoteAsOf: '2026-09-05T10:00:00.000Z' },
 ],
 valuation: {
  totalHoldings: 2, totalCost: 987654336.425, currentMarketValue: 123456850743.8265,
  unrealizedAmount: 122469196407.4015, unrealizedPct: 12400.005942433436,
  totalDayChange: null, totalDayChangePercent: null, largestPositionPct: 99.99999998750008,
  top3ConcentrationPct: 100, activePositionCount: 2, concentrationWarning: true,
  largestPositionSymbol: 'MEGA_VALUE', pricedPositionCount: 2, unpricedPositionCount: 0,
  pricedCostBasis: 987654336.425, unpricedCostBasis: 0, quoteCoveragePct: 100,
  valuationAsOf: '2026-08-01T10:00:00.000Z', staleQuoteCount: 1, valuationStatus: 'complete',
  unsupportedMetrics: ['ytdReturn', 'realCashPercentage', 'sectorConcentration'],
 },
 quoteErrors: [], marketState: 'REGULAR',
};

for(const width of [1440,390])test(`Portfolio complete and incomplete valuation at ${width}px`,async({page,context})=>{
 await page.setViewportSize({width,height:900});const email=`portfolio-${randomUUID()}@example.test`,password='synthetic-portfolio-password';
 await page.request.post('/api/auth/register',{data:{email,password}});await page.goto('/login');await page.getByTestId('locale-select').selectOption('en');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);await page.getByTestId('locale-select').selectOption('en');
 const headers={'x-csrf-token':(await context.cookies()).find(cookie=>cookie.name==='csrf-token')!.value};
 const buy=async(symbol:string,date:string)=>{const response=await page.request.post('/api/diaries',{headers,data:{title:symbol,content:'Synthetic valuation',date,transactions:[{symbol,type:'BUY',quantity:'2',price:'100',tradeDate:date+'T10:00:00Z'}]}});expect(response.status()).toBe(201);return response.json();};
 await page.goto('/stocks');await expect(page.getByTestId('valuation-status')).toHaveText('No open positions');
 const missing=await buy('UNKNOWN','2026-09-01');await page.reload();await expect(page.getByTestId('valuation-status')).toHaveText('Quotes unavailable');await expect(page.getByTestId('valuation-currentMarketValue')).toHaveText('—');await expect(page.getByTestId('valuation-unpricedCostBasis')).toHaveText('200');
 const priced=await buy('AAPL','2026-09-02');await page.reload();await expect(page.getByTestId('valuation-status')).toHaveText('Some positions have no quote');await expect(page.getByTestId('valuation-currentMarketValue')).toHaveText('220');await expect(page.getByTestId('valuation-unrealizedAmount')).toHaveText('20');await expect(page.getByTestId('valuation-quoteCoveragePct')).toHaveText('50%');
 await expect(page.getByRole('table',{name:'Portfolio valuation',exact:true}).getByRole('row').filter({hasText:'UNKNOWN'})).toContainText('—');
 if(width===390)await page.getByTestId('theme-select').selectOption('dark');await page.screenshot({path:`.impeccable/review/portfolio-${width}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.route('**/api/stocks/portfolio',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({data:{code:'SYS_INTERNAL_ERROR',requestId:'portfolio-retry'}})}));await page.reload();await expect(page.getByTestId('request-id')).toHaveText('portfolio-retry');await page.unroute('**/api/stocks/portfolio');await page.locator('.portfolio-valuation').getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByTestId('valuation-status')).toHaveText('Some positions have no quote');
 await page.request.delete(`/api/diaries/${missing.id}`,{headers});await page.reload();await expect(page.getByTestId('valuation-status')).toHaveText('All positions priced');await expect(page.getByTestId('valuation-quoteCoveragePct')).toHaveText('100%');
 for(const [locale,title]of [['zh-TW','持倉估值'],['zh-CN','持仓估值'],['en','Portfolio valuation']]as const){await page.getByTestId('locale-select').selectOption(locale);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}
 await page.request.delete(`/api/diaries/${priced.id}`,{headers});await page.reload();await expect(page.getByTestId('valuation-status')).toHaveText('No open positions');
});

for (const width of [1440, 390]) test(`Portfolio stale decimal fixture and keyboard retry at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 const email = `portfolio-finish-${randomUUID()}@example.test`, password = 'synthetic-portfolio-finish-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login'); await page.getByTestId('locale-select').selectOption('en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/);
 await page.getByTestId('locale-select').selectOption('en');

 await page.route('**/api/stocks/portfolio', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(focusedPortfolioFixture) }));
 await page.goto('/stocks');
 await expect(page.getByTestId('valuation-status')).toHaveText('All positions priced');
 await expect(page.getByTestId('valuation-currentMarketValue')).toHaveText('123,456,850,743.83');
 await expect(page.getByTestId('valuation-unrealizedPct')).toHaveText('12,400.01%');
 await expect(page.getByText('Quotes older than 72 hours: 1', { exact: true })).toBeVisible();
 const table = page.getByRole('table', { name: 'Portfolio valuation', exact: true });
 await expect(table).toBeVisible();
 await expect(table.getByRole('row').filter({ hasText: 'LONGSYMBOL1234567890' })).toContainText('12.35');
 await expect(table.getByRole('row')).toHaveCount(3);
 if (width === 390) {
  await page.getByTestId('theme-select').selectOption('dark');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
 }
 await page.screenshot({ path: `docs/design/evidence/portfolio/${width}.png`, fullPage: true });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 if (width === 390) {
  const tableScroller = table.locator('xpath=..');
  const scrollMetrics = await tableScroller.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(scrollMetrics.clientWidth);
  const largeValue = table.getByRole('row').filter({ hasText: 'MEGA_VALUE' }).getByRole('cell').nth(1);
  await largeValue.scrollIntoViewIfNeeded();
  expect(await largeValue.evaluate(element => {
   const scroller = element.closest('.holdings-table')!.getBoundingClientRect();
   const cell = element.getBoundingClientRect();
   return cell.left >= scroller.left - 1 && cell.right <= scroller.right + 1;
  })).toBe(true);
  await expect(largeValue).toHaveText('123,456,850,728.39');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }

 for (const [locale, stale] of [['zh-TW', '超過 72 小時的報價: 1'], ['zh-CN', '超过 72 小时的报价: 1'], ['en', 'Quotes older than 72 hours: 1']] as const) {
  await page.getByTestId('locale-select').selectOption(locale);
  await expect(page.getByText(stale, { exact: true })).toBeVisible();
 }

 await page.getByTestId('locale-select').selectOption('en');
 let retryReads = 0;
 await page.unroute('**/api/stocks/portfolio');
 await page.route('**/api/stocks/portfolio', route => {
  retryReads += 1;
  if (retryReads === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'portfolio-keyboard-retry' } }) });
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(focusedPortfolioFixture) });
 });
 await page.reload(); await expect(page.getByTestId('request-id')).toHaveText('portfolio-keyboard-retry');
 const retry = page.locator('.portfolio-valuation').getByRole('button', { name: 'Try again', exact: true });
 await retry.focus(); await expect(retry).toBeFocused(); await page.keyboard.press('Enter');
 await expect(page.getByTestId('valuation-status')).toHaveText('All positions priced');
 await expect(page.getByText('Quotes older than 72 hours: 1', { exact: true })).toBeVisible();
 await page.unroute('**/api/stocks/portfolio');
});
