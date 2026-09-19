import { randomUUID } from 'node:crypto';
import { expect, test, selectLocale, selectTheme } from '../support/e2e';

for (const width of [1440, 390]) test(`Calendar uses US market closures for both account timezones at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date('2026-04-06T03:00:00Z'));
  const email = `calendar-${randomUUID()}@example.test`;
  const password = 'synthetic-calendar-password';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');

  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  const timezone = width === 1440 ? 'Asia/Taipei' : 'America/New_York';
  expect((await page.request.put('/api/user/settings', { headers: { 'x-csrf-token': csrf }, data: { timezone, excludeHolidaysInStats: true } })).status()).toBe(200);
  let weekendDiaryId = '';
  for (const date of ['2026-04-03', '2026-04-04', '2026-04-06']) {
    const response = await page.request.post('/api/diaries', {
      headers: { 'x-csrf-token': csrf },
      data: { date, title: `The reasoning on ${date}`, content: 'Synthetic evidence.', transactions: date === '2026-04-04' ? [{ symbol: 'AAPL', type: 'BUY', quantity: '1', price: '10', tradeDate: '2026-04-04T15:00:00Z' }] : [] },
    });
    expect(response.status()).toBe(201);
    const entry = await response.json();
    if (date === '2026-04-04') weekendDiaryId = entry.id;
  }

  const holidayRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/holidays')) holidayRequests.push(request.url()); });
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'April 2026', exact: true })).toBeVisible();
  expect(holidayRequests).toEqual([]);
  await expect(page.getByTestId('coverage')).toHaveText('5%');
  await expect(page.locator('.calendar-grid [aria-current=date]')).toHaveAttribute('data-date', width === 1440 ? '2026-04-06' : '2026-04-05');
  await expect(page.locator('.calendar-grid [data-date="2026-04-04"]')).toHaveAccessibleName(/1 transactions/);
  await expect(page.locator('[data-heatdate]')).toHaveCount(371);
  const latest = await page.locator(`[data-heatdate="${width === 1440 ? '2026-04-06' : '2026-04-05'}"]`).boundingBox();
  expect(latest!.x + latest!.width).toBeLessThanOrEqual(width);
  await page.locator('.calendar-grid [data-date="2026-04-04"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.calendar-grid [data-date="2026-04-05"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.calendar-grid [data-date="2026-04-12"]')).toBeFocused();

  await expect(page.locator('.calendar-grid [data-date="2026-04-03"]')).toHaveClass(/holiday/);
  await expect(page.locator('.calendar-grid [data-date="2026-04-03"]')).toHaveAccessibleName(/US market closed/);
  await expect(page.locator('.calendar-grid [data-date="2026-04-04"]')).toHaveClass(/recorded/);
  await expect(page.locator('.calendar-grid [data-date="2026-04-04"]')).toHaveClass(/holiday/);
  await expect(page.locator('[data-heatdate="2026-04-04"]')).toHaveAccessibleName(/US market closed/);
  await expect(page.getByText('US market weekends and full closures excluded; early-close half-days remain eligible', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'March 2026', exact: true })).toBeVisible();
  await expect(page.getByText('No diaries recorded this month.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-heatdate="2026-04-03"]')).toHaveAccessibleName(/US market closed/);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByTestId('coverage')).toHaveText('5%');
  await page.locator('.calendar-grid [data-date="2026-04-04"]').click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${weekendDiaryId}$`));
  await page.goto('/calendar');
  await page.locator('.calendar-grid [data-date="2026-04-07"]').click();
  await expect(page).toHaveURL(/\/diaries\/quick\?date=2026-04-07$/);
  await expect(page.getByLabel('Diary date', { exact: true })).toHaveValue('2026-04-07');
  await page.goto('/calendar');
  await page.getByLabel('Month', { exact: true }).fill('2024-03');
  await expect(page.getByRole('heading', { name: 'March 2024', exact: true })).toBeVisible();
  await expect(page.getByTestId('coverage')).toHaveText('—');
  await expect(page.getByText('US market closure data is available for 2025–2028 only. Coverage is unavailable for this month; diary dates remain accessible.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-heatdate="2026-04-03"]')).toHaveAccessibleName(/US market closed/);
  await page.getByLabel('Month', { exact: true }).fill('2026-04');
  await expect(page.getByTestId('coverage')).toHaveText('5%');

  if (width === 390) await selectTheme(page, 'dark');
  await page.screenshot({ path: `.impeccable/review/calendar-market-${width}.png`, fullPage: true });
  await page.clock.setFixedTime(new Date('2025-06-10T15:00:00Z'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'June 2025', exact: true })).toBeVisible();
  await expect(page.getByTestId('coverage')).toHaveText('0%');
  await expect(page.getByText('This 371-day range includes an unsupported year. No partial US market closure exclusions are applied.', { exact: true })).toBeVisible();
  await expect(page.locator('.calendar-grid [data-date="2025-06-07"]')).toHaveClass(/holiday/);
  await expect(page.locator('[data-heatdate="2025-06-07"]')).not.toHaveClass(/holiday/);
  await expect(page.locator('[data-heatdate="2025-06-07"]')).not.toHaveAccessibleName(/US market closed/);
  await page.clock.setFixedTime(new Date('2026-04-06T03:00:00Z'));
  await page.request.put('/api/user/settings', { headers: { 'x-csrf-token': csrf }, data: { excludeHolidaysInStats: false } });
  await page.reload();
  await expect(page.getByTestId('coverage')).toHaveText('10%');
  await expect(page.getByText('All calendar days included', { exact: true })).toBeVisible();
  expect(holidayRequests).toEqual([]);
  await page.locator('.calendar-grid [data-date="2026-04-04"]').click();
  await expect(page).toHaveURL(new RegExp(`/diaries/${weekendDiaryId}$`));
  await expect(page.getByRole('heading', { name: 'The reasoning on 2026-04-04', exact: true })).toBeVisible();

  await page.goto('/calendar');
  const selectedNav = width === 1440 ? page.locator('.desktop-nav') : page.getByTestId('mobile-diary-navigation');
  await expect(selectedNav.getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page');
  if (width === 1440) {
    await expect(page.locator('.desktop-nav a[aria-current=page]')).toHaveCount(1);
    await expect(page.locator('.desktop-nav a[aria-current=page]')).toHaveText('Calendar');
  } else {
    await page.getByTestId('mobile-menu').click();
    await expect(page.getByTestId('mobile-menu-dialog')).toBeVisible();
    await expect(page.locator('.mobile-menu-dialog nav a[aria-current=page]')).toHaveCount(0);
    await expect(selectedNav.getByRole('link', { name: 'Calendar', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-menu-dialog')).toBeHidden();
    await expect(page.getByTestId('mobile-menu')).toBeFocused();
  }
  if (width === 390) await selectTheme(page, 'dark');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: `.impeccable/review/calendar-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  for (const [locale, heading] of [['zh-TW', '日記月曆'], ['zh-CN', '日记月历'], ['en', 'Diary calendar']] as const) {
    await selectLocale(page, locale);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});
