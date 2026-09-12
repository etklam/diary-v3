import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { selectLocale } from '../support/e2e';

const password = 'synthetic-release-artifact-password';

test('built artifacts serve public pages and API health', async ({ page, request }) => {
  await expect((await request.get('/healthz')).status()).toBe(200);
  await expect((await request.get('/readyz')).status()).toBe(200);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await page.goto('/tools');
  await expect(page.locator('main')).toBeVisible();
});

test('built artifacts complete auth and diary create, read, edit', async ({ page, request }) => {
  const email = `release-${randomUUID()}@example.test`;
  expect((await request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(email);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await page.getByLabel(/Diary date|日記日期|日记日期/, { exact: true }).fill('2026-09-10');
  await page.getByRole('textbox', { name: /Title|標題|标题/, exact: true }).fill('Release artifact diary');
  await page.getByRole('textbox', { name: /Content|內容|内容/, exact: true }).fill('Created through built API and Web artifacts.');
  await page.getByRole('button', { name: /Save diary|儲存日記|保存日记/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const id = page.url().split('/').at(-1)!;
  await page.getByRole('link', { name: /Edit diary|編輯日記|编辑日记/, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}/edit$`));
  await page.getByRole('textbox', { name: /Title|標題|标题/, exact: true }).fill('Release artifact diary, edited');
  await page.getByRole('button', { name: /Save diary|儲存日記|保存日记/, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
  await expect(page.getByRole('heading', { name: 'Release artifact diary, edited', exact: true })).toBeVisible();
  const persisted = await (await page.context().request.get(`/api/diaries/${id}`)).json() as { title: string };
  expect(persisted.title).toBe('Release artifact diary, edited');
});

test('built artifacts complete Company capture, append, server verification and return', async ({ page, request }) => {
  const email = `release-handoff-${randomUUID()}@example.test`;
  const date = '2026-09-23';
  const firstMarker = `Release Company capture ${randomUUID()}`;
  const appendMarker = `Release Company append ${randomUUID()}`;
  expect((await request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(email);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');

  await page.goto('/stocks/NVDA');
  await page.getByRole('link', { name: 'Record a thought', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/quick\?symbol=NVDA&source=company$/);
  await page.getByLabel('Diary date', { exact: true }).fill(date);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Release Company handoff');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(firstMarker);
  await page.getByRole('button', { name: 'Create diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const id = page.url().split('/').at(-1)!;
  const createdResponse = await page.request.get(`/api/diaries/${id}`);
  expect(createdResponse.status()).toBe(200);
  const created = await createdResponse.json() as { id: string; content: string; stockSymbols: string[] };
  expect(created).toMatchObject({ id, content: firstMarker, stockSymbols: ['NVDA'] });

  await page.getByRole('link', { name: 'Return to NVDA research', exact: true }).click();
  await expect(page).toHaveURL(/\/stocks\/NVDA$/);
  await page.getByRole('link', { name: 'Record a thought', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/quick\?symbol=NVDA&source=company$/);
  await page.getByLabel('Diary date', { exact: true }).fill(date);
  await expect(page.getByRole('combobox', { name: 'Save mode', exact: true })).toHaveValue('append');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(appendMarker);
  await page.getByRole('button', { name: 'Append to date', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
  const appendedResponse = await page.request.get(`/api/diaries/${id}`);
  expect(appendedResponse.status()).toBe(200);
  const appended = await appendedResponse.json() as { id: string; content: string; stockSymbols: string[] };
  expect(appended.id).toBe(id);
  expect(appended.content).toBe(`${firstMarker}\n\n---\n\n${appendMarker}`);
  expect(appended.content.split(appendMarker)).toHaveLength(2);
  expect(appended.stockSymbols).toEqual(['NVDA']);
  await expect(page.getByRole('link', { name: 'Return to NVDA research', exact: true })).toHaveAttribute('href', '/stocks/NVDA');
  await page.getByRole('link', { name: 'Return to NVDA research', exact: true }).click();
  await expect(page).toHaveURL(/\/stocks\/NVDA$/);
});

test('built artifacts restore a draft and complete a review', async ({ page, request, context }) => {
  const email = `release-recovery-${randomUUID()}@example.test`;
  expect((await request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.addInitScript(() => localStorage.setItem('diary-locale', 'en'));
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(email);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  const created = await context.request.post('/api/diaries', {
    headers: { 'x-csrf-token': csrf },
    data: { date: '2026-09-11', title: 'Release recovery diary', content: 'Persisted baseline.' },
  });
  expect(created.status()).toBe(201);
  const diary = await created.json() as { id: string };
  await page.goto(`/diaries/${diary.id}/edit`);
  await page.getByRole('textbox', { name: /Content|內容|内容/, exact: true }).fill('Recovered through the built Web artifact.');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-editor-draft:'))), { timeout: 5_000 }).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: /Restore unsaved draft|還原上次未儲存的內容|恢复上次未保存的内容/, exact: true }).click();
  await page.getByRole('button', { name: /Save diary|儲存日記|保存日记/, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${diary.id}$`));
  const recovered = await (await context.request.get(`/api/diaries/${diary.id}`)).json() as { content: string };
  expect(recovered.content).toBe('Recovered through the built Web artifact.');

  const scheduled = await context.request.put(`/api/diaries/${diary.id}`, {
    headers: { 'x-csrf-token': csrf },
    data: { title: 'Release recovery diary', content: recovered.content, reviewDueAt: '2026-09-12T01:00:00.000Z' },
  });
  expect(scheduled.status()).toBe(200);
  await page.goto(`/diaries/${diary.id}/review`);
  await page.getByRole('radio', { name: /Thesis intact|論點仍成立|论点仍成立/, exact: true }).check();
  await page.getByRole('textbox', { name: /What happened|實際發生甚麼|实际发生什么/, exact: true }).fill('Built review artifact completed the decision loop.');
  await page.getByRole('button', { name: /Complete review|完成複盤|完成复盘/, exact: true }).click();
  await expect(page.getByRole('heading', { name: /Review completed|複盤已完成|复盘已完成/, exact: true })).toBeVisible();
});

test('built artifacts move from Timeline into Partner comparison and revalidate permissions', async ({ page, browser }) => {
  const emailA = `release-parity-a-${randomUUID()}@example.test`;
  const emailB = `release-parity-b-${randomUUID()}@example.test`;
  const csrfFor = async (context: import('@playwright/test').BrowserContext) => {
    // POST logins never set the CSRF cookie; one bounded GET establishes it.
    let cookies = await context.cookies();
    if (!cookies.some(item => item.name === 'csrf-token')) {
      await context.request.get('/api/auth/me');
      cookies = await context.cookies();
    }
    const cookie = cookies.find(item => item.name === 'csrf-token');
    expect(cookie?.value).toBeTruthy();
    return { 'x-csrf-token': cookie!.value };
  };
  // Distinct forwarded addresses give each synthetic client its own rate-limit
  // bucket; the release harness trusts x-forwarded-for for this isolation.
  const forwarded = () => `10.${randomUUID().charCodeAt(0)}.${randomUUID().charCodeAt(1)}.${randomUUID().charCodeAt(2)}`;
  const partnerContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID(), 'x-forwarded-for': forwarded() } });
  const partnerPage = await partnerContext.newPage();
  expect((await partnerPage.request.post('/api/auth/register', { data: { email: emailB, password } })).status()).toBe(200);
  expect((await partnerPage.request.post('/api/auth/login', { data: { email: emailB, password } })).status()).toBe(200);
  // Drive A's writes through an authenticated browser context; the request
  // fixture cannot hold the browser session cookies.
  const aContext = await browser.newContext({ extraHTTPHeaders: { 'x-e2e-test-id': randomUUID(), 'x-forwarded-for': forwarded() } });
  const aPage = await aContext.newPage();
  expect((await aPage.request.post('/api/auth/register', { data: { email: emailA, password } })).status()).toBe(200);
  expect((await aPage.request.post('/api/auth/login', { data: { email: emailA, password } })).status()).toBe(200);
  const aHeaders = await csrfFor(aContext);
  const linked = await aPage.request.post('/api/partners', { headers: aHeaders, data: { partnerEmail: emailB } });
  expect(linked.status()).toBe(200);
  const { link } = await linked.json() as { link: { id: string; partner: { id: string } } };
  const bHeaders = await csrfFor(partnerContext);
  expect((await partnerPage.request.post(`/api/partners/${link.id}/accept`, { headers: bHeaders })).status()).toBe(200);
  expect((await partnerPage.request.put(`/api/partners/${link.id}/sharing`, { headers: bHeaders, data: { shareDiaries: true } })).status()).toBe(200);
  expect((await aPage.request.post('/api/diaries', { headers: aHeaders, data: { date: '2026-09-12', title: 'Release owner side', content: 'Owner day entry.' } })).status()).toBe(201);
  expect((await partnerPage.request.post('/api/diaries', { headers: bHeaders, data: { date: '2026-09-12', title: 'Release partner side', content: 'Shared partner entry.' } })).status()).toBe(201);

  await page.addInitScript(() => localStorage.setItem('diary-locale', 'en'));
  await page.goto('/login?returnTo=%2Ftimeline');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(emailA);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await page.getByTestId('timeline-modes').getByRole('link', { name: /伙伴對照|伙伴对照|Partner comparison/ }).click();
  await expect(page).toHaveURL(/\/partners\/compare$/);
  await expect(page.getByTestId('compare-day')).toHaveCount(1);
  await expect(page.getByTestId('owner-diary')).toContainText('Owner day entry.');
  await expect(page.getByTestId('partner-diary')).toContainText('Shared partner entry.');

  // The partner withdraws sharing; the rendered comparison must drop it on revalidation.
  expect((await partnerPage.request.put(`/api/partners/${link.id}/sharing`, { headers: bHeaders, data: { shareDiaries: false } })).status()).toBe(200);
  await page.getByRole('button', { name: /重新整理對照|刷新对照|Refresh comparison/ }).click();
  await expect(page.getByTestId('partner-diary')).toContainText(/伙伴尚未分享日記|伙伴尚未分享日记|Your partner has not shared diaries\./);
  await expect(page.locator('.pair-page')).not.toContainText('Shared partner entry.');
  await aContext.close();
  await partnerContext.close();
});
