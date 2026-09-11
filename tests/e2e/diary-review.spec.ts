import { randomUUID } from 'node:crypto';
import { expect,test, selectLocale, selectTheme } from '../support/e2e';

test.use({timezoneId:'America/New_York'});
// Wall time (device timezone) the editor turns back into the exact instant.
const localWall=(instant:Date)=>new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'short',timeZone:'America/New_York'}).format(new Date(Math.floor(instant.getTime()/60000)*60000)).replace(' ','T');
for(const width of [1440,390]){
 test(`schedule, complete and revise a private diary review at ${width}px`,async({page,context,browser})=>{
  await page.setViewportSize({width,height:900});
  const email=`review-${randomUUID()}@example.test`,password='synthetic-review-password';
  expect((await page.request.post('/api/auth/register',{data:{email,password}})).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');await selectLocale(page, 'en');
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);await selectLocale(page, 'en');
  const headers={'x-csrf-token':(await context.cookies()).find(cookie=>cookie.name==='csrf-token')!.value};
  expect((await page.request.put('/api/user/settings',{headers,data:{timezone:'Asia/Taipei'}})).status()).toBe(200);
  await page.getByLabel('Diary date',{exact:true}).fill('2026-09-07');await page.getByRole('textbox',{name:'Title',exact:true}).fill('Demand needs independent confirmation');await page.getByRole('textbox',{name:'Content',exact:true}).fill('## Evidence\n\n**Demand** still needs confirmation.');
  await page.getByRole('textbox',{name:'Original thesis',exact:true}).fill('A recovery is possible.\nWait for independent evidence.');await page.getByRole('textbox',{name:'Original risk assessment',exact:true}).fill('The sample may be too small.');await page.getByRole('textbox',{name:'Original execution plan',exact:true}).fill('Reassess after the report.');await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/\d+$/);const id=page.url().split('/').at(-1)!;
  await page.getByRole('link',{name:'Schedule review',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${id}/edit$`));
  const dueInstant=new Date((Math.floor(Date.now()/60000)+60*24)*60000);
  await page.getByLabel('Review due at',{exact:true}).fill(localWall(dueInstant));await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));await page.getByRole('link',{name:'Review diary',exact:true}).click();
  await expect(page.getByTestId('review-status')).toHaveText('Review pending');await expect(page.getByTestId('review-timezone')).toContainText('Asia/Taipei');await expect(page.getByTestId('review-due')).toHaveAttribute('datetime',dueInstant.toISOString());
  await expect(page.getByTestId('review-due')).toHaveText(new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Taipei'}).format(dueInstant));
  // Dirty indicator: derived from the confirmed baseline, so typing marks it
  // dirty and reverting to the original (empty) value reads as clean again.
  await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('Temporary learning note.');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('');
  await expect(page.getByTestId('save-status')).toHaveText('');
  await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('Temporary learning note.');
  // The route blocker confirms before an internal navigation leaves a dirty reflection.
  let dialogMessage='';const readDialog=(dialog:import('playwright').Dialog)=>{dialogMessage=dialog.message();void dialog.dismiss();};
  page.once('dialog',readDialog);
  await page.getByRole('link',{name:'Back to diary',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}/review$`));
  await expect.poll(()=>dialogMessage).toMatch(/unsaved/i);
  page.once('dialog',dialog=>void dialog.accept());
  await page.getByRole('link',{name:'Back to diary',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
  // Leaving while dirty flushed a device draft; returning offers it and an
  // explicit discard clears the offer.
  await page.goBack();
  await page.getByRole('button',{name:'Discard',exact:true}).click();
  await expect(page.getByRole('button',{name:'Discard',exact:true})).toHaveCount(0);
  await page.getByRole('radio',{name:'Still unclear',exact:true}).check();await page.getByRole('textbox',{name:'What happened',exact:true}).fill('   ');await page.getByRole('button',{name:'Complete review',exact:true}).click();await expect(page.getByTestId('error-code')).toHaveText('SYS_VALIDATION_ERROR');await expect(page.getByRole('textbox',{name:'What happened',exact:true})).toHaveAttribute('aria-invalid','true');
  await page.getByRole('radio',{name:'Partly confirmed',exact:true}).check();await page.getByRole('textbox',{name:'What happened',exact:true}).fill('Private reflection: the result improved, but the evidence remains mixed.');await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('Separate a price change from a change in demand.\nCheck the same measure next time.');await page.getByRole('textbox',{name:'What I will change',exact:true}).fill('Require two independent observations.');
  await page.route(`**/api/diaries/${id}/review`,async route=>{if(route.request().method()==='PATCH')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({data:{code:'SYS_INTERNAL_ERROR',requestId:'review-save'}})});else await route.continue();});
  await page.getByRole('button',{name:'Complete review',exact:true}).click();await expect(page.getByTestId('request-id')).toHaveText('review-save');await expect(page.getByTestId('save-status')).toHaveText('Save failed');await expect(page.getByRole('textbox',{name:'What happened',exact:true})).toHaveValue(/Private reflection/);
  if(width===390)await selectTheme(page, 'dark');await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:`docs/design/evidence/review/form-${width}.png`,fullPage:true});
  await page.unroute(`**/api/diaries/${id}/review`);const before=Date.now();await page.getByRole('button',{name:'Complete review',exact:true}).click();await expect(page.getByRole('heading',{name:'Review completed',exact:true})).toBeFocused();await expect(page.getByTestId('review-status')).toHaveText('Reviewed');await expect(page.getByTestId('save-status')).toHaveCount(0);
  const completed=await (await page.request.get(`/api/diaries/${id}/review`)).json();expect(Date.parse(completed.reviewedAt)).toBeGreaterThanOrEqual(before);expect(Date.parse(completed.reviewedAt)).toBeLessThanOrEqual(Date.now());expect(completed.reviewOutcome).toBe('PARTIAL');expect(completed.thesis).toBe('A recovery is possible.\nWait for independent evidence.');
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:`docs/design/evidence/review/completed-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Edit reflection',exact:true}).click();await page.getByRole('textbox',{name:'What happened',exact:true}).fill('Private reflection: revised after checking the second report.');await page.getByRole('button',{name:'Save review changes',exact:true}).click();await expect(page.getByRole('heading',{name:'Review completed',exact:true})).toBeVisible();await page.reload();await expect(page.locator('.review-reflection')).toContainText('revised after checking the second report.');
  await page.getByRole('button',{name:'Edit reflection',exact:true}).click();await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:`docs/design/evidence/review/editing-completed-${width}.png`,fullPage:true});
  // Cancelling without changes returns to the completed view without a confirm;
  // cancelling real changes confirms first — dismissing keeps editing.
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review completed',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit reflection',exact:true}).click();
  await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('A cancelled learning note.');
  page.once('dialog',dialog=>void dialog.dismiss());
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'What I learned',exact:true})).toBeVisible();
  page.once('dialog',dialog=>void dialog.accept());
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review completed',exact:true})).toBeVisible();
  // A 401 save fails closed: the shared session layer treats it as expiry and the
  // layout redirects to the sign-in return flow, while the account-scoped device
  // draft keeps every reflection. Re-authenticating returns here with a restore.
  await page.getByRole('button',{name:'Edit reflection',exact:true}).click();
  await page.getByRole('textbox',{name:'What happened',exact:true}).fill('Recovery reflection kept across an expired session.');
  await page.route(`**/api/diaries/${id}/review`,async route=>{if(route.request().method()==='PATCH')await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({data:{code:'AUTH_TOKEN_INVALID'}})});else await route.continue();});
  await page.getByRole('button',{name:'Save review changes',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('review-draft:')).length)).toBeGreaterThan(0);
  await page.unroute(`**/api/diaries/${id}/review`);
  // Whether the inline failure notice or the expiry redirect won the race, the
  // sign-in return flow lands back on this review page.
  await page.goto(`/login?returnTo=${encodeURIComponent(`/diaries/${id}/review`)}`);
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}/review$`));
  await page.getByRole('button',{name:'Restore',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'What happened',exact:true})).toHaveValue(/Recovery reflection/);
  await page.getByRole('button',{name:'Save review changes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review completed',exact:true})).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button',{name:'Restore',exact:true})).toHaveCount(0);
  for(const [locale,title] of [['zh-TW','日記複盤'],['zh-CN','日记复盘'],['en','Diary review']] as const){await selectLocale(page, locale);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // A long-content diary keeps the completed view overflow-safe.
  await page.goto('/diaries/new');
  await page.getByLabel('Diary date',{exact:true}).fill('2026-09-06');
  await page.getByRole('textbox',{name:'Title',exact:true}).fill('Long-form review layout');
  const longSentence='Demand evidence stayed mixed across the full observation window. ';
  await page.getByRole('textbox',{name:'Content',exact:true}).fill(`## Long evidence\n\n${longSentence.repeat(60)}\n\n${'unbroken'.padEnd(2400,'x')}`);
  await page.getByRole('textbox',{name:'Original thesis',exact:true}).fill(`${longSentence.repeat(40)}${'thesis'.padEnd(2400,'t')}`);
  await page.getByRole('textbox',{name:'Original risk assessment',exact:true}).fill(longSentence.repeat(40));
  await page.getByRole('textbox',{name:'Original execution plan',exact:true}).fill(longSentence.repeat(40));
  await page.getByRole('button',{name:'Save diary',exact:true}).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const longId=page.url().split('/').at(-1)!;
  await page.goto(`/diaries/${longId}/review`);
  await page.getByRole('radio',{name:'Thesis intact',exact:true}).check();
  await page.getByRole('textbox',{name:'What happened',exact:true}).fill(`${longSentence.repeat(30)}${'reflection'.padEnd(2400,'r')}`);
  await page.getByRole('button',{name:'Complete review',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Review completed',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});
  await page.screenshot({path:`docs/design/evidence/review/long-content-${width}.png`,fullPage:true});
  const outsider=await browser.newContext({baseURL:new URL(page.url()).origin,extraHTTPHeaders:{'x-e2e-test-id':randomUUID()}});
  try{const otherEmail=`outsider-${randomUUID()}@example.test`;await outsider.request.post('/api/auth/register',{data:{email:otherEmail,password}});await outsider.request.post('/api/auth/login',{data:{email:otherEmail,password}});const other=await outsider.newPage();await other.goto(`/diaries/${id}/review`);await selectLocale(other, 'en');await expect(other.getByTestId('error-code')).toHaveText('DIARY_NOT_FOUND');await expect(other.locator('body')).not.toContainText('Private reflection:');await expect(other.locator('body')).not.toContainText('Demand needs independent confirmation');const otherHeaders={'x-csrf-token':(await outsider.cookies()).find(cookie=>cookie.name==='csrf-token')!.value};expect((await outsider.request.patch(`/api/diaries/${id}/review`,{headers:otherHeaders,data:{reviewOutcome:'INTACT',reviewSummary:'Unauthorized change'}})).status()).toBe(404);}finally{await outsider.close();}
 });
}

