import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const password = 'synthetic-release-smoke-password';
const freshClient = () => {
  const octets = randomUUID().replaceAll('-', '').slice(0, 6).match(/.{2}/g)!.map(value => Number.parseInt(value, 16));
  return { 'x-forwarded-for': `10.${octets.join('.')}` };
};

test('API health and readiness plus public Web routing @release-smoke', async ({ page, request }) => {
  expect((await request.get('/healthz')).status()).toBe(200);
  expect((await request.get('/readyz')).status()).toBe(200);
  expect((await request.get('/api/auth/me')).status()).toBe(401);
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
});

test('built Web authenticates against the built API @release-smoke', async ({ page, request }) => {
  const email = `release-smoke-${randomUUID()}@example.test`;
  expect((await request.post('/api/auth/register', { headers: freshClient(), data: { email, password } })).status()).toBe(200);

  await page.context().setExtraHTTPHeaders(freshClient());
  await page.goto('/login?returnTo=%2Fdiaries');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(email);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries$/);
  expect((await page.context().request.get('/api/auth/me')).status()).toBe(200);
});

test('built artifacts create and read an authenticated Diary @release-smoke', async ({ page, request }) => {
  const email = `release-smoke-${randomUUID()}@example.test`;
  const headers = freshClient();
  expect((await request.post('/api/auth/register', { headers, data: { email, password } })).status()).toBe(200);

  await page.context().setExtraHTTPHeaders(headers);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(email);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);

  await page.getByLabel(/Diary date|日記日期|日记日期/, { exact: true }).fill('2026-10-09');
  await page.getByRole('textbox', { name: /Title|標題|标题/, exact: true }).fill('Release smoke diary');
  await page.getByRole('textbox', { name: /Content|內容|内容/, exact: true }).fill('Created through the release Docker images.');
  await page.getByRole('button', { name: /Save diary|儲存日記|保存日记/, exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);

  const id = page.url().split('/').at(-1)!;
  const response = await page.context().request.get(`/api/diaries/${id}`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    id,
    date: '2026-10-09',
    title: 'Release smoke diary',
    content: 'Created through the release Docker images.',
  });
});
