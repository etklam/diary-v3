import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app';
import { provisionTestDatabase } from '../support/database';
import { BrowserSession } from '../support/browser-session';

let database: Awaited<ReturnType<typeof provisionTestDatabase>>;
let server: ReturnType<typeof serve>;
let baseUrl: string;
beforeAll(async () => { database = await provisionTestDatabase('diary_v3_settings'); });
beforeEach(async () => {
  const app = createApp({ db: database.db, config: {
    jwtSecret: 'settings-tests-only-secret-with-over-32-characters', nodeEnv: 'test',
    trustProxy: false, webOrigin: 'http://127.0.0.1',
  } });
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); });
afterAll(async () => { await database?.dispose(); });
async function account() {
  const browser = new BrowserSession(baseUrl);
  const credentials = { email: `${randomUUID()}@example.test`, password: 'settings-test-password' };
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200);
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200);
  expect((await browser.request('/api/user/settings')).status).toBe(200);
  return { browser, credentials };
}
function update(browser: BrowserSession, body: unknown, csrf = true) {
  return browser.request('/api/user/settings', {
    method: 'PUT', headers: { 'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': browser.cookies.get('csrf-token')! } : {}),
    }, body: JSON.stringify(body),
  });
}

describe('user settings HTTP and PostgreSQL round trips', () => {
  it('persists locale, timezone, exact decimal strings and zero across logout and login without exposing another account', async () => {
    const { browser, credentials } = await account();
    const other = await account();
    const input = { name: ' Investor ', locale: 'en', timezone: 'America/New_York',
      expectedMonthlyTrades: 0, expectedProfit: '9999999999999.99', expectedAvgHolding: '1.005', excludeHolidaysInStats: false };
    expect((await update(browser, input, false)).status).toBe(403);
    const saved = await update(browser, input);
    expect(saved.status).toBe(200);
    const expected = { ...input, name: 'Investor', expectedAvgHolding: '1.01' };
    expect(await saved.json()).toEqual({ success: true, settings: expected });
    await browser.post('/api/auth/logout', {});
    await browser.post('/api/auth/login', credentials);
    expect(await (await browser.request('/api/user/settings')).json()).toEqual({ success: true, settings: expected });
    const others = await (await other.browser.request('/api/user/settings')).json();
    expect(others.settings).toMatchObject({ name: null, locale: 'zh-TW', timezone: 'Asia/Taipei',
      expectedMonthlyTrades: 20, expectedProfit: '0.00', excludeHolidaysInStats: true });
    expect(Object.keys(others.settings)).not.toContain('email');
    expect(Object.keys(others.settings)).not.toContain('password');
  });

  it('supports partial updates and rejects invalid values without changing saved settings', async () => {
    const { browser } = await account();
    expect((await update(browser, { name: 'Keep me', timezone: 'Asia/Tokyo', role: 'ADMIN' })).status).toBe(200);
    const baseline = await (await browser.request('/api/user/settings')).json();
    for (const input of [{ timezone: 'invalid' }, { locale: 'fr' }, { expectedProfit: '9999999999999.995' }]) {
      const response = await update(browser, input);
      expect(response.status).toBe(400);
      expect((await response.json()).data.code).toBe('SYS_VALIDATION_ERROR');
      expect(await (await browser.request('/api/user/settings')).json()).toEqual(baseline);
    }
    const cleared = await update(browser, { name: '' });
    expect((await cleared.json()).settings).toMatchObject({ name: null, timezone: 'Asia/Tokyo' });
    expect((await (await browser.request('/api/auth/me')).json()).data.role).toBe('USER');
  });

  it('allows authenticated native updates while invalid explicit credentials cannot borrow cookies', async () => {
    const { browser, credentials } = await account();
    const native = await browser.post('/api/auth/native/login', credentials);
    const pair = (await native.json()).data;
    const response = await fetch(`${baseUrl}/api/user/settings`, { method: 'PUT', headers: {
      'content-type': 'application/json', authorization: `Bearer ${pair.accessToken}`,
    }, body: JSON.stringify({ locale: 'zh-CN', timezone: 'Europe/London' }) });
    expect(response.status).toBe(200);
    expect((await response.json()).settings).toMatchObject({ locale: 'zh-CN', timezone: 'Europe/London' });
    const invalid = await browser.request('/api/user/settings', { headers: { authorization: 'Bearer invalid' } });
    expect(invalid.status).toBe(401);
    const anonymous = await fetch(`${baseUrl}/api/user/settings`);
    expect(anonymous.status).toBe(401);
  });
});
