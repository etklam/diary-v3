import { randomUUID } from 'node:crypto';
import { expect, test } from '../support/e2e';

// Narrow-viewport spot check for pages with dense layouts; no real-device claim.
for (const width of [360, 390]) test(`high-risk pages stay inside a ${width}px viewport`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const email = `narrow-${randomUUID()}@example.test`, password = 'synthetic-narrow-password';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Ftimeline');
  await page.getByLabel(/Email|電郵|邮箱/, { exact: true }).fill(email);
  await page.getByLabel(/Password|密碼|密码/, { exact: true }).fill(password);
  await page.getByRole('button', { name: /Sign in|登入|登录/, exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await selectLocaleIfPresent(page);
  for (const path of ['/', '/timeline', '/diaries/new', '/partners/compare', '/calendar', '/reviews']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `horizontal overflow at ${path}`).toBeLessThanOrEqual(width);
  }
  // Long words and long names must not break the comparison columns.
  await page.goto('/partners/compare');
  await expect(page.getByTestId('timeline-modes')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});

async function selectLocaleIfPresent(page: import('@playwright/test').Page) {
  const select = page.getByTestId('locale-select');
  if (await select.isVisible().catch(() => false)) await select.selectOption('en');
}
