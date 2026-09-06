import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme } from '../support/e2e';
test('Admin manages ETF history and catalog at desktop and mobile sizes', async ({ page }) => {
 await page.goto('/login?returnTo=%2Fadmin%2Fetf'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact:true }).fill('etf-admin@example.test'); await page.getByLabel('Password', { exact:true }).fill('synthetic-etf-admin-password'); await page.getByRole('button', {name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/admin\/etf$/); await selectLocale(page, 'en');
 await page.getByRole('button',{name:'Add common ETFs',exact:true}).click(); await expect(page.getByTestId('etf-catalog-item')).toHaveCount(24);
 const spy=page.getByTestId('etf-catalog-item').filter({has:page.getByRole('heading',{name:'SPY · SPDR S&P 500 ETF Trust',exact:true})});
 await page.route('**/api/admin/etf/*/initialize', route=>route.abort());
 await spy.getByRole('button',{name:'Initialize monthly history',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible(); await expect(spy).toContainText('Monthly prices: 0');
 await page.unroute('**/api/admin/etf/*/initialize');
 await spy.getByRole('button',{name:'Initialize monthly history',exact:true}).click(); await expect(spy).toContainText('Monthly prices: 2'); await expect(page.getByRole('status')).toContainText('Added: 2 / 2');
 await spy.getByRole('button',{name:'Initialize monthly history',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Added: 0 / 2');
 for(const [locale,title] of [['zh-TW','ETF 目錄'],['zh-CN','ETF 目录'],['en','ETF catalog']] as const){await selectLocale(page, locale);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}
 await page.route('**/api/admin/etf', route=>route.abort());
 await page.getByRole('button',{name:'Refresh catalog',exact:true}).click();await expect(page.getByTestId('etf-catalog-item')).toHaveCount(0);await expect(page.getByRole('alert')).toBeVisible();
 await page.unroute('**/api/admin/etf');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByTestId('etf-catalog-item')).toHaveCount(24);
 for(const width of [1440,390]) { await page.setViewportSize({width,height:900}); if(width===390)await selectTheme(page, 'dark'); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.locator('.plan-page').screenshot({path:`docs/design/evidence/etf-admin/${width}.png`}); }
 page.once('dialog',dialog=>dialog.accept()); await spy.getByRole('button',{name:'Delete ETF',exact:true}).click(); await expect(spy).toHaveCount(0); await expect(page.getByRole('status')).toContainText('Monthly prices: 2');
 await page.getByRole('textbox',{name:'ETF symbol',exact:true}).fill('CUSTOM'); await page.getByRole('button',{name:'Add ETF',exact:true}).click(); await expect(page.getByTestId('etf-catalog-item').filter({has:page.getByRole('heading',{name:'CUSTOM',exact:true})})).toBeVisible();
});

test('ordinary account cannot reach catalog operations through direct URLs',async({page})=>{
 const email=`etf-denied-${randomUUID()}@example.test`,password='synthetic-etf-user-password';
 await page.request.post('/api/auth/register',{data:{email,password}});
 await page.goto('/login?returnTo=%2Fadmin%2Fetf');await selectLocale(page, 'en');
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/admin\/etf$/);await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Add ETF',exact:true})).toHaveCount(0);
 await page.goto('/settings');await expect(page.getByRole('link',{name:'Manage ETF catalog',exact:true})).toHaveCount(0);
});

test('catalog form keeps 20-character symbols and 255-character names usable by keyboard',async({page})=>{
 await page.goto('/login?returnTo=%2Fadmin%2Fetf');await selectLocale(page, 'en');
 await page.getByLabel('Email',{exact:true}).fill('etf-admin@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-etf-admin-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/admin\/etf$/);await selectLocale(page, 'en');
 const symbol='K'.repeat(20),name='N'.repeat(255),symbolInput=page.getByRole('textbox',{name:'ETF symbol',exact:true}),nameInput=page.getByRole('textbox',{name:'Name (optional)',exact:true});
 await symbolInput.fill('K'.repeat(25));await expect(symbolInput).toHaveValue(symbol);await nameInput.fill('N'.repeat(300));await expect(nameInput).toHaveValue(name);await page.getByLabel('Skip market symbol validation',{exact:true}).check();await nameInput.press('Enter');
 const row=page.getByTestId('etf-catalog-item').filter({has:page.getByRole('heading',{name:new RegExp(`^${symbol} ·`),exact:false})});await expect(row).toBeVisible();await expect(row).toContainText(name);
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.plan-page').screenshot({path:`docs/design/evidence/etf-admin/focused-${width}.png`});}
});
