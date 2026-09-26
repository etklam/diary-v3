import { describe, expect, it } from 'vitest'
import { renderAccountEmail } from '../../apps/api/src/account-email/templates.js'

describe('account email templates', () => {
  it('renders every fixed message in all supported locales as plain text and escaped HTML', () => {
    for (const locale of ['zh-TW', 'zh-CN', 'en'] as const) {
      for (const kind of ['registration_verification', 'password_reset', 'password_changed', 'admin_test'] as const) {
        const email = renderAccountEmail(kind, locale, 'https://example.test/path?x=1&y="bad"')
        expect(email.subject.length).toBeGreaterThan(0)
        if (kind === 'registration_verification' || kind === 'password_reset') {
          expect(email.text).toContain('https://example.test/path?x=1&y="bad"')
          expect(email.html).toContain('&amp;')
          expect(email.html).not.toContain('x=1&y=')
        } else {
          expect(email.text).not.toContain('https://example.test')
          expect(email.html).not.toContain('href=')
        }
      }
    }
  })
})
