import { randomUUID } from 'node:crypto';
import { test, expect, clickNav, selectLocale, selectTheme, signOut, openEditorSection } from '../support/e2e';
for (const width of [1440, 390]) test(`Diary reminders navigation, series dismissal and recovery at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `alerts-${randomUUID()}@example.test`, password = 'synthetic-alerts-password';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  expect((await page.request.put('/api/user/settings', { headers, data: { timezone: 'America/New_York' } })).status()).toBe(200);
  // Out-of-band fixture writes bypass browser resource invalidation; start a fresh document.
  await page.reload();
  const response = await page.request.post('/api/diaries', { headers, data: { title: 'Demand decision', date: '2026-03-02', content: 'Private decision body', alerts: [
    { message: 'Recheck demand', triggerAt: '2026-03-07T12:00:00Z', recurringMode: 'WEEK' },
    { message: 'A separate reminder with enough detail to wrap naturally on a narrow screen', triggerAt: '2020-01-01T09:00:00Z' },
  ] } }); expect(response.status()).toBe(201); const diary = await response.json();
  await clickNav(page, 'Diary reminders');
  const items = page.getByTestId('diary-reminder'); await expect(items).toHaveCount(6);
  await expect(page.locator('main')).toContainText('America/New_York'); await expect(items.nth(1).locator('time')).toContainText('9:00 AM');
  await expect(page.locator('main')).not.toContainText('Private decision body');
  if (width === 390) await selectTheme(page, 'dark');
  await page.locator('main').screenshot({ path: `docs/design/evidence/alerts/${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await items.first().getByRole('link', { name: 'Demand decision' }).click(); await expect(page).toHaveURL(new RegExp(`/diaries/${diary.id}$`));
  await page.goto('/alerts'); await expect(items).toHaveCount(6);
  await page.route('**/api/alerts/*/dismiss', async route => { await route.fetch(); await route.abort('failed'); });
  await items.nth(2).getByRole('button', { name: 'Dismiss reminder', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(items).toHaveCount(6);
  await page.unroute('**/api/alerts/*/dismiss');
  await items.nth(2).getByRole('button', { name: 'Dismiss reminder', exact: true }).click(); await expect(items).toHaveCount(5);
  await page.getByRole('button', { name: 'Dismiss entire series', exact: true }).click(); await expect(items).toHaveCount(1);
  await page.route('**/api/alerts', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'alerts-retry' } }) }));
  await page.reload(); await expect(page.getByTestId('request-id')).toHaveText('alerts-retry'); await page.unroute('**/api/alerts');
  await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(items).toHaveCount(1);
  for (const [locale, title] of [['zh-TW', '日記提醒'], ['zh-CN', '日记提醒'], ['en', 'Diary reminders']] as const) { await selectLocale(page, locale); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); }
  await page.getByRole('button', { name: 'Dismiss reminder', exact: true }).click();
  // The empty list is the project's empty state and names a reachable next
  // action; the pagination bound and the display timezone describe reminders
  // that are no longer on screen, so they leave with them.
  const empty = page.locator('.reminder-list .empty-state');
  await expect(empty).toContainText('No active reminders.');
  await expect(empty.getByRole('button', { name: 'Set a reminder', exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Times shown in');
  await expect(page.locator('main')).not.toContainText('The earliest 100 active reminders');
  await signOut(page); await expect(items).toHaveCount(0); await expect(page.locator('main').getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login?returnTo=%2Falerts');
});

for (const width of [1440, 390]) test(`Diary reminder authoring and preservation at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `alert-editor-${randomUUID()}@example.test`, password = 'synthetic-alert-editor-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
  await page.getByLabel('Diary date', { exact: true }).fill('2026-03-02');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Reminder from the editor');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Revisit this reasoning.');
  await openEditorSection(page, 'reminders');
  await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
  await page.getByLabel('Reminder message', { exact: true }).fill('Read the next report');
  await page.getByLabel('Reminder time', { exact: true }).fill('2026-03-02T12:00');
  await page.getByLabel('Repeat', { exact: true }).selectOption('WEEK');
  await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
  await page.getByLabel('Reminder message', { exact: true }).nth(1).fill('Monthly review');
  await page.getByLabel('Reminder time', { exact: true }).nth(1).fill('2026-03-03T12:00');
  await page.getByLabel('Repeat', { exact: true }).nth(1).selectOption('MONTH');
  await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
  await page.getByLabel('Reminder message', { exact: true }).nth(2).fill('One-off review');
  await page.getByLabel('Reminder time', { exact: true }).nth(2).fill('2026-03-04T12:00');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const path = new URL(page.url()).pathname;
  const original = await (await page.request.get(`/api${path}`)).json();
  expect(original.alerts.some((row: { recurringMode: string | null }) => row.recurringMode === 'WEEK')).toBe(true);
  expect(original.alerts.some((row: { recurringMode: string | null }) => row.recurringMode === 'MONTH')).toBe(true);
  expect(original.alerts.some((row: { message: string; recurringMode: string | null }) => row.message === 'One-off review' && row.recurringMode === null)).toBe(true);
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  const weeklyChild = original.alerts.find((row: { recurringMode: string | null; instanceNumber: number }) => row.recurringMode === 'WEEK' && row.instanceNumber === 2)!;
  expect(weeklyChild).toBeDefined();
  expect((await page.request.put(`/api/alerts/${weeklyChild.id}/dismiss`, { headers })).status()).toBe(200);
  await page.goto(`${path}/edit`); await expect(page.getByLabel('Reminder message', { exact: true })).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Changed title only');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`${path}$`));
  const preserved = await (await page.request.get(`/api${path}`)).json();
  expect(preserved.alerts.map((row: { id: string }) => row.id)).toEqual(original.alerts.map((row: { id: string }) => row.id));
  const preservedWeeklyChild = preserved.alerts.find((row: { id: string }) => row.id === weeklyChild.id)!;
  expect(preservedWeeklyChild).toBeDefined(); expect(preservedWeeklyChild.isDismissed).toBe(true);
  await page.goto(`${path}/edit`); await expect(page.getByLabel('Reminder message', { exact: true })).toHaveCount(3); await expect(page.getByLabel('Reminder message', { exact: true }).first()).toHaveValue('Read the next report');
  if (width === 390) await selectTheme(page, 'dark');
  await page.getByRole('group', { name: 'Diary reminders', exact: true }).screenshot({ path: `docs/design/evidence/alerts/editor-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const index of [3, 2, 1]) await page.getByRole('button', { name: `Remove reminder ${index}`, exact: true }).click();
  await page.getByRole('button', { name: 'Save diary', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`${path}$`));
  expect((await (await page.request.get(`/api${path}`)).json()).alerts).toEqual([]);
});

