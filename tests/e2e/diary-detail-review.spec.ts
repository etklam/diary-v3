import { randomUUID } from 'node:crypto';
import { expect,test, selectLocale } from '../support/e2e';

test.use({timezoneId:'America/New_York'});
// Wall time (device timezone) the editor turns back into the exact instant.
const localWall=(instant:Date)=>new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'short',timeZone:'America/New_York'}).format(new Date(Math.floor(instant.getTime()/60000)*60000)).replace(' ','T');

test('diary detail review section answers due state and next action',async({page,context})=>{
 await page.setViewportSize({width:1440,height:900});
 const email=`detail-review-${randomUUID()}@example.test`,password='synthetic-detail-review-password';
 expect((await page.request.post('/api/auth/register',{data:{email,password}})).status()).toBe(200);
 await page.goto('/login?returnTo=%2Fdiaries%2Fnew');await selectLocale(page, 'en');
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);await selectLocale(page, 'en');
 const headers={'x-csrf-token':(await context.cookies()).find(cookie=>cookie.name==='csrf-token')!.value};
 expect((await page.request.put('/api/user/settings',{headers,data:{timezone:'Asia/Taipei'}})).status()).toBe(200);
 await page.getByLabel('Diary date',{exact:true}).fill('2026-09-07');await page.getByRole('textbox',{name:'Title',exact:true}).fill('Detail review section');await page.getByRole('textbox',{name:'Content',exact:true}).fill('Thesis needs a later check.');
 await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/\d+$/);const id=page.url().split('/').at(-1)!;
 // Not scheduled: neutral text plus a CTA into the editor.
 await expect(page.getByRole('heading',{name:'Review diary',exact:true})).toBeVisible();
 await expect(page.getByText('No review scheduled',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Schedule review',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${id}/edit$`));
 // The review page keeps exposing the unscheduled state.
 await page.goto(`/diaries/${id}/review`);await expect(page.getByTestId('review-status')).toHaveText('Not scheduled');
 await page.getByRole('link',{name:'Change review schedule',exact:true}).click();
 const due=new Date((Math.floor(Date.now()/60000)+60*24)*60000);
 await page.getByLabel('Review due at',{exact:true}).fill(localWall(due));
 await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
 // Scheduled ahead: medium date in the account timezone plus the review link.
 await expect(page.getByText(`Review ${new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'Asia/Taipei'}).format(due)}`,{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Review diary',exact:true})).toBeVisible();
 await expect(page.getByText('Review due',{exact:true})).toHaveCount(0);
 // Overdue: emphasized state with the primary contextual action.
 await page.getByRole('link',{name:'Review diary',exact:true}).click();await expect(page.getByTestId('review-status')).toHaveText('Review pending');
 await page.getByRole('link',{name:'Change review schedule',exact:true}).click();
 const overdue=new Date((Math.floor(Date.now()/60000)-60*24)*60000);
 await page.getByLabel('Review due at',{exact:true}).fill(localWall(overdue));
 await page.getByRole('button',{name:'Save diary',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
 await expect(page.getByText('Review due',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Review now',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${id}/review$`));
 // Reviewed: outcome summary plus a read-only entry point.
 expect((await page.request.patch(`/api/diaries/${id}/review`,{headers,data:{reviewOutcome:'PARTIAL',reviewSummary:'Partly confirmed by later data.'}})).status()).toBe(200);
 await page.goto(`/diaries/${id}`);
 await expect(page.getByText('Reviewed · Partly confirmed')).toBeVisible();
 await page.getByRole('link',{name:'View review',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/diaries/${id}/review$`));
 await page.goto(`/diaries/${id}`);
 await expect(page.getByRole('heading',{name:'Review diary',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
