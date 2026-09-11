import { randomUUID } from 'node:crypto';
import { decodeJwt, SignJWT } from 'jose';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test, selectLocale, signOut } from '../support/e2e';

const password = 'web-e2e-synthetic-password';
async function account(page: Page) {
  const email = `web-${randomUUID()}@example.test`;
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await selectLocale(page, 'en');
  await login(page, email);
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toBeVisible();
  return email;
}
async function login(page: Page, email: string, submittedPassword = password) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(submittedPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function expireAccess(context: BrowserContext) {
  const access = (await context.cookies()).find(cookie => cookie.name === 'access-token');
  expect(access?.httpOnly).toBe(true);
  if (!access) throw new Error('Synthetic test account has no access cookie');
  // This secret belongs only to scripts/e2e-server.ts and its disposable database.
  const token = await new SignJWT(decodeJwt(access.value)).setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode('e2e-only-diary-secret-never-use-this-in-production'));
  await context.addCookies([{ ...access, value: token }]);
}
async function saveDiary(page: Page, title: string) {
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-05');
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Synthetic private reasoning, visible only to this account.');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return page.url();
}

test('expired access recovers while saving a draft and on reload without rotating refresh', async ({ page, context }) => {
  await account(page);
  const refreshBefore = (await context.cookies()).find(cookie => cookie.name === 'refresh-token');
  expect(refreshBefore?.httpOnly).toBe(true);
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-05');
  await page.getByLabel('Title', { exact: true }).fill('Preserve this draft through expiry');
  const draft = 'This draft was typed before access expired. Its exact text must survive recovery.';
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(draft);
  await expireAccess(context);
  const recovered = page.waitForResponse(response => response.url().endsWith('/api/diaries') && response.status() === 201);
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  expect((await (await recovered).allHeaders())['set-cookie']).toContain('access-token=');
  await expect(page.getByRole('heading', { name: 'Preserve this draft through expiry' })).toBeVisible();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
  expect((await context.cookies()).find(cookie => cookie.name === 'refresh-token')?.value).toBe(refreshBefore?.value);
  await expireAccess(context);
  const reloadRecovery = page.waitForResponse(async response => response.url().includes('/api/') && response.status() === 200 && Boolean((await response.allHeaders())['set-cookie']?.includes('access-token=')));
  await page.reload();
  await reloadRecovery;
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
  await expect(page.getByTestId('sign-out')).toBeVisible();
  expect((await context.cookies()).find(cookie => cookie.name === 'refresh-token')?.value).toBe(refreshBefore?.value);
});

test('sign-out clears private views across tabs and a later visit cannot recover the old account', async ({ page, context }) => {
  await account(page);
  const title = 'Private decision for cross-tab logout';
  const diaryUrl = await saveDiary(page, title);
  const other = await context.newPage();
  await other.goto(diaryUrl);
  await expect(other.getByRole('heading', { name: title })).toBeVisible();
  await expect(other.getByTestId('sign-out')).toBeVisible();
  const logout = page.waitForResponse(response => response.url().endsWith('/api/auth/logout'));
  await signOut(page);
  expect((await logout).status()).toBe(200);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(other).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByText('Synthetic private reasoning, visible only to this account.', { exact: true })).toHaveCount(0);
  await expect(other.getByText('Synthetic private reasoning, visible only to this account.', { exact: true })).toHaveCount(0);
  expect((await context.cookies()).filter(cookie => ['access-token', 'refresh-token'].includes(cookie.name))).toEqual([]);
  await other.goto(diaryUrl);
  await expect(other.getByRole('heading', { name: title })).toHaveCount(0);
  await expect(other.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await other.close();
});

test('failed login preserves the return context', async ({ page }) => {
  const email = await account(page);
  const title = 'Return to this private decision';
  const diaryUrl = await saveDiary(page, title);
  const diaryPath = new URL(diaryUrl).pathname;
  const logout = page.waitForResponse(response => response.url().endsWith('/api/auth/logout'));
  await signOut(page);
  await logout;
  await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=${encodeURIComponent(diaryPath)}$`));
  await login(page, email, 'incorrect-synthetic-password');
  await expect(page.getByTestId('error-code')).toHaveText('AUTH_LOGIN_INVALID_CREDENTIALS');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await expect(page.getByTestId('api-error')).toBeFocused();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await login(page, email);
  await expect(page).toHaveURL(diaryUrl);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('external return destinations are rejected', async ({ page }) => {
  const email = `external-${randomUUID()}@example.test`;
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=https%3A%2F%2Foutside.example%2Fsteal');
  await selectLocale(page, 'en');
  await login(page, email);
  await expect(page).toHaveURL('http://127.0.0.1:3200/diaries/new');
});