test.describe('Reminder device timezone boundaries', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('rejects missing DST time, selects the repeated occurrence and retains exact instant on edit', async ({ page, context }) => {
    const email = `alert-dst-${randomUUID()}@example.test`, password = 'synthetic-alert-dst-password';
    await page.request.post('/api/auth/register', { data: { email, password } });
    await page.goto('/login?returnTo=%2Fdiaries%2Fnew'); await selectLocale(page, 'en');
    await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en');
    await page.getByLabel('Diary date', { exact: true }).fill('2026-11-01');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Clock change reminder');
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Synthetic clock test');
    await openEditorSection(page, 'reminders');
    await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
    await page.getByLabel('Reminder message', { exact: true }).fill('Check at the second 01:30');
    await page.getByLabel('Reminder time', { exact: true }).fill('2026-03-08T02:30');
    await page.getByRole('button', { name: 'Save diary', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Check reminder messages and times');
    await expect(page).toHaveURL(/\/diaries\/new$/);
    await page.getByLabel('Reminder time', { exact: true }).fill('2026-11-01T01:30');
    const choices = page.getByLabel('UTC', { exact: true });
    await expect(choices.locator('option')).toHaveText(['—', '2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']);
    await choices.selectOption('2026-11-01T06:30:00.000Z');
    await page.getByRole('button', { name: 'Save diary', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/\d+$/);
    const path = new URL(page.url()).pathname;
    expect((await (await page.request.get(`/api${path}`)).json()).alerts[0].triggerAt).toBe('2026-11-01T06:30:00.000Z');
    const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
    expect((await page.request.put(`/api${path}`, { headers, data: { title: 'Exact instant', content: 'Synthetic', alerts: [{ message: 'Keep fractional second', triggerAt: '2026-11-01T06:30:42.123Z' }] } })).status()).toBe(200);
    await page.goto(`${path}/edit`); await expect(page.getByLabel('UTC', { exact: true })).toHaveValue('2026-11-01T06:30:42.123Z');
    await page.getByLabel('Reminder message', { exact: true }).fill('Changed message, same instant');
    await page.getByRole('button', { name: 'Save diary', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`${path}$`));
    expect((await (await page.request.get(`/api${path}`)).json()).alerts[0]).toMatchObject({ message: 'Changed message, same instant', triggerAt: '2026-11-01T06:30:42.123Z' });
  });
});

// Ticket 108: the page is named for reminders, so it has to be able to make
// one. Creation stays attached to a diary — the reminder belongs to the
// decision — and the page states that by requiring the diary to be chosen
// here rather than by sending the reader to the editor.
for (const width of [1440, 390]) test(`Diary reminders creation, overdue marking and first-use state at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `alerts-create-${randomUUID()}@example.test`, password = 'synthetic-alerts-create-password';
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Falerts'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/alerts$/); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };

  // With no diary written there is nothing to attach a reminder to, so the
  // create region names that precondition instead of offering a dead form.
  const createRegion = page.locator('.reminder-create');
  await expect(createRegion.locator('.empty-state')).toContainText('A reminder belongs to a diary');
  await expect(createRegion.getByRole('link', { name: 'Write a diary', exact: true })).toHaveAttribute('href', '/diaries/new');
  await expect(page.locator('.reminder-list .empty-state').getByRole('link', { name: 'Write a diary', exact: true })).toBeVisible();

  const diary = await page.request.post('/api/diaries', { headers, data: { title: 'Position review decision', date: '2026-03-02', content: 'Private decision body' } });
  expect(diary.status()).toBe(201); const diaryId = (await diary.json()).id as string;
  await page.reload();

  // The empty list's next action leads to the form on this page, in one step.
  await page.locator('.reminder-list .empty-state').getByRole('button', { name: 'Set a reminder', exact: true }).click();
  await expect(page.getByLabel('Diary', { exact: true })).toBeFocused();

  await page.getByLabel('Diary', { exact: true }).selectOption(diaryId);
  await page.getByLabel('Reminder time', { exact: true }).fill('2027-05-04T09:30');
  await page.getByLabel('Reminder message', { exact: true }).fill('Check whether the thesis still holds');
  await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
  await expect(page.locator('main')).toContainText('Reminder added.');
  const items = page.getByTestId('diary-reminder');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Check whether the thesis still holds');
  await expect(page.locator('[data-overdue="true"]')).toHaveCount(0);
  // The bound and the display timezone belong to a list that has content.
  await expect(page.locator('.reminder-list')).toContainText('Times shown in');
  await expect(page.locator('.reminder-list')).toContainText('The earliest 100 active reminders');

  expect((await page.request.post('/api/alerts', { headers, data: { diaryId, message: 'Overdue since the start of the year', triggerAt: '2020-01-01T09:00:00Z' } })).status()).toBe(200);
  await page.reload();
  await expect(items).toHaveCount(2);
  const overdue = page.locator('[data-overdue="true"]');
  await expect(overdue).toHaveCount(1);
  await expect(overdue).toContainText('Overdue');
  await expect(overdue).toContainText('Overdue since the start of the year');
  // Earliest first, so the overdue reminder leads the list.
  await expect(items.first()).toHaveAttribute('data-overdue', 'true');
  await expect(items.nth(1)).not.toHaveAttribute('data-overdue', 'true');

  if (width === 390) await selectTheme(page, 'dark');
  await page.locator('main').screenshot({ path: `docs/design/evidence/alerts/create-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  for (const [locale, heading] of [['zh-TW', '設定提醒'], ['zh-CN', '设置提醒'], ['en', 'Set a reminder']] as const) {
    await selectLocale(page, locale);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});
