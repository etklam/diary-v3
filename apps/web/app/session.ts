import { useSyncExternalStore } from 'react';
import { createWebSession } from '@diary/api-client';

type SessionState = { authenticated: boolean | null; revision: number };
const initial: SessionState = { authenticated: null, revision: 0 };
let state = initial;
let locallySignedOut = false;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
let listening = false;
const eventKey = 'diary-logout-event';
function publish(next: SessionState) { state = next; for (const listener of listeners) listener(); }

export function csrfToken() {
  return typeof document === 'undefined' ? null : document.cookie.split('; ').find(value => value.startsWith('csrf-token='))?.slice(11) ?? null;
}

export function safeReturnPath(candidate: string | null): string {
  if (candidate && /^\/partners\/compare\?partnerId=[1-9]\d{0,18}$/.test(candidate)) return candidate;
  if (candidate && /^\/discipline\?import=[A-Za-z0-9%+/=]+$/.test(candidate)) return candidate;
  if (candidate && /^\/trade-plans(?:\/(?:new|[1-9]\d*))?$/.test(candidate)) return candidate;
  if (candidate && /^\/stocks\/[A-Za-z0-9.]{1,32}(?:\/thesis)?$/.test(candidate)) return candidate;
  // Only known private routes are return destinations; no URL normalization can create an external redirect.
  if (candidate === '/etf/watchlist' || candidate === '/stocks/watchlist' || candidate === '/strategy-performance' || candidate === '/partners/compare' || candidate === '/partners' || candidate === '/discipline' || candidate === '/alerts' || candidate === '/reviews' || candidate === '/timeline' || candidate === '/calendar' || candidate === '/diaries' || candidate === '/stocks' || candidate === '/admin/etf' || candidate === '/settings/api-keys' || candidate === '/settings/security' || candidate === '/settings') return candidate;
  return candidate && /^\/diaries\/(?:new|quick|[1-9]\d*(?:\/(?:edit|review))?)$/.test(candidate) ? candidate : '/diaries/new';
}
export function signInPath(path: string) { return `/login?returnTo=${encodeURIComponent(safeReturnPath(path))}`; }

export function clearPrivateSession(broadcast = false) {
  webSession.invalidate();
  if(typeof localStorage!=='undefined'){try{for(const key of Object.keys(localStorage)){if(key.startsWith('diary-quick-draft:')||key.startsWith('diary-quick-reminder:'))localStorage.removeItem(key);}}catch{/* Private in-memory state is still cleared. */}}
  locallySignedOut = true;
  publish({ authenticated: false, revision: state.revision + 1 });
  if (broadcast && typeof window !== 'undefined') {
    const event = { type: 'logout', nonce: `${Date.now()}-${Math.random()}` };
    if (channel) channel.postMessage(event);
    else { try { localStorage.setItem(eventKey, JSON.stringify(event)); } catch { /* Storage may be disabled. */ } }
  }
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('diary-web-session');
    channel.onmessage = event => { if (event.data?.type === 'logout') clearPrivateSession(); };
  }
  window.addEventListener('storage', event => { if (event.key === eventKey && event.newValue) clearPrivateSession(); });
}
function subscribe(listener: () => void) { startListening(); listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useSessionState() { return useSyncExternalStore(subscribe, () => state, () => initial); }
export function markSignedIn() { locallySignedOut=false; publish({ ...state, authenticated: true }); }

// The shared client owns refresh, retry and single-flight; this module owns browser UI invalidation only.
export const webSession = createWebSession({ baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin });
// Local session invalidation has no server request ID; provide the recovery code only.
function invalidatedSessionResponse() { return Response.json({ data: { code: 'AUTH_UNAUTHORIZED' } }, { status: 401 }); }
export const sessionFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const pathname = new URL(url, 'http://local.invalid').pathname;
  // A remounted private surface must not refill from cookies while logout is in flight.
  const privatePath = pathname.startsWith('/api/etf/watchlist') || pathname.startsWith('/api/alerts') || pathname === '/api/auth/me' || pathname === '/api/portfolio/attention'
    || /^\/api\/(?:diaries|discipline|partners|api-keys|admin|trade-plans|user|stats|reviews)(?:\/|$)/.test(pathname)
    || /^\/api\/stocks\/(?:holdings|portfolio|exposure|attention|prices|watchlist|timeline|alerts)(?:\/|$)/.test(pathname);
  if (locallySignedOut && (privatePath || /^\/api\/stocks\/[^/]+\/(?:timeline|evidence|notes|thesis|hub)(?:\/|$)/.test(pathname))) return invalidatedSessionResponse();
  const revision = state.revision;
  const response = await webSession.fetch(input, init);
  if (revision !== state.revision) return invalidatedSessionResponse();
  if (pathname.startsWith('/api/alerts') || pathname === '/api/auth/me' || pathname === '/api/portfolio/attention') {
    if (response.ok) markSignedIn();
    else if (response.status === 401 && state.authenticated !== false) {
      if (state.authenticated) clearPrivateSession();
      else publish({ ...state, authenticated: false });
    }
  }
  if(response.status===401&&!pathname.startsWith('/api/auth/')&&state.authenticated) {
    const error = await response.clone().json().catch(() => null);
    // A wrong current password is a form error, not a revoked browser session.
    if(error?.data?.code !== 'AUTH_LOGIN_INVALID_CREDENTIALS') clearPrivateSession();
  }
  return response;
};
