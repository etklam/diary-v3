import {randomUUID} from 'node:crypto';
import type { Dialog, Page } from '@playwright/test';
import {tradePlanExecutionComparisonSchema} from '@diary/contracts/trade-plan-execution';
import {test,expect, selectAccountLocale, selectLocale, selectTheme, signOut} from '../support/e2e';
for(const width of [1440,390])test(`trade plan exact decimals, lifecycle and diary link at ${width}px`,async({page,context})=>{
 await page.setViewportSize({width,height:900});const email=`plan-${randomUUID()}@example.test`,password='synthetic-plan-password';await page.request.post('/api/auth/register',{data:{email,password}});await page.goto('/login?returnTo=%2Fdiaries%2Fnew');await selectLocale(page, 'en');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);await selectAccountLocale(page, 'en');
 const headers={'x-csrf-token':(await context.cookies()).find(c=>c.name==='csrf-token')!.value};const diary=await(await page.request.post('/api/diaries',{headers,data:{title:'Evidence for the plan',content:'Original reasoning',date:'2026-09-05'}})).json();
 await page.goto('/trade-plans');await expect(page.getByText('No trade plans yet. Record your first plan to connect setup, risk and review.',{exact:false})).toBeVisible();await page.getByRole('link',{name:'New trade plan',exact:true}).first().click();await expect(page).toHaveURL(/\/trade-plans\/new$/);await expect(page.getByRole('heading',{name:'New trade plan',exact:true})).toBeVisible();await page.getByRole('textbox',{name:'Symbol',exact:true}).fill('aapl');await page.getByRole('textbox',{name:'Setup',exact:true}).fill('Independent demand confirmation');
 const values={ 'Entry price':'123.123456','Entry zone low':'120.000001','Entry zone high':'125.123456','Stop loss':'115.000001','Target price':'150.999999','Maximum position size':'9007199254740991.01'};for(const [name,value]of Object.entries(values))await page.getByRole('textbox',{name,exact:true}).fill(value);
 await page.getByRole('textbox',{name:'Invalidation condition',exact:true}).fill('Two consecutive reports contradict the original thesis.');await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Preserve exact price levels.\nRevisit after the next report.');
 let summaryRequests=0,diaryListRequests=0;page.on('request',request=>{if(request.url().includes('/api/diaries/summary'))summaryRequests+=1;if(request.url().match(/\/api\/diaries(?:\?|$)/))diaryListRequests+=1;});await page.getByRole('button',{name:'Choose a diary',exact:true}).click();const diaryDialog=page.getByRole('dialog',{name:'Link a diary'});await expect(diaryDialog).toBeVisible();await diaryDialog.getByRole('searchbox',{name:'Title or keyword',exact:true}).fill('Evidence for the plan');await diaryDialog.getByRole('button',{name:'Select',exact:true}).click();expect(summaryRequests).toBeGreaterThan(0);expect(diaryListRequests).toBe(0);
 await page.getByRole('textbox',{name:'Entry zone high',exact:true}).fill('100');await page.getByRole('button',{name:'Save trade plan',exact:true}).click();await expect(page.getByRole('textbox',{name:'Entry zone high',exact:true})).toHaveAttribute('aria-invalid','true');await expect(page.getByRole('textbox',{name:'Entry zone high',exact:true})).toBeFocused();await page.getByRole('textbox',{name:'Entry zone high',exact:true}).fill(values['Entry zone high']);
 await page.getByRole('button',{name:'Save trade plan',exact:true}).click();await expect(page).toHaveURL(/\/trade-plans\/\d+$/);const id=page.url().split('/').at(-1)!;const persisted=await(await page.request.get(`/api/trade-plans/${id}`)).json();expect(persisted.maxPositionSize).toBe('9007199254740991.01');expect(persisted.entryPrice).toBe('123.123456');expect(persisted.status).toBe('draft');
 await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('active');await page.route(`**/api/trade-plans/${id}`,async route=>{if(route.request().method()==='PUT')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({data:{code:'SYS_INTERNAL_ERROR',requestId:'plan-save'}})});else await route.continue();});await page.getByRole('button',{name:'Save trade plan',exact:true}).click();await expect(page.getByTestId('request-id')).toHaveText('plan-save');await expect(page.getByRole('textbox',{name:'Entry price',exact:true})).toHaveValue('123.123456');if(width===390)await selectTheme(page, 'dark');await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:`docs/design/evidence/trade-plans/form-${width}.png`,fullPage:true});
 await page.unroute(`**/api/trade-plans/${id}`);await page.getByRole('button',{name:'Save trade plan',exact:true}).click();await expect(page.getByText('Trade plan saved.',{exact:true})).toBeVisible();await page.getByRole('link',{name:/Read linked diary:/}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${diary.id}$`));
 await page.goto(`/trade-plans/${id}`);await expect(page.getByRole('combobox',{name:'Status',exact:true})).toHaveValue('active');await page.getByRole('button',{name:'Remove diary link',exact:true}).click();await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('closed');await page.getByRole('button',{name:'Save trade plan',exact:true}).click();await expect(page.getByText('Trade plan saved.',{exact:true})).toBeVisible();expect((await(await page.request.get(`/api/trade-plans/${id}`)).json()).diaryId).toBeNull();
 await page.goto('/trade-plans');await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('active');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page.getByText('No trade plans match these filters.')).toBeVisible();await page.getByRole('combobox',{name:'Status',exact:true}).selectOption('closed');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page.getByRole('link',{name:'AAPL · Independent demand confirmation'})).toBeVisible();await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`docs/design/evidence/trade-plans/list-${width}.png`,fullPage:true});
 for(const[locale,title]of[['zh-TW','交易計劃'],['zh-CN','交易计划'],['en','Trade plans']]as const){await selectLocale(page, locale);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('link',{name:'AAPL · Independent demand confirmation'}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete trade plan',exact:true}).click();await expect(page).toHaveURL(/\/trade-plans$/);expect((await page.request.get(`/api/trade-plans/${id}`)).status()).toBe(404);
});

test('Trade Plan guest errors offer a safe sign-in return', async ({page}) => {
 await page.goto('/trade-plans'); await selectLocale(page, 'en');
 await expect(page.getByRole('link',{name:'Sign in',exact:true})).toHaveAttribute('href','/login?returnTo=%2Ftrade-plans');
 await page.goto('/trade-plans/1');
 await expect(page.getByRole('link',{name:'Sign in',exact:true})).toHaveAttribute('href','/login?returnTo=%2Ftrade-plans%2F1');
});

async function signInTradePlan(page: Page) {
 const credentials={email:`trade-plan-focused-${randomUUID()}@example.test`,password:'synthetic-trade-plan-focused-password'};
 expect((await page.request.post('/api/auth/register',{data:credentials})).status()).toBe(200);
 expect((await page.request.post('/api/auth/login',{data:credentials})).status()).toBe(200);
 await page.goto('/trade-plans'); await selectLocale(page,'en');
}

async function tradePlanCsrf(page: Page) {
 await page.request.get('/api/auth/me');
 const token=(await page.context().cookies()).find(cookie=>cookie.name==='csrf-token')?.value;
 expect(token).toBeTruthy();
 return {'x-csrf-token':token!};
}

async function createExecutionFixture(page: Page) {
 const diaryResponse=await page.request.post('/api/diaries',{headers:await tradePlanCsrf(page),data:{
  title:`Execution fixture ${randomUUID()}`,content:'Synthetic fills for browser acceptance.',date:'2026-10-01',transactions:[
   {symbol:'AAPL',type:'BUY',quantity:'10',price:'100',tradeDate:'2026-10-01T09:00:00Z'},
   {symbol:'AAPL',type:'BUY',quantity:'5',price:'110',tradeDate:'2026-10-01T10:00:00Z'},
  ],
 }});
 expect(diaryResponse.status()).toBe(201);
 const diary=await diaryResponse.json() as {id:string};
 const planResponse=await page.request.post('/api/trade-plans',{headers:await tradePlanCsrf(page),data:{
  diaryId:diary.id,symbol:'AAPL',setupType:'Browser execution evidence',entryPrice:'100',entryZoneLow:'95',entryZoneHigh:'105',invalidationCondition:'Synthetic invalidation',
 }});
 expect(planResponse.status()).toBe(200);
 const plan=await planResponse.json() as {id:string};
 return plan.id;
}

async function navigateTradePlanWithoutDocumentReload(page: Page, path: string) {
 await page.evaluate(nextPath=>{window.history.pushState({},'',nextPath);window.dispatchEvent(new PopStateEvent('popstate'));},path);
}

test('Trade Plan execution keeps selected fills while confirming a new baseline version', async ({page}) => {
 await signInTradePlan(page);
 const planId=await createExecutionFixture(page);
 let historyRequests=0;
 page.on('request',request=>{if(request.method()==='GET'&&request.url().includes(`/api/trade-plans/${planId}/execution-baselines`))historyRequests+=1;});
 await page.goto(`/trade-plans/${planId}`); await selectLocale(page,'en');
 await expect(page.getByText('Baseline not confirmed',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm current plan',exact:true}).click();
 await expect(page.locator('.plan-execution > details > p').filter({hasText:'Baseline version 1'})).toBeVisible();
 await page.getByRole('button',{name:'Choose transactions',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Recorded transactions'});
 await expect(picker).toBeVisible();
 const candidates=picker.locator('input[type="checkbox"]');
 await expect(candidates).toHaveCount(2);
 await candidates.nth(0).check(); await candidates.nth(1).check();
 await picker.getByRole('button',{name:'Select',exact:true}).click();
 await page.getByRole('button',{name:'Save execution selection',exact:true}).click();
 await expect(page.getByText('Execution selection saved.',{exact:true})).toBeVisible();
 await expect(page.getByText('103.333333',{exact:true})).toBeVisible();
 await page.locator('.execution-selected-list > li').first().getByRole('button',{name:'Remove',exact:true}).click();
 await page.getByRole('textbox',{name:'Reason for deviation',exact:true}).fill('Draft deviation retained');
 await page.getByRole('textbox',{name:'Entry price',exact:true}).fill('101');
 await page.getByRole('button',{name:'Save trade plan',exact:true}).click();
 await expect(page.getByText('Trade plan saved.',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Reason for deviation',exact:true})).toHaveValue('Draft deviation retained');
 await expect(page.locator('.plan-execution')).toContainText('Execution changes are not saved yet');
 await page.getByRole('button',{name:'Choose transactions',exact:true}).click();
 await expect(picker.locator('input:checked')).toHaveCount(1);
 await candidates.nth(0).check(); await candidates.nth(1).check();
 await picker.getByRole('button',{name:'Select',exact:true}).click();
 await page.getByRole('button',{name:'Save execution selection',exact:true}).click();
 await expect(page.getByText('Execution selection saved.',{exact:true})).toBeVisible();
 const confirmNew=page.getByRole('button',{name:'Confirm new baseline version',exact:true});
 await expect(confirmNew).toBeVisible(); await confirmNew.click();
 await expect(page.locator('.plan-execution > details > p').filter({hasText:'Baseline version 2'})).toBeVisible();
 await expect(page.locator('.execution-selected-list > li')).toHaveCount(2);
 await page.getByText('Baseline history',{exact:true}).click();
 await expect.poll(()=>historyRequests).toBeGreaterThan(0);
 await expect(page.locator('.execution-history strong').filter({hasText:'Baseline version 1'})).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({path:'.scratch/trade-basic-integrated-improvements/evidence/after/plan-execution-1440.png',fullPage:true});
 await page.setViewportSize({width:390,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({fullPage:true,path:'.scratch/trade-basic-integrated-improvements/evidence/after/plan-execution-390.png'});
 const savedPlan=await (await page.request.get(`/api/trade-plans/${planId}`)).json();
 await page.goto(`/diaries/${savedPlan.diaryId}/review`);
 await page.locator('.review-plan-execution > summary').click();
 await expect(page.locator('.review-plan-execution')).toContainText('103.333333');
});

test('Trade Plan restores a local draft, clears a reverted dirty state, and reports storage quota failures', async ({page}) => {
 await signInTradePlan(page);
 const planResponse=await page.request.post('/api/trade-plans',{headers:await tradePlanCsrf(page),data:{symbol:'AAPL'}});
 expect(planResponse.status()).toBe(200);
 const plan=await planResponse.json() as {id:string};
 await page.goto(`/trade-plans/${plan.id}`); await selectLocale(page,'en');
 const setup=page.getByRole('textbox',{name:'Setup',exact:true});
 await setup.fill('Temporary setup'); await expect(page.locator('.plan-save-status')).toContainText('Not saved to server');
 await setup.fill(''); await expect(page.locator('.plan-save-status')).toHaveText('');
 let dialogs=0; const dismissNavigation=(dialog:Dialog)=>{dialogs+=1; void dialog.dismiss();}; page.on('dialog',dismissNavigation);
 await page.getByRole('link',{name:'All trade plans',exact:true}).click(); await expect(page).toHaveURL(/\/trade-plans$/); expect(dialogs).toBe(0);
 page.off('dialog',dismissNavigation);

 await page.goto('/trade-plans/new'); await selectLocale(page,'en');
 const symbol=page.getByRole('textbox',{name:'Symbol',exact:true}); await symbol.fill('AAPL');
 await expect.poll(()=>page.evaluate(()=>Object.entries(localStorage).some(([key,raw])=>key.startsWith('trade-plan-draft:')&&key.endsWith(':new')&&Boolean(raw)&&JSON.parse(raw!).value?.symbol==='AAPL'))).toBe(true);
 await page.reload(); await selectLocale(page,'en');
 await expect(page.getByRole('button',{name:'Use local draft',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Use local draft',exact:true}).click(); await expect(page.getByRole('textbox',{name:'Symbol',exact:true})).toHaveValue('AAPL');

 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('trade-plan-draft:'))localStorage.removeItem(key);const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key:string,value:string){if(key.startsWith('trade-plan-draft:'))throw new DOMException('quota exceeded','QuotaExceededError');return original.call(this,key,value);};});
 await symbol.fill('MSFT');
 await expect.poll(()=>page.locator('.plan-save-status').innerText()).toContain('Not saved to server');
 await expect(page.locator('.plan-save-status')).toContainText('Local draft could not be saved on this device');
 await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('trade-plan-draft:')))).toBe(false);
});

test('Trade Plan keeps drafts across expiry and isolates them across explicit logout and account changes', async ({page}) => {
 const accountA={email:`trade-plan-account-a-${randomUUID()}@example.test`,password:'synthetic-trade-plan-account-password'};
 expect((await page.request.post('/api/auth/register',{data:accountA})).status()).toBe(200);
 expect((await page.request.post('/api/auth/login',{data:accountA})).status()).toBe(200);
 const planResponse=await page.request.post('/api/trade-plans',{headers:await tradePlanCsrf(page),data:{symbol:'AAPL',setupType:'Account transition fixture'}});
 expect(planResponse.status()).toBe(200);
 const plan=await planResponse.json() as {id:string};
 const accountResponse=await page.request.get('/api/auth/me');
 expect(accountResponse.ok()).toBe(true);
 const account=await accountResponse.json() as {data:{id:string}};
 const draftKey=`trade-plan-draft:${account.data.id}:${plan.id}`;

 await page.goto(`/trade-plans/${plan.id}`); await selectLocale(page,'en');
 const notes=page.getByRole('textbox',{name:'Notes',exact:true});
 await notes.fill('A private draft');
 await expect.poll(()=>page.evaluate(key=>{
  const raw=localStorage.getItem(key); if(!raw)return false;
  try{return JSON.parse(raw).value?.notes==='A private draft';}catch{return false;}
 },draftKey)).toBe(true);

 await page.context().clearCookies();
 await page.route('**/api/diaries/summary**',async route=>{await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({data:{code:'AUTH_UNAUTHORIZED'}})});});
 await page.getByRole('button',{name:'Choose a diary',exact:true}).click();
 await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
 await page.unroute('**/api/diaries/summary**');
 expect(await page.evaluate(key=>Boolean(localStorage.getItem(key)),draftKey)).toBe(true);

 await page.goto(`/login?returnTo=${encodeURIComponent(`/trade-plans/${plan.id}`)}`); await selectLocale(page,'en');
 await page.getByLabel('Email',{exact:true}).fill(accountA.email); await page.getByLabel('Password',{exact:true}).fill(accountA.password); await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/trade-plans/${plan.id}$`)); await selectLocale(page,'en');
 await expect(page.getByRole('button',{name:'Use local draft',exact:true})).toBeVisible(); await page.getByRole('button',{name:'Use local draft',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('A private draft');

 await notes.fill('A explicit draft');
 await expect.poll(()=>page.evaluate(key=>Boolean(localStorage.getItem(key)),draftKey)).toBe(true);
 await signOut(page); await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),draftKey)).toBeNull();

 const accountB={email:`trade-plan-account-b-${randomUUID()}@example.test`,password:'synthetic-trade-plan-account-password'};
 expect((await page.request.post('/api/auth/register',{data:accountB})).status()).toBe(200);
 await page.goto(`/login?returnTo=${encodeURIComponent(`/trade-plans/${plan.id}`)}`); await selectLocale(page,'en');
 await page.getByLabel('Email',{exact:true}).fill(accountB.email); await page.getByLabel('Password',{exact:true}).fill(accountB.password); await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/trade-plans/${plan.id}$`)); await selectLocale(page,'en');
 await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveCount(0);
 await page.goto('/trade-plans/new'); await selectLocale(page,'en');
 await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('');
 expect(await page.evaluate(()=>Object.entries(localStorage).some(([key,raw])=>key.startsWith('trade-plan-draft:')&&raw.includes('A explicit draft')))).toBe(false);
});

test('Trade Plan clears stale form state on same-mounted plan navigation and a missing plan', async ({page}) => {
 await signInTradePlan(page);
 const planAResponse=await page.request.post('/api/trade-plans',{headers:await tradePlanCsrf(page),data:{symbol:'AAPL',setupType:'Plan A',entryPrice:'100',notes:'Plan A baseline'}});
 const planBResponse=await page.request.post('/api/trade-plans',{headers:await tradePlanCsrf(page),data:{symbol:'MSFT',setupType:'Plan B',entryPrice:'200',notes:'Plan B baseline'}});
 expect(planAResponse.status()).toBe(200); expect(planBResponse.status()).toBe(200);
 const planA=await planAResponse.json() as Record<string,unknown>&{id:string};
 const planB=await planBResponse.json() as Record<string,unknown>&{id:string};
 const accountResponse=await page.request.get('/api/auth/me'); expect(accountResponse.ok()).toBe(true);
 const account=await accountResponse.json() as {data:{id:string}};
 const fields=['symbol','status','setupType','entryPrice','entryZoneLow','entryZoneHigh','stopLoss','targetPrice','maxPositionSize','diaryId','invalidationCondition','notes'] as const;
 const planADraft=Object.fromEntries(fields.map(field=>[field,typeof planA[field]==='string'?planA[field]:field==='status'?'draft':'']));
 const draftKey=`trade-plan-draft:${account.data.id}:${planB.id}`;
 await page.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify({at:Date.now(),value})),{key:draftKey,value:planADraft});

 await page.goto(`/trade-plans/${planA.id}`); await selectLocale(page,'en');
 await expect(page.getByRole('textbox',{name:'Symbol',exact:true})).toHaveValue('AAPL');
 await navigateTradePlanWithoutDocumentReload(page,`/trade-plans/${planB.id}`);
 await expect(page).toHaveURL(new RegExp(`/trade-plans/${planB.id}$`));
 await expect(page.getByRole('textbox',{name:'Symbol',exact:true})).toHaveValue('MSFT');
 await expect(page.getByRole('textbox',{name:'Notes',exact:true})).toHaveValue('Plan B baseline');
 await expect(page.getByRole('button',{name:'Use local draft',exact:true})).toBeVisible();

 const missingPlanId='999999999';
 await navigateTradePlanWithoutDocumentReload(page,`/trade-plans/${missingPlanId}`);
 await expect(page).toHaveURL(new RegExp(`/trade-plans/${missingPlanId}$`));
 await expect(page.getByRole('link',{name:'All trade plans',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Symbol',exact:true})).toHaveCount(0);
 await expect(page.getByText('Plan A baseline',{exact:true})).toHaveCount(0);
});

test('Trade Plan keeps newer execution metrics when a plan-save reload GET resolves after execution PUT', async ({page}) => {
 await signInTradePlan(page);
 const planId=await createExecutionFixture(page);
 await page.goto(`/trade-plans/${planId}`); await selectLocale(page,'en');
 await expect(page.getByText('Baseline not confirmed',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm current plan',exact:true}).click();
 await page.getByRole('button',{name:'Choose transactions',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Recorded transactions'});
 const candidates=picker.locator('input[type="checkbox"]');
 await expect(candidates).toHaveCount(2); await candidates.nth(0).check(); await candidates.nth(1).check();
 await picker.getByRole('button',{name:'Select',exact:true}).click(); await page.getByRole('button',{name:'Save execution selection',exact:true}).click();
 await expect(page.getByText('Execution selection saved.',{exact:true})).toBeVisible();
 const staleResponse=await page.request.get(`/api/trade-plans/${planId}/execution`); expect(staleResponse.ok()).toBe(true);
 const staleBody=await staleResponse.text();
 const staleComparison=tradePlanExecutionComparisonSchema.parse(JSON.parse(staleBody));
 expect(staleComparison.executionRevision).toBe(2);

 const releases:Array<()=>void>=[]; let staleGets=0; let releasedGets=0;
 await page.route(`**/api/trade-plans/${planId}/execution`,async route=>{
  if(route.request().method()!=='GET'){await route.continue();return;}
  staleGets+=1;
  await new Promise<void>(resolve=>releases.push(resolve));
  await route.fulfill({status:200,contentType:'application/json',body:staleBody}); releasedGets+=1;
 });
 await page.locator('.execution-selected-list > li').last().getByRole('button',{name:'Remove',exact:true}).click();
 await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Plan save triggers execution reload');
 await page.getByRole('button',{name:'Save trade plan',exact:true}).click();
 await expect(page.getByText('Trade plan saved.',{exact:true})).toBeVisible();
 await expect.poll(()=>staleGets).toBeGreaterThan(0);

 await page.getByRole('textbox',{name:'Reason for deviation',exact:true}).fill('N+1 saved reason');
 await page.getByRole('button',{name:'Save execution selection',exact:true}).click();
 await expect(page.getByText('Execution selection saved.',{exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Reason for deviation',exact:true})).toHaveValue('N+1 saved reason');
 await expect(page.locator('.execution-values')).toContainText('10');
 await expect(page.locator('.execution-values')).toContainText('100');

 const pendingReleases=releases.splice(0); expect(pendingReleases.length).toBeGreaterThan(0); pendingReleases.forEach(release=>release());
 await expect.poll(()=>releasedGets).toBe(pendingReleases.length);
 await page.unroute(`**/api/trade-plans/${planId}/execution`);
 await expect(page.getByRole('textbox',{name:'Reason for deviation',exact:true})).toHaveValue('N+1 saved reason');
 await expect(page.locator('.execution-values')).toContainText('10');
 await expect(page.locator('.execution-values')).toContainText('100');
 await expect(page.locator('.execution-values')).not.toContainText('103.333333');
});
