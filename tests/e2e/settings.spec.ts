import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/e2e';
test.use({timezoneId:'America/Los_Angeles'});
const password='synthetic-preferences-password';
async function account(page:Page) {
  const email=`settings-${randomUUID()}@example.test`;
  expect((await page.request.post('/api/auth/register',{data:{email,password}})).status()).toBe(200);
  await page.goto('/login');
  await page.getByTestId('locale-select').selectOption('en');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await page.getByTestId('locale-select').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.goto('/settings');
  await expect(page.getByLabel('Name',{exact:true})).toBeVisible();
  return email;
}

test('preferences persist exact zero/decimal amounts, explicit timezone, language and holiday choice across sign-in',async({page})=>{
  const email=await account(page);
  await expect(page.getByLabel('Date timezone',{exact:true})).toHaveValue('Asia/Taipei');
  await page.getByRole('button',{name:'Use device timezone',exact:true}).click();
  await expect(page.getByLabel('Date timezone',{exact:true})).toHaveValue('America/Los_Angeles');
  expect((await(await page.request.get('/api/user/settings')).json()).settings.timezone).toBe('Asia/Taipei');
  await page.getByLabel('Name',{exact:true}).fill('');
  await page.getByLabel('Expected monthly trades',{exact:true}).fill('0');
  await page.getByLabel('Expected profit amount',{exact:true}).fill('1234567890.125');
  await page.getByLabel('Expected average holding amount',{exact:true}).fill('0');
  await page.getByLabel('Date timezone',{exact:true}).fill('America/New_York');
  await page.getByLabel('Exclude holidays from statistics',{exact:true}).uncheck();
  await page.getByRole('combobox',{name:'Account language',exact:true}).selectOption('zh-CN');
  await page.getByRole('button',{name:'Save preferences',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('设置已保存。');
  const settings=await(await page.request.get('/api/user/settings')).json();
  expect(settings.settings).toMatchObject({name:null,expectedMonthlyTrades:0,expectedProfit:'1234567890.13',expectedAvgHolding:'0.00',timezone:'America/New_York',locale:'zh-CN',excludeHolidaysInStats:false});
  const logout=page.waitForResponse(response=>response.url().endsWith('/api/auth/logout'));
  await page.getByTestId('sign-out').click();
  await logout;
  await page.goto('/login');
  await page.getByTestId('locale-select').selectOption('en');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByTestId('locale-select')).toHaveValue('zh-CN');
  await expect(page.getByTestId('locale-select')).toBeEnabled();
  await page.goto('/settings');
  await expect(page.getByLabel('日期时区',{exact:true})).toHaveValue('America/New_York');
  await expect(page.getByLabel('每月预期交易次数',{exact:true})).toHaveValue('0');
  await expect(page.getByLabel('预期盈利金额',{exact:true})).toHaveValue('1234567890.13');
  await expect(page.getByLabel('统计时排除假日',{exact:true})).not.toBeChecked();
  await page.goto('/diaries/new');
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const date=['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');
  await expect(page.getByLabel('日记日期',{exact:true})).toHaveValue(date);
});

test('invalid timezone keeps unsaved values and marks the field; saved settings stay unchanged',async({page})=>{
  await account(page);
  await page.getByLabel('Name',{exact:true}).fill('Unsaved preference');
  await page.getByLabel('Date timezone',{exact:true}).fill('Unknown/Timezone');
  await page.getByRole('button',{name:'Save preferences',exact:true}).click();
  await expect(page.getByTestId('error-code')).toHaveText('SYS_VALIDATION_ERROR');
  await expect(page.getByLabel('Date timezone',{exact:true})).toHaveAttribute('aria-invalid','true');
  await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Unsaved preference');
  expect((await(await page.request.get('/api/user/settings')).json()).settings.timezone).toBe('Asia/Taipei');
});

test('preferences support narrow layouts and both themes',async({page})=>{
  await account(page);
  await page.setViewportSize({width:1440,height:1000});
  await page.getByTestId('theme-select').selectOption('light');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.impeccable/review/settings-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByTestId('theme-select').selectOption('dark');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'.impeccable/review/settings-mobile.png',fullPage:true});
});

test('a language-save response arriving after logout cannot alter the signed-out UI',async({page})=>{
  await account(page);
  let release!:()=>void;
  let started!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const requested=new Promise<void>(resolve=>{started=resolve;});
  await page.route('**/api/user/settings',async route=>{
    if(route.request().method()!=='PUT'){await route.continue();return;}
    const response=await route.fetch();
    started();
    await held;
    await route.fulfill({response});
  });
  await page.getByTestId('locale-select').selectOption('zh-CN');
  await requested;
  const signedOut=page.waitForResponse(response=>response.url().endsWith('/api/auth/logout'));
  await page.getByTestId('sign-out').click();
  await signedOut;
  const delivered=page.waitForResponse(response=>response.url().endsWith('/api/user/settings')&&response.request().method()==='PUT');
  release();
  await delivered;
  await expect(page.getByTestId('locale-select')).toBeEnabled();
  await expect(page.getByTestId('locale-select')).toHaveValue('en');
  await expect(page.getByText('Unable to load or save your language preference.',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Name',{exact:true})).toHaveCount(0);
});
