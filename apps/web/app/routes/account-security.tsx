import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error';
import { clearPrivateSession, signInPath, useSessionState } from '../session';
import './account-security.css';

const copy = {
  'zh-TW': {
    title: '帳戶安全', intro: '管理密碼與已登入的裝置。', change: '修改密碼',
    hint: '新密碼至少 8 個字元，最多 72 個 UTF-8 位元組。修改後，所有裝置都需要重新登入。',
    current: '目前密碼', next: '新密碼', confirm: '確認新密碼', mismatch: '兩次新密碼不一致。請重新確認。',
    tooLong: '新密碼超過 72 個 UTF-8 位元組。請縮短後再試。',
    devices: '已登入的裝置', deviceHint: '登出所有裝置，包括目前使用的瀏覽器。之後需要重新登入。',
    logoutAll: '登出所有裝置', changed: '密碼已修改。所有裝置已登出，請使用新密碼重新登入。',
    loggedOut: '所有裝置已登出。需要時可重新登入。', loginRequired: '請先登入，再管理帳戶安全。',
    wrongCurrent: '目前密碼不正確。請檢查後再試。',
  },
  'zh-CN': {
    title: '账户安全', intro: '管理密码与已登录的设备。', change: '修改密码',
    hint: '新密码至少 8 个字符，最多 72 个 UTF-8 字节。修改后，所有设备都需要重新登录。',
    current: '当前密码', next: '新密码', confirm: '确认新密码', mismatch: '两次新密码不一致。请重新确认。',
    tooLong: '新密码超过 72 个 UTF-8 字节。请缩短后重试。',
    devices: '已登录的设备', deviceHint: '退出所有设备，包括当前使用的浏览器。之后需要重新登录。',
    logoutAll: '退出所有设备', changed: '密码已修改。所有设备已退出，请使用新密码重新登录。',
    loggedOut: '所有设备已退出。需要时可重新登录。', loginRequired: '请先登录，再管理账户安全。',
    wrongCurrent: '当前密码不正确。请检查后重试。',
  },
  en: {
    title: 'Account security', intro: 'Manage your password and signed-in devices.', change: 'Change password',
    hint: 'Use at least 8 characters and no more than 72 UTF-8 bytes. Changing your password signs out every device.',
    current: 'Current password', next: 'New password', confirm: 'Confirm new password', mismatch: 'The new passwords do not match. Check the confirmation.',
    tooLong: 'The new password exceeds 72 UTF-8 bytes. Use a shorter password.',
    devices: 'Signed-in devices', deviceHint: 'Sign out every device, including this browser. You will need to sign in again.',
    logoutAll: 'Sign out all devices', changed: 'Password changed. Every device has been signed out. Sign in with your new password.',
    loggedOut: 'Every device has been signed out. You can sign in again when you are ready.', loginRequired: 'Sign in to manage account security.',
    wrongCurrent: 'Your current password is incorrect. Check it and try again.',
  },
};

export default function AccountSecurity() {
  const { locale, t } = useUi();
  const text = copy[locale];
  const session = useSessionState();
  const location = useLocation();
  const navigate = useNavigate();
  const [auth, setAuth] = useState<'loading' | 'ready' | 'error' | 'unauthorized'>('loading');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [logoutFailure, setLogoutFailure] = useState<Failure | null>(null);
  const success = location.state?.securityAction;
  async function check() {
    setAuth('loading');
    try {
      const response = await api.GET('/api/auth/me');
      setAuth(response.response.ok ? 'ready' : response.response.status === 401 ? 'unauthorized' : 'error');
    } catch { setAuth('error'); }
  }
  useEffect(() => { if (!success) void check(); }, [success]);
  function finished(action: 'password' | 'logout-all') {
    // Location state survives the shell's private-session remount; it contains no secrets.
    navigate('/settings/security', { replace: true, state: { securityAction: action } });
    clearPrivateSession(true);
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword'));
    const newPassword = String(form.get('newPassword'));
    setFailure(null);
    if (newPassword !== form.get('confirmation')) {
      setFailure({ message: text.mismatch, fields: ['confirmation'] });
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setFailure({ message: text.tooLong, fields: ['newPassword'] });
      return;
    }
    setPending(true);
    try {
      const result = await api.PUT('/api/user/password', { body: { currentPassword, newPassword } });
      if (result.response.ok) finished('password');
      else {
        const error = apiFailure(result.error, t('failed'));
        if (error.code === 'AUTH_LOGIN_INVALID_CREDENTIALS') { error.message = text.wrongCurrent; error.fields.push('currentPassword'); }
        setFailure(error);
      }
    } catch { setFailure(apiFailure(null, t('connection'))); }
    finally { setPending(false); }
  }
  async function logoutAll() {
    setPending(true); setLogoutFailure(null);
    try {
      const result = await api.POST('/api/auth/logout-all');
      if (result.response.ok) finished('logout-all');
      else setLogoutFailure(apiFailure(result.error, t('failed')));
    } catch { setLogoutFailure(apiFailure(null, t('connection'))); }
    finally { setPending(false); }
  }
  return <section className="account-security"><h1>{text.title}</h1><p className="lede">{text.intro}</p>
    {success === 'password' || success === 'logout-all' ? <div role="status"><p>{success === 'password' ? text.changed : text.loggedOut}</p><Link className="button" to={signInPath('/settings/security')}>{t('login')}</Link></div>
      : auth === 'unauthorized' || session.authenticated === false ? <><p>{text.loginRequired}</p><Link className="button" to={signInPath('/settings/security')}>{t('login')}</Link></>
        : auth === 'loading' ? <p role="status">{t('loading')}</p>
          : auth === 'error' ? <><p role="alert">{t('connection')}</p><button onClick={() => void check()}>{t('retry')}</button></>
            : <><section className="security-section" aria-labelledby="password-title"><h2 id="password-title">{text.change}</h2><p id="password-hint" className="muted">{text.hint}</p>
              <form onSubmit={changePassword} aria-busy={pending}>
                <label>{text.current}<input name="currentPassword" type="password" autoComplete="current-password" required disabled={pending} aria-invalid={invalidField(failure, 'currentPassword')} aria-describedby={failure ? 'password-error' : undefined} /></label>
                <label>{text.next}<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} disabled={pending} aria-invalid={invalidField(failure, 'newPassword')} aria-describedby={`password-hint${failure ? ' password-error' : ''}`} /></label>
                <label>{text.confirm}<input name="confirmation" type="password" autoComplete="new-password" required disabled={pending} aria-invalid={invalidField(failure, 'confirmation')} aria-describedby={failure ? 'password-error' : undefined} /></label>
                <FailureNotice failure={failure?.code === 'AUTH_LOGIN_INVALID_CREDENTIALS' ? { ...failure, code: undefined } : failure} id="password-error" />
                {failure?.code === 'AUTH_LOGIN_INVALID_CREDENTIALS' && <p className="error"><code data-testid="error-code">{failure.code}</code></p>}
                <button type="submit" disabled={pending}>{pending ? t('pending') : text.change}</button>
              </form></section>
              <section className="security-section" aria-labelledby="devices-title"><h2 id="devices-title">{text.devices}</h2><p>{text.deviceHint}</p><FailureNotice failure={logoutFailure} id="logout-error" /><button type="button" className="secondary" disabled={pending} onClick={() => void logoutAll()}>{pending ? t('pending') : text.logoutAll}</button></section></>}
  </section>;
}
