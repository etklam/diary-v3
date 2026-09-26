import { useEffect, useRef } from 'react';
import { useUi } from './ui';

export type Failure = { message: string; code?: string; requestId?: string; fields: string[] };
/** Render only structured diagnostics; never echo submitted values or provider bodies. */
export function apiFailure(error: unknown, fallback: string): Failure {
  const failure: Failure = { message: fallback, fields: [] };
  if (!error || typeof error !== 'object' || !('data' in error)) return failure;
  const data = error.data;
  if (!data || typeof data !== 'object') return failure;
  if ('code' in data && typeof data.code === 'string') failure.code = data.code;
  if ('requestId' in data && typeof data.requestId === 'string') failure.requestId = data.requestId;
  if ('details' in data && Array.isArray(data.details)) {
    failure.fields = data.details.flatMap(detail => detail && typeof detail.field === 'string' ? [detail.field] : []);
  }
  if (failure.code==='DIARY_ALREADY_EXISTS') failure.fields.push('date');
  if (failure.code==='USER_EMAIL_EXISTS') failure.fields.push('email');
  return failure;
}
export function FailureNotice({ failure, id = 'form-error', messageOverride }: { failure: Failure | null; id?: string; messageOverride?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const {locale} = useUi();
  const index=locale==='zh-TW'?0:locale==='zh-CN'?1:2;
  const messages:Record<string,string[]>={
    AUTH_LOGIN_INVALID_CREDENTIALS:['電郵或密碼不正確。請檢查後再登入。','邮箱或密码不正确。请检查后重新登录。','Email or password is incorrect. Check both and sign in again.'],
    AUTH_TOKEN_INVALID:['登入已失效。請重新登入。','登录已失效。请重新登录。','Your session has expired. Sign in again.'],
    AUTH_EMAIL_TOKEN_INVALID:['這個電郵連結無效或已使用。請重新申請連結。','这个邮件链接无效或已使用。请重新申请链接。','This email link is invalid or has already been used. Request a new link.'],
    AUTH_EMAIL_TOKEN_EXPIRED:['這個電郵連結已過期。請重新申請連結。','这个邮件链接已过期。请重新申请链接。','This email link has expired. Request a new link.'],
    AUTH_EMAIL_SERVICE_DISABLED:['電郵服務目前未啟用。請返回登入或聯絡管理員。','邮件服务目前未启用。请返回登录或联系管理员。','Email service is not enabled. Return to sign in or contact an administrator.'],
    AUTH_EMAIL_VERIFICATION_REQUIRED:['請先完成電郵驗證，再建立帳戶。','请先完成邮件验证，再创建账户。','Complete email verification before creating an account.'],
    AUTH_UNAUTHORIZED:['請登入後再操作。','请登录后再操作。','Sign in before continuing.'],
    AUTH_FORBIDDEN:['你沒有權限執行這項操作。請使用具備權限的帳戶，或返回可用功能。','你没有权限执行此操作。请使用具备权限的账户，或返回可用功能。','You do not have permission to do this. Use an authorized account or return to an available area.'],
    AUTH_RATE_LIMITED:['嘗試次數過多。請稍後再試。','尝试次数过多。请稍后重试。','Too many attempts. Please try again later.'],
    CSRF_FAILED:['安全驗證已失效。請重新載入後再試。','安全验证已失效。请重新加载后重试。','The security check expired. Reload and try again.'],
    DIARY_ALREADY_EXISTS:['這個日期已有日記。請選擇其他日期。','这个日期已有日记。请选择其他日期。','A diary already exists for this date. Choose another date.'],
    USER_EMAIL_EXISTS:['這個電郵已註冊。請登入或使用其他電郵。','这个邮箱已注册。请登录或使用其他邮箱。','This email is already registered. Sign in or use another email.'],
    ADMIN_EMAIL_CONFIG_CONFLICT:['設定已被另一位管理員更改。請重新載入最新設定後再試。','设置已被另一位管理员更改。请重新加载最新设置后重试。','The settings changed under another administrator. Reload the latest settings and try again.'],
    ADMIN_EMAIL_REVISION_CONFLICT:['設定已被另一位管理員更改。請重新載入最新設定後再試。','设置已被另一位管理员更改。请重新加载最新设置后重试。','The settings changed under another administrator. Reload the latest settings and try again.'],
    ADMIN_EMAIL_TEST_REQUIRED:['請先以目前已儲存設定成功寄出測試電郵，再啟用電郵。','请先使用当前已保存设置成功发送测试邮件，再启用邮件。','Send a successful test email with the saved settings before enabling mail.'],
    ADMIN_EMAIL_SETTINGS_INVALID:['SMTP 設定不完整或無效。請檢查標示欄位。','SMTP 设置不完整或无效。请检查标记的字段。','The SMTP settings are incomplete or invalid. Check the marked fields.'],
    ADMIN_EMAIL_ENCRYPTION_UNAVAILABLE:['SMTP 密碼加密不可用。請先設定有效的加密金鑰，再啟用電郵。','SMTP 密码加密不可用。请先设置有效的加密密钥，再启用邮件。','SMTP password encryption is unavailable. Configure a valid encryption key before enabling mail.'],
    SMTP_CONFIG_INVALID:['SMTP 設定無效。請檢查主機、連接埠及加密設定。','SMTP 设置无效。请检查主机、端口和加密设置。','The SMTP configuration is invalid. Check the host, port, and encryption settings.'],
    SMTP_PLAINTEXT_AUTH_FORBIDDEN:['明文 SMTP 不可使用驗證。請啟用 TLS 或 STARTTLS。','明文 SMTP 不能使用验证。请启用 TLS 或 STARTTLS。','SMTP authentication requires TLS or STARTTLS.'],
    SMTP_MESSAGE_INVALID:['測試電郵內容無效。請檢查寄件者和收件者設定。','测试邮件内容无效。请检查发件人和收件人设置。','The test email is invalid. Check the sender and recipient settings.'],
    SMTP_TLS_FAILED:['無法驗證 SMTP TLS 憑證。請檢查主機名稱和憑證。','无法验证 SMTP TLS 证书。请检查主机名和证书。','The SMTP TLS certificate could not be verified. Check the hostname and certificate.'],
    SMTP_AUTH_FAILED:['SMTP 驗證失敗。請檢查帳戶名稱和密碼。','SMTP 验证失败。请检查用户名和密码。','SMTP authentication failed. Check the username and password.'],
    SMTP_TIMEOUT:['SMTP 連線逾時。請稍後重試。','SMTP 连接超时。请稍后重试。','The SMTP connection timed out. Try again later.'],
    SMTP_TRANSIENT:['SMTP 服務暫時無法使用。請稍後重試。','SMTP 服务暂时无法使用。请稍后重试。','The SMTP service is temporarily unavailable. Try again later.'],
    SMTP_PERMANENT:['SMTP 服務拒絕了訊息。請檢查設定或聯絡郵件服務商。','SMTP 服务拒绝了消息。请检查设置或联系邮件服务商。','The SMTP service rejected the message. Check the settings or contact the mail provider.'],
    SMTP_RECIPIENT_REJECTED:['SMTP 服務拒絕了收件者。請檢查收件者地址。','SMTP 服务拒绝了收件人。请检查收件人地址。','The SMTP service rejected the recipient. Check the recipient address.'],
    SMTP_UNAVAILABLE:['SMTP 服務目前無法使用。請稍後重試。','SMTP 服务目前无法使用。请稍后重试。','The SMTP service is unavailable. Try again later.'],
    SMTP_ENCRYPTION_UNAVAILABLE:['SMTP 密碼加密目前無法使用。請聯絡管理員。','SMTP 密码加密目前无法使用。请联系管理员。','SMTP password encryption is unavailable. Contact an administrator.'],
    SMTP_ENCRYPTED_DATA_UNAVAILABLE:['已儲存的 SMTP 密碼無法使用。請重新設定密碼。','已保存的 SMTP 密码无法使用。请重新设置密码。','The saved SMTP password is unavailable. Set the password again.'],
    ETF_NOT_FOUND:['找不到這個 ETF。請確認代號，或請管理員先加入共用目錄。','找不到这个 ETF。请确认代码，或请管理员先加入共用目录。','This ETF is not in the shared catalog. Check the symbol or ask an administrator to add it.'],
    ETF_ALREADY_IN_WATCHLIST:['這個 ETF 已在你的關注清單。請重新整理清單，或直接閱讀研究。','这个 ETF 已在你的关注清单。请刷新清单，或直接阅读研究。','This ETF is already on your watchlist. Refresh the list or open its research.'],
    DIARY_NOT_FOUND:['找不到這篇日記。請確認連結及登入帳戶。','找不到这篇日记。请确认链接及登录账户。','Diary not found. Check the link and signed-in account.'],
    ACHIEVEMENT_NOT_FOUND:['找不到這項成就。請重新整理後再試。','找不到这项成就。请刷新后重试。','Achievement not found. Refresh and try again.'],
    SYS_NOT_FOUND:['找不到這個項目。請確認連結。','找不到这个项目。请确认链接。','Item not found. Check the link.'],
    SYS_VALIDATION_ERROR:['部分欄位不正確。請檢查標示的欄位後再試。','部分字段不正确。请检查标记的字段后重试。','Some fields are invalid. Check the marked fields and try again.'],
    SYS_INTERNAL_ERROR:['服務暫時無法完成操作。內容仍然保留，請重試。','服务暂时无法完成操作。内容仍然保留，请重试。','The service could not complete this action. Your entries are preserved. Try again.'],
  };
  useEffect(() => { if (failure) ref.current?.focus(); }, [failure]);
  return failure ? <div ref={ref} id={id} className="error" role="alert" tabIndex={-1} data-testid="api-error"><p>{messageOverride ?? ((failure.code&&messages[failure.code]?.[index])||failure.message)}</p>{failure.code && <p><code data-testid="error-code">{failure.code}</code></p>}{failure.requestId && <p>Request ID: <code data-testid="request-id">{failure.requestId}</code></p>}</div> : null;
}
export function invalidField(failure: Failure | null, field: string) {
  return failure?.fields.some(name => name === field || name.endsWith(`.${field}`)) || undefined;
}
