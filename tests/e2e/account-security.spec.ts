import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect, selectLocale, selectTheme } from '../support/e2e';

const password = 'synthetic-security-password';
async function login(page: Page, email: string, value = password) {
  await page.goto('/login');
  await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function account(page: Page) {
  const email = `security-${randomUUID()}@example.test`;
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await login(page, email);
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');
  await expect(page.getByLabel('Content', { exact: true })).toBeVisible();
  await page.goto('/settings/security');
  await expect(page.getByLabel('Current password', { exact: true })).toBeVisible();
  return email;
}

test('password validation preserves masked inputs; changing password clears every open private view and requires the new password', async ({ page, context }) => {
  const email = await account(page);
  const other = await context.newPage();
  await other.goto('/diaries/new');
  await expect(other.getByLabel('Content', { exact: true })).toBeVisible();
  const next = 'new-synthetic-security-password';
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password', { exact: true }).fill('mismatched-confirmation');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(next);
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Confirm new password', { exact: true }).fill(next);
  const changed = page.waitForResponse(response => response.url().endsWith('/api/user/password'));
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  expect((await changed).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Password changed');
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  await expect(other.getByLabel('Content', { exact: true })).toHaveCount(0);
  await login(page, email, password);
  await expect(page.getByTestId('error-code')).toHaveText('AUTH_LOGIN_INVALID_CREDENTIALS');
  await page.getByLabel('Password', { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Content', { exact: true })).toBeVisible();
  await other.close();
});

test('wrong current password preserves the form; all-device logout clears the form and private tabs', async ({ page, context }) => {
  await account(page);
  await page.getByLabel('Current password', { exact: true }).fill('wrong-current-password');
  await page.getByLabel('New password', { exact: true }).fill('synthetic-new-password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('synthetic-new-password');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('current password');
  await expect(page.getByTestId('error-code')).toHaveText('AUTH_LOGIN_INVALID_CREDENTIALS');
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('wrong-current-password');
  const other = await context.newPage();
  await other.goto('/diaries/new');
  await expect(other.getByLabel('Content', { exact: true })).toBeVisible();
  const response = page.waitForResponse(result => result.url().endsWith('/api/auth/logout-all'));
  await page.getByRole('button', { name: 'Sign out all devices', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Every device has been signed out');
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
  await expect(other.getByLabel('Content', { exact: true })).toHaveCount(0);
  await other.close();
});

test('account security remains readable in three languages, both themes, and a narrow viewport', async ({ page }) => {
  await account(page);
  for (const [locale, title] of [['zh-TW', '帳戶安全'], ['zh-CN', '账户安全'], ['en', 'Account security']]) {
    await selectLocale(page, locale!);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await selectTheme(page, 'light');
  await page.screenshot({ path: '.impeccable/review/security-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await selectTheme(page, 'dark');
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '.impeccable/review/security-mobile.png', fullPage: true });
});
