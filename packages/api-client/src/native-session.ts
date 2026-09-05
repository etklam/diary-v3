import { nativeSessionResponseSchema, type LoginRequest, type NativeSession } from '@diary/contracts';

export type NativeSessionStorage = {
  /** Persist the complete pair atomically in the platform's secure storage. */
  get(): NativeSession | null | Promise<NativeSession | null>;
  set(session: NativeSession): void | Promise<void>;
  clear(): void | Promise<void>;
};

export type NativeSessionOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  storage: NativeSessionStorage;
};

const bootstrapPaths = new Set([
  '/api/auth/native/login', '/api/auth/native/refresh', '/api/auth/native/logout',
  '/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout',
]);

/** One instance per signed-in native client; no cookie jar or platform globals. */
export function createNativeSession(options: NativeSessionOptions) {
  const base = new URL(options.baseUrl);
  const transport = options.fetch ?? globalThis.fetch;
  let epoch = 0;
  let loaded: Promise<NativeSession | null> | undefined;
  let writes = Promise.resolve();
  let inFlight: Promise<NativeSession> | undefined;
  const read = () => loaded ??= Promise.resolve(options.storage.get());
  function persist(session: NativeSession | null) {
    loaded = Promise.resolve(session);
    const write = writes.then(() => session ? options.storage.set(session) : options.storage.clear());
    writes = write.catch(() => {});
    return write;
  }
  async function clear(expected: number) {
    if (epoch === expected) {
      epoch++;
      await persist(null);
    }
  }
  async function bootstrap(path: string, body: unknown) {
    const response = await transport(new Request(new URL(path, base), {
      method: 'POST', credentials: 'omit',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    if (!response.ok) throw new Error(`Native session request failed (${response.status})`);
    return response;
  }
  function refresh() {
    if (inFlight) return inFlight;
    const expected = epoch;
    const run = async () => {
      try {
        const session = await read();
        if (!session) throw new Error('No native session');
        const response = await bootstrap('/api/auth/native/refresh', { refreshToken: session.refreshToken });
        const next = nativeSessionResponseSchema.parse(await response.json()).data;
        if (epoch !== expected) throw new Error('Native session changed during refresh');
        await persist(next);
        return next;
      } catch (error) {
        // An uncertain rotation response cannot safely retry the old refresh token.
        await clear(expected);
        throw error;
      }
    };
    const pending = Promise.resolve().then(run).finally(() => {
      if (inFlight === pending) inFlight = undefined;
    });
    inFlight = pending;
    return pending;
  }
  async function login(credentials: LoginRequest) {
    const expected = ++epoch;
    inFlight = undefined;
    await persist(null);
    const response = await bootstrap('/api/auth/native/login', credentials);
    const session = nativeSessionResponseSchema.parse(await response.json()).data;
    if (epoch !== expected) throw new Error('Native session changed during login');
    await persist(session);
    return session;
  }
  async function logout() {
    const session = await read();
    epoch++;
    inFlight = undefined;
    await persist(null);
    if (session) await bootstrap('/api/auth/native/logout', { refreshToken: session.refreshToken });
  }
  const sessionFetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== base.origin) throw new Error('Native session cannot send credentials to another origin');
    const bootstrapRequest = bootstrapPaths.has(url.pathname);
    const expected = epoch;
    const session = bootstrapRequest ? null : await read();
    const send = (accessToken?: string) => {
      const headers = new Headers(request.headers);
      headers.delete('authorization');
      headers.delete('cookie');
      headers.delete('x-csrf-token');
      if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
      return transport(new Request(request.clone(), { headers, credentials: 'omit' }));
    };
    const response = await send(session?.accessToken);
    if (response.status !== 401 || bootstrapRequest || !session || epoch !== expected) return response;
    try {
      const error: unknown = await response.clone().json();
      if (typeof error === 'object' && error !== null && 'data' in error
        && typeof error.data === 'object' && error.data !== null && 'code' in error.data
        && error.data.code === 'AUTH_LOGIN_INVALID_CREDENTIALS') return response;
    } catch { /* Unstructured 401s still use normal session recovery. */ }
    let next: NativeSession;
    try {
      const current = await read();
      // A late 401 for A must use already-rotated B instead of rotating B again.
      next = current && current.accessToken !== session.accessToken ? current : await refresh();
    } catch {
      return response;
    }
    if (epoch !== expected) return response;
    const retry = await send(next.accessToken);
    if (retry.status === 401) await clear(expected);
    return retry;
  };
  return { fetch: sessionFetch, login, refresh, logout };
}
