import { describe, expect, it, vi } from 'vitest';
import { createNativeSession, type NativeSessionStorage } from '../../packages/api-client/src/index';
import type { NativeSession } from '../../packages/contracts/src/index';

const baseUrl = 'https://diary.test';
function pair(suffix: string): NativeSession {
  return {
    accessToken: `access-${suffix}`, refreshToken: `refresh-${suffix}`,
    accessTokenExpiresAt: '2026-09-05T10:00:00.000Z', refreshTokenExpiresAt: '2026-10-05T10:00:00.000Z',
    user: { id: '1', email: 'test@example.com', name: null, role: 'USER', timezone: 'UTC',
      expectedMonthlyTrades: 0, expectedProfit: '0', expectedAvgHolding: '0' },
  };
}
function storage(initial: NativeSession | null = pair('a')) {
  let value = initial;
  return {
    get: vi.fn(() => value),
    set: vi.fn((session: NativeSession) => { value = session; }),
    clear: vi.fn(() => { value = null; }),
  } satisfies NativeSessionStorage;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const sessionResponse = (suffix: string) => Response.json({ ok: true, data: pair(suffix) });

describe('native session standard-fetch transport', () => {
  it('coalesces concurrent 401s, preserves POST bodies, and retries each once without cookies', async () => {
    const store = storage();
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    let refreshCount = 0;
    const bodies: string[] = [];
    const client = createNativeSession({ baseUrl, storage: store, fetch: async (input) => {
      const request = new Request(input);
      expect(request.credentials).toBe('omit');
      expect(request.headers.has('cookie')).toBe(false);
      expect(request.headers.has('x-csrf-token')).toBe(false);
      if (request.url.endsWith('/refresh')) {
        refreshCount++;
        expect(request.headers.has('authorization')).toBe(false);
        expect(await request.json()).toEqual({ refreshToken: 'refresh-a' });
        refreshStarted.resolve();
        return refresh.promise;
      }
      bodies.push(await request.text());
      return new Response(null, { status: request.headers.get('authorization') === 'Bearer access-b' ? 200 : 401 });
    } });
    const send = () => client.fetch(`${baseUrl}/api/diaries`, {
      method: 'POST', body: '{"title":"same body"}', headers: { cookie: 'old=web', 'x-csrf-token': 'web' },
    });
    const requests = [send(), send(), send()];
    await refreshStarted.promise;
    refresh.resolve(sessionResponse('b'));
    expect((await Promise.all(requests)).map((response) => response.status)).toEqual([200, 200, 200]);
    expect(refreshCount).toBe(1);
    expect(bodies).toEqual(Array(6).fill('{"title":"same body"}'));
    expect(store.get()).toEqual(pair('b'));
  });

  it('uses the rotated token for an old 401 arriving after refresh completed', async () => {
    const late = deferred<Response>();
    let refreshCount = 0;
    const client = createNativeSession({ baseUrl, storage: storage(), fetch: async (input) => {
      const request = new Request(input);
      if (request.url.endsWith('/refresh')) { refreshCount++; return sessionResponse('b'); }
      if (request.headers.get('authorization') === 'Bearer access-b') return new Response(null, { status: 200 });
      return request.url.endsWith('/late') ? late.promise : new Response(null, { status: 401 });
    } });
    const pending = client.fetch(`${baseUrl}/api/late`);
    expect((await client.fetch(`${baseUrl}/api/fast`)).status).toBe(200);
    late.resolve(new Response(null, { status: 401 }));
    expect((await pending).status).toBe(200);
    expect(refreshCount).toBe(1);
  });

  it.each(['rejected', 'lost-response', 'invalid-json'])('clears on %s refresh and never retries the old rotation token', async (mode) => {
    const store = storage();
    let refreshCount = 0;
    let protectedCount = 0;
    const client = createNativeSession({ baseUrl, storage: store, fetch: async (input) => {
      if (new Request(input).url.endsWith('/refresh')) {
        refreshCount++;
        if (mode === 'lost-response') throw new TypeError('Network response lost');
        return mode === 'invalid-json' ? Response.json({}) : new Response(null, { status: 401 });
      }
      protectedCount++;
      return new Response(null, { status: 401 });
    } });
    expect((await client.fetch(`${baseUrl}/api/diaries`)).status).toBe(401);
    expect(store.get()).toBeNull();
    await client.fetch(`${baseUrl}/api/diaries`);
    expect(refreshCount).toBe(1);
    expect(protectedCount).toBe(2);
  });

  it('ends the local session when the one protected retry also returns 401', async () => {
    const store = storage();
    const calls: string[] = [];
    const client = createNativeSession({ baseUrl, storage: store, fetch: async (input) => {
      const request = new Request(input);
      calls.push(request.url);
      return request.url.endsWith('/refresh') ? sessionResponse('b') : new Response(null, { status: 401 });
    } });
    expect((await client.fetch(`${baseUrl}/api/diaries`)).status).toBe(401);
    expect(calls).toHaveLength(3);
    expect(store.get()).toBeNull();
  });

  it('does not recursively refresh bootstrap 401s or attach stored authorization', async () => {
    const store = storage();
    const transport = vi.fn(async (input: RequestInfo | URL) => {
      expect(new Request(input).headers.has('authorization')).toBe(false);
      return new Response(null, { status: 401 });
    });
    const client = createNativeSession({ baseUrl, storage: store, fetch: transport });
    await client.fetch(`${baseUrl}/api/auth/native/login`, { method: 'POST' });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(client.login({ email: 'test@example.com', password: 'incorrect' })).rejects.toThrow('401');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(store.get()).toBeNull();
  });

  it('logs in with JSON and clears local state even if remote logout fails', async () => {
    const store = storage(null);
    const client = createNativeSession({ baseUrl, storage: store, fetch: async (input) => {
      const request = new Request(input);
      expect(request.credentials).toBe('omit');
      if (request.url.endsWith('/login')) {
        expect(await request.json()).toEqual({ email: 'test@example.com', password: 'password' });
        return sessionResponse('b');
      }
      expect(await request.json()).toEqual({ refreshToken: 'refresh-b' });
      throw new TypeError('Offline');
    } });
    await client.login({ email: 'test@example.com', password: 'password' });
    expect(store.get()).toEqual(pair('b'));
    await expect(client.logout()).rejects.toThrow('Offline');
    expect(store.get()).toBeNull();
    await client.logout();
  });

  it('does not resurrect a logged-out session when an in-flight refresh responds', async () => {
    const store = storage();
    const response = deferred<Response>();
    const started = deferred<void>();
    const client = createNativeSession({ baseUrl, storage: store, fetch: async (input) => {
      if (new Request(input).url.endsWith('/refresh')) { started.resolve(); return response.promise; }
      return Response.json({ ok: true });
    } });
    const refresh = client.refresh();
    await started.promise;
    await client.logout();
    response.resolve(sessionResponse('b'));
    await expect(refresh).rejects.toThrow('changed');
    expect(store.get()).toBeNull();
  });

  it('preserves the session after a wrong current password without retrying the operation', async () => {
    const store = storage();
    const transport = vi.fn(async () => Response.json({ data: { code: 'AUTH_LOGIN_INVALID_CREDENTIALS' } }, { status: 401 }));
    const client = createNativeSession({ baseUrl, storage: store, fetch: transport });
    const response = await client.fetch(`${baseUrl}/api/user/password`, { method: 'PUT', body: '{}' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ data: { code: 'AUTH_LOGIN_INVALID_CREDENTIALS' } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual(pair('a'));
  });

  it('does not leak tokens to another origin', async () => {
    const transport = vi.fn();
    const client = createNativeSession({ baseUrl, storage: storage(), fetch: transport });
    await expect(client.fetch('https://foreign.test/api/diaries')).rejects.toThrow('another origin');
    expect(transport).not.toHaveBeenCalled();
  });
});
