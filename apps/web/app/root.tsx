import { useEffect, useRef, useState } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, Link, NavLink, useLocation, useNavigate, useRouteError, isRouteErrorResponse } from 'react-router';
import { clearPrivateSession, signInPath, useSessionState } from './session';
import { api, UiProvider, useUi } from './ui';
import './styles.css';
import { QuickEntry } from './quick-entry';

export function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-TW" suppressHydrationWarning><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><script dangerouslySetInnerHTML={{__html: `try{var t=localStorage.getItem('diary-theme');if(t==='dark'||t==='light'||t==='system')document.documentElement.dataset.theme=t}catch{}`}} /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSessionState();
  const sessionRevision = useRef(session.revision);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  useEffect(() => { void api.GET('/api/auth/me').catch(() => undefined); }, []);
  useEffect(() => { if(session.revision!==sessionRevision.current){sessionRevision.current=session.revision; if(location.pathname.startsWith('/diaries/')) navigate(signInPath(location.pathname),{replace:true});} },[session.revision,location.pathname,navigate]);
  async function logout() {
    setLogoutPending(true); setLogoutError(false);
    clearPrivateSession(true);
    try { const result=await api.POST('/api/auth/logout'); if(!result.response.ok) setLogoutError(true); }
    catch { setLogoutError(true); }
    finally { setLogoutPending(false); }
  }
  const previousPath = useRef(location.pathname);
  useEffect(() => { if(previousPath.current!==location.pathname){document.getElementById('main')?.focus();previousPath.current=location.pathname;} },[location.pathname]);
  const { t, locale, setLocale, theme, setTheme, ready, localeReady, localeError, retryLocale } = useUi();
  return <>
    <a className="skip" href="#main">{t('skip')}</a>
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">diary-v3<span>{t('workspace')}</span></Link>
        <QuickEntry/>
        <nav aria-label={t('navigation')}>
          <NavLink to="/" end>{t('home')}</NavLink>
          <NavLink to="/timeline">{locale==='en'?'Timeline':locale==='zh-CN'?'时间轴':'時間軸'}</NavLink>
          <NavLink to="/trade-plans">{locale==='en'?'Trade plans':locale==='zh-CN'?'交易计划':'交易計劃'}</NavLink>
          <NavLink to="/partners">{locale==='en'?'Partners':'伙伴'}</NavLink>
          <NavLink to="/alerts">{locale==='en'?'Diary reminders':locale==='zh-CN'?'日记提醒':'日記提醒'}</NavLink>
          <NavLink to="/reviews">{locale==='en'?'Review queue':locale==='zh-CN'?'复盘队列':'複盤隊列'}</NavLink>
          <NavLink to="/calendar">{locale==='en'?'Calendar':locale==='zh-CN'?'日历':'日曆'}</NavLink>
          <NavLink to="/diaries" end>{locale==='en'?'Diary library':locale==='zh-CN'?'日记库':'日記庫'}</NavLink>
          <NavLink to="/diaries/new">{t('write')}</NavLink>
          <NavLink to="/diaries/quick">{t('quick')}</NavLink>
          <NavLink to="/tools/etf">{locale==='en'?'ETF research':'ETF 研究'}</NavLink>
          <NavLink to="/tools/market-rotation">{locale==='en'?'Market rotation':locale==='zh-CN'?'市场轮动':'市場輪動'}</NavLink>
          <NavLink to="/tools/financial-freedom">{locale==='en'?'FIRE calculator':locale==='zh-CN'?'财务自由计算':'財務自由計算'}</NavLink>
          <NavLink to="/stocks" end>{locale==='en'?'Holdings':locale==='zh-CN'?'持仓':'持倉'}</NavLink>
          <NavLink to="/stocks/watchlist">{locale==='en'?'Watchlist':locale==='zh-CN'?'关注清单':'關注清單'}</NavLink>
          <Link to="/stocks/SPY" aria-current={(location.pathname.startsWith('/stocks/')&&location.pathname!=='/stocks/watchlist')?'page':undefined}>{locale==='en'?'Market research':locale==='zh-CN'?'市场研究':'市場研究'}</Link>
          <NavLink to="/settings" end>{locale==='en'?'Preferences':locale==='zh-CN'?'偏好设置':'偏好設定'}</NavLink>
          <NavLink to="/settings/security">{locale==='en'?'Account security':locale==='zh-CN'?'账户安全':'帳戶安全'}</NavLink>
        </nav>
        <div className="preferences">
          {(session.authenticated||logoutError||logoutPending)&&<><button type="button" className="secondary" data-testid="sign-out" disabled={logoutPending} onClick={()=>void logout()}>{t(logoutPending?'pending':'logout')}</button>{logoutError&&<p className="error" role="alert">{t('logoutFailed')}</p>}</>}
          <label>{t('language')}<select disabled={!ready||!localeReady} data-testid="locale-select" value={locale} onChange={e => setLocale(e.target.value as 'zh-TW' | 'zh-CN' | 'en')}><option value="zh-TW">繁體中文</option><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
          {localeError&&<div role="alert"><p>{locale==='en'?'Unable to load or save your language preference.':locale==='zh-CN'?'无法读取或保存语言偏好。':'無法讀取或儲存語言偏好。'}</p><button type="button" className="secondary" onClick={retryLocale}>{t('retry')}</button></div>}
          <label>{t('theme')}<select disabled={!ready} data-testid="theme-select" value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}><option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option></select></label>
        </div>
      </aside>
      <main id="main" tabIndex={-1}><Outlet key={session.revision} /></main>
    </div>
  </>;
}

export default function App() { return <UiProvider><Shell /></UiProvider>; }
export function ErrorBoundary() {
  const error = useRouteError();
  return <div className="boundary"><h1>{isRouteErrorResponse(error) && error.status === 404 ? '找不到頁面 / Page not found' : '無法載入 / Unable to load'}</h1><p>請重新載入，或返回首頁。 / Reload or return home.</p><Link to="/">首頁 / Home</Link></div>;
}
