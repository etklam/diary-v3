import type { EmailDeliveryKind } from '@diary/contracts/account-email'

export type AccountEmailKind = EmailDeliveryKind
export type EmailLocale = 'zh-TW' | 'zh-CN' | 'en'

const copy = {
  'zh-TW': {
    registration_verification: { subject: '驗證 Trade basic 電郵', heading: '完成帳戶申請', intro: '請驗證你的電郵地址，然後設定密碼完成申請。', action: '驗證電郵並設定密碼', expiry: '連結將於 24 小時後失效。', ignore: '如果你沒有申請帳戶，可以忽略這封郵件。' },
    password_reset: { subject: '重設 Trade basic 密碼', heading: '重設密碼', intro: '我們收到重設 Trade basic 密碼的請求。', action: '設定新密碼', expiry: '連結將於 30 分鐘後失效。', ignore: '如果不是你提出請求，可以忽略這封郵件；你的密碼不會改變。' },
    password_changed: { subject: 'Trade basic 密碼已更新', heading: '密碼已更新', intro: '你的 Trade basic 密碼剛剛完成更新。', action: '前往登入', expiry: '', ignore: '如果不是你執行的操作，請盡快聯絡系統管理員。' },
    admin_test: { subject: 'Trade basic 郵件設定測試', heading: 'SMTP 測試郵件', intro: '目前儲存的 SMTP 設定已成功寄送這封測試郵件。', action: '測試連線成功', expiry: '', ignore: '這只是管理員發起的測試，不需要採取任何操作。' },
  },
  'zh-CN': {
    registration_verification: { subject: '验证 Trade basic 邮箱', heading: '完成账户申请', intro: '请验证你的邮箱地址，然后设置密码完成申请。', action: '验证邮箱并设置密码', expiry: '链接将在 24 小时后失效。', ignore: '如果你没有申请账户，可以忽略这封邮件。' },
    password_reset: { subject: '重置 Trade basic 密码', heading: '重置密码', intro: '我们收到重置 Trade basic 密码的请求。', action: '设置新密码', expiry: '链接将在 30 分钟后失效。', ignore: '如果不是你提出请求，可以忽略这封邮件；你的密码不会改变。' },
    password_changed: { subject: 'Trade basic 密码已更新', heading: '密码已更新', intro: '你的 Trade basic 密码刚刚完成更新。', action: '前往登录', expiry: '', ignore: '如果不是你执行的操作，请尽快联系系统管理员。' },
    admin_test: { subject: 'Trade basic 邮件设置测试', heading: 'SMTP 测试邮件', intro: '当前保存的 SMTP 设置已成功发送这封测试邮件。', action: '测试连接成功', expiry: '', ignore: '这只是管理员发起的测试，不需要采取任何操作。' },
  },
  en: {
    registration_verification: { subject: 'Verify your Trade basic email', heading: 'Finish creating your account', intro: 'Verify your email address, then choose a password to finish creating your account.', action: 'Verify email and set password', expiry: 'This link expires in 24 hours.', ignore: 'If you did not request an account, you can ignore this email.' },
    password_reset: { subject: 'Reset your Trade basic password', heading: 'Reset your password', intro: 'We received a request to reset your Trade basic password.', action: 'Set a new password', expiry: 'This link expires in 30 minutes.', ignore: 'If you did not request this, you can ignore this email. Your password will not change.' },
    password_changed: { subject: 'Your Trade basic password changed', heading: 'Password changed', intro: 'Your Trade basic password was just changed.', action: 'Go to sign in', expiry: '', ignore: 'If you did not make this change, contact your system administrator promptly.' },
    admin_test: { subject: 'Trade basic mail settings test', heading: 'SMTP test email', intro: 'The currently saved SMTP configuration successfully sent this test email.', action: 'Connection test passed', expiry: '', ignore: 'This is an administrator-initiated test. No action is required.' },
  },
} as const

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function renderAccountEmail(kind: AccountEmailKind, locale: EmailLocale, link?: string) {
  const content = copy[locale][kind]
  const actionLink = kind === 'registration_verification' || kind === 'password_reset' ? link : undefined
  const safeLink = actionLink ? escapeHtml(actionLink) : undefined
  const text = [content.heading, content.intro, safeLink && `${content.action}: ${actionLink}`, content.expiry, content.ignore]
    .filter(Boolean).join('\n\n')
  const html = `<!doctype html><html lang="${locale}"><body><main><h1>${content.heading}</h1><p>${content.intro}</p>${safeLink ? `<p><a href="${safeLink}">${content.action}</a></p>` : ''}${content.expiry ? `<p>${content.expiry}</p>` : ''}<p>${content.ignore}</p><p>Trade basic</p></main></body></html>`
  return { subject: content.subject, text, html }
}
