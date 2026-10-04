import { randomUUID } from 'node:crypto';
import { test, expect, selectAccountLocale, selectLocale, selectTheme } from '../support/e2e';

/**
 * Ticket 95. A native select is only ever as wide as its longest option; the
 * workspace used to stretch every one of them to its column, which stranded the
 * value at one end and the platform arrow at the other. These routes carry the
 * selects the audit found widest (986px for 174px of options on `/diaries`).
 * The sidebar preference column opts back into a full-width select on purpose,
 * so it is excluded by its wrapper class.
 */
const routes = ['/settings', '/diaries', '/stocks/alerts', '/diaries/quick'];

async function overWideSelects(page: import('@playwright/test').Page) {
 return page.evaluate(() => [...document.querySelectorAll('select')]
  .filter(node => !node.closest('.preferences') && node.getBoundingClientRect().width > 0)
  .map(node => {
   const clone = node.cloneNode(true) as HTMLSelectElement;
   clone.style.cssText = 'position:absolute;visibility:hidden;width:max-content;max-width:none';
   node.parentElement?.appendChild(clone);
   const natural = clone.getBoundingClientRect().width;
   clone.remove();
   const label = node.labels?.[0]?.textContent?.trim() ?? node.getAttribute('aria-label') ?? node.id;
   return { label, width: Math.round(node.getBoundingClientRect().width), natural: Math.round(natural) };
  })
  .filter(row => row.width - row.natural > 24));
}

test('dropdown controls stay the width of their own options', async ({ page }) => {
 const email = `dropdown-${randomUUID()}@example.test`, password = 'synthetic-dropdown-password';
 await page.request.post('/api/auth/register', { data: { email, password } });
 await page.goto('/login?returnTo=%2Fsettings'); await selectLocale(page, 'en');
 await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
 await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/settings$/);
 await selectAccountLocale(page, 'en');
 // 720px stands in for 1440 at 200% zoom: the same CSS pixels, half the room.
 for (const width of [1440, 720, 390]) {
  await page.setViewportSize({ width, height: 900 });
  for (const route of routes) {
   await page.goto(route);
   await expect(page.locator('main select').first()).toBeVisible();
   expect(await overWideSelects(page), `${route} at ${width}px`).toEqual([]);
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} at ${width}px`).toBe(true);
  }
 }
 // Longer localized option labels must not clip or push the page sideways.
 await selectLocale(page, 'zh-TW');
 for (const route of routes) {
  await page.goto(route);
  await expect(page.locator('main select').first()).toBeVisible();
  expect(await overWideSelects(page), `${route} in zh-TW`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} in zh-TW`).toBe(true);
 }
 await selectLocale(page, 'en');
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.goto('/diaries');
 await expect(page.getByRole('heading', { name: 'Diary library', exact: true })).toBeVisible();
 await page.locator('main').screenshot({ path: 'docs/design/evidence/dropdowns/library-1440.png' });
 await page.setViewportSize({ width: 390, height: 900 });
 await selectTheme(page, 'dark');
 await page.goto('/stocks/alerts');
 await expect(page.getByRole('heading', { name: 'Price reminders', exact: true })).toBeVisible();
 await expect(page.getByLabel('Condition', { exact: true })).toBeVisible();
 await page.locator('main').screenshot({ path: 'docs/design/evidence/dropdowns/price-alerts-390.png' });
});

test('the public tool shortcuts menu stays anchored and inside the viewport', async ({ page }) => {
 for (const width of [1440, 1024]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/'); await selectLocale(page, 'en');
  const trigger = page.getByRole('button', { name: 'Tool shortcuts', exact: true });
  await trigger.click();
  const panel = page.locator('#tools-shortcuts');
  await expect(panel).toBeVisible();
  const fits = await panel.evaluate(node => {
   const rect = node.getBoundingClientRect();
   return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  });
  expect(fits, `tool shortcuts at ${width}px`).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 1440) await page.locator('.public-header').screenshot({ path: 'docs/design/evidence/dropdowns/tool-shortcuts-1440.png' });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
 }
});
