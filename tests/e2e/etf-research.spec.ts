import { test, expect, selectLocale, selectTheme } from '../support/e2e';
test('public research and catalog-backed watchlist work at both viewport sizes',async({page})=>{
 await page.goto('/tools/etf');await selectLocale(page, 'en');
 await expect(page.getByTestId('etf-profile')).toBeVisible();await expect(page.getByTestId('etf-profile')).toContainText('Some data is unavailable.');
 await page.getByRole('link',{name:/ETF watchlist/}).click();await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('link',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill('etf-admin@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-etf-admin-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/etf\/watchlist$/);
 await page.goto('/admin/etf');await selectLocale(page, 'en');await page.getByRole('button',{name:'Add common ETFs',exact:true}).click();await expect(page.getByRole('status')).toContainText('Added:');
const seed=/Added: (\d+) · Skipped: (\d+) · Total: (\d+)/.exec(await page.getByRole('status').innerText())!;expect(Number(seed[1])+Number(seed[2])).toBe(24);
await expect(page.getByTestId('etf-catalog-item')).toHaveCount(Number(seed[3]));
 await page.goto('/etf/watchlist');await page.getByRole('textbox',{name:'ETF symbol',exact:true}).fill('SPY');await page.getByRole('button',{name:'Add ETF',exact:true}).click();await expect(page.getByTestId('etf-watch-item')).toHaveCount(1);
 await page.getByRole('link',{name:'Read research',exact:true}).click();await expect(page).toHaveURL(/symbol=SPY/);await expect(page.getByTestId('etf-profile')).toBeVisible();
 for(const [locale,title] of [['zh-TW','ETF 研究'],['zh-CN','ETF 研究'],['en','ETF research']] as const){await selectLocale(page, locale);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});if(width===390)await selectTheme(page, 'dark');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.plan-page').screenshot({path:`docs/design/evidence/etf-research/${width}.png`});}
 await page.route('**/api/etf/QQQ/profile*',route=>route.abort());await page.getByRole('textbox',{name:'ETF symbol',exact:true}).fill('QQQ');await page.getByRole('button',{name:'Read ETF',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByTestId('etf-profile')).toHaveCount(0);
 await page.unroute('**/api/etf/QQQ/profile*');await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByTestId('etf-profile')).toBeVisible();
 await page.getByRole('link',{name:'ETF watchlist',exact:true}).click();await page.getByRole('button',{name:'Remove',exact:true}).click();await expect(page.getByTestId('etf-watch-item')).toHaveCount(0);
});
test('watchlist reconciles committed writes when their responses are lost',async({page})=>{
 await page.goto('/login?returnTo=%2Fadmin%2Fetf');await selectLocale(page, 'en');
 await page.getByLabel('Email',{exact:true}).fill('etf-admin@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-etf-admin-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/admin\/etf$/);
 await selectLocale(page, 'en');await page.getByRole('button',{name:'Add common ETFs',exact:true}).click();await expect(page.getByRole('status')).toContainText('Added:');
const seed=/Added: (\d+) · Skipped: (\d+) · Total: (\d+)/.exec(await page.getByRole('status').innerText())!;expect(Number(seed[1])+Number(seed[2])).toBe(24);
await expect(page.getByTestId('etf-catalog-item')).toHaveCount(Number(seed[3]));
 await page.goto('/etf/watchlist');await page.getByRole('textbox',{name:'ETF symbol',exact:true}).fill('QQQ');
 await page.route('**/api/etf/watchlist',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();expect(response.status()).toBe(200);await route.abort();});
 await page.getByRole('button',{name:'Add ETF',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Unable to confirm');await expect(page.getByRole('button',{name:'Add ETF',exact:true})).toBeDisabled();await expect(page.getByRole('textbox',{name:'ETF symbol',exact:true})).toHaveValue('QQQ');
 await page.unroute('**/api/etf/watchlist');await page.getByRole('button',{name:'Refresh watchlist',exact:true}).click();await expect(page.getByTestId('etf-watch-item')).toHaveCount(1);await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Add ETF',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByTestId('etf-watch-item')).toHaveCount(1);
 await page.route('**/api/etf/watchlist/*',async route=>{if(route.request().method()!=='DELETE')return route.continue();const response=await route.fetch();expect(response.status()).toBe(200);await route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({message:'synthetic proxy failure'})});});
 await page.getByRole('button',{name:'Remove',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Unable to confirm');await expect(page.getByRole('button',{name:'Remove',exact:true})).toBeDisabled();
 await page.unroute('**/api/etf/watchlist/*');await page.getByRole('button',{name:'Refresh watchlist',exact:true}).click();await expect(page.getByTestId('etf-watch-item')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
});

test('research renders controlled complete, stale and unavailable profile states',async({page})=>{
 const source={source:'yahoo',fetchedAt:'2026-09-05T12:00:00.000Z',isStale:false};
 const complete={symbol:'COMPLETE',benchmark:'SPY',period:'3m',quote:{symbol:'COMPLETE',regularMarketPrice:123.45,previousClose:120,change:3.45,changePercent:2.875,currency:'USD',marketState:'REGULAR',lastUpdateTime:'2026-09-05T12:00:00.000Z'},risk:{high52w:130,low52w:90,distanceToHighPct:-5,distanceToLowPct:37,volatility20d:12,volatility60d:18,volatility252d:22,maxDrawdown1y:-15,volumeSpikeRatio:1.4,observations:260,asOf:'2026-09-05'},valuation:{aum:1000000000,expenseRatioPct:0.2,pe:22,pb:4,dividendYieldPct:1.5,currency:null},rs:{symbolReturnPct:8,benchmarkReturnPct:5,relativeReturnPct:3,trend:'outperforming',from:'2026-06-05',to:'2026-09-05'},meta:{fetchedAt:'2026-09-05T12:00:00.000Z',asOf:'2026-09-05T00:00:00.000Z',isStale:false,status:'complete',sources:{'risk.high52w':source,'valuation.aum':source,'rs.relativeReturnPct':source,'quote.regularMarketPrice':source}}};
 const staleSource={...source,isStale:true};
 const stale={...complete,symbol:'STALE',quote:null,valuation:{aum:null,expenseRatioPct:null,pe:null,pb:null,dividendYieldPct:null,currency:null},rs:{symbolReturnPct:null,benchmarkReturnPct:null,relativeReturnPct:null,trend:null,from:null,to:null},meta:{...complete.meta,isStale:true,status:'partial',sources:{'risk.high52w':staleSource}}};
 const unavailable={symbol:'UNKNOWN',benchmark:'SPY',period:'3m',quote:null,risk:{high52w:null,low52w:null,distanceToHighPct:null,distanceToLowPct:null,volatility20d:null,volatility60d:null,volatility252d:null,maxDrawdown1y:null,volumeSpikeRatio:null,observations:0,asOf:null},valuation:{aum:null,expenseRatioPct:null,pe:null,pb:null,dividendYieldPct:null,currency:null},rs:{symbolReturnPct:null,benchmarkReturnPct:null,relativeReturnPct:null,trend:null,from:null,to:null},meta:{fetchedAt:'2026-09-05T12:00:00.000Z',asOf:null,isStale:false,status:'unavailable',sources:{}}};
 const fixtures={COMPLETE:complete,STALE:stale,UNKNOWN:unavailable};
 await page.goto('/tools/etf');await selectLocale(page, 'en');
 for(const [symbol,payload] of Object.entries(fixtures)){
  await page.route(`**/api/etf/${symbol}/profile*`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)}));
  await page.goto(`/tools/etf?symbol=${symbol}`);await expect(page.getByTestId('etf-profile')).toBeVisible();
  if(symbol==='COMPLETE'){
   await expect(page.getByRole('status')).toContainText('Available metrics loaded.');
   await expect(page.getByTestId('etf-profile').locator('.etf-metrics dd').first()).toContainText('130');
   for(const locale of ['zh-TW','zh-CN','en'] as const){await selectLocale(page, locale);await page.getByTestId('etf-metric-guidance').locator('summary').click();const guide=page.getByTestId('etf-metric-guidance');await expect(guide.locator('li')).toHaveCount(17);await expect(guide).toContainText(locale==='en'?'Definition':locale==='zh-CN'?'定义':'定義');}
  }else if(symbol==='STALE'){
   await expect(page.getByRole('status')).toContainText('Showing previously fetched data');
   await expect(page.getByTestId('etf-profile')).toContainText('Unavailable');
  }else{
   await expect(page.getByRole('status')).toContainText('Research data is unavailable');
   await expect(page.getByTestId('etf-profile').locator('.etf-metrics dd')).toHaveText(Array(17).fill('—'));
  }
  await page.unroute(`**/api/etf/${symbol}/profile*`);
 }
});

test('watchlist catalog errors stay actionable in all supported locales',async({page})=>{
 await page.goto('/login?returnTo=%2Fetf%2Fwatchlist');await selectLocale(page, 'en');
 await page.getByLabel('Email',{exact:true}).fill('etf-admin@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-etf-admin-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/etf\/watchlist$/);
 let code:'AUTH_FORBIDDEN'|'ETF_NOT_FOUND'|'ETF_ALREADY_IN_WATCHLIST'='AUTH_FORBIDDEN';
 const messages={
  'zh-TW':{AUTH_FORBIDDEN:'你沒有權限執行這項操作。',ETF_NOT_FOUND:'找不到這個 ETF。',ETF_ALREADY_IN_WATCHLIST:'這個 ETF 已在你的關注清單。'},
  'zh-CN':{AUTH_FORBIDDEN:'你没有权限执行此操作。',ETF_NOT_FOUND:'找不到这个 ETF。',ETF_ALREADY_IN_WATCHLIST:'这个 ETF 已在你的关注清单。'},
  en:{AUTH_FORBIDDEN:'You do not have permission to do this.',ETF_NOT_FOUND:'This ETF is not in the shared catalog.',ETF_ALREADY_IN_WATCHLIST:'This ETF is already on your watchlist.'},
 } as const;
 await page.route('**/api/etf/watchlist',route=>{
  if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  const status=code==='AUTH_FORBIDDEN'?403:code==='ETF_NOT_FOUND'?404:409;
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify({statusCode:status,statusMessage:'Synthetic fixture',data:{code,details:[{field:'symbol',message:'Synthetic fixture'}],requestId:`${code}-fixture`}})});
 });
 for(const locale of ['zh-TW','zh-CN','en'] as const){
  await selectLocale(page, locale);
  for(const next of ['AUTH_FORBIDDEN','ETF_NOT_FOUND','ETF_ALREADY_IN_WATCHLIST'] as const){
   code=next;const input=page.getByRole('textbox',{name:locale==='en'?'ETF symbol':locale==='zh-CN'?'ETF 代码':'ETF 代號',exact:true});await input.fill(next.slice(0,8));await page.getByRole('button',{name:locale==='en'?'Add ETF':locale==='zh-CN'?'加入 ETF':'加入 ETF',exact:true}).click();await expect(page.getByRole('alert')).toContainText(messages[locale][next]);await expect(input).toHaveAttribute('aria-invalid','true');await expect(input).toHaveAttribute('aria-describedby','etf-watchlist-error');
  }
 }
 await page.unroute('**/api/etf/watchlist');
});
