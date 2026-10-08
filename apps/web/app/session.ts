import { useSyncExternalStore } from 'react';
import { createAccountResource } from './account-resource';
import { createWebSession } from '@diary/api-client';
import { clearPrivateServiceWorkerCache } from './pwa-client';
import { safeAuthReturnPath } from './return-paths';
// Return-destination rules live in their own module; re-exported so existing
// callers keep importing them from the session surface.
export { safeAuthReturnPath, safeReturnPath } from './return-paths';

/**
 * `revision` advances on every session event; caches, in-flight reads and write
 * guards key off it. `identity` advances only when the signed-in identity
 * actually changes — a sign-in over a signed-out or different session, a
 * sign-out, an expiry. Confirming the session the document already loaded under
 * is not an identity change, so the routed content keeps its own state across
 * it instead of being rebuilt.
 */
type SessionState = { authenticated: boolean | null; revision: number; identity: number };
const initial: SessionState = { authenticated: null, revision: 0, identity: 0 };
let state = initial;
let locallySignedOut = false;
// Set by an explicit sign-out here or in another tab. Device-local drafts must
// not be rewritten after it; a 401 expiry never sets it, so the debounced
// unmount flush still preserves the writing for re-login.
let explicitSignOut = false;
export function wasExplicitSignOut() { return explicitSignOut; }
export function isLocallySignedOut() { return locallySignedOut; }
export function getSessionRevision() { return state.revision; }
/**
 * The non-React read of the content identity. The shell keys the routed content
 * on it, so the rule it encodes — a confirmation is not a new identity — is
 * pinned by `tests/unit/session-identity.test.ts` through this accessor.
 */
export function getSessionIdentity() { return state.identity; }
const accountResource = createAccountResource(getSessionRevision);
export function invalidateAccountResource() { accountResource.invalidate(); }
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
let listening = false;
const eventKey = 'diary-logout-event';
const startedOnArticle = typeof window !== 'undefined' && window.location.pathname.startsWith('/articles/');
function publish(next: SessionState) { state = next; for (const listener of listeners) listener(); }

function discardArticleDocument() {
  // A full document replacement also discards the original SSR hydration
  // scripts, which Router revalidation alone cannot remove from the document.
  if (typeof window !== 'undefined' && (startedOnArticle || window.location.pathname.startsWith('/articles/'))) window.location.reload();
}

export function completeSignOut() {
  if (typeof window === 'undefined') return;
  const event = { type: 'logout-complete', nonce: `${Date.now()}-${Math.random()}` };
  if (channel) channel.postMessage(event);
  else { try { localStorage.setItem(eventKey, JSON.stringify(event)); } catch { /* Storage may be disabled. */ } }
  discardArticleDocument();
}

export function csrfToken() {
  return typeof document === 'undefined' ? null : document.cookie.split('; ').find(value => value.startsWith('csrf-token='))?.slice(11) ?? null;
}

export function signInPath(path: string) { return `/login?returnTo=${encodeURIComponent(safeAuthReturnPath(path))}`; }

export function defaultWorkspacePath(page: string | null | undefined) {
  if (page === 'diaries') return '/diaries';
  if (page === 'calendar') return '/calendar';
  return '/timeline';
}