async function signInForDraft(page:import('playwright').Page,email:string,password:string){
 expect((await page.request.post('/api/auth/register',{data:{email,password}})).status()).toBe(200);
 await page.goto('/login?returnTo=%2Fdiaries%2Fnew');await selectLocale(page, 'en');
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);await selectLocale(page, 'en');
 return {'x-csrf-token':(await page.context().cookies()).find(cookie=>cookie.name==='csrf-token')!.value};
}
const reviewDraftCount=(page:import('playwright').Page)=>page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('review-draft:')).length);

test('discarding a review recovery re-arms the draft for new reflections',async({page})=>{
 const email=`review-discard-${randomUUID()}@example.test`,password='synthetic-review-password';
 const headers=await signInForDraft(page,email,password);
 expect((await page.request.post('/api/diaries',{headers,data:{date:'2026-09-07',title:'Discard re-arm review',content:'Baseline diary writing.'}})).status()).toBe(201);
 await page.goto('/diaries');await page.getByRole('link',{name:'Discard re-arm review',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/\d+$/);const id=page.url().split('/').at(-1)!;
 expect((await page.request.patch(`/api/diaries/${id}/review`,{headers,data:{reviewOutcome:'INTACT',reviewSummary:'Baseline reflection kept on the server.'}})).status()).toBe(200);
 const draftLearning=()=>page.evaluate(()=>{const raw=localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('review-draft:'))??'');const saved=raw?JSON.parse(raw) as {value?:{reviewLearning?:string}}:null;return saved?.value?.reviewLearning??null;});

 // Reflection X is written debounced while dirty.
 await page.goto(`/diaries/${id}/review`);
 await page.getByRole('button',{name:'Edit reflection',exact:true}).click();
 await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('First private learning X.');
 await expect.poll(draftLearning,{timeout:5000}).toBe('First private learning X.');

 // Discard only drops X: the form is back on the confirmed baseline, so nothing
 // is rewritten, and typing Y re-arms the debounced draft with Y, never X.
 await page.reload();
 await page.getByRole('button',{name:'Discard',exact:true}).click();
 await expect.poll(draftLearning).toBeNull();
 await page.getByRole('button',{name:'Edit reflection',exact:true}).click();
 await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('Second private learning Y.');
 await expect.poll(draftLearning,{timeout:5000}).toBe('Second private learning Y.');

 // The re-armed draft survives a reload and restores Y.
 await page.reload();
 await page.getByRole('button',{name:'Restore',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'What I learned',exact:true})).toHaveValue('Second private learning Y.');
});

