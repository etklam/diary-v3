import { test, expect, clickNav, selectLocale, selectTheme } from '../support/e2e';

const locales = [
  { value: 'en', overview: 'Overview', company: 'Company research', review: 'Review' },
  { value: 'zh-TW', overview: '總覽', company: '公司研究', review: '複盤' },
  { value: 'zh-CN', overview: '总览', company: '公司研究', review: '复盘' },
];

test('representative design supports languages, keyboard selection, themes and narrow reflow', async ({ page }) => {
  await page.goto('/design-preview');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
    for (const locale of locales) {
      await selectLocale(page, locale.value);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.value);
      await page.getByTestId('preview-empty').check();
      await expect(page.locator('main [role=status]:visible')).toBeVisible();
      await page.getByTestId('preview-empty').uncheck();
      for (const surface of ['company', 'review', 'overview'] as const) {
        const button = page.getByRole('button', { name: locale[surface], exact: true });
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('main h1:visible')).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (width !== 320 && locale.value === 'en' && surface !== 'overview') {
          await selectTheme(page, width < 500 ? 'dark' : 'light');
          await page.screenshot({ path: `test-results/${surface}-${width}.png`, fullPage: true });
        }
      }
    }
  }
  await selectLocale(page, 'en');
  await selectTheme(page, 'dark');
  await page.reload();
  await expect(page.getByTestId('theme-select')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await clickNav(page, 'Start');
  await expect(page.locator('.public-header').getByRole('link', { name: 'Start', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main')).toBeFocused();
});
