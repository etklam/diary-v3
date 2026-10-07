import { ForegroundReminders } from './foreground-reminders';
import { useEffect, useRef, useState } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, Link, useLocation, useMatches, useNavigate, useRevalidator, useRouteError, isRouteErrorResponse, type MetaFunction } from 'react-router';
import { clearPrivateSession, completeSignOut, signInPath, useSessionState } from './session';
import { api, UiProvider, useUi } from './ui';
import { BrandMark, Icon } from './icons';
// Tokens first: every rule in styles.css and public.css consumes them.
import './tokens.css';
import './styles.css';
import './public.css';
import { QuickEntry } from './quick-entry';
import { MobileMenu, NavigationLinks, PublicMenu, PublicNavLinks } from './nav';
import { CommandPalette, CommandPaletteTrigger } from './command-palette';
import { DiaryNavigation } from './diary-navigation';
import { PwaStatus } from './pwa';
import { pageTitle } from './page-title';
import { isAdminPath, shellChrome } from './shell-chrome';

export const meta: MetaFunction = () => [{ title: 'Trade basic — Investment decision diary' }];

export function Layout({ children }: { children: React.ReactNode }) {
  const matches = useMatches() as Array<{ data?: unknown }>;
  const articleLocale = matches.map(match => {
    if (!match.data || typeof match.data !== 'object' || !('post' in match.data)) return null;
    const post = (match.data as { post?: unknown }).post;
    if (!post || typeof post !== 'object' || !('resolvedLocale' in post)) return null;
    const value = (post as { resolvedLocale?: unknown }).resolvedLocale;
    return value === 'zh-TW' || value === 'zh-CN' || value === 'en' ? value : null;
  }).find(Boolean) ?? 'zh-TW';
  return <html lang={articleLocale} suppressHydrationWarning><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><meta name="theme-color" content="#f9fafd" /><link rel="preload" as="font" type="font/woff2" href="/fonts/plex-sans-latin-var.woff2" crossOrigin="anonymous" /><link rel="preload" as="font" type="font/woff2" href="/fonts/plex-mono-latin-400.woff2" crossOrigin="anonymous" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" /><script dangerouslySetInnerHTML={{__html: `try{var t=localStorage.getItem('diary-theme');if(t==='dark'||t==='light'||t==='system')document.documentElement.dataset.theme=t;var m=localStorage.getItem('diary-market-color');if(m==='cn'||m==='cb')document.documentElement.dataset.marketColor=m;var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.querySelector('meta[name="theme-color"]').content=d?'#111219':'#f9fafd'}catch{}`}} /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

function PreferencesControls({ mobile = false, compact = false }: { mobile?: boolean; compact?: boolean }) {
  const { t, locale, setLocale, theme, setTheme, marketColor, setMarketColor, ready, localeReady, localeError, retryLocale } = useUi();
  return <div className={compact ? 'preferences preferences-compact' : 'preferences'}>
    <label>{!compact && t('language')}<select aria-label={compact ? t('language') : undefined} disabled={!ready||!localeReady} data-testid={mobile ? 'mobile-locale-select' : 'locale-select'} value={locale} onChange={e => setLocale(e.target.value as 'zh-TW' | 'zh-CN' | 'en')}><option value="zh-TW">繁體中文</option><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
    {localeError&&<div role="alert"><p>{locale==='en'?'Unable to load or save your language preference.':locale==='zh-CN'?'无法读取或保存语言偏好。':'無法讀取或儲存語言偏好。'}</p><button type="button" className="secondary" onClick={retryLocale}>{t('retry')}</button></div>}
    <label>{!compact && t('theme')}<select aria-label={compact ? t('theme') : undefined} disabled={!ready} data-testid={mobile ? 'mobile-theme-select' : 'theme-select'} value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}><option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option></select></label>
    <label>{!compact && t('marketColor')}<select aria-label={compact ? t('marketColor') : undefined} disabled={!ready} data-testid={mobile ? 'mobile-market-color-select' : 'market-color-select'} value={marketColor} onChange={e => setMarketColor(e.target.value as 'standard' | 'cn' | 'cb')}><option value="standard">{t('marketStandard')}</option><option value="cn">{t('marketCn')}</option><option value="cb">{t('marketCb')}</option></select></label>
  </div>;
}