test('an explicit sign-out in another tab clears the private reflection draft',async({page})=>{
 const email=`review-signout-${randomUUID()}@example.test`,password='synthetic-review-password';
 const headers=await signInForDraft(page,email,password);
 expect((await page.request.post('/api/diaries',{headers,data:{date:'2026-09-07',title:'Signout draft review',content:'Private writing.'}})).status()).toBe(201);
 await page.goto('/diaries');await page.getByRole('link',{name:'Signout draft review',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/\d+$/);const id=page.url().split('/').at(-1)!;
 await page.goto(`/diaries/${id}/review`);
 await page.getByRole('textbox',{name:'What I learned',exact:true}).fill('Private learning that must not survive a shared-device sign-out.');
 await expect.poll(()=>reviewDraftCount(page),{timeout:5000}).toBeGreaterThan(0);
 // A sign-out in another tab arrives as the logout broadcast; replaying the exact
 // storage write keeps this page in place while the app's own listener clears
 // every private draft. A 401 expiry keeps the draft instead — locked in by the
 // recovery flow above.
 await page.evaluate(()=>{const value=JSON.stringify({type:'logout',nonce:`${Date.now()}-test`});localStorage.setItem('diary-logout-event',value);window.dispatchEvent(new StorageEvent('storage',{key:'diary-logout-event',newValue:value}));});
 await expect.poll(()=>reviewDraftCount(page)).toBe(0);
});
