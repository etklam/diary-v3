export type WebSessionOptions = {
  /** Trusted API origin, supplied by the browser boundary rather than read here. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
};

/** Request marker for writes whose 401 result must remain user-confirmed. */
export const NO_AUTOMATIC_SESSION_RETRY_HEADER = 'x-diary-no-automatic-session-retry';

const bootstrapPaths = new Set([
  '/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout',
]);

/** Cookie recovery is stable; it intentionally does not use native token rotation. */
export function createWebSession(options: WebSessionOptions) {
  const base = new URL(options.baseUrl);
  const transport = options.fetch ?? globalThis.fetch;
  let inFlight: Promise<boolean> | undefined;
  let generation = 0;
  function refresh() {
    if (inFlight) return inFlight;
    const run = async () => {
      try {
        const response = await transport(new Request(new URL('/api/auth/refresh', base), {
          method: 'POST', credentials: 'same-origin',
        }));
        if (!response.ok) return false;
        const body: unknown = await response.json();
        return typeof body === 'object' && body !== null && 'ok' in body && body.ok === true;
      } catch {
        return false;
      }
    };
    const pending = run().finally(() => {
      if (inFlight === pending) inFlight = undefined;
    });
    inFlight = pending;
    return pending;
  }
  const sessionFetch: typeof globalThis.fetch = async (input, init) => {
    const expected = generation;
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== base.origin) throw new Error('Web session cannot send credentials to another origin');
    const send = () => transport(new Request(request.clone(), { credentials: 'same-origin' }));
    const response = await send();
    const bootstrap = bootstrapPaths.has(url.pathname) || url.pathname.startsWith('/api/auth/native/');
    const explicitCredential = request.headers.has('authorization') || request.headers.has('x-api-key');
    const noAutomaticRetry = request.headers.get(NO_AUTOMATIC_SESSION_RETRY_HEADER) === '1';
    if (generation !== expected || response.status !== 401 || bootstrap || explicitCredential || noAutomaticRetry || !url.pathname.startsWith('/api/')) return response;
    // A rejected current password is an operation error, not an expired session.
    try {
      const error: unknown = await response.clone().json();
      if (typeof error === 'object' && error !== null && 'data' in error
        && typeof error.data === 'object' && error.data !== null && 'code' in error.data
        && error.data.code === 'AUTH_LOGIN_INVALID_CREDENTIALS') return response;
    } catch { /* An unstructured 401 still follows the normal session recovery policy. */ }
    const recovered = await refresh();
    return recovered && generation === expected ? send() : response;
  };
  return {
    fetch: sessionFetch,
    /** Call on account/logout transitions; UI must also discard its stale results. */
    invalidate() {
      generation++;
      inFlight = undefined;
    },
  };
}
