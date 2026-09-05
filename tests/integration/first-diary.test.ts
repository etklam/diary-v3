import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { provisionTestDatabase } from '../support/database';
import { BrowserSession } from '../support/browser-session';
import { createApp } from '../../apps/api/src/app';
import { createApiClient } from '@diary/api-client';

let database: Awaited<ReturnType<typeof provisionTestDatabase>>;
let server: ReturnType<typeof serve>;
let baseUrl: string;

async function registerAndLogin(browser: BrowserSession, email = `${randomUUID()}@example.test`) {
  expect((await browser.post('/api/auth/register', { email, password: 'test-password-123', name: 'Test investor' })).status).toBe(200);
  const response = await browser.post('/api/auth/login', { email, password: 'test-password-123' });
  expect(response.status).toBe(200);
  expect((await browser.request('/api/auth/me')).status).toBe(200);
  return response;
}

beforeAll(async () => { database = await provisionTestDatabase(); });
beforeEach(async () => {
  const app = createApp({ db: database.db, config: {
    jwtSecret: 'test-only-first-diary-secret-with-over-32-characters',
    nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } });
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.close();
  await once(server, 'close');
});
afterAll(async () => { await database?.dispose(); });

describe('first diary through real HTTP and PostgreSQL', () => {
  it('registers without a session, logs in using HttpOnly cookies and stores only a refresh digest', async () => {
    const browser = new BrowserSession(baseUrl);
    const email = `${randomUUID()}@Example.test`;
    const registered = await browser.post('/api/auth/register', { email, password: 'test-password-123' });
    expect(registered.status).toBe(200);
    const user = (await registered.json()).user;
    expect(user.id).toMatch(/^[1-9]\d*$/);
    expect(registered.headers.getSetCookie().some(value => value.startsWith('access-token='))).toBe(false);
    expect((await browser.post('/api/auth/register', { email: email.toLowerCase(), password: 'another-password' })).status).toBe(409);
    const loggedIn = await browser.post('/api/auth/login', { email: email.toLowerCase(), password: 'test-password-123' });
    expect(loggedIn.status).toBe(200);
    const cookieHeaders = loggedIn.headers.getSetCookie();
    for (const name of ['access-token', 'refresh-token']) {
      const cookie = cookieHeaders.find(value => value.startsWith(`${name}=`))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\//i);
    }
    expect(await loggedIn.json()).not.toHaveProperty('accessToken');
    const stored = await database.pool.query('SELECT * FROM refresh_tokens WHERE user_id = $1', [user.id]);
    expect(stored.rows).toHaveLength(1);
    const values = Object.values(stored.rows[0]);
    expect(values).toContain(createHash('sha256').update(browser.cookies.get('refresh-token')!).digest('hex'));
    expect(values).not.toContain(browser.cookies.get('refresh-token'));
  });

  it('requires CSRF, creates once under a race, returns canonical values and hides another owner', async () => {
    const owner = new BrowserSession(baseUrl);
    const other = new BrowserSession(baseUrl);
    await registerAndLogin(owner);
    await registerAndLogin(other);
    const input = { title: '  A decision worth reviewing  ', content: 'Wait for evidence before adding.', date: '2026-09-05' };
    const csrfFailure = await owner.post('/api/diaries', input, false);
    expect(csrfFailure.status).toBe(403);
    expect((await csrfFailure.json()).data.code).toBe('CSRF_FAILED');
    const concurrent = await Promise.all([owner.post('/api/diaries', input), owner.post('/api/diaries', input)]);
    expect(concurrent.map(response => response.status).sort()).toEqual([201, 409]);
    const created = await concurrent.find(response => response.status === 201)!.json();
    expect(created).toMatchObject({ title: input.title.trim(), content: input.content, date: input.date, transactions: [], alerts: [], stockSymbols: [] });
    expect(created.id).toMatch(/^[1-9]\d*$/);
    expect(created.createdAt).toMatch(/Z$/);
    const detail = await owner.request(`/api/diaries/${created.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ id: created.id, content: input.content });
    const forbidden = await other.request(`/api/diaries/${created.id}`);
    const missing = await other.request('/api/diaries/999999999');
    expect([forbidden.status, missing.status]).toEqual([404, 404]);
    expect((await forbidden.json()).data.code).toBe((await missing.json()).data.code);
    expect((await other.post('/api/diaries', input)).status).toBe(201);
    const longTitle = await owner.post('/api/diaries', { ...input, title: '長'.repeat(500), date: '2026-09-07' });
    expect(longTitle.status).toBe(201);
    expect((await longTitle.json()).title).toHaveLength(500);
  });

  it('rejects invalid IDs, impossible dates and explicit invalid credentials without cookie fallback', async () => {
    const browser = new BrowserSession(baseUrl);
    await registerAndLogin(browser);
    const invalid = await browser.request('/api/diaries/01', { headers: { 'x-request-id': 'parity.invalid-id' } });
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('x-request-id')).toBe('parity.invalid-id');
    expect((await invalid.json()).data).toMatchObject({ code: 'SYS_VALIDATION_ERROR', requestId: 'parity.invalid-id' });
    expect((await browser.post('/api/diaries', { title: 'Test', content: 'Test', date: '2026-02-30' })).status).toBe(400);
    expect((await browser.request('/api/auth/me', { headers: { authorization: 'Bearer invalid-token' } })).status).toBe(401);
    expect((await browser.request('/api/auth/me', { headers: { 'x-api-key': 'invalid-key' } })).status).toBe(401);
    expect((await browser.request('/api/diaries/999999999999999999999999999999999')).status).toBe(400);
    expect((await browser.request('/api/diaries/9223372036854775807')).status).toBe(404);
  });

  it('limits repeated login attempts with a machine-readable 429', async () => {
    const browser = new BrowserSession(baseUrl);
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await browser.post('/api/auth/login', { email: `${randomUUID()}@example.test`, password: 'wrong-password' })).status).toBe(401);
    }
    const limited = await browser.post('/api/auth/login', { email: `${randomUUID()}@example.test`, password: 'wrong-password' });
    expect(limited.status).toBe(429);
    expect((await limited.json()).data.code).toBe('AUTH_RATE_LIMITED');
  });

  it('rejects bcrypt truncation at the UTF-8 boundary instead of accepting indistinguishable passwords', async () => {
    const browser = new BrowserSession(baseUrl);
    const email = `${randomUUID()}@example.test`;
    const valid = '密'.repeat(24);
    expect((await browser.post('/api/auth/register', { email, password: valid })).status).toBe(200);
    const rejected = await browser.post('/api/auth/register', { email: `${randomUUID()}@example.test`, password: `${valid}a` });
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).data.code).toBe('SYS_VALIDATION_ERROR');
    expect((await browser.post('/api/auth/login', { email, password: `${valid}b` })).status).toBe(400);
    expect((await browser.post('/api/auth/login', { email, password: valid })).status).toBe(200);
  });

  it('keeps a database outage distinct from an invalid session', async () => {
    const browser = new BrowserSession(baseUrl);
    await registerAndLogin(browser);
    await database.pool.query('ALTER TABLE users RENAME TO users_outage');
    try {
      expect((await browser.request('/api/auth/me')).status).toBe(500);
      expect((await browser.request('/api/auth/me', { headers: { authorization: `Bearer ${browser.cookies.get('access-token')}` } })).status).toBe(500);
    } finally {
      await database.pool.query('ALTER TABLE users_outage RENAME TO users');
    }
    expect((await browser.request('/api/auth/me')).status).toBe(200);
  });

  it('lets the native-compatible generated fetch client read the same diary without a DOM', async () => {
    const browser = new BrowserSession(baseUrl);
    await registerAndLogin(browser);
    const response = await browser.post('/api/diaries', { title: 'Shared protocol', content: 'A standard fetch client can read this.', date: '2026-09-06' });
    expect(response.status).toBe(201);
    const diary = await response.json();
    const client = createApiClient({ baseUrl, getAccessToken: () => browser.cookies.get('access-token')! });
    const { data, error } = await client.GET('/api/diaries/{id}', { params: { path: { id: diary.id } } });
    expect(error).toBeUndefined();
    expect(data).toMatchObject({ id: diary.id, content: diary.content });
  });
});
