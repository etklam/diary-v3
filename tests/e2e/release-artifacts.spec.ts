import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { selectLocale } from '../support/e2e';

const password = 'synthetic-release-artifact-password';
// Synthetic client identity for the register rate limiter; the release
// harness trusts x-forwarded-for so each new account registers in its own bucket.
const freshClient = () => ({ 'x-forwarded-for': `10.${randomUUID().charCodeAt(0)}.${randomUUID().charCodeAt(1)}.${randomUUID().charCodeAt(2)}` });

test('built artifacts serve public pages and API health', async ({ page, request }) => {
  await expect((await request.get('/healthz')).status()).toBe(200);
  await expect((await request.get('/readyz')).status()).toBe(200);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await page.goto('/tools');
  await expect(page.locator('main')).toBeVisible();
});

test('built artifacts publish, update, and archive a public article', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const title = `Release public article ${randomUUID()}`;
  expect((await page.request.post('/api/auth/login', { data: { email: 'release-admin@example.test', password: 'synthetic-release-admin-password' } })).status()).toBe(200);
  await page.goto('/articles');
  await page.getByRole('link', { name: /New article|新增文章/, exact: true }).click();
  await page.getByLabel(/Title|標題|标题/, { exact: true }).fill(title);
  await page.getByLabel(/Content|內容|内容/, { exact: true }).fill('Release draft body.');
  await page.getByRole('button', { name: /Save draft|保存草稿/, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/blog\/\d+\/edit$/);
  const id = page.url().match(/\/admin\/blog\/(\d+)\/edit$/)?.[1];
  expect(id).toBeTruthy();
  expect((await page.request.get(`/api/blog/admin/${id}`)).status()).toBe(200);

  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    const draft = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string; status: string };
    expect(draft.status).toBe('DRAFT');
    expect((await guest.request.get(`/api/blog/${encodeURIComponent(draft.slug)}`)).status()).toBe(404);
    await page.getByRole('button', { name: /Publish publicly|公開發布|公开发布/, exact: true }).click();
    await expect(page.getByText(/Article published publicly\.|文章已公開發布。|文章已公开发布。/, { exact: true })).toBeVisible();
    const published = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string; status: string };
    expect(published.status).toBe('PUBLISHED');
    await guest.goto('/articles');
    await expect(guest.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await guest.goto(`/articles/${encodeURIComponent(published.slug)}`);
    await expect(guest.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /View public article|查看公開文章|查看公开文章/, exact: true })).toHaveAttribute('href', `/articles/${encodeURIComponent(published.slug)}`);
    await page.getByLabel(/Content|內容|内容/, { exact: true }).fill('Updated through built artifacts.');
    await page.getByRole('button', { name: /Update published article|更新公開文章|更新公开文章/, exact: true }).click();
    await expect(page.getByText(/Published article updated\.|公開文章已更新。|公开文章已更新。/, { exact: true })).toBeVisible();
    expect((await (await page.request.get(`/api/blog/admin/${id}`)).json() as { status: string }).status).toBe('PUBLISHED');
    await guest.reload();
    await expect(guest.getByText('Updated through built artifacts.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Archive article|封存文章|归档文章/, exact: true }).click();
    await expect(page.getByText(/Article archived and no longer public\.|文章已封存，不再公開。|文章已归档，不再公开。/, { exact: true })).toBeVisible();
    expect((await guest.goto(`/articles/${encodeURIComponent(published.slug)}`))?.status()).toBe(404);
    await guest.goto('/articles');
    await expect(guest.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  } finally { await guestContext.close(); }
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

test('built artifacts let anonymous visitors finish calculator and market research tasks', async ({ page }) => {
  // Calculator task with fixed inputs; the invested amount follows the
  // reserved-cash domain rule (10000 capital, 33 price, 2% reserve).
  await page.goto('/tools/position-sizing');
  await page.getByTestId('position-sizing-capital').fill('10000');
  await page.getByTestId('position-sizing-price').fill('33');
  await expect(page.getByTestId('position-sizing-invested')).toHaveText(/9[.,]933/);
  await expect(page.getByTestId('position-sizing-copy')).toBeEnabled();
  // Private persistence stays behind sign-in for anonymous visitors.
  await page.getByTestId('position-sizing-save-new').click();
  await expect(page.getByRole('alert').getByRole('link')).toHaveAttribute('href', /\/login/);

  // Market research task on the deterministic fixture provider: the quote
  // renders, and a new lookup actually re-binds the research view.
  await page.goto('/stocks/NVDA');
  await expect(page.getByTestId('market-price')).toHaveText('100');
  await expect(page.locator('.market-metrics')).toContainText('USD');
  await expect(page.getByRole('table')).toContainText('NVDA');
  await page.getByRole('textbox', { name: /Stock or index symbol|股票或指數代號|股票或指数代码/, exact: true }).fill('AAPL');
  await page.getByRole('button', { name: /View market data|查看行情/, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'AAPL', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('AAPL');
  const history = page.waitForResponse(response => response.url().includes('/api/market/historical') && response.url().includes('range=1mo'));
  await page.getByRole('combobox', { name: /History range|歷史範圍|历史范围/ }).selectOption('1mo');
  expect((await history).status()).toBe(200);
  await expect(page.getByRole('table')).toBeVisible();
  // A guest still gets the public research task without private fragments or errors.
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('region', { name: /Company notes|公司筆記|公司笔记/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Record a thought|記錄想法|记录想法/ })).toBeVisible();
});

test('built artifacts complete the diary mainline with server-verified reads', async ({ page, request }) => {
  const email = `release-mainline-${randomUUID()}@example.test`;
  const marker = `ReleaseMainline ${randomUUID()}`;
  const clientHeaders = freshClient();
  await page.context().setExtraHTTPHeaders(clientHeaders);
  expect((await request.post('/api/auth/register', { headers: clientHeaders, data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(email);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  const headers = { 'x-csrf-token': csrf };

  // Write through the normal product entry.
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-15');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Release mainline diary');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(`${marker} Original reasoning stands.`);
  await page.getByRole('textbox', { name: 'Company context', exact: true }).fill('NVDA');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const id = page.url().split('/').at(-1)!;
  const created = await (await page.context().request.get(`/api/diaries/${id}`)).json() as { title: string; content: string; date: string; stockSymbols: string[]; tags: string[] };
  expect(created).toMatchObject({ title: 'Release mainline diary', date: '2026-09-15', stockSymbols: ['NVDA'] });
  expect(created.content).toContain(marker);

  // The library search finds this exact record, not just the newest one.
  await page.goto('/diaries');
  await page.getByRole('searchbox', { name: /Search title or content|搜尋標題或內容|搜索标题或内容/, exact: true }).fill(marker);
  await page.getByRole('searchbox', { name: /Search title or content|搜尋標題或內容|搜索标题或内容/, exact: true }).press('Enter');
  const results = page.getByRole('link', { name: 'Release mainline diary', exact: true });
  await expect(results).toHaveCount(1);
  await results.click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
  await expect(page.getByRole('heading', { name: 'Release mainline diary', exact: true })).toBeVisible();

  // The timeline and the calendar reach the same persisted record.
  await page.goto('/timeline');
  await expect(page.getByTestId('timeline-entry').filter({ hasText: 'Release mainline diary' })).toHaveCount(1);
  await page.goto('/calendar');
  await page.getByLabel(/Month|月份/, { exact: true }).fill('2026-09');
  await page.locator('.calendar-grid [data-date="2026-09-15"]').click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));

  // Editing again round-trips through the server, not just the textbox.
  await page.getByRole('link', { name: /Edit diary|編輯日記|编辑日记/, exact: true }).click();
  await page.getByRole('textbox', { name: /Content|內容|内容/, exact: true }).fill(`${marker} Updated after re-reading.`);
  await page.getByRole('button', { name: /Save diary|儲存日記|保存日记/, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
  const edited = await (await page.context().request.get(`/api/diaries/${id}`)).json() as { content: string; stockSymbols: string[] };
  expect(edited.content).toBe(`${marker} Updated after re-reading.`);
  expect(edited.stockSymbols).toEqual(['NVDA']);

  // Same-day append keeps the original title and body; new content appears once.
  await page.goto('/diaries/quick');
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-15');
  await page.getByRole('combobox', { name: /Save mode|儲存方式|保存方式/, exact: true }).selectOption('append');
  await expect(page.getByText(/A diary exists for this date|已有日記|已有日记/)).toBeVisible();
  await page.getByRole('textbox', { name: /Content|內容|内容/, exact: true }).fill(`${marker} Appended once.`);
  await page.getByRole('button', { name: /Append to date|追加至所選日期|追加至所选日期/, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}$`));
  const appended = await (await page.context().request.get(`/api/diaries/${id}`)).json() as { title: string; content: string };
  expect(appended.title).toBe('Release mainline diary');
  expect(appended.content.split(`${marker} Appended once.`)).toHaveLength(2);
  expect(appended.content).toContain('Updated after re-reading.');

  // A due review is completed through the queue and the outcome is server-verified.
  expect((await page.context().request.put(`/api/diaries/${id}`, { headers, data: { title: 'Release mainline diary', content: appended.content, reviewDueAt: '2020-01-01T00:00:00.000Z' } })).status()).toBe(200);
  await page.goto('/reviews');
  const overdue = page.getByRole('region', { name: /Overdue|已逾期/, exact: true });
  await expect(overdue.getByRole('link', { name: new RegExp(`Review diary: Release mainline diary`) })).toBeVisible();
  await overdue.getByRole('link', { name: new RegExp(`Review diary: Release mainline diary`) }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${id}/review$`));
  await page.getByRole('radio', { name: /Thesis intact|論點仍成立|论点仍成立/, exact: true }).check();
  await page.getByRole('textbox', { name: /What happened|實際發生甚麼|实际发生什么/, exact: true }).fill('Original reasoning held after re-reading.');
  await page.getByRole('button', { name: /Complete review|完成複盤|完成复盘/, exact: true }).click();
  await expect(page.getByTestId('review-status')).toHaveText(/Reviewed|已複盤|已复盘/);
  const review = await (await page.context().request.get(`/api/diaries/${id}/review`)).json() as { reviewStatus: string; reviewOutcome: string; reviewSummary: string };
  expect(review).toMatchObject({ reviewStatus: 'reviewed', reviewOutcome: 'INTACT', reviewSummary: 'Original reasoning held after re-reading.' });
  const afterReview = await (await page.context().request.get(`/api/diaries/${id}`)).json() as { content: string; thesis: string | null; risk: string | null };
  expect(afterReview.content).toBe(appended.content);
  // The queue stops listing the completed item as due and files it under Completed.
  await page.goto('/reviews');
  await expect(page.getByRole('region', { name: /Overdue|已逾期/, exact: true }).getByTestId('review-queue-item')).toHaveCount(0);
  await page.getByTestId('queue-secondary').locator('summary').click();
  await expect(page.getByRole('region', { name: /Completed|已完成/, exact: true })).toContainText('Release mainline diary');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.locator('main').screenshot({ path: 'docs/design/evidence/core-workflow-rc1/release-queue-consistency.png' });
});

test('built artifacts keep a trade plan linked to its diary without creating trades', async ({ page }) => {
  const email = `release-plan-${randomUUID()}@example.test`;
  // The shared login bucket only allows a few UI logins per minute for the
  // whole suite, so this case authenticates through its own synthetic client.
  expect((await page.context().request.post('/api/auth/register', { headers: freshClient(), data: { email, password } })).status()).toBe(200);
  expect((await page.context().request.post('/api/auth/login', { headers: freshClient(), data: { email, password } })).status()).toBe(200);
  await page.goto('/trade-plans/new');
  await expect(page).toHaveURL(/\/trade-plans\/new$/);
  await selectLocale(page, 'en');
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  const headers = { 'x-csrf-token': csrf };
  const created = await page.context().request.post('/api/diaries', { headers, data: { date: '2026-09-14', title: 'Plan evidence diary', content: 'Original reasoning for the plan.' } });
  expect(created.status()).toBe(201);
  const diary = await created.json() as { id: string };

  // Create the plan through the product entry and link the existing diary.
  await page.getByRole('textbox', { name: 'Symbol', exact: true }).fill('aapl');
  await page.getByRole('textbox', { name: 'Setup', exact: true }).fill('Release plan lifecycle');
  await page.getByRole('textbox', { name: 'Entry price', exact: true }).fill('101.25');
  await page.getByRole('textbox', { name: 'Stop loss', exact: true }).fill('95');
  await page.getByRole('combobox', { name: /Linked diary|關聯日記|关联日记/, exact: true }).selectOption(diary.id);
  await page.getByRole('button', { name: /Save trade plan|儲存交易計劃|保存交易计划/, exact: true }).click();
  await expect(page).toHaveURL(/\/trade-plans\/\d+$/);
  const planId = page.url().split('/').at(-1)!;
  const plan = await (await page.context().request.get(`/api/trade-plans/${planId}`)).json() as { status: string; diaryId: string | null; entryPrice: string | null; symbol: string };
  expect(plan).toMatchObject({ status: 'draft', diaryId: diary.id, entryPrice: '101.25', symbol: 'AAPL' });

  // The linked diary is readable from the plan in both directions.
  await page.getByRole('link', { name: /Read linked diary|閱讀關聯日記|阅读关联日记/ }).click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${diary.id}$`));
  await expect(page.getByRole('heading', { name: 'Plan evidence diary', exact: true })).toBeVisible();

  // Status transitions stay plan-side: no transaction or holding appears.
  await page.goto(`/trade-plans/${planId}`);
  await page.getByRole('combobox', { name: /Status|狀態|状态/, exact: true }).selectOption('active');
  await page.getByRole('button', { name: /Save trade plan|儲存交易計劃|保存交易计划/, exact: true }).click();
  await expect(page.getByText(/Trade plan saved\.|交易計劃已儲存。|交易计划已保存。/, { exact: true })).toBeVisible();
  const activated = await (await page.context().request.get(`/api/trade-plans/${planId}`)).json() as { status: string; diaryId: string | null };
  expect(activated).toMatchObject({ status: 'active', diaryId: diary.id });
  const holdings = await (await page.context().request.get('/api/stocks/holdings')).json() as unknown[];
  expect(holdings).toEqual([]);
  await page.goto('/stocks');
  await expect(page.getByText(/No open holdings|目前沒有持倉|目前没有持仓/)).toBeVisible();
});
