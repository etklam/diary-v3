import { randomUUID } from 'node:crypto';
import { expect,test,selectLocale } from '../support/e2e';

test.use({timezoneId:'America/New_York'});

function nextFallBack(){
 const pad=(value:number)=>String(value).padStart(2,'0');
 const year=new Date().getUTCFullYear()+1;
 const firstSunday=1+(7-new Date(Date.UTC(year,10,1)).getUTCDay())%7;
 const civilDate=`${year}-11-${pad(firstSunday)}`;
 const instant=`${civilDate}T06:30:42.123Z`;
 return {civilDate,localValue:`${civilDate}T01:30`,instant};
}

for(const width of [1440,390])test(`preserves exact repeated-hour review schedule at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const email=`review-instant-${randomUUID()}@example.test`,password='synthetic-review-instant-password';
 await page.request.post('/api/auth/register',{data:{email,password}});
 await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
 await selectLocale(page,'en');
 await page.getByLabel('Email',{exact:true}).fill(email);
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/diaries\/new$/);
 await selectLocale(page,'en');

 const csrf=(await page.context().cookies()).find(cookie=>cookie.name==='csrf-token')!.value;
 const fallBack=nextFallBack();
 const createdResponse=await page.request.post('/api/diaries',{headers:{'x-csrf-token':csrf},data:{date:new Date().toISOString().slice(0,10),title:'Exact review schedule',content:'Synthetic review schedule fixture.',reviewDueAt:fallBack.instant}});
 expect(createdResponse.status()).toBe(201);
 const created=await createdResponse.json();

 await page.goto(`/diaries/${created.id}/review`);
 await page.getByRole('link',{name:'Change review schedule',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/diaries/${created.id}/edit\\?returnTo=%2Fdiaries%2F${created.id}%2Freview#review-schedule$`));
 const input=page.getByLabel('Review due at',{exact:true});
 await expect(input).toBeFocused();
 await expect(input).toHaveValue(fallBack.localValue);
 const occurrence=page.getByRole('combobox',{name:'UTC',exact:true});
 await expect(occurrence).toHaveValue(fallBack.instant);
 await expect(occurrence.locator('option')).toHaveCount(3);
 await occurrence.selectOption(fallBack.instant);
 if(width===390)await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});
 await page.screenshot({path:`docs/design/evidence/architecture-deepening/review-${width}.png`,fullPage:true});

 await page.getByRole('textbox',{name:'Title',exact:true}).fill('Exact review schedule, reviewed');
 await page.getByRole('button',{name:'Save diary',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/diaries/${created.id}/review$`));

 const saved=await (await page.request.get(`/api/diaries/${created.id}`)).json();
 expect(saved.title).toBe('Exact review schedule, reviewed');
 expect(saved.reviewDueAt).toBe(fallBack.instant);
 const review=await (await page.request.get(`/api/diaries/${created.id}/review`)).json();
 expect(review.reviewDueAt).toBe(fallBack.instant);
 expect(review.reviewStatus).toBe('pending');
 await page.goto('/reviews');
 const upcoming=page.getByRole('region',{name:'Upcoming',exact:true});
 await expect(upcoming.getByRole('link',{name:'Review diary: Exact review schedule, reviewed',exact:true})).toBeVisible();
});
