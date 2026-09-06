import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale, selectTheme, signOut } from '../support/e2e';
for (const width of [1440, 390]) test(`foreground reminders recover and remain unique at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `foreground-${randomUUID()}@example.test`, password = 'synthetic-foreground-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  const connected = page.waitForEvent('websocket', socket => socket.url().includes('/socket.io/'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en'); await connected;
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  const source = await (await page.request.post('/api/diaries', { headers, data: { title: 'Foreground decision', content: 'Synthetic private content', date: '2026-03-02' } })).json();
  const triggerAt = new Date(Date.now() + 3500).toISOString();
  expect((await page.request.post('/api/alerts', { headers, data: { diaryId: source.id, message: 'Due while the page is open', triggerAt } })).status()).toBe(200);
  const notice = page.getByRole('complementary', { name: 'Due reminders', exact: true });
  await expect(notice.getByRole('status')).toHaveText('Due reminders: 1', { timeout: 12_000 });
  await page.reload(); await expect(notice.getByRole('status')).toHaveText('Due reminders: 1');
  await expect(notice).not.toContainText('Synthetic private content');
  if (width === 390) await selectTheme(page, 'dark');
  await notice.screenshot({ path: `docs/design/evidence/alerts/foreground-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await notice.getByRole('link', { name: 'View reminders', exact: true }).click(); await expect(page).toHaveURL(/\/alerts$/);
  await page.getByRole('button', { name: 'Dismiss reminder', exact: true }).click(); await expect(notice).toHaveCount(0);
  await signOut(page); await expect(notice).toHaveCount(0);
});

test('server-side account revocation clears the foreground notice and returns to login', async ({ page, context }) => {
  const email = `foreground-revoke-${randomUUID()}@example.test`, password = 'synthetic-foreground-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  const socket = page.waitForEvent('websocket', connection => connection.url().includes('/socket.io/'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await selectLocale(page, 'en'); await socket;
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  expect((await page.request.post('/api/diaries', { headers, data: { title: 'Revoked reminder', content: 'Synthetic private content', date: '2026-03-02', alerts: [{ message: 'Private due reminder', triggerAt: '2020-01-01T00:00:00Z' }] } })).status()).toBe(201);
  await page.reload();
  const notice = page.getByRole('complementary', { name: 'Due reminders', exact: true });
  await expect(notice.getByRole('status')).toHaveText('Due reminders: 1');
  expect((await page.request.post('/api/auth/logout-all', { headers, data: {} })).status()).toBe(200);
  await expect(notice).toHaveCount(0); await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

for (const width of [1440, 390]) test(`price trigger hints restore authoritative state at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 });
  const email = `price-foreground-${randomUUID()}@example.test`, password = 'synthetic-foreground-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  const connected = page.waitForEvent('websocket', socket => socket.url().includes('/socket.io/'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/); await connected; await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  const created = await page.request.post('/api/stocks/alerts', { headers, data: { symbol: 'FOREGROUND', type: 'PRICE_ABOVE', threshold: '100', message: 'Synthetic private price message' } });
  expect(created.ok()).toBe(true);
  const notice = page.getByRole('complementary', { name: 'Triggered price alerts', exact: true });
  await expect(notice.getByRole('status')).toHaveText('Triggered price alerts: 1', { timeout: 12_000 });
  await page.reload(); await expect(notice.getByRole('status')).toHaveText('Triggered price alerts: 1');
  await expect(notice).not.toContainText('Synthetic private price message');
  await notice.screenshot({ path: `docs/design/evidence/price-alerts/foreground-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await notice.getByRole('link', { name: 'View price alerts', exact: true }).click(); await expect(page).toHaveURL(/\/stocks\/alerts$/);
  await page.getByRole('button', { name: 'Delete reminder', exact: true }).click(); await expect(notice).toHaveCount(0);
  await signOut(page); await expect(notice).toHaveCount(0);
});

test('transport reconnect restores an alert triggered while the browser is offline', async ({ page, context }) => {
  let closeTransport: (() => Promise<void>) | undefined;
  let connections = 0;
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer(); connections++;
    closeTransport = async () => { await socket.close({ code: 1012, reason: 'Synthetic transport interruption' }); await server.close(); };
  });
  const email = `offline-price-${randomUUID()}@example.test`, password = 'synthetic-foreground-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en'); await expect.poll(() => connections).toBeGreaterThan(0);
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  await context.setOffline(true); await closeTransport!();
  // APIRequestContext uses its own network stack: the browser remains offline.
  const created = await page.request.post('/api/stocks/alerts', { headers, data: { symbol: 'FOREGROUND', type: 'PRICE_ABOVE', threshold: '100' } });
  expect(created.ok()).toBe(true); const alert = await created.json();
  await expect.poll(async () => (await (await page.request.get('/api/stocks/alerts')).json()).find((row: { id: string }) => row.id === alert.id)?.isTriggered).toBe(true);
  const notice = page.getByRole('complementary', { name: 'Triggered price alerts', exact: true });
  await expect(notice).toHaveCount(0);
  const before = connections;
  await context.setOffline(false);
  await expect.poll(() => connections, { timeout: 15_000 }).toBeGreaterThan(before);
  await expect(notice.getByRole('status')).toHaveText('Triggered price alerts: 1');
  await signOut(page); await expect(notice).toHaveCount(0);
});

test('visibility restoration reconnects and restores a reminder missed while hidden', async ({ page, context }) => {
  let connections = 0;
  let closed = 0;
  page.on('websocket', socket => {
    if (!socket.url().includes('/socket.io/')) return;
    connections++;
    socket.on('close', () => { closed++; });
  });
  const email = `visibility-${randomUUID()}@example.test`, password = 'synthetic-foreground-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en'); await expect.poll(() => connections).toBeGreaterThan(0);

  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => closed).toBeGreaterThan(0);

  const triggerAt = new Date(Date.now() + 1500).toISOString();
  const created = await page.request.post('/api/diaries', {
    headers,
    data: { title: 'Hidden reminder', content: 'Synthetic private content', date: '2026-03-02', alerts: [{ message: 'Hidden due reminder', triggerAt }] },
  });
  expect(created.status()).toBe(201);
  const notice = page.getByRole('complementary', { name: 'Due reminders', exact: true });
  await page.waitForTimeout(2500);
  await expect(notice).toHaveCount(0);

  const before = connections;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => connections).toBeGreaterThan(before);
  await expect(notice.getByRole('status')).toHaveText('Due reminders: 1', { timeout: 10_000 });
  await expect(notice).not.toContainText('Synthetic private content');
  await signOut(page); await expect(notice).toHaveCount(0);
});
