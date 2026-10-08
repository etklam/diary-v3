import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateAccountResource, markSignedIn, sessionFetch, webSession } from '../../apps/web/app/session';
afterEach(() => { invalidateAccountResource(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('account settings invalidation', () => {
  it('does not consume a Request body or invalidate for locale-only saves', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost', pathname: '/stocks' } });
    markSignedIn(); invalidateAccountResource(); let reads = 0;
    const fetcher = vi.spyOn(webSession, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (new URL(request.url).pathname === '/api/auth/me') { reads++; return Response.json({ data: { id: '1', timezone: 'UTC' } }); }
      expect(await request.json()).toEqual({ locale: 'en' }); return Response.json({ settings: { locale: 'en' } });
    });
    await sessionFetch('http://localhost/api/auth/me');
    await sessionFetch(new Request('http://localhost/api/user/settings', { method: 'PUT', body: JSON.stringify({ locale: 'en' }) }));
    await sessionFetch('http://localhost/api/auth/me');
    expect(reads).toBe(1); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('invalidates the snapshot after a confirmed timezone save', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost', pathname: '/stocks' } });
    markSignedIn(); invalidateAccountResource(); let reads = 0;
    vi.spyOn(webSession, 'fetch').mockImplementation(async input => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      if (path === '/api/auth/me') reads++;
      return Response.json({ data: { id: '1', timezone: 'UTC' } });
    });
    await sessionFetch('http://localhost/api/auth/me');
    await sessionFetch(new Request('http://localhost/api/user/settings', { method: 'PUT', body: JSON.stringify({ timezone: 'Asia/Taipei' }) }));
    await sessionFetch('http://localhost/api/auth/me'); expect(reads).toBe(2);
  });
  it('advances the revision on login even when another account was authenticated', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost', pathname: '/login' } });
    markSignedIn(); invalidateAccountResource(); let account = '1', reads = 0;
    vi.spyOn(webSession, 'fetch').mockImplementation(async input => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      if (path === '/api/auth/login') { account = '2'; return Response.json({ success: true }); }
      reads++; return Response.json({ data: { id: account, timezone: 'UTC' } });
    });
    expect(await (await sessionFetch('http://localhost/api/auth/me')).json()).toMatchObject({data:{id:'1'}});
    await sessionFetch(new Request('http://localhost/api/auth/login', {method:'POST'}));
    expect(await (await sessionFetch('http://localhost/api/auth/me')).json()).toMatchObject({data:{id:'2'}});
    expect(reads).toBe(2);
  });
  it('uses the effective init body when a settings Request is overridden', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost', pathname: '/stocks' } });
    markSignedIn(); invalidateAccountResource(); let reads = 0;
    vi.spyOn(webSession, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname === '/api/auth/me') reads++;
      else expect(await request.json()).toEqual({ timezone: 'UTC' });
      return Response.json({ data: { id: '1', timezone: 'UTC' } });
    });
    await sessionFetch('http://localhost/api/auth/me');
    const request = new Request('http://localhost/api/user/settings', { method: 'PUT', body: JSON.stringify({locale:'en'}) });
    await sessionFetch(request, { body: JSON.stringify({timezone:'UTC'}) });
    await sessionFetch('http://localhost/api/auth/me'); expect(reads).toBe(2);
  });

});

// A page's own reads normally start before the shell has confirmed the
// session, so the first confirmation lands while they are open. The guard that
// discards answers from an ended session must not discard these: doing so
// reported a false AUTH_UNAUTHORIZED on every cold load of a private page.
describe('in-flight private reads across a session event', () => {
  async function gatedSession(pathname: string) {
    vi.resetModules();
    const session = await import('../../apps/web/app/session');
    vi.stubGlobal('window', { location: { origin: 'http://localhost', pathname } });
    let open = () => {};
    const gate = new Promise<void>(resolve => { open = resolve; });
    vi.spyOn(session.webSession, 'fetch').mockImplementation(async input => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      if (path === '/api/diaries/summary') { await gate; return Response.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }); }
      return Response.json({ data: { id: '1', timezone: 'UTC' } });
    });
    return { session, open: () => open() };
  }

  it('answers a read that was in flight when the session was first confirmed', async () => {
    const { session, open } = await gatedSession('/alerts');
    const summary = session.sessionFetch('http://localhost/api/diaries/summary');
    // Confirms the session the document already loaded under.
    expect((await session.sessionFetch('http://localhost/api/alerts')).ok).toBe(true);
    open();
    expect((await summary).status).toBe(200);
  });

  it('discards a read that was in flight when the identity ended', async () => {
    const { session, open } = await gatedSession('/alerts');
    expect((await session.sessionFetch('http://localhost/api/alerts')).ok).toBe(true);
    const summary = session.sessionFetch('http://localhost/api/diaries/summary');
    session.clearPrivateSession();
    open();
    expect((await summary).status).toBe(401);
  });
});
