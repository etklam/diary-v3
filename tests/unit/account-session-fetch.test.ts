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