// `broadcast` marks an explicit sign-out from this tab: private drafts are
// cleared and the logout event reaches the other tabs. The cross-tab receivers
// pass `clearDrafts` instead — the same draft clearing without re-broadcasting
// (two tabs would echo the logout forever). A 401 expiry passes neither and
// keeps the drafts so the writing survives re-login.
export function clearPrivateSession(broadcast = false, clearDrafts = false) {
  accountResource.invalidate();
  webSession.invalidate();
  clearPrivateServiceWorkerCache();
  if(typeof localStorage!=='undefined'){try{for(const key of Object.keys(localStorage)){if((broadcast||clearDrafts)&&(key.startsWith('diary-quick-draft:')||key.startsWith('diary-quick-reminder:')))localStorage.removeItem(key);
   if((broadcast||clearDrafts)&&(key.startsWith('diary-editor-draft:')||key.startsWith('post-editor-draft:')||key.startsWith('review-draft:')||key.startsWith('trade-plan-draft:')||key.startsWith('diary-capture-return:')||key.startsWith('diary-recent-tags:')))localStorage.removeItem(key);}}catch{/* Private in-memory state is still cleared. */}}
  if((broadcast||clearDrafts)&&typeof sessionStorage!=='undefined'){try{for(const key of Object.keys(sessionStorage))if(key.startsWith('diary-capture-return:')||key.startsWith('review-session:'))sessionStorage.removeItem(key);}catch{/* Ignore. */}}
  if (broadcast) explicitSignOut = true;
  locallySignedOut = true;
  // Ending a session is an identity change in every case: private content that
  // is already on screen must not survive it, confirmed or not.
  publish({ authenticated: false, revision: state.revision + 1, identity: state.identity + 1 });
  if (broadcast && typeof window !== 'undefined') {
    const event = { type: 'logout', nonce: `${Date.now()}-${Math.random()}` };
    if (channel) channel.postMessage(event);
    else { try { localStorage.setItem(eventKey, JSON.stringify(event)); } catch { /* Storage may be disabled. */ } }
  }
  if (!broadcast && !clearDrafts) discardArticleDocument();
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('diary-web-session');
    channel.onmessage = event => {
      if (event.data?.type === 'account-settings') accountResource.invalidate();
      if (event.data?.type === 'logout') { explicitSignOut = true; clearPrivateSession(false, true); }
      if (event.data?.type === 'logout-complete') discardArticleDocument();
    };
  }
  window.addEventListener('storage', event => {
    if (event.key !== eventKey || !event.newValue) return;
    try {
      if (JSON.parse(event.newValue).type === 'account-settings') accountResource.invalidate();
      else if (JSON.parse(event.newValue).type === 'logout-complete') discardArticleDocument();
      else { explicitSignOut = true; clearPrivateSession(false, true); }
    } catch { /* Ignore malformed cross-tab events. */ }
  });
}
function subscribe(listener: () => void) { startListening(); listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useSessionState() { return useSyncExternalStore(subscribe, () => state, () => initial); }
export function markSignedIn(newSession = false) {
  locallySignedOut = false;
  explicitSignOut = false;
  if (newSession) accountResource.invalidate();
  if (state.authenticated === true && !newSession) return;
  // The first confirmation of a session the page already loaded under only
  // resolves what was unknown; the reader is the same person on the same page.
  const confirmation = state.authenticated === null && !newSession;
  publish({ ...state, authenticated: true, revision: state.revision + 1, identity: confirmation ? state.identity : state.identity + 1 });
}

export const articleCacheInvalidationEvent = 'diary-article-cache-invalidated';

/** Ask mounted article routes and other tabs to discard loader data after a mutation. */
export function invalidateArticleCache() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(articleCacheInvalidationEvent));
  try { localStorage.setItem(articleCacheInvalidationEvent, String(Date.now())); } catch { /* Storage may be disabled. */ }
}

// The shared client owns refresh, retry and single-flight; this module owns browser UI invalidation only.
export const webSession = createWebSession({ baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin });
// Local session invalidation has no server request ID; provide the recovery code only.
function invalidatedSessionResponse() { return Response.json({ data: { code: 'AUTH_UNAUTHORIZED' } }, { status: 401 }); }
/**
 * Marks a background read that only decorates the chrome — today the review
 * count on the navigation badge, which every authenticated page requests.
 * Such a read still gets a 401 of its own, but it must never be the thing that
 * ends the session: the badge is not the reason the reader is on the page, and
 * a sign-out triggered from the shell would discard whatever they were doing.
 * Surfaces whose own data is unauthorized keep the normal invalidation.
 */
export const DECORATIVE_READ_HEADER = 'x-diary-decorative-read';

/** Reading the flag must never fail the request it is inspecting, so an
 * unusual header shape is treated as "not decorative". */
