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
let clock: Date;
async function signedIn() {
  const browser = new BrowserSession(baseUrl);
  const credentials = { email: `${randomUUID()}@example.test`, password: 'web-session-test-password' };
  expect((await browser.post('/api/auth/register', credentials)).status).toBe(200);
  expect((await browser.post('/api/auth/login', credentials)).status).toBe(200);
  return browser;
}
const authCookies = (response: Response) => response.headers.getSetCookie().filter(value => /^(access-token|refresh-token|auth-token)=/.test(value));
beforeAll(async () => { database = await provisionTestDatabase('diary_v3_web'); });
beforeEach(async () => {
  clock = new Date();
  const app = createApp({ db: database.db, now: () => clock, config: {
    jwtSecret: 'web-tests-only-secret-with-over-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } });
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); });
afterAll(async () => { await database?.dispose(); });

describe('stable Web sessions over HTTP', () => {
  it('recovers expired access concurrently without rotating the shared browser refresh token', async () => {
    const actualNow = Date.now();
    clock = new Date(actualNow - 61 * 60_000);
    const browser = await signedIn();
    const originalRefresh = browser.cookies.get('refresh-token');
    clock = new Date(actualNow);
    const recovered = await browser.request('/api/auth/me');
    expect(recovered.status).toBe(200);
    expect(authCookies(recovered)).toHaveLength(1);
    expect(authCookies(recovered)[0]).toMatch(/^access-token=/);
    const secondTab = new BrowserSession(baseUrl);
    for (const [key, value] of browser.cookies) secondTab.cookies.set(key, value);
    const responses = await Promise.all([browser.post('/api/auth/refresh', {}), secondTab.post('/api/auth/refresh', {})]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    for (const response of responses) {
      expect(await response.json()).toEqual({ ok: true });
      expect(authCookies(response)).toHaveLength(1);
      expect(authCookies(response)[0]).toMatch(/^access-token=/);
    }
    expect(browser.cookies.get('refresh-token')).toBe(originalRefresh);
    expect(secondTab.cookies.get('refresh-token')).toBe(originalRefresh);
    expect((await browser.request('/api/auth/me')).status).toBe(200);
    expect((await secondTab.request('/api/auth/me')).status).toBe(200);
    const stored = await database.pool.query('SELECT id, revoked_at FROM refresh_tokens');
    expect(stored.rows.every(row => row.revoked_at === null)).toBe(true);
  });

  it('clears browser cookies when refresh cleanup cannot reach the database', async () => {
    const browser = await signedIn();
    await database.pool.query('ALTER TABLE refresh_tokens RENAME TO refresh_tokens_outage');
    try {
      const response = await browser.post('/api/auth/logout', {}, false);
      expect(response.status).toBe(200);
      expect(authCookies(response).length).toBeGreaterThanOrEqual(2);
      expect(browser.cookies.has('access-token')).toBe(false);
      expect(browser.cookies.has('refresh-token')).toBe(false);
    } finally { await database.pool.query('ALTER TABLE refresh_tokens_outage RENAME TO refresh_tokens'); }
    expect((await browser.request('/api/auth/me')).status).toBe(401);
  });

  it('does not let an ambient access-cookie lookup failure prevent local logout', async () => {
    const browser = await signedIn();
    await database.pool.query('ALTER TABLE users RENAME TO users_outage');
    try {
      const response = await browser.post('/api/auth/logout', {}, false);
      expect(response.status).toBe(200);
      expect(browser.cookies.has('access-token')).toBe(false);
      expect(browser.cookies.has('refresh-token')).toBe(false);
    } finally { await database.pool.query('ALTER TABLE users_outage RENAME TO users'); }
  });

  it('keeps explicit credentials from clearing or borrowing an attached browser identity', async () => {
    const browser = await signedIn();
    const access = browser.cookies.get('access-token')!;
    const refresh = browser.cookies.get('refresh-token');
    const bearerLogout = await browser.post('/api/auth/logout', {}, false, { authorization: `Bearer ${access}` });
    expect(bearerLogout.status).toBe(200);
    expect(authCookies(bearerLogout)).toHaveLength(0);
    const invalidLogout = await browser.post('/api/auth/logout', {}, false, { authorization: 'Bearer invalid' });
    expect(invalidLogout.status).toBe(401);
    expect(authCookies(invalidLogout)).toHaveLength(0);
    const invalidKey = await browser.post('/api/auth/logout', {}, false, { 'x-api-key': 'invalid' });
    expect(invalidKey.status).toBe(401);
    expect(authCookies(invalidKey)).toHaveLength(0);
    expect(browser.cookies.get('refresh-token')).toBe(refresh);
    expect((await browser.request('/api/auth/me')).status).toBe(200);
  });

  it('rejects a native family on the Web refresh route and expires stale browser sessions', async () => {
    const browser = await signedIn();
    await database.pool.query("UPDATE refresh_tokens SET expires_at = now() - interval '1 day' WHERE client_type = 'WEB'");
    expect((await browser.post('/api/auth/refresh', {})).status).toBe(401);
    const credentials = { email: `${randomUUID()}@example.test`, password: 'web-session-test-password' };
    await browser.post('/api/auth/register', credentials);
    const nativeResponse = await browser.post('/api/auth/native/login', credentials);
    expect(nativeResponse.status).toBe(200);
    browser.cookies.set('refresh-token', (await nativeResponse.json()).data.refreshToken);
    expect((await browser.post('/api/auth/refresh', {})).status).toBe(401);
    const nativeRows = await database.pool.query("SELECT revoked_at FROM refresh_tokens WHERE client_type = 'NATIVE'");
    expect(nativeRows.rows.every(row => row.revoked_at === null)).toBe(true);
  });
});
