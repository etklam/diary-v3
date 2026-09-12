import { useSyncExternalStore } from 'react';
import { createWebSession } from '@diary/api-client';
import { clearPrivateServiceWorkerCache } from './pwa-client';
import { safeCaptureReturnPath } from './capture-context';
import { serializedIdSchema } from '@diary/contracts';

type SessionState = { authenticated: boolean | null; revision: number };
const initial: SessionState = { authenticated: null, revision: 0 };
let state = initial;
let locallySignedOut = false;
// Set by an explicit sign-out here or in another tab. Device-local drafts must
// not be rewritten after it; a 401 expiry never sets it, so the debounced
// unmount flush still preserves the writing for re-login.
let explicitSignOut = false;
export function wasExplicitSignOut() { return explicitSignOut; }
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
let listening = false;
const eventKey = 'diary-logout-event';
function publish(next: SessionState) { state = next; for (const listener of listeners) listener(); }

export function csrfToken() {
  return typeof document === 'undefined' ? null : document.cookie.split('; ').find(value => value.startsWith('csrf-token='))?.slice(11) ?? null;
}

export function safeReturnPath(candidate: string | null): string {
  const capturePath = safeCaptureReturnPath(candidate);
  if (capturePath) return capturePath;
  // Partner comparison returns keep the allowlisted selection and limit only.
  if (candidate && /^\/partners\/compare\?partnerId=[1-9]\d{0,18}$/.test(candidate)) return candidate;
  if (candidate && /^\/partners\/compare\?partnerId=[1-9]\d{0,18}&limit=(?:20|40|60)$/.test(candidate)) return candidate;
  if (candidate && /^\/partners\/compare\?limit=(?:20|40|60)&partnerId=[1-9]\d{0,18}$/.test(candidate)) return candidate;
  if (candidate && /^\/partners\/compare\?limit=(?:20|40|60)$/.test(candidate)) return candidate;
  if (candidate && /^\/discipline\?import=[A-Za-z0-9%+/=]+$/.test(candidate)) return candidate;
  if (candidate && /^\/trade-plans(?:\/(?:new|[1-9]\d*))?$/.test(candidate)) return candidate;
  const adminPostEdit = candidate?.match(/^\/admin\/blog\/([^/]+)\/edit$/);
  if (adminPostEdit && serializedIdSchema.safeParse(adminPostEdit[1]).success) return candidate!;
  if (candidate && /^\/stocks\/[A-Za-z0-9.]{1,32}(?:\/thesis)?$/.test(candidate)) return candidate;
  // Only known private routes are return destinations; no URL normalization can create an external redirect.
  if (candidate === '/etf/watchlist' || candidate === '/stocks/watchlist' || candidate === '/strategy-performance' || candidate === '/tools/position-sizing' || candidate === '/partners/compare' || candidate === '/partners' || candidate === '/discipline' || candidate === '/alerts' || candidate === '/reviews' || candidate === '/timeline' || candidate === '/calendar' || candidate === '/diaries' || candidate === '/stocks' || candidate === '/admin/etf' || candidate === '/admin/users' || candidate === '/admin/blog' || candidate === '/admin/blog/new' || candidate === '/settings/api-keys' || candidate === '/settings/security' || candidate === '/settings') return candidate;
  if (candidate === '/tools' || candidate === '/tools/etf' || candidate === '/tools/financial-freedom' || candidate === '/tools/market-rotation' || candidate === '/tools/relative-value' || candidate === '/tools/seasonality' || candidate === '/tools/sec-filings') return candidate;
  if (candidate && /^\/tools\/sec-filings\/\d{1,10}\/\d{10}-\d{2}-\d{6}$/.test(candidate)) return candidate;
  return candidate && /^\/diaries\/(?:new|quick|[1-9]\d*(?:\/(?:edit|review))?)$/.test(candidate) ? candidate : '/diaries/new';
}
export function signInPath(path: string) { return `/login?returnTo=${encodeURIComponent(safeReturnPath(path))}`; }

// `broadcast` marks an explicit sign-out from this tab: private drafts are
// cleared and the logout event reaches the other tabs. The cross-tab receivers
// pass `clearDrafts` instead — the same draft clearing without re-broadcasting
// (two tabs would echo the logout forever). A 401 expiry passes neither and
// keeps the drafts so the writing survives re-login.
export function clearPrivateSession(broadcast = false, clearDrafts = false) {
  webSession.invalidate();
  clearPrivateServiceWorkerCache();
  if(typeof localStorage!=='undefined'){try{for(const key of Object.keys(localStorage)){if((broadcast||clearDrafts)&&(key.startsWith('diary-quick-draft:')||key.startsWith('diary-quick-reminder:')))localStorage.removeItem(key);
   if((broadcast||clearDrafts)&&(key.startsWith('diary-editor-draft:')||key.startsWith('post-editor-draft:')||key.startsWith('review-draft:')||key.startsWith('diary-capture-return:')))localStorage.removeItem(key);}}catch{/* Private in-memory state is still cleared. */}}
  if((broadcast||clearDrafts)&&typeof sessionStorage!=='undefined'){try{for(const key of Object.keys(sessionStorage))if(key.startsWith('diary-capture-return:'))sessionStorage.removeItem(key);}catch{/* Ignore. */}}
  if (broadcast) explicitSignOut = true;
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
    channel.onmessage = event => { if (event.data?.type === 'logout') { explicitSignOut = true; clearPrivateSession(false, true); } };
  }
  window.addEventListener('storage', event => { if (event.key === eventKey && event.newValue) { explicitSignOut = true; clearPrivateSession(false, true); } });
}
function subscribe(listener: () => void) { startListening(); listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useSessionState() { return useSyncExternalStore(subscribe, () => state, () => initial); }
export function markSignedIn() { locallySignedOut=false; explicitSignOut=false; publish({ ...state, authenticated: true }); }

// The shared client owns refresh, retry and single-flight; this module owns browser UI invalidation only.
export const webSession = createWebSession({ baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin });
// Local session invalidation has no server request ID; provide the recovery code only.
function invalidatedSessionResponse() { return Response.json({ data: { code: 'AUTH_UNAUTHORIZED' } }, { status: 401 }); }
export const sessionFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const pathname = new URL(url, 'http://local.invalid').pathname;
  // A remounted private surface must not refill from cookies while logout is in flight.
  const privatePath = pathname.startsWith('/api/etf/watchlist') || pathname.startsWith('/api/alerts') || pathname === '/api/auth/me' || pathname === '/api/portfolio/attention'
    || pathname.startsWith('/api/blog/admin')
    || /^\/api\/(?:diaries|discipline|partners|api-keys|admin|trade-plans|user|stats|reviews)(?:\/|$)/.test(pathname)
    || /^\/api\/stocks\/(?:holdings|portfolio|exposure|attention|prices|watchlist|timeline|alerts)(?:\/|$)/.test(pathname);
  if (locallySignedOut && (privatePath || /^\/api\/stocks\/[^/]+\/(?:timeline|evidence|notes|thesis|hub)(?:\/|$)/.test(pathname))) return invalidatedSessionResponse();
  const revision = state.revision;
  const response = await webSession.fetch(input, init);
  if (revision !== state.revision && (privatePath || pathname === '/api/auth/me')) return invalidatedSessionResponse();
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
