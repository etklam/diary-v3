import { describe, expect, it, vi } from 'vitest';
import { createWebSession } from '../../packages/api-client/src/index';

const baseUrl = 'https://diary.test';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Web stable cookie session transport', () => {
  it('shares one refresh for concurrent 401s and retries each original POST body once', async () => {
    const refreshResponse = deferred<Response>();
    const started = deferred<void>();
    let refreshed = false;
    let refreshCount = 0;
    const bodies: string[] = [];
    const client = createWebSession({ baseUrl, fetch: async (input) => {
      const request = new Request(input);
      expect(request.credentials).toBe('same-origin');
      if (request.url.endsWith('/refresh')) {
        refreshCount++;
        expect(request.method).toBe('POST');
        expect(request.headers.has('authorization')).toBe(false);
        started.resolve();
        const response = await refreshResponse.promise;
        refreshed = true;
        return response;
      }
      expect(request.headers.get('x-csrf-token')).toBe('csrf-value');
      bodies.push(await request.text());
      return new Response(null, { status: refreshed ? 200 : 401 });
    } });
    const send = () => client.fetch(`${baseUrl}/api/diaries`, {
      method: 'POST', body: '{"title":"preserved"}', headers: { 'x-csrf-token': 'csrf-value' },
    });
    const pending = [send(), send(), send()];
    await started.promise;
    refreshResponse.resolve(Response.json({ ok: true }));
    expect((await Promise.all(pending)).map((response) => response.status)).toEqual([200, 200, 200]);
    expect(refreshCount).toBe(1);
    expect(bodies).toEqual(Array(6).fill('{"title":"preserved"}'));
  });

  it.each([
    '/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout',
    '/api/auth/native/login', '/api/auth/native/refresh', '/api/auth/native/logout', '/public',
  ])('does not recover bootstrap or non-API request %s', async (path) => {
    const transport = vi.fn(async () => new Response(null, { status: 401 }));
    const client = createWebSession({ baseUrl, fetch: transport });
    expect((await client.fetch(`${baseUrl}${path}`, { method: 'POST' })).status).toBe(401);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(['authorization', 'x-api-key'])('never falls back to cookie refresh for explicit %s credentials', async (header) => {
    const transport = vi.fn(async () => new Response(null, { status: 401 }));
    const client = createWebSession({ baseUrl, fetch: transport });
    expect((await client.fetch(`${baseUrl}/api/diaries`, { headers: { [header]: 'invalid' } })).status).toBe(401);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(['401', '500', 'network', 'malformed', 'false'])('returns the original 401 when refresh fails with %s', async (failure) => {
    const original = Response.json({ data: { code: 'AUTH_UNAUTHORIZED' } }, { status: 401 });
    const transport = vi.fn(async (input: RequestInfo | URL) => {
      if (!new Request(input).url.endsWith('/refresh')) return original;
      if (failure === 'network') throw new TypeError('Offline');
      if (failure === 'malformed') return new Response('not json', { status: 200 });
      if (failure === 'false') return Response.json({ ok: false });
      return new Response(null, { status: Number(failure) });
    });
    const client = createWebSession({ baseUrl, fetch: transport });
    expect(await client.fetch(`${baseUrl}/api/diaries`)).toBe(original);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await original.json()).toEqual({ data: { code: 'AUTH_UNAUTHORIZED' } });
  });

  it('returns a second 401 without looping, clearing cookies, or pretending success', async () => {
    const transport = vi.fn(async (input: RequestInfo | URL) => new Request(input).url.endsWith('/refresh')
      ? Response.json({ ok: true }) : new Response(null, { status: 401 }));
    const client = createWebSession({ baseUrl, fetch: transport });
    expect((await client.fetch(`${baseUrl}/api/diaries`)).status).toBe(401);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('allows a late 401 to perform another safe stable refresh', async () => {
    const late = deferred<Response>();
    let refreshCount = 0;
    let initialLate = true;
    let initialFast = true;
    const client = createWebSession({ baseUrl, fetch: async (input) => {
      const request = new Request(input);
      if (request.url.endsWith('/refresh')) { refreshCount++; return Response.json({ ok: true }); }
      if (request.url.endsWith('/late') && initialLate) { initialLate = false; return late.promise; }
      if (request.url.endsWith('/fast') && initialFast) { initialFast = false; return new Response(null, { status: 401 }); }
      return new Response(null, { status: 200 });
    } });
    const pending = client.fetch(`${baseUrl}/api/late`);
    expect((await client.fetch(`${baseUrl}/api/fast`)).status).toBe(200);
    late.resolve(new Response(null, { status: 401 }));
    expect((await pending).status).toBe(200);
    expect(refreshCount).toBe(2);
  });

  it.each(['before-401', 'during-refresh'])('does not retry invalidated requests %s', async (phase) => {
    const gate = deferred<Response>();
    const started = deferred<void>();
    let calls = 0;
    const client = createWebSession({ baseUrl, fetch: async (input) => {
      calls++;
      const refreshing = new Request(input).url.endsWith('/refresh');
      if ((phase === 'during-refresh') === refreshing) {
        started.resolve();
        return gate.promise;
      }
      return new Response(null, { status: 401 });
    } });
    const pending = client.fetch(`${baseUrl}/api/diaries`);
    await started.promise;
    client.invalidate();
    gate.resolve(phase === 'during-refresh' ? Response.json({ ok: true }) : new Response(null, { status: 401 }));
    expect((await pending).status).toBe(401);
    expect(calls).toBe(phase === 'during-refresh' ? 2 : 1);
  });

  it('does not refresh or repeat a rejected current-password operation', async () => {
    const transport = vi.fn(async () => Response.json({ data: { code: 'AUTH_LOGIN_INVALID_CREDENTIALS' } }, { status: 401 }));
    const client = createWebSession({ baseUrl, fetch: transport });
    const response = await client.fetch(`${baseUrl}/api/user/password`, { method: 'PUT', body: '{}' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ data: { code: 'AUTH_LOGIN_INVALID_CREDENTIALS' } });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('refuses unrelated origins before sending credentials or attempting recovery', async () => {
    const transport = vi.fn();
    const client = createWebSession({ baseUrl, fetch: transport });
    await expect(client.fetch('https://foreign.test/api/diaries')).rejects.toThrow('another origin');
    expect(transport).not.toHaveBeenCalled();
  });
});
