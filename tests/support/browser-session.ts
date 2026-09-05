/** Small HTTP cookie jar for server contract tests; no browser mocks. */
export class BrowserSession {
  readonly cookies = new Map<string, string>();
  constructor(readonly baseUrl: string) {}
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]!;
      const separator = pair.indexOf('=');
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === '' || /max-age=0(?:;|$)/i.test(cookie)) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    return response;
  }
  post(path: string, body: unknown, csrf = true, extraHeaders: HeadersInit = {}) {
    const headers = new Headers(extraHeaders);
    headers.set('content-type', 'application/json');
    if (csrf && this.cookies.has('csrf-token')) headers.set('x-csrf-token', this.cookies.get('csrf-token')!);
    return this.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
  }
}