function isDecorativeRead(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) {
  try {
    return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      .get(DECORATIVE_READ_HEADER) === '1';
  } catch { return false; }
}

const fetchSession: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const pathname = new URL(url, 'http://local.invalid').pathname;
  const decorative = isDecorativeRead(input, init);
  // A remounted private surface must not refill from cookies while logout is in flight.
  const privatePath = pathname.startsWith('/api/etf/watchlist') || pathname.startsWith('/api/alerts') || pathname.startsWith('/api/achievements') || pathname === '/api/auth/me' || pathname.startsWith('/api/portfolio/')
    || pathname.startsWith('/api/blog/admin')
    || /^\/api\/(?:ai|diaries|v2\/diaries|discipline|partners|api-keys|admin|trade-plans|user|stats|reviews|timeline)(?:\/|$)/.test(pathname)
    || /^\/api\/stocks\/(?:holdings|portfolio|exposure|attention|prices|watchlist|timeline|alerts)(?:\/|$)/.test(pathname);
  if (locallySignedOut && (privatePath || /^\/api\/stocks\/[^/]+\/(?:timeline|evidence|notes|thesis|hub)(?:\/|$)/.test(pathname))) return invalidatedSessionResponse();
  // In-flight private reads are discarded when the identity they were issued
  // under ends — not on every session event. Confirming the session the
  // document already loaded under advances the revision without changing the
  // identity, and the first confirmation normally lands while a page's own
  // reads are still open: keying this guard on the revision rejected those
  // answers and reported a false AUTH_UNAUTHORIZED on a cold load.
  const identity = state.identity;
  const response = await webSession.fetch(input, init);
  if (identity !== state.identity && (privatePath || pathname === '/api/auth/me')) return invalidatedSessionResponse();
  if (pathname.startsWith('/api/alerts') || pathname === '/api/auth/me' || pathname === '/api/portfolio/attention') {
    if (response.ok) markSignedIn();
    else if (response.status === 401 && state.authenticated !== false) {
      if (state.authenticated) clearPrivateSession();
      else publish({ ...state, authenticated: false });
    }
  }
  if(response.status===401&&!pathname.startsWith('/api/auth/')&&state.authenticated&&!decorative) {
    const error = await response.clone().json().catch(() => null);
    // A wrong current password is a form error, not a revoked browser session.
    if(error?.data?.code !== 'AUTH_LOGIN_INVALID_CREDENTIALS') clearPrivateSession();
  }
  return response;
};


export const sessionFetch: typeof fetch = async (input, init) => {
  const pathname = new URL(input instanceof Request ? input.url : String(input), 'http://local.invalid').pathname;
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (typeof window !== 'undefined' && pathname === '/api/auth/me' && method === 'GET') {
    return accountResource.read(signal => fetchSession(input, { ...init, signal }), init?.signal ?? (input instanceof Request ? input.signal : undefined));
  }
  const settingsWrite = pathname === '/api/user/settings' && method === 'PUT'
    ? new Request(input instanceof Request ? input.clone() : new URL(String(input), typeof window === 'undefined' ? 'http://local.invalid' : window.location.origin), init).json().catch(() => null) : null;
  const response = await fetchSession(input, init);
  if (response.ok && pathname === '/api/auth/login' && method === 'POST') markSignedIn(true);
  if (response.ok && pathname === '/api/user/settings' && method === 'PUT') {
    // Locale-only changes do not invalidate the account timezone snapshot.
    const body: unknown = await settingsWrite;
    if (!body || typeof body !== 'object' || 'timezone' in body) {
      accountResource.invalidate();
      if (typeof window !== 'undefined') {
        const event = { type: 'account-settings', nonce: `${Date.now()}-${Math.random()}` };
        if (channel) channel.postMessage(event);
        else { try { localStorage.setItem(eventKey, JSON.stringify(event)); } catch { /* Device storage may be unavailable. */ } }
      }
    }
  }
  return response;
};
