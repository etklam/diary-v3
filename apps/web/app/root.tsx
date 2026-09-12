import { ForegroundReminders } from './foreground-reminders';
import { useEffect, useRef, useState } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, Link, useLocation, useNavigate, useRouteError, isRouteErrorResponse } from 'react-router';
import { clearPrivateSession, signInPath, useSessionState } from './session';
import { api, UiProvider, useUi } from './ui';
import { BrandMark } from './icons';
import './styles.css';
import './public.css';
import { QuickEntry } from './quick-entry';
import { MobileMenu, NavigationLinks, PublicMenu, PublicNavLinks } from './nav';
import { PwaStatus } from './pwa';

export function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-TW" suppressHydrationWarning><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><meta name="theme-color" content="#f6f7f8" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><script dangerouslySetInnerHTML={{__html: `try{var t=localStorage.getItem('diary-theme');if(t==='dark'||t==='light'||t==='system')document.documentElement.dataset.theme=t}catch{}`}} /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

function PreferencesControls({ mobile = false, compact = false }: { mobile?: boolean; compact?: boolean }) {
  const { t, locale, setLocale, theme, setTheme, ready, localeReady, localeError, retryLocale } = useUi();
  return <div className={compact ? 'preferences preferences-compact' : 'preferences'}>
    <label>{!compact && t('language')}<select aria-label={compact ? t('language') : undefined} disabled={!ready||!localeReady} data-testid={mobile ? 'mobile-locale-select' : 'locale-select'} value={locale} onChange={e => setLocale(e.target.value as 'zh-TW' | 'zh-CN' | 'en')}><option value="zh-TW">繁體中文</option><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
    {localeError&&<div role="alert"><p>{locale==='en'?'Unable to load or save your language preference.':locale==='zh-CN'?'无法读取或保存语言偏好。':'無法讀取或儲存語言偏好。'}</p><button type="button" className="secondary" onClick={retryLocale}>{t('retry')}</button></div>}
    <label>{!compact && t('theme')}<select aria-label={compact ? t('theme') : undefined} disabled={!ready} data-testid={mobile ? 'mobile-theme-select' : 'theme-select'} value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}><option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option></select></label>
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
  const sessionRevision = useRef(session.revision);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [viewer, setViewer] = useState<{ id: string; role: 'USER' | 'ADMIN' } | null>(null);
  useEffect(() => {
    if (session.authenticated === false) { setViewer(null); return; }
    let active = true;
    void api.GET('/api/auth/me').then(result => {
      if (active) setViewer(result.response.ok && result.data ? { id: result.data.data.id, role: result.data.data.role } : null);
    }).catch(() => { if (active) setViewer(null); });
    return () => { active = false; };
  }, [session.authenticated, session.revision, location.pathname]);
  useEffect(() => { if(session.revision!==sessionRevision.current){sessionRevision.current=session.revision; if(location.pathname.startsWith('/diaries/')) navigate(signInPath(`${location.pathname}${location.search}`),{replace:true});} },[session.revision,location.pathname,location.search,navigate]);
  async function logout() {
    setLogoutPending(true); setLogoutError(false);
    clearPrivateSession(true);
    setViewer(null);
    try { const result=await api.POST('/api/auth/logout'); if(!result.response.ok) setLogoutError(true); }
    catch { setLogoutError(true); }
    finally { setLogoutPending(false); }
  }
  const previousPath = useRef(location.pathname);
  useEffect(() => { if(previousPath.current!==location.pathname){document.getElementById('main')?.focus();previousPath.current=location.pathname;} },[location.pathname]);
  const { t, locale } = useUi();
  const publicSession = publicSessionCopy[locale];
  const preferences = <PreferencesControls/>;
  const compactPreferences = <PreferencesControls compact/>;
  const mobilePreferences = <PreferencesControls mobile/>;
  const role = viewer?.role ?? null;
  const publicContentPath = location.pathname === '/about' || location.pathname === '/guide' || location.pathname === '/articles' || location.pathname.startsWith('/articles/') || location.pathname === '/blog' || location.pathname.startsWith('/blog/');
  const guestPublicPath = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/tools' || location.pathname.startsWith('/tools/');
  if (publicContentPath || (guestPublicPath && session.authenticated !== true)) return <>
    <a className="skip" href="#main">{t('skip')}</a>
    <div className="public-shell">
      <header className="public-header">
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
      <main id="main" tabIndex={-1}><PwaStatus/><Outlet context={{ authenticated: session.authenticated, viewer }} key={session.revision} /></main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-brand"><BrandMark size={24} /><span className="brand-name"><strong>Trade</strong> basic</span></div>
          <nav aria-label={t('navigation')}>
            <PublicNavLinks disclosure={false} />
            {session.authenticated === true ? <Link to="/">{publicSession.workspace}</Link> : <Link to="/login">{t('login')}</Link>}
          </nav>
        </div>
      </footer>
    </div>
  </>;
  return <>
    <a className="skip" href="#main">{t('skip')}</a>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="desktop-shell-header"><Link className="brand" to="/"><BrandMark /><div><span className="brand-name"><strong>Trade</strong> basic</span><span className="brand-sub">{t('workspace')}</span></div></Link></div>
        <div className="desktop-quick-entry"><QuickEntry/></div>
        <nav className="desktop-nav" aria-label={t('navigation')}><NavigationLinks role={role}/></nav>
        <div className="desktop-preferences">
          {(session.authenticated||logoutError||logoutPending)&&<><button type="button" className="secondary" data-testid="sign-out" disabled={logoutPending} onClick={()=>void logout()}>{t(logoutPending?'pending':'logout')}</button>{logoutError&&<p className="error" role="alert">{t('logoutFailed')}</p>}</>}
          {preferences}
        </div>
        <MobileMenu role={role} authenticated={session.authenticated} preferences={mobilePreferences} onLogout={() => void logout()} logoutPending={logoutPending} logoutError={logoutError}/>
      </aside>
      <main id="main" tabIndex={-1}><ForegroundReminders/><PwaStatus/><Outlet context={{ authenticated: session.authenticated, viewer }} key={session.revision} /></main>
    </div>
  </>;
}

export type ShellOutletContext = { authenticated: boolean | null; viewer: { id: string; role: 'USER' | 'ADMIN' } | null };

export default function App() { return <UiProvider><Shell /></UiProvider>; }
export function ErrorBoundary() {
  const error = useRouteError();
  return <div className="boundary"><h1>{isRouteErrorResponse(error) && error.status === 404 ? '找不到頁面 / Page not found' : '無法載入 / Unable to load'}</h1><p>請重新載入，或返回首頁。 / Reload or return home.</p><Link to="/">首頁 / Home</Link></div>;
}
