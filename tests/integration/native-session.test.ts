import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app';
import { createApiClient, createNativeSession } from '@diary/api-client';
import type { NativeSession } from '@diary/contracts';
import { provisionTestDatabase } from '../support/database';

let database: Awaited<ReturnType<typeof provisionTestDatabase>>;
let server: ReturnType<typeof serve>;
let baseUrl: string;
let clock: Date;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const post = (path: string, body: unknown, headers: HeadersInit = {}) => fetch(`${baseUrl}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
async function account() {
  const credentials = { email: `${randomUUID()}@example.test`, password: 'native-test-password-123' };
  expect((await post('/api/auth/register', credentials)).status).toBe(200);
  return credentials;
}
async function login(credentials: { email: string; password: string }) {
  const response = await post('/api/auth/native/login', { ...credentials, deviceName: 'Test native client' });
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toEqual([]);
  return (await response.json()).data as NativeSession;
}
const refresh = (token: string) => post('/api/auth/native/refresh', { refreshToken: token });

beforeAll(async () => { database = await provisionTestDatabase('diary_v3_native'); });
beforeEach(async () => {
  clock = new Date();
  const app = createApp({ db: database.db, now: () => clock, config: {
    jwtSecret: 'native-tests-only-secret-with-over-32-characters', nodeEnv: 'test', trustProxy: false, webOrigin: 'http://127.0.0.1',
  } });
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { server.close(); await once(server, 'close'); });
afterAll(async () => { await database?.dispose(); });

describe('native sessions with actual HTTP and PostgreSQL', () => {
  it('rotates digests atomically and revokes only the replayed family', async () => {
    const credentials = await account();
    const first = await login(credentials);
    const other = await login(credentials);
    const nextResponse = await refresh(first.refreshToken);
    expect(nextResponse.status).toBe(200);
    expect(nextResponse.headers.getSetCookie()).toEqual([]);
    const next = (await nextResponse.json()).data as NativeSession;
    expect(next.refreshToken).not.toBe(first.refreshToken);
    const rows = await database.pool.query('SELECT * FROM refresh_tokens WHERE user_id = $1 ORDER BY id', [first.user.id]);
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.every(row => [first.refreshToken, other.refreshToken, next.refreshToken].every(token => row.token !== token))).toBe(true);
    const parent = rows.rows.find(row => row.token === digest(first.refreshToken));
    const child = rows.rows.find(row => row.token === digest(next.refreshToken));
    expect(parent.revocation_reason).toBe('ROTATED');
    expect(parent.replacement_id).toBe(child.id);
    expect(child.parent_id).toBe(parent.id);
    expect(child.family_id).toBe(parent.family_id);
    expect((await refresh(first.refreshToken)).status).toBe(401);
    expect((await refresh(next.refreshToken)).status).toBe(401);
    expect((await refresh(other.refreshToken)).status).toBe(200);
  });

  it('allows a single rotation winner and invalidates its result when the old token races', async () => {
    const session = await login(await account());
    const results = await Promise.all([refresh(session.refreshToken), refresh(session.refreshToken)]);
    expect(results.map(response => response.status).sort()).toEqual([200, 401]);
    const winner = (await results.find(response => response.status === 200)!.json()).data as NativeSession;
    expect((await refresh(winner.refreshToken)).status).toBe(401);
    const active = await database.pool.query('SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [session.user.id]);
    expect(active.rows).toHaveLength(0);
  });

  it('serializes replay with a descendant rotation so no later child escapes revocation', async () => {
    const first = await login(await account());
    const nextResponse = await refresh(first.refreshToken);
    const next = (await nextResponse.json()).data as NativeSession;
    const result = await database.pool.query('SELECT id FROM refresh_tokens WHERE token = $1', [digest(next.refreshToken)]);
    const parentId = String(result.rows[0].id);
    expect(parentId).toMatch(/^[1-9]\d*$/);
    const gate = await database.pool.connect();
    let childRequest: Promise<Response> | undefined;
    let replayRequest: Promise<Response> | undefined;
    async function waitForBlockedRequests(count: number) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const waiting = await database.pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'");
        if (waiting.rows[0].count >= count) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Expected ${count} blocked test requests`);
    }
    try {
      // Hold only the C insert. This forces old replay revocation to overlap B→C.
      await database.pool.query(`CREATE FUNCTION native_descendant_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.parent_id = ${parentId} THEN PERFORM pg_advisory_xact_lock(2026090505); END IF; RETURN NEW; END; $$`);
      await database.pool.query('CREATE TRIGGER native_descendant_gate BEFORE INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION native_descendant_gate()');
      await gate.query('SELECT pg_advisory_lock(2026090505)');
      childRequest = refresh(next.refreshToken);
      await waitForBlockedRequests(1);
      replayRequest = refresh(first.refreshToken);
      await waitForBlockedRequests(2);
      await gate.query('SELECT pg_advisory_unlock(2026090505)');
      const [child, replay] = await Promise.all([childRequest, replayRequest]);
      expect(child.status).toBe(200);
      expect(replay.status).toBe(401);
      const descendant = (await child.json()).data as NativeSession;
      expect((await refresh(descendant.refreshToken)).status).toBe(401);
      const active = await database.pool.query('SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [first.user.id]);
      expect(active.rows).toHaveLength(0);
    } finally {
      await gate.query('SELECT pg_advisory_unlock(2026090505)');
      await Promise.allSettled([childRequest, replayRequest].filter(Boolean));
      await database.pool.query('DROP TRIGGER IF EXISTS native_descendant_gate ON refresh_tokens');
      await database.pool.query('DROP FUNCTION IF EXISTS native_descendant_gate()');
      gate.release();
    }
  });

  it('treats a lost rotation response retry as replay, without a grace window', async () => {
    const session = await login(await account());
    const response = await refresh(session.refreshToken);
    expect(response.status).toBe(200);
    // Deliberately discard the response body as a lost response from the device perspective.
    await response.body?.cancel();
    expect((await refresh(session.refreshToken)).status).toBe(401);
    const active = await database.pool.query('SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [session.user.id]);
    expect(active.rows).toHaveLength(0);
  });

  it('logs out a family idempotently while preserving the documented access-token lifetime', async () => {
    const credentials = await account();
    const first = await login(credentials);
    const other = await login(credentials);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await post('/api/auth/native/logout', { refreshToken: first.refreshToken });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect((await refresh(first.refreshToken)).status).toBe(401);
    expect((await refresh(other.refreshToken)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${first.accessToken}` } })).status).toBe(200);
  });

  it('contains replay of an expired ancestor while its newer descendant would still be valid', async () => {
    const actualNow = Date.now();
    const day = 86_400_000;
    clock = new Date(actualNow - 40 * day);
    const first = await login(await account());
    clock = new Date(actualNow - 20 * day);
    const nextResponse = await refresh(first.refreshToken);
    expect(nextResponse.status).toBe(200);
    const next = (await nextResponse.json()).data as NativeSession;
    expect(Date.parse(first.refreshTokenExpiresAt)).toBeLessThan(actualNow);
    expect(Date.parse(next.refreshTokenExpiresAt)).toBeGreaterThan(actualNow);
    clock = new Date(actualNow);
    expect((await refresh(first.refreshToken)).status).toBe(401);
    expect((await refresh(next.refreshToken)).status).toBe(401);
  });

  it('persists expiry of an active native refresh row instead of granting a grace period', async () => {
    const actualNow = Date.now();
    clock = new Date(actualNow - 40 * 86_400_000);
    const session = await login(await account());
    clock = new Date(actualNow);
    const expired = await refresh(session.refreshToken);
    expect(expired.status).toBe(401);
    expect((await expired.json()).data.code).toBe('AUTH_TOKEN_EXPIRED');
    const row = await database.pool.query('SELECT revocation_reason, revoked_at FROM refresh_tokens WHERE token = $1', [digest(session.refreshToken)]);
    expect(row.rows[0].revocation_reason).toBe('EXPIRED');
    expect(row.rows[0].revoked_at).not.toBeNull();
  });

  it('keeps browser refresh credentials outside native lineage', async () => {
    const credentials = await account();
    const webLogin = await post('/api/auth/login', credentials);
    expect(webLogin.status).toBe(200);
    const webRefresh = webLogin.headers.getSetCookie().find(value => value.startsWith('refresh-token='))!.split(';')[0]!.slice('refresh-token='.length);
    expect((await refresh(webRefresh)).status).toBe(401);
    const stored = await database.pool.query('SELECT client_type, revoked_at FROM refresh_tokens WHERE token = $1', [digest(webRefresh)]);
    expect(stored.rows[0]).toMatchObject({ client_type: 'WEB', revoked_at: null });
  });

  it('composes the native storage transport with the generated client to create and read a diary', async () => {
    const credentials = await account();
    let stored: NativeSession | null = null;
    const native = createNativeSession({ baseUrl, storage: {
      get: async () => stored,
      set: async session => { stored = session; },
      clear: async () => { stored = null; },
    } });
    const actualNow = Date.now();
    clock = new Date(actualNow - 61 * 60_000);
    const initialSession = await native.login(credentials);
    clock = new Date(actualNow);
    expect(Date.parse(initialSession.accessTokenExpiresAt)).toBeLessThan(actualNow);
    const client = createApiClient({ baseUrl, fetch: native.fetch });
    const simultaneous = await Promise.all([client.GET('/api/auth/me'), client.GET('/api/auth/me')]);
    expect(simultaneous.map(result => result.response.status)).toEqual([200, 200]);
    const lineage = await database.pool.query('SELECT id FROM refresh_tokens WHERE user_id = $1', [initialSession.user.id]);
    expect(lineage.rows).toHaveLength(2);
    const created = await client.POST('/api/diaries', { body: { title: 'A native decision', content: 'The same API serves the future app.', date: '2026-09-05' } });
    expect(created.response.status).toBe(201);
    expect(created.data).toBeDefined();
    const read = await client.GET('/api/diaries/{id}', { params: { path: { id: created.data!.id } } });
    expect(read.data?.content).toBe('The same API serves the future app.');
    const previous = stored;
    await native.refresh();
    expect(stored).not.toEqual(previous);
    await native.logout();
    expect(stored).toBeNull();
  });
});
