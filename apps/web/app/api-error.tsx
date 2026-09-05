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
export function FailureNotice({ failure, id = 'form-error' }: { failure: Failure | null; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const {locale} = useUi();
  const index=locale==='zh-TW'?0:locale==='zh-CN'?1:2;
  const messages:Record<string,string[]>={
    AUTH_LOGIN_INVALID_CREDENTIALS:['電郵或密碼不正確。請檢查後再登入。','邮箱或密码不正确。请检查后重新登录。','Email or password is incorrect. Check both and sign in again.'],
    AUTH_TOKEN_INVALID:['登入已失效。請重新登入。','登录已失效。请重新登录。','Your session has expired. Sign in again.'],
    AUTH_UNAUTHORIZED:['請登入後再操作。','请登录后再操作。','Sign in before continuing.'],
    AUTH_FORBIDDEN:['你沒有權限執行這項操作。請使用具備權限的帳戶，或返回可用功能。','你没有权限执行此操作。请使用具备权限的账户，或返回可用功能。','You do not have permission to do this. Use an authorized account or return to an available area.'],
    AUTH_RATE_LIMITED:['嘗試次數過多。請稍後再試。','尝试次数过多。请稍后重试。','Too many attempts. Please try again later.'],
    CSRF_FAILED:['安全驗證已失效。請重新載入後再試。','安全验证已失效。请重新加载后重试。','The security check expired. Reload and try again.'],
    DIARY_ALREADY_EXISTS:['這個日期已有日記。請選擇其他日期。','这个日期已有日记。请选择其他日期。','A diary already exists for this date. Choose another date.'],
    USER_EMAIL_EXISTS:['這個電郵已註冊。請登入或使用其他電郵。','这个邮箱已注册。请登录或使用其他邮箱。','This email is already registered. Sign in or use another email.'],
    ETF_NOT_FOUND:['找不到這個 ETF。請確認代號，或請管理員先加入共用目錄。','找不到这个 ETF。请确认代码，或请管理员先加入共用目录。','This ETF is not in the shared catalog. Check the symbol or ask an administrator to add it.'],
    ETF_ALREADY_IN_WATCHLIST:['這個 ETF 已在你的關注清單。請重新整理清單，或直接閱讀研究。','这个 ETF 已在你的关注清单。请刷新清单，或直接阅读研究。','This ETF is already on your watchlist. Refresh the list or open its research.'],
    DIARY_NOT_FOUND:['找不到這篇日記。請確認連結及登入帳戶。','找不到这篇日记。请确认链接及登录账户。','Diary not found. Check the link and signed-in account.'],
    SYS_NOT_FOUND:['找不到這個項目。請確認連結。','找不到这个项目。请确认链接。','Item not found. Check the link.'],
    SYS_VALIDATION_ERROR:['部分欄位不正確。請檢查標示的欄位後再試。','部分字段不正确。请检查标记的字段后重试。','Some fields are invalid. Check the marked fields and try again.'],
    SYS_INTERNAL_ERROR:['服務暫時無法完成操作。內容仍然保留，請重試。','服务暂时无法完成操作。内容仍然保留，请重试。','The service could not complete this action. Your entries are preserved. Try again.'],
  };
  useEffect(() => { if (failure) ref.current?.focus(); }, [failure]);
  return failure ? <div ref={ref} id={id} className="error" role="alert" tabIndex={-1} data-testid="api-error"><p>{(failure.code&&messages[failure.code]?.[index])||failure.message}</p>{failure.code && <p><code data-testid="error-code">{failure.code}</code></p>}{failure.requestId && <p>Request ID: <code data-testid="request-id">{failure.requestId}</code></p>}</div> : null;
}
export function invalidField(failure: Failure | null, field: string) {
  return failure?.fields.some(name => name === field || name.endsWith(`.${field}`)) || undefined;
}
