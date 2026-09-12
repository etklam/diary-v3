import createClient from 'openapi-fetch';
import type { paths } from './generated';

export type ClientOptions = {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  getAccessToken?: () => string | null | Promise<string | null>;
  getCsrfToken?: () => string | null;
};

/** Standard fetch transport; storage and browser cookie access belong to the caller. */
export function createApiClient(options: ClientOptions = {}) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? '',
    fetch: options.fetch,
    credentials: 'same-origin',
  });
  client.use({
    async onRequest({ request }) {
      const accessToken = await options.getAccessToken?.();
      if (accessToken) request.headers.set('Authorization', `Bearer ${accessToken}`);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const csrfToken = options.getCsrfToken?.();
        if (csrfToken) request.headers.set('x-csrf-token', csrfToken);
      }
      return request;
    },
  });
  return client;
}

export type { paths } from './generated';

export { createNativeSession } from './native-session';
export type { NativeSessionOptions, NativeSessionStorage } from './native-session';

export { createWebSession, NO_AUTOMATIC_SESSION_RETRY_HEADER } from './web-session';
export type { WebSessionOptions } from './web-session';
