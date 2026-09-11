import { randomUUID } from 'node:crypto';
import { test, expect, clickNav, selectLocale, signOut } from '../support/e2e';

test('Library clears private rows on local logout and recovers through sign in', async ({ page, context }) => {
  const email = `library-session-${randomUUID()}@example.test`, password = 'synthetic-library-session';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');
  const csrf = (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  expect((await page.request.post('/api/diaries', { headers: { 'x-csrf-token': csrf }, data: { date: '2026-09-01', title: 'Private recovery evidence', content: 'Owner-only library record' } })).status()).toBe(201);
  await clickNav(page, 'Diary library');
  await expect(page.getByRole('link', { name: 'Private recovery evidence', exact: true })).toBeVisible();
  await signOut(page);
  await expect(page.locator('.diary-records > li')).toHaveCount(0);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries$/);
  await expect(page.getByRole('link', { name: 'Private recovery evidence', exact: true })).toBeVisible();
});