const publicSessionCopy = {
  'zh-TW': { workspace: '返回工作區', manage: '管理文章' },
  'zh-CN': { workspace: '返回工作区', manage: '管理文章' },
  en: { workspace: 'Workspace', manage: 'Manage articles' },
} as const;

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSessionState();
  const revalidator = useRevalidator();
  const sessionRevision = useRef(session.revision);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [viewer, setViewer] = useState<{ id: string; role: 'USER' | 'ADMIN' } | null>(null);
  const routePath = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, '') : location.pathname;
  const wideDiaryBrowsePath = ['/diaries', '/timeline', '/calendar'].includes(routePath);
  useEffect(() => {
    if (session.authenticated === false) { setViewer(null); return; }
    let active = true;
    void api.GET('/api/auth/me').then(result => {
      if (active) setViewer(result.response.ok && result.data ? { id: result.data.data.id, role: result.data.data.role } : null);
    }).catch(() => { if (active) setViewer(null); });
    return () => { active = false; };
    // Role only changes at session boundaries; page navigations must not refetch it.
  }, [session.authenticated, session.revision]);
  useEffect(() => {
    if (session.revision === sessionRevision.current) return;
    sessionRevision.current = session.revision;
    const articlePath = location.pathname === '/articles' || location.pathname.startsWith('/articles/');
    // Loader data can contain a members-only article body. Revalidate article
    // routes when auth changes so logout cannot reuse that data. Other private
    // routes keep their existing redirect lifecycle.
    if (articlePath) revalidator.revalidate();
    if (session.authenticated === false && (location.pathname.startsWith('/diaries/') || location.pathname === '/reviews/ai-reports' || location.pathname === '/admin/ai' || location.pathname === '/admin/research' || location.pathname.startsWith('/admin/research/'))) navigate(signInPath(`${location.pathname}${location.search}`),{replace:true});
  }, [session.revision, location.pathname, location.search, navigate, revalidator]);
  async function logout() {
    setLogoutPending(true); setLogoutError(false);
    clearPrivateSession(true);
    setViewer(null);
    try { const result=await api.POST('/api/auth/logout'); if(!result.response.ok) setLogoutError(true); else completeSignOut(); }
    catch { setLogoutError(true); }
    finally {
      setLogoutPending(false);
      if (location.pathname === '/articles' || location.pathname.startsWith('/articles/')) revalidator.revalidate();
    }
  }
  const previousPath = useRef(location.pathname);
  useEffect(() => { if(previousPath.current!==location.pathname){document.getElementById('main')?.focus();previousPath.current=location.pathname;} },[location.pathname]);
  const { t, locale } = useUi();
  const loginPath = location.pathname === '/login';
  const previousAuthentication = useRef(session.authenticated);
  const signedInOnLoginRoute = useRef(false);
  useEffect(() => {
    if (!loginPath) signedInOnLoginRoute.current = false;
    else if (previousAuthentication.current === false && session.authenticated === true) signedInOnLoginRoute.current = true;
    previousAuthentication.current = session.authenticated;
  }, [loginPath, session.authenticated]);
  useEffect(() => {
    const main = document.getElementById('main');
    let frame = 0;
    let applied = '';
    const updateTitle = () => {
      frame = 0;
      const heading = main?.querySelector('h1')?.textContent;
      const next = pageTitle(location.pathname, locale, heading);
      if (next === applied) return;
      applied = next;
      document.title = next;
    };
    updateTitle();
    if (!main) return;
    // The heading can appear or change anywhere under main, so the observer
    // stays broad — but one frame-coalesced read replaces a subtree query and
    // a document write per mutation, which a long table or a live preview
    // would otherwise produce continuously.
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(updateTitle); });
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [location.pathname, locale]);
  useEffect(() => {
    if (loginPath && session.authenticated === true && !signedInOnLoginRoute.current) navigate('/', { replace: true });
  }, [loginPath, navigate, session.authenticated]);
  const publicSession = publicSessionCopy[locale];
  const preferences = <PreferencesControls/>;
  const compactPreferences = <PreferencesControls compact/>;
  const mobilePreferences = <PreferencesControls mobile/>;
  const role = viewer?.role ?? null;
  const adminPath = isAdminPath(location.pathname);
  useEffect(() => {
    if (!adminPath) return;
    if (session.authenticated === false) {
      // Same destination rule as every other sign-in link, so the value this
      // writes is the value the login form accepts.
      navigate(signInPath(`${location.pathname}${location.search}`), { replace: true });
      return;
    }
    if (session.authenticated === true && viewer?.role === 'USER') navigate('/', { replace: true });
  }, [adminPath, location.pathname, location.search, navigate, session.authenticated, viewer?.role]);
  // An administration path renders only for a confirmed ADMIN. Every other
  // case — still resolving, signed out, or a USER — waits here while the effect
  // above redirects: a USER goes home, a signed-out visitor goes to sign-in.
  // This deliberately shows no permission message. A non-admin is sent away
  // rather than told to leave, and the two cannot both be true: the previous
  // explanation was unreachable as a resting state, so it only ever flashed
  // before the redirect landed. Each admin route still reports its own
  // authorization failure for the data it owns.
  const chrome = shellChrome(location.pathname, session.authenticated, role);
  if (chrome === 'pending') return <>
    <a className="skip" href="#main">{t('skip')}</a>
    <main id="main" tabIndex={-1}><p role="status">{t('loading')}</p></main>
  </>;
  const publicChrome = chrome === 'public';
  // Both shells render from this one tree. `main` and the `Outlet` inside it
  // hold the same position in either branch, so confirming the session swaps
  // the chrome around the routed content and React reconciles the content
  // itself: a half-typed note, an open disclosure, focus and scroll all survive.
  // Only the surrounding chrome — header and footer, or sidebar, palette and
  // diary navigation — is mounted and unmounted.
  return <>
    <a className="skip" href="#main">{t('skip')}</a>
    <div className={publicChrome ? 'public-shell' : 'app-shell'}>
      {publicChrome
        ? <header className="public-header">
            <Link className="brand" to="/"><BrandMark size={34} /><span className="brand-name"><strong>Trade</strong> basic</span></Link>
            <nav className="public-nav" aria-label={t('navigation')}><PublicNavLinks /></nav>
            <div className="public-actions">
              {compactPreferences}
              {session.authenticated === true ? <>
                {role === 'ADMIN' && <Link className="public-admin-link" to="/admin/blog">{publicSession.manage}</Link>}
                <Link className="button secondary public-login" to="/">{publicSession.workspace}</Link>
              </> : <><Link className="button secondary public-login" to="/login">{t('login')}</Link><Link className="button public-register" to="/register">{t('register')}</Link></>}
              <PublicMenu preferences={mobilePreferences} authenticated={session.authenticated} role={role} />
            </div>
          </header>
        : <aside className="sidebar">
            <div className="desktop-shell-header"><Link className="brand" to="/"><BrandMark /><div><span className="brand-name"><strong>Trade</strong> basic</span><span className="brand-sub">{t('workspace')}</span></div></Link></div>
            <div className="desktop-quick-entry"><QuickEntry/></div>
            {/* Search sits above the list because the route count exceeds what any
                sidebar can hold; the list below is the always-visible subset. */}
            <div className="desktop-palette-trigger"><CommandPaletteTrigger/></div>
            <nav className="desktop-nav" aria-label={t('navigation')}><NavigationLinks role={role}/></nav>
            {/* Language, theme and market colour change about twice a year, so they
                sit behind a disclosure and stop spending ~120px of standing
                sidebar height; sign-out stays directly reachable. */}
            <div className="desktop-preferences">
              {(session.authenticated||logoutError||logoutPending)&&<><button type="button" className="secondary" data-testid="sign-out" disabled={logoutPending} onClick={()=>void logout()}>{t(logoutPending?'pending':'logout')}</button>{logoutError&&<p className="error" role="alert">{t('logoutFailed')}</p>}</>}
              <details className="desktop-preferences-disclosure">
                <summary><Icon name="chevronDown" size={16}/>{t('preferences')}</summary>
                {preferences}
              </details>
            </div>
            <MobileMenu role={role} authenticated={session.authenticated} preferences={mobilePreferences} onLogout={() => void logout()} logoutPending={logoutPending} logoutError={logoutError}/>
          </aside>}
      <main id="main" className={!publicChrome && wideDiaryBrowsePath ? 'wide-diary-main' : undefined} tabIndex={-1}>
        {!publicChrome && <ForegroundReminders/>}
        <PwaStatus/>
        <Outlet context={{ authenticated: session.authenticated, viewer }} key={session.identity} />
      </main>
      {publicChrome
        ? <footer className="public-footer">
            <div className="public-footer-inner">
              <div className="public-footer-brand"><BrandMark size={24} /><span className="brand-name"><strong>Trade</strong> basic</span></div>
              <nav aria-label={t('navigation')}>
                <PublicNavLinks disclosure={false} />
                {session.authenticated === true ? <Link to="/">{publicSession.workspace}</Link> : <Link to="/login">{t('login')}</Link>}
              </nav>
            </div>
          </footer>
        : null}
      {publicChrome ? null : <CommandPalette role={role} />}
      {publicChrome ? null : <DiaryNavigation />}
    </div>
  </>;
}

