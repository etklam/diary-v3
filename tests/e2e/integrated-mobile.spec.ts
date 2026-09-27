import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme } from '../support/e2e';

for (const width of [1440, 768, 390, 360]) test(`integrated surfaces fit and retain keyboard semantics at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `integrated-layout-${randomUUID()}@example.test`, password = 'synthetic-layout-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  expect((await page.request.post('/api/auth/login', { data: { email, password } })).ok()).toBe(true);
  await page.request.get('/api/auth/me');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  await page.request.put('/api/user/settings', { headers, data: { locale: 'en', timezone: 'Asia/Taipei' } });
  const created = await page.request.post('/api/diaries', { headers, data: { title: 'Long original judgment · 長標題與風險觀察 '.repeat(8), content: 'Original reasoning remains readable.\n\n原始判斷不因收合而遺失。', date: '2026-09-01', thesis: 'Synthetic thesis', reviewDueAt: '2026-09-28T09:00:00Z' } });
  expect(created.status()).toBe(201); const diary = await created.json();
  const folder = `.scratch/trade-basic-integrated-improvements/evidence/after/mobile-${width}`;
  await mkdir(folder, { recursive: true });
  await page.goto('/diaries/new'); await expect(page.getByRole('button', {name:'Save diary',exact:true})).toBeVisible();
  for (const [name, route] of [['diary', '/diaries/new'], ['quick', '/diaries/quick'], ['plan', '/trade-plans/new'], ['review', `/diaries/${diary.id}/review`], ['library', '/diaries'], ['watchlist', '/stocks/watchlist']] as const) {
    await page.goto(route);
    await expect(page.locator('main h1').first()).toBeVisible();
    if (name === 'review') {
      const reflection = page.locator('textarea[name="reviewSummary"]');
      await reflection.fill('Editing survives reading disclosure');
      await page.getByText('Read original judgment', {exact:true}).click();
      await expect(reflection).toHaveValue('Editing survives reading disclosure');
      await reflection.fill('');
    }
    if (name === 'plan') await expect(page.locator('form')).toBeVisible();
    await selectTheme(page, width === 390 || width === 768 ? 'dark' : 'light');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
    if (width < 768 && ['diary', 'plan', 'review'].includes(name)) {
      const action = page.getByRole('button', { name: name === 'diary' ? 'Save diary' : name === 'plan' ? 'Save trade plan' : 'Complete review', exact: true });
      await action.scrollIntoViewIfNeeded();
      const button = await action.boundingBox(), navigation = await page.getByTestId('mobile-diary-navigation').boundingBox();
      expect(button).not.toBeNull(); expect(navigation).not.toBeNull();
      expect(button!.y + button!.height).toBeLessThanOrEqual(navigation!.y);
      expect(button!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `${folder}/${name}-actions.png` });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  }
  for (const locale of ['zh-TW','zh-CN','en']) {
    await selectLocale(page, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const locale of ['zh-TW', 'zh-CN', 'en']) test(`affected surfaces support ${locale} with doubled text and reduced motion`, async ({ page, context }) => {
  await page.setViewportSize({width:390,height:900}); await page.emulateMedia({reducedMotion:'reduce'});
  const email=`text-scale-${randomUUID()}@example.test`,password='synthetic-text-scale-password';
  await page.request.post('/api/auth/register',{data:{email,password}});
  await page.request.post('/api/auth/login',{data:{email,password}}); await page.request.get('/api/auth/me');
  const headers={'x-csrf-token':(await context.cookies()).find(cookie=>cookie.name==='csrf-token')!.value};
  await page.request.put('/api/user/settings',{headers,data:{locale,timezone:'Asia/Taipei'}});
  const diary=await (await page.request.post('/api/diaries',{headers,data:{title:'Long title 長中文標題 '.repeat(12),content:'Synthetic original judgment',date:'2026-09-01'}})).json();
  for(const route of ['/diaries/new','/diaries/quick','/trade-plans/new',`/diaries/${diary.id}/review`,'/diaries','/stocks/watchlist','/stocks']){
    await page.goto(route); await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang',locale);
    // Text scaling is an automated accessibility probe, not a physical browser zoom claim.
    await page.addStyleTag({content:'html { font-size: 200%; }'});
    const layout = await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= innerWidth,
      overflowing: [...document.querySelectorAll('main *')].filter(element => element.getBoundingClientRect().right > innerWidth).slice(0, 8).map(element => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })) }));
    expect(layout.fits, `${route}: ${JSON.stringify(layout.overflowing)}`).toBe(true);
    if (route === '/stocks/watchlist') await page.screenshot({path: `.scratch/trade-basic-integrated-improvements/evidence/after/watchlist-text-200-${locale}.png`, fullPage:true});
  }
});
