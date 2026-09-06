import { ForegroundReminders } from './foreground-reminders';
import { useEffect, useRef, useState } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, Link, NavLink, useLocation, useNavigate, useRouteError, isRouteErrorResponse } from 'react-router';
import { clearPrivateSession, signInPath, useSessionState } from './session';
import { api, UiProvider, useUi } from './ui';
import './styles.css';
import './public.css';
import { QuickEntry } from './quick-entry';
import { MobileMenu, NavigationLinks } from './nav';
import { PwaStatus } from './pwa';

export function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-TW" suppressHydrationWarning><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><meta name="theme-color" content="#f6f7f8" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><script dangerouslySetInnerHTML={{__html: `try{var t=localStorage.getItem('diary-theme');if(t==='dark'||t==='light'||t==='system')document.documentElement.dataset.theme=t}catch{}`}} /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

function PreferencesControls({ mobile = false }: { mobile?: boolean }) {
  const { t, locale, setLocale, theme, setTheme, ready, localeReady, localeError, retryLocale } = useUi();
  return <div className="preferences">
    <label>{t('language')}<select disabled={!ready||!localeReady} data-testid={mobile ? 'mobile-locale-select' : 'locale-select'} value={locale} onChange={e => setLocale(e.target.value as 'zh-TW' | 'zh-CN' | 'en')}><option value="zh-TW">繁體中文</option><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
    {localeError&&<div role="alert"><p>{locale==='en'?'Unable to load or save your language preference.':locale==='zh-CN'?'无法读取或保存语言偏好。':'無法讀取或儲存語言偏好。'}</p><button type="button" className="secondary" onClick={retryLocale}>{t('retry')}</button></div>}
    <label>{t('theme')}<select disabled={!ready} data-testid={mobile ? 'mobile-theme-select' : 'theme-select'} value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}><option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option></select></label>
  </div>;
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSessionState();
  const sessionRevision = useRef(session.revision);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [role, setRole] = useState<'USER' | 'ADMIN' | null>(null);
  useEffect(() => {
    let active = true;
    void api.GET('/api/auth/me').then(result => {
      if (active) setRole(result.response.ok && result.data ? result.data.data.role : null);
    }).catch(() => { if (active) setRole(null); });
    return () => { active = false; };
  }, [session.revision]);
  useEffect(() => { if(session.revision!==sessionRevision.current){sessionRevision.current=session.revision; if(location.pathname.startsWith('/diaries/')) navigate(signInPath(location.pathname),{replace:true});} },[session.revision,location.pathname,navigate]);
  async function logout() {
    setLogoutPending(true); setLogoutError(false);
    clearPrivateSession(true);
    setRole(null);
    try { const result=await api.POST('/api/auth/logout'); if(!result.response.ok) setLogoutError(true); }
    catch { setLogoutError(true); }
    finally { setLogoutPending(false); }
  }
  const previousPath = useRef(location.pathname);
  useEffect(() => { if(previousPath.current!==location.pathname){document.getElementById('main')?.focus();previousPath.current=location.pathname;} },[location.pathname]);
  const { t, locale } = useUi();
  const preferences = <PreferencesControls/>;
  const mobilePreferences = <PreferencesControls mobile/>;
  const publicPath = location.pathname === '/' || location.pathname === '/about' || location.pathname === '/guide' || location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/articles' || location.pathname.startsWith('/articles/') || location.pathname === '/blog' || location.pathname.startsWith('/blog/');
  if (publicPath && session.authenticated !== true) return <>
    <a className="skip" href="#main">{t('skip')}</a>
    <div className="public-shell">
      <header className="public-header">
        <Link className="brand" to="/">diary-v3<span>{t('workspace')}</span></Link>
        <nav aria-label={t('navigation')}>
          <NavLink to="/" end>{t('home')}</NavLink>
          <NavLink to="/guide">{locale==='en'?'Guide':locale==='zh-CN'?'使用说明':'使用說明'}</NavLink>
          <NavLink to="/about">{locale==='en'?'About':locale==='zh-CN'?'关于':'關於'}</NavLink>
          <NavLink to="/articles">{locale==='en'?'Articles':'文章'}</NavLink>
        </nav>
        <div className="public-actions"><Link className="button secondary" to="/login">{t('login')}</Link><Link className="button" to="/register">{t('register')}</Link></div>
        <div className="public-preferences">{preferences}</div>
      </header>
      <main id="main" tabIndex={-1}><PwaStatus/><Outlet key={session.revision} /></main>
    </div>
  </>;
  return <>
    <a className="skip" href="#main">{t('skip')}</a>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="desktop-shell-header"><Link className="brand" to="/">diary-v3<span>{t('workspace')}</span></Link></div>
        <div className="desktop-quick-entry"><QuickEntry/></div>
        <nav className="desktop-nav" aria-label={t('navigation')}><NavigationLinks role={role}/></nav>
        <div className="desktop-preferences">
          {(session.authenticated||logoutError||logoutPending)&&<><button type="button" className="secondary" data-testid="sign-out" disabled={logoutPending} onClick={()=>void logout()}>{t(logoutPending?'pending':'logout')}</button>{logoutError&&<p className="error" role="alert">{t('logoutFailed')}</p>}</>}
          {preferences}
        </div>
        <MobileMenu role={role} authenticated={session.authenticated} preferences={mobilePreferences} onLogout={() => void logout()} logoutPending={logoutPending} logoutError={logoutError}/>
      </aside>
      <main id="main" tabIndex={-1}><ForegroundReminders/><PwaStatus/><Outlet key={session.revision} /></main>
    </div>
  </>;
}

export default function App() { return <UiProvider><Shell /></UiProvider>; }
export function ErrorBoundary() {
  const error = useRouteError();
  return <div className="boundary"><h1>{isRouteErrorResponse(error) && error.status === 404 ? '找不到頁面 / Page not found' : '無法載入 / Unable to load'}</h1><p>請重新載入，或返回首頁。 / Reload or return home.</p><Link to="/">首頁 / Home</Link></div>;
}
