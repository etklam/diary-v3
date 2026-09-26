import { describe, expect, it } from 'vitest'
import { isPublicSmtpIpv4, normalizeSmtpHostname, resolveSmtpHost } from '../../apps/api/src/account-email/smtp-host.js'

describe('SMTP host safety', () => {
  it('rejects non-public IPv4 destinations', () => {
    for (const address of ['127.0.0.1', '10.2.3.4', '172.16.0.1', '192.168.1.2', '169.254.169.254', '100.64.0.1', '224.0.0.1']) {
      expect(isPublicSmtpIpv4(address)).toBe(false)
    }
    expect(isPublicSmtpIpv4('8.8.8.8')).toBe(true)
  })

  it('rejects URL syntax and pins a validated DNS result for TLS SNI', async () => {
    expect(() => normalizeSmtpHostname('https://mail.example.com')).toThrow('ADMIN_EMAIL_SETTINGS_INVALID')
    await expect(resolveSmtpHost('mail.example.com', 587, { lookup: async () => ['127.0.0.1'] })).rejects.toThrow('ADMIN_EMAIL_SETTINGS_INVALID')
    await expect(resolveSmtpHost('relay.internal', 2525, {
      lookup: async () => ['10.0.0.3'], allowedPrivateHosts: 'relay.internal:2525',
    })).resolves.toEqual({ host: '10.0.0.3', tlsServername: 'relay.internal' })
  })
})
