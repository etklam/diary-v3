import { randomUUID } from 'node:crypto';
import { expect,test, selectLocale, selectTheme } from '../support/e2e';

for(const width of [1440,390]){
 test(`full diary authoring, safe Markdown and deletion at ${width}px`,async({page,context})=>{
  await page.setViewportSize({width,height:900});
  const email=`editor-${randomUUID()}@example.test`,password='synthetic-editor-password';
  expect((await page.request.post('/api/auth/register',{data:{email,password}})).status()).toBe(200);
  await page.goto('/login');await selectLocale(page, 'en');
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);await selectLocale(page, 'en');
  await page.getByLabel('Diary date',{exact:true}).fill('2026-09-06');await page.getByRole('textbox',{name:'Title',exact:true}).fill('Original reasoning before the announcement');
  const markdown='## Observations\n\n**Demand** needs confirmation.\n\n| Signal | Evidence |\n| --- | --- |\n| Demand | Not confirmed |\n\n<script>window.injected=true</script>\n\n[unsafe](javascript:alert(1))\n\n<img src=x onerror="window.injected=true">';
  await page.getByRole('textbox',{name:'Content',exact:true}).fill(markdown);await page.getByRole('textbox',{name:'Tag 1',exact:true}).fill('research, evidence');await page.getByRole('button',{name:'Add tag',exact:true}).click();await page.getByRole('textbox',{name:'Tag 2',exact:true}).fill('長期');
  await page.getByRole('textbox',{name:'Original thesis',exact:true}).fill('Demand could recover.\nConfirmation is still missing.');await page.getByRole('textbox',{name:'Original risk assessment',exact:true}).fill('Price can change before the evidence.');await page.getByRole('textbox',{name:'Original execution plan',exact:true}).fill('Wait for the next report.');
  await page.getByRole('button',{name:'Preview Markdown'}).click();await expect(page.getByRole('heading',{name:'Observations'})).toBeVisible();await page.getByRole('button',{name:'Edit text'}).click();
  await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/\d+$/);const diaryUrl=page.url();
  await expect(page.getByRole('heading',{name:'Observations'})).toBeVisible();await expect(page.locator('.safe-markdown strong')).toHaveText('Demand');
  await expect(page.locator('.diary-tags li')).toHaveText(['research, evidence','長期']);await expect(page.locator('.original-reasoning').filter({has:page.getByRole('heading',{name:'Reasoning at the time',exact:true})})).toContainText('Confirmation is still missing.');
  expect(await page.evaluate(()=>('injected' in window))).toBe(false);await expect(page.locator('.safe-markdown script,.safe-markdown img')).toHaveCount(0);await expect(page.locator('.safe-markdown a[href^="javascript:"],.safe-markdown a[href=""]')).toHaveCount(0);
  if(width===390)await selectTheme(page, 'dark');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`docs/design/evidence/diary/reading-${width}.png`,fullPage:true});
  await page.getByRole('link',{name:'Edit diary'}).click();
  for(const [locale,heading] of [['zh-TW','編輯日記'],['zh-CN','编辑日记'],['en','Edit diary']] as const){await selectLocale(page, locale);await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();}
  await expect(page.getByRole('textbox',{name:'Original thesis',exact:true})).toHaveValue('Demand could recover.\nConfirmation is still missing.');
  await page.getByRole('textbox',{name:'Title',exact:true}).fill('Updated reasoning');await page.getByLabel('Diary date',{exact:true}).fill('2026-09-07');await page.getByRole('textbox',{name:'Tag 1',exact:true}).fill('');await page.getByRole('textbox',{name:'Tag 2',exact:true}).fill('');await page.getByRole('textbox',{name:'Original risk assessment',exact:true}).fill('');
  await page.route('**/api/diaries/*',async route=>{if(route.request().method()==='PUT')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({data:{code:'SYS_INTERNAL_ERROR',requestId:'editor-failure'}})});else await route.continue();});
  await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page.getByTestId('request-id')).toHaveText('editor-failure');await expect(page.getByRole('textbox',{name:'Title',exact:true})).toHaveValue('Updated reasoning');
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:`docs/design/evidence/diary/editor-${width}.png`,fullPage:true});
  await page.unroute('**/api/diaries/*');await page.getByRole('textbox',{name:'Content',exact:true}).fill(markdown+'\n\n'+'Long-form reasoning. '.repeat(400));await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page.getByRole('heading',{name:'Updated reasoning',exact:true})).toBeVisible();await page.reload();await expect(page.locator('.diary-tags li')).toHaveCount(0);
  await expect(page.locator('time')).toHaveText('2026-09-07');
  await page.getByRole('link',{name:'Write a diary',exact:true}).last().click();await page.getByLabel('Diary date',{exact:true}).fill('2026-09-07');await page.getByRole('textbox',{name:'Title',exact:true}).fill('Conflicting date');await page.getByRole('textbox',{name:'Content',exact:true}).fill('Keep this failed submission.');await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page.getByTestId('error-code')).toHaveText('DIARY_ALREADY_EXISTS');await expect(page.getByLabel('Diary date',{exact:true})).toHaveAttribute('aria-invalid','true');
  page.once('dialog',dialog=>dialog.accept());await page.goto(diaryUrl);await expect(page.getByRole('heading',{name:'Updated reasoning',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Delete diary',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Delete diary',exact:true}).click();await dialog.getByRole('button',{name:'Delete diary',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);
  await page.goto(diaryUrl);await expect(page.getByTestId('error-code')).toHaveText('DIARY_NOT_FOUND');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await context.cookies()).some(cookie=>cookie.name==='access-token')).toBe(true);
 });
}
