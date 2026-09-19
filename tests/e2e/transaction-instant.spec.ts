import { randomUUID } from 'node:crypto';
import { expect,test,selectLocale } from '../support/e2e';

test.use({timezoneId:'America/New_York'});

for(const width of [1440,390])test(`preserves exact repeated-hour BUY and SELL instants at ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 const email=`transaction-instant-${randomUUID()}@example.test`,password='synthetic-transaction-instant-password';
 await page.request.post('/api/auth/register',{data:{email,password}});
 await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
 await selectLocale(page,'en');
 await page.getByLabel('Email',{exact:true}).fill(email);
 await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/\/diaries\/new$/);
 await selectLocale(page,'en');

 const csrf=(await page.context().cookies()).find(cookie=>cookie.name==='csrf-token')!.value;
 const buyAt='2026-11-01T05:30:42.123Z',sellAt='2026-11-01T06:30:17.456Z';
 const createdResponse=await page.request.post('/api/diaries',{headers:{'x-csrf-token':csrf},data:{date:'2026-11-01',title:'Repeated hour execution',content:'Synthetic exact-time ledger fixture.',transactions:[
  {symbol:'AAPL',type:'BUY',quantity:'2',price:'10',tradeDate:buyAt},
  {symbol:'AAPL',type:'SELL',quantity:'1',price:'12',tradeDate:sellAt},
 ]}});
 expect(createdResponse.status()).toBe(201);
 const created=await createdResponse.json();

 await page.goto(`/diaries/${created.id}/edit`);
 const rows=page.locator('.buy-row');
 await expect(rows).toHaveCount(2);
 await expect(rows.nth(0).getByLabel('Trade date and time (device time)',{exact:true})).toHaveValue('2026-11-01T01:30');
 await expect(rows.nth(1).getByLabel('Trade date and time (device time)',{exact:true})).toHaveValue('2026-11-01T01:30');
 await expect(rows.nth(0).getByRole('combobox',{name:'UTC',exact:true})).toHaveValue(buyAt);
 await expect(rows.nth(1).getByRole('combobox',{name:'UTC',exact:true})).toHaveValue(sellAt);

 if(width===390)await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});
 await page.screenshot({path:`docs/design/evidence/architecture-deepening/transaction-${width}.png`,fullPage:true});
 await page.getByRole('textbox',{name:'Title',exact:true}).fill('Repeated hour execution, reviewed');
 await page.getByRole('button',{name:'Save diary',exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`/diaries/${created.id}$`));
 await page.screenshot({path:testInfo.outputPath(`transaction-instant-detail-${width}.png`),fullPage:true});

 const saved=await (await page.request.get(`/api/diaries/${created.id}`)).json();
 expect(saved.transactions).toHaveLength(2);
 expect(saved.transactions.map((row:{type:string;tradeDate:string})=>[row.type,row.tradeDate])).toEqual([['BUY',buyAt],['SELL',sellAt]]);
 expect(saved.transactions.map((row:{id:string})=>row.id)).toEqual(created.transactions.map((row:{id:string})=>row.id));
 expect(await (await page.request.get('/api/stocks/holdings')).json()).toEqual([{symbol:'AAPL',quantity:'1',avgCost:'10',totalCost:'10'}]);
});
