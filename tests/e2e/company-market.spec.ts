import { test, expect, selectLocale, selectTheme } from '../support/e2e';

test('guests can inspect quotes, change historical range, and resolve an index alias',async({page})=>{
  await page.goto('/stocks/SPY');
  await selectLocale(page, 'en');
  await expect(page.getByTestId('market-price')).toHaveText('110');
  await expect(page.getByRole('table')).toContainText('2026-09-04');
  const history=page.waitForResponse(response=>response.url().includes('/api/market/historical')&&response.url().includes('range=1mo'));
  await page.getByRole('combobox',{name:'History range',exact:true}).selectOption('1mo');
  expect((await history).status()).toBe(200);
  await page.getByRole('textbox',{name:'Stock or index symbol',exact:true}).fill('spx');
  await page.getByRole('button',{name:'View market data',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'^GSPC',exact:true})).toBeVisible();
  await expect(page.getByTestId('market-price')).toHaveText('110');
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await selectTheme(page, 'light');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.impeccable/review/market-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await selectTheme(page, 'dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.impeccable/review/market-mobile.png',fullPage:true});
});

test('missing metadata stays unknown and quote/history errors recover independently',async({page})=>{
  await page.goto('/stocks/PARTIAL');
  await selectLocale(page, 'en');
  await expect(page.getByTestId('market-price')).toHaveText('90');
  await expect(page.getByText('Not provided',{exact:true})).toHaveCount(3);
  await expect(page.getByText('—',{exact:true})).toHaveCount(3);
  await expect(page.getByRole('table')).toBeVisible();
  await page.goto('/stocks/HISTFAIL');
  await expect(page.getByTestId('market-price')).toHaveText('110');
  await expect(page.getByTestId('api-error')).toContainText('Unable to get historical prices');
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Stock or index symbol',exact:true}).fill('SPY');
  await page.getByRole('button',{name:'View market data',exact:true}).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.goto('/stocks/EMPTY');
  await expect(page.getByText('No historical prices are available for this range.',{exact:true})).toBeVisible();
  await page.goto('/stocks/UNKNOWN');
  await expect(page.getByTestId('api-error')).toHaveCount(2);
  await expect(page.getByTestId('market-price')).toHaveCount(0);
});

test('a failed quote refresh is identified as stale without presenting a new quote timestamp',async({page})=>{
  await page.goto('/stocks/STALE');
  await selectLocale(page, 'en');
  await expect(page.getByTestId('market-price')).toHaveText('110');
  const time=page.locator('time').first();
  await expect(time).toHaveAttribute('datetime','2026-09-04T15:00:00.000Z');
  const refresh=page.waitForResponse(response=>response.url().includes('/api/market/quote/STALE?nocache=1'));
  await page.getByRole('button',{name:'Refresh quote',exact:true}).click();
  expect((await refresh).headers()['x-market-data-source']).toBe('stale');
  await expect(page.getByRole('status')).toContainText('Showing the last successful data');
  await expect(page.getByTestId('market-price')).toHaveText('110');
  await expect(time).toHaveAttribute('datetime','2026-09-04T15:00:00.000Z');
  await selectLocale(page, 'zh-TW');
  await expect(page.getByRole('heading',{name:'最新報價',exact:true})).toBeVisible();
  await selectLocale(page, 'zh-CN');
  await expect(page.getByRole('heading',{name:'最新报价',exact:true})).toBeVisible();
});
