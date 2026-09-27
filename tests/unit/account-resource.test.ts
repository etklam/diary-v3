import { describe, expect, it } from 'vitest';
import { createAccountResource } from '../../apps/web/app/account-resource';

describe('confirmed account resource', () => {
  it('shares pending reads, clones bodies and keeps another consumer alive', async () => {
    let resolve!: (response: Response) => void, calls = 0;
    const resource = createAccountResource(() => 1);
    const load = () => { calls++; return new Promise<Response>(done => { resolve = done; }); };
    const controller = new AbortController();
    const first = resource.read(load, controller.signal).catch(error => error.name);
    const second = resource.read(load);
    controller.abort();
    expect(await first).toBe('AbortError');
    resolve(Response.json({ id: '1' }));
    expect(await (await second).json()).toEqual({ id: '1' });
    expect(await (await resource.read(load)).json()).toEqual({ id: '1' });
    expect(calls).toBe(1);
  });
  it('rejects responses arriving after invalidation and never refills from them', async () => {
    let resolve!: (response: Response) => void;
    const resource = createAccountResource(() => 1);
    const old = resource.read(() => new Promise<Response>(done => { resolve = done; })).catch(error => error.name);
    resource.invalidate(); resolve(Response.json({ id: 'old' }));
    expect(await old).toBe('AbortError');
    expect(await (await resource.read(async () => Response.json({ id: 'new' }))).json()).toEqual({ id: 'new' });
  });
  it('revalidates after expiry and isolates session revisions', async () => {
    let revision = 0, now = 0, calls = 0;
    const resource = createAccountResource(() => revision, () => now);
    const load = async () => { calls++; return Response.json({ id: String(revision) }); };
    await resource.read(load); revision++; await resource.read(load);
    now = 30_001; await resource.read(load);
    expect(calls).toBe(3);
  });
  it('does not cache failed authorization', async () => {
    const resource = createAccountResource(() => 0); let calls = 0;
    const load = async () => { calls++; return new Response(null, { status: 403 }); };
    await resource.read(load); await resource.read(load); expect(calls).toBe(2);
  });
});
