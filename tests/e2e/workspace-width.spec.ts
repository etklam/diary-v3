import { randomUUID } from 'node:crypto';
import { test, expect, selectAccountLocale, selectLocale } from '../support/e2e';

const adminEmail = 'etf-admin@example.test';
const adminPassword = 'synthetic-etf-admin-password';

/**
 * Ticket 93. Two failures, not one: pages that left a wide empty region on the
 * right at 1440 (the diary record, both authoring paths, the article editor),
 * and pages with no cap at all that stretched across an ultrawide workspace
 * (the library and the timeline). This measures both ends.
 */
async function usedWidth(page: import('@playwright/test').Page) {
 return page.evaluate(() => {
  const main = document.querySelector('main');
  if (!main) return { main: 0, used: 0 };
  const box = main.getBoundingClientRect();
  let right = box.left;
  for (const node of main.querySelectorAll('*')) {
   const rect = node.getBoundingClientRect();
   if (rect.width < 2 || rect.height < 2) continue;
   const style = getComputedStyle(node);
   if (style.visibility === 'hidden' || style.display === 'none') continue;
   if (rect.right > right && rect.right <= box.right + 1) right = rect.right;
  }
  return { main: Math.round(box.width), used: Math.round(right - box.left) };
 });
}

test('workspace pages use the desktop width they are given and stop at the data-page cap', async ({ page }) => {
 const email = `workspace-width-${randomUUID()}@example.test`, password = 'synthetic-width-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fdiaries'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries$/);
 await selectAccountLocale(page, 'en');
 const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
 const created = await page.request.post('/api/diaries', { headers: { 'x-csrf-token': csrf }, data: { date: '2026-05-04', title: 'Workspace width diary', content: 'Recorded reasoning.\n\n'.repeat(12), tags: ['width', 'audit'], thesis: 'The thesis at the time.', stockSymbols: ['NVDA'] } });
 expect(created.status()).toBe(201);
 const diary = await created.json() as { id: string };
 const routes = ['/diaries', `/diaries/${diary.id}`, `/diaries/${diary.id}/edit`, '/diaries/new', '/timeline'];

 await page.setViewportSize({ width: 1440, height: 900 });
 for (const route of routes) {
  await page.goto(route);
  await expect(page.locator('main h1')).toBeVisible();
  const { main, used } = await usedWidth(page);
  expect(main - used, `${route} leaves unused width at 1440`).toBeLessThanOrEqual(64);
 }

 // 1920: every workspace page stops at the documented 1280px data width.
 await page.setViewportSize({ width: 1920, height: 900 });
 for (const route of routes) {
  await page.goto(route);
  await expect(page.locator('main h1')).toBeVisible();
  const { used } = await usedWidth(page);
  expect(used, `${route} exceeds the data-page cap at 1920`).toBeLessThanOrEqual(1312);
 }

 // Evidence: the record page at wide desktop, standard desktop and mobile.
 for (const [width, height] of [[1920, 1080], [1440, 900], [390, 844]] as const) {
  await page.setViewportSize({ width, height });
  await page.goto(`/diaries/${diary.id}`);
  await expect(page.locator('main h1')).toBeVisible();
  await page.screenshot({ path: `docs/design/evidence/workspace-width/diary-record-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }

 await page.request.post('/api/auth/login', { data: { email: adminEmail, password: adminPassword } });
 for (const [width, height] of [[1920, 1080], [1440, 900], [390, 844]] as const) {
  await page.setViewportSize({ width, height });
  await page.goto('/admin/blog/new');
  await expect(page.locator('.article-editor-fields textarea').first()).toBeVisible();
  await page.screenshot({ path: `docs/design/evidence/workspace-width/article-editor-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
});