export type ShellOutletContext = { authenticated: boolean | null; viewer: { id: string; role: 'USER' | 'ADMIN' } | null };

export default function App() { return <UiProvider><Shell /></UiProvider>; }

const boundaryCopy = {
  'zh-TW': {
    missingTitle: '找不到頁面', missingBody: '這個網址沒有對應的頁面，可能已經移除或輸入有誤。',
    failedTitle: '無法載入', failedBody: '載入這個頁面時發生問題。重新載入通常可以解決；如果持續發生，請返回首頁再試。',
    reload: '重新載入', back: '返回上一頁', home: '回到首頁', status: '狀態碼',
  },
  'zh-CN': {
    missingTitle: '找不到页面', missingBody: '这个网址没有对应的页面，可能已经移除或输入有误。',
    failedTitle: '无法加载', failedBody: '加载这个页面时发生问题。重新加载通常可以解决；如果持续发生，请返回首页再试。',
    reload: '重新加载', back: '返回上一页', home: '回到首页', status: '状态码',
  },
  en: {
    missingTitle: 'Page not found', missingBody: 'No page matches this address. It may have been removed, or the address may be wrong.',
    failedTitle: 'Unable to load', failedBody: 'Something went wrong loading this page. Reloading usually resolves it; if it keeps happening, return home and try again.',
    reload: 'Reload', back: 'Go back', home: 'Home', status: 'Status',
  },
} as const;

