import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

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