type BoundaryLocale = keyof typeof boundaryCopy;

/**
 * The boundary replaces the root component, so it renders outside UiProvider
 * and cannot use `useUi`. The stored preference is read after mount instead:
 * server-rendered errors start in the document language and settle into the
 * reader's own language on hydration, without a mismatch.
 */
function useBoundaryLocale(): BoundaryLocale {
  const [locale, setLocale] = useState<BoundaryLocale>('zh-TW');
  useEffect(() => {
    const candidates = [
      (() => { try { return localStorage.getItem('diary-locale'); } catch { return null; } })(),
      document.documentElement.lang,
    ];
    const resolved = candidates.find((value): value is BoundaryLocale => value === 'zh-TW' || value === 'zh-CN' || value === 'en');
    if (resolved) setLocale(resolved);
  }, []);
  return locale;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const locale = useBoundaryLocale();
  const c = boundaryCopy[locale];
  const routeError = isRouteErrorResponse(error) ? error : null;
  const missing = routeError?.status === 404;
  const title = missing ? c.missingTitle : c.failedTitle;
  useEffect(() => { document.title = `${title} — Trade basic`; }, [title]);
  return <div className="boundary">
    <h1>{title}</h1>
    <p role="alert">{missing ? c.missingBody : c.failedBody}</p>
    {routeError && !missing && <p className="muted">{c.status}: {routeError.status}</p>}
    <div className="actions">
      {!missing && <button type="button" onClick={() => { window.location.reload(); }}>{c.reload}</button>}
      <button type="button" className="secondary" onClick={() => { window.history.back(); }}>{c.back}</button>
      <Link className="button secondary" to="/">{c.home}</Link>
    </div>
  </div>;
}
